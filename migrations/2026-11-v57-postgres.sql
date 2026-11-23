-- V5.7 PostgreSQL migration. Idempotent; preserves existing V5.6 records.
BEGIN;
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS pw_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT '';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_email_unique ON teachers(LOWER(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher','student','admin')),
  subject_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  student_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'offline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_owner_session_time ON messages(student_id,session_id,created_at DESC);
ALTER TABLE science_learners ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT '3-4';
ALTER TABLE science_records ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4);
ALTER TABLE science_records ADD COLUMN IF NOT EXISTS level_json JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
