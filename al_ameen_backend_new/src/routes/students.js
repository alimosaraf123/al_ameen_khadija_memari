const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const exitSchemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS student_exit_records (
    id BIGSERIAL PRIMARY KEY,
    student_id BIGINT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    dropout_date DATE NOT NULL,
    dropout_reason TEXT NOT NULL,
    tc_issued_at TIMESTAMPTZ,
    tc_issued_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

async function exitClearance(studentId) {
  await exitSchemaReady;
  const student=(await pool.query(`SELECT s.*,r.room_name FROM students s LEFT JOIN rooms r ON r.id=s.room_id WHERE s.id=$1`,[studentId])).rows[0];
  if(!student)return null;
  const dues=(await pool.query(`SELECT id,due_title,amount,due_date,remarks FROM student_dues WHERE student_id=$1 AND status='due' AND amount>0 ORDER BY due_date NULLS LAST,created_at`,[studentId])).rows;
  const isSdf=x=>/\bs\.?d\.?f\b|student development fund/i.test(String(x.due_title||''));
  const isLibrary=x=>/library|book/i.test(String(x.due_title||''));
  const isMonthly=x=>/monthly|tuition|school fee|fees?/i.test(String(x.due_title||''))&&!isSdf(x);
  const libraryLoans=(await pool.query(`SELECT l.id,b.accession_no,b.title,l.issued_at,l.due_date,'Library Book: '||b.title AS due_title FROM library_loans l JOIN library_books b ON b.id=l.book_id WHERE l.student_id=$1 AND l.returned_at IS NULL ORDER BY l.due_date`,[studentId])).rows;
  const sdfDues=dues.filter(isSdf),libraryDues=[...dues.filter(isLibrary),...libraryLoans],monthlyDues=dues.filter(isMonthly);
  const exit=(await pool.query('SELECT * FROM student_exit_records WHERE student_id=$1',[studentId])).rows[0]||null;
  return {student,exit,dues,sdf_dues:sdfDues,library_dues:libraryDues,monthly_fee_dues:monthlyDues,monthly_fee_due_total:monthlyDues.reduce((n,x)=>n+Number(x.amount||0),0),tc_blocked:sdfDues.length>0||libraryDues.length>0};
}

router.get('/:id/exit-clearance',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const data=await exitClearance(req.params.id);if(!data)return res.status(404).json({success:false,message:'Student not found'});res.json({success:true,...data});}));
router.post('/:id/dropout',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{await exitSchemaReady;const date=String(req.body?.dropout_date||'').trim(),reason=String(req.body?.dropout_reason||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!reason)return res.status(400).json({success:false,message:'Dropout date and reason are required'});const client=await pool.connect();try{await client.query('BEGIN');const student=(await client.query('UPDATE students SET is_active=FALSE,updated_at=NOW() WHERE id=$1 RETURNING id,student_name',[req.params.id])).rows[0];if(!student){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Student not found'});}const exit=(await client.query(`INSERT INTO student_exit_records(student_id,dropout_date,dropout_reason,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(student_id) DO UPDATE SET dropout_date=EXCLUDED.dropout_date,dropout_reason=EXCLUDED.dropout_reason,tc_issued_at=NULL,tc_issued_by=NULL,reactivated_at=NULL,reactivated_by=NULL,updated_at=NOW() RETURNING *`,[req.params.id,date,reason,req.user.userId])).rows[0];await client.query('COMMIT');res.json({success:true,student,exit});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release();}}));
router.post('/:id/transfer-certificate',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const data=await exitClearance(req.params.id);if(!data)return res.status(404).json({success:false,message:'Student not found'});if(!data.exit)return res.status(409).json({success:false,message:'Save dropout date and reason before issuing TC'});if(data.student.is_active)return res.status(409).json({success:false,message:'TC can only be issued for a dropout/inactive student'});if(data.tc_blocked)return res.status(409).json({success:false,message:'TC cannot be issued until SDF and Library Book dues are cleared',sdf_dues:data.sdf_dues,library_dues:data.library_dues});const exit=(await pool.query('UPDATE student_exit_records SET tc_issued_at=COALESCE(tc_issued_at,NOW()),tc_issued_by=COALESCE(tc_issued_by,$1),updated_at=NOW() WHERE student_id=$2 RETURNING *',[req.user.userId,req.params.id])).rows[0];res.json({success:true,...data,exit});}));


const { studentFields, normalizeValue, prepareBody } = require('../utils/studentData');

function validateStudentInput(body) {
  const aadhaarFields = [['aadhaar_no', 'Student Aadhaar'], ['father_aadhaar_no', 'Father Aadhaar'], ['mother_aadhaar_no', 'Mother Aadhaar']];
  for (const [field, label] of aadhaarFields) { const value=String(body[field]||'').trim(); if(value&&!/^\d{12}$/.test(value)){const error=new Error(label+' number must be exactly 12 digits');error.status=400;throw error;} }
  const mobileFields = [['mobile_number','Student mobile'],['whatsapp_number','WhatsApp'],['father_mobile','Father mobile'],['mother_mobile','Mother mobile'],['guardian_mobile','Guardian mobile'],['alternate_mobile','Alternate mobile']];
  for (const [field, label] of mobileFields) { const value=String(body[field]||'').trim(); if(value&&!/^\d{10}$/.test(value)){const error=new Error(label+' number must be exactly 10 digits');error.status=400;throw error;} }
  for (const visitor of [body.visitor1,body.visitor2]) { const value=String(visitor?.mobile_number||'').trim(); if(value&&!/^\d{10}$/.test(value)){const error=new Error('Visitor mobile number must be exactly 10 digits');error.status=400;throw error;} }
  if(body.session_from||body.session_to){const from=Number(body.session_from),to=Number(body.session_to);if(!/^\d{4}$/.test(String(body.session_from))||!/^\d{4}$/.test(String(body.session_to))||![from,from+1].includes(to)){const error=new Error('Admission session must use same-year or next-year format');error.status=400;throw error;}}
}

function visitorValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text === '' ? null : text;
}

async function saveVisitor(
  client,
  studentId,
  visitorNumber,
  visitor
) {
  if (visitor === undefined) {
    return;
  }

  // visitor=null পাঠালে visitor delete হবে
  if (visitor === null) {
    await client.query(
      `
      DELETE FROM student_visitors
      WHERE student_id=$1
      AND visitor_number=$2
      `,
      [studentId, visitorNumber]
    );

    return;
  }

  const data = {
    visitor_name: visitorValue(visitor.visitor_name),
    relation: visitorValue(visitor.relation),
    mobile_number: visitorValue(visitor.mobile_number),
    email: visitorValue(visitor.email),

    village: visitorValue(visitor.village),
    police_station: visitorValue(visitor.police_station),
    pin_code: visitorValue(visitor.pin_code),
    post_office: visitorValue(visitor.post_office),
    block: visitorValue(visitor.block),
    district: visitorValue(visitor.district),
    state: visitorValue(visitor.state),

    address_source:
      visitorValue(visitor.address_source) || 'custom',
  };

  const hasData = [
    data.visitor_name,
    data.relation,
    data.mobile_number,
    data.email,
    data.village,
    data.police_station,
    data.pin_code,
    data.post_office,
    data.block,
    data.district,
    data.state,
  ].some(Boolean);

  // সব field ফাঁকা হলে visitor record remove
  if (!hasData) {
    await client.query(
      `
      DELETE FROM student_visitors
      WHERE student_id=$1
      AND visitor_number=$2
      `,
      [studentId, visitorNumber]
    );

    return;
  }

  await client.query(
    `
    INSERT INTO student_visitors (
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
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13,$14
    )

    ON CONFLICT (student_id, visitor_number)

    DO UPDATE SET
      visitor_name=EXCLUDED.visitor_name,
      relation=EXCLUDED.relation,
      mobile_number=EXCLUDED.mobile_number,
      email=EXCLUDED.email,
      village=EXCLUDED.village,
      police_station=EXCLUDED.police_station,
      pin_code=EXCLUDED.pin_code,
      post_office=EXCLUDED.post_office,
      block=EXCLUDED.block,
      district=EXCLUDED.district,
      state=EXCLUDED.state,
      address_source=EXCLUDED.address_source,
      updated_at=NOW()
    `,
    [
      studentId,
      visitorNumber,
      data.visitor_name,
      data.relation,
      data.mobile_number,
      data.email,
      data.village,
      data.police_station,
      data.pin_code,
      data.post_office,
      data.block,
      data.district,
      data.state,
      data.address_source,
    ]
  );
}


// =========================
// GET STUDENT LIST
// =========================

router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const {
      class_name,
      room_id,
      q,
      include_inactive,
    } = req.query;

    const values = [];
    const where = [];

    if (include_inactive !== 'true') {
      where.push(`s.is_active = TRUE`);
    }

    if (class_name) {
      values.push(class_name);

      where.push(
        `s.class_name=$${values.length}`
      );
    }

    if (room_id) {
      values.push(room_id);

      where.push(
        `s.room_id=$${values.length}`
      );
    }

    if (q) {
      values.push(`%${q}%`);

      where.push(
        `(
          s.student_name ILIKE $${values.length}
          OR
          s.registration_no ILIKE $${values.length}
        )`
      );
    }

    const sql = `
      SELECT
        s.*,
        r.room_name

      FROM students s

      LEFT JOIN rooms r
      ON r.id=s.room_id

      ${
        where.length
          ? 'WHERE ' + where.join(' AND ')
          : ''
      }

      ORDER BY
        s.class_name,
        s.roll_no,
        s.student_name
    `;

    const result = await pool.query(
      sql,
      values
    );

    res.json({
      success: true,
      students: result.rows,
    });
  })
);


