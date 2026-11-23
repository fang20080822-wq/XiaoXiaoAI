import assert from "node:assert/strict";
import { CURRICULUM_12, nextHintState, validateInquiry, scoreInquiryRecord } from "../upgrade-v56.js";

assert.equal(CURRICULUM_12.length,12,"exactly 12 curriculum topics must be mapped");
assert.ok(CURRICULUM_12.every(x=>x.title&&x.grade&&x.concept&&x.domain),"each topic needs a grade band, core concept and domain");

let repeat=nextHintState({level:1,streak:0,last_prompt:"天空为什么是蓝色的"},"天空为什么是蓝色的？");
assert.equal(repeat.level,2,"a repeated question should advance from L1 to L2 without revealing the answer");
repeat=nextHintState({level:repeat.level,streak:repeat.streak,last_prompt:repeat.last_prompt},"天空为什么是蓝色的？");
assert.equal(repeat.level,3,"a third consecutive identical question should progressively advance to L3");
repeat=nextHintState({level:repeat.level,streak:repeat.streak,last_prompt:repeat.last_prompt},"天空为什么是蓝色的？");
assert.equal(repeat.level,3,"repeated questions must never automatically unlock L4");

let state=nextHintState({level:1,streak:0},"直接告诉我答案");
assert.equal(state.level,2,"first repeated answer request should move from L1 to L2");
state=nextHintState(state,"答案是什么？");
assert.equal(state.level,3,"second repeated answer request should move from L2 to L3");
state=nextHintState(state,"帮我写完答案");
assert.equal(state.level,3,"repeated answer requests must not reveal L4");
state=nextHintState({level:1,streak:0},"我发现自变量应该是光照时长，因为这样才能比较不同光照条件对植物的影响");
assert.equal(state.level,1,"one self-correction round must not promote the learner");
state=nextHintState(state,"我改成每次只改变光照时长，其他条件保持相同");
assert.equal(state.level,2,"two consecutive self-correction rounds should promote one level");
state=nextHintState({level:1,streak:0},"自变量是光照时长，因变量是株高，控制变量是水量和土壤");
assert.equal(state.level,2,"independently giving a correct direction should promote one level");

const complete={
 independentVariable:"光照时长",dependentVariable:"植物株高",controlVariables:"水量、土壤、植物种类",
 measurementIndicator:"株高，单位cm",dataTable:"第1次|10:00|12|cm\n第2次|10:05|13|cm",
 repetitionCount:2,anomalyHandling:"两次数据接近，未发现明显异常值",
 evidenceReasoning:"两次测量结果显示第二次株高略高，仍需更长时间观察",
 conclusion:"在本次观察范围内，光照时长可能与株高变化有关"
};
assert.equal(validateInquiry(complete).valid,true,"complete measurable evidence should pass the deterministic checklist");
const incomplete=validateInquiry({independentVariable:"光照和水量",dataTable:"很好玩"});
assert.ok(incomplete.issues.some(x=>x.code==="multiple_independent"),"multiple independent variables must be flagged");
assert.ok(incomplete.issues.some(x=>x.code==="insufficient_data"),"unmeasurable text must not pass evidence validation");
console.log("V5.6 unit tests passed: scaffold progression, L4 gate, curriculum completeness and deterministic inquiry validation.");

const partial=scoreInquiryRecord({topic:"植物喝水",question:"植物怎样吸水？",repetitionCount:0});
assert.equal(partial.level_int,1,"a minimal inquiry should be accepted at L1");
assert.ok(partial.completeness<20,"partial record completeness should remain low");
const developed=scoreInquiryRecord({topic:"植物喝水",question:"不同光照下植物吸水速度是否不同？",questionBoundary:"比较两种光照条件",measurementIndicator:"水位变化厘米",observedPhenomenon:"叶片出现萎蔫",hypothesis:"光照较强吸水较快",hypothesisBasis:"观察到蒸腾差异",expectedResult:"水位下降更多",independentVariable:"光照强度",dependentVariable:"水位下降",controlVariables:"植物种类和初始水量",controlRationale:"保持其他条件相同",repetitionCount:3,dataTable:"第1次｜09:00｜2｜cm\\n第2次｜10:00｜3｜cm\\n第3次｜11:00｜4｜cm",anomalyHandling:"检查异常测量",conclusion:"强光下水位下降较多",evidenceReasoning:"三次数据支持趋势",reflection:"样本数量仍有限"});
assert.equal(developed.level_int,4,"complete evidence-backed inquiry should reach L4");
assert.equal(developed.evidence_ok,true,"at least two numeric unit-bearing measurements and repeats should be marked as evidence");
