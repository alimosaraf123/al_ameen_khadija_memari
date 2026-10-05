const {generateGuardianPassword,revokeGuardianAccess}=require('../utils/guardianCredentials');
const {getMonthlyFeeDue}=require('../utils/monthlyFees');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const uploadDir = path.join(
  __dirname,
  '../../uploads'
);


// ========================================
// HELPERS
// ========================================

function getPhysicalPath(fileUrl) {
  if (!fileUrl) return null;

  return path.join(
    uploadDir,
    path.basename(fileUrl)
  );
}


async function sendGuardianDocument(res, document, download = false) {
  const fileUrl = document.file_url;
  const safeTitle = (document.document_title || document.document_type || 'document').replace(/[\/:*?"<>|]/g, '_');
  if (/^https?:\/\//i.test(fileUrl)) {
    const response = await fetch(fileUrl);
    if (!response.ok) return res.status(404).json({ success: false, message: 'Document file not found' });
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    let extension = '';
    try { extension = path.extname(new URL(fileUrl).pathname); } catch {}
    res.set('Content-Type', contentType);
    if (download) res.set('Content-Disposition', 'attachment; filename="' + safeTitle + extension + '"');
    return res.send(buffer);
  }
  const physicalPath = getPhysicalPath(fileUrl);
  if (!physicalPath || !fs.existsSync(physicalPath)) return res.status(404).json({ success: false, message: 'Document file not found' });
  return download ? res.download(physicalPath, safeTitle + path.extname(physicalPath)) : res.sendFile(physicalPath);
}


async function guardianOwnsStudent(
  userId,
  studentId
) {
  const result =
    await pool.query(
      `
      SELECT 1

      FROM student_guardians sg

      JOIN guardian_profiles g
        ON g.id = sg.guardian_id

      WHERE sg.student_id=$1
        AND g.user_id=$2

      LIMIT 1
      `,
      [
        studentId,
        userId
      ]
    );

  return result.rowCount > 0;
}


const feeClassIds = new Map([
  ['nursery', '1'], ['nursary', '1'], ['i', '2'], ['ii', '3'], ['iii', '4'],
  ['iv', '5'], ['v', '6'], ['vi', '7'], ['vii', '8'], ['viii', '9'],
  ['ix', '10'], ['x', '11'], ['xi science', '12'], ['xi sc', '12'],
  ['xi arts', '13'], ['xii arts', '15'], ['xii science', '16'], ['xii sc', '16'],
  ['neet', '18'], ['jee', '19'], ['jee engineering', '19'],
  ['pre nursery', '34'], ['play group', '35'],
]);

function feeClassId(className) {
  const normalized = String(className || '')
    .trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\./g, '').replace(/\s+/g, ' ');
  return feeClassIds.get(normalized) || null;
}

router.get(
  '/student/:studentId/fee-payment-link',
  auth,
  allow('guardian'),
  asyncHandler(async (req, res) => {
    if (!(await guardianOwnsStudent(req.user.userId, req.params.studentId))) {
      return res.status(403).json({ success: false, message: 'This student is not linked to your Guardian account' });
    }

    const student = (await pool.query(
      'SELECT id,registration_no,class_name FROM students WHERE id=$1 AND is_active=TRUE',
      [req.params.studentId]
    )).rows[0];

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const classId = feeClassId(student.class_name);
    if (!classId) {
      return res.status(400).json({ success: false, message: 'This student class is not mapped with the fee payment website' });
    }

    const token = jwt.sign(
      { purpose: 'guardian_fee_payment', registrationNo: student.registration_no, classId },
      process.env.JWT_SECRET,
      { expiresIn: '2m' }
    );

    res.json({
      success: true,
      payment_path: '/api/guardians/fee-payment/open?token=' + encodeURIComponent(token),
    });
  })
);

router.get(
  '/student/:studentId/fee-receipt-link',
  auth,
  allow('guardian'),
  asyncHandler(async (req, res) => {
    if (!(await guardianOwnsStudent(req.user.userId, req.params.studentId))) {
      return res.status(403).json({ success: false, message: 'This student is not linked to your Guardian account' });
    }

    const student = (await pool.query(
      'SELECT id,registration_no,class_name FROM students WHERE id=$1 AND is_active=TRUE',
      [req.params.studentId]
    )).rows[0];

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const classId = feeClassId(student.class_name);
    if (!classId) {
      return res.status(400).json({ success: false, message: 'This student class is not mapped with the fee receipt website' });
    }

    const token = jwt.sign(
      { purpose: 'guardian_fee_receipt', registrationNo: student.registration_no, classId },
      process.env.JWT_SECRET,
      { expiresIn: '2m' }
    );

    res.json({
      success: true,
      receipt_path: '/api/guardians/fee-receipt/open?token=' + encodeURIComponent(token),
    });
  })
);
router.get('/fee-payment/open', asyncHandler(async (req, res) => {
  let payload;

  try {
    payload = jwt.verify(String(req.query.token || ''), process.env.JWT_SECRET);
  } catch {
    return res.status(401).type('html').send('<h2>This fee-payment link has expired. Return to the Guardian Panel and tap Pay Monthly Fees again.</h2>');
  }

  if (payload.purpose !== 'guardian_fee_payment') {
    return res.status(401).type('html').send('<h2>Invalid fee-payment link.</h2>');
  }

  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  const registrationNo = escapeHtml(payload.registrationNo);
  const classId = escapeHtml(payload.classId);
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Opening Fee Payment</title></head><body>' +
    '<p>Opening the student fee details...</p>' +
    '<form id="fee-payment" method="post" action="https://alameenmission.net/fees_payment/fees_memari/">' +
    '<input type="hidden" name="regno" value="' + registrationNo + '">' +
    '<input type="hidden" name="classid" value="' + classId + '">' +
    '<input type="hidden" name="search" value="SEARCH">' +
    '<noscript><button type="submit">Open Fee Details</button></noscript></form>' +
    '<script>document.getElementById("fee-payment").submit();</script></body></html>';

  res.set('Cache-Control', 'no-store').type('html').send(html);
}));

router.get('/fee-receipt/open', asyncHandler(async (req, res) => {
  let payload;

  try {
    payload = jwt.verify(String(req.query.token || ''), process.env.JWT_SECRET);
  } catch {
    return res.status(401).type('html').send('<h2>This fee-receipt link has expired. Return to the Guardian Panel and tap Download Fee Receipt again.</h2>');
  }

  if (payload.purpose !== 'guardian_fee_receipt') {
    return res.status(401).type('html').send('<h2>Invalid fee-receipt link.</h2>');
  }

  const form = new URLSearchParams({
    regno: String(payload.registrationNo || ''),
    class: String(payload.classId || ''),
    submit: 'Submit',
  });
  const receiptResponse = await fetch('https://alameenmission.net/fees_receipt/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!receiptResponse.ok) {
    return res.status(502).type('html').send('<h2>The fee receipt website is unavailable. Please try again.</h2>');
  }

  let html = await receiptResponse.text();
  const autoScroll = '<script>window.addEventListener("load",function(){var receipts=document.querySelectorAll("[id^=printData-]");if(receipts.length){receipts[receipts.length-1].scrollIntoView({behavior:"instant",block:"start"});}});</script>';
  html = html.replace('</body>', autoScroll + '</body>');
  res.set('Cache-Control', 'no-store').type('html').send(html);
}));

// ========================================
// ADMIN / SUPER ADMIN
// GUARDIAN LIST
// ========================================

router.get(
  '/',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(
    async (req, res) => {

      const result =
        await pool.query(
          `
          SELECT
            g.id,
            g.user_id,
            g.guardian_name,
            g.mobile,
            g.alternate_mobile,
            g.email,
            g.address,
            g.photo_url,

            u.login_id,
            u.is_active AS user_active,

            COALESCE(

              json_agg(

                json_build_object(

                  'id',
                  s.id,

                  'registration_no',
                  s.registration_no,

                  'student_name',
                  s.student_name,

                  'class_name',
                  s.class_name,

                  'roll_no',
                  s.roll_no,
                  'whatsapp_number',s.whatsapp_number,
                  'photo_url',s.photo_url

                )

                ORDER BY
                  s.student_name

              )

              FILTER (
                WHERE s.id
                IS NOT NULL
              ),

              '[]'::json

            ) AS students

          FROM guardian_profiles g

          JOIN users u
            ON u.id =
               g.user_id

          LEFT JOIN student_guardians sg
            ON sg.guardian_id =
               g.id

          LEFT JOIN students s
            ON s.id =
               sg.student_id

          GROUP BY
            g.id,
            g.user_id,
            g.guardian_name,
            g.mobile,
            g.alternate_mobile,
            g.email,
            g.address,
            g.photo_url,
            u.login_id,
            u.is_active

          ORDER BY
            g.guardian_name
          `
        );


      res.json({
        success: true,
        guardians:
          result.rows,
      });

    }
  )
);


// ========================================
// CREATE GUARDIAN LOGIN
// FROM STUDENT REGISTRATION NO
//
// USER ID = REGISTRATION NO
// PASSWORD = FIRST PART OF STUDENT NAME + DOB (DDMMYYYY)
// ========================================

router.post(
  '/create-for-student',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(
    async (req, res) => {

      const registrationNo =
        String(
          req.body
            ?.registration_no ||
          ''
        ).trim();


      if (!registrationNo) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              'Registration No is required',

          });

      }


      const client =
        await pool.connect();


      try {

        await client.query(
          'BEGIN'
        );


        // ----------------------------
        // FIND STUDENT
        // ----------------------------

        const studentResult =
          await client.query(
            `
            SELECT *

            FROM students

            WHERE
              LOWER(
                TRIM(
                  registration_no
                )
              )
              =
              LOWER(
                TRIM($1)
              )

              AND
              is_active=TRUE

            LIMIT 1
            `,
            [
              registrationNo
            ]
          );


        if (
          !studentResult
            .rowCount
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res
            .status(404)
            .json({

              success: false,

              message:
                'Student not found',

            });

        }


        const student =
          studentResult
            .rows[0];


        // ----------------------------
        // CHECK EXISTING GUARDIAN
        // FOR THIS STUDENT
        // ----------------------------

        const existingLink =
          await client.query(
            `
            SELECT
              g.id AS guardian_id,
              u.login_id

            FROM student_guardians sg

            JOIN guardian_profiles g
              ON g.id =
                 sg.guardian_id

            JOIN users u
              ON u.id =
                 g.user_id

            WHERE
              sg.student_id=$1

            LIMIT 1
            `,
            [
              student.id
            ]
          );


        if (
          existingLink
            .rowCount
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res
            .status(409)
            .json({

              success: false,

              message:
                'Guardian login already exists for this student',

              login_id:
                existingLink
                  .rows[0]
                  .login_id,

            });

        }


        // ----------------------------
        // CHECK LOGIN ID DUPLICATE
        // ----------------------------

        const duplicateLogin =
          await client.query(
            `
            SELECT id

            FROM users

            WHERE login_id=$1

            LIMIT 1
            `,
            [
              student
                .registration_no
            ]
          );


        if (
          duplicateLogin
            .rowCount
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res
            .status(409)
            .json({

              success: false,

              message:
                'This Registration No is already being used as a Login ID',

            });

        }


        // ----------------------------
        // GENERATE PASSWORD
        // ----------------------------

        const plainPassword = generateGuardianPassword(
          student.student_name,
          student.date_of_birth
        );


        const passwordHash =
          await bcrypt.hash(
            plainPassword,
            12
          );


        // ----------------------------
        // GUARDIAN NAME
        // ----------------------------

        const guardianName =

          student
            .guardian_name

          ||

          student
            .father_name

          ||

          student
            .mother_name

          ||

          `Guardian of ${student.student_name}`;


        // ----------------------------
        // GUARDIAN MOBILE
        // ----------------------------

        const guardianMobile =

          student
            .guardian_mobile

          ||

          student
            .father_mobile

          ||

          student
            .mobile_number

          ||

          null;


        // ----------------------------
        // CREATE USER
        // ----------------------------

        const userResult =
          await client.query(
            `
            INSERT INTO users
            (
              login_id,
              password_hash,
              full_name,
              password_change_required,
              role
            )

            VALUES
            (
              $1,
              $2,
              $3,
              TRUE,
              'guardian'
            )

            RETURNING
              id,
              login_id
            `,
            [
              student
                .registration_no,

              passwordHash,

              guardianName,
            ]
          );


        // ----------------------------
        // CREATE GUARDIAN PROFILE
        // ----------------------------

        const guardianResult =
          await client.query(
            `
            INSERT INTO guardian_profiles
            (
              user_id,
              guardian_name,
              mobile,
              alternate_mobile,
              email
            )

            VALUES
            (
              $1,$2,$3,$4,$5
            )

            RETURNING *
            `,
            [

              userResult
                .rows[0]
                .id,

              guardianName,

              guardianMobile,

              student
                .guardian_alternate_mobile

              ||

              student
                .alternate_mobile

              ||

              null,

              student.email
                || null,

            ]
          );


        // ----------------------------
        // LINK STUDENT
        // ----------------------------

        await client.query(
          `
          INSERT INTO student_guardians
          (
            student_id,
            guardian_id,
            relation_type,
            is_primary
          )

          VALUES
          (
            $1,
            $2,
            $3,
            TRUE
          )
          `,
          [

            student.id,

            guardianResult
              .rows[0]
              .id,

            'Guardian',

          ]
        );


        await client.query(
          'COMMIT'
        );


        // IMPORTANT:
        // Password returned only now.
        // Plain password is NOT stored.
        res
          .status(201)
          .json({

            success: true,

            message:
              'Guardian login created successfully',


            student: {

              id:
                student.id,

              registration_no:
                student
                  .registration_no,

              student_name:
                student
                  .student_name,

              class_name:
                student
                  .class_name,

              roll_no:
                student
                  .roll_no,

            },


            guardian:
              guardianResult
                .rows[0],


            credentials: {

              login_id:
                userResult
                  .rows[0]
                  .login_id,

              password:
                plainPassword,

            },

          });


      } catch (error) {

        await client.query(
          'ROLLBACK'
        );

        throw error;


      } finally {

        client.release();

      }

    }
  )
);


