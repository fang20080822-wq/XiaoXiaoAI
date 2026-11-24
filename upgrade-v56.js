import crypto from "node:crypto";
import {hashPassword,verifyPassword,issueSession} from "./lib/auth.js";

export const CURRICULUM_12 = [
  {id:"plant-water",title:"植物怎样喝水",grade:"3—4年级",concept:"植物吸收与运输水分",domain:"生命科学",question:"不同条件会怎样影响植物吸水？"},
  {id:"rainbow",title:"彩虹如何形成",grade:"3—4年级",concept:"光的折射、反射与色散",domain:"物质科学",question:"水滴和光照条件怎样影响彩虹现象？"},
  {id:"magnet",title:"磁铁的秘密",grade:"3—4年级",concept:"磁性与磁相互作用",domain:"物质科学",question:"不同材料与距离怎样影响磁铁吸引效果？"},
  {id:"shadow",title:"影子为什么会变化",grade:"3—4年级",concept:"光沿直线传播与影子形成",domain:"物质科学",question:"光源位置变化会怎样影响影子的长度和方向？"},
  {id:"sound",title:"声音从哪里来",grade:"3—4年级",concept:"振动产生声音",domain:"物质科学",question:"振动方式怎样影响声音的高低或强弱？"},
  {id:"dissolve",title:"什么会溶解在水里",grade:"3—4年级",concept:"溶解现象与影响因素",domain:"物质科学",question:"温度或搅拌会怎样影响物质溶解？"},
  {id:"plant-light",title:"植物需要多少阳光",grade:"3—4年级",concept:"植物生长与环境条件",domain:"生命科学",question:"光照时长变化会怎样影响植物生长指标？"},
  {id:"friction",title:"摩擦力的大小",grade:"5—6年级",concept:"摩擦力与接触面",domain:"物质科学",question:"接触面材料变化会怎样影响物体滑动距离？"},
  {id:"浮沉",title:"沉与浮的奥秘",grade:"5—6年级",concept:"浮力与物体状态",domain:"物质科学",question:"物体材料或形状怎样影响它的浮沉？"},
  {id:"weather",title:"身边的天气数据",grade:"5—6年级",concept:"气温、降水与数据观察",domain:"地球与宇宙",question:"一天中不同时间的气温有什么变化规律？"},
  {id:"sensor",title:"制作环境小侦探",grade:"5—6年级",concept:"传感器输入与数据测量",domain:"技术与工程",question:"传感器测量结果与实际观察是否一致？"},
  {id:"filter",title:"怎样让水更清澈",grade:"5—6年级",concept:"过滤与材料结构",domain:"技术与工程",question:"不同过滤材料对水中可见颗粒的去除效果有何不同？"}
];

const COURSE_MISCONCEPTIONS = {
  "plant-water": [
    {id:"leaf-absorption",pattern:/叶子(直接)?吸水|叶片(直接)?吸水|水从叶子进入植物/,label:"可能把叶片吸水误认为植物吸收水分的主要途径",prompt:"可以用透明杯、带叶枝条和少量食用色素水观察茎部颜色变化。先预测颜色会出现在哪里，再用切面观察验证。"},
    {id:"soil-drinking",pattern:/植物喝土|植物从土里直接喝|土壤变湿.*说明.*吸水/,label:"可能把土壤中的水分与植物体内的运输过程混为一谈",prompt:"水进入根后会怎样到达叶片？可以比较有色水处理前后茎和叶脉的变化，寻找连续的证据。"}
  ],
  "rainbow": [
    {id:"cloud-color",pattern:/云(朵|层)?本身(有|带有|带着)彩虹|彩虹是云(朵|层)?的颜色|云把光变成彩虹/,label:"可能把彩虹颜色归因于云本身",prompt:"在阳光方向合适时，用喷雾制造细小水滴，观察没有彩色云层时是否也能出现彩色光带。"},
    {id:"sunlight-color",pattern:/太阳光本来就(有|是)七种颜色|阳光本身就是彩虹色/,label:"可能尚未区分白光与色散后的颜色",prompt:"用棱镜或安全的光学教具观察白光通过后发生了什么，记录颜色出现前后光线的变化。"}
  ],
  "magnet": [
    {id:"all-metals",pattern:/所有金属(都)?(能|会)被磁铁吸|金属都(能|会)被磁铁吸|铝(片|块)?.{0,8}被磁铁吸|铜(片|块)?.{0,8}被磁铁吸/,label:"可能把“金属”误认为都具有相同的磁性",prompt:"把铁、铝、铜等材料分别靠近同一块磁铁，保持距离和测试方式相同，用表格记录结果。"},
    {id:"single-pole",pattern:/磁铁只有一端有磁性|只有一头能吸|磁铁的一端才有磁力/,label:"可能认为磁铁只有一端具有磁性",prompt:"用条形磁铁两端分别靠近回形针，比较吸引效果；再用另一块磁铁观察两端相互作用。"}
  ]
};

