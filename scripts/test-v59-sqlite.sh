#!/usr/bin/env bash
set -euo pipefail
command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 CLI is required" >&2; exit 2; }
DB="$(mktemp)"
trap 'rm -f "$DB"' EXIT
sqlite3 "$DB" <<'SQL'
PRAGMA foreign_keys=ON;
CREATE TABLE science_classes(id TEXT PRIMARY KEY,teacher_id TEXT,class_name TEXT,invite_code TEXT,created_at TEXT);
CREATE TABLE science_learners(id TEXT PRIMARY KEY,class_id TEXT REFERENCES science_classes(id),alias TEXT);
CREATE TABLE science_records(id TEXT PRIMARY KEY);
CREATE TABLE messages(id TEXT PRIMARY KEY);
INSERT INTO science_classes(id,teacher_id,class_name,invite_code) VALUES('class-1','teacher-1','CI','ABCD1234');
INSERT INTO science_learners(id,class_id,alias) VALUES('student-1','class-1','learner-a');
SQL
bash migrations/apply-v59-sqlite.sh "$DB"
bash migrations/apply-v59-sqlite.sh "$DB"
[[ "$(sqlite3 "$DB" "SELECT student_code FROM science_learners WHERE id='student-1';")" == "S001" ]]
sqlite3 "$DB" "INSERT INTO science_learners(id,class_id,alias) VALUES('student-2','class-1','learner-b');"
[[ "$(sqlite3 "$DB" "SELECT student_code FROM science_learners WHERE id='student-2';")" == "S002" ]]
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('events','surveys');")" == "2" ]]
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_table_info('messages') WHERE name='is_direct_answer';")" == "1" ]]
[[ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_table_info('science_classes') WHERE name='group';")" == "1" ]]
echo "SQLite V5.9 migration passed: repeatability, tables, direct-answer flag and masked IDs."