// ========================================
// ADMIN / SUPER ADMIN
// GENERATE NEW GUARDIAN PASSWORD
// ========================================

router.post('/:guardianId/reset-password', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const r=await client.query("SELECT g.user_id,u.login_id FROM guardian_profiles g JOIN users u ON u.id=g.user_id WHERE g.id=$1 AND u.role='guardian' FOR UPDATE OF u",[req.params.guardianId]);
  if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Guardian account not found'});}
  const guardian=r.rows[0],password=generateGuardianPassword(),hash=await bcrypt.hash(password,12);
  await client.query('UPDATE users SET password_hash=$1,password_change_required=TRUE,mpin_hash=NULL WHERE id=$2',[hash,guardian.user_id]);
  await revokeGuardianAccess(client,guardian.user_id);await client.query('COMMIT');
  res.json({success:true,credentials:{login_id:guardian.login_id,password}});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.patch('/:guardianId/lock',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 if(typeof req.body.locked!=='boolean')return res.status(400).json({success:false,message:'Locked must be true or false'});
 const client=await pool.connect();try{await client.query('BEGIN');
  const r=await client.query("UPDATE users u SET is_active=$2 FROM guardian_profiles g WHERE g.id=$1 AND g.user_id=u.id AND u.role='guardian' RETURNING u.id",[req.params.guardianId,!req.body.locked]);
  if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Guardian account not found'});}
  if(req.body.locked)await revokeGuardianAccess(client,r.rows[0].id);
  await client.query('COMMIT');res.json({success:true,locked:req.body.locked});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
router.delete('/:guardianId',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const r=await pool.query("DELETE FROM users u USING guardian_profiles g WHERE g.id=$1 AND g.user_id=u.id AND u.role='guardian' RETURNING u.id",[req.params.guardianId]);
 if(!r.rowCount)return res.status(404).json({success:false,message:'Guardian account not found'});
 res.json({success:true});
}));

router.post(
  '/',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(
    async (req, res) => {

      const b =
        req.body;


      const client =
        await pool.connect();


      try {

        await client.query(
          'BEGIN'
        );


        const hash =
          await bcrypt.hash(
            b.password,
            12
          );


        const userResult =
          await client.query(
            `
            INSERT INTO users
            (
              login_id,
              password_hash,
              full_name,
              password_change_required,
              role
            )

            VALUES
            (
              $1,
              $2,
              $3,
              TRUE,
              'guardian'
            )

            RETURNING id
            `,
            [

              b.login_id,

              hash,

              b.guardian_name,

            ]
          );


        const guardianResult =
          await client.query(
            `
            INSERT INTO guardian_profiles
            (
              user_id,
              guardian_name,
              mobile,
              alternate_mobile,
              email,
              address,
              photo_url
            )

            VALUES
            (
              $1,$2,$3,$4,$5,$6,$7
            )

            RETURNING *
            `,
            [

              userResult
                .rows[0]
                .id,

              b.guardian_name,

              b.mobile
                || null,

              b.alternate_mobile
                || null,

              b.email
                || null,

              b.address
                || null,

              b.photo_url
                || null,

            ]
          );


        if (
          Array.isArray(
            b.student_ids
          )
        ) {

          for (
            const studentId
            of b.student_ids
          ) {

            await client.query(
              `
              INSERT INTO student_guardians
              (
                student_id,
                guardian_id,
                relation_type,
                is_primary
              )

              VALUES
              (
                $1,$2,$3,$4
              )

              ON CONFLICT
              DO NOTHING
              `,
              [

                studentId,

                guardianResult
                  .rows[0]
                  .id,

                b.relation_type
                  || 'Guardian',

                !!b.is_primary,

              ]
            );

          }

        }


        await client.query(
          'COMMIT'
        );


        res
          .status(201)
          .json({

            success: true,

            guardian:
              guardianResult
                .rows[0],

          });


      } catch (error) {

        await client.query(
          'ROLLBACK'
        );

        throw error;


      } finally {

        client.release();

      }

    }
  )
);


// ========================================
// GUARDIAN HOME
// ========================================

router.get(
  '/home',

  auth,

  allow('guardian'),

  asyncHandler(
    async (req, res) => {

      const guardianResult =
        await pool.query(
          `
          SELECT *

          FROM guardian_profiles

          WHERE
            user_id=$1
          `,
          [
            req.user.userId
          ]
        );


      if (
        !guardianResult
          .rowCount
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              'Guardian profile not found',

          });

      }


      const guardian =
        guardianResult
          .rows[0];


      const students =
        await pool.query(
          `
          SELECT

            s.id,

            s.registration_no,

            s.student_name,

            s.class_name,

            s.roll_no,

            r.room_name AS room_number,

            s.photo_url

          FROM students s

          JOIN student_guardians sg
            ON sg.student_id =
               s.id

          LEFT JOIN rooms r ON r.id=s.room_id

          WHERE
            sg.guardian_id=$1

            AND
            s.is_active=TRUE

          ORDER BY
            s.student_name
          `,
          [
            guardian.id
          ]
        );


      res.json({

        success: true,

        guardian,

        students:
          students.rows,

      });

    }
  )
);


