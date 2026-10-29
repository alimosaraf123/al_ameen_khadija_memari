const pool = require('../src/db');

const mappings = [
  { reg: '62630', school_reg: '2262106331', school: 'MEMARI HIGH SCHOOL' },
  { reg: '77230', school_reg: '2262106327', school: 'MEMARI HIGH SCHOOL' },
  { reg: '61101', school_reg: '2262106320', school: 'MEMARI HIGH SCHOOL' },
  { reg: '56545', school_reg: '2262106333', school: 'MEMARI HIGH SCHOOL' },
  { reg: '49574', school_reg: '2262106328', school: 'MEMARI HIGH SCHOOL' },
  { reg: '55227', school_reg: '2262106324', school: 'MEMARI HIGH SCHOOL' },
  { reg: '62733', school_reg: '2262106334', school: 'MEMARI HIGH SCHOOL' },
  { reg: '76854', school_reg: '2262106322', school: 'MEMARI HIGH SCHOOL' },
  { reg: '49569', school_reg: '2262106315', school: 'MEMARI HIGH SCHOOL' },
  { reg: '76411', school_reg: '2262106325', school: 'MEMARI HIGH SCHOOL' },
  { reg: '55341', school_reg: '2262106313', school: 'MEMARI HIGH SCHOOL' },
  { reg: '50831', school_reg: '2262106316', school: 'MEMARI HIGH SCHOOL' },
  { reg: '46114', school_reg: '2262106310', school: 'MEMARI HIGH SCHOOL' },
  { reg: '77859', school_reg: '2262106318', school: 'MEMARI HIGH SCHOOL' },
  { reg: '77652', school_reg: '2262106323', school: 'MEMARI HIGH SCHOOL' },
  { reg: '56117', school_reg: '2262106326', school: 'MEMARI HIGH SCHOOL' },
  { reg: '60753', school_reg: '2262106314', school: 'MEMARI HIGH SCHOOL' },
  { reg: '45805', school_reg: '2262106319', school: 'MEMARI HIGH SCHOOL' },
  { reg: '62324', school_reg: '2262106312', school: 'MEMARI HIGH SCHOOL' },
  { reg: '77077', school_reg: '2262106330', school: 'MEMARI HIGH SCHOOL' }
];

async function updateMappings() {
  for (const m of mappings) {
    const res = await pool.query(
      `UPDATE students SET school_reg_no = $1, council_reg_no = $1, admitted_school_name = COALESCE(admitted_school_name, $2) WHERE registration_no = $3 RETURNING id, student_name`,
      [m.school_reg, m.school, m.reg]
    );
    if (res.rows.length) {
      console.log('Linked:', res.rows[0].student_name, '-> Reg:', m.reg, '-> School Reg:', m.school_reg);
    } else {
      console.log('Not found for reg:', m.reg);
    }
  }
  process.exit(0);
}

updateMappings().catch(e => {
  console.error(e);
  process.exit(1);
});
