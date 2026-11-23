import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { registerV56Routes } from "./upgrade-v56.js";
import { registerV57Routes } from "./upgrade-v57.js";
import { scoreRecord,validateAlias,containsPII,offlineAnswer } from "./lib/inquiry.js";
import { readSession,issueSession,hashSessionToken } from "./lib/auth.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/,"");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const APP_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const { Pool } = pg;
const db = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) : null;
let dbReady = false;
let dbInitPromise = null;
async function initDatabase(){
  if(!db) return false;
  if(dbReady) return true;
  if(dbInitPromise) return dbInitPromise;
  dbInitPromise = (async()=>{
    const statements = [
      "CREATE TABLE IF NOT EXISTS science_classes(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL, class_name TEXT NOT NULL, invite_code TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())",
      "CREATE TABLE IF NOT EXISTS science_learners(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID REFERENCES science_classes(id) ON DELETE CASCADE, alias TEXT NOT NULL, guardian_consent BOOLEAN NOT NULL DEFAULT FALSE, consent_recorded_at TIMESTAMPTZ, UNIQUE(class_id,alias))",
      "ALTER TABLE science_learners ADD COLUMN IF NOT EXISTS guardian_consent BOOLEAN NOT NULL DEFAULT FALSE",
      "ALTER TABLE science_learners ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ",
      "CREATE TABLE IF NOT EXISTS science_records(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID REFERENCES science_classes(id) ON DELETE CASCADE, learner_id UUID REFERENCES science_learners(id) ON DELETE CASCADE, topic TEXT NOT NULL, question TEXT NOT NULL, hypothesis TEXT NOT NULL, independent_variable TEXT NOT NULL, dependent_variable TEXT NOT NULL, control_variables TEXT NOT NULL, method TEXT NOT NULL, evidence TEXT NOT NULL, conclusion TEXT NOT NULL, reflection TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW())",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS observed_phenomenon TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS question_boundary TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS measurement_indicator TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS hypothesis_basis TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS expected_result TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS repetition_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS control_rationale TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS data_table TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS anomaly_handling TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS evidence_reasoning TEXT NOT NULL DEFAULT ''",
      "CREATE INDEX IF NOT EXISTS idx_science_classes_teacher_created ON science_classes(teacher_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_science_records_learner_created ON science_records(class_id, learner_id, created_at DESC)",
      "CREATE TABLE IF NOT EXISTS chat_messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at DESC)",
      "ALTER TABLE science_learners ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT '3-4'",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 4)",
      "ALTER TABLE science_records ADD COLUMN IF NOT EXISTS level_json JSONB NOT NULL DEFAULT '{}'::jsonb",
      "CREATE TABLE IF NOT EXISTS sessions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),token_hash TEXT UNIQUE NOT NULL,role TEXT NOT NULL CHECK(role IN ('teacher','student','admin')),subject_id TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)",
      "CREATE TABLE IF NOT EXISTS messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),session_id UUID NOT NULL,student_id TEXT NOT NULL DEFAULT '',role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'offline',created_at TIMESTAMPTZ DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS idx_messages_owner_session_time ON messages(student_id,session_id,created_at DESC)"
    ];
    for(const statement of statements) await db.query(statement);
    await db.query("SELECT 1");
    dbReady = true;
    return true;
  })();
  try { return await dbInitPromise; }
  catch(error) { dbReady = false; throw error; }
  finally { dbInitPromise = null; }
}
if(db) initDatabase().catch(e=>console.error("database_init_failed",e.message));

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", "data:"],
      mediaSrc: ["'self'"], fontSrc: ["'self'", "data:"], connectSrc: ["'self'"],
      objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "32kb" }));
if (ALLOW_ORIGIN) {
  app.use((req,res,next)=>{
    const origin=req.headers.origin;
    if (origin && origin===ALLOW_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary","Origin");
      res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
    }
    if(req.method==="OPTIONS") return res.sendStatus(204);
    next();
  });
}
function rateLimitKey(req){
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  return token ? "student:"+hashSessionToken(token) : "ip:"+(req.ip||req.socket?.remoteAddress||"unknown");
}
const apiLimiter = rateLimit({windowMs:60_000,limit:120,standardHeaders:"draft-7",legacyHeaders:false,keyGenerator:rateLimitKey,
  handler:(req,res)=>res.status(429).json({error:"请求过于频繁，请稍后再试。",mode:"offline",fallback:"offline"})});