// ========================================
// GUARDIAN CHILD DETAILS
// ========================================

router.get(
  '/student/:studentId',

  auth,

  allow('guardian'),

  asyncHandler(
    async (req, res) => {

      const studentId =
        req.params
          .studentId;


      const allowed =
        await guardianOwnsStudent(

          req.user.userId,

          studentId

        );


      if (!allowed) {

        return res
          .status(403)
          .json({

            success: false,

            message:
              'Not allowed',

          });

      }


      const [

        student,

        attendance,

        dues,

        documents,

        marks,

        gatePasses,

        notices,

      ] =
        await Promise.all([


          pool.query(
            `
            SELECT
              s.id,
              s.registration_no,
              s.admission_no,
              s.student_name,
              s.class_name,
              s.roll_no,
              r.room_name AS room_number,
              s.date_of_birth,
              s.gender,
              s.father_name,
              s.mother_name,
              s.guardian_name,
              s.guardian_mobile,
              s.admission_date,
              s.student_type,
              s.photo_url

            FROM students s
            LEFT JOIN rooms r ON r.id=s.room_id

            WHERE
              s.id=$1
            `,
            [
              studentId
            ]
          ),


          pool.query(
            `
            SELECT *

            FROM attendance

            WHERE
              student_id=$1

            ORDER BY
              attendance_date
              DESC

            LIMIT 60
            `,
            [
              studentId
            ]
          ),


          pool.query(
            `
            SELECT *

            FROM student_dues

            WHERE
              student_id=$1

            ORDER BY
              created_at DESC
            `,
            [
              studentId
            ]
          ),


          pool.query(
            `
            SELECT
              id,
              student_id,
              document_type,
              document_title,
              guardian_visible,
              guardian_download_allowed,
              uploaded_at

            FROM student_documents

            WHERE
              student_id=$1

              AND
              guardian_visible=TRUE

            ORDER BY
              uploaded_at DESC
            `,
            [
              studentId
            ]
          ),


          pool.query(
            `
            SELECT
              sm.*,
              e.exam_name,
              e.is_published,
              su.subject_name

            FROM student_marks sm

            JOIN exams e
              ON e.id =
                 sm.exam_id

            JOIN subjects su
              ON su.id =
                 sm.subject_id

            WHERE
              sm.student_id=$1

              AND
              sm.verification_status=
              'verified'

              AND
              e.is_published=TRUE

            ORDER BY
              e.exam_date DESC
              NULLS LAST,
              su.subject_name
            `,
            [
              studentId
            ]
          ),


          pool.query(
            `
            SELECT gp.id,gp.token_no,gp.reason,gp.status,gp.departure_at,gp.expected_return_at,gp.returned_at,gp.printed_at,gp.created_at,
                   to_char(gp.departure_at,'DD-MM-YYYY HH24:MI') AS departure_text,
                   to_char(gp.expected_return_at,'DD-MM-YYYY HH24:MI') AS return_text
            FROM student_gate_passes gp
            WHERE gp.student_id=$1
            ORDER BY gp.created_at DESC
            LIMIT 100
            `,
            [studentId]
          ),


          pool.query(
            `
            SELECT DISTINCT n.* FROM notices n
            JOIN notice_targets nt ON nt.notice_id=n.id
            WHERE n.is_active=TRUE AND (
              nt.target_type='all'
              OR (nt.target_type='role' AND nt.target_value='guardian')
              OR (nt.target_type='class' AND nt.target_value=(SELECT class_name FROM students WHERE id=$1))
              OR (nt.target_type='student' AND nt.target_value=$1::text)
              OR (nt.target_type='guardian' AND nt.target_value IN (SELECT gp.id::text FROM guardian_profiles gp WHERE gp.user_id=$2))
            )
            ORDER BY n.published_at DESC LIMIT 50
            `,
            [studentId, req.user.userId]
          ),

        ]);


      if (!student.rowCount) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              'Student not found',

          });

      }


      const safeDocuments =
        documents.rows.map(
          (document) => ({

            ...document,

            view_endpoint:
              `/api/guardians/student/${studentId}/document/${document.id}/view`,

            download_endpoint:
              document
                .guardian_download_allowed

                ? `/api/guardians/student/${studentId}/document/${document.id}/download`

                : null,

          })
        );


      res.json({

        success: true,

        student:
          student.rows[0],

        attendance:
          attendance.rows,

        dues:
          dues.rows,

        documents:
          safeDocuments,

        marks:
          marks.rows,

        gate_passes:
          gatePasses.rows,

        notices:
          notices.rows,

      });

    }
  )
);


