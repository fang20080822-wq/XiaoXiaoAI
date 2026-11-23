import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const openTag = '<script>';
const closeTag = '</script>';
const start = html.indexOf(openTag);
const end = html.indexOf(closeTag, start + openTag.length);
if (start < 0 || end < 0 || html.indexOf(openTag, start + 1) >= 0) {
  throw new Error('Expected exactly one inline application script');
}
new vm.Script(html.slice(start + openTag.length, end), { filename: 'public/index.html:inline-script' });

for (const id of ['home', 'learn', 'assistant', 'lab', 'quiz', 'teacher']) {
  const sectionPattern = new RegExp('<section\\s+id="' + id + '"\\s+class="panel(?:\\s+active)?"');
  if (!sectionPattern.test(html)) throw new Error('Missing application section: ' + id);
}
for (const route of ['/api/health', '/api/chat', '/api/teacher/login', '/api/teacher/evaluate']) {
  if (!html.includes(route)) throw new Error('Frontend no longer calls expected API route: ' + route);
  if (!server.includes(route)) throw new Error('Backend route missing: ' + route);
}
if (!server.includes('contentSecurityPolicy:')) throw new Error('Content Security Policy is not configured');
if (!server.includes('MENTOR_MODES[mentorMode]')) throw new Error('Mentor mode must be selected and enforced by the server');
if (server.includes('app.get("*",(req,res)=>res.sendFile')) throw new Error('Unknown routes must not silently return the homepage');
if (!html.includes('mode:mentorMode')) throw new Error('Frontend must send the mentor mode identifier, not a client-built system prompt');
for (const route of ['/api/teacher/classes', '/api/student/join', '/api/student/records', '/api/teacher/classes/:id/records']) {
  if (!server.includes(route)) throw new Error('Classroom API route missing: ' + route);
}
for (const field of ['researchQuestion', 'independentVariable', 'dependentVariable', 'controlVariables', 'method', 'evidence', 'reflection']) {
  if (!html.includes('id="' + field + '"')) throw new Error('Structured inquiry field missing: ' + field);
}
if (!html.includes('function joinClass()') || !html.includes('function submitCloudRecord()') || !html.includes('function loadMyRecords()')) throw new Error('Student classroom workflow missing');
if (!html.includes('function createClass()') || !html.includes('function viewClassRecords(')) throw new Error('Teacher classroom workflow missing');
if (!server.includes('guardian_consent') || !server.includes('req.body?.guardianConsent!==true')) throw new Error('Guardian consent acknowledgement is not enforced');
if (!server.includes('DATABASE_URL') || !server.includes('science_records')) throw new Error('PostgreSQL learning record storage missing');
if (!html.includes('六维100分评审量规')) throw new Error('Judges scoring rubric missing');
if (html.includes('DEEPSEEK_API_KEY=')) throw new Error('Possible API key assignment found in public frontend');
console.log('V5 frontend syntax, six modules, API contracts, and frontend secret scan passed.');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (pkg.version !== '5.3.0') throw new Error('package version must match V5.3.0');
if (!server.includes('const APP_VERSION = "5.3.0"') || !server.includes('version:APP_VERSION')) throw new Error('Backend version and health version are inconsistent');
if (!html.includes('小小AI科学家 V5.3') || !html.includes('小小AI科学家 V5.3 ·')) throw new Error('Frontend version labels must match V5.3.0');
for (const file of ['public/videos/video1.mp4.mp4', 'public/videos/video2.mp4.mp4', 'public/videos/video3.mp4.mp4']) {
  if (!existsSync(new URL('../' + file, import.meta.url))) throw new Error('Course video asset missing: ' + file);
}
for (const route of ['/api/student/records', '/api/teacher/classes/:id/records', '/api/teacher/classes']) {
  if ((server.match(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) throw new Error('Expected exactly one backend route: ' + route);
}
if (!server.includes('connectionTimeoutMillis: 5000') || !server.includes('for(const statement of statements) await db.query(statement)')) throw new Error('Database initialization must be bounded and sequential');
if (!server.includes('await db.query("SELECT 1")') || !server.includes('database = "unavailable"')) throw new Error('Health check must probe database connectivity');
if (!server.includes('requireTeacher,requireDatabase,async(req,res)=>{')) throw new Error('Teacher class creation must retry database initialization');
console.log('V5.3 backend hardening, version consistency, database readiness, route uniqueness, and course media checks passed.');
