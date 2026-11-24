import assert from 'node:assert/strict';
import { CURRICULUM_12, buildCourseLearningContext, detectCourseMisconception, nextHintState, registerV56Routes } from '../upgrade-v56.js';

const magnet = detectCourseMisconception('magnet', '我觉得所有金属都能被磁铁吸住。');
assert.equal(magnet?.id, 'all-metals');
assert.match(magnet.prompt, /铁、铝、铜/);

const rainbow = detectCourseMisconception('rainbow', '彩虹是云本身的颜色。');
assert.equal(rainbow?.id, 'cloud-color');

const plant = detectCourseMisconception('plant-water', '我认为叶子直接吸水。');
assert.equal(plant?.id, 'leaf-absorption');

assert.equal(detectCourseMisconception('magnet', '我想比较铁片和纸片是否被磁铁吸引。'), null);

const courseContext = buildCourseLearningContext('magnet', '所有金属都能被磁铁吸住', [{
  topic: '不同材料与距离怎样影响磁铁吸引效果？',
  hypothesis: '所有金属都会被吸引',
  data_table: '铁片 3次；铝片 0次'
}]);
assert.equal(courseContext.course.title, '磁铁的秘密');
assert.equal(courseContext.course.id, 'magnet');
assert.equal(courseContext.misconception.id, 'all-metals');
assert.equal(courseContext.records.length, 1);
assert.equal(buildCourseLearningContext('not-a-course').course, null);
assert.equal(CURRICULUM_12.length, 12);

const escalated = nextHintState({level: 3, streak: 0}, '我能控制变量并重复测量三次，因为这样更公平');
assert.equal(escalated.level, 3, 'automatic scaffolding must not jump to full answer level');
const legacyLevelFour = nextHintState({level: 4, streak: 0}, '我发现数据还不够');
assert.equal(legacyLevelFour.level, 3, 'legacy level-four state must be safely capped');
const selfCorrection = nextHintState({level: 2, streak: 1}, '我发现我改成只改变一种材料，因为这样更公平');
assert.equal(selfCorrection.level, 3);



const sqlCalls = [];
let chatMiddleware;
const record = {
  topic: '哪些材料会被磁铁吸引？',
  observed_phenomenon: '铁片靠近磁铁后移动',
  question: '不同材料与距离怎样影响磁铁吸引效果？',
  hypothesis: '所有金属都会被吸引',
  independent_variable: '材料种类',
  dependent_variable: '是否被吸引',
  control_variables: '同一磁铁、相同距离',
  measurement_indicator: '是否吸引，次数',
  repetition_count: 3,
  data_table: '铁片|吸引|3次\n铝片|不吸引|3次',
  conclusion: '目前测试的铁片被吸引',
  evidence_reasoning: '三次测试结果一致'
};
const fakeDb = {
  async query(sql, params=[]) {
    sqlCalls.push({sql,params});
    if (sql.includes('SELECT level,streak,last_prompt FROM mentor_progress')) return {rows:[]};
    if (sql.includes('FROM science_records')) return {rows:[record]};
    return {rows:[],rowCount:1};
  }
};
const fakeApp = {
  use(path, handler) { if (path === '/api/chat') chatMiddleware = handler; },
  get() {},
  post() {}
};
registerV56Routes({
  app:fakeApp,db:fakeDb,apiLimiter:()=>{},loginLimiter:()=>{},requireTeacher:()=>{},
  teacherId:()=> 'teacher-1',ADMIN_PASSWORD:'',TOKEN_SECRET:'test',
  signToken:()=>'',verifyToken:()=>({}),looksLikePII:()=>false,
  resolveStudentSession:async()=>({role:'student',learnerId:'learner-1',classId:'class-1',grade:'3-4'}),
  initDatabase:async()=>{}
});
assert.equal(typeof chatMiddleware,'function','chat middleware must be registered');
let nextCalled=false;
const req={
  method:'POST',
  headers:{authorization:'Bearer test-student-token'},
  body:{sessionId:'123e4567-e89b-42d3-a456-426614174000',message:'我认为所有金属都能被磁铁吸住',courseId:'magnet'}
};
const res={status(){return this;},json(payload){throw new Error('middleware unexpectedly returned an error: '+JSON.stringify(payload));}};
await chatMiddleware(req,res,()=>{nextCalled=true;});
assert.equal(nextCalled,true);
assert.match(req.scienceSystemContext,/磁铁的秘密/);
assert.match(req.scienceSystemContext,/所有金属/);
assert.match(req.scienceSystemContext,/非可信数据/);
assert.match(req.scienceSystemContext,/可能把“金属”误认为都具有相同的磁性/);
assert.ok(sqlCalls.some(call=>call.sql.includes("topic=$3 OR question=$3") && call.params[2]==='不同材料与距离怎样影响磁铁吸引效果？'), 'database query must be scoped to the selected course');
assert.equal(req.scienceHintLevel<=3,true,'automatic hint level must remain at or below L3');

console.log('AI personalization regression passed: course-aware misconception signals, recent-record context, false-positive guard, and L3 scaffold ceiling.');