// ========================================
// GUARDIAN VIEW DOCUMENT
// ========================================

router.get(
  '/student/:studentId/document/:documentId/view',

  auth,

  allow('guardian'),

  asyncHandler(
    async (req, res) => {

      const studentId =
        req.params
          .studentId;


      const allowed =
        await guardianOwnsStudent(

          req.user.userId,

          studentId

        );


      if (!allowed) {

        return res
          .status(403)
          .json({

            success: false,

            message:
              'Not allowed',

          });

      }


      const result =
        await pool.query(
          `
          SELECT *

          FROM student_documents

          WHERE
            id=$1

            AND
            student_id=$2

            AND
            guardian_visible=TRUE

          LIMIT 1
          `,
          [

            req.params
              .documentId,

            studentId,

          ]
        );


      if (!result.rowCount) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              'Document not available',

          });

      }


      const document =
        result.rows[0];

      return sendGuardianDocument(res, document, false);

    }
  )
);


// ========================================
// GUARDIAN DOWNLOAD DOCUMENT
// ========================================

router.get(
  '/student/:studentId/document/:documentId/download',

  auth,

  allow('guardian'),

  asyncHandler(
    async (req, res) => {

      const studentId =
        req.params
          .studentId;


      const allowed =
        await guardianOwnsStudent(

          req.user.userId,

          studentId

        );


      if (!allowed) {

        return res
          .status(403)
          .json({

            success: false,

            message:
              'Not allowed',

          });

      }


      const result =
        await pool.query(
          `
          SELECT *

          FROM student_documents

          WHERE
            id=$1

            AND
            student_id=$2

            AND
            guardian_visible=TRUE

            AND
            guardian_download_allowed=TRUE

          LIMIT 1
          `,
          [

            req.params
              .documentId,

            studentId,

          ]
        );


      if (!result.rowCount) {

        return res
          .status(403)
          .json({

            success: false,

            message:
              'Download is not allowed for this document',

          });

      }


      const document =
        result.rows[0];

      return sendGuardianDocument(res, document, true);

    }
  )
);