// =========================
// GET ONE STUDENT
// =========================

router.get('/bank/ifsc/:ifsc', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const ifsc=String(req.params.ifsc||'').trim().toUpperCase();
  if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return res.status(400).json({success:false,message:'Enter a valid 11-character IFSC code'});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try { const response=await fetch('https://ifsc.razorpay.com/'+encodeURIComponent(ifsc),{signal:controller.signal}); if(response.status===404)return res.status(404).json({success:false,message:'IFSC code not found'}); if(!response.ok)throw new Error('IFSC service unavailable'); const bank=await response.json(); res.json({success:true,ifsc,bank_name:bank.BANK||'',branch_name:bank.BRANCH||'',branch_address:bank.ADDRESS||'',city:bank.CITY||'',district:bank.DISTRICT||'',state:bank.STATE||''}); }
  catch(error){if(error.name==='AbortError')return res.status(504).json({success:false,message:'IFSC lookup timed out; enter bank details manually'});throw error;} finally{clearTimeout(timeout);}
}));

router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {

    const studentResult =
      await pool.query(
        `
        SELECT
          s.*,
          r.room_name

        FROM students s

        LEFT JOIN rooms r
        ON r.id=s.room_id

        WHERE s.id=$1
        `,
        [req.params.id]
      );

    if (!studentResult.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const visitorResult =
      await pool.query(
        `
        SELECT *
        FROM student_visitors
        WHERE student_id=$1
        ORDER BY visitor_number
        `,
        [req.params.id]
      );

    const visitors = visitorResult.rows;

    const visitor1 =
      visitors.find(
        (v) => v.visitor_number === 1
      ) || null;

    const visitor2 =
      visitors.find(
        (v) => v.visitor_number === 2
      ) || null;

    res.json({
      success: true,

      student: {
        ...studentResult.rows[0],

        visitors,

        visitor1,
        visitor2,
      },
    });
  })
);


