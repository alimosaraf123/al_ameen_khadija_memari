const { randomInt } = require('crypto');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function generateGuardianPassword() {
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
async function revokeGuardianAccess(client, userId) {
  await client.query('UPDATE guardian_login_sessions SET is_active=FALSE,logged_out_at=NOW() WHERE user_id=$1', [userId]);
  await client.query('UPDATE guardian_device_tokens SET is_active=FALSE WHERE user_id=$1', [userId]);
}
module.exports = { generateGuardianPassword, revokeGuardianAccess };
