const pool = require('../src/db');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS omr_answer_keys (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      exam_name VARCHAR(255),
      total_questions INT DEFAULT 35,
      marks_per_correct NUMERIC(8,2) DEFAULT 1.0,
      negative_mark NUMERIC(8,2) DEFAULT 0.0,
      full_marks NUMERIC(8,2) DEFAULT 35.0,
      answer_key JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Table omr_answer_keys is ready');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
