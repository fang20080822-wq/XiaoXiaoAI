import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

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

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
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
const apiLimiter = rateLimit({windowMs: 60_000, limit: 12, standardHeaders: "draft-7", legacyHeaders:false,
  message:{error:"请求过于频繁，请稍后再试。"}});
const loginLimiter = rateLimit({windowMs: 15*60_000, limit: 5, standardHeaders:"draft-7", legacyHeaders:false,
  message:{error:"登录尝试次数过多，请15分钟后再试。"}});
app.use("/api/chat", apiLimiter);
app.use("/api/teacher/evaluate", apiLimiter);

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
  try { const p=JSON.parse(Buffer.from(body,"base64url").toString()); return p.role==="teacher" && p.exp>Date.now(); } catch { return false; }
}
function requireTeacher(req,res,next) {
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!verifyToken(token)) return res.status(401).json({error:"教师身份验证已失效，请重新登录。"});
  next();
}
function looksLikePII(text) {
  const patterns=[
    /(?:\+?\d[\d\s-]{7,}\d)/,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?:身份证|身份证号|家庭住址|详细地址|银行卡号|密码是|我的学号)/,
  ];
  return patterns.some(p=>p.test(text));
}
function offlineTutor(message, topic) {
  const s=message;
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

app.get("/api/health",(req,res)=>res.json({ok:true,aiConfigured:Boolean(API_KEY),model:MODEL,mode:API_KEY?"online":"offline",version:"4.0.0"}));
app.post("/api/chat",async(req,res)=>{
  const message=typeof req.body?.message==="string"?req.body.message.trim():"";
  const topic=typeof req.body?.topic==="string"?req.body.topic.slice(0,30):"general";
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-6):[];
  if(!message) return res.status(400).json({error:"请输入问题。"});
  if(message.length>1200) return res.status(400).json({error:"问题过长，请控制在1200字以内。"});
  if(looksLikePII(message)) return res.status(400).json({error:"检测到可能的个人身份信息。请删除姓名、联系方式、地址、学号等信息后再提问。"});
  if(!API_KEY) return res.json({mode:"offline",answer:offlineTutor(message,topic)});
  const safeHistory=history.filter(m=>m && ["user","assistant"].includes(m.role) && typeof m.content==="string")
    .map(m=>({role:m.role,content:m.content.slice(0,1200)}));
  const topicHint={
    ai:"课程主题：认识人工智能。帮助学生区分人工智能、自动化与普通程序。",
    ml:"课程主题：机器学习。重点解释样例、特征、训练、测试、偏差和预测。",
    sensor:"课程主题：智能感知。重点解释传感器、输入—处理—输出与误报。",
    safety:"课程主题：AI安全。重点解释隐私、事实核查、偏见、版权和人工监督。",
    design:"课程主题：AI创意设计。引导学生说明需求、输入、处理、输出、风险、测试和迭代。"
  }[topic]||"课程主题：儿童科学探究。";
  try {
    const answer=await callDeepSeek([{role:"system",content:SYSTEM_BASE+"\n"+topicHint},...safeHistory,{role:"user",content:message}],1000);
    res.json({mode:"online",model:MODEL,answer});
  } catch(err) {
    res.json({mode:"offline",answer:offlineTutor(message,topic),notice:err.message});
  }
});
app.post("/api/teacher/login",loginLimiter,(req,res)=>{
  if(!ADMIN_PASSWORD || !TOKEN_SECRET) return res.status(503).json({error:"教师端尚未完成安全配置，请管理员设置ADMIN_PASSWORD和TOKEN_SECRET。"});
  const password=typeof req.body?.password==="string"?req.body.password:"";
  const a=Buffer.from(password),b=Buffer.from(ADMIN_PASSWORD);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:"密码不正确。"});
  const token=signToken({role:"teacher",exp:Date.now()+2*60*60*1000});
  res.json({token,expiresIn:7200});
});
app.post("/api/teacher/evaluate",apiLimiter,requireTeacher,async(req,res)=>{
  const work=typeof req.body?.work==="string"?req.body.work.trim():"";
  const rubric=typeof req.body?.rubric==="string"?req.body.rubric.slice(0,1000):"";
  if(!work) return res.status(400).json({error:"请提交匿名作品内容。"});
  if(work.length>6000) return res.status(400).json({error:"作品内容过长，请控制在6000字以内。"});
  if(looksLikePII(work)) return res.status(400).json({error:"作品中可能含有个人身份信息，请先去标识化。"});
  if(!API_KEY) return res.json({mode:"offline",answer:"离线演示：教师评价功能尚未连接DeepSeek。请依据课程量规人工评价。建议关注：问题是否真实明确；输入数据是否可获得且适当；处理逻辑是否合理；输出是否可验证；是否考虑错误、隐私、公平性和人工复核；是否提出测试与迭代。"});
  try {
    const answer=await callDeepSeek([
      {role:"system",content:`你是小学科学与信息科技课程的教师评价辅助工具。仅依据提交作品给出形成性反馈，不推断学生人格、能力等级或敏感属性。不能替代教师评分。指出证据充分处、待改进处、一个可执行建议和需要教师核查的问题。若信息不足明确说明。量规：${rubric}`},
      {role:"user",content:`请对以下已匿名化的学生作品提供评价建议：\n${work}`}
    ],1400);
    res.json({mode:"online",model:MODEL,answer});
  } catch(err) {
    res.json({mode:"offline",answer:"AI评价服务暂不可用。请由教师按量规人工评价。"+err.message});
  }
});
app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error("request_error",err?.message||"unknown");res.status(500).json({error:"服务器内部错误，请稍后重试。"});});
app.listen(PORT,()=>console.log(`Little AI Scientists V4 listening on ${PORT}`));
