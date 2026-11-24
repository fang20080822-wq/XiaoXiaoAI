(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
  function addResourcePack(card, topic){
    const pack=topic?.resourcePack;
    if(!pack)return;
    const details=el('details',undefined,'course-resource-pack');
    details.style.marginTop='16px';
    details.style.padding='14px 16px';
    details.style.border='1px solid #dce5f5';
    details.style.borderRadius='14px';
    details.style.background='linear-gradient(135deg,#f7faff,#fbfaff)';
    const summary=el('summary','查看完整教学资源包 · '+pack.duration,'resource-pack-summary');
    summary.style.cursor='pointer';
    summary.style.fontWeight='800';
    summary.style.color='#315fc5';
    summary.style.padding='3px 0';
    details.appendChild(summary);
    const intro=el('p','教师可按本校课时与器材条件调整；学生记录应保留真实观察，不得补造数据。','muted');
    intro.style.margin='10px 0';
    details.appendChild(intro);
    const addList=(heading,items)=>{
      const section=el('section',undefined,'resource-pack-section');
      const h=el('h4',heading);h.style.margin='12px 0 6px';section.appendChild(h);
      const list=el('ul');list.style.paddingLeft='21px';list.style.margin='5px 0 10px';
      (items||[]).forEach(item=>list.appendChild(el('li',item)));
      section.appendChild(list);details.appendChild(section);
    };
    addList('学习成果与教学目标',pack.objectives);
    addList('材料清单',pack.materials);
    const flow=el('section',undefined,'resource-pack-section');
    const flowTitle=el('h4','活动流程');flowTitle.style.margin='12px 0 6px';flow.appendChild(flowTitle);
    const flowList=el('ol');flowList.style.paddingLeft='21px';flowList.style.margin='5px 0 10px';
    (pack.steps||[]).forEach(step=>{
      const item=el('li');
      const time=el('b',step.time+'｜');item.appendChild(time);
      item.appendChild(document.createTextNode('教师：'+step.teacher+' 学生：'+step.student));
      item.style.marginBottom='7px';flowList.appendChild(item);
    });
    flow.appendChild(flowList);details.appendChild(flow);
    addList('学生任务单',pack.taskSheet);
    const rubric=el('section',undefined,'resource-pack-section');
    const rubricTitle=el('h4','学习评价量规（每项0—3级）');rubricTitle.style.margin='12px 0 6px';rubric.appendChild(rubricTitle);
    (pack.rubric||[]).forEach(row=>{
      const item=el('div',undefined,'resource-rubric-row');
      item.style.padding='8px 10px';item.style.margin='6px 0';item.style.borderRadius='10px';item.style.background='#fff';item.style.border='1px solid #e5eaf3';
      item.appendChild(el('b',row.criterion));
      const levels=el('p',(row.levels||[]).map((level,index)=>index+'级：'+level).join('；'));
      levels.style.margin='4px 0 0';levels.style.fontSize='13px';item.appendChild(levels);rubric.appendChild(item);
    });
    details.appendChild(rubric);
    addList('安全与风险控制',pack.safety);
    card.appendChild(details);
  }
  const api = async (url, options={}) => {
    const headers={...(options.headers||{})};
    const activeToken=(typeof teacherToken!=='undefined'&&teacherToken)||window.teacherToken||''; if(activeToken) headers.Authorization='Bearer '+activeToken;
    const r=await fetch(url,{...options,headers});
    const d=await r.json().catch(()=>({error:'服务器返回格式异常'}));
    if(!r.ok) throw new Error(d.error||'请求失败');
    return d;
  };
  async function loadCurriculum(){
    const learn=$('learn'); if(!learn)return;
    const grid=el('div'); grid.id='curriculumMapV56'; grid.className='grid';
    const title=el('h2','12个主题课程地图'); title.style.marginTop='28px';
    const intro=el('p','每个主题均标注核心概念、学段与可探究的问题。'); intro.className='muted';
    learn.append(title,intro,grid);
    try{
      const d=await api('/api/curriculum');
      const existing=[...learn.querySelectorAll('.course')];
      const known=d.topics.slice(0,3);
      for(const t of known){
        const card=existing.find(c=>((c.textContent||'').includes(t.title)));
        if(card){const line=el('p','课标映射｜'+t.domain+' · '+t.grade+' · 核心概念：'+t.concept,'curriculum-standard');card.appendChild(line);addResourcePack(card,t);}
      }
      d.topics.slice(3).forEach(t=>{
        const card=el('article',undefined,'unit course curriculum-card');
        card.append(el('span',t.domain,'pill'),el('h3',t.title),el('p','课标映射｜'+t.grade+' · 核心概念：'+t.concept),el('p','探究问题：'+t.question));
        addResourcePack(card,t);
        const btn=el('button','开始探究 →','btn soft');btn.type='button';btn.addEventListener('click',()=>{
          if(typeof window.selectTopic==='function')window.selectTopic(t.question,t.id,t);
          else {location.hash='#assistant';const q=$('question');if(q)q.value=t.question;}
        });card.appendChild(btn);grid.appendChild(card);
      });
    }catch(e){grid.appendChild(el('p','课程映射暂时无法加载：'+e.message));}
  }
  async function addTrialAssessmentUI(){
    const panel=$('teacherPanel');if(!panel||$('trialAssessmentV56'))return;
    const box=el('section',undefined,'sample-card');box.id='trialAssessmentV56';box.style.marginTop='18px';
    box.append(el('span','CLASSROOM TRIAL · EVIDENCE LOG','sample-tag'),el('h3','课程试教与学习效果记录'),el('p','用于记录匿名化的前测、后测、学生作品表现和教师反馈。请先取得学校及监护人要求的授权；不要录入姓名、联系方式或可识别信息。数据仅保存在当前教师设备浏览器中，建议定期导出CSV备份。'));
    const grid=el('div',undefined,'grid');grid.style.gridTemplateColumns='repeat(auto-fit,minmax(190px,1fr))';grid.style.gap='10px';
    const field=(labelText,id,type='text',placeholder='')=>{
      const wrap=el('label',labelText,'trial-field');wrap.style.display='block';wrap.style.fontWeight='700';wrap.style.fontSize='13px';
      const input=el(type==='textarea'?'textarea':type==='select'?'select':'input');input.id=id;input.name=id;input.style.display='block';input.style.width='100%';input.style.marginTop='5px';input.style.padding='10px';input.style.border='1px solid #dce4f1';input.style.borderRadius='10px';input.style.background='#fff';input.style.color='#17233d';
      if(type==='number'){input.type='number';input.min='0';input.max=id==='preScore'||id==='postScore'?'100':id.endsWith('Rating')?'5':'3';input.step='1';input.required=true;}
      if(type==='text'){input.type='text';input.maxLength=24;input.placeholder=placeholder;}
      if(type==='textarea'){input.maxLength=500;input.rows=3;input.placeholder=placeholder;}
      wrap.appendChild(input);return {wrap,input};
    };
    const code=field('匿名参与者编号','trialParticipantCode','text','例如 S001（不要填写姓名）');
    const course=field('试教课程','trialCourse','select');
    const pre=field('前测得分（0—100）','preScore','number');
    const post=field('后测得分（0—100）','postScore','number');
    const question=field('问题设计（0—3级）','trialQuestionScore','number');
    const data=field('数据记录（0—3级）','trialDataScore','number');
    const reasoning=field('证据解释（0—3级）','trialReasoningScore','number');
    const engagement=field('学生参与度（1—5分）','trialEngagementRating','number');
    const aiSupport=field('AI引导有效性（1—5分）','trialAiRating','number');
    const feasibility=field('课堂可实施性（1—5分）','trialFeasibilityRating','number');
    const note=field('教师观察与改进建议（不含身份信息）','trialTeacherNote','textarea','记录课堂实施情况、学生典型困难与下一轮调整建议');
    try{
      const curriculum=await api('/api/curriculum');
      (curriculum.topics||[]).forEach(topic=>{const option=el('option',topic.title);option.value=topic.id;course.input.appendChild(option);});
    }catch(error){box.appendChild(el('p','课程列表加载失败：'+error.message));return;}
    [code,course,pre,post,question,data,reasoning,engagement,aiSupport,feasibility,note].forEach(item=>grid.appendChild(item.wrap));
    box.appendChild(grid);
    const actions=el('div',undefined,'actions');actions.style.marginTop='12px';
    const save=el('button','保存本条试教记录','btn primary');save.type='button';
    const exportButton=el('button','导出全部记录 CSV','btn outline');exportButton.type='button';
    actions.append(save,exportButton);box.appendChild(actions);
    const status=el('p','当前设备尚无试教记录。','muted');status.id='trialAssessmentStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.appendChild(status);
    const list=el('div',undefined,'trial-assessment-list');list.id='trialAssessmentList';box.appendChild(list);
    const storageKey='scienceTrialAssessmentsV1';
    const readRows=()=>{try{const rows=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(rows)?rows:[];}catch{return[];}};
    const analytics=el('section',undefined,'trial-course-analytics');analytics.id='trialCourseAnalytics';analytics.style.marginTop='14px';box.appendChild(analytics);
    const render=()=>{
      const rows=readRows();const mean=(items,key)=>items.length?(items.reduce((sum,row)=>sum+Number(row[key]||0),0)/items.length):null;
      const gains=rows.filter(row=>Number.isFinite(Number(row.preScore))&&Number.isFinite(Number(row.postScore)));
      const gain=mean(gains,'postScore')===null?null:gains.reduce((sum,row)=>sum+Number(row.postScore)-Number(row.preScore),0)/gains.length;
      const fmt=value=>value===null?'—':value.toFixed(1);
      status.textContent='已保存 '+rows.length+' 条匿名记录｜有效前后测 '+gains.length+' 人｜平均前测 '+fmt(mean(gains,'preScore'))+'｜平均后测 '+fmt(mean(gains,'postScore'))+'｜平均分数变化 '+(gain===null?'—':(gain>0?'+':'')+gain.toFixed(1))+' 分。数据仅在本设备保存。';
      analytics.replaceChildren(el('h4','分课程学习效果概览'),el('p','按课程分别汇总有效记录；n为匿名参与者数。样本较少时仅作描述性参考，不进行显著性或因果推断。','muted'));
      const grouped=new Map();rows.forEach(row=>{const key=row.courseId||'unknown';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);});
      if(!grouped.size)analytics.appendChild(el('p','尚无记录。完成并保存试教记录后，这里会自动生成课程分析。','muted'));
      [...grouped.entries()].sort((a,b)=>String(a[1][0].courseTitle).localeCompare(String(b[1][0].courseTitle),'zh-CN')).forEach(([courseId,items])=>{
        const valid=items.filter(row=>Number.isFinite(Number(row.preScore))&&Number.isFinite(Number(row.postScore)));
        const delta=valid.length?valid.reduce((sum,row)=>sum+Number(row.postScore)-Number(row.preScore),0)/valid.length:null;
        const card=el('article',undefined,'unit');card.style.margin='9px 0';card.style.padding='12px';
        card.append(el('b',items[0].courseTitle||courseId),el('p','匿名参与者 '+items.length+' 人｜有效前后测 '+valid.length+' 人'));
        card.append(el('p','前测均分 '+fmt(mean(valid,'preScore'))+'｜后测均分 '+fmt(mean(valid,'postScore'))+'｜平均变化 '+(delta===null?'—':(delta>0?'+':'')+delta.toFixed(1))+' 分'));
        card.append(el('p','探究量规均分（满分3）：问题设计 '+fmt(mean(items,'questionScore'))+'｜数据记录 '+fmt(mean(items,'dataScore'))+'｜证据解释 '+fmt(mean(items,'reasoningScore'))));
        card.append(el('p','课堂反馈均分（满分5）：参与度 '+fmt(mean(items,'engagementRating'))+'｜AI引导 '+fmt(mean(items,'aiRating'))+'｜可实施性 '+fmt(mean(items,'feasibilityRating'))));
        if(valid.length<5)card.append(el('small','当前有效样本少于5人，建议继续积累记录后再作比较。','muted'));
        analytics.appendChild(card);
      });
      list.replaceChildren();
      rows.slice(-5).reverse().forEach(row=>{const item=el('p',row.participantCode+' · '+row.courseTitle+' · '+row.preScore+' → '+row.postScore+' 分 · 作品量规 '+(Number(row.questionScore)+Number(row.dataScore)+Number(row.reasoningScore))+'/9');list.appendChild(item);});
    };
    save.addEventListener('click',()=>{
      const participantCode=code.input.value.trim();
      const ids=['preScore','postScore','trialQuestionScore','trialDataScore','trialReasoningScore','trialEngagementRating','trialAiRating','trialFeasibilityRating'];
      const values={};ids.forEach(id=>{const raw=String($(id).value??'').trim();values[id]=raw===''?NaN:Number(raw);});
      const comment=note.input.value.trim();
      if(!/^[A-Za-z0-9_-]{2,24}$/.test(participantCode)){status.textContent='请使用2—24位字母、数字、下划线或短横线组成的匿名编号。';return;}
      if(!course.input.value){status.textContent='请选择试教课程。';return;}
      if(!Number.isInteger(values.preScore)||!Number.isInteger(values.postScore)||values.preScore<0||values.preScore>100||values.postScore<0||values.postScore>100){status.textContent='前测和后测必须填写0—100之间的整数分数。';return;}
      for(const id of ['trialQuestionScore','trialDataScore','trialReasoningScore'])if(!Number.isInteger(values[id])||values[id]<0||values[id]>3){status.textContent='作品量规各项须填写0—3级。';return;}
      for(const id of ['trialEngagementRating','trialAiRating','trialFeasibilityRating'])if(!Number.isInteger(values[id])||values[id]<1||values[id]>5){status.textContent='教师反馈评分须填写1—5分。';return;}
      if(/(?:\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|(?:\+?86)?1[3-9]\d{9})/.test(comment)){status.textContent='备注中检测到疑似联系方式，请删除后再保存。';return;}
      const rows=readRows();const entry={participantCode,courseId:course.input.value,courseTitle:course.input.options[course.input.selectedIndex]?.textContent||course.input.value,preScore:values.preScore,postScore:values.postScore,questionScore:values.trialQuestionScore,dataScore:values.trialDataScore,reasoningScore:values.trialReasoningScore,engagementRating:values.trialEngagementRating,aiRating:values.trialAiRating,feasibilityRating:values.trialFeasibilityRating,teacherNote:comment,savedAt:new Date().toISOString()};const existingIndex=rows.findIndex(row=>row.participantCode===participantCode&&row.courseId===course.input.value);if(existingIndex>=0)rows[existingIndex]=entry;else rows.push(entry);
      try{localStorage.setItem(storageKey,JSON.stringify(rows));render();status.textContent='已保存。本条分数变化：'+(values.postScore-values.preScore>0?'+':'')+(values.postScore-values.preScore)+'分；请勿将分数变化直接解释为平台造成的因果效果。';}
      catch(error){status.textContent='本机保存失败：'+error.message+'。请检查浏览器存储空间。';}
    });
    exportButton.addEventListener('click',()=>{
      const rows=readRows();if(!rows.length){status.textContent='暂无可导出的试教记录。';return;}
      const columns=['participantCode','courseId','courseTitle','preScore','postScore','questionScore','dataScore','reasoningScore','engagementRating','aiRating','feasibilityRating','teacherNote','savedAt'];
      const csv=[columns.join(','),...rows.map(row=>columns.map(key=>'"'+String(row[key]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='小小AI科学家_匿名试教评估记录.csv';link.click();URL.revokeObjectURL(url);
      status.textContent='已生成CSV导出文件。请妥善保存并仅用于授权范围内的教学研究。';
    });
    panel.appendChild(box);render();
  }
  function addCourseAssessmentBankUI(){
    const panel=$('teacherPanel'),bank=window.COURSE_ASSESSMENTS_V1;
    if(!panel||$('courseAssessmentBankV1')||!bank)return;
    const box=el('section',undefined,'sample-card');box.id='courseAssessmentBankV1';box.style.marginTop='18px';
    box.append(el('span','COURSE-ALIGNED CHECK · TEACHER RESOURCE','sample-tag'),el('h3','12门课程前测 / 后测试题库'),el('p','题目可预览并导出学生试卷。标准答案与解析由服务器在教师登录后单独提供；学生端不会收到答案。该题库用于课堂诊断与教学反思，不是标准化测验。'));
    const controls=el('div',undefined,'grid');controls.style.gridTemplateColumns='repeat(auto-fit,minmax(200px,1fr))';controls.style.gap='10px';
    const courseLabel=el('label','选择课程');courseLabel.style.display='block';courseLabel.style.fontWeight='700';
    const course=el('select');course.id='assessmentCourseSelect';course.style.display='block';course.style.width='100%';course.style.padding='10px';course.style.marginTop='5px';
    Object.entries(bank).forEach(([id,item])=>{const option=el('option',item.title);option.value=id;course.appendChild(option);});courseLabel.appendChild(course);
    const stageLabel=el('label','测评阶段');stageLabel.style.display='block';stageLabel.style.fontWeight='700';
    const stage=el('select');stage.id='assessmentStageSelect';stage.style.display='block';stage.style.width='100%';stage.style.padding='10px';stage.style.marginTop='5px';
    [['pre','前测（教学前）'],['post','后测（教学后）']].forEach(([value,label])=>{const option=el('option',label);option.value=value;stage.appendChild(option);});
    stageLabel.appendChild(stage);controls.append(courseLabel,stageLabel);box.appendChild(controls);
    const contentBox=el('div');contentBox.id='assessmentQuestionPreview';contentBox.style.marginTop='12px';box.appendChild(contentBox);
    const answerToggle=el('button','显示教师答案与解析','btn outline');answerToggle.type='button';answerToggle.style.marginRight='8px';
    const studentExport=el('button','导出学生试卷 HTML','btn primary');studentExport.type='button';studentExport.style.marginRight='8px';
    const teacherExport=el('button','导出教师答案 HTML','btn soft');teacherExport.type='button';
    const actions=el('div',undefined,'actions');actions.style.marginTop='12px';actions.append(answerToggle,studentExport,teacherExport);box.appendChild(actions);
    const status=el('p','学生试卷不含答案；教师答案需登录后从服务器读取。','muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.appendChild(status);
    let showAnswers=false,teacherQuestions=null;
    const current=()=>({id:course.value,item:bank[course.value],stage:stage.value,questions:bank[course.value][stage.value]||[]});
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const render=()=>{
      const c=current();contentBox.replaceChildren(el('h4',c.item.title+' · '+(c.stage==='pre'?'前测':'后测')+' · 3题 / 100分'));
      c.questions.forEach((q,index)=>{const card=el('article',undefined,'unit');card.style.margin='9px 0';card.style.padding='12px';card.append(el('b','第'+(index+1)+'题'),el('p',q[0]));const list=el('ol');list.type='A';list.style.paddingLeft='22px';q[1].forEach(option=>list.appendChild(el('li',option)));card.appendChild(list);
        if(showAnswers&&teacherQuestions?.[index]){const a=teacherQuestions[index];const answer=el('p','参考答案：'+String.fromCharCode(65+a.correctIndex)+'｜'+a.options[a.correctIndex]+'。解析：'+a.rationale);answer.style.padding='9px';answer.style.borderRadius='8px';answer.style.background='#eef5ff';card.appendChild(answer);}
        contentBox.appendChild(card);
      });
    };
    const download=(html,filename)=>{const blob=new Blob(['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(filename)+'</title><style>body{font:16px/1.7 Arial,"Microsoft YaHei",sans-serif;max-width:850px;margin:32px auto;padding:0 22px;color:#18243b}h1{font-size:24px}li{margin:7px 0}.meta{color:#59677d;border-bottom:1px solid #ddd;padding-bottom:12px}.question{margin:22px 0;break-inside:avoid}.answer{background:#f1f5ff;padding:10px;border-radius:8px}@media print{body{margin:12mm auto}.question{break-inside:avoid}}</style><body>'+html+'</body></html>'],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);};
    answerToggle.addEventListener('click',async()=>{showAnswers=!showAnswers;answerToggle.textContent=showAnswers?'隐藏教师答案与解析':'显示教师答案与解析';if(showAnswers){status.textContent='正在验证教师权限并读取答案…';try{const d=await api('/api/teacher/course-assessments/'+encodeURIComponent(course.value)+'?stage='+stage.value);teacherQuestions=d.questions;status.textContent='教师答案已从受保护接口读取。';}catch(e){showAnswers=false;answerToggle.textContent='显示教师答案与解析';teacherQuestions=null;status.textContent='无法读取教师答案：'+e.message;}}else{teacherQuestions=null;status.textContent='答案已隐藏。'}render();});
    course.addEventListener('change',()=>{showAnswers=false;teacherQuestions=null;answerToggle.textContent='显示教师答案与解析';render();});
    stage.addEventListener('change',()=>{showAnswers=false;teacherQuestions=null;answerToggle.textContent='显示教师答案与解析';render();});
    studentExport.addEventListener('click',()=>{const c=current();const body='<h1>'+escapeHtml(c.item.title)+' · '+(c.stage==='pre'?'前测':'后测')+'</h1><p class="meta">匿名代号：____________　日期：____________　得分：______ / 100</p><p>请独立完成以下选择题，每题约33—34分。</p>'+c.questions.map((q,i)=>'<section class="question"><b>第'+(i+1)+'题</b><p>'+escapeHtml(q[0])+'</p><ol type="A">'+q[1].map(o=>'<li>'+escapeHtml(o)+'</li>').join('')+'</ol><p>我的选择：□ A　□ B　□ C　□ D</p></section>').join('');download(body,c.item.title+'_'+(c.stage==='pre'?'前测':'后测')+'_学生试卷.html');status.textContent='已导出不含答案的学生试卷。';});
    teacherExport.addEventListener('click',async()=>{try{const c=current();const d=await api('/api/teacher/course-assessments/'+encodeURIComponent(c.id)+'?stage='+c.stage);const body='<h1>'+escapeHtml(c.item.title)+' · '+(c.stage==='pre'?'前测':'后测')+'教师答案</h1><p class="meta">教师专用｜每题约33—34分</p>'+d.questions.map((q,i)=>'<section class="question"><b>第'+(i+1)+'题｜答案 '+String.fromCharCode(65+q.correctIndex)+'</b><p>'+escapeHtml(q.prompt)+'</p><p class="answer">正确选项：'+escapeHtml(q.options[q.correctIndex])+'。解析：'+escapeHtml(q.rationale)+'</p></section>').join('');download(body,c.item.title+'_'+(c.stage==='pre'?'前测':'后测')+'_教师答案.html');status.textContent='教师答案已单独导出，请勿与学生试卷一并发放。';}catch(e){status.textContent='教师答案导出失败：'+e.message;}});
    panel.appendChild(box);render();

    const report=el('section',undefined,'sample-card');report.id='classCourseAssessmentReport';report.style.marginTop='18px';
    report.append(el('h3','班级课程测评汇总'),el('p','仅展示班级聚合数据，不显示学生个人答题明细。'));
    const classSelect=el('select');classSelect.id='assessmentReportClass';classSelect.style.padding='10px';classSelect.style.minWidth='220px';
    const refresh=el('button','读取班级汇总','btn primary');refresh.type='button';
    const reportStatus=el('p','登录教师账号并选择班级后查看。','muted');
    const reportRows=el('div');const reportActions=el('div',undefined,'actions');reportActions.append(classSelect,refresh);
    report.append(reportActions,reportStatus,reportRows);panel.appendChild(report);
    const loadReportClasses=async()=>{try{const d=await api('/api/teacher/classes');classSelect.replaceChildren();(d.classes||[]).forEach(c=>{const o=el('option',c.class_name+'（'+c.learner_count+'人）');o.value=c.id;classSelect.appendChild(o);});if(!classSelect.options.length)reportStatus.textContent='当前账号还没有班级。';}catch(e){reportStatus.textContent='班级列表读取失败：'+e.message;}};
    refresh.addEventListener('click',async()=>{if(!classSelect.value){reportStatus.textContent='请先创建或选择班级。';return;}reportStatus.textContent='正在读取聚合数据…';reportRows.replaceChildren();try{const d=await api('/api/teacher/classes/'+encodeURIComponent(classSelect.value)+'/course-assessments');if(!d.results?.length){reportStatus.textContent='该班级尚无在线测评记录。';return;}reportStatus.textContent='以下为每门课程、每个阶段的聚合统计；同一学生同一阶段只保留最近一次提交。';d.results.forEach(r=>{const title=bank[r.course_id]?.title||r.course_id;const card=el('article',undefined,'unit');card.style.margin='8px 0';card.append(el('b',title+' · '+(r.stage==='pre'?'前测':'后测')),el('p','参与人数：'+r.participant_count+'｜平均分：'+Number(r.average_score).toFixed(1)+'｜最高分：'+r.highest_score+'｜最低分：'+r.lowest_score));reportRows.appendChild(card);});}catch(e){reportStatus.textContent='班级测评汇总读取失败：'+e.message;}});
    loadReportClasses();window.refreshCourseAssessmentClasses=loadReportClasses;
  }

  function addStudentCourseAssessmentUI(){
    const lab=$('lab'),bank=window.COURSE_ASSESSMENTS_V1,anchor=$('courseLearningPanel');
    if(!lab||!bank||$('studentCourseAssessment'))return;
    const box=el('section',undefined,'card');box.id='studentCourseAssessment';box.style.margin='16px 0';
    box.append(el('span','COURSE CHECK · ONLINE ASSESSMENT','sample-tag'),el('h3','本课在线测评'),el('p','先完成课前测评，学习和探究后再完成课后测评。系统在服务器判分并保存最近一次成绩；教师只能查看班级汇总。'));
    const controls=el('div',undefined,'actions');
    const stage=el('select');stage.id='studentAssessmentStage';stage.style.padding='10px';[['pre','课前测评'],['post','课后测评']].forEach(([v,t])=>{const o=el('option',t);o.value=v;stage.appendChild(o);});
    const load=el('button','开始测评','btn primary');load.type='button';controls.append(stage,load);box.appendChild(controls);
    const status=el('p','请先加入班级，再开始在线测评。','muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.appendChild(status);
    const questionsBox=el('div');questionsBox.id='studentAssessmentQuestions';box.appendChild(questionsBox);
    const submit=el('button','提交并查看成绩','btn primary');submit.type='button';submit.hidden=true;box.appendChild(submit);
    const results=el('div');results.id='studentAssessmentResult';box.appendChild(results);
    let loaded=null;
    const selectedCourse=()=>{const id=localStorage.getItem('scienceSelectedCourse')||'plant';const mapped=id==='plant'?'plant-water':id;return bank[mapped]?mapped:null;};
    const getToken=()=>localStorage.getItem('scienceStudentToken')||'';
    load.addEventListener('click',async()=>{const token=getToken();if(!token){status.textContent='请先使用班级邀请码加入班级。';return;}const courseId=selectedCourse();if(!courseId){status.textContent='当前课程尚未配置在线测评。';return;}status.textContent='正在加载题目…';questionsBox.replaceChildren();results.replaceChildren();submit.hidden=true;loaded=null;
      try{const r=await fetch('/api/student/course-assessments/'+encodeURIComponent(courseId)+'?stage='+stage.value,{headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok)throw new Error(d.error||'题目读取失败');loaded={courseId,stage:stage.value,questions:d.questions};questionsBox.appendChild(el('h4',d.title+' · '+(stage.value==='pre'?'课前测评':'课后测评')));d.questions.forEach((q,i)=>{const card=el('article',undefined,'unit');card.style.margin='9px 0';card.append(el('b','第'+(i+1)+'题'),el('p',q.prompt));q.options.forEach((option,j)=>{const label=el('label');label.style.display='block';label.style.fontWeight='500';const input=el('input');input.type='radio';input.name='studentCourseAssessmentQ'+i;input.value=String(j);input.style.width='auto';input.style.marginRight='8px';label.append(input,document.createTextNode(String.fromCharCode(65+j)+'、'+option));card.appendChild(label);});questionsBox.appendChild(card);});submit.hidden=false;status.textContent='共3题，请独立完成后提交。';}
      catch(e){status.textContent='测评加载失败：'+e.message;}
    });
    submit.addEventListener('click',async()=>{const token=getToken();if(!token||!loaded)return;const answers=loaded.questions.map((q,i)=>{const selected=questionsBox.querySelector('input[name="studentCourseAssessmentQ'+i+'"]:checked');return selected?Number(selected.value):-1;});if(answers.some(v=>v<0)){status.textContent='还有题目未作答，请完成全部3题。';return;}submit.disabled=true;status.textContent='正在提交并由服务器判分…';
      try{const r=await fetch('/api/student/course-assessments/'+encodeURIComponent(loaded.courseId),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({stage:loaded.stage,answers})});const d=await r.json();if(!r.ok)throw new Error(d.error||'提交失败');status.textContent='已保存本次成绩。再次提交会更新该课程该阶段的最近一次成绩。';results.replaceChildren(el('h4','本次得分：'+d.score+' / 100（答对 '+d.correctCount+' / '+d.total+' 题）'));d.review.forEach(item=>{const card=el('article',undefined,'unit');card.style.margin='8px 0';card.append(el('b','第'+item.question+'题 · '+(item.correct?'回答正确':'需要再想一想')),el('p','正确选项：'+String.fromCharCode(65+item.correctIndex)+'、'+item.correctOption),el('p','解析：'+item.rationale));results.appendChild(card);});}
      catch(e){status.textContent='成绩保存失败：'+e.message+'，请稍后重试。';}
      finally{submit.disabled=false;}
    });
    if(anchor)anchor.after(box);else lab.prepend(box);
  }
  function addTeacherAccountUI(){
    const teacher=$('teacher');if(!teacher||$('teacherAccountBox'))return;
    const box=el('div',undefined,'card');box.id='teacherAccountBox';box.style.margin='18px 0';
    box.append(el('h2','教师账号注册与登录'),el('p','使用独立邮箱创建教师账号。注册成功后即可使用班级管理与学习数据功能。'));
    const email=el('input');email.type='email';email.id='teacherEmail';email.placeholder='教师工作邮箱';
    const school=el('input');school.id='teacherSchool';school.placeholder='学校 / 机构名称';
    const password=el('input');password.type='password';password.id='teacherAccountPassword';password.placeholder='至少8位密码';password.autocomplete='new-password';
    const actions=el('div',undefined,'actions');
    const register=el('button','注册并进入教师工作台','btn soft');register.type='button';
    register.addEventListener('click',async()=>{const status=$('teacherAccountStatus');status.textContent='正在创建教师账号…';try{const d=await api('/api/teacher/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value,school:school.value})});if(!d.token)throw new Error('账号已创建，但未收到登录凭证，请使用账号登录。');if(typeof teacherToken!=='undefined')teacherToken=d.token;window.teacherToken=d.token;applyRoleVisibility(d.token);$('teacherPanel')?.classList.remove('hidden');$('teacherLogout')?.classList.remove('hidden');$('loginMsg').textContent='教师账号注册成功，已自动登录。';await loadDashboard();await window.loadClasses?.();window.refreshCourseAssessmentClasses?.();status.textContent=d.message||'注册成功，已进入教师工作台。';}catch(e){status.textContent=e.message;}});
    const login=el('button','教师账号登录','btn primary');login.type='button';
    login.addEventListener('click',async()=>{const status=$('teacherAccountStatus');status.textContent='正在登录…';try{const d=await api('/api/teacher/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value})});if(typeof teacherToken!=='undefined')teacherToken=d.token;window.teacherToken=d.token;applyRoleVisibility(d.token);$('teacherPanel')?.classList.remove('hidden');$('teacherLogout')?.classList.remove('hidden');$('loginMsg').textContent='教师账号登录成功。';await loadDashboard();await window.loadClasses?.();status.textContent='登录成功。';}catch(e){status.textContent=e.message;}});
    actions.append(register,login);box.append(email,school,password,actions,el('p','', 'muted'));const status=box.lastChild;status.id='teacherAccountStatus';teacher.querySelector('.pageintro')?.after(box);
  }
  async function loadDashboard(){
    const panel=$('teacherPanel');if(!panel||panel.classList.contains('hidden'))return;
    let box=$('classStats');
    if(!box){box=el('section',undefined,'sample-card');box.id='classStats';const anchor=panel.firstElementChild;panel.insertBefore(box,anchor?.nextSibling||null);}
    box.replaceChildren(el('h3','班级学习数据看板'),el('p','以下指标由数据库记录和规则引擎统计，不由大模型估算。'));
    try{
      const d=await api('/api/teacher/dashboard');
      const totals=d.totals||{};
      const row=el('div',undefined,'grid');
      [['班级数',totals.classes||0],['学生数',totals.learners||0],['探究提交数',totals.records||0]].forEach(([k,v])=>{const c=el('div',undefined,'unit');c.append(el('small',k),el('h2',String(v)));row.appendChild(c);});
      box.appendChild(row);
      (d.classes||[]).forEach(c=>{
        const item=el('div',undefined,'unit');item.style.marginTop='10px';
        item.append(el('b',c.class_name),el('p','提交率：'+c.submission_rate+'% · 变量控制错误率：'+c.variable_control_error_rate+'%'),el('p','提问类型：探究型 '+c.question_exploratory+' · 概念型 '+c.question_concept+' · 其他 '+c.question_other));
        box.appendChild(item);
      });
    }catch(e){box.appendChild(el('p','看板读取失败：'+e.message));}
  }
  async function loadAudit(){
    const panel=$('teacherPanel');if(!panel||panel.classList.contains('hidden'))return;
    let box=$('teacherAuditV56');if(!box){box=el('div',undefined,'sample-card');box.id='teacherAuditV56';box.append(el('h3','我的操作审计记录'));$('classStats')?.after(box);}
    try{const d=await api('/api/teacher/audit-log');box.replaceChildren(el('h3','我的操作审计记录'));(d.logs||[]).forEach(x=>box.appendChild(el('p',new Date(x.created_at).toLocaleString()+' · '+x.action+' · '+x.target_type+' '+x.target_id)));if(!d.logs?.length)box.appendChild(el('p','暂无操作记录。'));}
    catch(e){box.appendChild(el('p','审计日志读取失败：'+e.message));}
  }
  async function loadAdminReviews(){
    if(!$('teacherPanel')||$('teacherPanel').classList.contains('hidden'))return;
    let box=$('teacherAdminReviewV56');if(!box){box=el('div',undefined,'sample-card');box.id='teacherAdminReviewV56';box.append(el('h3','管理员：教师账号审核'));$('classStats')?.after(box);}
    try{const d=await api('/api/admin/teachers');box.replaceChildren(el('h3','管理员：教师账号审核'));(d.teachers||[]).forEach(t=>{const row=el('div',undefined,'unit');row.append(el('b',t.email),el('p',t.school+' · '+t.status));if(t.status==='pending'){for(const status of ['approved','rejected']){const b=el('button',status==='approved'?'批准':'驳回','btn soft');b.type='button';b.addEventListener('click',async()=>{try{await api('/api/admin/teachers/'+encodeURIComponent(t.id)+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});loadAdminReviews();}catch(e){row.appendChild(el('p',e.message));}});row.appendChild(b);}}box.appendChild(row);});}
    catch(e){box.appendChild(el('p','管理员审核列表仅管理员可见：'+e.message));}
  }
  function applyRoleVisibility(token){
    let role='teacher';try{const part=token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/');role=JSON.parse(atob(part)).role||'teacher';}catch{}
    const admin=role==='admin';
    ['newClassName','classList','classRecords','studentWork','evaluation'].forEach(id=>{const n=$(id);if(n)n.hidden=admin;});
    document.querySelectorAll('#teacherPanel button[onclick]').forEach(b=>{if(/createClass|loadClasses|evaluateWork|exportEvaluation/.test(b.getAttribute('onclick')||''))b.hidden=admin;});
    document.querySelectorAll('#teacherPanel h3').forEach(h=>{if(/班级管理与学习档案|学生探究作品评价/.test(h.textContent))h.hidden=admin;});
  }
  const oldLoad=window.loadClasses;
  if(typeof oldLoad==='function')window.loadClasses=async function(){const v=await oldLoad();loadDashboard();loadAudit();return v;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadCurriculum();addTeacherAccountUI();addTrialAssessmentUI();addCourseAssessmentBankUI();addStudentCourseAssessmentUI();},{once:true});else{loadCurriculum();addTeacherAccountUI();addTrialAssessmentUI();addCourseAssessmentBankUI();}
  window.loadV56Dashboard=loadDashboard;
})();