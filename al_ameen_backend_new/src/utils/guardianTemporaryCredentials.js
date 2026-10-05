const {randomBytes,hkdfSync,createCipheriv,createDecipheriv}=require('crypto');
function key() {
  if(!process.env.JWT_SECRET)throw new Error('Credential encryption is not configured');
  return hkdfSync('sha256',process.env.JWT_SECRET,'guardian-temporary-credentials','password-encryption-v1',32);
}
function encryptTemporaryPassword(password,userId) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(String(userId)));
  const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64')).join('.');
}
function decryptTemporaryPassword(value,userId) {
  const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',key(),iv);
  decipher.setAAD(Buffer.from(String(userId)));decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
async function saveTemporaryPassword(client,userId,password) {
  await client.query(`INSERT INTO guardian_temporary_credentials(user_id,encrypted_password,expires_at)
    VALUES($1,$2,'infinity'::timestamptz) ON CONFLICT(user_id) DO UPDATE SET
    encrypted_password=EXCLUDED.encrypted_password,expires_at=EXCLUDED.expires_at,created_at=NOW()`,[userId,encryptTemporaryPassword(password,userId)]);
}
module.exports={encryptTemporaryPassword,decryptTemporaryPassword,saveTemporaryPassword};
