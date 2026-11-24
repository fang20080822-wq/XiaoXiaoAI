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
    const render=()=>{
      const rows=readRows();const avg=key=>rows.length?(rows.reduce((sum,row)=>sum+Number(row[key]||0),0)/rows.length).toFixed(1):'—';
      const gains=rows.filter(row=>Number.isFinite(Number(row.preScore))&&Number.isFinite(Number(row.postScore)));
      const gain=gains.length?(gains.reduce((sum,row)=>sum+Number(row.postScore)-Number(row.preScore),0)/gains.length).toFixed(1):'—';
      status.textContent='已保存 '+rows.length+' 条匿名记录｜平均前测 '+avg('preScore')+'｜平均后测 '+avg('postScore')+'｜平均分数变化 '+(gain==='—'?'—':(Number(gain)>0?'+':'')+gain)+' 分。数据仅在本设备保存。';
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
  function addTeacherAccountUI(){
    const teacher=$('teacher');if(!teacher||$('teacherAccountBox'))return;
    const box=el('div',undefined,'card');box.id='teacherAccountBox';box.style.margin='18px 0';
    box.append(el('h2','教师账号注册与登录'),el('p','使用独立邮箱创建教师账号。注册成功后即可使用班级管理与学习数据功能。'));
    const email=el('input');email.type='email';email.id='teacherEmail';email.placeholder='教师工作邮箱';
    const school=el('input');school.id='teacherSchool';school.placeholder='学校 / 机构名称';
    const password=el('input');password.type='password';password.id='teacherAccountPassword';password.placeholder='至少8位密码';password.autocomplete='new-password';
    const actions=el('div',undefined,'actions');
    const register=el('button','注册并进入教师工作台','btn soft');register.type='button';
    register.addEventListener('click',async()=>{const status=$('teacherAccountStatus');status.textContent='正在创建教师账号…';try{const d=await api('/api/teacher/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value,school:school.value})});if(!d.token)throw new Error('账号已创建，但未收到登录凭证，请使用账号登录。');if(typeof teacherToken!=='undefined')teacherToken=d.token;window.teacherToken=d.token;applyRoleVisibility(d.token);$('teacherPanel')?.classList.remove('hidden');$('teacherLogout')?.classList.remove('hidden');$('loginMsg').textContent='教师账号注册成功，已自动登录。';await loadDashboard();await window.loadClasses?.();status.textContent=d.message||'注册成功，已进入教师工作台。';}catch(e){status.textContent=e.message;}});
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadCurriculum();addTeacherAccountUI();addTrialAssessmentUI();},{once:true});else{loadCurriculum();addTeacherAccountUI();addTrialAssessmentUI();}
  window.loadV56Dashboard=loadDashboard;
})();