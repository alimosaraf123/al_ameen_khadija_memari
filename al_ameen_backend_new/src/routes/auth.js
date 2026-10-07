const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { loginRateLimit } = require('../middleware/security');

const router = express.Router();
const passwordSchemaReady=pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT FALSE");

const guardianSessionSchemaReady=pool.query(`
  CREATE TABLE IF NOT EXISTS guardian_login_sessions(
    id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(150) NOT NULL,token_jti VARCHAR(100) NOT NULL,is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),logged_out_at TIMESTAMPTZ,
    UNIQUE(user_id,device_id)
  );
  CREATE INDEX IF NOT EXISTS idx_guardian_login_sessions_active ON guardian_login_sessions(user_id,is_active,expires_at);
`);
function normalToken(user){return jwt.sign({userId:user.id,loginId:user.login_id,role:user.role},process.env.JWT_SECRET,{expiresIn:'12h'});}
async function issueToken(user,deviceId){
  if(user.role!=='guardian')return normalToken(user);
  await guardianSessionSchemaReady;
  const device=String(deviceId||'').trim().slice(0,150);
  if(device.length<12){const e=new Error('This phone could not be identified. Please update/reopen the app and try again.');e.status=400;throw e;}
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const studentIds=(await c.query(`SELECT sg.student_id FROM guardian_profiles gp JOIN student_guardians sg ON sg.guardian_id=gp.id WHERE gp.user_id=$1 ORDER BY sg.student_id`,[user.id])).rows.map(x=>Number(x.student_id));
    for(const studentId of studentIds){
      await c.query('SELECT pg_advisory_xact_lock($1)',[studentId]);
      const devices=(await c.query(`SELECT DISTINCT gls.device_id FROM student_guardians sg JOIN guardian_profiles gp ON gp.id=sg.guardian_id JOIN guardian_login_sessions gls ON gls.user_id=gp.user_id WHERE sg.student_id=$1 AND gls.is_active=TRUE AND gls.expires_at>NOW()`,[studentId])).rows.map(x=>x.device_id);
      if(!devices.includes(device)&&devices.length>=3){const e=new Error('This student already has active logins on 3 mobile devices. Logout from one device before logging in here.');e.status=409;throw e;}
    }
    const jti=crypto.randomUUID(),expires=new Date(Date.now()+12*60*60*1000);
    await c.query(`INSERT INTO guardian_login_sessions(user_id,device_id,token_jti,is_active,expires_at,last_login_at,logged_out_at) VALUES($1,$2,$3,TRUE,$4,NOW(),NULL) ON CONFLICT(user_id,device_id) DO UPDATE SET token_jti=EXCLUDED.token_jti,is_active=TRUE,expires_at=EXCLUDED.expires_at,last_login_at=NOW(),logged_out_at=NULL`,[user.id,device,jti,expires]);
    await c.query('COMMIT');
    return jwt.sign({userId:user.id,loginId:user.login_id,role:user.role,jti,deviceId:device},process.env.JWT_SECRET,{expiresIn:'12h'});
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}


// ========================================
// LOGIN WITH PASSWORD
// ========================================

