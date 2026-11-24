#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?Set BASE_URL, e.g. https://xiaoxiaai-scientist.onrender.com}"
: "${STUDENT_TOKEN:?Set STUDENT_TOKEN to a valid student session token}"
: "${TEACHER_TOKEN:?Set TEACHER_TOKEN to the class owner teacher token}"
: "${OTHER_TEACHER_TOKEN:?Set OTHER_TEACHER_TOKEN to a different teacher token}"
: "${CLASS_ID:?Set CLASS_ID to a class owned by TEACHER_TOKEN}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
base="${BASE_URL%/}"

request() {
  local name="$1" expected="$2" token="$3" method="$4" url="$5" body="${6:-}" output="$tmp/$name.out"
  local status
  status="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-binary "$body")"
  if [[ "$status" != "$expected" ]]; then
    echo "FAIL $name: expected HTTP $expected, got $status" >&2
    cat "$output" >&2
    exit 1
  fi
  echo "PASS $name: HTTP $status"
}

answers='[1,2,3,4,5,1,2,3,4,5,1,2,3,4,5,1,2,3,4,5]'
record_json="{\"recordId\":\"$RECORD_ID\"}"
request event 201 "$STUDENT_TOKEN" POST "$base/api/student/events" "{\"step\":\"observe\",\"action\":\"save\",$record_json}"
request hint_event 201 "$STUDENT_TOKEN" POST "$base/api/student/events" "{\"step\":\"question\",\"action\":\"hint\",\"hintLevel\":2,$record_json}"
request revision_event 201 "$STUDENT_TOKEN" POST "$base/api/student/events" "{\"step\":\"question\",\"action\":\"edit\",\"field\":\"researchQuestion\",$record_json}"
request survey_submit 200 "$STUDENT_TOKEN" POST "$base/api/survey/submit" "{\"stage\":\"pre\",\"answers\":$answers}"
grep -q '"total":2.6' "$tmp/survey_submit.out"
grep -q '"d1":2.5' "$tmp/survey_submit.out"
grep -q '"d2":1.75' "$tmp/survey_submit.out"
grep -q '"d3":2.5' "$tmp/survey_submit.out"
grep -q '"d4":2.75' "$tmp/survey_submit.out"
grep -q '"d5":3.5' "$tmp/survey_submit.out"
request survey_mine 200 "$STUDENT_TOKEN" GET "$base/api/survey/mine"
grep -q '"pre":{' "$tmp/survey_mine.out"
request process 200 "$TEACHER_TOKEN" GET "$base/api/teacher/classes/$CLASS_ID/process"
grep -q '"hint_adherence_rate":' "$tmp/process.out"
grep -q '"variable_correct_rate":' "$tmp/process.out"
grep -q '"avg_revisions":' "$tmp/process.out"
grep -q '"events_total":' "$tmp/process.out"
grep -q '"hint_adherence_rate":100' "$tmp/process.out"
grep -q '"avg_revisions":1' "$tmp/process.out"
request csv 200 "$TEACHER_TOKEN" GET "$base/api/teacher/classes/$CLASS_ID/export.csv"
header="$(head -n 1 "$tmp/csv.out" | sed 's/^\xEF\xBB\xBF//' | tr -d '\r')"
expected='student_code,group,record_id,created_at,level,completeness,evidence_ok,topic,question,observed_phenomenon,question_boundary,measurement_indicator,hypothesis,hypothesis_basis,expected_result,independent_variable,dependent_variable,control_variables,control_rationale,repetition_count,method,data_table,evidence,anomaly_handling,evidence_reasoning,conclusion,reflection,pre_total,pre_d1,pre_d2,pre_d3,pre_d4,pre_d5,post_total,post_d1,post_d2,post_d3,post_d4,post_d5'
[[ "$header" == "$expected" ]] || { echo "FAIL CSV header mismatch" >&2; echo "$header" >&2; exit 1; }
if printf '%s' "$header" | grep -Eiq '(^|,)(alias|email|ip|token)(,|$)'; then echo "FAIL CSV contains prohibited identity columns" >&2; exit 1; fi
if ! head -c 3 "$tmp/csv.out" | od -An -t x1 | grep -q 'ef bb bf'; then echo "FAIL CSV missing UTF-8 BOM" >&2; exit 1; fi
echo "PASS CSV header, no alias/email/IP/token columns, UTF-8 BOM"
request cross_teacher 404 "$OTHER_TEACHER_TOKEN" GET "$base/api/teacher/classes/$CLASS_ID/process"

if [[ -n "${EMPTY_CLASS_ID:-}" ]]; then
  request empty_process 200 "$TEACHER_TOKEN" GET "$base/api/teacher/classes/$EMPTY_CLASS_ID/process"
  grep -q '"hint_adherence_rate":0' "$tmp/empty_process.out"
  grep -q '"variable_correct_rate":0' "$tmp/empty_process.out"
  grep -q '"avg_revisions":0' "$tmp/empty_process.out"
  grep -q '"events_total":0' "$tmp/empty_process.out"
  echo "PASS empty class process returns all zeros"
fi

echo "V5.9 curl acceptance passed."
