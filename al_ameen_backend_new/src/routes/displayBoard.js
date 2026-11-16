const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const MODES = new Set(['display', 'auto', 'routine', 'notice', 'result', 'weekly_exam']);
const GROUPS = new Set(['all', 'v_x', 'xi_xii', 'coaching']);
const DEFAULTS = { mode: 'auto', routine_group: 'all', class_end_time: '15:00', coaching_start_time: '18:00', coaching_end_time: '21:15', v_x_start_time: '10:00', v_x_end_time: '15:00', xi_xii_start_time: '06:00', xi_xii_end_time: '13:00', weekly_start_time: '06:00', weekly_end_time: '13:00', result_start_time: '06:00', result_end_time: '13:00', result_type: 'terminal', result_exam_id: null, weekly_result_batch_id: null, notice_ids: [], display_notices: [], weekly_exam_items: [] };

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS display_board_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'auto',
    routine_group TEXT NOT NULL DEFAULT 'all',
    class_end_time TEXT NOT NULL DEFAULT '15:00',
    coaching_start_time TEXT NOT NULL DEFAULT '18:00',
    coaching_end_time TEXT NOT NULL DEFAULT '21:15',
    v_x_start_time TEXT NOT NULL DEFAULT '10:00',
    v_x_end_time TEXT NOT NULL DEFAULT '15:00',
    xi_xii_start_time TEXT NOT NULL DEFAULT '06:00',
    xi_xii_end_time TEXT NOT NULL DEFAULT '13:00',
    weekly_start_time TEXT NOT NULL DEFAULT '06:00',
    weekly_end_time TEXT NOT NULL DEFAULT '13:00',
    result_start_time TEXT NOT NULL DEFAULT '06:00',
    result_end_time TEXT NOT NULL DEFAULT '13:00',
    result_exam_id INTEGER NULL,
    notice_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    display_notices JSONB NOT NULL DEFAULT '[]'::jsonb,
    weekly_exam_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INTEGER NULL
  )
`).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS weekly_exam_items JSONB NOT NULL DEFAULT '[]'::jsonb`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS notice_ids JSONB NOT NULL DEFAULT '[]'::jsonb`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS display_notices JSONB NOT NULL DEFAULT '[]'::jsonb`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS coaching_start_time TEXT NOT NULL DEFAULT '18:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS coaching_end_time TEXT NOT NULL DEFAULT '21:15'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS v_x_start_time TEXT NOT NULL DEFAULT '10:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS v_x_end_time TEXT NOT NULL DEFAULT '15:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS xi_xii_start_time TEXT NOT NULL DEFAULT '06:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS xi_xii_end_time TEXT NOT NULL DEFAULT '13:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS weekly_start_time TEXT NOT NULL DEFAULT '06:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS weekly_end_time TEXT NOT NULL DEFAULT '13:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS result_start_time TEXT NOT NULL DEFAULT '06:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS result_end_time TEXT NOT NULL DEFAULT '13:00'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS result_type TEXT NOT NULL DEFAULT 'terminal'`)).then(() => pool.query(`ALTER TABLE display_board_settings ADD COLUMN IF NOT EXISTS weekly_result_batch_id INTEGER NULL`)).then(() => pool.query(`
  INSERT INTO display_board_settings (id, mode, routine_group, class_end_time)
  VALUES (1, 'auto', 'all', '15:00') ON CONFLICT (id) DO NOTHING
`));

const istDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
const today = () => { const d = istDate(); return `${d.year}-${d.month}-${d.day}`; };
const istTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

async function settings() {
  await ready;
  const row = (await pool.query('SELECT mode,routine_group,class_end_time,coaching_start_time,coaching_end_time,v_x_start_time,v_x_end_time,xi_xii_start_time,xi_xii_end_time,weekly_start_time,weekly_end_time,result_start_time,result_end_time,result_type,result_exam_id,weekly_result_batch_id,notice_ids,display_notices,weekly_exam_items,updated_at FROM display_board_settings WHERE id=1')).rows[0];
  return { ...DEFAULTS, ...(row || {}) };
}

async function routine(group, date) {
  const row = (await pool.query(`
    SELECT g.group_name, g.grid_data,
      CASE WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 'daily' ELSE 'master' END AS source
    FROM routine_manager_grids g
    WHERE g.group_name=$1 AND (
      (g.routine_date=$2::date AND g.routine_kind='daily' AND g.is_published=TRUE) OR
      (g.is_master=TRUE AND g.routine_kind='master' AND EXTRACT(DOW FROM g.routine_date)=EXTRACT(DOW FROM $2::date))
    )
    ORDER BY CASE WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 2 ELSE 1 END DESC, g.updated_at DESC
    LIMIT 1
  `, [group, date])).rows[0];
  if (!row) return null;
  return { ...row, group: row.group_name || group };
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
    SELECT st.registration_no,st.roll_no,st.student_name,
      json_object_agg(tes.id,CASE WHEN tm.obtained_marks IS NULL THEN 'Absent' ELSE trim(to_char(tm.obtained_marks,'FM999999990.##')) END) marks
    FROM students st CROSS JOIN terminal_exam_subjects tes
    LEFT JOIN terminal_marks tm ON tm.student_id=st.id AND tm.exam_subject_id=tes.id
    WHERE st.class_name=$1 AND st.is_active=TRUE AND tes.terminal_exam_id=$2
    GROUP BY st.id ORDER BY NULLIF(regexp_replace(st.roll_no, '\\D', '', 'g'), '')::int NULLS LAST, st.registration_no
  `, [exam.class_name, exam.id])).rows;
  return { exam, subjects, students };
}