// ========================================
// GUARDIAN: STUDENT DEPOSIT FUND
// Balance + Last 15 Transactions
// ========================================

router.get(
  '/student/:studentId/deposit-fund',

  auth,

  allow('guardian'),

  asyncHandler(async (req, res) => {

    const studentId =
      req.params.studentId;


    // Check this student belongs to guardian
    const allowed =
      await guardianOwnsStudent(
        req.user.userId,
        studentId
      );


    if (!allowed) {

      return res.status(403).json({
        success: false,
        message: 'Not allowed',
      });

    }


    // ----------------------------
    // TOTAL DEPOSIT / EXPENSE
    // ----------------------------

    const summaryResult =
      await pool.query(
        `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN transaction_type='deposit'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_deposit,

          COALESCE(
            SUM(
              CASE
                WHEN transaction_type='expense'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_expense

        FROM student_deposit_transactions

        WHERE student_id=$1
        `,
        [studentId]
      );


    const totalDeposit =
      Number(
        summaryResult.rows[0]
          .total_deposit || 0
      );


    const totalExpense =
      Number(
        summaryResult.rows[0]
          .total_expense || 0
      );


    const balance =
      totalDeposit -
      totalExpense;


    const due =
      balance < 0
        ? Math.abs(balance)
        : 0;


    const availableBalance =
      balance > 0
        ? balance
        : 0;


    // ----------------------------
    // LAST 15 TRANSACTIONS
    // WITH RUNNING BALANCE
    // ----------------------------

    const transactionResult =
      await pool.query(
        `
        SELECT *

        FROM (

          SELECT

            id,
            student_id,
            transaction_date,
            transaction_type,
            amount,
            details,
            reference_no,
            created_at,

            SUM(
              CASE

                WHEN transaction_type='deposit'
                  THEN amount

                WHEN transaction_type='expense'
                  THEN -amount

                ELSE 0

              END
            )
            OVER (
              PARTITION BY student_id

              ORDER BY
                transaction_date,
                id

              ROWS BETWEEN
                UNBOUNDED PRECEDING
                AND CURRENT ROW
            )
            AS running_balance

          FROM student_deposit_transactions

          WHERE student_id=$1

        ) t

        ORDER BY
          transaction_date DESC,
          id DESC

        LIMIT 15
        `,
        [studentId]
      );


    res.json({

      success: true,

      summary: {

        total_deposit:
          totalDeposit,

        total_expense:
          totalExpense,

        available_balance:
          availableBalance,

        due:
          due,

        net_balance:
          balance,

      },

      transactions:
        transactionResult.rows,

    });

  })
);// ========================================
// ADMIN / SUPER ADMIN:
// STUDENT DEPOSIT FUND DETAILS
// ========================================

