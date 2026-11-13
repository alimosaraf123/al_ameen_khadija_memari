const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const MODES = new Set(['auto', 'routine', 'notice', 'result', 'weekly_exam']);
const GROUPS = new Set(['v_x', 'xi_xii', 'coaching']);
const DEFAULTS = { mode: 'auto', routine_group: 'v_x', class_end_time: '15:00', result_exam_id: null, weekly_exam_items: [] };

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS display_board_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'auto',
    routine_group TEXT NOT NULL DEFAULT 'v_x',
    class_end_time TEXT NOT NULL DEFAULT '15:00',
    result_exam_id INTEGER NULL,
    weekly_exam_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INTEGER NULL
  )
`).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS weekly_exam_items JSONB NOT NULL DEFAULT '[]'::jsonb`)).then(() => pool.query(`
  INSERT INTO display_board_settings (id, mode, routine_group, class_end_time)
  VALUES (1, 'auto', 'v_x', '15:00') ON CONFLICT (id) DO NOTHING
`));

const istDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
const today = () => { const d = istDate(); return `${d.year}-${d.month}-${d.day}`; };
const istTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

async function settings() {
  await ready;
  const row = (await pool.query('SELECT mode,routine_group,class_end_time,result_exam_id,weekly_exam_items,updated_at FROM display_board_settings WHERE id=1')).rows[0];
  return { ...DEFAULTS, ...(row || {}) };
}

async function routine(group, date) {
  const row = (await pool.query(`
    SELECT g.grid_data,
      CASE WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 'daily' ELSE 'master' END AS source
    FROM routine_manager_grids g
    WHERE g.group_name=$1 AND (
      (g.routine_date=$2::date AND g.routine_kind='daily' AND g.is_published=TRUE) OR
      (g.is_master=TRUE AND g.routine_kind='master' AND EXTRACT(DOW FROM g.routine_date)=EXTRACT(DOW FROM $2::date))
    )
    ORDER BY CASE WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 2 ELSE 1 END DESC, g.updated_at DESC
    LIMIT 1
  `, [group, date])).rows[0];
  return row || null;
}

async function result(examId) {
  if (!examId) return null;
  const exam = (await pool.query(`SELECT id,exam_name,class_name,session_name,published_at FROM terminal_exams WHERE id=$1 AND status='published'`, [examId])).rows[0];
  if (!exam) return null;
  const subjects = (await pool.query(`
    SELECT tes.id,s.subject_name,tes.full_marks
    FROM terminal_exam_subjects tes JOIN subjects s ON s.id=tes.subject_id
    WHERE tes.terminal_exam_id=$1 ORDER BY s.subject_name
  `, [exam.id])).rows;
  const students = (await pool.query(`
    SELECT st.registration_no,st.student_name,
      json_object_agg(tes.id,CASE WHEN tm.obtained_marks IS NULL THEN 'Absent' ELSE trim(to_char(tm.obtained_marks,'FM999999990.##')) END) marks
    FROM students st CROSS JOIN terminal_exam_subjects tes
    LEFT JOIN terminal_marks tm ON tm.student_id=st.id AND tm.exam_subject_id=tes.id
    WHERE st.class_name=$1 AND st.is_active=TRUE AND tes.terminal_exam_id=$2
    GROUP BY st.id ORDER BY st.registration_no
  `, [exam.class_name, exam.id])).rows;
  return { exam, subjects, students };
}

router.get('/public', asyncHandler(async (req, res) => {
  const config = await settings();
  const date = today();
  const effectiveMode = config.mode === 'auto' ? (istTime() < config.class_end_time ? 'routine' : 'notice') : config.mode;
  const payload = { success: true, mode: effectiveMode, config: { routine_group: config.routine_group, class_end_time: config.class_end_time }, date, server_time: istTime() };
  if (effectiveMode === 'routine') payload.routine = await routine(config.routine_group, date);
  if (effectiveMode === 'notice') payload.notices = (await pool.query(`
    SELECT id,title,notice_text,notice_type,attachment_url,published_at
    FROM notices WHERE is_active=TRUE ORDER BY published_at DESC LIMIT 20
  `)).rows;
  if (effectiveMode === 'result') payload.result = await result(config.result_exam_id);
  if (effectiveMode === 'weekly_exam') payload.weekly_exam_items = Array.isArray(config.weekly_exam_items) ? config.weekly_exam_items : [];
  res.json(payload);
}));

router.get('/control', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ success: true, settings: await settings() });
}));

router.put('/control', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ready;
  const body = req.body || {};
  const mode = String(body.mode || 'auto');
  const group = String(body.routine_group || 'v_x');
  const endTime = String(body.class_end_time || '15:00');
  const resultId = body.result_exam_id === null || body.result_exam_id === '' ? null : Number(body.result_exam_id);
  const weeklyItems = Array.isArray(body.weekly_exam_items) ? body.weekly_exam_items.map(item => ({
    class_name: String(item?.class_name || '').trim(),
    subject: String(item?.subject || '').trim(),
    time: String(item?.time || '').trim(),
    syllabus: String(item?.syllabus || '').trim(),
  })).filter(item => item.class_name || item.subject || item.time || item.syllabus) : [];
  if (!MODES.has(mode) || !GROUPS.has(group) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || (resultId !== null && (!Number.isInteger(resultId) || resultId < 1))) {
    return res.status(400).json({ success: false, message: 'Invalid display-board settings.' });
  }
  if (mode === 'result' && !resultId) return res.status(400).json({ success: false, message: 'Choose a published result before enabling Result mode.' });
  if (weeklyItems.some(item => !item.class_name || !item.subject || !item.time || !item.syllabus)) return res.status(400).json({ success: false, message: 'Every weekly-test row needs class, subject, time and syllabus.' });
  if (mode === 'result' && !(await pool.query(`SELECT 1 FROM terminal_exams WHERE id=$1 AND status='published'`, [resultId])).rowCount) {
    return res.status(400).json({ success: false, message: 'Selected result is not published.' });
  }
  await pool.query(`UPDATE display_board_settings SET mode=$1,routine_group=$2,class_end_time=$3,result_exam_id=$4,weekly_exam_items=$5::jsonb,updated_at=NOW(),updated_by=$6 WHERE id=1`, [mode, group, endTime, resultId, JSON.stringify(weeklyItems), req.user.userId]);
  res.json({ success: true, settings: await settings() });
}));

module.exports = router;