const chatLimiter = rateLimit({windowMs:60_000,limit:30,standardHeaders:"draft-7",legacyHeaders:false,keyGenerator:rateLimitKey,
  handler:(req,res)=>res.status(429).json({error:"本分钟对话次数已达上限。",mode:"offline",fallback:"offline",answer:"当前请求较多，请稍后再试。你可以先整理已有观察和证据；本次对话不会丢失。"})});
const loginLimiter = rateLimit({windowMs:15*60_000,limit:5,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"登录尝试次数过多，请15分钟后再试。"}});

const SYSTEM_BASE = `你是“小小AI科学家”的儿童科学探究导师，面向8—11岁小学阶段学习者。
教学原则：
1. 使用简洁、友善、准确的中文，解释新术语；避免恐吓、羞辱和成人化表达。
2. 优先启发而非直接代做：先问学生观察到了什么、猜想是什么、有什么证据；必要时给出分步骤提示。
3. 遵循科学事实；不确定时明确说不确定，不编造实验数据、文献、网址或来源。
4. 帮助学生区分规则系统、传感器、机器学习和生成式AI，不把普通if/else规则称作机器学习。
5. 重要结论提示通过教材、可靠资料或老师核查；提醒AI可能出错。
6. 不索取姓名、住址、电话、学校班级、账号、密码、人脸等个人信息；遇到疑似个人信息，提醒删除并改用匿名描述。
7. 不诊断疾病、不提供危险实验操作、不评价学生人格或敏感属性；涉及危险活动建议停止并请教师成人指导。
8. 每次回答尽量采用“先回应—给线索/步骤—提出一个继续思考的问题”的结构。
9. 不声称已观察现实世界、已运行实验或已查阅实时资料，除非系统确实提供了相应工具。`;

