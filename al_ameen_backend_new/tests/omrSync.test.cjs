// Exercise the route with a fake database: no real student records or marks
// are changed by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
let state;
const student = { id: '738', registration_no: '40554', student_name: 'Sahanaj Parvin', class_name: 'XI-Sc.' };
const fakeClient = {
  async query(sql, params = []) {
    state.queries.push({ sql, params });
    if (sql.includes('SELECT * FROM omr_evaluation_records')) return { rows: [{ id: 49,
      exam_name: 'XI Mathematics', results: [{ registration_no: '2262117678', final_score: 9,
        correct_questions: [1, 3], student_name: 'Candidate #2262117678' }] }] };
    if (sql.includes('SELECT tes.*')) return { rows: [{ id: 12, terminal_exam_id: 3,
      exam_name: 'XI Mathematics', class_name: 'XI-Sc.', subject_name: 'Mathematics',
      status: state.locked ? 'submitted' : 'assigned', exam_status: 'draft' }] };
    if (sql.includes('FROM students')) return { rows: [student] };
    if (sql.includes('INSERT INTO terminal_marks')) {
      assert.match(sql, /ON CONFLICT\(exam_subject_id, student_id\) DO NOTHING/);
      assert.doesNotMatch(sql, /DO UPDATE/);
      return { rowCount: state.existing ? 0 : 1, rows: state.existing ? [] : [{ student_id: params[1] }] };
    }
    return { rows: [], rowCount: 0 };
  },
  release() {},
};
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => fakeClient } };
const router = require('../src/routes/omr');
const sync = router.stack.find(layer => layer.route?.path === '/sync-terminal').route.stack[0].handle;

async function invoke(result, options = {}) {
  state = { queries: [], existing: false, locked: false, ...options };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; } };
  await sync({ body: { exam_subject_id: 12, results: [result] } }, res);
  return res;
}

test('a newly recognized Mission ID saves its score against the correct terminal student', async () => {
  const response = await invoke({ registration_no: '2262118819', mission_reg_no: '40554', student_name: 'Sahanaj Parvin', final_score: 9 });
  assert.equal(response.data.synced_count, 1);
  const insertion = state.queries.find(q => q.sql.includes('INSERT INTO terminal_marks'));
  assert.deepEqual(insertion.params.slice(0, 3), [12, '738', 9]);
  assert.equal(response.data.synced[0].mission_reg_no, '40554');
});

test('reimporting cannot overwrite an existing terminal grade or change a student registration', async () => {
  const response = await invoke({ mission_reg_no: '40554', final_score: 99 }, { existing: true });
  assert.equal(response.statusCode, 409);
  assert.equal(response.data.existing_count, 1);
  assert.ok(state.queries.some(q => q.sql === 'ROLLBACK'));
  assert.ok(!state.queries.some(q => /UPDATE students|UPDATE terminal_exam_subjects/.test(q.sql)));
});

test('an unidentified candidate produces an error without saving any marks', async () => {
  const response = await invoke({ registration_no: 'unknown', student_name: 'Candidate #unknown', final_score: 9 });
  assert.equal(response.statusCode, 422);
  assert.ok(!state.queries.some(q => q.sql.includes('INSERT INTO terminal_marks')));
});

test('submitted terminal subjects remain locked', async () => {
  const response = await invoke({ mission_reg_no: '40554', final_score: 9 }, { locked: true });
  assert.equal(response.statusCode, 409);
  assert.ok(!state.queries.some(q => q.sql.includes('INSERT INTO terminal_marks')));
});

test('explicit identity confirmation changes only archived identity fields, preserving scores and terminal marks', async () => {
  state = { queries: [] };
  const confirm = router.stack.find(layer => layer.route?.path === '/records/:id/identity').route.stack.at(-1).handle;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  await confirm({ params: { id: '49' }, user: { userId: 1 }, body: { registration_no: '2262117678', student_id: '738' } }, res);
  assert.equal(res.data.result.student_name, 'Sahanaj Parvin');
  assert.equal(res.data.result.mission_reg_no, '40554');
  assert.equal(res.data.result.final_score, 9);
  assert.deepEqual(res.data.result.correct_questions, [1, 3]);
  assert.equal(res.data.result.identity_match, 'manual');
  assert.ok(!state.queries.some(query => /INSERT INTO terminal_marks|UPDATE students/.test(query.sql)));
});
