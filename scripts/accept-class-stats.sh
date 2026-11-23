#!/usr/bin/env bash
# Class statistics acceptance. Requires bash, curl, jq, Node.js and the existing pg dependency.
# Run against a disposable test/staging database; creates and deletes two temporary classes.
set -euo pipefail
: "${BASE_URL:?Set BASE_URL}"
: "${DATABASE_URL:?Set DATABASE_URL for the same test database used by the app}"
: "${TEACHER_TOKEN:?Pass the teacher A bearer token from the preceding acceptance step}"
: "${TEACHER_B_TOKEN:?Pass the teacher B bearer token from the preceding acceptance step}"
command -v curl >/dev/null
command -v jq >/dev/null
command -v node >/dev/null
BASE_URL="${BASE_URL%/}"
TMP="$(mktemp)"
CLASS_ID=""
EMPTY_CLASS_ID=""
cleanup() {
  if [[ -n "$TEACHER_TOKEN" && -n "$CLASS_ID" ]]; then
    curl -sS -X DELETE "$BASE_URL/api/teacher/classes/$CLASS_ID" -H "Authorization: Bearer $TEACHER_TOKEN" >/dev/null || true
  fi
  if [[ -n "$TEACHER_TOKEN" && -n "$EMPTY_CLASS_ID" ]]; then
    curl -sS -X DELETE "$BASE_URL/api/teacher/classes/$EMPTY_CLASS_ID" -H "Authorization: Bearer $TEACHER_TOKEN" >/dev/null || true
  fi
  rm -f "$TMP"
}
trap cleanup EXIT
fail(){ echo "FAIL: $1"; if [[ -f "$TMP" ]]; then jq . "$TMP" 2>/dev/null || cat "$TMP"; fi; exit 1; }

create_class() {
  local name="$1" response
  response="$(curl -fsS -X POST "$BASE_URL/api/teacher/classes" -H 'Content-Type: application/json' -H "Authorization: Bearer $TEACHER_TOKEN" -d "$(jq -nc --arg n "$name" '{className:$n}')")"
  jq -r '.class.id // empty' <<<"$response"
}
CLASS_ID="$(create_class "统计口径验收临时班级")"
[[ -n "$CLASS_ID" ]] || fail "could not create fixture class"
EMPTY_CLASS_ID="$(create_class "空班验收临时班级")"
[[ -n "$EMPTY_CLASS_ID" ]] || fail "could not create empty class"

# Seed A (no record), B (one L2 record), C (older L2 plus latest L4).
# Every SQL value is parameterized; this is test data only.
CLASS_ID="$CLASS_ID" node --input-type=module <<'NODE'
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : undefined
});
const classId = process.env.CLASS_ID;
await client.connect();
try {
  const learners = {};
  for (const alias of ["学生A","学生B","学生C"]) {
    const result = await client.query(
      "INSERT INTO science_learners(class_id,alias) VALUES($1,$2) RETURNING id",
      [classId,alias]
    );
    learners[alias] = result.rows[0].id;
  }
  const insertRecord = async (learnerId, level, completeness, evidenceOk, createdAt) => {
    const levelJson = {level,dims:{},next_steps:[],completeness,evidence_ok:evidenceOk};
    await client.query(
      "INSERT INTO science_records(class_id,learner_id,topic,question,hypothesis,independent_variable,dependent_variable,control_variables,method,evidence,conclusion,reflection,level,level_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)",
      [classId,learnerId,"验收探究","验收问题","验收假设","光照","生长","水分","观察记录","模拟证据","模拟结论","",level,JSON.stringify(levelJson),createdAt]
    );
  };
  const now = Date.now();
  await insertRecord(learners["学生B"],2,40,false,new Date(now-86400000).toISOString());
  await insertRecord(learners["学生C"],2,20,false,new Date(now-172800000).toISOString());
  await insertRecord(learners["学生C"],4,100,true,new Date(now-3600000).toISOString());
} finally {
  await client.end();
}
NODE

STATUS="$(curl -sS -o "$TMP" -w '%{http_code}' "$BASE_URL/api/teacher/classes/$CLASS_ID/stats" -H "Authorization: Bearer $TEACHER_TOKEN")"
[[ "$STATUS" == "200" ]] || fail "stats endpoint returned HTTP $STATUS"
jq -e '
  .learners == 3 and
  .submitted == 2 and
  .submit_rate == 66.7 and
  .completeness == 70.0 and
  .evidence_rate == 50.0 and
  .levels == {"L1":0,"L2":1,"L3":0,"L4":1} and
  .focus == ["学生B"]
' "$TMP" >/dev/null || fail "three-student latest-record calculation mismatch"
echo "PASS: three-student latest-record scenario"
jq '{learners,submitted,submit_rate,completeness,evidence_rate,levels,focus}' "$TMP"

STATUS="$(curl -sS -o "$TMP" -w '%{http_code}' "$BASE_URL/api/teacher/classes/$EMPTY_CLASS_ID/stats" -H "Authorization: Bearer $TEACHER_TOKEN")"
[[ "$STATUS" == "200" ]] || fail "empty class returned HTTP $STATUS"
jq -e '
  .learners == 0 and .submitted == 0 and .submit_rate == 0 and
  .completeness == 0 and .evidence_rate == 0 and
  .levels == {"L1":0,"L2":0,"L3":0,"L4":0} and .focus == []
' "$TMP" >/dev/null || fail "empty class did not return zero values"
echo "PASS: empty class returns zero values"

STATUS="$(curl -sS -o "$TMP" -w '%{http_code}' "$BASE_URL/api/teacher/classes/$CLASS_ID/stats" -H "Authorization: Bearer $TEACHER_B_TOKEN")"
[[ "$STATUS" == "404" ]] || fail "cross-teacher request returned HTTP $STATUS instead of 404"
echo "PASS: another teacher receives 404"
echo "All class statistics acceptance checks passed."