router.get(
  '/admin/student/:studentId/deposit-fund',

  auth,

  allow('super_admin', 'admin'),

  asyncHandler(async (req, res) => {

    const studentId =
      req.params.studentId;


    // ----------------------------
    // CHECK STUDENT
    // ----------------------------

    const studentResult =
      await pool.query(
        `
        SELECT
          id,
          registration_no,
          student_name,
          class_name,
          roll_no
        FROM students
        WHERE id=$1
        LIMIT 1
        `,
        [studentId]
      );


    if (!studentResult.rowCount) {

      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });

    }


    // ----------------------------
    // SUMMARY
    // ----------------------------

    const summaryResult =
      await pool.query(
        `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN transaction_type='deposit'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_deposit,

          COALESCE(
            SUM(
              CASE
                WHEN transaction_type='expense'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_expense

        FROM student_deposit_transactions

        WHERE student_id=$1
        `,
        [studentId]
      );


    const totalDeposit =
      Number(
        summaryResult.rows[0]
          .total_deposit || 0
      );


    const totalExpense =
      Number(
        summaryResult.rows[0]
          .total_expense || 0
      );


    const netBalance =
      totalDeposit -
      totalExpense;


    // ----------------------------
    // LAST 50 TRANSACTIONS
    // ----------------------------

    const transactionResult =
      await pool.query(
        `
        SELECT *

        FROM (

          SELECT

            id,
            student_id,
            transaction_date,
            transaction_type,
            amount,
            details,
            reference_no,
            created_by,
            created_at,

            SUM(
              CASE
                WHEN transaction_type='deposit'
                  THEN amount
                WHEN transaction_type='expense'
                  THEN -amount
                ELSE 0
              END
            )
            OVER (
              PARTITION BY student_id
              ORDER BY
                transaction_date,
                id
              ROWS BETWEEN
                UNBOUNDED PRECEDING
                AND CURRENT ROW
            )
            AS running_balance

          FROM student_deposit_transactions

          WHERE student_id=$1

        ) t

        ORDER BY
          transaction_date DESC,
          id DESC

        LIMIT 50
        `,
        [studentId]
      );


    res.json({

      success: true,

      student:
        studentResult.rows[0],

      summary: {

        total_deposit:
          totalDeposit,

        total_expense:
          totalExpense,

        net_balance:
          netBalance,

        available_balance:
          netBalance > 0
            ? netBalance
            : 0,

        due:
          netBalance < 0
            ? Math.abs(netBalance)
            : 0,

      },

      transactions:
        transactionResult.rows,

    });

  })
);


