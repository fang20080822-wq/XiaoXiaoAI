import { CURRICULUM_12 } from "./upgrade-v56.js";
import { COURSE_ASSESSMENTS } from "./lib/course-assessments.js";

const EVIDENCE_FIELDS = [
  ["question", "探究问题"],
  ["hypothesis", "研究假设"],
  ["method", "实验方法"],
  ["data", "数据或观察证据"],
  ["conclusion", "结论"],
  ["reasoning", "证据解释"]
];
const text = value => String(value ?? "").trim();
const numericMean = values => values.length ? Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)) : null;
const normalizeAnswers = value => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
};

export function buildLearningEvidenceReport({ assessments = [], records = [] } = {}) {
  const courseByTopic = new Map();
  for (const course of CURRICULUM_12) {
    courseByTopic.set(text(course.question), course);
    courseByTopic.set(text(course.title), course);
  }
  const groupedAssessments = new Map();
  for (const row of assessments) {
    const courseId = text(row.course_id);
    if (!COURSE_ASSESSMENTS[courseId]) continue;
    if (!groupedAssessments.has(courseId)) groupedAssessments.set(courseId, []);
    groupedAssessments.get(courseId).push(row);
  }
  const groupedRecords = new Map();
  let unmatchedRecordCount = 0;
  for (const row of records) {
    const course = courseByTopic.get(text(row.topic));
    if (!course) { unmatchedRecordCount++; continue; }
    if (!groupedRecords.has(course.id)) groupedRecords.set(course.id, []);
    groupedRecords.get(course.id).push(row);
  }

  const results = CURRICULUM_12.map(course => {
    const bank = COURSE_ASSESSMENTS[course.id];
    const rows = groupedAssessments.get(course.id) || [];
    const stages = {};
    for (const stage of ["pre", "post"]) {
      const stageRows = rows.filter(row => row.stage === stage);
      const scores = stageRows.map(row => Number(row.score)).filter(Number.isFinite);
      const questions = bank[stage];
      stages[stage] = {
        participants: new Set(stageRows.map(row => String(row.learner_id))).size,
        averageScore: numericMean(scores),
        items: questions.map((question, index) => {
          const answers = stageRows.map(row => normalizeAnswers(row.answers)[index]).filter(Number.isInteger);
          const incorrect = answers.filter(answer => answer !== question[2]).length;
          return {
            index: index + 1,
            objective: course.resourcePack?.objectives?.[index] || course.concept,
            prompt: question[0],
            answered: answers.length,
            incorrect,
            errorRate: answers.length ? Number((incorrect / answers.length * 100).toFixed(1)) : null
          };
        })
      };
    }
    const byLearner = new Map();
    for (const row of rows) {
      const learnerId = String(row.learner_id);
      if (!byLearner.has(learnerId)) byLearner.set(learnerId, {});
      byLearner.get(learnerId)[row.stage] = Number(row.score);
    }
    const paired = [...byLearner.values()].filter(value => Number.isFinite(value.pre) && Number.isFinite(value.post));
    const deltas = paired.map(value => value.post - value.pre);
    const preScores = paired.map(value => value.pre);
    const postScores = paired.map(value => value.post);

    const courseRecords = groupedRecords.get(course.id) || [];
    const elements = EVIDENCE_FIELDS.map(([key, label]) => {
      const completed = courseRecords.filter(row => {
        if (key === "data") return Boolean(text(row.data_table) || text(row.evidence));
        if (key === "reasoning") return Boolean(text(row.evidence_reasoning));
        return Boolean(text(row[key]));
      }).length;
      return { key, label, completed, total: courseRecords.length, rate: courseRecords.length ? Number((completed / courseRecords.length * 100).toFixed(1)) : null };
    });
    const perRecordCoverage = courseRecords.map(row => {
      let count = 0;
      for (const [key] of EVIDENCE_FIELDS) {
        if (key === "data" ? (text(row.data_table) || text(row.evidence)) : key === "reasoning" ? text(row.evidence_reasoning) : text(row[key])) count++;
      }
      return count / EVIDENCE_FIELDS.length * 100;
    });
    return {
      courseId: course.id,
      title: course.title,
      pre: stages.pre,
      post: stages.post,
      paired: {
        participants: paired.length,
        averagePre: numericMean(preScores),
        averagePost: numericMean(postScores),
        averageChange: numericMean(deltas)
      },
      inquiry: {
        records: courseRecords.length,
        learners: new Set(courseRecords.map(row => String(row.learner_id))).size,
        averageElementCoverage: numericMean(perRecordCoverage),
        elements
      }
    };
  });
  return {
    results,
    unmatchedRecordCount,
    note: "前后测变化仅统计同一学生在同一课程均有前测和后测的配对记录；作品要素覆盖率仅表示记录字段是否填写，不等同于科学能力得分。课程关联依据探究记录中的课程主题与课程题目/标题精确匹配。所有结果均为描述性统计，不作因果推断。"
  };
}

export function registerV510Routes({ app, apiLimiter, requireTeacher, teacherId, requireDatabase, db }) {
  app.get("/api/teacher/classes/:id/learning-evidence", apiLimiter, requireTeacher, requireDatabase, async (req, res) => {
    const classId = String(req.params.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) {
      return res.status(404).json({ error: "班级不存在。" });
    }
    try {
      const own = await db.query("SELECT id FROM science_classes WHERE id=$1 AND teacher_id=$2", [classId, teacherId(req)]);
      if (!own.rowCount) return res.status(404).json({ error: "班级不存在或无权查看。" });
      const [assessmentRows, recordRows] = await Promise.all([
        db.query("SELECT course_id,stage,learner_id,answers,score FROM course_assessment_results WHERE class_id=$1", [classId]),
        db.query("SELECT learner_id,topic,question,hypothesis,method,data_table,evidence,conclusion,evidence_reasoning FROM science_records WHERE class_id=$1", [classId])
      ]);
      res.json(buildLearningEvidenceReport({ assessments: assessmentRows.rows, records: recordRows.rows }));
    } catch (error) {
      console.error("teacher_learning_evidence_failed", error.message);
      res.status(503).json({ error: "教学评价闭环分析暂不可用，请稍后重试。" });
    }
  });
}