const MENTOR_MODES = Object.freeze({
  curiosity: "采用好奇心探索方式：先回应学生的观察，再帮助把问题变得具体、可研究；通过一个追问引导学生自己思考，不直接代做。",
  experiment: "采用实验设计方式：引导学生识别自变量、因变量和控制变量，提出适龄、安全、可操作的步骤，并提醒需要成人指导的风险。",
  concept: "采用概念理解方式：用准确、适龄的中文和生活类比解释概念，说明类比的局限，并用一个问题检查理解。",
  evidence: "采用证据分析方式：帮助区分观察、数据、推断和结论；指出证据局限，不编造数据。",
  create: "采用创意设计方式：引导学生说明需求、约束、设计方案、测试指标和迭代方向，鼓励比较多种方案。"
});

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!TOKEN_SECRET || !token || !token.includes(".")) return false;
  const [body,sig] = token.split(".");
  const expected=crypto.createHmac("sha256",TOKEN_SECRET).update(body).digest();
  let got; try { got=Buffer.from(sig,"base64url"); } catch { return false; }
  if (got.length!==expected.length || !crypto.timingSafeEqual(got,expected)) return false;
  try { const p=JSON.parse(Buffer.from(body,"base64url").toString()); return p.exp>Date.now()?p:false; } catch { return false; }
}
async function requireTeacher(req,res,next) {
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    const session=await readSession(db,token);
    if(!session||session.role!=="teacher")return res.status(401).json({error:"教师身份验证已失效，请重新登录。"});
    const account=await db.query("SELECT status FROM teachers WHERE id=$1",[session.subjectId]);
    if(!account.rowCount)return res.status(401).json({error:"教师账号不存在，请重新登录。"});
    if(account.rows[0].status!=="approved")return res.status(403).json({error:"教师账号正在等待管理员审核。"});
    req.auth=session;next();
  }catch(error){console.error("teacher_session_read_failed",error.message);res.status(503).json({error:"教师身份验证暂不可用。"});}
}
function teacherId(req){return req.auth?.subjectId||"teacher-default";}
async function resolveStudentSession(token){
  if(!token||!db)return null;
  try{
    if(!dbReady)await initDatabase();
    const session=await readSession(db,token);
    if(!session||session.role!=="student")return null;
    const learner=await db.query("SELECT id,class_id,grade FROM science_learners WHERE id=$1",[session.subjectId]);
    if(!learner.rowCount)return null;
    return {role:"student",learnerId:learner.rows[0].id,classId:learner.rows[0].class_id,grade:learner.rows[0].grade||"3-4"};
  }catch(error){console.error("chat_student_session_failed",error.message);return null;}
}
async function requireStudent(req,res,next){
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    const student=await resolveStudentSession(token);
    if(!student)return res.status(401).json({error:"学生会话已失效，请重新加入班级。"});
    req.student=student;next();
  }catch(error){console.error("student_session_read_failed",error.message);res.status(503).json({error:"学生身份验证暂不可用。"});}
}
async function requireDatabase(req,res,next){if(!db)return res.status(503).json({error:"云端数据库尚未配置。"});if(!dbReady){try{await initDatabase();}catch(e){console.error("database_retry_failed",e.message);return res.status(503).json({error:"云端数据库暂不可用，请稍后重试。"});}}if(!dbReady)return res.status(503).json({error:"云端数据库尚未就绪，请稍后重试。"});next();}
function looksLikePII(value){
  const text=String(value||"");
  const patterns=[/(?:^|\D)(?:\+?86[- ]?)?1[3-9]\d{9}(?:$|\D)/,/(?:^|\D)\d{17}[\dXx](?:$|\D)/,/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,/(?:身份证|身份证号|家庭住址|详细地址|银行卡号|密码是|我的学号|住在.{0,12}(?:路|街|号|小区))/ ,/(?:^|[^\d])\d{8,}(?:$|[^\d])/];
  return containsPII(text)||patterns.some(pattern=>pattern.test(text));
}
function offlineTutor(message, topic) {
  const s=message;
  if(/爆炸|燃烧|点燃|强酸|强碱|电击|触电|毒|吞服|高压|自制武器/i.test(s))return offlineAnswer(s);
  if(/隐私|安全|个人信息|照片|人脸/.test(s)) return "安全提醒：不要在AI对话中输入姓名、住址、电话、学校班级、密码或人脸等信息。请先征得老师或家长同意。AI回答也需要核查。";
  if(/机器学习|训练|数据|分类/.test(s)) return "离线知识提示：机器学习通常利用样例数据和学习算法寻找规律，再对新数据进行预测。样例不完整或有偏差时，结果可能不可靠。思考：你会怎样补充更有代表性的样例？";
  if(/传感器|植物|温度|光照/.test(s)) return "离线知识提示：传感器可以采集温度、光照等信息，但传感器本身不一定是AI。设计提醒器时，要说明测量指标、提醒条件和误报后的人工复核。";
  if(/什么是|人工智能|AI/.test(s)) return "离线知识提示：人工智能是让计算机完成某些通常需要人类智能参与的任务的技术领域。AI不是魔法，也不意味着机器拥有人类感情。你能举出一个生活中的例子吗？";
  return "当前为离线规则演示，后端未配置DeepSeek API Key或模型服务暂不可用。请把问题拆成：我想知道什么？我已有何种证据？还需要查证什么？";
}
async function callDeepSeek(messages, maxTokens=900) {
  if(!API_KEY) throw new Error("DeepSeek API Key尚未配置");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(), 35_000);
  try {
    const response=await fetch(`${BASE_URL}/chat/completions`,{
      method:"POST",
      headers:{"Authorization":`Bearer ${API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:MODEL,messages,stream:false,max_tokens:maxTokens,temperature:0.5,thinking:{type:"disabled"}}),
      signal:controller.signal
    });
    const raw=await response.text();
    if(!response.ok) {
      const safe= response.status===401 ? "模型服务认证失败，请检查服务器API Key。" :
        response.status===402 ? "模型账户额度不足，请检查账户余额或计费状态。" :
        response.status===429 ? "模型服务请求频率受限，请稍后重试。" :
        `模型服务暂不可用（HTTP ${response.status}）。`;
      throw new Error(safe);
    }
    let data; try{data=JSON.parse(raw)}catch{throw new Error("模型服务返回格式异常。")}
    const answer=data?.choices?.[0]?.message?.content;
    if(typeof answer!=="string" || !answer.trim()) throw new Error("模型暂未生成有效回答。");
    return answer.trim();
  } finally { clearTimeout(timer); }
}

registerV56Routes({app,db,apiLimiter,requireTeacher,teacherId,ADMIN_PASSWORD,TOKEN_SECRET,signToken,verifyToken,looksLikePII,resolveStudentSession,initDatabase});
registerV57Routes({app,db,apiLimiter,requireTeacher,teacherId,requireDatabase});

app.get("/api/health",async(req,res)=>{
  let database = DATABASE_URL ? (dbReady ? "ready" : "connecting") : "not_configured";
  if(db && !dbReady){
    try { await initDatabase(); database = "ready"; }
    catch(error) { database = "unavailable"; console.error("health_database_check_failed",error.message); }
  }
  if(db && dbReady){
    try { await db.query("SELECT 1"); database = "ready"; }
    catch(error) { database = "unavailable"; dbReady = false; console.error("health_database_probe_failed",error.message); }
  }
  const capabilities={serverSideMentorModes:true,contentSecurityPolicy:true,cloudLearningRecords:database==="ready",classroomManagement:database==="ready",structuredInquiryRecords:database==="ready"};
  res.json({ok:true,version:APP_VERSION,aiConfigured:Boolean(API_KEY),model:MODEL,mode:API_KEY?"online":"offline",database,capabilities});
});
app.get("/api/chat/history/:sessionId",chatLimiter,requireStudent,requireDatabase,async(req,res)=>{
  const sessionId=String(req.params.sessionId||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))return res.status(400).json({error:"对话会话标识无效。"});
  try{const q=await db.query("SELECT role,content,created_at,mode FROM messages WHERE session_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 30",[sessionId,req.student.learnerId]);res.json({messages:q.rows.reverse().filter(m=>!looksLikePII(m.content))});}
  catch(e){console.error("chat_history_read_failed",e.message);res.status(500).json({error:"读取对话历史失败。"});}
});
app.delete("/api/chat/history/:sessionId",chatLimiter,requireStudent,requireDatabase,async(req,res)=>{
  const sessionId=String(req.params.sessionId||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))return res.status(400).json({error:"对话会话标识无效。"});
  try{await db.query("DELETE FROM messages WHERE session_id=$1 AND student_id=$2",[sessionId,req.student.learnerId]);res.json({cleared:true});}
  catch(e){console.error("chat_history_delete_failed",e.message);res.status(500).json({error:"清除对话历史失败。"});}
});
async function callDeepSeekStream(messages,onDelta,maxTokens=1000) {
  if(!API_KEY) throw new Error("DeepSeek API Key尚未配置");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),35_000);
  try {
    const response=await fetch(`${BASE_URL}/chat/completions`,{
      method:"POST",
      headers:{"Authorization":`Bearer ${API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:MODEL,messages,stream:true,max_tokens:maxTokens,temperature:0.5,thinking:{type:"disabled"}}),
      signal:controller.signal
    });
    if(!response.ok)throw new Error(`模型服务暂不可用（HTTP ${response.status}）。`);
    if(!response.body)throw new Error("模型服务未提供流式响应。");
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer="",answer="";
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split(/\r?\n/);buffer=lines.pop()||"";
      for(const line of lines){
        if(!line.startsWith("data:"))continue;
        const raw=line.slice(5).trim();
        if(!raw||raw==="[DONE]")continue;
        let data;try{data=JSON.parse(raw)}catch{continue}
        const delta=data?.choices?.[0]?.delta?.content;
        if(typeof delta==="string"&&delta){answer+=delta;onDelta(delta)}
      }
    }
    if(!answer.trim())throw new Error("模型暂未生成有效回答。");
    return answer.trim();
  } finally {clearTimeout(timer)}
}