async function weeklyResult(batchId) {
  if (!batchId) return null;
  const batch = (await pool.query(`
    SELECT b.id,b.exam_id,b.subject_id,b.class_name,b.full_marks,e.exam_name,e.exam_date,s.subject_name
    FROM mark_entry_batches b JOIN exams e ON e.id=b.exam_id JOIN subjects s ON s.id=b.subject_id
    WHERE b.id=$1 AND b.locked=TRUE AND e.is_published=TRUE
  `, [batchId])).rows[0];
  if (!batch) return null;
  const students = (await pool.query(`
    SELECT st.registration_no,st.roll_no,st.student_name,
      json_build_object($2::text,CASE WHEN sm.obtained_marks IS NULL THEN 'Absent' ELSE trim(to_char(sm.obtained_marks,'FM999999990.##')) END) marks
    FROM students st LEFT JOIN student_marks sm ON sm.student_id=st.id AND sm.exam_id=$1 AND sm.subject_id=$2
    WHERE st.class_name=$3 AND st.is_active=TRUE
    ORDER BY NULLIF(regexp_replace(st.roll_no, '\\D', '', 'g'), '')::int NULLS LAST, st.registration_no
  `, [batch.exam_id, batch.subject_id, batch.class_name])).rows;
  return { exam: { exam_name: batch.exam_name, class_name: batch.class_name, session_name: '', published_at: batch.exam_date }, subjects: [{ id: batch.subject_id, subject_name: batch.subject_name, full_marks: batch.full_marks }], students };
}

