import assert from "node:assert/strict";
import { scoreSurvey, csvEscape } from "../upgrade-v59.js";

const answers=[1,2,3,4,5,1,2,3,4,5,1,2,3,4,5,1,2,3,4,5];
const result=scoreSurvey(answers);
assert.equal(result.total,2.6);
assert.deepEqual(result.dims,{d1:2.5,d2:1.75,d3:2.5,d4:2.75,d5:3.5});
assert.throws(()=>scoreSurvey(answers.slice(1)),/answers_must/);
assert.throws(()=>scoreSurvey([...answers,6]),/answers_must/);
assert.throws(()=>scoreSurvey(answers.map((v,i)=>i===0?0:v)),/answers_must/);
assert.equal(csvEscape('a,"b"'),'"a,""b"""');
assert.equal(csvEscape('first\nsecond'),'first second');
console.log("V5.9 unit tests passed: 20-item scoring, reverse items, validation, RFC4180 escaping.");
