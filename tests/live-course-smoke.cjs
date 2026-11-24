const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const baseURL = process.env.BASE_URL || 'https://xiaoxiaai-scientist.onrender.com';
const featured = [
  { id: 'plant', title: '植物怎样喝水', question: '植物怎样吸收和运输水分？', video: '/videos/video1.mp4' },
  { id: 'rainbow', title: '彩虹如何形成', question: '彩虹是怎样形成的？', video: '/videos/video2.mp4' },
  { id: 'magnet', title: '磁铁的秘密', question: '哪些材料会被磁铁吸引？', video: '/videos/video3.mp4' }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.ok(response && response.ok(), 'production homepage must return HTTP 2xx');
    await page.waitForSelector('#nav button[data-tab="learn"]', { timeout: 30000 });

    const health = await page.request.get(baseURL + '/api/health');
    assert.ok(health.ok(), 'health endpoint must be reachable');
    const healthData = await health.json();
    assert.equal(healthData.ok, true, 'health endpoint must report ok=true');

    await page.locator('#nav button[data-tab="learn"]').click();
    for (const course of featured) {
      await page.locator('#nav button[data-tab="learn"]').click();
      const card = page.locator('.course[data-course="' + course.id + '"]');
      await card.locator('button').click();
      await page.waitForFunction(id => document.querySelector('#courseLearningPanel')?.dataset.courseId === id, course.id);
      assert.equal(await page.locator('#courseLearningTag').innerText(), course.title);
      assert.ok(await page.locator('#courseObjectives li').count() >= 3, course.title + ' must render learning objectives');
      assert.ok(await page.locator('#courseMisconceptions .course-misconception').count() >= 2, course.title + ' must render misconceptions');
      assert.equal(await page.locator('#topic').inputValue(), course.question);
      assert.ok(await page.locator('#lab').evaluate(el => el.classList.contains('active')), course.title + ' must open lab');
      await page.locator('#researchQuestion').fill('浏览器验收：' + course.title + '的研究问题');
      await page.locator('#hypothesis').fill('浏览器验收：我的可检验假设');
      await page.getByRole('button', { name: '保存本地草稿' }).click();
      await page.waitForFunction(() => document.querySelector('#saved')?.textContent.includes('已保存在本设备浏览器中'));
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('scienceLabs') || '[]')[0]);
      assert.equal(saved.topic, course.question);
      assert.equal(saved.researchQuestion, '浏览器验收：' + course.title + '的研究问题');
      assert.equal(saved.hypothesis, '浏览器验收：我的可检验假设');
      const record = page.locator('#savedList .unit').first();
      await record.getByRole('button', { name: '载入并继续' }).click();
      assert.equal(await page.locator('#researchQuestion').inputValue(), '浏览器验收：' + course.title + '的研究问题');
    }

    const curriculumResponse = await page.request.get(baseURL + '/api/curriculum');
    assert.ok(curriculumResponse.ok(), 'curriculum API must return HTTP 2xx');
    const curriculum = await curriculumResponse.json();
    assert.equal(curriculum.topics.length, 12, 'curriculum API must return all 12 topics');
    await page.locator('#nav button[data-tab="learn"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#curriculumMapV56 article').length === 9);
    const cards = page.locator('#curriculumMapV56 article');
    for (let i = 0; i < 9; i++) {
      await cards.nth(i).getByRole('button', { name: '开始探究' }).click();
      const topic = curriculum.topics[i + 3];
      await page.waitForFunction(id => document.querySelector('#courseLearningPanel')?.dataset.courseId === id, topic.id);
      assert.equal(await page.locator('#courseLearningTag').innerText(), topic.title);
      assert.equal(await page.locator('#topic').inputValue(), topic.question);
      assert.ok(await page.locator('#lab').evaluate(el => el.classList.contains('active')));
      await page.locator('#nav button[data-tab="learn"]').click();
    }

    for (const course of featured) {
      const video = await page.request.get(baseURL + course.video, { headers: { Range: 'bytes=0-0' } });
      assert.ok([200, 206].includes(video.status()), course.video + ' must be served successfully');
      assert.match(video.headers()['content-type'] || '', /video\/mp4/i, course.video + ' must have video/mp4 content type');
    }

    assert.deepEqual(pageErrors, [], 'production page must not emit uncaught JavaScript errors');
    console.log('LIVE BROWSER SMOKE PASSED: homepage, health, 3 featured course flows, 9 curriculum cards, 12 unique topic mappings, local save/reload, and 3 video assets.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
