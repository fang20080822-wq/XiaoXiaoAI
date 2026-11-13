import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)];
if (scripts.length !== 1) throw new Error(`Expected one inline application script; found ${scripts.length}`);
new vm.Script(scripts[0][1], { filename: 'public/index.html:inline-script' });

for (const id of ['home', 'learn', 'assistant', 'lab', 'quiz', 'teacher']) {
  if (!html.includes(`id="${id}" class="panel"`)) throw new Error(`Missing application section: ${id}`);
}
for (const route of ['/api/health', '/api/chat', '/api/teacher/login', '/api/teacher/evaluate']) {
  if (!html.includes(route)) throw new Error(`Frontend no longer calls expected API route: ${route}`);
  if (!server.includes(route)) throw new Error(`Backend route missing: ${route}`);
}
if (/DEEPSEEK_API_KEY\\s*=/.test(html)) throw new Error('Possible API key assignment found in public frontend');
console.log('V5 frontend syntax, six modules, API contracts, and frontend secret scan passed.');
