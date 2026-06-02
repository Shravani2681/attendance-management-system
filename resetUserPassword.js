require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./src/config/postgres');

async function resetPassword() {
  const email = 'lokesh6@gmail.com';
  const newPassword = 'Shravani@2681';

  const hash = bcrypt.hashSync(newPassword, 10);

  const result = await query(
    `UPDATE employees
     SET password = $1
     WHERE email = $2
     RETURNING id, name, email, role`,
    [hash, email.toLowerCase().trim()]
  );

  console.table(result.rows);

  await pool.end();
}

resetPassword();