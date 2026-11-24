#!/usr/bin/env bash
set -euo pipefail
DB_FILE="${1:?Usage: bash migrations/apply-v510-sqlite.sh path/to/database.sqlite}"
command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 CLI is required" >&2; exit 1; }
sqlite3 "$DB_FILE" <<'SQL'
CREATE TABLE IF NOT EXISTS chat_memory_summaries (
  student_id TEXT NOT NULL REFERENCES science_learners(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  messages_since_summary INTEGER NOT NULL DEFAULT 0 CHECK(messages_since_summary >= 0),
  summarizing INTEGER NOT NULL DEFAULT 0 CHECK(summarizing IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(student_id,session_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_memory_updated ON chat_memory_summaries(student_id,updated_at DESC);
SQL
echo "V5.10 SQLite migration applied."
