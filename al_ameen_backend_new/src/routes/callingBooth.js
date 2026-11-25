const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const gsmAdb = require('../utils/gsmAdb');

const router = express.Router();

/**
 * Check if student is active, scheduled for calling today/now, and has remaining talk time quota
 */
async function checkStudentCallingSchedule(studentId, regNo) {
  // 1. Get student details
  let stuRes;
  if (studentId) {
    stuRes = await pool.query(
      `SELECT id, registration_no, student_name, class_name, gender 
       FROM students 
       WHERE id = $1 AND is_active = TRUE`,
      [studentId]
    );
  } else if (regNo) {
    stuRes = await pool.query(
      `SELECT id, registration_no, student_name, class_name, gender 
       FROM students 
       WHERE registration_no = $1 AND is_active = TRUE`,
      [String(regNo).trim()]
    );
  }

  if (!stuRes || !stuRes.rowCount) {
    return {
      allowed: false,
      reason: 'student_not_found',
      message: 'Student record not found or inactive.',
      message_bn: 'রেজিস্ট্রেশন নম্বর খুঁজে পাওয়া যায়নি বা একাউন্ট সক্রিয় নয়।'
    };
  }

  const student = stuRes.rows[0];

  // 1b. Gate Pass Away Check (students listed in Execute Return / status='pending' cannot call while away)
  const outPass = await pool.query(
    `SELECT token_no, departure_at
     FROM student_gate_passes
     WHERE student_id = $1 AND status = 'pending'
     LIMIT 1`,
    [student.id]
  );

  if (outPass.rowCount) {
    return {
      allowed: false,
      reason: 'student_on_gate_pass',
      message: 'Student is currently away on Gate Pass. Calling is disabled until Return is executed.',
      message_bn: 'ছাত্র/ছাত্রী বর্তমানে গেট পাস নিয়ে বাড়িতে আছে। হোস্টেলে ফিরে Return না করা পর্যন্ত কল বন্ধ থাকবে।'
    };
  }

  // 2. Emergency Override Check (from student_calling_access)
  const emergencyCheck = await pool.query(
    `SELECT is_emergency_call, emergency_until 
     FROM student_calling_access 
     WHERE student_id = $1`,
    [student.id]
  );

  if (emergencyCheck.rowCount && emergencyCheck.rows[0].is_emergency_call) {
    const e = emergencyCheck.rows[0];
    if (!e.emergency_until || new Date(e.emergency_until) > new Date()) {
      return {
        allowed: true,
        is_emergency: true,
        allowed_talk_time: 15,
        remaining_seconds: 900,
        student
      };
    }
  }

  // 3. Regular Schedule Check (Kolkata timezone)
  const schedRes = await pool.query(
    `SELECT id, allowed_talk_time, days, start_time, end_time
     FROM calling_schedules
     WHERE class_name = $1
       AND (gender IS NULL OR gender = '' OR gender = $2)
       AND is_active = TRUE
       AND days ? trim(to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'Dy'))
       AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time BETWEEN start_time AND end_time
     ORDER BY allowed_talk_time DESC
     LIMIT 1`,
    [student.class_name, student.gender || 'Female']
  );

  if (!schedRes.rowCount) {
    return {
      allowed: false,
      reason: 'not_scheduled',
      message: 'Calling is not scheduled for your class at this time.',
      message_bn: 'আজ বা এই সময়ে আপনার ক্লাসের কলের সময় নয়।',
      student
    };
  }

  const schedule = schedRes.rows[0];
  const allowedTalkTimeMinutes = schedule.allowed_talk_time || 8;
  const maxAllowedSeconds = allowedTalkTimeMinutes * 60;

  // 4. Weekly Talk Time Quota Check (Calculates talk time used this week)
  const quotaRes = await pool.query(
    `SELECT COALESCE(SUM(call_duration_seconds), 0) AS used_seconds
     FROM hostel_call_logs
     WHERE (student_id = $1 OR registration_no = $2)
       AND started_at >= (date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata' + INTERVAL '1 day') - INTERVAL '1 day')
       AND call_status = 'completed'
       AND call_duration_seconds > 0`,
    [student.id, student.registration_no]
  );

  const usedSeconds = parseInt(quotaRes.rows[0].used_seconds, 10) || 0;
  const remainingSeconds = Math.max(0, maxAllowedSeconds - usedSeconds);

  if (remainingSeconds <= 0) {
    return {
      allowed: false,
      reason: 'quota_exhausted',
      message: `Your weekly ${allowedTalkTimeMinutes}-minute talk time limit has ended.`,
      message_bn: `আপনার এই সপ্তাহের ${allowedTalkTimeMinutes} মিনিটের টকটাইম সমাপ্ত হয়েছে।`,
      student,
      used_seconds: usedSeconds,
      allowed_talk_time: allowedTalkTimeMinutes
    };
  }

  return {
    allowed: true,
    is_emergency: false,
    allowed_talk_time: allowedTalkTimeMinutes,
    remaining_seconds: remainingSeconds,
    used_seconds: usedSeconds,
    scheduleId: schedule.id,
    student
  };
}