app.post("/api/chat/stream",chatLimiter,async(req,res)=>{
  const message=typeof req.body?.message==="string"?req.body.message.trim():"";
  const sessionId=String(req.body?.sessionId||"");
  const topic=typeof req.body?.topic==="string"?req.body.topic.slice(0,30):"general";
  const mentorMode=typeof req.body?.mode==="string"&&Object.hasOwn(MENTOR_MODES,req.body.mode)?req.body.mode:"curiosity";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))return res.status(400).json({error:"对话会话标识无效，请刷新页面重试。"});
  if(!message)return res.status(400).json({error:"请输入问题。"});
  if(message.length>6000)return res.status(400).json({error:"问题过长，请缩短后再试。"});
  if(looksLikePII(message))return res.status(400).json({error:"检测到可能的个人身份信息，请删除后再提问。"});
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  const student=await resolveStudentSession(token);
  const ownsSession=Boolean(student?.learnerId&&student.classId);
  const ownerLearnerId=ownsSession?String(student.learnerId):"";
  const ownerClassId=ownsSession?String(student.classId):"";
  const headers={"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"};
  let started=false;
  const emit=(payload)=>{if(!res.destroyed)res.write("data: "+JSON.stringify(payload)+"\n\n")};
  try{
    const previous=ownsSession?await db.query("SELECT role,content FROM messages WHERE session_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 8",[sessionId,ownerLearnerId]):{rows:[]};
    const history=previous.rows.reverse().filter(m=>!looksLikePII(m.content)).map(m=>({role:m.role,content:m.content.slice(0,1200)}));
    if(ownsSession)await db.query("INSERT INTO messages(session_id,student_id,role,content,mode) VALUES($1,$2,'user',$3,$4)",[sessionId,ownerLearnerId,message,mentorMode]);
    const topicHint={ai:"课程主题：认识人工智能。",ml:"课程主题：机器学习。",sensor:"课程主题：智能感知。",safety:"课程主题：AI安全。",design:"课程主题：AI创意设计。"}[topic]||"课程主题：儿童科学探究。";
    res.writeHead(200,headers);started=true;
    let answer="",mode="online",notice;
    if(!API_KEY){answer=offlineTutor(message,topic);mode="offline";emit({delta:answer})}
    else{
      try{
        answer=await callDeepSeekStream([{role:"system",content:SYSTEM_BASE+"\n"+MENTOR_MODES[mentorMode]+"\n"+topicHint+(req.scienceSystemContext||"")},...history,{role:"user",content:message}],delta=>emit({delta}),1000);
      }catch(error){answer=offlineTutor(message,topic);mode="offline";notice=error.message;emit({delta:answer})}
    }
    if(req.scienceHintLevel===4&&!/参考答案/.test(answer))answer="参考答案（仅供参考，请用自己的话复述）\n"+answer+"\n\n请先遮住上面的内容，用自己的话复述你的理解。";
    if(looksLikePII(answer)){answer="回答可能包含个人信息，已隐藏。请用匿名信息继续。";mode="offline";emit({delta:"\n"+answer})}
    if(ownsSession)await db.query("INSERT INTO messages(session_id,student_id,role,content,mode) VALUES($1,$2,'assistant',$3,$4)",[sessionId,ownerLearnerId,answer,mentorMode]);
    emit({done:true,mode,model:MODEL,...(notice?{notice}:{})});
    res.end();
  }catch(error){
    console.error("chat_stream_failed",error.message);
    if(started){emit({delta:"\n当前服务暂不可用，请稍后重试。"});emit({done:true,mode:"offline",model:MODEL});res.end()}
    else res.status(503).json({error:"对话服务暂不可用，请稍后重试。",fallback:"offline"});
  }
});

