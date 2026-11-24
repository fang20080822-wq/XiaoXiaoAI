import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/upgrade-v56-ui.js',import.meta.url),'utf8');
const start=source.indexOf('async function addTrialAssessmentUI(){');
const end=source.indexOf('\n  function addTeacherAccountUI(){',start);
assert.ok(start>=0&&end>start,'trial assessment UI function must exist');
const fn=source.slice(start,end);

const nodes={};
let downloaded=false;
class FakeNode{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.className='';this.style={};this.value='';this.options=[];this.selectedIndex=0;this.attributes={};}
  set id(value){this._id=value;nodes[value]=this;}
  get id(){return this._id;}
  append(...items){items.forEach(item=>this.appendChild(item));}
  appendChild(node){this.children.push(node);if(this.tagName==='select'&&node.tagName==='option')this.options.push(node);return node;}
  replaceChildren(...items){this.children=[];this.append(...items);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  click(){if(this.tagName==='a')downloaded=true;this.listeners.click?.();}
  setAttribute(name,value){this.attributes[name]=value;}
}
const panel=new FakeNode('section');panel.id='teacherPanel';
const storage=new Map();
const document={
  createElement:tag=>new FakeNode(tag),
  getElementById:id=>nodes[id]||null
};
const context={
  document,
  window:{},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  api:async()=>({topics:[{id:'plant-water',title:'植物怎样喝水'},{id:'rainbow',title:'彩虹如何形成'}]}),
  $:id=>nodes[id]||null,
  el:(tag,text,cls)=>{const node=new FakeNode(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;},
  Blob:class{constructor(parts,options){this.parts=parts;this.options=options;}},
  URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},
  Date,
  console
};
vm.createContext(context);
vm.runInContext(fn,context);
await context.addTrialAssessmentUI();
assert.ok(nodes.trialAssessmentV56,'trial tool must be mounted inside teacher workspace');
assert.ok(nodes.trialAssessmentV56.children.some(node=>node.textContent==='课程试教与学习效果记录'));

nodes.trialParticipantCode.value='S001';
nodes.trialCourse.value='plant-water';
nodes.preScore.value='';
nodes.postScore.value='80';
nodes.trialQuestionScore.value='2';
nodes.trialDataScore.value='2';
nodes.trialReasoningScore.value='3';
nodes.trialEngagementRating.value='4';
nodes.trialAiRating.value='4';
nodes.trialFeasibilityRating.value='5';
nodes.trialTeacherNote.value='';
nodes.trialAssessmentV56.children.find(n=>n.tagName==='div'&&n.className==='actions').children[0].click();
assert.match(nodes.trialAssessmentStatus.textContent,/前测和后测/);
assert.equal(storage.has('scienceTrialAssessmentsV1'),false,'blank scores must not be stored as zero');

nodes.preScore.value='60';
nodes.trialAssessmentV56.children.find(n=>n.tagName==='div'&&n.className==='actions').children[0].click();
let rows=JSON.parse(storage.get('scienceTrialAssessmentsV1'));
assert.equal(rows.length,1);
assert.equal(rows[0].participantCode,'S001');
assert.equal(rows[0].courseTitle,'植物怎样喝水');
assert.equal(rows[0].postScore-rows[0].preScore,20);
assert.equal(rows[0].questionScore+rows[0].dataScore+rows[0].reasoningScore,7);
assert.ok(nodes.trialCourseAnalytics,'course-level analytics panel must render');
const analyticsText=node=>[node.textContent,...(node.children||[]).map(analyticsText)].join(' ');
assert.match(analyticsText(nodes.trialCourseAnalytics),/植物怎样喝水/);
assert.match(analyticsText(nodes.trialCourseAnalytics),/有效前后测 1 人/);
assert.match(analyticsText(nodes.trialCourseAnalytics),/样本少于5人/);

nodes.trialTeacherNote.value='请联系我 13800138000';
nodes.trialAssessmentV56.children.find(n=>n.tagName==='div'&&n.className==='actions').children[0].click();
assert.match(nodes.trialAssessmentStatus.textContent,/疑似联系方式/);
assert.equal(JSON.parse(storage.get('scienceTrialAssessmentsV1')).length,1,'PII-like feedback must not be saved');

nodes.trialTeacherNote.value='学生能按步骤记录，建议增加一次变量控制示范。';
nodes.trialAssessmentV56.children.find(n=>n.tagName==='div'&&n.className==='actions').children[0].click();
rows=JSON.parse(storage.get('scienceTrialAssessmentsV1'));
assert.equal(rows.length,1,'same anonymous participant/course should update rather than duplicate');
assert.match(rows[0].teacherNote,/变量控制/);

const actions=nodes.trialAssessmentV56.children.find(n=>n.tagName==='div'&&n.className==='actions');
actions.children[1].click();
assert.equal(downloaded,true,'CSV export must create and click a download link');
console.log('Trial assessment regression passed: required score validation, anonymous local storage, duplicate update, PII guard, and CSV export action.');
