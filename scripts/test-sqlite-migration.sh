#!/usr/bin/env bash
set -euo pipefail
command -v sqlite3 >/dev/null || { echo "sqlite3 CLI is required" >&2; exit 2; }
DB="$(mktemp)"
trap 'rm -f "$DB"' EXIT

# Simulate a legacy V5.6 SQLite database with a minimal existing schema.
sqlite3 "$DB" <<'SQL'
CREATE TABLE teachers(id TEXT PRIMARY KEY);
CREATE TABLE science_learners(id TEXT PRIMARY KEY);
CREATE TABLE science_records(id TEXT PRIMARY KEY);
SQL

bash migrations/apply-v57-sqlite.sh "$DB"
bash migrations/apply-v57-sqlite.sh "$DB"

sqlite3 "$DB" "INSERT INTO teachers(id,email,password_hash,pw_hash,salt,school,status) VALUES('teacher-1','teacher@example.test','hash','hash','salt','CI School','approved');"
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM teachers WHERE email='teacher@example.test' AND status='approved' AND created_at<>'';")" == "1" ]]
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('sessions','messages');")" == "2" ]]
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_table_info('science_learners') WHERE name='grade';")" == "1" ]]
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_table_info('science_records') WHERE name IN ('level','level_json');")" == "2" ]]

if sqlite3 "$DB" "INSERT INTO teachers(id,email) VALUES('teacher-2','teacher@example.test');" >/dev/null 2>&1; then
  echo "Duplicate teacher email was accepted" >&2
  exit 1
fi
echo "SQLite V5.7 migration passed: legacy schema upgrade, idempotency, required columns and unique teacher email."
