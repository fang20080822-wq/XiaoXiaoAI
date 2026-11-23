import crypto from "node:crypto";

const PII_PATTERNS = [
  /(?:^|\\D)(?:\\+?86[- ]?)?1[3-9]\\d{9}(?:$|\\D)/,
  /(?:^|\\D)\\d{17}[\\dXx](?:$|\\D)/,
  /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i,
  /(?:微信|QQ号?|身份证|家庭住址|详细地址|银行卡号|我的学号|住在.{0,12}(?:路|街|号|小区))/i
];
export function containsPII(value) {
  const text=String(value??"");
  return PII_PATTERNS.some(pattern=>pattern.test(text));
}
export function validateAlias(value) {
  const alias=String(value??"").trim();
  if(alias.length<1||alias.length>12) return {valid:false,error:"匿名代号须为1—12个字符。"};
  if(containsPII(alias)||/(学校|年级|班级|小学|中学|学院)/i.test(alias)) return {valid:false,error:"请使用不含个人或学校信息的匿名代号。"};
  return {valid:true,alias};
}
export function parseDataTable(value) {
  const rows=String(value??"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
  const parsed=rows.map((line,index)=>{
    const parts=line.split(/[|｜]/).map(x=>x.trim());
    const numeric=parts.length>=4?Number(parts[2]):NaN;
    return {index:index+1,valid:parts.length>=4&&!!parts[0]&&!!parts[1]&&Number.isFinite(numeric)&&!!parts[3],parts};
  });
  return {rows:parsed,valid:parsed.length>=2&&parsed.every(x=>x.valid)};
}
export function scoreRecord(record={}) {
  const fields=[
    ["question",["question","observedPhenomenon","questionBoundary","measurementIndicator"]],
    ["hypothesis",["hypothesis","hypothesisBasis","expectedResult"]],
    ["design",["independentVariable","dependentVariable","controlVariables","controlRationale","method"]],
    ["evidence",["dataTable","evidence","anomalyHandling"]],
    ["reasoning",["evidenceReasoning","conclusion","reflection"]]
  ];
  const dims={};
  let total=0,filled=0,all=0;
  for(const [name,keys] of fields){
    all+=keys.length;
    const count=keys.filter(k=>String(record[k]??"").trim()).length;
    filled+=count;
    const score=Math.round(count/keys.length*4);
    dims[name]={score,max:4,complete:count===keys.length};
    total+=score;
  }
  const table=parseDataTable(record.dataTable);
  const evidence_ok=table.valid;
  if(!evidence_ok)dims.evidence.score=Math.min(dims.evidence.score,1);
  const level=total>=18&&evidence_ok?4:total>=14?3:total>=9?2:1;
  const next_steps=[];
  for(const [name,keys] of fields) {
    const missing=keys.filter(k=>!String(record[k]??"").trim());
    if(missing.length) next_steps.push({dimension:name,missing});
  }
  if(!evidence_ok)next_steps.push({dimension:"evidence",suggestion:"按“第几次|时间|数值|单位”补充至少两条真实测量记录"});
  return {level,dims,next_steps,completeness:Math.round(filled/all*100),evidence_ok};
}
export function offlineAnswer(message) {
  const q=String(message??"");
  if(/爆炸|燃烧|点燃|强酸|强碱|电击|触电|毒|吞服|高压|自制武器/i.test(q))
    return "这个实验可能有危险，先不要尝试。请把问题告诉老师，改用安全的观察、图片或模拟活动来研究。";
  if(/植物|吸水|叶片/i.test(q)) return "可以先观察植物茎或叶片的变化。一次只改变一个条件，并在老师指导下记录结果。";
  if(/磁铁|磁性/i.test(q)) return "可以用磁铁靠近不同的安全材料，记录哪些会被吸引。不要靠近电子设备或医疗植入物。";
  return "我们先把问题说清楚：你观察到了什么？想改变哪个条件？准备记录什么结果？";
}
export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
