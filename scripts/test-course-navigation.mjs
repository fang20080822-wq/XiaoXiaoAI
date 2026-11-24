import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const curriculumSource = readFileSync(new URL('../upgrade-v56.js', import.meta.url), 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'main inline application script must exist');

const dataStart = inline.indexOf('const courseLearningContent={');
const dataEnd = inline.indexOf('};\nfunction renderCourseLearning', dataStart);
assert.ok(dataStart >= 0 && dataEnd > dataStart, 'course-specific learning content must be present');
const dataCode = inline.slice(dataStart, dataEnd + 1);

const fnStart = inline.indexOf('function selectTopic(t,courseId,curriculumTopic){');
const fnEnd = inline.indexOf('window.selectTopic=selectTopic;', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'course navigation handler must be present');
const fnCode = inline.slice(fnStart, fnEnd + 'window.selectTopic=selectTopic;'.length);

const curriculumStart = curriculumSource.indexOf('export const CURRICULUM_12 = [');
const curriculumEnd = curriculumSource.indexOf('];', curriculumStart);
assert.ok(curriculumStart >= 0 && curriculumEnd > curriculumStart, '12-topic curriculum must be present');
const curriculumCode = curriculumSource.slice(curriculumStart, curriculumEnd + 2)
  .replace('export const CURRICULUM_12 =', 'const CURRICULUM_12 =') + '\nthis.CURRICULUM_12 = CURRICULUM_12;';

const storage = new Map();
const topicInput = { value: '' };
const cards = ['plant','rainbow','magnet'].map(id => ({
  dataset: { course: id },
  classList: { toggle() {} }
}));
let activeTab = '';
const context = {
  console,
  window: {},
  localStorage: { setItem: (key, value) => storage.set(key, value) },
  document: { querySelectorAll: selector => selector === '.course[data-course]' ? cards : [] },
  $: id => id === 'topic' ? topicInput : null,
  tab: id => { activeTab = id; },
  renderCourseLearning: id => Boolean(context.courseLearningContent?.[id])
};
vm.createContext(context);
vm.runInContext(dataCode + '\nthis.courseLearningContent=courseLearningContent;', context);
vm.runInContext(curriculumCode, context);
vm.runInContext(fnCode, context);

const staticIds = ['plant','rainbow','magnet'];
const expectedTitles = ['植物怎样喝水','彩虹如何形成','磁铁的秘密'];
for (let i = 0; i < 3; i++) {
  assert.ok(html.includes('data-course="' + staticIds[i] + '"'), 'static course card missing: ' + staticIds[i]);
  assert.ok(html.includes("selectTopic(") && html.includes("'" + staticIds[i] + "')"), 'static course button must pass its own course ID: ' + staticIds[i]);
  context.selectTopic(expectedTitles[i], staticIds[i]);
  assert.equal(activeTab, 'lab', expectedTitles[i] + ' must open the inquiry workspace');
  assert.equal(topicInput.value, expectedTitles[i]);
  assert.equal(storage.get('scienceSelectedCourse'), staticIds[i]);
}

for (const topic of context.CURRICULUM_12.slice(3)) {
  activeTab = '';
  context.selectTopic(topic.question, topic.id, topic);
  assert.equal(activeTab, 'lab', topic.title + ' must open the inquiry workspace');
  assert.equal(topicInput.value, topic.question);
  assert.equal(storage.get('scienceSelectedCourse'), topic.id);
  assert.ok(context.courseLearningContent[topic.id], topic.title + ' must receive course-specific learning content');
  assert.ok(context.courseLearningContent[topic.id].objectives.length >= 3, topic.title + ' must have learning objectives');
  assert.ok(context.courseLearningContent[topic.id].misconceptions.length >= 2, topic.title + ' must have misconception prompts');
}

assert.equal(context.CURRICULUM_12.length, 12, 'the curriculum regression suite must cover all 12 topics');
console.log('Course navigation regression passed: 3 featured courses + 9 curriculum-map courses enter the inquiry workspace and receive topic-specific learning content.');
