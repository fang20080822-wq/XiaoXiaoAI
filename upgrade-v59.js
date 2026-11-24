
export function scoreCourseAssessment(courseId,stage,answers){
  const course=COURSE_ASSESSMENTS[courseId],questions=course?.[stage];
  if(!questions||!Array.isArray(answers)||answers.length!==questions.length||answers.some(value=>!Number.isInteger(value)||value<0||value>3))throw new TypeError("invalid_course_assessment_answers");
  const correctCount=questions.reduce((sum,q,index)=>sum+(answers[index]===q[2]?1:0),0);
  return {correctCount,total:questions.length,score:Math.round(correctCount/questions.length*100),review:questions.map((q,index)=>({question:index+1,selected:answers[index],correctIndex:q[2],correctOption:q[1][q[2]],rationale:q[3],correct:answers[index]===q[2]}))};
}

import { COURSE_ASSESSMENTS } from "./lib/course-assessments.js";
const STEPS = new Set(["observe","question","hypothesis","variables","method","data","evidence","conclusion","reflection","submit"]);
const ACTIONS = new Set(["edit","save","hint","submit","reload"]);
const REVERSE_ITEMS = new Set([4,8,13,17]); // zero-based indexes: q5, q9, q14, q18
const DIMENSIONS = [[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[16,17,18,19]];

export function scoreSurvey(answers) {
  if (!Array.isArray(answers) || answers.length !== 20 ||
      answers.some(value => !Number.isInteger(value) || value < 1 || value > 5)) {
    throw new TypeError("answers_must_be_20_integers_1_to_5");
  }
  const scored = answers.map((value,index) => REVERSE_ITEMS.has(index) ? 6-value : value);
  const mean = indexes => Number((indexes.reduce((sum,index)=>sum+scored[index],0)/indexes.length).toFixed(2));
  const dims = Object.fromEntries(DIMENSIONS.map((indexes,index)=>["d"+(index+1),mean(indexes)]));
  return {total:mean(scored.map((_,index)=>index)),dims};
}

export function csvEscape(value) {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "");
  const text = raw.replace(/[\r\n]+/g," ");
  return /[",]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
}

function round1(value) { return Number(Number(value||0).toFixed(1)); }
function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
}

