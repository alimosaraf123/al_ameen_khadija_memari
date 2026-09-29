const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const { studentFields, normalizeValue, prepareBody } = require('../utils/studentData');

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