app.post("/api/chat",chatLimiter,async(req,res)=>{
  const message=typeof req.body?.message==="string"?req.body.message.trim():"";
  const sessionId=String(req.body?.sessionId||"");
  const topic=typeof req.body?.topic==="string"?req.body.topic.slice(0,30):"general";
  const mentorMode=typeof req.body?.mode==="string" && Object.hasOwn(MENTOR_MODES,req.body.mode)?req.body.mode:"curiosity";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))return res.status(400).json({error:"对话会话标识无效，请刷新页面重试。"});
  if(!message)return res.status(400).json({error:"请输入问题。"});
  if(message.length>6000)return res.status(400).json({error:"问题过长，请控制在20000字以内。"});
  if(looksLikePII(message))return res.status(400).json({error:"检测到可能的个人身份信息。请删除姓名、联系方式、地址、学号等信息后再提问。"});
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    const student=await resolveStudentSession(token);
    const ownsSession=Boolean(student?.learnerId && student.classId);
    const ownerLearnerId=ownsSession?String(student.learnerId):"";
    const previous=ownsSession
      ? await db.query("SELECT role,content FROM messages WHERE session_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 8",[sessionId,ownerLearnerId])
      : {rows:[]};
    const safeHistory=previous.rows.reverse().filter(m=>!looksLikePII(m.content)).map(m=>({role:m.role,content:m.content.slice(0,1200)}));
    if(ownsSession) await db.query("INSERT INTO messages(session_id,student_id,role,content,mode) VALUES($1,$2,'user',$3,$4)",[sessionId,ownerLearnerId,message,mentorMode]);
    const topicHint={
      ai:"课程主题：认识人工智能。帮助学生区分人工智能、自动化与普通程序。",
      ml:"课程主题：机器学习。重点解释样例、特征、训练、测试、偏差和预测。",
      sensor:"课程主题：智能感知。重点解释传感器、输入—处理—输出与误报。",
      safety:"课程主题：AI安全。重点解释隐私、事实核查、偏见、版权和人工监督。",
      design:"课程主题：AI创意设计。引导学生说明需求、输入、处理、输出、风险、测试和迭代。"
    }[topic]||"课程主题：儿童科学探究。";
    let answer,mode="online",notice;
    if(!API_KEY){answer=offlineTutor(message,topic);mode="offline";}
    else{
      try{answer=await callDeepSeek([{role:"system",content:SYSTEM_BASE+"\n"+MENTOR_MODES[mentorMode]+"\n"+topicHint+(req.scienceSystemContext||"")},...safeHistory,{role:"user",content:message}],1000);}
      catch(err){answer=offlineTutor(message,topic);mode="offline";notice=err.message;}
    }
    if(req.scienceHintLevel===4 && !/参考答案/.test(answer))answer="参考答案（仅供参考，请用自己的话复述）\n"+answer+"\n\n请先遮住上面的内容，用自己的话复述你的理解，并说明它和你自己的实验记录有什么联系。";
    if(looksLikePII(answer))answer="这条回答可能包含个人身份信息，为保护隐私已隐藏。请改用匿名信息继续探究。";
    if(ownsSession){
      await db.query("INSERT INTO messages(session_id,student_id,role,content,mode) VALUES($1,$2,'assistant',$3,$4)",[sessionId,ownerLearnerId,answer,mentorMode]);
      await db.query("DELETE FROM messages WHERE session_id=$1 AND student_id=$2 AND id NOT IN (SELECT id FROM messages WHERE session_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 30)",[sessionId,ownerLearnerId]);
    }
    res.json({mode,model:MODEL,answer,hintLevel:req.scienceHintLevel||1,qualityCheck:req.scienceQualityCheck||null,...(notice?{notice}:{})});
  }catch(err){console.error("chat_request_failed",err.message);res.status(503).json({mode:"offline",fallback:"offline",error:"对话服务暂不可用，请稍后重试。"});}
});
app.post("/api/admin/login",loginLimiter,(req,res)=>{
  if(!ADMIN_PASSWORD || !TOKEN_SECRET) return res.status(503).json({error:"管理员安全配置尚未完成。"});
  const password=typeof req.body?.password==="string"?req.body.password:"";
  const a=Buffer.from(password),b=Buffer.from(ADMIN_PASSWORD);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:"管理员密码不正确。"});
  const adminId=crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex").slice(0,24);
  const token=signToken({role:"admin",teacherId:adminId,isAdmin:true,exp:Date.now()+2*60*60*1000});
  res.json({token,expiresIn:7200});
});
app.post("/api/teacher/evaluate",apiLimiter,requireTeacher,async(req,res)=>{
  const work=typeof req.body?.work==="string"?req.body.work.trim():"";
  if(!work) return res.status(400).json({error:"请提交匿名作品内容。"});
  if(work.length>20000) return res.status(400).json({error:"作品内容过长，请控制在6000字以内。"});
  if(looksLikePII(work)) return res.status(400).json({error:"作品中可能含有个人身份信息，请先去标识化。"});
  if(!API_KEY) return res.json({mode:"offline",answer:"离线演示：教师评价功能尚未连接DeepSeek。请按五项水平4标准人工核查：真实观察与可测量问题；明确假设及依据；一次只改变一个变量并写明控制条件和重复次数；多次真实数据及异常值处理；结论逐条对应证据并说明局限和新问题。缺少材料时标记“尚无证据”，不得推定达标。"});
  try {
    const answer=await callDeepSeek([
      {role:"system",content:`你是小学科学探究教师助手。严格依据用户提供的《水平4优秀》五项标准开展形成性评价，不给分、不计算总分。必须依次评价：1提出问题：是否来自真实观察，研究边界清楚且有可测量指标；2假设与依据：假设明确可检验，说明依据/经验并写出预期结果；3变量与设计：一次只改变一个自变量，明确因变量、控制条件及理由，说明重复次数；4证据与记录：数据有单位、至少多次记录，能识别异常值并说明保留、复测或排除理由；5解释与反思：结论不超出证据，逐条建立证据—解释—结论联系，指出局限并提出新问题。每一项必须输出“水平4标准、当前证据、达标判断（达到/部分达到/尚无证据）、具体差距、下一步可执行建议”。不得根据计划或空白字段推断实验已实施；没有真实记录就标记“尚无证据”。发现单次测量、无单位、同时改变多个变量、无异常值说明或结论超出数据时明确指出。最后总结最强证据、首要改进和需要教师现场核实的事项。`},
      {role:"user",content:`请对以下已匿名化的学生作品提供评价建议：\n${work}`}
    ],1400);
    res.json({mode:"online",model:MODEL,answer});
  } catch(err) {
    res.json({mode:"offline",answer:"AI评价服务暂不可用。请由教师按量规人工评价。"+err.message});
  }
});

