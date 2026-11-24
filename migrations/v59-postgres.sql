-- V5.9 PostgreSQL migration. Safe to run repeatedly.
ALTER TABLE science_classes ADD COLUMN IF NOT EXISTS "group" TEXT NOT NULL DEFAULT 'experimental';
ALTER TABLE science_learners ADD COLUMN IF NOT EXISTS student_code TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_direct_answer INTEGER NOT NULL DEFAULT 0;

DO $v59$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='science_classes_group_check' AND conrelid='science_classes'::regclass) THEN
    ALTER TABLE science_classes ADD CONSTRAINT science_classes_group_check CHECK ("group" IN ('experimental','control'));
  END IF;
END
$v59$;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES science_learners(id) ON DELETE CASCADE,
  record_id UUID REFERENCES science_records(id) ON DELETE SET NULL,
  step TEXT NOT NULL CHECK(step IN ('observe','question','hypothesis','variables','method','data','evidence','conclusion','reflection','submit')),
  action TEXT NOT NULL CHECK(action IN ('edit','save','hint','submit','reload')),
  hint_level INTEGER,
  field_key TEXT NOT NULL DEFAULT '',
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((action='hint' AND hint_level BETWEEN 1 AND 4) OR (action<>'hint' AND hint_level IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_events_student_ts ON events(student_id,ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_record_action_ts ON events(record_id,action,ts);

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES science_learners(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('pre','post')),
  answers JSONB NOT NULL,
  total NUMERIC(4,2) NOT NULL,
  d1 NUMERIC(4,2) NOT NULL,
  d2 NUMERIC(4,2) NOT NULL,
  d3 NUMERIC(4,2) NOT NULL,
  d4 NUMERIC(4,2) NOT NULL,
  d5 NUMERIC(4,2) NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id,stage)
);
CREATE INDEX IF NOT EXISTS idx_surveys_student_stage ON surveys(student_id,stage);

WITH missing AS (
  SELECT id,class_id,ROW_NUMBER() OVER(PARTITION BY class_id ORDER BY id) AS rn
  FROM science_learners WHERE student_code IS NULL OR BTRIM(student_code)=''
), offsets AS (
  SELECT class_id,COALESCE(MAX(NULLIF(regexp_replace(student_code,'[^0-9]','','g'),'')::INTEGER),0) AS base
  FROM science_learners GROUP BY class_id
)
UPDATE science_learners l
SET student_code='S'||LPAD((o.base+m.rn)::TEXT,GREATEST(3,LENGTH((o.base+m.rn)::TEXT)),'0')
FROM missing m JOIN offsets o ON o.class_id=m.class_id
WHERE l.id=m.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_learners_class_student_code ON science_learners(class_id,student_code)
WHERE student_code IS NOT NULL;

CREATE OR REPLACE FUNCTION assign_science_student_code() RETURNS trigger AS $$
DECLARE next_code INTEGER;
BEGIN
  IF NEW.student_code IS NULL OR BTRIM(NEW.student_code)='' THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.class_id::TEXT));
    SELECT COALESCE(MAX(NULLIF(regexp_replace(student_code,'[^0-9]','','g'),'')::INTEGER),0)+1
      INTO next_code FROM science_learners WHERE class_id=NEW.class_id;
    NEW.student_code := 'S'||LPAD(next_code::TEXT,GREATEST(3,LENGTH(next_code::TEXT)),'0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_science_student_code ON science_learners;
CREATE TRIGGER trg_assign_science_student_code
BEFORE INSERT ON science_learners
FOR EACH ROW EXECUTE FUNCTION assign_science_student_code();