// ========================================
// ADMIN / SUPER ADMIN:
// ADD DEPOSIT / EXPENSE
// ========================================

router.post(
  '/admin/student/:studentId/deposit-fund',

  auth,

  allow('super_admin', 'admin'),

  asyncHandler(async (req, res) => {

    const studentId =
      req.params.studentId;


    const {
      transaction_type,
      amount,
      details,
      reference_no,
      transaction_date,
    } = req.body || {};


    // ----------------------------
    // VALIDATION
    // ----------------------------

    if (
      transaction_type !== 'deposit' &&
      transaction_type !== 'expense'
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Transaction type must be deposit or expense',
      });

    }


    const numericAmount =
      Number(amount);


    if (
      !numericAmount ||
      numericAmount <= 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Amount must be greater than 0',
      });

    }


    // ----------------------------
    // CHECK STUDENT
    // ----------------------------

    const studentResult =
      await pool.query(
        `
        SELECT
          id,
          registration_no,
          student_name
        FROM students
        WHERE id=$1
          AND is_active=TRUE
        LIMIT 1
        `,
        [studentId]
      );


    if (!studentResult.rowCount) {

      return res.status(404).json({
        success: false,
        message:
          'Student not found',
      });

    }


    // ----------------------------
    // INSERT TRANSACTION
    // ----------------------------

    const result =
      await pool.query(
        `
        INSERT INTO student_deposit_transactions
        (
          student_id,
          transaction_date,
          transaction_type,
          amount,
          details,
          reference_no,
          created_by
        )

        VALUES
        (
          $1,
          COALESCE($2::date, CURRENT_DATE),
          $3,
          $4,
          $5,
          $6,
          $7
        )

        RETURNING *
        `,
        [
          studentId,

          transaction_date ||
            null,

          transaction_type,

          numericAmount,

          details
            ? String(details).trim()
            : null,

          reference_no
            ? String(reference_no).trim()
            : null,

          req.user.userId,
        ]
      );


    res.status(201).json({

      success: true,

      message:
        transaction_type === 'deposit'
          ? 'Deposit added successfully'
          : 'Expense added successfully',

      transaction:
        result.rows[0],

    });

  })
);// ========================================
// ADMIN / SUPER ADMIN:
// ALL STUDENTS DEPOSIT FUND REPORT
// ========================================

router.get(
  '/admin/deposit-fund-report',

  auth,

  allow('super_admin', 'admin'),

  asyncHandler(async (req, res) => {

    const result =
      await pool.query(
        `
        SELECT

          s.id,

          s.registration_no,

          s.student_name,

          s.class_name,

          s.roll_no,

          r.room_name AS room_number,

          s.guardian_name,

          s.guardian_mobile,

          s.father_name,

          s.father_mobile,

          s.mother_name,

          s.mother_mobile,

          s.mobile_number,

          COALESCE(
            SUM(
              CASE
                WHEN t.transaction_type='deposit'
                THEN t.amount
                ELSE 0
              END
            ),
            0
          ) AS total_deposit,

          COALESCE(
            SUM(
              CASE
                WHEN t.transaction_type='expense'
                THEN t.amount
                ELSE 0
              END
            ),
            0
          ) AS total_expense,

          COALESCE(
            SUM(
              CASE
                WHEN t.transaction_type='deposit'
                THEN t.amount

                WHEN t.transaction_type='expense'
                THEN -t.amount

                ELSE 0
              END
            ),
            0
          ) AS net_balance,

          MAX(
            t.transaction_date
          ) AS last_transaction_date

        FROM students s

        LEFT JOIN student_deposit_transactions t
          ON t.student_id=s.id

        LEFT JOIN rooms r
          ON r.id=s.room_id

        WHERE
          s.is_active=TRUE

        GROUP BY

          s.id,

          s.registration_no,

          s.student_name,

          s.class_name,

          s.roll_no,

          r.room_name,

          s.guardian_name,

          s.guardian_mobile,

          s.father_name,

          s.father_mobile,

          s.mother_name,

          s.mother_mobile,

          s.mobile_number

        ORDER BY
          s.class_name,
          s.student_name
        `
      );


    const students =
      result.rows.map(
        (row) => {

          const totalDeposit =
            Number(
              row.total_deposit || 0
            );

          const totalExpense =
            Number(
              row.total_expense || 0
            );

          const netBalance =
            Number(
              row.net_balance || 0
            );


          let status =
            'clear';


          if (netBalance > 0) {
            status = 'deposit';
          }


          if (netBalance < 0) {
            status = 'due';
          }


          return {

            ...row,

            total_deposit:
              totalDeposit,

            total_expense:
              totalExpense,

            net_balance:
              netBalance,

            available_balance:
              netBalance > 0
                ? netBalance
                : 0,

            due:
              netBalance < 0
                ? Math.abs(
                    netBalance
                  )
                : 0,

            status,

          };

        }
      );


    // ====================================
    // OVERALL SUMMARY
    // ====================================

    let totalDeposit = 0;

    let totalExpense = 0;

    let totalPositiveBalance = 0;

    let totalDue = 0;

    let dueStudents = 0;

    let positiveStudents = 0;

    let clearStudents = 0;


    for (
      const student
      of students
    ) {

      totalDeposit +=
        student.total_deposit;

      totalExpense +=
        student.total_expense;


      if (
        student.net_balance > 0
      ) {

        totalPositiveBalance +=
          student.net_balance;

        positiveStudents++;

      } else if (
        student.net_balance < 0
      ) {

        totalDue +=
          Math.abs(
            student.net_balance
          );

        dueStudents++;

      } else {

        clearStudents++;

      }

    }


    res.json({

      success: true,

      summary: {

        total_students:
          students.length,

        total_deposit:
          totalDeposit,

        total_expense:
          totalExpense,

        total_positive_balance:
          totalPositiveBalance,

        total_due:
          totalDue,

        net_fund_balance:
          totalDeposit -
          totalExpense,

        positive_students:
          positiveStudents,

        due_students:
          dueStudents,

        clear_students:
          clearStudents,

      },

      students,

    });

  })
);// ========================================
// GUARDIAN: COMPLETE STUDENT PROFILE
// Student + Visitor 1 + Visitor 2
// ========================================

