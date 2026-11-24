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
    const recommendations = [];
    const preWeak = stages.pre.items.filter(item => item.answered >= 5 && item.errorRate >= 40)
      .sort((a,b) => b.errorRate-a.errorRate);
    for (const item of preWeak.slice(0,2)) {
      recommendations.push({
        type:"pretest",
        priority:item.errorRate>=60?"high":"medium",
        evidence:"课前测评第"+item.index+"题错题率 "+item.errorRate+"%（"+item.incorrect+"/"+item.answered+"）",
        focus:item.objective,
        action:"下一课时先用一个生活情境或实物观察让学生独立表达原有想法，再围绕该目标安排一次短演示；请学生说明观察到的证据，不先公布结论。"
      });
    }
    const postWeak = stages.post.items.filter(item => item.answered >= 5 && item.errorRate >= 30)
      .sort((a,b) => b.errorRate-a.errorRate);
    for (const item of postWeak.slice(0,2)) {
      recommendations.push({
        type:"posttest",
        priority:item.errorRate>=50?"high":"medium",
        evidence:"课后测评第"+item.index+"题仍有 "+item.errorRate+"% 错误（"+item.incorrect+"/"+item.answered+"）",
        focus:item.objective,
        action:"安排针对该目标的二次解释与迁移任务：更换材料或情境，让学生预测、观察、解释，并用新的证据检查理解是否稳固。"
      });
    }
    const inquiryActions = {
      question:"先示范把宽泛主题改写成可观察、可比较的问题；让学生圈出研究对象和要比较的条件。",
      hypothesis:"增加“我猜……因为……”预测卡，要求学生在实验前写下依据，实验后再回看是否需要修订。",
      method:"用步骤图让学生说明材料、操作顺序和只改变的一个条件，再由同伴检查是否可重复。",
      data:"提供带单位和时间栏的记录表，要求至少记录两个以上观察时点或条件，并保留原始观察。",
      conclusion:"使用“我观察到……因此我认为……”句式，要求结论只覆盖实际观察到的范围。",
      reasoning:"增加证据配对活动：每个结论必须指向一条具体数据，并补充这条证据能支持什么、不能证明什么。"
    };
    const inquiryWeak = elements.filter(item => item.total >= 3 && item.rate !== null && item.rate < 70)
      .sort((a,b) => a.rate-b.rate);
    for (const item of inquiryWeak.slice(0,2)) {
      recommendations.push({
        type:"inquiry",
        priority:item.rate<40?"high":"medium",
        evidence:item.label+"仅 "+item.completed+"/"+item.total+" 条探究记录有填写（"+item.rate+"%）",
        focus:item.label,
        action:inquiryActions[item.key]
      });
    }
    if (!recommendations.length) {
      const enoughAssessment = stages.pre.items.some(item=>item.answered>=5) || stages.post.items.some(item=>item.answered>=5);
      const enoughInquiry = courseRecords.length>=3;
      if (!enoughAssessment && !enoughInquiry) recommendations.push({
        type:"data",
        priority:"low",
        evidence:"当前可用样本不足以识别稳定的班级薄弱点",
        focus:"补充完整学习证据",
        action:"先组织学生完成课前测评、课程探究记录和课后测评；积累至少5份测评作答或3份探究记录后，再据此制定针对性改进。"
      });
      else recommendations.push({
        type:"review",
        priority:"low",
        evidence:"当前达到初步观察条件，未触发明显薄弱项阈值",
        focus:"验证迁移与证据质量",
        action:"下一轮增加一道新情境迁移题，并抽查学生能否用具体观察解释结论；不要仅凭当前分数认定已经掌握。"
      });
    }
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
      },
      recommendations
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
