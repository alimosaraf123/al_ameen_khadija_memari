require('dotenv').config();
const pool = require('../src/db');

async function main() {
  const gatemen = [
    {
      staff_id: '786786',
      name: 'Aparna Mondal',
      login_id: 'gateman01',
      mobile: '9907738860',
    },
    {
      staff_id: 'GATE-002',
      name: 'Sk Akbar Ali',
      login_id: 'gateman02',
      mobile: null,
    },
    {
      staff_id: 'GATE-003',
      name: 'Abbas Mirza',
      login_id: 'gateman03',
      mobile: null,
    },
    {
      staff_id: 'GATE-004',
      name: 'Gateman 4',
      login_id: 'gateman04',
      mobile: null,
    },
  ];

  for (const g of gatemen) {
    const u = (await pool.query("SELECT id FROM users WHERE login_id = $1", [g.login_id])).rows[0];
    const existing = (await pool.query("SELECT id FROM teachers WHERE staff_id = $1", [g.staff_id])).rows[0];

    const profileDetails = {
      staff_type: 'Security Guard',
      staff_category: 'Nonteaching',
      salary: '0',
    };

    if (existing) {
      await pool.query(
        "UPDATE teachers SET name = $1, designation = 'Security Guard', profile_details = profile_details || $2::jsonb, is_active = TRUE WHERE id = $3",
        [g.name, JSON.stringify(profileDetails), existing.id]
      );
      console.log(`Updated existing teacher record for ${g.staff_id} (${g.name})`);
    } else {
      await pool.query(
        `INSERT INTO teachers(staff_id, name, designation, mobile, is_active, user_id, profile_details)
         VALUES($1, $2, 'Security Guard', $3, TRUE, $4, $5::jsonb)`,
        [g.staff_id, g.name, g.mobile, u?.id || null, JSON.stringify(profileDetails)]
      );
      console.log(`Inserted new teacher record for ${g.staff_id} (${g.name})`);
    }
  }

  const all = await pool.query(
    "SELECT id, staff_id, name, designation, is_active FROM teachers WHERE staff_id IN ('786786', 'GATE-002', 'GATE-003', 'GATE-004') ORDER BY staff_id"
  );
  console.log('All Gatemen in teachers table:', all.rows);
  await pool.end();
}

main().catch(console.error);
