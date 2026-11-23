(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
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
        if(card){const line=el('p','课标映射｜'+t.domain+' · '+t.grade+' · 核心概念：'+t.concept,'curriculum-standard');card.appendChild(line);}
      }
      d.topics.slice(3).forEach(t=>{
        const card=el('article',undefined,'unit course curriculum-card');
        card.append(el('span',t.domain,'pill'),el('h3',t.title),el('p','课标映射｜'+t.grade+' · 核心概念：'+t.concept),el('p','探究问题：'+t.question));
        const btn=el('button','开始探究 →','btn soft');btn.type='button';btn.addEventListener('click',()=>{
          if(typeof window.selectTopic==='function')window.selectTopic(t.question,t.id);
          else {location.hash='#assistant';const q=$('question');if(q)q.value=t.question;}
        });card.appendChild(btn);grid.appendChild(card);
      });
    }catch(e){grid.appendChild(el('p','课程映射暂时无法加载：'+e.message));}
  }
  function addTeacherAccountUI(){
    const teacher=$('teacher');if(!teacher||$('teacherAccountBox'))return;
    const box=el('div',undefined,'card');box.id='teacherAccountBox';box.style.margin='18px 0';
    box.append(el('h2','教师账号申请与登录'),el('p','教师使用独立邮箱账号；新账号需管理员审核通过后才能访问班级数据。'));
    const email=el('input');email.type='email';email.id='teacherEmail';email.placeholder='教师工作邮箱';
    const school=el('input');school.id='teacherSchool';school.placeholder='学校 / 机构名称';
    const password=el('input');password.type='password';password.id='teacherAccountPassword';password.placeholder='至少8位密码';password.autocomplete='new-password';
    const actions=el('div',undefined,'actions');
    const register=el('button','提交教师账号申请','btn soft');register.type='button';
    register.addEventListener('click',async()=>{const status=$('teacherAccountStatus');status.textContent='正在提交申请…';try{const d=await api('/api/teacher/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value,school:school.value})});status.textContent=d.message;}catch(e){status.textContent=e.message;}});
    const login=el('button','教师账号登录','btn primary');login.type='button';
    login.addEventListener('click',async()=>{const status=$('teacherAccountStatus');status.textContent='正在登录…';try{const d=await api('/api/teacher/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value})});if(typeof teacherToken!=='undefined')teacherToken=d.token;window.teacherToken=d.token;applyRoleVisibility(d.token);$('teacherPanel')?.classList.remove('hidden');$('teacherLogout')?.classList.remove('hidden');$('loginMsg').textContent='教师账号登录成功。';await loadDashboard();await window.loadClasses?.();status.textContent='登录成功。';}catch(e){status.textContent=e.message;}});
    actions.append(register,login);box.append(email,school,password,actions,el('p','', 'muted'));const status=box.lastChild;status.id='teacherAccountStatus';teacher.querySelector('.pageintro')?.after(box);
  }
  async function loadDashboard(){
    const panel=$('teacherPanel');if(!panel||panel.classList.contains('hidden'))return;
    let box=$('teacherDashboardV56');
    if(!box){box=el('section',undefined,'sample-card');box.id='teacherDashboardV56';const anchor=panel.firstElementChild;panel.insertBefore(box,anchor?.nextSibling||null);}
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
        const statsButton=el('button','查看本班探究统计','btn soft');statsButton.type='button';
        const statsPanel=el('div');statsPanel.hidden=true;statsPanel.style.marginTop='10px';
        statsButton.addEventListener('click',async()=>{
          statsPanel.hidden=false;statsPanel.replaceChildren(el('p','正在读取本班统计…'));
          try{
            const s=await api('/api/teacher/classes/'+encodeURIComponent(c.id)+'/stats');
            statsPanel.replaceChildren(
              el('p','学生 '+s.learners+' 人 · 已提交 '+s.submitted+' 份 · 提交率 '+s.submit_rate+'%'),
              el('p','平均完整度 '+s.completeness+'% · 有效数据记录率 '+s.evidence_rate+'%'),
              el('p','水平分布：L1 '+s.levels.L1+' · L2 '+s.levels.L2+' · L3 '+s.levels.L3+' · L4 '+s.levels.L4)
            );
            const focus=el('p','需要关注：'+((s.focus||[]).map(x=>x.alias+'（L'+x.level+'，完整度'+x.completeness+'%）').join('、')||'暂无'));
            statsPanel.appendChild(focus);
          }catch(e){statsPanel.replaceChildren(el('p','班级统计读取失败：'+e.message));}
        });
        item.append(statsButton,statsPanel);
        box.appendChild(item);
      });
    }catch(e){box.appendChild(el('p','看板读取失败：'+e.message));}
  }
  async function loadAudit(){
    const panel=$('teacherPanel');if(!panel||panel.classList.contains('hidden'))return;
    let box=$('teacherAuditV56');if(!box){box=el('div',undefined,'sample-card');box.id='teacherAuditV56';box.append(el('h3','我的操作审计记录'));$('teacherDashboardV56')?.after(box);}
    try{const d=await api('/api/teacher/audit-log');box.replaceChildren(el('h3','我的操作审计记录'));(d.logs||[]).forEach(x=>box.appendChild(el('p',new Date(x.created_at).toLocaleString()+' · '+x.action+' · '+x.target_type+' '+x.target_id)));if(!d.logs?.length)box.appendChild(el('p','暂无操作记录。'));}
    catch(e){box.appendChild(el('p','审计日志读取失败：'+e.message));}
  }
  async function loadAdminReviews(){
    if(!$('teacherPanel')||$('teacherPanel').classList.contains('hidden'))return;
    let box=$('teacherAdminReviewV56');if(!box){box=el('div',undefined,'sample-card');box.id='teacherAdminReviewV56';box.append(el('h3','管理员：教师账号审核'));$('teacherDashboardV56')?.after(box);}
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
  const oldLogin=window.teacherLogin;
  if(typeof oldLogin==='function')window.teacherLogin=async function(){await oldLogin();applyRoleVisibility((typeof teacherToken!=='undefined'&&teacherToken)||'');setTimeout(()=>{loadAdminReviews();},100);};
  const oldLoad=window.loadClasses;
  if(typeof oldLoad==='function')window.loadClasses=async function(){const v=await oldLoad();loadDashboard();loadAudit();return v;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadCurriculum();addTeacherAccountUI();},{once:true});else{loadCurriculum();addTeacherAccountUI();}
  window.loadV56Dashboard=loadDashboard;
})();