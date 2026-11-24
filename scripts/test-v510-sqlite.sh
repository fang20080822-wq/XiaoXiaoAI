#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
db="$tmp/v510.sqlite"
sqlite3 "$db" "CREATE TABLE science_learners(id TEXT PRIMARY KEY);"
bash migrations/apply-v510-sqlite.sh "$db"
bash migrations/apply-v510-sqlite.sh "$db"
columns="$(sqlite3 "$db" "PRAGMA table_info(chat_memory_summaries);")"
for column in student_id session_id summary messages_since_summary summarizing updated_at; do
  printf '%s\n' "$columns" | grep -q "|$column|" || { echo "FAIL missing column $column" >&2; exit 1; }
done
indexes="$(sqlite3 "$db" "PRAGMA index_list(chat_memory_summaries);")"
printf '%s\n' "$indexes" | grep -q 'idx_chat_memory_updated'
echo "V5.10 SQLite migration idempotency passed."
