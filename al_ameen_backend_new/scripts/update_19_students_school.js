const pool = require('../src/db');

const list = [
  { reg: '40737', name: 'Jannatun Fardosi', school: 'Bohar Girls High School' },
  { reg: '40849', name: 'Safina Anjum', school: 'Bohar Girls High School' },
  { reg: '41449', name: 'Umme Khadija', school: 'Bohar Girls High School' },
  { reg: '50703', name: 'Sania Khatun', school: 'Bohar Girls High School' },
  { reg: '54460', name: 'Benazir Khatun', school: 'Bohar Girls High School' },
  { reg: '55288', name: 'Amina Khatun', school: 'Debipur Station Girls High School' },
  { reg: '60016', name: 'Nausina Khatun', school: 'Debipur Station Girls High School' },
  { reg: '60803', name: 'Aniqa Tahsin', school: 'Debipur Station Girls High School' },
  { reg: '62314', name: 'Shyada Khatun', school: 'Bohar Girls High School' },
  { reg: '62455', name: 'Nurjamina Khatun', school: 'Debipur Station Girls High School' },
  { reg: '62459', name: 'Tanaya Sultana', school: 'Bohar Girls High School' },
  { reg: '76733', name: 'Arsida Mondal', school: 'Debipur Station Girls High School' },
  { reg: '76828', name: 'Amina Umme Aiman', school: 'Debipur Station Girls High School' },
  { reg: '77015', name: 'Samseriya Khatun', school: 'Debipur Station Girls High School' },
  { reg: '77029', name: 'Sabina Yeasmin', school: 'Bohar Girls High School' },
  { reg: '77083', name: 'Mehenaz Khatun', school: 'Debipur Station Girls High School' },
  { reg: '77161', name: 'Roshida Islam', school: 'Bohar Girls High School' },
  { reg: '77320', name: 'Shagufta Parveen', school: 'Bohar Girls High School' },
  { reg: '77868', name: 'Mobina Parvin', school: 'Bohar Girls High School' },
];

async function updateSchools() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = [];
    for (const item of list) {
      const res = await client.query(
        `UPDATE students 
         SET admitted_school_name = $1 
         WHERE registration_no = $2 
         RETURNING id, registration_no, student_name, class_name, admitted_school_name`,
        [item.school, item.reg]
      );
      if (res.rows.length > 0) {
        updated.push(res.rows[0]);
      } else {
        console.warn(`WARNING: Registration ${item.reg} (${item.name}) not found!`);
      }
    }

    await client.query('COMMIT');
    console.log(`Successfully updated ${updated.length} of ${list.length} students:`);
    console.table(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update failed, rolled back:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

updateSchools();
