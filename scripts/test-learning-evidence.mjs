import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLearningEvidenceReport, registerV510Routes } from "../upgrade-v510.js";
import { COURSE_ASSESSMENTS } from "../lib/course-assessments.js";
import { CURRICULUM_12 } from "../upgrade-v56.js";

const ui = readFileSync(new URL("../public/upgrade-v56-ui.js", import.meta.url), "utf8");
assert.match(ui, /learningEvidenceReportV510/);
assert.match(ui, /learning-evidence/);
assert.match(ui, /生成学习证据报告/);
const plant = COURSE_ASSESSMENTS["plant-water"];
const course = CURRICULUM_12.find(item => item.id === "plant-water");
const assessments = [
  { course_id:"plant-water",stage:"pre",learner_id:"l1",answers:[1,0,0],score:33 },
  { course_id:"plant-water",stage:"post",learner_id:"l1",answers:[0,1,2],score:100 },
  { course_id:"plant-water",stage:"pre",learner_id:"l2",answers:[0,1,0],score:67 },
  { course_id:"plant-water",stage:"post",learner_id:"l2",answers:[0,1,0],score:67 }
];
const records = [
  { learner_id:"l1",topic:course.question,question:"为什么叶片也会有水？",hypothesis:"水沿茎向上运输",method:"插入有色水",data_table:"时间/颜色",evidence:"切面变色",conclusion:"有色水沿茎移动",evidence_reasoning:"切面颜色支持推测" },
  { learner_id:"l2",topic:course.question,question:"水如何到达叶片？",hypothesis:"根吸收水分",method:"观察芹菜",data_table:"",evidence:"茎部颜色变化",conclusion:"水可能经茎运输",evidence_reasoning:"观察到颜色线索" },
  { learner_id:"l2",topic:"unmapped topic",question:"其他课程记录" }
];
const report = buildLearningEvidenceReport({ assessments, records });
const plantResult = report.results.find(item => item.courseId === "plant-water");
assert.equal(plantResult.paired.participants,2);
assert.equal(plantResult.paired.averagePre,50);
assert.equal(plantResult.paired.averagePost,83.5);
assert.equal(plantResult.paired.averageChange,33.5);
assert.equal(plantResult.pre.items[0].answered,2);
assert.equal(plantResult.pre.items[0].incorrect,1);
assert.equal(plantResult.pre.items[0].errorRate,50);
assert.equal(plantResult.post.items[0].incorrect,0);
assert.equal(plantResult.inquiry.records,2);
assert.equal(plantResult.inquiry.learners,2);
assert.equal(plantResult.inquiry.elements.length,6);
assert.equal(report.unmatchedRecordCount,1);
assert.match(report.note,/不作因果推断/);
assert.ok(plant.pre.length===3);

// Minimum-sample fixture: recommendations must be traceable to observed weak items/record fields.
const recommendationAssessments=[];
for(let i=0;i<5;i++){
  const preAnswers=plant.pre.map((q,index)=>index===0?(q[2]+1)%4:q[2]);
  const postAnswers=plant.post.map((q,index)=>index===1?(q[2]+1)%4:q[2]);
  recommendationAssessments.push(
    {course_id:"plant-water",stage:"pre",learner_id:"sample-"+i,answers:preAnswers,score:67},
    {course_id:"plant-water",stage:"post",learner_id:"sample-"+i,answers:postAnswers,score:67}
  );
}
const recommendationRecords=Array.from({length:5},(_,i)=>({
  learner_id:"sample-"+i,topic:course.question,
  question:"水从哪里进入植物？",hypothesis:"水从根进入",
  method:"有色水观察",data_table:"",evidence:"",
  conclusion:"水沿茎运输",evidence_reasoning:""
}));
const recommendationReport=buildLearningEvidenceReport({assessments:recommendationAssessments,records:recommendationRecords});
const recommendations=recommendationReport.results.find(item=>item.courseId==="plant-water").recommendations;
assert.ok(recommendations.some(item=>item.type==="pretest"&&item.evidence.includes("第1题")));
assert.ok(recommendations.some(item=>item.type==="posttest"&&item.evidence.includes("第2题")));
assert.ok(recommendations.some(item=>item.type==="inquiry"&&item.focus==="数据或观察证据"));
assert.ok(recommendations.every(item=>item.action&&item.evidence&&item.focus));
assert.match(ui,/下一轮教学改进建议/);

const routeMap = new Map();
const fakeApp = { get:(path,...handlers)=>routeMap.set("GET "+path,handlers) };
const fakeDb = { query: async sql => {
  if (String(sql).includes("SELECT id FROM science_classes")) return { rows:[{id:"123"}],rowCount:1 };
  if (String(sql).includes("FROM course_assessment_results")) return { rows:assessments,rowCount:assessments.length };
  if (String(sql).includes("FROM science_records")) return { rows:records,rowCount:records.length };
  return { rows:[],rowCount:0 };
}};
const pass=(req,res,next)=>next();
registerV510Routes({app:fakeApp,db:fakeDb,apiLimiter:pass,requireTeacher:pass,requireDatabase:pass,teacherId:()=>"teacher-1"});
const handlers=routeMap.get("GET /api/teacher/classes/:id/learning-evidence");
assert.ok(handlers);
const response={statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
let index=0;const req={params:{id:"123e4567-e89b-42d3-a456-426614174000"}};
const next=()=>{const handler=handlers[index++];return handler?handler(req,response,next):undefined;};
await next();
assert.equal(response.statusCode,200);
assert.equal(response.body.results.find(item=>item.courseId==="plant-water").paired.participants,2);
console.log("Learning evidence tests passed: paired pre/post cohort, item-level error analysis, inquiry evidence coverage, topic matching, and teacher authorization route.");