router.get(
  '/student/:studentId/profile',

  auth,

  allow('guardian'),

  asyncHandler(async (req, res) => {

    const studentId =
      req.params.studentId;


    // Guardian can see only linked student
    const allowed =
      await guardianOwnsStudent(
        req.user.userId,
        studentId
      );


    if (!allowed) {

      return res.status(403).json({
        success: false,
        message: 'Not allowed',
      });

    }


    // ----------------------------
    // COMPLETE STUDENT DATA
    // ----------------------------

    const studentResult =
      await pool.query(
        `
        SELECT s.*, r.room_name AS room_number
        FROM students s
        LEFT JOIN rooms r ON r.id=s.room_id
        WHERE s.id=$1
          AND s.is_active=TRUE
        LIMIT 1
        `,
        [studentId]
      );


    if (!studentResult.rowCount) {

      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });

    }


    // ----------------------------
    // VISITOR 1 + VISITOR 2
    // ----------------------------

    const visitorsResult =
      await pool.query(
        `
        SELECT
          id,
          student_id,
          visitor_number,
          visitor_name,
          relation,
          mobile_number,
          email,
          village,
          police_station,
          pin_code,
          post_office,
          block,
          district,
          state,
          address_source

        FROM student_visitors

        WHERE student_id=$1

        ORDER BY visitor_number
        `,
        [studentId]
      );


    const visitor1 =
      visitorsResult.rows.find(
        (v) =>
          Number(v.visitor_number) === 1
      ) || null;


    const visitor2 =
      visitorsResult.rows.find(
        (v) =>
          Number(v.visitor_number) === 2
      ) || null;


    res.json({

      success: true,

      student:
        studentResult.rows[0],

      visitor1,

      visitor2,

    });

  })
);// ========================================
// MONTHLY FEES WEBSITE HELPERS
// ========================================

router.get(
  '/student/:studentId/monthly-fee-due',

  auth,

  allow('guardian'),

  asyncHandler(async (req, res) => {

    const studentId =
      req.params.studentId;


    // ------------------------------------
    // Guardian may check only own student
    // ------------------------------------

    const allowed =
      await guardianOwnsStudent(
        req.user.userId,
        studentId
      );


    if (!allowed) {

      return res.status(403).json({
        success: false,
        message:
          'Not allowed',
      });

    }


    // ------------------------------------
    // STUDENT
    // ------------------------------------

    const studentResult =
      await pool.query(
        `
        SELECT
          id,
          registration_no,
          student_name,
          class_name,
          stream
        FROM students
        WHERE id=$1
          AND is_active=TRUE
        LIMIT 1
        `,
        [studentId]
      );


    if (
      !studentResult.rowCount
    ) {

      return res.status(404).json({
        success: false,
        message:
          'Student not found',
      });

    }


    const student =
      studentResult.rows[0];


    if (
      !student.registration_no
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Student Registration No is missing',
      });

    }


    try {

      // ==================================
      // STEP 1:
      // GET WEBSITE + CLASS LIST
      // ==================================

      return res.json(await getMonthlyFeeDue(student));

    } catch (error) {

      console.error(
        'Monthly Fee Due Error:',
        error
      );


      return res.status(502).json({

        success: false,

        message:
          'Monthly fee website থেকে Due আনা যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।',

      });

    }

  })
);
module.exports = router;