import crypto from "node:crypto";

const PBKDF2_ITERATIONS=210000;
const KEY_LENGTH=32;
const DIGEST="sha256";
const TEACHER_TTL_MS=8*60*60*1000;
const STUDENT_TTL_MS=24*60*60*1000;

export function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")) {
  const hash=crypto.pbkdf2Sync(String(password),salt,PBKDF2_ITERATIONS,KEY_LENGTH,DIGEST).toString("hex");
  return {salt,hash,iterations:PBKDF2_ITERATIONS};
}
export function verifyPassword(password,salt,expectedHash) {
  if(!salt||!expectedHash)return false;
  const actual=crypto.pbkdf2Sync(String(password),String(salt),PBKDF2_ITERATIONS,KEY_LENGTH,DIGEST);
  let expected;
  try{expected=Buffer.from(String(expectedHash),"hex");}catch{return false;}
  return expected.length===actual.length&&crypto.timingSafeEqual(actual,expected);
}
export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}
export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
export function sessionExpiry(role,now=Date.now()) {
  const ttl=role==="teacher"?TEACHER_TTL_MS:STUDENT_TTL_MS;
  return new Date(now+ttl);
}
export async function issueSession(db,{role,subjectId}) {
  if(!["teacher","student","admin"].includes(role))throw new Error("invalid_session_role");
  const token=createSessionToken();
  const expiresAt=sessionExpiry(role);
  await db.query("INSERT INTO sessions(token_hash,role,subject_id,expires_at) VALUES($1,$2,$3,$4)",[hashSessionToken(token),role,String(subjectId),expiresAt]);
  return {token,expiresAt};
}
export async function readSession(db,token) {
  if(!token)return null;
  const q=await db.query("SELECT role,subject_id,expires_at FROM sessions WHERE token_hash=$1 AND expires_at>NOW() LIMIT 1",[hashSessionToken(token)]);
  if(!q.rowCount)return null;
  return {role:q.rows[0].role,subjectId:q.rows[0].subject_id,expiresAt:q.rows[0].expires_at};
}
export function requireRole(role) {
  return async function(req,res,next) {
    try{
      const token=(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");
      const session=await readSession(req.app.locals.db,token);
      if(!session||session.role!==role)return res.status(401).json({error:"身份验证已失效，请重新登录。"});
      req.auth=session;next();
    }catch(error){next(error);}
  };
}
