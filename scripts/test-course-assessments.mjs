import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/course-assessments-v1.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(source,context);
const bank=context.window.COURSE_ASSESSMENTS_V1;
const expected=['plant-water','rainbow','magnet','shadow','sound','dissolve','plant-light','friction','浮沉','weather','sensor','filter'];
assert.deepEqual(Object.keys(bank),expected,'assessment bank must cover all 12 curriculum IDs');
for(const id of expected){
  const item=bank[id];
  assert.ok(item.title,id+' title required');
  for(const stage of ['pre','post']){
    assert.equal(item[stage].length,3,id+' '+stage+' must contain three questions');
    item[stage].forEach((q,index)=>{
      assert.equal(q.length,4,id+' '+stage+' question '+index+' must contain prompt, options, answer and rationale');
      assert.ok(q[0].trim().length>=8,id+' '+stage+' question prompt too short');
      assert.equal(q[1].length,4,id+' '+stage+' question must have four options');
      assert.ok(new Set(q[1]).size===4,id+' '+stage+' options must be distinct');
      assert.ok(Number.isInteger(q[2])&&q[2]>=0&&q[2]<4,id+' '+stage+' answer index invalid');
      assert.ok(q[3].trim().length>=8,id+' '+stage+' rationale required');
    });
  }
  assert.notDeepEqual(item.pre.map(q=>q[0]),item.post.map(q=>q[0]),id+' pre/post prompts must differ');
}
const ui=readFileSync(new URL('../public/upgrade-v56-ui.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert.match(ui,/function addCourseAssessmentBankUI/);
assert.match(ui,/导出学生试卷 HTML/);
assert.match(ui,/导出教师答案 HTML/);
assert.ok(html.indexOf('course-assessments-v1.js')<html.indexOf('upgrade-v56-ui.js'),'assessment bank must load before teacher UI');
console.log('Course assessment bank passed: 12 courses × 3 pre-test + 3 post-test questions, answer keys, rationales, and separated exports.');
