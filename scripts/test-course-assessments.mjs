import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { COURSE_ASSESSMENTS } from '../lib/course-assessments.js';
import { scoreCourseAssessment, registerV59Routes } from '../upgrade-v59.js';

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
      assert.equal(JSON.stringify(publicItem[stage][index]),JSON.stringify(q.slice(0,2)),'public payload must contain only prompt and options');
      assert.equal(publicItem[stage][index].length,2,'answer key and rationale must not be public');
    });
  }
  assert.notDeepEqual(item.pre.map(q=>q[0]),item.post.map(q=>q[0]),id+' pre/post prompts must differ');
}
const scored=scoreCourseAssessment('plant-water','pre',COURSE_ASSESSMENTS['plant-water'].pre.map(q=>q[2]));
assert.deepEqual({correctCount:scored.correctCount,total:scored.total,score:scored.score},{correctCount:3,total:3,score:100});
const correct=COURSE_ASSESSMENTS['plant-water'].pre.map(q=>q[2]);
const wrong=correct.map(value=>(value+1)%4);
assert.equal(scoreCourseAssessment('plant-water','pre',wrong).score,0);
assert.equal(scoreCourseAssessment('plant-water','pre',[correct[0],wrong[1],wrong[2]]).score,33);
assert.equal(scoreCourseAssessment('plant-water','pre',[correct[0],correct[1],wrong[2]]).score,67);
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

const routeMap=new Map();
const fakeApp={get:(path,...handlers)=>routeMap.set('GET '+path,handlers),post:(path,...handlers)=>routeMap.set('POST '+path,handlers)};
const queryCalls=[];
const fakeDb={query:async(sql,params=[])=>{
  queryCalls.push({sql:String(sql),params});
  if(String(sql).includes('INSERT INTO course_assessment_results'))return {rows:[{score:67,correct_count:2,total:3,updated_at:'2026-11-25T00:00:00Z'}],rowCount:1};
  if(String(sql).includes('SELECT id FROM science_classes'))return {rows:[{id:'class-1'}],rowCount:1};
  if(String(sql).includes('FROM course_assessment_results WHERE class_id'))return {rows:[{course_id:'plant-water',stage:'pre',participant_count:4,average_score:'66.8',highest_score:100,lowest_score:33}],rowCount:1};
  return {rows:[],rowCount:0};
}};
const pass=(req,res,next)=>next();
const studentAuth=(req,res,next)=>{req.student={learnerId:'learner-1',classId:'class-1'};return next();};
registerV59Routes({app:fakeApp,db:fakeDb,apiLimiter:pass,requireTeacher:pass,requireStudent:studentAuth,teacherId:()=> 'teacher-1',requireDatabase:pass});
async function callRoute(method,path,req={}){
  const handlers=routeMap.get(method+' '+path);assert.ok(handlers,method+' '+path+' must be registered');
  const res={statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
  let index=0;const next=()=>{const handler=handlers[index++];return handler?handler(req,res,next):undefined;};
  await next();return res;
}
const studentQuestionResponse=await callRoute('GET','/api/student/course-assessments/:courseId',{params:{courseId:'plant-water'},query:{stage:'pre'}});
assert.equal(studentQuestionResponse.statusCode,200);
assert.equal(studentQuestionResponse.body.questions.length,3);
assert.equal('correctIndex' in studentQuestionResponse.body.questions[0],false,'student question endpoint must not expose answer index');
assert.equal('rationale' in studentQuestionResponse.body.questions[0],false,'student question endpoint must not expose rationale');
const answers=[correct[0],correct[1],wrong[2]];
const submitResponse=await callRoute('POST','/api/student/course-assessments/:courseId',{params:{courseId:'plant-water'},body:{stage:'pre',answers}});
assert.equal(submitResponse.body.score,67);
assert.equal(submitResponse.body.correctCount,2);
assert.ok(queryCalls.some(call=>call.sql.includes('ON CONFLICT(learner_id,course_id,stage) DO UPDATE')),'re-submission must update the latest student/course/stage result');
const teacherAnswers=await callRoute('GET','/api/teacher/course-assessments/:courseId',{params:{courseId:'plant-water'},query:{stage:'pre'}});
assert.equal(teacherAnswers.body.questions[0].correctIndex,COURSE_ASSESSMENTS['plant-water'].pre[0][2]);
const teacherSummary=await callRoute('GET','/api/teacher/classes/:id/course-assessments',{params:{id:'class-1'}});
assert.equal(teacherSummary.body.results[0].participant_count,4);
assert.equal(teacherSummary.body.results[0].average_score,66.8);

console.log('Course assessments passed: 12 course banks, private answer keys, server-side scoring, anonymous persistence, and teacher aggregate report contracts.');