app.post("/api/teacher/classes",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
  const className=typeof req.body?.className==="string"?req.body.className.trim().slice(0,60):"";
  if(!className)return res.status(400).json({error:"请填写班级代号，不要填写真实学校或班级信息。"});
  const inviteCode=crypto.randomBytes(4).toString("hex").toUpperCase();
  try{const q=await db.query("INSERT INTO science_classes(teacher_id,class_name,invite_code) VALUES($1,$2,$3) RETURNING id,class_name,invite_code,created_at",[teacherId(req),className,inviteCode]);res.status(201).json({class:q.rows[0]});}
  catch(e){console.error("class_create_failed",e.message);res.status(500).json({error:"创建班级失败。"});}
});



app.post("/api/student/join",apiLimiter,requireDatabase,async(req,res)=>{

  const code=String(req.body?.inviteCode||"").trim().toUpperCase(),alias=String(req.body?.alias||"").trim();
  const aliasCheck=validateAlias(alias);
  if(!aliasCheck.valid)return res.status(400).json({error:aliasCheck.error});
  const grade=["3-4","5-6"].includes(String(req.body?.grade||"3-4"))?String(req.body?.grade||"3-4"):"3-4";
  if(!/^[A-F0-9]{8}$/.test(code))return res.status(400).json({error:"邀请码格式不正确。"});
  if(req.body?.guardianConsent!==true)return res.status(400).json({error:"请先确认已取得教师和监护人必要同意。"});
  try{const c=await db.query("SELECT id FROM science_classes WHERE invite_code=$1",[code]);if(!c.rowCount)return res.status(404).json({error:"邀请码无效。"});const l=await db.query("INSERT INTO science_learners(class_id,alias,guardian_consent,consent_recorded_at,grade) VALUES($1,$2,TRUE,NOW(),$3) ON CONFLICT(class_id,alias) DO UPDATE SET alias=EXCLUDED.alias,guardian_consent=TRUE,consent_recorded_at=NOW(),grade=EXCLUDED.grade RETURNING id,alias,grade",[c.rows[0].id,alias,grade]);const session=await issueSession(db,{role:"student",subjectId:l.rows[0].id});res.json({token:session.token,alias:l.rows[0].alias,expiresAt:session.expiresAt});}
  catch(e){console.error("student_join_failed",e.message);res.status(500).json({error:"加入班级失败。"});}
});
app.post("/api/student/records",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
  const fields=["topic","question","hypothesis","independentVariable","dependentVariable","controlVariables","method","evidence","conclusion","reflection","observedPhenomenon","questionBoundary","measurementIndicator","hypothesisBasis","expectedResult","controlRationale","dataTable","anomalyHandling","evidenceReasoning"];
  const d={};
  for(const key of fields){
    d[key]=typeof req.body?.[key]==="string"?req.body[key].trim():"";
    if(d[key].length>(["method","evidence","dataTable"].includes(key)?5000:1500))return res.status(400).json({error:"记录内容过长，请精简。"});
    if(d[key]&&looksLikePII(d[key]))return res.status(400).json({error:"检测到可能的个人身份信息，请删除后再提交。"});
  }
  if(!d.topic||!d.question)return res.status(400).json({error:"请先填写实验主题和研究问题。"});
  const repetition=Number(req.body?.repetitionCount);
  d.repetitionCount=Number.isInteger(repetition)&&repetition>=1&&repetition<=20?repetition:0;
  const scored=scoreRecord(d);
  try{
    const q=await db.query(
      "INSERT INTO science_records(class_id,learner_id,topic,question,hypothesis,independent_variable,dependent_variable,control_variables,method,evidence,conclusion,reflection,observed_phenomenon,question_boundary,measurement_indicator,hypothesis_basis,expected_result,repetition_count,control_rationale,data_table,anomaly_handling,evidence_reasoning,level,level_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id,created_at",
      [req.student.classId,req.student.learnerId,d.topic,d.question,d.hypothesis,d.independentVariable,d.dependentVariable,d.controlVariables,d.method,d.evidence,d.conclusion,d.reflection,d.observedPhenomenon,d.questionBoundary,d.measurementIndicator,d.hypothesisBasis,d.expectedResult,d.repetitionCount,d.controlRationale,d.dataTable,d.anomalyHandling,d.evidenceReasoning,scored.level,JSON.stringify(scored)]
    );
    res.status(201).json({saved:true,record:q.rows[0],level:scored.level,level_json:scored,next_steps:scored.next_steps});
  }catch(error){console.error("record_save_failed",error.message);res.status(500).json({error:"云端保存失败，请稍后重试。"});}
});
app.get("/api/student/records",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
  try{const q=await db.query("SELECT id,topic,question,hypothesis,independent_variable,dependent_variable,control_variables,method,evidence,conclusion,reflection,observed_phenomenon,question_boundary,measurement_indicator,hypothesis_basis,expected_result,repetition_count,control_rationale,data_table,anomaly_handling,evidence_reasoning,level,level_json,created_at FROM science_records WHERE class_id=$1 AND learner_id=$2 ORDER BY created_at DESC LIMIT 100",[req.student.classId,req.student.learnerId]);res.json({records:q.rows});}
  catch(e){console.error("student_record_list_failed",e.message);res.status(500).json({error:"读取个人探究记录失败。"});}
});
app.get("/api/teacher/classes",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
  try{const q=await db.query("SELECT c.id,c.class_name,c.invite_code,c.created_at,COUNT(DISTINCT l.id)::int AS learner_count,COUNT(DISTINCT r.id)::int AS record_count FROM science_classes c LEFT JOIN science_learners l ON l.class_id=c.id LEFT JOIN science_records r ON r.class_id=c.id WHERE c.teacher_id=$1 GROUP BY c.id ORDER BY c.created_at DESC",[teacherId(req)]);await db.query("INSERT INTO audit_log(teacher_id,action,target_type,target_id) VALUES($1,$2,$3,$4)",[teacherId(req),"list_classes","teacher","all"]);res.json({classes:q.rows});}
  catch(e){console.error("class_list_failed",e.message);res.status(500).json({error:"读取班级列表失败。"});}
});
app.get("/api/teacher/classes/:id/records",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
  try{const own=await db.query("SELECT id FROM science_classes WHERE id=$1 AND teacher_id=$2",[req.params.id,teacherId(req)]);if(!own.rowCount)return res.status(404).json({error:"班级不存在。"});const q=await db.query("SELECT r.id,l.alias,r.topic,r.question,r.hypothesis,r.independent_variable,r.dependent_variable,r.control_variables,r.method,r.evidence,r.conclusion,r.reflection,r.observed_phenomenon,r.question_boundary,r.measurement_indicator,r.hypothesis_basis,r.expected_result,r.repetition_count,r.control_rationale,r.data_table,r.anomaly_handling,r.evidence_reasoning,r.level,r.level_json,r.created_at FROM science_records r JOIN science_learners l ON l.id=r.learner_id WHERE r.class_id=$1 ORDER BY r.created_at DESC LIMIT 300",[req.params.id]);await db.query("INSERT INTO audit_log(teacher_id,action,target_type,target_id) VALUES($1,$2,$3,$4)",[teacherId(req),"view_class_records","class",req.params.id]);res.json({records:q.rows});}
  catch(e){console.error("record_list_failed",e.message);res.status(500).json({error:"读取探究档案失败。"});}
});


