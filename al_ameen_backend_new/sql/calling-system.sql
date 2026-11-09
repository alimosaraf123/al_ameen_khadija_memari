-- Calling System & Student Relations Schema

CREATE TABLE IF NOT EXISTS student_guardian_contacts (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  father_mobile VARCHAR(30),
  mother_mobile VARCHAR(30),
  guardian_1_mobile VARCHAR(30),
  guardian_1_relation VARCHAR(50),
  guardian_2_mobile VARCHAR(30),
  guardian_2_relation VARCHAR(50),
  guardian_3_mobile VARCHAR(30),
  guardian_3_relation VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_guardian_contacts_student_id ON student_guardian_contacts(student_id);

CREATE TABLE IF NOT EXISTS calling_schedules (
  id BIGSERIAL PRIMARY KEY,
  branch_name VARCHAR(150) DEFAULT 'Al-Ameen Mission Academy Memari (Khadija Campus)',
  session_name VARCHAR(50) NOT NULL,
  class_name VARCHAR(50) NOT NULL,
  section VARCHAR(20) DEFAULT '0',
  gender VARCHAR(20) NOT NULL DEFAULT 'Female',
  allowed_talk_time INTEGER NOT NULL DEFAULT 8,
  days JSONB NOT NULL DEFAULT '["Sun", "Sat"]'::jsonb,
  start_time TIME NOT NULL DEFAULT '04:00:00',
  end_time TIME NOT NULL DEFAULT '23:55:00',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calling_schedules_class_session ON calling_schedules(class_name, session_name, is_active);

CREATE TABLE IF NOT EXISTS student_calling_access (
  student_id BIGINT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  is_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  is_emergency_call BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_until TIMESTAMPTZ,
  ipbx_id VARCHAR(50),
  dial_no VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS reg_no VARCHAR(50);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS called_relation VARCHAR(50);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS allowed_talk_time INTEGER;

