require('dotenv').config();
const { query, pool } = require('./src/config/postgres');

async function checkUsers() {
  const result = await query(
    `SELECT id, name, email, role, department FROM employees ORDER BY role, name`
  );

  console.table(result.rows);
  await pool.end();
}

checkUsers();