router.get('/public', asyncHandler(async (req, res) => {
  const config = await settings();
  const date = today();
  const now = istTime();
  const activeNotices = Array.isArray(config.display_notices) ? config.display_notices.map((notice, index) => ({
    id: String(notice?.id || `display-${index}`), title: String(notice?.title || ''), notice_text: String(notice?.notice_text || ''), notice_type: 'Display only', attachment_url: notice?.attachment_url || null,
    start_time: String(notice?.start_time || '00:00'), end_time: String(notice?.end_time || '23:59'), active: notice?.active !== false,
  })).filter(notice => notice.active && (notice.title || notice.notice_text || notice.attachment_url) && now >= notice.start_time && now <= notice.end_time) : [];
  const allRoutineGroups = [
    ['v_x', config.v_x_start_time, config.v_x_end_time],
    ['xi_xii', config.xi_xii_start_time, config.xi_xii_end_time],
    ['coaching', config.coaching_start_time, config.coaching_end_time],
  ];

  const isTimingActive = (start, end) =>
    start && end && start !== 'off' && end !== 'off' && now >= start && now <= end;

  const targetGroups = config.routine_group === 'all'
    ? allRoutineGroups
    : allRoutineGroups.filter(([group]) => group === config.routine_group);

  const activeByTime = targetGroups.filter(([, start, end]) => isTimingActive(start, end)).map(([g]) => g);
  const activeByOn = targetGroups.filter(([, start, end]) => start !== 'off' && end !== 'off').map(([g]) => g);
  // Auto / Display mode rotates every routine that is explicitly On. Manual Routine
  // mode still follows the configured timing window when one is active.
  const isAutoOrDisplay = config.mode === 'auto' || config.mode === 'display';
  const scheduledGroups = isAutoOrDisplay
    ? activeByOn
    : (activeByTime.length ? activeByTime : activeByOn);

  const playlist = [];
  if (isAutoOrDisplay) {
    for (const group of scheduledGroups) {
      const item = await routine(group, date);
      if (item) playlist.push({ mode: 'routine', routine: item, group });
    }
    for (const notice of activeNotices) {
      playlist.push({ mode: 'notice', notices: [notice] });
    }
    if (isTimingActive(config.weekly_start_time, config.weekly_end_time) && Array.isArray(config.weekly_exam_items) && config.weekly_exam_items.length) {
      playlist.push({ mode: 'weekly_exam', weekly_exam_items: config.weekly_exam_items });
    }
    if (isTimingActive(config.result_start_time, config.result_end_time)) {
      const item = config.result_type === 'weekly' ? await weeklyResult(config.weekly_result_batch_id) : await result(config.result_exam_id);
      if (item) playlist.push({ mode: 'result', result: item });
    }
  }

  const configPayload = {
    routine_group: config.routine_group,
    class_end_time: config.class_end_time,
    coaching_start_time: config.coaching_start_time,
    coaching_end_time: config.coaching_end_time,
    v_x_start_time: config.v_x_start_time,
    v_x_end_time: config.v_x_end_time,
    xi_xii_start_time: config.xi_xii_start_time,
    xi_xii_end_time: config.xi_xii_end_time,
    weekly_start_time: config.weekly_start_time,
    weekly_end_time: config.weekly_end_time,
    result_start_time: config.result_start_time,
    result_end_time: config.result_end_time,
  };

  if (isAutoOrDisplay && playlist.length >= 1) {
    return res.json({ success: true, mode: 'playlist', playlist, config: configPayload, date, server_time: now });
  }

  let effectiveMode = config.mode, routineGroup = config.routine_group;
  if (isAutoOrDisplay) {
    if (scheduledGroups.length) {
      effectiveMode = 'routine';
      routineGroup = 'scheduled';
    } else if (activeNotices.length) {
      effectiveMode = 'notice';
    } else {
      effectiveMode = 'empty';
    }
  }

  const payload = {
    success: true,
    mode: effectiveMode,
    config: { ...configPayload, routine_group: routineGroup },
    date,
    server_time: now,
  };

  if (effectiveMode === 'routine') {
    const groups = scheduledGroups;
    if (!groups.length) {
      payload.routine = null;
      payload.routines = [];
    } else {
      const allRoutines = await Promise.all(groups.map(async group => ({ group, routine: await routine(group, date) })));
      payload.routines = allRoutines.filter(r => r.routine);
      payload.routine = payload.routines[0]?.routine || null;
      if (groups.length === 1) {
        payload.config.routine_group = groups[0];
      }
    }
  }
  if (effectiveMode === 'notice') {
    const displayNotices = Array.isArray(config.display_notices) ? config.display_notices.map((notice, index) => ({
      id: String(notice?.id || `display-${index}`), title: String(notice?.title || ''), notice_text: String(notice?.notice_text || ''), notice_type: 'Display only', attachment_url: notice?.attachment_url || null,
      start_time: String(notice?.start_time || '00:00'), end_time: String(notice?.end_time || '23:59'), active: notice?.active !== false,
    })).filter(notice => notice.active && (notice.title || notice.notice_text || notice.attachment_url) && now >= notice.start_time && now <= notice.end_time) : [];
    payload.notices = displayNotices;
  }
  if (effectiveMode === 'result') payload.result = now >= config.result_start_time && now <= config.result_end_time ? (config.result_type === 'weekly' ? await weeklyResult(config.weekly_result_batch_id) : await result(config.result_exam_id)) : null;
  if (effectiveMode === 'weekly_exam') payload.weekly_exam_items = now >= config.weekly_start_time && now <= config.weekly_end_time && Array.isArray(config.weekly_exam_items) ? config.weekly_exam_items : [];
  res.json(payload);
}));

router.get('/control', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const config = await settings();
  res.json({ success: true, settings: { ...config, display_notices: (config.display_notices || []).map(notice => ({ ...notice, active: notice.active === false })) } });
  res.json({ success: true, settings: { ...config, display_notices: (config.display_notices || []).map(notice => ({ ...notice, active: notice.active !== false })) } });
}));