/**
 * Get available guardian contact options for student
 */
async function getStudentGuardianOptions(studentId) {
  const contactRes = await pool.query(
    `SELECT * FROM student_guardian_contacts WHERE student_id = $1`,
    [studentId]
  );
  const stuRes = await pool.query(
    `SELECT father_mobile, mother_mobile, guardian_mobile, alternate_mobile, father_name, mother_name, guardian_name 
     FROM students WHERE id = $1`,
    [studentId]
  );

  const contacts = contactRes.rowCount ? contactRes.rows[0] : {};
  const stu = stuRes.rowCount ? stuRes.rows[0] : {};

  const fatherMobile = contacts.father_mobile || stu.father_mobile || null;
  const motherMobile = contacts.mother_mobile || stu.mother_mobile || stu.alternate_mobile || null;

  const options = [];

  if (fatherMobile) {
    options.push({
      key: 1,
      relation: 'Father',
      relation_bn: 'বাবা',
      mobile: String(fatherMobile).trim(),
      name: stu.father_name || 'Father',
      label: 'Father'
    });
  }

  if (motherMobile) {
    options.push({
      key: 2,
      relation: 'Mother',
      relation_bn: 'মা',
      mobile: String(motherMobile).trim(),
      name: stu.mother_name || 'Mother',
      label: 'Mother'
    });
  }

  if (contacts.guardian_1_mobile) {
    const rel = contacts.guardian_1_relation || 'Guardian 1';
    options.push({
      key: 3,
      relation: rel,
      relation_bn: rel,
      mobile: String(contacts.guardian_1_mobile).trim(),
      label: rel
    });
  }

  if (contacts.guardian_2_mobile) {
    const rel = contacts.guardian_2_relation || 'Guardian 2';
    options.push({
      key: 4,
      relation: rel,
      relation_bn: rel,
      mobile: String(contacts.guardian_2_mobile).trim(),
      label: rel
    });
  }

  if (contacts.guardian_3_mobile) {
    const rel = contacts.guardian_3_relation || 'Guardian 3';
    options.push({
      key: 5,
      relation: rel,
      relation_bn: rel,
      mobile: String(contacts.guardian_3_mobile).trim(),
      label: rel
    });
  }

  // Fallback to student's guardian_mobile if not already included
  if (options.length === 0 && stu.guardian_mobile) {
    options.push({
      key: 1,
      relation: 'Guardian',
      relation_bn: 'অভিভাবক',
      mobile: String(stu.guardian_mobile).trim(),
      name: stu.guardian_name || 'Guardian',
      label: 'Guardian'
    });
  }

  return options;
}

// =========================================================================
// IVR CALL BOOTH APIS
// =========================================================================

/**
 * Step 1: Student inputs Registration Number (Keypad DTMF)
 * POST /api/calling-booth/verify-student (and /api/calls/ivr/step1-verify-reg)
 */
const handleStep1 = asyncHandler(async (req, res) => {
  const regNo = String(req.body.reg_no || req.query.reg_no || req.body.Digits || '').trim();

  if (!regNo) {
    return res.status(400).json({
      success: false,
      message: 'Registration number is required',
      message_bn: 'রেজিস্ট্রেশন নম্বর দিন।'
    });
  }

  const stuRes = await pool.query(
    `SELECT id, registration_no, student_name, class_name, roll_no 
     FROM students 
     WHERE registration_no = $1 AND is_active = TRUE`,
    [regNo]
  );

  if (!stuRes.rowCount) {
    return res.status(404).json({
      success: false,
      status: 'invalid_reg',
      message: 'Registration number not found. Please check and try again.',
      message_bn: 'রেজিস্ট্রেশন নম্বর খুঁজে পাওয়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
    });
  }

  const student = stuRes.rows[0];
  const digitsSpaced = student.registration_no.split('').join(' ');

  res.json({
    success: true,
    status: 'confirm_reg',
    student_id: student.id,
    reg_no: student.registration_no,
    student_name: student.student_name,
    class_name: student.class_name,
    roll_no: student.roll_no,
    prompt: `Your ID is ${digitsSpaced}. Press 1 to continue.`,
    prompt_bn: `আপনার আইডি ${digitsSpaced}। এগিয়ে যেতে ১ চাপুন।`,
    confirm_key: 1,
    reenter_key: 2
  });
});

router.post('/verify-student', handleStep1);
router.post('/step1-verify-reg', handleStep1);

