const { query } = require('./postgres');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const initPostgres = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      department TEXT DEFAULT 'General',
      monthly_salary NUMERIC DEFAULT 30000,
      phone TEXT,
      education TEXT,
      birth_date TEXT,
      age INTEGER,
      gender TEXT,
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      selfie TEXT,
      checkout_selfie TEXT,
      latitude NUMERIC,
      longitude NUMERIC,
      checkout_latitude NUMERIC,
      checkout_longitude NUMERIC,
      checkin_address TEXT,
      checkout_address TEXT,
      gps_status TEXT DEFAULT 'UNKNOWN',
      gps_distance NUMERIC,
      salary_type TEXT NOT NULL DEFAULT 'FULL',
      status TEXT DEFAULT 'Present',
      deduction_amount NUMERIC DEFAULT 0,
      checkout_deduction_amount NUMERIC DEFAULT 0,
      checkout_deduction_reason TEXT,
      is_edited INTEGER DEFAULT 0,
      edited_by TEXT,
      notes TEXT,
      sheets_row INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, date)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS performance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      today_work TEXT NOT NULL,
      num_clients INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, date)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS salary_overrides (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      earned_salary NUMERIC,
      notes TEXT,
      updated_by TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, month)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_performance_employee ON performance(employee_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_performance_date ON performance(date);`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@company.com';
  const existingAdmin = await query(
    `SELECT id FROM employees WHERE email = $1`,
    [adminEmail]
  );

  if (existingAdmin.rows.length === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@123', 10);

    await query(
      `INSERT INTO employees 
       (id, name, email, password, role, department)
       VALUES ($1, $2, $3, $4, 'admin', 'Administration')`,
      [
        uuidv4(),
        process.env.ADMIN_NAME || 'Admin',
        adminEmail,
        hash
      ]
    );

    console.log('✅ PostgreSQL admin account seeded:', adminEmail);
  }

  console.log('✅ PostgreSQL tables created successfully');
};

module.exports = initPostgres;