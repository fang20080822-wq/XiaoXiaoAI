import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'main inline application script must exist');

function extract(start, end) {
  const a = inline.indexOf(start);
  const b = inline.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'missing workflow function: ' + start);
  return inline.slice(a, b);
}

const fields = [
  'topic','observedPhenomenon','researchQuestion','questionBoundary','measurementIndicator',
  'hypothesis','hypothesisBasis','expectedResult','independentVariable','dependentVariable',
  'controlVariables','controlRationale','repetitionCount','method','dataTable','evidence',
  'anomalyHandling','evidenceReasoning','conclusion','reflection'
];
const elements = Object.fromEntries(fields.map(id => [id, { value: id === 'repetitionCount' ? '3' : 'test ' + id }]));
elements.topic.value = '磁铁的秘密';
elements.researchQuestion.value = '哪些材料会被磁铁吸引？';
elements.hypothesis.value = '铁制品会被吸引';
elements.saved = { textContent: '' };
elements.progressText = { textContent: '' };
elements.cloudSaveStatus = { textContent: '' };

const storage = new Map();
let processEvents = 0;
let savedRenders = 0;
let progressUpdates = 0;
let cloudLoads = 0;
let cloudRequest = null;

const context = {
  console,
  $: id => elements[id] || (elements[id] = { value: '', textContent: '' }),
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value)
  },
  sendProcessEvent: async () => { processEvents++; },
  renderSaved: () => { savedRenders++; },
  updateProgress: () => { progressUpdates++; },
  studentToken: 'test-student-token',
  loadMyRecords: async () => { cloudLoads++; },
  fetch: async (url, options) => {
    cloudRequest = { url, options };
    return { ok: true, json: async () => ({ record: { id: 101 }, level: 2, next_steps: [] }) };
  }
};
vm.createContext(context);

const currentLab = extract('function currentLab(){', '\nfunction exportLab');
const getLabRecords = extract('function getLabRecords(){', '\nfunction saveLab');
const saveLab = extract('function saveLab(){', '\nfunction currentLab');
const submitCloudRecord = extract('async function submitCloudRecord(){', '\n\nlet teacherToken=null;');
vm.runInContext(currentLab + '\n' + getLabRecords + '\n' + saveLab + '\n' + submitCloudRecord, context);

context.saveLab();
const localRecords = JSON.parse(storage.get('scienceLabs') || '[]');
assert.equal(localRecords.length, 1, 'local draft must be persisted');
assert.equal(localRecords[0].topic, '磁铁的秘密');
assert.equal(localRecords[0].researchQuestion, '哪些材料会被磁铁吸引？');
assert.equal(localRecords[0].hypothesis, '铁制品会被吸引');
assert.equal(savedRenders, 1, 'saved-record list must refresh after local save');
assert.equal(progressUpdates, 1, 'learning progress must refresh after local save');

await context.submitCloudRecord();
assert.ok(cloudRequest, 'cloud submission must issue an API request');
assert.equal(cloudRequest.url, '/api/student/records');
assert.equal(cloudRequest.options.method, 'POST');
assert.equal(cloudRequest.options.headers.Authorization, 'Bearer test-student-token');
const payload = JSON.parse(cloudRequest.options.body);
assert.equal(payload.topic, '磁铁的秘密');
assert.equal(payload.question, '哪些材料会被磁铁吸引？');
assert.equal(payload.hypothesis, '铁制品会被吸引');
assert.equal(payload.dataTable, 'test dataTable');
assert.equal(payload.evidenceReasoning, 'test evidenceReasoning');
assert.equal(elements.cloudSaveStatus.textContent.startsWith('✓ 已提交'), true, 'successful cloud save must be confirmed to the learner');
assert.equal(cloudLoads, 1, 'cloud record list must refresh after submission');
assert.ok(processEvents >= 1, 'submission should emit a learning-process event');

console.log('Inquiry workflow regression passed: structured local draft save and authenticated cloud submission preserve the student inquiry fields.');
