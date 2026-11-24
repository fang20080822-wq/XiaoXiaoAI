export function registerV58Routes({app,db,apiLimiter,requireTeacher,teacherId,requireDatabase}) {
  app.patch("/api/teacher/classes/:id/group",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
    const group=req.body?.group;
    if(!["experimental","control"].includes(group)) {
      return res.status(400).json({error:"班级分组无效，只能设置为 experimental 或 control。"});
    }
    const classId=String(req.params.id||"");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) {
      return res.status(400).json({error:"班级标识无效。"});
    }
    try {
      const q=await db.query(
        'UPDATE science_classes SET "group"=$1 WHERE id=$2 AND teacher_id=$3 RETURNING id,class_name,"group"',
        [group,classId,teacherId(req)]
      );
      if(!q.rowCount)return res.status(404).json({error:"班级不存在或无权修改。"});
      await db.query(
        "INSERT INTO audit_log(teacher_id,action,target_type,target_id) VALUES($1,$2,$3,$4)",
        [teacherId(req),"update_class_group","class",classId]
      );
      res.json({class:q.rows[0]});
    } catch(error) {
      console.error("class_group_update_failed",error.message);
      res.status(503).json({error:"班级分组设置失败，请稍后重试。"});
    }
  });
}
