-- V5.10 short-term AI tutor memory. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS chat_memory_summaries (
  student_id UUID NOT NULL REFERENCES science_learners(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  messages_since_summary INTEGER NOT NULL DEFAULT 0 CHECK (messages_since_summary >= 0),
  summarizing BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_memory_updated ON chat_memory_summaries(student_id, updated_at DESC);