app.delete("/api/student/records/:id",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
  try{const q=await db.query("DELETE FROM science_records WHERE id=$1 AND class_id=$2 AND learner_id=$3",[req.params.id,req.student.classId,req.student.learnerId]);if(!q.rowCount)return res.status(404).json({error:"记录不存在或无权删除。"});res.json({deleted:true});}
  catch(e){console.error("student_record_delete_failed",e.message);res.status(500).json({error:"删除记录失败。"});}
});
app.delete("/api/teacher/classes/:id",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
  try{const q=await db.query("DELETE FROM science_classes WHERE id=$1 AND teacher_id=$2",[req.params.id,teacherId(req)]);if(!q.rowCount)return res.status(404).json({error:"班级不存在或无权删除。"});res.json({deleted:true});}
  catch(e){console.error("class_delete_failed",e.message);res.status(500).json({error:"删除班级失败。"});}
});

app.use("/videos",express.static(path.join(__dirname,"public","videos"),{maxAge:"7d",etag:true,lastModified:true,immutable:false,fallthrough:false}));
app.use(express.static(path.join(__dirname,"public"),{extensions:["html"],fallthrough:true}));
app.use((req,res)=>{
  if(req.path.startsWith("/api/")) return res.status(404).json({error:"接口不存在。"});
  return res.status(404).type("text/plain; charset=utf-8").send("页面不存在（404）。请检查网址，或返回小小AI科学家首页。");
});
app.use((err,req,res,next)=>{console.error("request_error",err?.message||"unknown");res.status(500).json({error:"服务器内部错误，请稍后重试。"});});
const server = app.listen(PORT,()=>console.log(`Little AI Scientists ${APP_VERSION} listening on ${PORT}`));
for(const signal of ["SIGTERM","SIGINT"]){
  process.on(signal,()=>{
    server.close(()=>{ if(db) db.end().finally(()=>process.exit(0)); else process.exit(0); });
  });
}