/**
 * Step 2: Student confirms Registration Number (Presses 1)
 * System verifies schedule and 8-min talk time balance, then returns Guardian menu options (1, 2, 3...)
 * POST /api/calling-booth/confirm-student (and /api/calls/ivr/step2-confirm)
 */
const handleStep2 = asyncHandler(async (req, res) => {
  const { reg_no, student_id, confirm_digit } = req.body || {};

  if (confirm_digit && String(confirm_digit).trim() !== '1') {
    return res.json({
      success: false,
      status: 'reenter',
      message: 'Registration cancelled. Please re-enter your registration number.',
      message_bn: 'রেজিস্ট্রেশন বাতিল করা হয়েছে। আবার নম্বর দিন।'
    });
  }

  let sId = student_id;
  if (!sId && reg_no) {
    const r = await pool.query(`SELECT id FROM students WHERE registration_no = $1 LIMIT 1`, [String(reg_no).trim()]);
    if (r.rowCount) sId = r.rows[0].id;
  }

  if (!sId) {
    return res.status(400).json({ success: false, message: 'Valid student identifier is required' });
  }

  // 1. Check Schedule & 8-minute quota
  const check = await checkStudentCallingSchedule(sId, reg_no);
  if (!check.allowed) {
    return res.json({
      success: false,
      status: check.reason,
      allowed: false,
      student_name: check.student?.student_name,
      message: check.message,
      message_bn: check.message_bn
    });
  }

  // 2. Get Guardian Contact Options
  const options = await getStudentGuardianOptions(sId);
  if (!options.length) {
    return res.json({
      success: false,
      status: 'no_contacts',
      allowed: true,
      student_name: check.student.student_name,
      message: 'No guardian phone numbers are registered for your profile. Please contact the office.',
      message_bn: 'আপনার প্রোফাইলে কোনো অভিভাবকের মোবাইল নম্বর যুক্ত নেই। অফিসে যোগাযোগ করুন।'
    });
  }

  const promptPartsEn = options.map(opt => `${opt.key} for ${opt.label}`);
  const promptPartsBn = options.map(opt => `${opt.relation_bn || opt.label}-এর জন্য ${opt.key}`);

  res.json({
    success: true,
    status: 'select_relation',
    allowed: true,
    student_id: sId,
    reg_no: check.student.registration_no,
    student_name: check.student.student_name,
    class_name: check.student.class_name,
    allowed_talk_time: check.allowed_talk_time,
    remaining_seconds: check.remaining_seconds,
    remaining_minutes: Math.ceil(check.remaining_seconds / 60),
    is_emergency: check.is_emergency,
    options,
    prompt: `Press ${promptPartsEn.join(', ')}...`,
    prompt_bn: `${promptPartsBn.join(', ')} চাপুন...`
  });
});

router.post('/confirm-student', handleStep2);
router.post('/step2-confirm', handleStep2);

/**
 * Step 3: Student selects relation (e.g. 1 for Father, 2 for Mother)
 * Initiates the outbound call with strict talk-time limit (max 8 minutes / remaining seconds)
 * POST /api/calling-booth/connect-guardian (and /api/calls/ivr/step3-connect)
 */
