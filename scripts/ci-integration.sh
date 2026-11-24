#!/usr/bin/env bash
set -euo pipefail

export BASE_URL="http://127.0.0.1:3000"
export TEACHER_EMAIL="teacher-a@example.test"
export TEACHER_PASSWORD="V5_7_CI_Teacher_A_2026!"
export TEACHER_B_EMAIL="teacher-b@example.test"
export TEACHER_B_PASSWORD="V5_7_CI_Teacher_B_2026!"
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/xiaoxiao_test}"
export DATABASE_SSL="false"
export TOKEN_SECRET="ci-only-token-secret-do-not-use-in-production"
export ADMIN_PASSWORD="ci-only-admin-password"
export PORT=3000

LOG_FILE="$(mktemp)"
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

node server.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then cat "$LOG_FILE"; exit 1; fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then cat "$LOG_FILE"; echo "Server did not become healthy" >&2; exit 1; fi

register_teacher() {
  local email="$1" password="$2"
  local response
  response="$(curl -fsS -X POST "$BASE_URL/api/teacher/register" -H 'Content-Type: application/json' -d "$(jq -nc --arg e "$email" --arg p "$password" '{email:$e,password:$p,school:"CI测试学校"}')")"
  jq -e '.status=="approved" and (.token|length>20)' <<<"$response" >/dev/null
  local token
  token="$(jq -r '.token' <<<"$response")"
  if [[ "$email" == "$TEACHER_EMAIL" ]]; then TEACHER_A_TOKEN="$token"; else TEACHER_B_TOKEN="$token"; fi
  curl -fsS "$BASE_URL/api/teacher/dashboard" -H "Authorization: Bearer $token" | jq -e '.classes|type=="array"' >/dev/null
}
TEACHER_A_TOKEN=""
TEACHER_B_TOKEN=""
register_teacher "$TEACHER_EMAIL" "$TEACHER_PASSWORD"
register_teacher "$TEACHER_B_EMAIL" "$TEACHER_B_PASSWORD"

RUN_CLASS_STATS_ACCEPTANCE=1 bash scripts/accept-v57.sh

# V5.9 end-to-end acceptance: one populated class and one empty class.
CLASS_A="$(curl -fsS -X POST "$BASE_URL/api/teacher/classes" -H "Authorization: Bearer $TEACHER_A_TOKEN" -H 'Content-Type: application/json' -d '{"className":"V59 CI populated class"}')"
CLASS_ID="$(jq -r '.class.id' <<<"$CLASS_A")"
INVITE_CODE="$(jq -r '.class.invite_code' <<<"$CLASS_A")"
EMPTY_CLASS="$(curl -fsS -X POST "$BASE_URL/api/teacher/classes" -H "Authorization: Bearer $TEACHER_A_TOKEN" -H 'Content-Type: application/json' -d '{"className":"V59 CI empty class"}')"
EMPTY_CLASS_ID="$(jq -r '.class.id' <<<"$EMPTY_CLASS")"
STUDENT_JOIN="$(curl -fsS -X POST "$BASE_URL/api/student/join" -H 'Content-Type: application/json' -d "$(jq -nc --arg code "$INVITE_CODE" '{inviteCode:$code,alias:"V59CI",grade:"3-4",guardianConsent:true}')")"
STUDENT_TOKEN="$(jq -r '.token' <<<"$STUDENT_JOIN")"
RECORD_RESPONSE="$(curl -fsS -X POST "$BASE_URL/api/student/records" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d '{"topic":"CI plant inquiry","question":"Does light affect growth?","hypothesis":"More light may increase growth","independentVariable":"light level","dependentVariable":"plant height","controlVariables":"same plant type, same water","method":"Measure height daily","evidence":"Day 1: 2 cm; Day 2: 3 cm","conclusion":"The sample grew","repetitionCount":3}')"
RECORD_ID="$(jq -r '.record.id' <<<"$RECORD_RESPONSE")"
export STUDENT_TOKEN TEACHER_TOKEN="$TEACHER_A_TOKEN" OTHER_TEACHER_TOKEN="$TEACHER_B_TOKEN" CLASS_ID EMPTY_CLASS_ID RECORD_ID
bash scripts/accept-v59.sh