export function detectCourseMisconception(courseId, text = "") {
  const source = String(text || "").slice(0, 12000);
  const rules = COURSE_MISCONCEPTIONS[String(courseId || "")] || [];
  const match = rules.find(rule => rule.pattern.test(source));
  return match ? {id:match.id,label:match.label,prompt:match.prompt} : null;
}

export function buildCourseLearningContext(courseId, learnerText = "", records = []) {
  const course = CURRICULUM_12.find(item => item.id === String(courseId || "")) || null;
  const safeRecords = Array.isArray(records) ? records.slice(0,3) : [];
  const recordText = safeRecords.map(row => [
    row.observed_phenomenon,row.question,row.hypothesis,row.hypothesis_basis,
    row.independent_variable,row.dependent_variable,row.control_variables,
    row.measurement_indicator,row.data_table,row.conclusion,row.evidence_reasoning
  ].filter(Boolean).join("；")).join("\n");
  const misconception = course ? detectCourseMisconception(course.id, String(learnerText || "") + "\n" + recordText) : null;
  return {
    course: course ? {id:course.id,title:course.title,grade:course.grade,concept:course.concept,domain:course.domain,question:course.question} : null,
    records: safeRecords,
    misconception
  };
}

export function validateInquiry(record = {}) {
  const issues = [];
  const has = (k) => String(record[k] ?? "").trim().length > 0;
  const variables = ["independentVariable","dependentVariable","controlVariables"];
  for (const key of variables) if (!has(key)) issues.push({code:"missing_variable",field:key,message:"变量信息尚未填写。"});
  if (has("independentVariable") && /、|，|,|和|以及/.test(record.independentVariable)) issues.push({code:"multiple_independent",field:"independentVariable",message:"自变量描述可能包含多个变化因素，请检查是否一次只改变一个变量。"});
  if (!has("measurementIndicator")) issues.push({code:"missing_measurement",field:"measurementIndicator",message:"缺少可测量指标，暂不能判断实验结果。"});
  const data = String(record.dataTable || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const validRows = data.filter(row => {
    const p = row.split(/[|｜,，\t]/).map(x=>x.trim());
    return p.length >= 3 && p.some(x=>/\d/.test(x)) && p.some(x=>/(mm|cm|m|g|kg|℃|°c|秒|分钟|次|ml|毫升|%|个|片|株)/i.test(x));
  });
  if (validRows.length < 2) issues.push({code:"insufficient_data",field:"dataTable",message:"证据缺少至少两条包含数值和单位的可测量记录。"});
  if (!has("repetitionCount") || Number(record.repetitionCount) < 2) issues.push({code:"insufficient_repeats",field:"repetitionCount",message:"重复实验次数不足，建议至少重复2次并如实记录。"});
  if (!has("anomalyHandling")) issues.push({code:"missing_anomaly",field:"anomalyHandling",message:"尚未说明如何识别和处理异常值。"});
  if (has("conclusion") && /一定证明|完全证明|所有情况|永远/.test(record.conclusion) && validRows.length < 3) issues.push({code:"overclaim",field:"conclusion",message:"结论可能超出当前证据支持范围，请降低结论强度。"});
  if (!has("evidenceReasoning")) issues.push({code:"missing_reasoning",field:"evidenceReasoning",message:"请说明数据如何支持结论，建立证据与解释的联系。"});
  return {valid:issues.length===0,issues,validDataRows:validRows.length,checkedBy:"deterministic-rules"};
}

const LEVEL_TEXT = {
  1:"L1 追问：不提供结论，只提出一个能帮助学生观察或澄清问题的追问。",
  2:"L2 给方向：提供一个思考方向或检查步骤，但不替学生完成推理。",
  3:"L3 给示例：给出相似情境的示例，不直接代入学生实验得出答案。",
  4:"L4 参考答案：只有达到本级才可给出参考答案；必须明确标注“这是参考答案”，并请学生用自己的话复述。"
};

export function nextHintState(previous = {}, message = "") {
  let level = Math.max(1,Math.min(4,Number(previous.level)||1));
  let streak = Math.max(0,Number(previous.streak)||0);
  const text = String(message);
  const selfCorrection = text.length >= 18 && /(我发现|我改成|应该是|因为.*所以|数据说明)/.test(text);
  const correctDirection = /(自变量|因变量|控制变量|重复.*次|单位|测量|证据)/.test(text) && text.length >= 12;
  const asksAnswer = /(直接告诉我答案|给我答案|答案是什么|帮我写完)/.test(text);
  const normalized = text.toLowerCase().replace(/[？?。！!，,、\s]/g,"");
  const previousPrompt = String(previous.last_prompt||"").toLowerCase().replace(/[？?。！!，,、\s]/g,"");
  const repeatedPrompt = normalized.length>=5 && normalized===previousPrompt;
  if (selfCorrection) { streak += 1; if (streak >= 2) { level = Math.min(3,level+1); streak = 0; } }
  else if (correctDirection) { level = Math.min(3,level+1); streak = 0; }
  else if (asksAnswer || repeatedPrompt) { level = Math.min(3,level+1); streak = 0; }
  else { streak = 0; }
  return {level,streak,instruction:LEVEL_TEXT[level],selfCorrection,asksAnswer,repeatedPrompt,last_prompt:normalized};
}

export function registerV56Routes({app,db,apiLimiter,loginLimiter,requireTeacher,teacherId,ADMIN_PASSWORD,TOKEN_SECRET,signToken,verifyToken,looksLikePII,resolveStudentSession,initDatabase}) {
  let ready = false;
  async function ensureTables() {
    if (ready) return;
    if (!db) throw new Error('database_not_configured');
    if (typeof initDatabase === 'function') await initDatabase();
    const sql = [
      "CREATE TABLE IF NOT EXISTS teachers(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL DEFAULT '',pw_hash TEXT NOT NULL DEFAULT '',salt TEXT NOT NULL DEFAULT '',school TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),created_at TIMESTAMPTZ DEFAULT NOW(),reviewed_at TIMESTAMPTZ)",
      "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS pw_hash TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT ''",
      "CREATE TABLE IF NOT EXISTS audit_log(id BIGSERIAL PRIMARY KEY,teacher_id TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL DEFAULT '',target_id TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS idx_audit_log_teacher_time ON audit_log(teacher_id,created_at DESC)",
      "CREATE TABLE IF NOT EXISTS mentor_progress(session_id UUID PRIMARY KEY,level INTEGER NOT NULL DEFAULT 1,streak INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW())",
      "ALTER TABLE mentor_progress ADD COLUMN IF NOT EXISTS last_prompt TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE mentor_progress ADD COLUMN IF NOT EXISTS learner_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE mentor_progress ADD COLUMN IF NOT EXISTS class_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS learner_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS class_id TEXT NOT NULL DEFAULT ''",
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_owner_session ON chat_messages(learner_id,class_id,session_id,created_at DESC)"
    ];
    for (const statement of sql) await db.query(statement);
    ready = true;
  }
  const audit = async (tid,action,type="",id="") => {
    await db.query("INSERT INTO audit_log(teacher_id,action,target_type,target_id) VALUES($1,$2,$3,$4)",[String(tid),action,type,id]);
  };
  app.use("/api/teacher",async(req,res,next)=>{
    if(!db)return next();
    try {
      await ensureTables();
      const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      const payload=verifyToken(token);
      if(payload?.accountTeacher){
        const q=await db.query("SELECT status FROM teachers WHERE id=$1",[payload.teacherId]);
        if(!q.rows[0] || q.rows[0].status!=="approved")return res.status(403).json({error:"教师账号当前未获准访问，请联系管理员。"});
      }
      next();
    } catch(error) { console.error("teacher_account_guard_failed",error.message); res.status(503).json({error:"教师账号服务暂不可用。"}); }
  });
  const requireAdmin = (req,res,next) => {
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    const p=verifyToken(token);
    if(!p || p.role!=="admin" || p.isAdmin!==true) return res.status(403).json({error:"仅管理员可执行此操作。"});
    req.admin=p; next();
  };

  app.use("/api/chat",async(req,res,next)=>{
    if(!db) return next();
    try {
      await ensureTables();
      if(req.method!=="POST") return next();
      const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      const student=await resolveStudentSession(token);
      const sessionId=String(req.body?.sessionId||"");
      const isStudent=student?.role==="student" && student.learnerId && student.classId;
      let state;
      if(isStudent){
        const ownerLearnerId=String(student.learnerId),ownerClassId=String(student.classId);
        const stateQ=await db.query("SELECT level,streak,last_prompt FROM mentor_progress WHERE session_id=$1 AND learner_id=$2 AND class_id=$3",[sessionId,ownerLearnerId,ownerClassId]);
        state=nextHintState(stateQ.rows[0]||{},String(req.body?.message||""));
        await db.query("INSERT INTO mentor_progress(session_id,learner_id,class_id,level,streak,last_prompt) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id) DO UPDATE SET learner_id=EXCLUDED.learner_id,class_id=EXCLUDED.class_id,level=EXCLUDED.level,streak=EXCLUDED.streak,last_prompt=EXCLUDED.last_prompt,updated_at=NOW()",[sessionId,ownerLearnerId,ownerClassId,state.level,state.streak,state.last_prompt]);
      } else {
        state=nextHintState({},String(req.body?.message||""));
      }
      const courseId=typeof req.body?.courseId==="string"?req.body.courseId.slice(0,64):"";
      const course=CURRICULUM_12.find(item=>item.id===courseId)||null;
      let recentRows=[];
      if(student?.role==="student" && student.learnerId && student.classId) {
        const q=await db.query(
          "SELECT topic,observed_phenomenon,question,question_boundary,measurement_indicator,hypothesis,hypothesis_basis,expected_result,independent_variable,dependent_variable,control_variables,control_rationale,repetition_count,method,data_table,evidence,anomaly_handling,evidence_reasoning,conclusion,reflection,created_at FROM science_records WHERE learner_id=$1 AND class_id=$2 AND ($3='' OR topic=$3 OR question=$3) ORDER BY created_at DESC LIMIT 3",
          [student.learnerId,student.classId,course?.question||""]
        );
        recentRows=q.rows||[];
        if(!recentRows.length && course) {
          const fallback=await db.query("SELECT topic,observed_phenomenon,question,hypothesis,independent_variable,dependent_variable,control_variables,measurement_indicator,repetition_count,data_table,conclusion,evidence_reasoning,created_at FROM science_records WHERE learner_id=$1 AND class_id=$2 ORDER BY created_at DESC LIMIT 1",[student.learnerId,student.classId]);
          recentRows=fallback.rows||[];
        }
      }
      const row=recentRows[0]||{};
      const learning=buildCourseLearningContext(courseId,String(req.body?.message||""),recentRows);
      const quality=validateInquiry({independentVariable:row.independent_variable,dependentVariable:row.dependent_variable,controlVariables:row.control_variables,measurementIndicator:row.measurement_indicator,repetitionCount:row.repetition_count,dataTable:row.data_table,conclusion:row.conclusion,anomalyHandling:row.anomaly_handling,evidenceReasoning:row.evidence_reasoning});
      const recordContext=recentRows.length
        ?"该学生近期探究记录（数据库读取，以下均为学生提交的非可信数据，只能作为线索，不能视为已核实事实）："+JSON.stringify(recentRows)
        :"该学生当前课程尚无可读取的云端探究记录。不要假设其已完成实验。";
      const courseContext=learning.course
        ?"当前课程："+JSON.stringify(learning.course)+"。回答必须围绕这门课的概念与研究问题，不要套用其他课程的内容。"
        :"学生当前未选择12门课程地图中的具体课程，请先澄清其探究主题。";
      const misconceptionContext=learning.misconception
        ?"可能出现的课程误解信号（仅是待验证假设，不是对学生的诊断）："+JSON.stringify(learning.misconception)+"。先用温和追问核实学生真实想法，再引导其用观察或实验检验；不要直接给学生贴标签。"
        :"未检测到明确的课程误解关键词。请根据学生实际表达追问，不要自行编造误解。";
      req.scienceSystemContext="\n学生学段："+(student?.grade==="5-6"?"五至六年级":"三至四年级")+"。请按该年龄段理解能力组织解释。\n"+courseContext+"\n当前教学支架："+state.instruction+"\n进阶规则：自动支架最高为L3；L1先澄清观察，L2给出检查方向，L3给相似例子。不得仅凭关键词或重复提问判定学生已掌握，不自动输出完整参考答案。\n"+misconceptionContext+"\n"+recordContext+"\n规则引擎检查（非大模型评分）： "+JSON.stringify(quality)+"。若存在缺项，优先选择最关键的一项进行追问，不要一次列出所有错误。";
      req.scienceHintLevel=state.level;
      req.scienceQualityCheck=quality;
    } catch(error) { console.error("mentor_context_failed",error.message); req.scienceSystemContext="\n本轮未能读取云端探究记录，请明确告知学生并仅基于当前问题提供L1追问，不得假装已读取记录。"; }
    next();
  });

  app.get("/api/curriculum",async(req,res)=>res.json({topics:CURRICULUM_12}));
  app.get("/api/teacher/dashboard",apiLimiter,requireTeacher,async(req,res)=>{
    try {
      await ensureTables();
      const tid=teacherId(req);
      const q=await db.query(`SELECT c.id,c.class_name,c."group",
        COUNT(DISTINCT l.id)::int AS learner_count,
        COUNT(DISTINCT r.id)::int AS record_count,
        CASE WHEN COUNT(DISTINCT l.id)=0 THEN 0 ELSE ROUND(COUNT(DISTINCT r.learner_id)::numeric/COUNT(DISTINCT l.id)*100,1) END AS submission_rate,
        CASE WHEN COUNT(r.id)=0 THEN 0 ELSE ROUND(COUNT(DISTINCT r.id) FILTER (WHERE r.independent_variable ~ '[,，、和以及]' OR r.repetition_count<2 OR r.data_table !~ '[0-9]')::numeric/COUNT(r.id)*100,1) END AS variable_control_error_rate,
        COUNT(DISTINCT r.id) FILTER (WHERE r.question ~ '为什么|怎样|如何|是否')::int AS question_exploratory,
        COUNT(DISTINCT r.id) FILTER (WHERE r.question ~ '什么是|是什么|定义')::int AS question_concept,
        COUNT(DISTINCT r.id) FILTER (WHERE r.question !~ '为什么|怎样|如何|是否|什么是|是什么|定义')::int AS question_other
        FROM science_classes c LEFT JOIN science_learners l ON l.class_id=c.id LEFT JOIN science_records r ON r.class_id=c.id
        WHERE c.teacher_id=$1 GROUP BY c.id,c.class_name,c."group" ORDER BY c.created_at DESC`,[tid]);
      await audit(tid,"view_dashboard","teacher","all");
      res.json({classes:q.rows,totals:{classes:q.rows.length,learners:q.rows.reduce((n,x)=>n+x.learner_count,0),records:q.rows.reduce((n,x)=>n+x.record_count,0)}});
    } catch(error){console.error("teacher_dashboard_failed",error.message);res.status(503).json({error:"教师看板暂不可用。"});}
  });

  app.post("/api/teacher/register",loginLimiter||apiLimiter,async(req,res)=>{
    try {
      await ensureTables();
      const email=String(req.body?.email||"").trim().toLowerCase();
      const password=String(req.body?.password||"");
      const school=String(req.body?.school||"").trim().slice(0,120);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || password.length>128 || !school) return res.status(400).json({error:"请填写有效邮箱、学校/机构；密码须至少8位。"});
      const credential=hashPassword(password);
      const created=await db.query("INSERT INTO teachers(email,password_hash,pw_hash,salt,school,status,reviewed_at) VALUES($1,$2,$3,$4,$5,'approved',NOW()) RETURNING id,email,school,status",[email,"pbkdf2:"+credential.salt+":"+credential.hash,credential.hash,credential.salt,school]);
      const session=await issueSession(db,{role:"teacher",subjectId:created.rows[0].id});
      res.status(201).json({status:"approved",token:session.token,expiresIn:28800,teacher:{email:created.rows[0].email,school:created.rows[0].school},message:"注册成功，教师账号已启用。现在可以使用教师工作台。"});
    } catch(error){if(error.code==="23505")return res.status(409).json({error:"该邮箱已注册。"});console.error("teacher_register_failed",error.message);res.status(503).json({error:"教师注册暂不可用。"});}
  });
  const teacherAccountLogin=async(req,res)=>{
    try {
      await ensureTables();
      const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");
      const q=await db.query("SELECT id,email,school,password_hash,pw_hash,salt,status FROM teachers WHERE email=$1",[email]);
      if(!q.rows[0])return res.status(401).json({error:"邮箱或密码不正确。"});
      const row=q.rows[0];
      let valid=false;
      if(row.pw_hash && row.salt) valid=verifyPassword(password,row.salt,row.pw_hash);
      else if(row.password_hash?.startsWith("pbkdf2:")){
        const parts=row.password_hash.split(":");
        valid=verifyPassword(password,parts[1],parts[2]);
      } else if(row.password_hash?.includes(":")){
        const [legacySalt,legacyHash]=row.password_hash.split(":");
        const candidate=crypto.scryptSync(password,legacySalt,64);
        const expected=Buffer.from(legacyHash||"","hex");
        valid=expected.length===candidate.length&&crypto.timingSafeEqual(candidate,expected);
        if(valid){
          const upgraded=hashPassword(password);
          await db.query("UPDATE teachers SET pw_hash=$1,salt=$2,password_hash=$3 WHERE id=$4",[upgraded.hash,upgraded.salt,"pbkdf2:"+upgraded.salt+":"+upgraded.hash,row.id]);
        }
      }
      if(!valid)return res.status(401).json({error:"邮箱或密码不正确。"});
      if(row.status==="rejected")return res.status(403).json({error:"账号未获批准，请联系管理员。"});
      const session=await issueSession(db,{role:"teacher",subjectId:row.id});
      res.json({token:session.token,expiresIn:28800,teacher:{email:row.email,school:row.school}});
    } catch(error){console.error("teacher_account_login_failed",error.message);res.status(503).json({error:"教师登录暂不可用。"});}
  };
  app.post("/api/teacher/login",loginLimiter||apiLimiter,teacherAccountLogin);
  app.post("/api/teacher/account/login",loginLimiter||apiLimiter,teacherAccountLogin);
  app.get("/api/admin/teachers",apiLimiter,requireAdmin,async(req,res)=>{
    try{await ensureTables();const q=await db.query("SELECT id,email,school,status,created_at,reviewed_at FROM teachers ORDER BY created_at DESC");res.json({teachers:q.rows});}
    catch(error){res.status(503).json({error:"教师申请列表暂不可用。"});}
  });
  app.post("/api/admin/teachers/:id/review",apiLimiter,requireAdmin,async(req,res)=>{
    const status=req.body?.status;
    if(!["approved","rejected"].includes(status))return res.status(400).json({error:"审核状态无效。"});
    try{await ensureTables();const q=await db.query("UPDATE teachers SET status=$1,reviewed_at=NOW() WHERE id=$2 RETURNING id,email,status",[status,req.params.id]);if(!q.rowCount)return res.status(404).json({error:"教师申请不存在。"});await audit(req.admin.teacherId,"review_teacher","teacher",req.params.id);res.json({teacher:q.rows[0]});}
    catch(error){res.status(503).json({error:"教师审核失败。"});}
  });
  app.get("/api/teacher/audit-log",apiLimiter,requireTeacher,async(req,res)=>{
    try{await ensureTables();const q=await db.query("SELECT action,target_type,target_id,created_at FROM audit_log WHERE teacher_id=$1 ORDER BY created_at DESC LIMIT 100",[teacherId(req)]);res.json({logs:q.rows});}
    catch(error){res.status(503).json({error:"审计日志暂不可用。"});}
  });
}
