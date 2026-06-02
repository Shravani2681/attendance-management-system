require('dotenv').config();

const sqliteDb = require('./src/config/database');
const { query, pool } = require('./src/config/postgres');

const migrate = async () => {
  console.log('Starting SQLite to PostgreSQL migration...');

  const employees = sqliteDb.prepare('SELECT * FROM employees').all();

  for (const emp of employees) {
    await query(
      `INSERT INTO employees
       (id, name, email, password, role, department, monthly_salary, phone, education, birth_date, age, gender, address, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (email) DO NOTHING`,
      [
        emp.id, emp.name, emp.email, emp.password, emp.role,
        emp.department, emp.monthly_salary, emp.phone, emp.education,
        emp.birth_date, emp.age, emp.gender, emp.address, emp.created_at
      ]
    );
  }

  const attendance = sqliteDb.prepare('SELECT * FROM attendance').all();

  for (const att of attendance) {
    await query(
      `INSERT INTO attendance
       (id, employee_id, date, check_in_time, check_out_time, selfie, checkout_selfie,
        latitude, longitude, checkout_latitude, checkout_longitude,
        checkin_address, checkout_address, gps_status, gps_distance,
        salary_type, status, deduction_amount, checkout_deduction_amount,
        checkout_deduction_reason, is_edited, edited_by, notes, sheets_row, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       ON CONFLICT (id) DO NOTHING`,
      [
        att.id, att.employee_id, att.date, att.check_in_time, att.check_out_time,
        att.selfie, att.checkout_selfie, att.latitude, att.longitude,
        att.checkout_latitude, att.checkout_longitude,
        att.checkin_address, att.checkout_address, att.gps_status, att.gps_distance,
        att.salary_type, att.status, att.deduction_amount, att.checkout_deduction_amount,
        att.checkout_deduction_reason, att.is_edited, att.edited_by,
        att.notes, att.sheets_row, att.created_at
      ]
    );
  }

  const performance = sqliteDb.prepare('SELECT * FROM performance').all();

  for (const p of performance) {
    await query(
      `INSERT INTO performance
       (id, employee_id, date, today_work, num_clients, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.employee_id, p.date, p.today_work, p.num_clients, p.created_at]
    );
  }

  const overrides = sqliteDb.prepare('SELECT * FROM salary_overrides').all();

  for (const s of overrides) {
    await query(
      `INSERT INTO salary_overrides
       (id, employee_id, month, earned_salary, notes, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.employee_id, s.month, s.earned_salary, s.notes, s.updated_by, s.updated_at]
    );
  }

  console.log('Migration completed successfully');
  console.log(`Employees: ${employees.length}`);
  console.log(`Attendance: ${attendance.length}`);
  console.log(`Performance: ${performance.length}`);
  console.log(`Salary Overrides: ${overrides.length}`);

  await pool.end();
};

migrate().catch(async (err) => {
  console.error('Migration failed:', err);
  await pool.end();
});