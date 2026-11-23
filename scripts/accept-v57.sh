#!/usr/bin/env bash
# V5.7 staging acceptance: 18 checks. Requires bash, curl, jq.
# Run only against a staging deployment; it creates a class, learner and record.
set -euo pipefail
: "${BASE_URL:?Set BASE_URL, e.g. https://staging.example.com}"
: "${TEACHER_EMAIL:?Set an approved TEACHER_EMAIL}"
: "${TEACHER_PASSWORD:?Set TEACHER_PASSWORD}"
: "${TEACHER_B_EMAIL:?Set a second approved teacher for isolation testing}"
: "${TEACHER_B_PASSWORD:?Set TEACHER_B_PASSWORD}"
command -v curl >/dev/null || { echo "curl is required"; exit 2; }
command -v jq >/dev/null || { echo "jq is required"; exit 2; }
BASE_URL="${BASE_URL%/}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
PASS=0
fail(){ echo "FAIL: $1"; echo "$RESP" | jq . 2>/dev/null || echo "$RESP"; exit 1; }
check(){ PASS=$((PASS+1)); echo "PASS $PASS/18: $1"; }
request(){
  local method="$1" path="$2" data="${3-}" token="${4-}"
  local args=(-sS -X "$method" "$BASE_URL$path" -o "$TMP" -w '%{http_code}' -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$data" ]] && args+=(-d "$data")
  STATUS="$(curl "${args[@]}")"
  RESP="$(cat "$TMP")"
}
expect(){ [[ "$STATUS" == "$1" ]] || fail "$2 (HTTP $STATUS, expected $1)"; }
# 1 health/version
request GET /api/health
expect 200 "health endpoint"
[[ "$(jq -r '.ok' <<<"$RESP")" == "true" && "$(jq -r '.version' <<<"$RESP")" == "5.7.0" ]] || fail "health/version payload"
check "health reports V5.7.0"
# 2 privacy page
request GET /privacy
expect 200 "privacy page"
grep -q "隐私政策" <<<"$RESP" || fail "privacy page content"
check "privacy page"
# 3 terms page
request GET /terms
expect 200 "terms page"
grep -q "使用条款" <<<"$RESP" || fail "terms page content"
check "terms page"
# 4 data policy disclosure
request GET /data-policy
expect 200 "data policy"
grep -q "尚未接入监护人身份核验" <<<"$RESP" || fail "guardian identity verification disclosure"
check "data policy states guardian identity is not verified"
# 5 legacy teacher shared password is retired
request POST /api/teacher/login '{"password":"not-used"}'
expect 410 "legacy teacher login"
check "legacy shared teacher login returns HTTP 410"
# 6 teacher account login
request POST /api/teacher/account/login "$(jq -nc --arg e "$TEACHER_EMAIL" --arg p "$TEACHER_PASSWORD" '{email:$e,password:$p}')"
expect 200 "teacher account login"
TEACHER_TOKEN="$(jq -r '.token // empty' <<<"$RESP")"
[[ -n "$TEACHER_TOKEN" ]] || fail "teacher token missing"
check "approved teacher email/password login"
# 7 teacher dashboard
request GET /api/teacher/dashboard "" "$TEACHER_TOKEN"
expect 200 "teacher dashboard"
check "teacher dashboard authorization"
# 8 teacher class list
request GET /api/teacher/classes "" "$TEACHER_TOKEN"
expect 200 "teacher class list"
check "teacher sees own class list"
# 9 create test class
request POST /api/teacher/classes '{"className":"V5.7验收临时班级"}' "$TEACHER_TOKEN"
expect 201 "create test class"
CLASS_ID="$(jq -r '.class.id // empty' <<<"$RESP")"
INVITE_CODE="$(jq -r '.class.invite_code // empty' <<<"$RESP")"
[[ -n "$CLASS_ID" && -n "$INVITE_CODE" ]] || fail "class creation payload"
check "teacher creates a class"
# 10 student joins with grade
ALIAS="验收$(date +%H%M%S)"
request POST /api/student/join "$(jq -nc --arg c "$INVITE_CODE" --arg a "$ALIAS" '{inviteCode:$c,alias:$a,grade:"5-6",guardianConsent:true}')"
expect 200 "student join"
STUDENT_TOKEN="$(jq -r '.token // empty' <<<"$RESP")"
[[ -n "$STUDENT_TOKEN" ]] || fail "student token missing"
check "student joins with 5-6 grade and receives session"
# 11 minimum-field record submission
request POST /api/student/records '{"topic":"验收：植物吸水","question":"光照变化会影响植物吸水吗？"}' "$STUDENT_TOKEN"
expect 201 "minimum record submission"
RECORD_ID="$(jq -r '.record.id // empty' <<<"$RESP")"
[[ -n "$RECORD_ID" && "$(jq -r '.level // 0' <<<"$RESP")" -ge 1 ]] || fail "record level missing"
check "record submits with only topic and question"
# 12 student reads own record and level
request GET /api/student/records "" "$STUDENT_TOKEN"
expect 200 "student record list"
jq -e '.records|length>0 and .[0].level>=1 and (.[0].level_json|type=="object")' <<<"$RESP" >/dev/null || fail "record level fields missing"
check "student record returns stored level and level_json"
# 13 PII submission rejected
request POST /api/student/records '{"topic":"隐私检查","question":"我的手机号是13800138000"}' "$STUDENT_TOKEN"
expect 400 "PII rejection"
check "PII is rejected in inquiry text"
# 14 SSE streaming returns delta and done
SESSION_ID="$(cat /proc/sys/kernel/random/uuid)"
STATUS="$(curl -sS -N -X POST "$BASE_URL/api/chat/stream" -H 'Content-Type: application/json' -H "Authorization: Bearer $STUDENT_TOKEN" -d "$(jq -nc --arg sid "$SESSION_ID" '{sessionId:$sid,message:"什么是科学观察？",mode:"curiosity",topic:"general"}')" -o "$TMP" -w '%{http_code}')"
RESP="$(cat "$TMP")"
[[ "$STATUS" == "200" ]] || fail "SSE chat (HTTP $STATUS)"
grep -q '"delta"' <<<"$RESP" && grep -q '"done":true' <<<"$RESP" || fail "SSE delta/done events"
check "SSE chat streams delta and done events"
# 15 read session-owned history
request GET "/api/chat/history/$SESSION_ID" "" "$STUDENT_TOKEN"
expect 200 "chat history"
jq -e '.messages|length>=2' <<<"$RESP" >/dev/null || fail "chat history messages missing"
check "student can read own chat history"
# 16 delete own history
request DELETE "/api/chat/history/$SESSION_ID" "" "$STUDENT_TOKEN"
expect 200 "delete chat history"
[[ "$(jq -r '.cleared' <<<"$RESP")" == "true" ]] || fail "history deletion result"
check "student can delete own chat history"
# 17 teacher class statistics
request GET "/api/teacher/classes/$CLASS_ID/stats" "" "$TEACHER_TOKEN"
expect 200 "class stats"
jq -e '.learners>=1 and .submitted>=1 and (.levels|has("L1") and has("L4"))' <<<"$RESP" >/dev/null || fail "class statistics payload"
check "teacher class statistics and level distribution"
# 18 second teacher cannot read first teacher class
request POST /api/teacher/account/login "$(jq -nc --arg e "$TEACHER_B_EMAIL" --arg p "$TEACHER_B_PASSWORD" '{email:$e,password:$p}')"
expect 200 "second teacher login"
TEACHER_B_TOKEN="$(jq -r '.token // empty' <<<"$RESP")"
[[ -n "$TEACHER_B_TOKEN" ]] || fail "second teacher token missing"
request GET "/api/teacher/classes/$CLASS_ID/stats" "" "$TEACHER_B_TOKEN"
expect 404 "cross-teacher class isolation"
check "teacher B receives 404 for teacher A class"
echo "All 18 V5.7 staging acceptance checks passed."
