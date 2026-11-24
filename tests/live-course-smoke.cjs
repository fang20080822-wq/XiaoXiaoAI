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

    await page.waitForFunction(() => !!document.getElementById('trialAssessmentV56'), null, { timeout: 30000 });
    const trialToolText=await page.locator('#trialAssessmentV56').evaluate(el=>el.textContent);
    assert.match(trialToolText,/课程试教与学习效果记录/,'teacher workspace must include the classroom trial assessment tool');
    assert.match(trialToolText,/仅保存在当前教师设备浏览器中/,'trial data must clearly disclose local-only storage');
    assert.equal(await page.evaluate(()=>localStorage.getItem('scienceTrialAssessmentsV1')),null,'page load must not create fake trial evidence');

    assert.equal(await page.evaluate(()=>Object.keys(window.COURSE_ASSESSMENTS_V1||{}).length),12,'assessment bank must expose all 12 courses');
    await page.locator('#nav button[data-tab="teacher"]').click();
    await page.locator('#teacherPanel').evaluate(el=>el.classList.remove('hidden'));
    const assessmentBank=page.locator('#courseAssessmentBankV1');
    assert.equal(await assessmentBank.count(),1,'teacher workspace must include course assessment bank');
    assert.equal(await assessmentBank.locator('#assessmentQuestionPreview article').count(),3,'default pre-test must render three questions');
    await assessmentBank.locator('#assessmentStageSelect').selectOption('post');
    assert.equal(await assessmentBank.locator('#assessmentQuestionPreview article').count(),3,'post-test must render three questions');
    assert.equal(await assessmentBank.locator('#assessmentQuestionPreview').innerText().then(t=>t.includes('参考答案')),false,'answer key must be hidden by default');
    const publicBank=await page.evaluate(()=>window.COURSE_ASSESSMENTS_V1);
    await page.route('**/api/teacher/course-assessments/**',async route=>{
      const url=new URL(route.request().url()),id=decodeURIComponent(url.pathname.split('/').pop()),stage=url.searchParams.get('stage')||'pre';
      const item=publicBank[id],questions=(item?.[stage]||[]).map(q=>({prompt:q[0],options:q[1],correctIndex:0,rationale:'浏览器测试用解析'}));
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({courseId:id,title:item?.title||id,stage,questions})});
    });
    await assessmentBank.getByRole('button',{name:'显示教师答案与解析'}).click();
    await page.waitForFunction(()=>document.querySelector('#assessmentQuestionPreview')?.textContent.includes('参考答案'),null,{timeout:10000});
    assert.equal(await assessmentBank.locator('#assessmentQuestionPreview').innerText().then(t=>t.includes('参考答案')),true,'teacher can reveal answer explanations');
    const studentDownload=page.waitForEvent('download');
    await assessmentBank.getByRole('button',{name:'导出学生试卷 HTML'}).click();
    const studentFile=await studentDownload;
    assert.match(studentFile.suggestedFilename(),/学生试卷\.html$/);
    const teacherDownload=page.waitForEvent('download');
    await assessmentBank.getByRole('button',{name:'导出教师答案 HTML'}).click();
    const teacherFile=await teacherDownload;
    assert.match(teacherFile.suggestedFilename(),/教师答案\.html$/);

    await page.route('**/api/student/course-assessments/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='GET'){
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({courseId:'plant-water',title:'植物怎样喝水',stage:'pre',questions:[{prompt:'植物吸收水分主要依靠哪个部位？',options:['根','花瓣','果实','种子']},{prompt:'第二道浏览器测试题目是什么？',options:['A','B','C','D']},{prompt:'第三道浏览器测试题目是什么？',options:['A','B','C','D']}]})});
      }else if(request.method()==='POST'){
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({saved:true,score:100,correctCount:3,total:3,review:[{question:1,correct:true,correctIndex:0,correctOption:'根',rationale:'测试解析'},{question:2,correct:true,correctIndex:0,correctOption:'A',rationale:'测试解析'},{question:3,correct:true,correctIndex:0,correctOption:'A',rationale:'测试解析'}]})});
      }else await route.continue();
    });
    await page.evaluate(()=>localStorage.setItem('scienceStudentToken','browser-smoke-student-token'));
    await page.locator('#nav button[data-tab="learn"]').click();
    await page.locator('.course[data-course="plant"] button').click();
    await page.locator('#studentCourseAssessment').getByRole('button',{name:'开始测评'}).click();
    await page.locator('#studentCourseAssessment input[name="studentCourseAssessmentQ0"][value="0"]').check();
    await page.locator('#studentCourseAssessment input[name="studentCourseAssessmentQ1"][value="0"]').check();
    await page.locator('#studentCourseAssessment input[name="studentCourseAssessmentQ2"][value="0"]').check();
    await page.locator('#studentCourseAssessment').getByRole('button',{name:'提交并查看成绩'}).click();
    await page.waitForFunction(()=>document.querySelector('#studentAssessmentResult')?.textContent.includes('100 / 100'));
    assert.match(await page.locator('#studentAssessmentResult').innerText(),/答对 3 \/ 3 题/);

    await page.locator('#nav button[data-tab="learn"]').click();
    for (const course of featured) {
      await page.locator('#nav button[data-tab="learn"]').click();
      const card = page.locator('.course[data-course="' + course.id + '"]');
      const resourcePack=card.locator('details.course-resource-pack');
      assert.equal(await resourcePack.count(),1,course.title+' must show its teacher resource pack');
      await resourcePack.locator('summary').click();
      const resourceText=await resourcePack.innerText();
      for(const heading of ['学习成果与教学目标','材料清单','活动流程','学生任务单','学习评价量规','安全与风险控制']) assert.ok(resourceText.includes(heading),course.title+' resource pack missing '+heading);
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

    for (const topic of curriculum.topics) {
      const pack=topic.resourcePack;
      assert.ok(pack && pack.duration, topic.title+' must expose a teaching resource pack');
      assert.ok(pack.objectives?.length>=3 && pack.materials?.length>=3, topic.title+' resource pack must include objectives and materials');
      assert.ok(pack.steps?.length>=5 && pack.steps.every(step=>step.teacher&&step.student&&step.time), topic.title+' resource pack must include teacher/student lesson steps');
      assert.ok(pack.taskSheet?.length>=3, topic.title+' resource pack must include student task sheet');
      assert.ok(pack.rubric?.length>=3 && pack.rubric.every(row=>row.levels?.length===4), topic.title+' resource pack must include four-level rubric');
      assert.ok(pack.safety?.length>=2, topic.title+' resource pack must include safety notes');
    }

    await page.locator('#nav button[data-tab="learn"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#curriculumMapV56 article').length === 9);
    const cards = page.locator('#curriculumMapV56 article');
    for (let i = 0; i < 9; i++) {
      const topic = curriculum.topics[i + 3];
      const resourcePack=cards.nth(i).locator('details.course-resource-pack');
      assert.equal(await resourcePack.count(),1,topic.title+' must render its teacher resource pack');
      await resourcePack.locator('summary').click();
      assert.ok((await resourcePack.innerText()).includes('学生任务单'),topic.title+' must show student task sheet');
      await cards.nth(i).getByRole('button', { name: '开始探究' }).click();
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
