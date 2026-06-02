require('dotenv').config();
const { query, pool } = require('./src/config/postgres');

async function test() {
  try {
    const res = await query('SELECT NOW()');
    console.log('✅ PostgreSQL connected:', res.rows[0]);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await pool.end();
  }
}

test();