router.post(
  '/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    await passwordSchemaReady;

    const {
      login_id,
      password
    } = req.body || {};

    if (!login_id || !password) {
      return res.status(400).json({
        success: false,
        message: 'User ID and password are required',
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        login_id,
        password_hash,
        full_name,
        role,
        is_active,
        password_change_required
      FROM users
      WHERE login_id=$1 OR id IN (SELECT user_id FROM teachers WHERE staff_id=$1)
      LIMIT 1
      `,
      [String(login_id).trim()]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message: 'User ID or password is incorrect',
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This account is inactive',
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!ok) {
      return res.status(401).json({
        success: false,
        message: 'Wrong password',
      });
    }

    const token = await issueToken(user, req.body?.device_id || req.headers['x-device-id']);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        login_id: user.login_id,
        full_name: user.full_name,
        role: user.role,
        password_change_required: !!user.password_change_required,
      },
    });

  })
);


// ========================================
// CURRENT USER
// ========================================

router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    await passwordSchemaReady;
    const result = await pool.query(
      `
      SELECT
        id,
        login_id,
        full_name,
        role,
        is_active,
        password_change_required
      FROM users
      WHERE id=$1
      `,
      [req.user.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const permissions=(await pool.query('SELECT module_key FROM user_module_permissions WHERE user_id=$1 ORDER BY module_key',[req.user.userId])).rows.map(x=>x.module_key);
    res.json({
      success: true,
      user: result.rows[0],
      restricted: result.rows[0].role==='admin' && permissions.length>0,
      permissions,
    });

  })
);


// ========================================
// GUARDIAN CHANGE PASSWORD
// ========================================

router.post(
  '/change-password',

  auth,

  allow('super_admin','admin','guardian','teacher','gateman','office','library'),

  asyncHandler(async (req, res) => {

    const {
      current_password,
      new_password,
      confirm_password
    } = req.body || {};

    if (
      !current_password ||
      !new_password ||
      !confirm_password
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Current password, new password and confirmation are required',
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'New password confirmation does not match' });
    }

    if (
      String(new_password).length < 6
    ) {
      return res.status(400).json({
        success: false,
        message:
          'New password must be at least 6 characters',
      });
    }

    if (
      current_password ===
      new_password
    ) {
      return res.status(400).json({
        success: false,
        message:
          'New password must be different from current password',
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        password_hash,
        is_active
      FROM users
      WHERE id=$1
      LIMIT 1
      `,
      [req.user.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message:
          'User not found',
      });
    }

    const user =
      result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          'This account is inactive',
      });
    }

    const passwordOk =
      await bcrypt.compare(
        current_password,
        user.password_hash
      );

    if (!passwordOk) {
      return res.status(401).json({
        success: false,
        message:
          'Current password is incorrect',
      });
    }

    const newHash =
      await bcrypt.hash(
        new_password,
        12
      );

    await pool.query(
      `
      UPDATE users
      SET password_hash=$1, password_change_required=FALSE
      WHERE id=$2
      `,
      [
        newHash,
        req.user.userId,
      ]
    );

    if(req.user.role==='guardian')await pool.query('DELETE FROM guardian_temporary_credentials WHERE user_id=$1',[req.user.userId]);

    res.json({
      success: true,
      message:
        'Password changed successfully',
    });

  })
);


// ========================================
// GUARDIAN SET / CHANGE mPIN
// ========================================

router.post(
  '/set-mpin',

  auth,

  allow('super_admin','admin','guardian','teacher','gateman','office','library'),

  asyncHandler(async (req, res) => {

    const {
      current_password,
      mpin
    } = req.body || {};

    if (
      !current_password ||
      !mpin
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Current password and mPIN are required',
      });
    }

    if (
      !/^\d{6}$/.test(
        String(mpin)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'mPIN must be exactly 6 digits',
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          password_hash,
          is_active
        FROM users
        WHERE id=$1
        LIMIT 1
        `,
        [req.user.userId]
      );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message:
          'User not found',
      });
    }

    const user =
      result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          'This account is inactive',
      });
    }

    const passwordOk =
      await bcrypt.compare(
        current_password,
        user.password_hash
      );

    if (!passwordOk) {
      return res.status(401).json({
        success: false,
        message:
          'Current password is incorrect',
      });
    }

    const mpinHash =
      await bcrypt.hash(
        String(mpin),
        12
      );

    await pool.query(
      `
      UPDATE users
      SET mpin_hash=$1
      WHERE id=$2
      `,
      [
        mpinHash,
        req.user.userId,
      ]
    );

    res.json({
      success: true,
      message:
        'mPIN saved successfully',
    });

  })
);


// ========================================
// GUARDIAN LOGIN WITH mPIN
// ========================================

router.post(
  '/mpin-login',
  loginRateLimit,

  asyncHandler(async (req, res) => {

    const {
      login_id,
      mpin
    } = req.body || {};

    if (
      !login_id ||
      !mpin
    ) {
      return res.status(400).json({
        success: false,
        message:
          'User ID and mPIN are required',
      });
    }

    if (
      !/^\d{6}$/.test(
        String(mpin)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid User ID or mPIN',
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          login_id,
          mpin_hash,
          full_name,
          role,
          is_active
        FROM users
        WHERE login_id=$1
        LIMIT 1
        `,
        [
          String(login_id).trim()
        ]
      );

    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid User ID or mPIN',
      });
    }

    const user =
      result.rows[0];

    if (
      !['guardian','teacher','gateman','office','library'].includes(user.role)
    ) {
      return res.status(403).json({
        success: false,
        message:
          'mPIN login is not available for this account',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          'This account is inactive',
      });
    }

    if (!user.mpin_hash) {
      return res.status(400).json({
        success: false,
        message:
          'mPIN has not been set for this account',
      });
    }

    const mpinOk =
      await bcrypt.compare(
        String(mpin),
        user.mpin_hash
      );

    if (!mpinOk) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid User ID or mPIN',
      });
    }

    const token = await issueToken(user, req.body?.device_id || req.headers['x-device-id']);

    res.json({
      success: true,

      token,

      user: {
        id:
          user.id,

        login_id:
          user.login_id,

        full_name:
          user.full_name,

        role:
          user.role,
      },
    });

  })
);


// ========================================
// BIOMETRIC TOKEN HASH
// ========================================

function hashDeviceToken(
  token
) {

  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

}


