import assert from 'node:assert/strict';
import { CURRICULUM_12, buildCourseLearningContext, detectCourseMisconception, nextHintState } from '../upgrade-v56.js';

const magnet = detectCourseMisconception('magnet', '我觉得所有金属都能被磁铁吸住。');
assert.equal(magnet?.id, 'all-metals');
assert.match(magnet.prompt, /铁、铝、铜/);

const rainbow = detectCourseMisconception('rainbow', '彩虹是云本身的颜色。');
assert.equal(rainbow?.id, 'cloud-color');

const plant = detectCourseMisconception('plant-water', '我认为叶子直接吸水。');
assert.equal(plant?.id, 'leaf-absorption');

assert.equal(detectCourseMisconception('magnet', '我想比较铁片和纸片是否被磁铁吸引。'), null);

const courseContext = buildCourseLearningContext('magnet', '所有金属都能被磁铁吸住', [{
  topic: '哪些材料会被磁铁吸引？',
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

console.log('AI personalization regression passed: course-aware misconception signals, recent-record context, false-positive guard, and L3 scaffold ceiling.');