const handleStep3 = asyncHandler(async (req, res) => {
  const { student_id, reg_no, selected_digit, from_phone, gateway_type, sim_slot } = req.body || {};

  let sId = student_id;
  if (!sId && reg_no) {
    const r = await pool.query(`SELECT id FROM students WHERE registration_no = $1 LIMIT 1`, [String(reg_no).trim()]);
    if (r.rowCount) sId = r.rows[0].id;
  }

  if (!sId) {
    return res.status(400).json({ success: false, message: 'Student ID or Reg No is required' });
  }

  // 1. Re-check Schedule & remaining talk time
  const check = await checkStudentCallingSchedule(sId, reg_no);
  if (!check.allowed) {
    return res.status(403).json({
      success: false,
      message: check.message,
      message_bn: check.message_bn
    });
  }

  // 2. Resolve target number based on selected digit
  const options = await getStudentGuardianOptions(sId);
  const digit = parseInt(selected_digit, 10);
  const chosen = options.find(o => o.key === digit);

  if (!chosen || !chosen.mobile) {
    return res.status(400).json({
      success: false,
      message: `Invalid option selected. Please choose from available options (${options.map(o => o.key).join(', ')}).`,
      message_bn: `ভুল অপশন নির্বাচন করা হয়েছে। অনুগ্রহ করে তালিকা থেকে বেছে নিন।`
    });
  }

  const timeLimitSeconds = Math.min(check.remaining_seconds || 480, (check.allowed_talk_time || 8) * 60);
  const callSid = `booth_${Date.now()}_${check.student.registration_no}`;
  const gwType = gateway_type || 'yealink_sip_trunk';
  const callerFrom = from_phone || 'Booth-Handset-1';

  // 3. Insert record into hostel_call_logs
  const hostelInsert = await pool.query(
    `INSERT INTO hostel_call_logs (
       student_id, student_name, registration_no, class_name,
       contact_person, phone_number, call_status,
       call_duration_seconds, max_allowed_seconds,
       sim_slot, gateway_type, notes, started_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'initiated', 0, $7, $8, $9, $10, NOW())
     RETURNING *`,
    [
      sId,
      check.student.student_name,
      check.student.registration_no,
      check.student.class_name,
      chosen.relation,
      chosen.mobile,
      timeLimitSeconds,
      sim_slot || 'SIM 1',
      gwType,
      `Max ${Math.ceil(timeLimitSeconds / 60)} mins limit enforced`
    ]
  );

  // 4. Also insert into call_logs for general compatibility
  await pool.query(
    `INSERT INTO call_logs (
       call_sid, from_number, to_number, caller_id, status,
       student_id, reg_no, called_relation, allowed_talk_time,
       context
     ) VALUES ($1, $2, $3, $4, 'initiated', $5, $6, $7, $8, 'booth_call')
     ON CONFLICT (call_sid) DO NOTHING`,
    [
      callSid,
      callerFrom,
      chosen.mobile,
      'booth_system',
      sId,
      check.student.registration_no,
      chosen.relation,
      Math.ceil(timeLimitSeconds / 60)
    ]
  ).catch(err => console.warn('call_logs insert warning:', err.message));

  const logRecord = hostelInsert.rows[0];

  // 5. Trigger real GSM dialing via connected Android device (if plugged in via USB/ADB)
  let gsmResult = null;
  try {
    gsmResult = await gsmAdb.dialNumber(chosen.mobile);
  } catch (err) {
    console.warn('[CallingBooth] GSM ADB Dial error:', err.message);
  }

  res.status(201).json({
    success: true,
    message: gsmResult?.success ? 'GSM Call placed successfully via connected mobile.' : 'Guardian selected.',
    prompt: `Connecting call to ${chosen.relation}...`,
    prompt_bn: `${chosen.relation_bn || chosen.relation}-এর সাথে কল যুক্ত করা হচ্ছে...`,
    call_id: logRecord.id,
    call_sid: callSid,
    target_relation: chosen.relation,
    target_relation_bn: chosen.relation_bn || chosen.relation,
    target_mobile: chosen.mobile,
    max_allowed_seconds: timeLimitSeconds,
    allowed_talk_time_minutes: Math.ceil(timeLimitSeconds / 60),
    gsm_dialed: !!gsmResult?.success,
    gsm_device: gsmResult?.deviceId || null
  });
});

router.post('/connect-guardian', handleStep3);
router.post('/step3-connect', handleStep3);

/**
 * Step 4: End or update call status and recorded duration
 * POST /api/calling-booth/end-call (and /api/calls/ivr/end-call, /step4-end)
 */
const handleEndCall = asyncHandler(async (req, res) => {
  const { call_id, call_sid, duration_seconds, status, end_reason, notes } = req.body || {};

  // Trigger hang up on connected Android device (if active)
  try {
    await gsmAdb.hangUpCall();
  } catch (err) {
    console.warn('[CallingBooth] GSM ADB End Call error:', err.message);
  }

  const dur = Math.max(0, parseInt(duration_seconds, 10) || 0);
  const callStatus = status || (dur > 0 ? 'completed' : 'no_answer');

  let updatedLog = null;

  if (call_id) {
    const r = await pool.query(
      `UPDATE hostel_call_logs 
       SET call_status = $1,
           call_duration_seconds = $2,
           ended_at = NOW(),
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [callStatus, dur, end_reason || notes, call_id]
    );
    if (r.rowCount) updatedLog = r.rows[0];
  }

  if (call_sid) {
    await pool.query(
      `UPDATE call_logs
       SET status = $1,
           duration = $2,
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE call_sid = $4`,
      [callStatus, dur, end_reason || notes, call_sid]
    );
  }

  res.json({
    success: true,
    message: 'Call ended and logged successfully.',
    call: updatedLog
  });
});

router.post('/end-call', handleEndCall);
router.post('/step4-end', handleEndCall);

/**
 * GET /api/calling-booth/logs
 * List recent call logs from hostel booth
 */
router.get('/logs', asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const q = await pool.query(
    `SELECT 
       id,
       student_id,
       student_name,
       registration_no,
       class_name,
       contact_person,
       phone_number,
       call_status,
       call_duration_seconds,
       max_allowed_seconds,
       sim_slot,
       gateway_type,
       notes,
       started_at,
       ended_at,
       created_at
     FROM hostel_call_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  res.json({ success: true, calls: q.rows });
}));

module.exports = {
  router,
  checkStudentCallingSchedule,
  getStudentGuardianOptions
};
