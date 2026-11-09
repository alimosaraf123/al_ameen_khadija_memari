CREATE TABLE IF NOT EXISTS call_logs (
  id BIGSERIAL PRIMARY KEY,
  call_sid VARCHAR(100) UNIQUE NOT NULL,
  from_number VARCHAR(30) NOT NULL,
  to_number VARCHAR(30) NOT NULL,
  caller_id VARCHAR(30) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated',
  duration INTEGER DEFAULT 0,
  recording_url TEXT,
  initiated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  notes TEXT,
  context VARCHAR(50) DEFAULT 'manual',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_student_id ON call_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_initiated_by ON call_logs(initiated_by);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at DESC);