export function registerV59Routes({app,db,apiLimiter,requireTeacher,requireStudent,teacherId,requireDatabase}) {

  app.get("/api/student/course-assessments/mine",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
    try{
      const q=await db.query("SELECT course_id,stage,score,correct_count,total,updated_at FROM course_assessment_results WHERE learner_id=$1 ORDER BY course_id,stage",[req.student.learnerId]);
      res.json({results:q.rows.map(row=>({...row,score:Number(row.score),correct_count:Number(row.correct_count),total:Number(row.total)}))});
    }catch(error){console.error("student_course_assessment_list_failed",error.message);res.status(503).json({error:"测评记录读取暂不可用。"});}
  });

  app.get("/api/student/course-assessments/:courseId",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
    const course=COURSE_ASSESSMENTS[req.params.courseId],stage=String(req.query.stage||"");
    if(!course||!["pre","post"].includes(stage))return res.status(404).json({error:"课程或测评阶段不存在。"});
    res.json({courseId:req.params.courseId,title:course.title,stage,questions:course[stage].map(q=>({prompt:q[0],options:q[1]}))});
  });

  app.post("/api/student/course-assessments/:courseId",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
    const courseId=req.params.courseId,stage=String(req.body?.stage||"");
    if(!COURSE_ASSESSMENTS[courseId]||!["pre","post"].includes(stage))return res.status(404).json({error:"课程或测评阶段不存在。"});
    let scored;
    try{scored=scoreCourseAssessment(courseId,stage,req.body?.answers);}catch{return res.status(400).json({error:"请完成3道题，每题选择A、B、C或D。"});}
    try{
      const q=await db.query(`
        INSERT INTO course_assessment_results(class_id,learner_id,course_id,stage,answers,score,correct_count,total,updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,NOW())
        ON CONFLICT(learner_id,course_id,stage) DO UPDATE SET
          answers=EXCLUDED.answers,score=EXCLUDED.score,correct_count=EXCLUDED.correct_count,total=EXCLUDED.total,updated_at=NOW()
        RETURNING score,correct_count,total,updated_at
      `,[req.student.classId,req.student.learnerId,courseId,stage,JSON.stringify(req.body.answers),scored.score,scored.correctCount,scored.total]);
      const row=q.rows[0];
      res.json({saved:true,courseId,title:COURSE_ASSESSMENTS[courseId].title,stage,score:Number(row.score),correctCount:Number(row.correct_count),total:Number(row.total),updatedAt:row.updated_at,review:scored.review});
    }catch(error){console.error("course_assessment_submit_failed",error.message);res.status(503).json({error:"测评提交暂不可用，请稍后重试。"});}
  });

  app.get("/api/teacher/classes/:id/course-assessments",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
    try{
      const own=await db.query("SELECT id FROM science_classes WHERE id=$1 AND teacher_id=$2",[req.params.id,teacherId(req)]);
      if(!own.rowCount)return res.status(404).json({error:"班级不存在或无权查看。"});
      const q=await db.query(`
        SELECT course_id,stage,COUNT(DISTINCT learner_id)::int AS participant_count,
          ROUND(AVG(score),1)::numeric AS average_score,MAX(score)::int AS highest_score,
          MIN(score)::int AS lowest_score,MAX(updated_at) AS latest_update
        FROM course_assessment_results WHERE class_id=$1
        GROUP BY course_id,stage ORDER BY course_id,stage
      `,[req.params.id]);
      res.json({results:q.rows.map(row=>({...row,average_score:Number(row.average_score),highest_score:Number(row.highest_score),lowest_score:Number(row.lowest_score)}))});
    }catch(error){console.error("teacher_course_assessment_summary_failed",error.message);res.status(503).json({error:"班级测评汇总暂不可用。"});}
  });
  app.post("/api/student/events",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
    const step=String(req.body?.step||"");
    const action=String(req.body?.action||"");
    const rawField=req.body?.field ?? req.body?.field_key;
    const fieldKey=typeof rawField==="string"?rawField.slice(0,80):"";
    const hintLevel=req.body?.hintLevel ?? req.body?.hint_level;
    if(!STEPS.has(step)||!ACTIONS.has(action))return res.status(400).json({error:"探究过程事件类型无效。"});
    if(action==="hint" && (!Number.isInteger(hintLevel)||hintLevel<1||hintLevel>4))return res.status(400).json({error:"提示等级必须为1至4。"});
    if(action!=="hint" && hintLevel!==undefined && hintLevel!==null)return res.status(400).json({error:"只有提示事件可以包含提示等级。"});
    const studentId=req.student?.learnerId;
    if(!studentId)return res.status(401).json({error:"学生会话已失效，请重新加入班级。"});
    const rawRecordId=req.body?.recordId ?? req.body?.record_id;
    if(rawRecordId!==undefined&&rawRecordId!==null&&(!validUuid(rawRecordId)))return res.status(400).json({error:"探究记录标识无效。"});
    const recordId=typeof rawRecordId==="string"?rawRecordId:null;
    try {
      if(recordId){
        const ownedRecord=await db.query("SELECT id FROM science_records WHERE id=$1 AND learner_id=$2 AND class_id=$3",[recordId,studentId,req.student.classId]);
        if(!ownedRecord.rowCount)return res.status(400).json({error:"探究记录不属于当前学生。"});
      }
      const result=await db.query(`
        WITH lock_row AS (
          SELECT pg_advisory_xact_lock(hashtext($1::uuid::text),hashtext($2::text))
        ), candidate AS (
          SELECT $3::uuid AS record_id FROM lock_row
        ), inserted AS (
          INSERT INTO events(student_id,record_id,step,action,hint_level,field_key,ts)
          SELECT $1::uuid,candidate.record_id,$4,$5,$6,$7,NOW() FROM candidate
          WHERE NOT EXISTS (
            SELECT 1 FROM events e
            WHERE e.student_id=$1::uuid AND e.step=$4 AND e.action=$5
              AND (e.ts >= NOW()-INTERVAL '10 seconds' OR ($5='edit' AND e.field_key=$7 AND e.ts>=NOW()-INTERVAL '30 seconds'))
          )
          RETURNING id
        )
        SELECT id FROM inserted
      `,[studentId,step,recordId,step,action,action==="hint"?hintLevel:null,fieldKey]);
      if(action==="submit" && recordId){
        await db.query("UPDATE events SET record_id=$1 WHERE student_id=$2 AND record_id IS NULL AND ts>=NOW()-INTERVAL '24 hours'",[recordId,studentId]);
      }
      res.status(result.rowCount?201:200).json({ok:true,stored:Boolean(result.rowCount),deduplicated:!result.rowCount});
    } catch(error) {
      console.error("student_event_write_failed",error.message);
      res.status(503).json({error:"探究过程记录暂不可用。"});
    }
  });

  app.post("/api/survey/submit",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
    const stage=req.body?.stage;
    if(!["pre","post"].includes(stage))return res.status(400).json({error:"问卷阶段只能是 pre 或 post。"});
    let scored;
    try { scored=scoreSurvey(req.body?.answers); }
    catch { return res.status(400).json({error:"问卷必须包含20道题，每题只能选择1至5的整数。"}); }
    try {
      const q=await db.query(`
        INSERT INTO surveys(student_id,stage,answers,total,d1,d2,d3,d4,d5,ts)
        VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT(student_id,stage) DO UPDATE SET
          answers=EXCLUDED.answers,total=EXCLUDED.total,
          d1=EXCLUDED.d1,d2=EXCLUDED.d2,d3=EXCLUDED.d3,d4=EXCLUDED.d4,d5=EXCLUDED.d5
        RETURNING total,d1,d2,d3,d4,d5,ts
      `,[req.student.learnerId,stage,JSON.stringify(req.body.answers),scored.total,scored.dims.d1,scored.dims.d2,scored.dims.d3,scored.dims.d4,scored.dims.d5]);
      const row=q.rows[0];
      res.json({ok:true,total:Number(row.total),dims:{d1:Number(row.d1),d2:Number(row.d2),d3:Number(row.d3),d4:Number(row.d4),d5:Number(row.d5)}});
    } catch(error) {
      console.error("survey_submit_failed",error.message);
      res.status(503).json({error:"问卷保存暂不可用。"});
    }
  });

  app.get("/api/survey/mine",apiLimiter,requireStudent,requireDatabase,async(req,res)=>{
    try {
      const q=await db.query("SELECT stage,total,d1,d2,d3,d4,d5,ts FROM surveys WHERE student_id=$1 ORDER BY stage",[req.student.learnerId]);
      const result={pre:null,post:null};
      for(const row of q.rows)result[row.stage]={total:Number(row.total),dims:{d1:Number(row.d1),d2:Number(row.d2),d3:Number(row.d3),d4:Number(row.d4),d5:Number(row.d5)},ts:row.ts};
      res.json(result);
    } catch(error) {
      console.error("survey_mine_failed",error.message);
      res.status(503).json({error:"问卷结果读取暂不可用。"});
    }
  });

  app.get("/api/teacher/classes/:id/process",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
    const classId=String(req.params.id||"");
    if(!validUuid(classId))return res.status(404).json({error:"班级不存在。"});
    try {
      const own=await db.query("SELECT id FROM science_classes WHERE id=$1 AND teacher_id=$2",[classId,teacherId(req)]);
      if(!own.rowCount)return res.status(404).json({error:"班级不存在。"});
      const q=await db.query(`
        WITH class_records AS (
          SELECT id FROM science_records WHERE class_id=$1
        ), per_record AS (
          SELECT r.id,
            COUNT(e.id) FILTER (WHERE e.action='edit')::numeric AS edits,
            BOOL_OR(e.action='hint') AS got_hint,
            BOOL_OR(e.action='edit' AND EXISTS (
              SELECT 1 FROM events h
              WHERE h.record_id=r.id AND h.action='hint'
                AND e.ts>h.ts AND e.ts<=h.ts+INTERVAL '10 minutes'
            )) AS edited_after_hint
          FROM class_records r
          LEFT JOIN events e ON e.record_id=r.id
          GROUP BY r.id
        ), stats AS (
          SELECT
            COALESCE(ROUND(100.0*COUNT(*) FILTER (WHERE got_hint AND edited_after_hint)/NULLIF(COUNT(*) FILTER (WHERE got_hint),0),1),0) AS hint_adherence_rate,
            COALESCE(ROUND(AVG(edits),1),0) AS avg_revisions
          FROM per_record
        ), event_count AS (
          SELECT COUNT(*)::int AS events_total
          FROM events e JOIN science_learners l ON l.id=e.student_id
          WHERE l.class_id=$1
        ), variable_check AS (
          SELECT COUNT(*) FILTER (
            WHERE NULLIF(BTRIM(independent_variable),'') IS NOT NULL
              AND independent_variable !~ '[和、，；,]'
              AND NULLIF(BTRIM(control_variables),'') IS NOT NULL
          )::numeric AS valid_count, COUNT(*)::numeric AS total_count
          FROM science_records WHERE class_id=$1
        )
        SELECT stats.*,event_count.events_total,
          COALESCE(ROUND(100.0*variable_check.valid_count/NULLIF(variable_check.total_count,0),1),0) AS variable_correct_rate
        FROM stats CROSS JOIN event_count CROSS JOIN variable_check
      `,[classId]);
      const row=q.rows[0]||{};
      res.json({
        hint_adherence_rate:round1(row.hint_adherence_rate),
        variable_correct_rate:round1(row.variable_correct_rate),
        avg_revisions:round1(row.avg_revisions),
        events_total:Number(row.events_total||0),
        note:"single_variable_proxy"
      });
    } catch(error) {
      console.error("class_process_stats_failed",error.message);
      res.status(503).json({error:"班级过程统计暂不可用。"});
    }
  });

  app.get("/api/teacher/classes/:id/export.csv",apiLimiter,requireTeacher,requireDatabase,async(req,res)=>{
    const classId=String(req.params.id||"");
    if(!validUuid(classId))return res.status(404).json({error:"班级不存在。"});
    try {
      const own=await db.query("SELECT id FROM science_classes WHERE id=$1 AND teacher_id=$2",[classId,teacherId(req)]);
      if(!own.rowCount)return res.status(404).json({error:"班级不存在。"});
      const q=await db.query(`
        SELECT
          l.student_code,c."group" AS group_name,r.id AS record_id,r.created_at,r.level,
          COALESCE(r.level_json->>'completeness','') AS completeness,
          COALESCE(r.level_json->>'evidence_ok','') AS evidence_ok,
          r.topic,r.question,r.observed_phenomenon,r.question_boundary,r.measurement_indicator,
          r.hypothesis,r.hypothesis_basis,r.expected_result,r.independent_variable,r.dependent_variable,
          r.control_variables,r.control_rationale,r.repetition_count,r.method,r.data_table,r.evidence,
          r.anomaly_handling,r.evidence_reasoning,r.conclusion,r.reflection,
          pre.total AS pre_total,pre.d1 AS pre_d1,pre.d2 AS pre_d2,pre.d3 AS pre_d3,pre.d4 AS pre_d4,pre.d5 AS pre_d5,
          post.total AS post_total,post.d1 AS post_d1,post.d2 AS post_d2,post.d3 AS post_d3,post.d4 AS post_d4,post.d5 AS post_d5
        FROM science_records r
        JOIN science_learners l ON l.id=r.learner_id
        JOIN science_classes c ON c.id=r.class_id
        LEFT JOIN surveys pre ON pre.student_id=l.id AND pre.stage='pre'
        LEFT JOIN surveys post ON post.student_id=l.id AND post.stage='post'
        WHERE r.class_id=$1
        ORDER BY r.created_at,r.id
      `,[classId]);
      const headers=["student_code","group","record_id","created_at","level","completeness","evidence_ok","topic","question","observed_phenomenon","question_boundary","measurement_indicator","hypothesis","hypothesis_basis","expected_result","independent_variable","dependent_variable","control_variables","control_rationale","repetition_count","method","data_table","evidence","anomaly_handling","evidence_reasoning","conclusion","reflection","pre_total","pre_d1","pre_d2","pre_d3","pre_d4","pre_d5","post_total","post_d1","post_d2","post_d3","post_d4","post_d5"];
      const keys=["student_code","group_name","record_id","created_at","level","completeness","evidence_ok","topic","question","observed_phenomenon","question_boundary","measurement_indicator","hypothesis","hypothesis_basis","expected_result","independent_variable","dependent_variable","control_variables","control_rationale","repetition_count","method","data_table","evidence","anomaly_handling","evidence_reasoning","conclusion","reflection","pre_total","pre_d1","pre_d2","pre_d3","pre_d4","pre_d5","post_total","post_d1","post_d2","post_d3","post_d4","post_d5"];
      const csv=[headers.join(","),...q.rows.map(row=>keys.map(key=>csvEscape(row[key])).join(","))].join("\r\n");
      const date=new Date().toISOString().slice(0,10);
      res.status(200);
      res.setHeader("Content-Type","text/csv; charset=utf-8");
      res.setHeader("Content-Disposition",`attachment; filename="class-${classId}-${date}.csv"`);
      res.send("\uFEFF"+csv+"\r\n");
    } catch(error) {
      console.error("class_csv_export_failed",error.message);
      res.status(503).json({error:"班级数据导出暂不可用。"});
    }
  });
}
