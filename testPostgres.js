require('dotenv').config();
const initPostgres = require('./src/config/initPostgres');
const { pool } = require('./src/config/postgres');

initPostgres()
  .then(() => {
    console.log('PostgreSQL setup completed');
    pool.end();
  })
  .catch((err) => {
    console.error('PostgreSQL setup failed:', err);
    pool.end();
  });