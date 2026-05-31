const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = path.join(__dirname, '../../data/attendance.db');
const db = new Database(DB_PATH);

// Enable WAL for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    password       TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee','admin')),
    department     TEXT DEFAULT 'General',
    monthly_salary REAL DEFAULT 30000,
    phone          TEXT,
    education      TEXT,
    birth_date     TEXT,
    age            INTEGER,
    gender         TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id            TEXT PRIMARY KEY,
    employee_id   TEXT NOT NULL,
    date          TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    selfie        TEXT,
    latitude      REAL,
    longitude     REAL,
    gps_status    TEXT DEFAULT 'UNKNOWN' CHECK(gps_status IN ('VALID','INVALID','SKIPPED','UNKNOWN')),
    gps_distance  REAL,
    salary_type   TEXT NOT NULL CHECK(salary_type IN ('FULL','HALF','ABSENT')),
    deduction_amount REAL DEFAULT 0,
    is_edited     INTEGER DEFAULT 0,
    edited_by     TEXT,
    notes         TEXT,
    sheets_row    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    UNIQUE(employee_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);

  CREATE TABLE IF NOT EXISTS performance (
    id          TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date        TEXT NOT NULL,
    today_work  TEXT NOT NULL,
    num_clients INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    UNIQUE(employee_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_performance_employee ON performance(employee_id);
  CREATE INDEX IF NOT EXISTS idx_performance_date ON performance(date);

  CREATE TABLE IF NOT EXISTS salary_overrides (
    id            TEXT PRIMARY KEY,
    employee_id   TEXT NOT NULL,
    month         TEXT NOT NULL,
    earned_salary REAL,
    notes         TEXT,
    updated_by    TEXT,
    updated_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, month),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  );

  CREATE INDEX IF NOT EXISTS idx_salary_overrides_employee ON salary_overrides(employee_id);
  CREATE INDEX IF NOT EXISTS idx_salary_overrides_month ON salary_overrides(month);
`);

// Auto-migrate to add new columns if they don't exist
try {
  const attendanceCols = db.pragma('table_info(attendance)');
  const acNames = attendanceCols.map(c => c.name);

  if (!acNames.includes('check_out_time'))              { db.exec('ALTER TABLE attendance ADD COLUMN check_out_time TEXT');                           console.log('✅ Migrated: check_out_time'); }
  if (!acNames.includes('checkout_selfie'))             { db.exec('ALTER TABLE attendance ADD COLUMN checkout_selfie TEXT');                          console.log('✅ Migrated: checkout_selfie'); }
  if (!acNames.includes('deduction_amount'))            { db.exec('ALTER TABLE attendance ADD COLUMN deduction_amount REAL DEFAULT 0');               console.log('✅ Migrated: deduction_amount'); }
  if (!acNames.includes('checkin_address'))             { db.exec('ALTER TABLE attendance ADD COLUMN checkin_address TEXT');                          console.log('✅ Migrated: checkin_address'); }
  if (!acNames.includes('checkout_latitude'))           { db.exec('ALTER TABLE attendance ADD COLUMN checkout_latitude REAL');                        console.log('✅ Migrated: checkout_latitude'); }
  if (!acNames.includes('checkout_longitude'))          { db.exec('ALTER TABLE attendance ADD COLUMN checkout_longitude REAL');                       console.log('✅ Migrated: checkout_longitude'); }
  if (!acNames.includes('checkout_address'))            { db.exec('ALTER TABLE attendance ADD COLUMN checkout_address TEXT');                         console.log('✅ Migrated: checkout_address'); }
  // ── Checkout Salary Deduction ──
  if (!acNames.includes('checkout_deduction_amount'))   { db.exec('ALTER TABLE attendance ADD COLUMN checkout_deduction_amount REAL DEFAULT 0');      console.log('✅ Migrated: checkout_deduction_amount'); }
  if (!acNames.includes('checkout_deduction_reason'))   { db.exec('ALTER TABLE attendance ADD COLUMN checkout_deduction_reason TEXT');                console.log('✅ Migrated: checkout_deduction_reason'); }
  // Separate display status column (independent from salary_type)
  if (!acNames.includes('status'))                      { db.exec("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'Present'");               console.log('✅ Migrated: status'); }
} catch (err) {
  console.warn('Attendance migration warning:', err.message);
}

try {
  const empCols = db.pragma('table_info(employees)');
  const empColNames = empCols.map(c => c.name);
  if (!empColNames.includes('phone'))      { db.exec('ALTER TABLE employees ADD COLUMN phone TEXT'); console.log('✅ Migrated: Added phone column'); }
  if (!empColNames.includes('education'))  { db.exec('ALTER TABLE employees ADD COLUMN education TEXT'); console.log('✅ Migrated: Added education column'); }
  if (!empColNames.includes('birth_date')) { db.exec('ALTER TABLE employees ADD COLUMN birth_date TEXT'); console.log('✅ Migrated: Added birth_date column'); }
  if (!empColNames.includes('age'))        { db.exec('ALTER TABLE employees ADD COLUMN age INTEGER'); console.log('✅ Migrated: Added age column'); }
  if (!empColNames.includes('gender'))     { db.exec('ALTER TABLE employees ADD COLUMN gender TEXT'); console.log('✅ Migrated: Added gender column'); }
  if (!empColNames.includes('address'))    { db.exec('ALTER TABLE employees ADD COLUMN address TEXT'); console.log('✅ Migrated: Added address column'); }
} catch (err) {
  console.warn('Employee migration warning:', err.message);
}

// ─── Seed admin account ────────────────────────────────────────────────────────
const seedAdmin = () => {
  const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(process.env.ADMIN_EMAIL);
  if (!existing) {
    const { v4: uuidv4 } = require('uuid');
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
    db.prepare(`
      INSERT INTO employees (id, name, email, password, role, department)
      VALUES (?, ?, ?, ?, 'admin', 'Administration')
    `).run(uuidv4(), process.env.ADMIN_NAME || 'Admin', process.env.ADMIN_EMAIL || 'admin@company.com', hash);
    console.log('✅ Admin account seeded:', process.env.ADMIN_EMAIL);
  }
};

seedAdmin();

module.exports = db;
