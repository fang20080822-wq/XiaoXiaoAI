export function registerV57Routes({app,db,apiLimiter,requireTeacher,teacherId,requireDatabase}) {
  app.get("/api/teacher/classes/:id/stats",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
    try {
      const owned=await db.query("SELECT id FROM science_classes WHERE id=$1 AND teacher_id=$2",[req.params.id,teacherId(req)]);
      if(!owned.rowCount)return res.status(404).json({error:"班级不存在。"});
      const summary=await db.query(`
        SELECT COUNT(DISTINCT l.id)::int AS learners,
          COUNT(DISTINCT r.id)::int AS submitted,
          COALESCE(ROUND(COUNT(DISTINCT r.learner_id)::numeric*100/NULLIF(COUNT(DISTINCT l.id),0),1),0) AS submit_rate,
          COALESCE(ROUND(AVG(NULLIF(r.level_json->>'completeness','')::numeric),1),0) AS completeness,
          COALESCE(ROUND(COUNT(DISTINCT r.id) FILTER (WHERE COALESCE((r.level_json->>'evidence_ok')::boolean,FALSE))::numeric*100/NULLIF(COUNT(DISTINCT r.id),0),1),0) AS evidence_rate,
          COUNT(DISTINCT r.id) FILTER (WHERE r.level=1)::int AS l1,
          COUNT(DISTINCT r.id) FILTER (WHERE r.level=2)::int AS l2,
          COUNT(DISTINCT r.id) FILTER (WHERE r.level=3)::int AS l3,
          COUNT(DISTINCT r.id) FILTER (WHERE r.level=4)::int AS l4
        FROM science_classes c
        LEFT JOIN science_learners l ON l.class_id=c.id
        LEFT JOIN science_records r ON r.class_id=c.id
        WHERE c.id=$1 GROUP BY c.id`,[req.params.id]);
      const focus=await db.query(`
        SELECT l.alias,COALESCE(NULLIF(r.level_json->>'completeness','')::numeric,0) AS completeness,
          COALESCE(r.level,1)::int AS level
        FROM science_learners l
        LEFT JOIN LATERAL (SELECT level,level_json FROM science_records WHERE learner_id=l.id AND class_id=l.class_id ORDER BY created_at DESC LIMIT 1) r ON TRUE
        WHERE l.class_id=$1
        ORDER BY completeness ASC,level ASC,l.alias ASC LIMIT 6`,[req.params.id]);
      const s=summary.rows[0]||{};
      res.json({learners:s.learners||0,submitted:s.submitted||0,submit_rate:Number(s.submit_rate||0),completeness:Number(s.completeness||0),evidence_rate:Number(s.evidence_rate||0),levels:{L1:s.l1||0,L2:s.l2||0,L3:s.l3||0,L4:s.l4||0},focus:focus.rows});
    } catch(error) {
      console.error("class_stats_failed",error.message);
      res.status(503).json({error:"班级统计暂不可用。"});
    }
  });

  const pages={
    "/privacy":["隐私政策","本平台面向青少年开展科学探究学习。平台仅在提供班级管理、探究记录和AI对话所需范围内处理数据。学生应使用匿名代号，不应提交姓名、电话、住址、学校班级、证件号码或账号密码。","班级邀请码、匿名代号、监护人知情勾选记录、探究记录及对话内容可能保存在平台数据库中，用于提供学习服务、班级管理和安全审查。教师仅可查看其所属班级数据。","启用在线AI时，学生问题及必要上下文会发送至配置的DeepSeek服务处理；未配置API Key或服务不可用时，平台使用本地规则回答。请勿输入个人敏感信息。","用户可通过班级教师提出更正或删除请求；平台运营者核实请求后按适用法律及备份周期处理。数据库与备份保存期限应以实际部署和运营安排为准。","当前使用教师组织及监护人知情勾选记录同意，尚未接入监护人身份核验。页面勾选不代表平台已核验监护人身份。"],
    "/terms":["使用条款","请在教师或监护人指导下使用本平台。平台用于科学学习与形成性反馈，不替代教师判断、教材、专业实验指导或现实安全管理。","学生应使用匿名代号，不提交他人个人信息，不伪造实验数据，不尝试危险实验，不利用平台生成伤害他人的内容。","AI输出可能不准确。重要事实、实验结论及安全事项应由教师结合可靠资料核查。教师应对学生活动、实验安全和作品评价承担必要监督责任。"],
    "/data-policy":["数据处理说明","平台处理的主要数据包括教师账号资料、班级和邀请码、匿名学习者代号、知情勾选记录、探究档案及对话记录。平台不要求学生填写真实姓名。","数据用于身份验证、班级权限控制、学习记录保存、教师反馈、系统安全及服务质量维护。数据库查询使用参数化语句；会话令牌不应以明文形式保存。","在线AI功能启用时，问题及必要上下文会发送给DeepSeek处理；离线模式使用本地规则，不向模型服务发送请求。","学生或监护人可联系所属班级教师发起数据访问、更正或删除请求。教师只能访问自己管理的班级；平台运营者按适用规则处理删除及备份。","当前用教师组织加监护人知情勾选记录同意，尚未接入监护人身份核验。"]
  };
  for(const [route,[title,...paragraphs]] of Object.entries(pages)){
    app.get(route,(req,res)=>res.type("html; charset=utf-8").send("<!doctype html><html lang='zh-CN'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+title+"｜小小AI科学家</title><body style='font-family:system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 20px;line-height:1.8;color:#17233d'><h1>"+title+"</h1>"+paragraphs.map(p=>"<p>"+p+"</p>").join("")+"<p><a href='/'>返回小小AI科学家</a></p></body></html>"));
  }
}