router.put('/control', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ready;
  const body = req.body || {};
  console.log('[PUT /control] received body:', JSON.stringify(body));
  const mode = String(body.mode || 'auto');
  const group = String(body.routine_group || 'all');
  const endTime = String(body.class_end_time || '15:00');

  const normTime = (v, def = 'off') => {
    if (!v) return def;
    const s = String(v).trim().toLowerCase();
    if (s === 'off' || s === 'none' || s === 'disabled') return 'off';
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hh = m[1].padStart(2, '0');
      const mm = m[2];
      const hNum = parseInt(hh, 10);
      const mNum = parseInt(mm, 10);
      if (hNum >= 0 && hNum <= 23 && mNum >= 0 && mNum <= 59) return `${hh}:${mm}`;
    }
    return def;
  };

  const normRange = (sVal, eVal, defS, defE) => {
    let s = normTime(sVal, 'off');
    let e = normTime(eVal, 'off');
    if (s === 'off' || e === 'off') return ['off', 'off'];
    if (s >= e) return [defS, defE];
    return [s, e];
  };

  const [coachingStart, coachingEnd] = normRange(body.coaching_start_time, body.coaching_end_time, '18:00', '21:15');
  const [vxStart, vxEnd] = normRange(body.v_x_start_time, body.v_x_end_time, '10:00', '15:00');
  const [xiStart, xiEnd] = normRange(body.xi_xii_start_time, body.xi_xii_end_time, '06:00', '13:00');
  const [weeklyStart, weeklyEnd] = normRange(body.weekly_start_time, body.weekly_end_time, '06:00', '13:00');
  const [resultStart, resultEnd] = normRange(body.result_start_time, body.result_end_time, '06:00', '13:00');
  const resultType = body.result_type === 'weekly' ? 'weekly' : 'terminal';
  const resultId = body.result_exam_id === null || body.result_exam_id === '' ? null : Number(body.result_exam_id);
  const weeklyResultBatchId = body.weekly_result_batch_id === null || body.weekly_result_batch_id === '' ? null : Number(body.weekly_result_batch_id);
  const noticeIds = Array.isArray(body.notice_ids) ? [...new Set(body.notice_ids.map(Number).filter(Number.isInteger).filter(id => id > 0))] : [];
  const displayNotices = Array.isArray(body.display_notices) ? body.display_notices.map((notice, index) => ({
    id: String(notice?.id || `display-${Date.now()}-${index}`),
    title: String(notice?.title || '').trim(),
    notice_text: String(notice?.notice_text || '').trim(),
    attachment_url: notice?.attachment_url || null,
    file_type: String(notice?.file_type || (String(notice?.attachment_url || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'image')),
    start_time: normTime(notice?.start_time, '00:00'),
    end_time: normTime(notice?.end_time, '23:59'),
    active: notice?.active !== false,
  })).filter(notice => notice.title || notice.notice_text || notice.attachment_url) : [];
  const weeklyItems = Array.isArray(body.weekly_exam_items) ? body.weekly_exam_items.map(item => ({
    class_name: String(item?.class_name || '').trim(),
    subject: String(item?.subject || '').trim(),
    time: String(item?.time || '').trim(),
    full_marks: String(item?.full_marks || '').trim(),
    syllabus: String(item?.syllabus || '').trim(),
  })).filter(item => item.class_name || item.subject || item.time || item.full_marks || item.syllabus) : [];

  if (!MODES.has(mode) || !GROUPS.has(group)) {
    console.log('[PUT /control] Failed mode or group check:', { mode, group });
    return res.status(400).json({ success: false, message: 'Invalid display-board mode or group.' });
  }
  if (mode === 'result' && !(resultType === 'weekly' ? weeklyResultBatchId : resultId)) {
    console.log('[PUT /control] Failed result check');
    return res.status(400).json({ success: false, message: 'Choose a published result before enabling Result mode.' });
  }
  if (weeklyItems.some(item => !item.class_name || !item.subject)) {
    console.log('[PUT /control] Failed weeklyItems check:', weeklyItems);
    return res.status(400).json({ success: false, message: 'Every weekly-test row needs class and subject.' });
  }
  if (mode === 'result' && resultType === 'terminal' && !(await pool.query(`SELECT 1 FROM terminal_exams WHERE id=$1 AND status='published'`, [resultId])).rowCount) {
    console.log('[PUT /control] Failed terminal exam check');
    return res.status(400).json({ success: false, message: 'Selected terminal result is not published.' });
  }

  console.log('[PUT /control] Updating DB with:', { mode, group, vxStart, vxEnd, xiStart, xiEnd, coachingStart, coachingEnd });
  await pool.query(`UPDATE display_board_settings SET mode=$1,routine_group=$2,class_end_time=$3,coaching_start_time=$4,coaching_end_time=$5,v_x_start_time=$6,v_x_end_time=$7,xi_xii_start_time=$8,xi_xii_end_time=$9,weekly_start_time=$10,weekly_end_time=$11,result_start_time=$12,result_end_time=$13,result_type=$14,result_exam_id=$15,weekly_result_batch_id=$16,notice_ids=$17::jsonb,display_notices=$18::jsonb,weekly_exam_items=$19::jsonb,updated_at=NOW(),updated_by=$20 WHERE id=1`, [mode, group, endTime, coachingStart, coachingEnd, vxStart, vxEnd, xiStart, xiEnd, weeklyStart, weeklyEnd, resultStart, resultEnd, resultType, resultId, weeklyResultBatchId, JSON.stringify(noticeIds), JSON.stringify(displayNotices), JSON.stringify(weeklyItems), req.user.userId]);
  console.log('[PUT /control] DB updated successfully');
  res.json({ success: true, settings: await settings() });
}));

module.exports = router;
