const pool = require('../src/db');

const key = {
  "1": "A", "2": "B", "3": "D", "4": "C", "5": "B",
  "6": "B", "7": "C", "8": "B", "9": "C", "10": "B",
  "11": "B", "12": "C", "13": "B", "14": "C", "15": "D",
  "16": "A", "17": "D", "18": "A", "19": "D", "20": "B",
  "21": "B", "22": "C", "23": "D", "24": "A", "25": "B",
  "26": "C", "27": "D", "28": "C", "29": "C", "30": "B",
  "31": "D", "32": "D", "33": "C", "34": "C", "35": "C"
};

async function run() {
  try {
    const q = await pool.query(
      `UPDATE omr_answer_keys 
       SET exam_name = $1, answer_key = $2, total_questions = 35, full_marks = 35.0, marks_per_correct = 1.0, negative_mark = 0.0, updated_at = NOW()
       WHERE name = $3
       RETURNING *`,
      ['Class-XI 1st semister 2026 Biology', JSON.stringify(key), 'Class-XI 1st semister 2026 Biology']
    );
    if (q.rowCount === 0) {
      await pool.query(
        `INSERT INTO omr_answer_keys(name, exam_name, total_questions, marks_per_correct, negative_mark, full_marks, answer_key)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        ['Class-XI 1st semister 2026 Biology', 'Class-XI 1st semister 2026 Biology', 35, 1.0, 0.0, 35.0, JSON.stringify(key)]
      );
      console.log('Inserted preset with all 35 answers');
    } else {
      console.log('Updated preset with all 35 answers:', q.rows[0].name);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

run();