// =========================
// ADD STUDENT
// =========================

router.post(
  '/',
  auth,
  allow('super_admin', 'admin'),

  asyncHandler(async (req, res) => {

    const b = prepareBody(req.body);

    validateStudentInput(b);

    if (
      !b.registration_no ||
      !String(b.registration_no).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Registration Number is required',
      });
    }

    if (
      !b.student_name ||
      !String(b.student_name).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Student Name is required',
      });
    }

    const fields =
      studentFields.filter(
        (field) =>
          b[field] !== undefined
      );

    const values =
      fields.map(
        (field) =>
          normalizeValue(
            field,
            b[field]
          )
      );

    const placeholders =
      fields.map(
        (_, index) =>
          `$${index + 1}`
      );

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');

      const studentResult =
        await client.query(
          `
          INSERT INTO students (
            ${fields.join(', ')}
          )

          VALUES (
            ${placeholders.join(', ')}
          )

          RETURNING *
          `,
          values
        );

      const student =
        studentResult.rows[0];

      await saveVisitor(
        client,
        student.id,
        1,
        b.visitor1
      );

      await saveVisitor(
        client,
        student.id,
        2,
        b.visitor2
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message:
          'Student added successfully',
        student,
      });

    } catch (error) {
      await client.query('ROLLBACK');

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message:
            'Registration Number already exists',
        });
      }

      throw error;

    } finally {
      client.release();
    }
  })
);


// =========================
// UPDATE STUDENT
// =========================

router.put(
  '/:id',
  auth,
  allow('super_admin', 'admin'),

  asyncHandler(async (req, res) => {

    const b = prepareBody(req.body);

    validateStudentInput(b);

    const fields =
      studentFields.filter(
        (field) =>
          Object.prototype.hasOwnProperty.call(
            b,
            field
          )
      );

    if (!fields.length) {
      return res.status(400).json({
        success: false,
        message:
          'No student data supplied',
      });
    }

    const values =
      fields.map(
        (field) =>
          normalizeValue(
            field,
            b[field]
          )
      );

    const updates =
      fields.map(
        (field, index) =>
          `${field}=$${index + 1}`
      );

    values.push(req.params.id);

    const idPosition =
      values.length;

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');

      const studentResult =
        await client.query(
          `
          UPDATE students

          SET
            ${updates.join(', ')},
            updated_at=NOW()

          WHERE id=$${idPosition}

          RETURNING *
          `,
          values
        );

      if (!studentResult.rowCount) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          success: false,
          message:
            'Student not found',
        });
      }

      await saveVisitor(
        client,
        req.params.id,
        1,
        b.visitor1
      );

      await saveVisitor(
        client,
        req.params.id,
        2,
        b.visitor2
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message:
          'Student updated successfully',
        student:
          studentResult.rows[0],
      });

    } catch (error) {
      await client.query('ROLLBACK');

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message:
            'Registration Number already exists',
        });
      }

      throw error;

    } finally {
      client.release();
    }
  })
);


// =========================
// DELETE / DEACTIVATE STUDENT
// =========================

router.delete(
  '/:id',
  auth,
  allow('super_admin', 'admin'),

  asyncHandler(async (req, res) => {

    const result =
      await pool.query(
        `
        UPDATE students

        SET
          is_active=FALSE,
          updated_at=NOW()

        WHERE id=$1

        RETURNING id, student_name
        `,
        [req.params.id]
      );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message:
          'Student not found',
      });
    }

    res.json({
      success: true,
      message:
        'Student deleted successfully',
    });
  })
);


module.exports = router;