ALTER TABLE terminal_exam_subjects ADD COLUMN IF NOT EXISTS theory_marks NUMERIC(8,2);
ALTER TABLE terminal_exam_subjects ADD COLUMN IF NOT EXISTS oral_marks NUMERIC(8,2);
UPDATE terminal_exam_subjects SET theory_marks=full_marks, oral_marks=0 WHERE theory_marks IS NULL;
