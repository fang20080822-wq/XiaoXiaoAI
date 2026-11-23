#!/usr/bin/env bash
# Idempotent SQLite V5.7 migration runner.
# Requires sqlite3 CLI and an existing V5.6 SQLite database.
set -euo pipefail
DB_PATH="${1:?Usage: bash migrations/apply-v57-sqlite.sh /path/to/database.sqlite}"
command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 CLI is required" >&2; exit 2; }
[[ -f "$DB_PATH" ]] || { echo "Database file not found: $DB_PATH" >&2; exit 2; }

sqlite3 "$DB_PATH" < "$(dirname "$0")/2026-11-v57-sqlite.sql"

has_column() {
  local table="$1" column="$2"
  sqlite3 -noheader -separator '|' "$DB_PATH" "PRAGMA table_info('$table');" |
    awk -F'|' -v name="$column" '$2==name {found=1} END {exit !found}'
}
ensure_column() {
  local table="$1" column="$2" definition="$3"
  if ! has_column "$table" "$column"; then
    sqlite3 "$DB_PATH" "ALTER TABLE \"$table\" ADD COLUMN \"$column\" $definition;"
    echo "Added $table.$column"
  else
    echo "Kept $table.$column"
  fi
}

ensure_column teachers email "TEXT"
ensure_column teachers password_hash "TEXT NOT NULL DEFAULT ''"
ensure_column teachers pw_hash "TEXT NOT NULL DEFAULT ''"
ensure_column teachers salt "TEXT NOT NULL DEFAULT ''"
ensure_column teachers school "TEXT NOT NULL DEFAULT ''"
ensure_column teachers created_at "TEXT NOT NULL DEFAULT ''"
ensure_column teachers status "TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected'))"
ensure_column teachers reviewed_at "TEXT"
sqlite3 "$DB_PATH" "UPDATE teachers SET created_at=CURRENT_TIMESTAMP WHERE created_at='';"
sqlite3 "$DB_PATH" "CREATE TRIGGER IF NOT EXISTS trg_teachers_created_at_default AFTER INSERT ON teachers FOR EACH ROW WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE teachers SET created_at=CURRENT_TIMESTAMP WHERE rowid=NEW.rowid; END;"
sqlite3 "$DB_PATH" "CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_email_unique ON teachers(email) WHERE email IS NOT NULL AND email <> '';"
ensure_column science_learners grade "TEXT NOT NULL DEFAULT '3-4'"
ensure_column science_records level "INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 4)"
ensure_column science_records level_json "TEXT NOT NULL DEFAULT '{}'"
echo "SQLite V5.7 migration completed."
