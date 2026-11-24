import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { COURSE_ASSESSMENTS } from '../lib/course-assessments.js';
import { scoreCourseAssessment } from '../upgrade-v59.js';

const publicSource=readFileSync(new URL('../public/course-assessments-v1.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(publicSource,context);
const publicBank=context.window.COURSE_ASSESSMENTS_V1;
const expected=['plant-water','rainbow','magnet','shadow','sound','dissolve','plant-light','friction','浮沉','weather','sensor','filter'];
assert.deepEqual(Object.keys(COURSE_ASSESSMENTS),expected,'private bank must cover all 12 curriculum IDs');
assert.deepEqual(Object.keys(publicBank),expected,'public bank must cover all 12 curriculum IDs');
for(const id of expected){
  const item=COURSE_ASSESSMENTS[id],publicItem=publicBank[id];
  assert.ok(item.title,id+' title required');
  assert.equal(publicItem.title,item.title);
  for(const stage of ['pre','post']){
    assert.equal(item[stage].length,3,id+' '+stage+' must contain three questions');
    assert.equal(publicItem[stage].length,3);
    item[stage].forEach((q,index)=>{
      assert.equal(q.length,4,id+' '+stage+' private question must contain prompt, options, answer and rationale');
      assert.ok(q[0].trim().length>=8,id+' '+stage+' prompt too short');
      assert.equal(q[1].length,4,id+' '+stage+' question must have four options');
      assert.equal(new Set(q[1]).size,4,id+' '+stage+' options must be distinct');
      assert.ok(Number.isInteger(q[2])&&q[2]>=0&&q[2]<4,id+' '+stage+' answer index invalid');
      assert.ok(q[3].trim().length>=8,id+' '+stage+' rationale required');
      assert.deepEqual(Array.from(publicItem[stage][index]),q.slice(0,2),'public payload must contain only prompt and options');
      assert.equal(publicItem[stage][index].length,2,'answer key and rationale must not be public');
    });
  }
  assert.notDeepEqual(item.pre.map(q=>q[0]),item.post.map(q=>q[0]),id+' pre/post prompts must differ');
}
const scored=scoreCourseAssessment('plant-water','pre',COURSE_ASSESSMENTS['plant-water'].pre.map(q=>q[2]));
assert.deepEqual({correctCount:scored.correctCount,total:scored.total,score:scored.score},{correctCount:3,total:3,score:100});
assert.equal(scoreCourseAssessment('plant-water','pre',[0,0,0]).score,0);
assert.equal(scoreCourseAssessment('plant-water','pre',[0,1,2]).score,33);
assert.throws(()=>scoreCourseAssessment('plant-water','pre',[0,1]),/invalid_course_assessment_answers/);
assert.throws(()=>scoreCourseAssessment('plant-water','pre',[0,1,4]),/invalid_course_assessment_answers/);
assert.throws(()=>scoreCourseAssessment('unknown','pre',[0,1,2]),/invalid_course_assessment_answers/);

const ui=readFileSync(new URL('../public/upgrade-v56-ui.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const routes=readFileSync(new URL('../upgrade-v59.js',import.meta.url),'utf8');
assert.match(ui,/function addCourseAssessmentBankUI/);
assert.match(ui,/function addStudentCourseAssessmentUI/);
assert.match(ui,/api\/teacher\/course-assessments/);
assert.match(ui,/api\/student\/course-assessments/);
assert.match(ui,/班级课程测评汇总/);
assert.match(routes,/app\.get\("\/api\/student\/course-assessments\/mine"/);
assert.match(routes,/app\.post\("\/api\/student\/course-assessments\/:courseId"/);
assert.match(routes,/app\.get\("\/api\/teacher\/classes\/:id\/course-assessments"/);
assert.match(routes,/app\.get\("\/api\/teacher\/course-assessments\/:courseId"/);
assert.match(server,/CREATE TABLE IF NOT EXISTS course_assessment_results/);
assert.ok(html.indexOf('course-assessments-v1.js')<html.indexOf('upgrade-v56-ui.js'),'student-safe assessment bank must load before UI');
console.log('Course assessments passed: 12 course banks, private answer keys, server-side scoring, anonymous persistence, and teacher aggregate report contracts.');
