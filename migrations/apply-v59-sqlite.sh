#!/usr/bin/env bash
set -euo pipefail
DB_FILE="${1:?Usage: bash migrations/apply-v59-sqlite.sh path/to/database.sqlite}"
command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 CLI is required" >&2; exit 1; }
has_column() { sqlite3 "$DB_FILE" "PRAGMA table_info($1);" | awk -F'|' -v c="$2" '$2==c{found=1} END{exit !found}'; }
add_column() { if ! has_column "$1" "$2"; then sqlite3 "$DB_FILE" "ALTER TABLE $1 ADD COLUMN $2 $3;"; fi; }
add_column science_classes group "TEXT NOT NULL DEFAULT 'experimental'"
add_column science_learners student_code "TEXT"
add_column messages is_direct_answer "INTEGER NOT NULL DEFAULT 0"
sqlite3 "$DB_FILE" <<'SQL'
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES science_learners(id) ON DELETE CASCADE,
 record_id TEXT REFERENCES science_records(id) ON DELETE SET NULL,
 step TEXT NOT NULL CHECK(step IN ('observe','question','hypothesis','variables','method','data','evidence','conclusion','reflection','submit')),
 action TEXT NOT NULL CHECK(action IN ('edit','save','hint','submit','reload')),
 hint_level INTEGER, field_key TEXT NOT NULL DEFAULT '', ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK ((action='hint' AND hint_level BETWEEN 1 AND 4) OR (action<>'hint' AND hint_level IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_events_student_ts ON events(student_id,ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_record_action_ts ON events(record_id,action,ts);
CREATE TABLE IF NOT EXISTS surveys (
 id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES science_learners(id) ON DELETE CASCADE,
 stage TEXT NOT NULL CHECK(stage IN ('pre','post')), answers TEXT NOT NULL,
 total REAL NOT NULL, d1 REAL NOT NULL, d2 REAL NOT NULL, d3 REAL NOT NULL, d4 REAL NOT NULL, d5 REAL NOT NULL,
 ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(student_id,stage)
);
CREATE INDEX IF NOT EXISTS idx_surveys_student_stage ON surveys(student_id,stage);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learners_class_student_code ON science_learners(class_id,student_code) WHERE student_code IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS trg_assign_science_student_code
AFTER INSERT ON science_learners
WHEN NEW.student_code IS NULL OR NEW.student_code=''
BEGIN
 UPDATE science_learners
 SET student_code='S'||printf('%03d',(
   SELECT COALESCE(MAX(CAST(substr(student_code,2) AS INTEGER)),0)+1
   FROM science_learners WHERE class_id=NEW.class_id AND id<>NEW.id
 ))
 WHERE id=NEW.id;
END;
SQL
echo "V5.9 SQLite migration applied."
