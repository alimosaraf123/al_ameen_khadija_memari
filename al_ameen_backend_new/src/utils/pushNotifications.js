const pool = require('../db');

async function sendExpoPushMessages(messages) {
  if (!messages.length) return;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo push service returned ${response.status}`);
}

async function sendPushForNotice(noticeId) {
  const result = await pool.query(`SELECT DISTINCT pt.expo_push_token,n.title,n.notice_text,n.notice_type
    FROM notices n JOIN notice_targets nt ON nt.notice_id=n.id JOIN push_tokens pt ON pt.is_active=TRUE
    JOIN users u ON u.id=pt.user_id AND u.is_active=TRUE WHERE n.id=$1 AND (
      nt.target_type='all' OR (nt.target_type='role' AND nt.target_value=u.role) OR
      (nt.target_type='class' AND EXISTS(SELECT 1 FROM guardian_profiles gp JOIN student_guardians sg ON sg.guardian_id=gp.id JOIN students s ON s.id=sg.student_id WHERE gp.user_id=u.id AND s.class_name=nt.target_value)) OR
      (nt.target_type='student' AND EXISTS(SELECT 1 FROM guardian_profiles gp JOIN student_guardians sg ON sg.guardian_id=gp.id WHERE gp.user_id=u.id AND sg.student_id::text=nt.target_value))
    )`, [noticeId]);
  await sendExpoPushMessages(result.rows.map(row => ({
    to: row.expo_push_token,
    title: row.notice_type === 'result' ? 'Result Published' : row.title || 'New Notice',
    body: row.notice_text || row.title || 'You have a new update.',
    sound: 'default', data: { type: row.notice_type === 'result' ? 'result' : 'notice', noticeId: String(noticeId) },
  })));
}
module.exports = { sendPushForNotice };
