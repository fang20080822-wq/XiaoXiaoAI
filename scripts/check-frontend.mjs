import { readFileSync } from 'node:fs';
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
if (html.includes('DEEPSEEK_API_KEY=')) throw new Error('Possible API key assignment found in public frontend');
console.log('V5 frontend syntax, six modules, API contracts, and frontend secret scan passed.');
