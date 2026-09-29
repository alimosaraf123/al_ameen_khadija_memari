CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  login_id VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('super_admin','admin','teacher','guardian')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  designation VARCHAR(100), subject VARCHAR(100), mobile VARCHAR(30), email VARCHAR(150), address TEXT,
  date_of_birth DATE, joining_date DATE, qualification VARCHAR(200), photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  registration_no VARCHAR(100) UNIQUE NOT NULL,
  admission_no VARCHAR(100), student_name VARCHAR(150) NOT NULL, class_name VARCHAR(50), roll_no VARCHAR(50),
  room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
  date_of_birth DATE, gender VARCHAR(20), father_name VARCHAR(150), mother_name VARCHAR(150), guardian_name VARCHAR(150),
  guardian_mobile VARCHAR(30), alternate_mobile VARCHAR(30), address TEXT, village VARCHAR(150), post_office VARCHAR(150),
  police_station VARCHAR(150), district VARCHAR(150), pin_code VARCHAR(20), admission_date DATE,
  student_type VARCHAR(30) CHECK (student_type IN ('hostel','day_scholar')), photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_room_assignments (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  assigned_date DATE DEFAULT CURRENT_DATE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(teacher_id,room_id)
);

CREATE TABLE IF NOT EXISTS guardian_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guardian_name VARCHAR(150) NOT NULL, mobile VARCHAR(30), alternate_mobile VARCHAR(30), email VARCHAR(150), address TEXT, photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id BIGINT NOT NULL REFERENCES guardian_profiles(id) ON DELETE CASCADE,
  relation_type VARCHAR(50), is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(student_id,guardian_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK(status IN ('present','absent')),
  remarks TEXT, marked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id,attendance_date)
);

CREATE TABLE IF NOT EXISTS illness_records (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE, illness_details TEXT, action_taken TEXT,
  reported_by BIGINT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_behavior (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE, behavior_type VARCHAR(100), details TEXT NOT NULL, action_taken TEXT,
  reported_by BIGINT REFERENCES users(id) ON DELETE SET NULL, guardian_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_problem_reports (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
  problem_type VARCHAR(100) NOT NULL, details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
  reported_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS routines (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200), routine_date DATE, routine_text TEXT, file_url TEXT,
  published_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notices (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL, notice_text TEXT, notice_type VARCHAR(50), attachment_url TEXT,
  published_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notice_targets (
  id BIGSERIAL PRIMARY KEY,
  notice_id BIGINT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  target_type VARCHAR(30) NOT NULL CHECK(target_type IN ('all','class','room','student','guardian')),
  target_value VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS subjects (
  id BIGSERIAL PRIMARY KEY,
  subject_name VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_name VARCHAR(50), can_enter_marks BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(teacher_id,subject_id,class_name)
);

CREATE TABLE IF NOT EXISTS exams (
  id BIGSERIAL PRIMARY KEY,
  exam_name VARCHAR(150) NOT NULL, class_name VARCHAR(50) NOT NULL, session_name VARCHAR(50), exam_date DATE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_subjects (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  full_marks NUMERIC(8,2) NOT NULL DEFAULT 100, pass_marks NUMERIC(8,2) DEFAULT 0,
  UNIQUE(exam_id,subject_id)
);

CREATE TABLE IF NOT EXISTS student_marks (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  obtained_marks NUMERIC(8,2), grade VARCHAR(20), remarks TEXT,
  entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','rejected')),
  verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL, verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_id,student_id,subject_id)
);

CREATE TABLE IF NOT EXISTS student_documents (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, document_title VARCHAR(200), file_url TEXT NOT NULL,
  guardian_visible BOOLEAN NOT NULL DEFAULT TRUE, guardian_download_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_download_logs (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES student_documents(id) ON DELETE CASCADE,
  guardian_id BIGINT NOT NULL REFERENCES guardian_profiles(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_dues (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  due_title VARCHAR(200) NOT NULL, amount NUMERIC(12,2) NOT NULL DEFAULT 0, due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'due' CHECK(status IN ('due','paid','waived')),
  remarks TEXT, entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id BIGSERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_student_marks_exam ON student_marks(exam_id);
CREATE INDEX IF NOT EXISTS idx_student_marks_student ON student_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_dues_student ON student_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_notice_targets_notice ON notice_targets(notice_id);

CREATE TABLE IF NOT EXISTS attendance_submissions (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  submitted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id,attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_change_logs (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES attendance_submissions(id) ON DELETE CASCADE,
  changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL CHECK(action IN ('submitted','updated')),
  snapshot JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_submissions_room_date ON attendance_submissions(room_id,attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_change_logs_submission ON attendance_change_logs(submission_id,changed_at DESC);