// ========================================
// GUARDIAN ENABLE FINGERPRINT
// ========================================

router.post(
  '/biometric/register',

  auth,

  allow('super_admin','admin','guardian','teacher','gateman','office','library'),

  asyncHandler(async (req, res) => {

    const deviceName =
      String(
        req.body?.device_name ||
        'Guardian Device'
      )
        .trim()
        .slice(0, 150);


    const deviceToken =
      crypto
        .randomBytes(48)
        .toString('hex');


    const tokenHash =
      hashDeviceToken(
        deviceToken
      );


    // Fingerprint login valid for 180 days.
    // It can be renewed later.
    const expiresAt =
      new Date(
        Date.now() +
        180 *
        24 *
        60 *
        60 *
        1000
      );


    await pool.query(
      `
      INSERT INTO guardian_device_tokens
      (
        user_id,
        token_hash,
        device_name,
        is_active,
        expires_at
      )

      VALUES
      (
        $1,
        $2,
        $3,
        TRUE,
        $4
      )
      `,
      [
        req.user.userId,
        tokenHash,
        deviceName,
        expiresAt,
      ]
    );


    res.json({
      success: true,

      message:
        'Fingerprint login enabled successfully',

      device_token:
        deviceToken,

      expires_at:
        expiresAt,
    });

  })
);


// ========================================
// GUARDIAN LOGIN WITH FINGERPRINT TOKEN
// ========================================

router.post(
  '/biometric-login',

  asyncHandler(async (req, res) => {

    const deviceToken =
      String(
        req.body?.device_token ||
        ''
      ).trim();


    if (!deviceToken) {
      return res.status(400).json({
        success: false,
        message:
          'Device token is required',
      });
    }


    const tokenHash =
      hashDeviceToken(
        deviceToken
      );


    const result =
      await pool.query(
        `
        SELECT

          gdt.id
            AS token_id,

          gdt.user_id,

          gdt.is_active
            AS token_active,

          gdt.expires_at,

          u.login_id,

          u.full_name,

          u.role,

          u.is_active
            AS user_active

        FROM guardian_device_tokens gdt

        JOIN users u
          ON u.id =
             gdt.user_id

        WHERE
          gdt.token_hash=$1

        LIMIT 1
        `,
        [
          tokenHash
        ]
      );


    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message:
          'Fingerprint login is not available',
      });
    }


    const row =
      result.rows[0];


    if (
      row.role !== 'guardian'
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Fingerprint login is only for Guardian accounts',
      });
    }


    if (
      !row.user_active ||
      !row.token_active
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Fingerprint login has been disabled',
      });
    }


    if (
      row.expires_at &&
      new Date(
        row.expires_at
      ) < new Date()
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Fingerprint login has expired. Please login with password again.',
      });
    }


    await pool.query(
      `
      UPDATE guardian_device_tokens

      SET
        last_used_at=NOW()

      WHERE
        id=$1
      `,
      [
        row.token_id
      ]
    );


    const token = await issueToken({id:row.user_id,login_id:row.login_id,role:row.role}, req.body?.device_id || req.headers['x-device-id']);


    res.json({
      success: true,

      token,

      user: {
        id:
          row.user_id,

        login_id:
          row.login_id,

        full_name:
          row.full_name,

        role:
          row.role,
      },
    });

  })
);


// ========================================
// GUARDIAN DISABLE FINGERPRINT
// ========================================

router.post(
  '/biometric/revoke',

  auth,

  allow('super_admin','admin','guardian','teacher','gateman','office','library'),

  asyncHandler(async (req, res) => {

    const deviceToken =
      String(
        req.body?.device_token ||
        ''
      ).trim();


    if (!deviceToken) {
      return res.status(400).json({
        success: false,
        message:
          'Device token is required',
      });
    }


    const tokenHash =
      hashDeviceToken(
        deviceToken
      );


    await pool.query(
      `
      UPDATE guardian_device_tokens

      SET
        is_active=FALSE

      WHERE
        user_id=$1

        AND
        token_hash=$2
      `,
      [
        req.user.userId,
        tokenHash,
      ]
    );


    res.json({
      success: true,

      message:
        'Fingerprint login disabled',
    });

  })
);



router.post('/logout',auth,asyncHandler(async(req,res)=>{if(req.user.role==='guardian'&&req.user.jti){await guardianSessionSchemaReady;await pool.query(`UPDATE guardian_login_sessions SET is_active=FALSE,logged_out_at=NOW() WHERE user_id=$1 AND token_jti=$2`,[req.user.userId,req.user.jti]);}res.json({success:true});}));

// ========================================
// EXPORT ROUTER
// IMPORTANT: KEEP THIS AT THE VERY END
// ========================================

module.exports = router;
