const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');

const { query } = require('../config/postgres');
const { auth, adminOnly } = require('../middleware/auth');
const { calculateEarnedAmount, calculateMonthlySummary } = require('../services/salary');

router.use(auth, adminOnly);

/* ================= EMPLOYEES ================= */

// GET /api/admin/employees
router.get('/employees', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, email, role, department, monthly_salary,
             phone, gender, birth_date, age, education, address, created_at
      FROM employees
      WHERE role = 'employee'
      ORDER BY name ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/employees
router.post('/employees', async (req, res) => {
  try {
    const {
      name, email, password, department, monthly_salary,
      phone, gender, birth_date, age, education, address
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password required'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existing = await query(
      `SELECT id FROM employees WHERE email = $1`,
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);

    await query(
      `INSERT INTO employees
       (id, name, email, password, role, department, monthly_salary,
        phone, gender, birth_date, age, education, address)
       VALUES ($1,$2,$3,$4,'employee',$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        name.trim(),
        cleanEmail,
        hash,
        department || 'General',
        Number(monthly_salary) || 30000,
        phone || null,
        gender || null,
        birth_date || null,
        age ? Number(age) : null,
        education || null,
        address || null
      ]
    );

    const emp = await query(
      `SELECT id, name, email, role, department, monthly_salary,
              phone, gender, birth_date, age, education, address, created_at
       FROM employees
       WHERE id = $1`,
      [id]
    );

    res.status(201).json({
      success: true,
      message: 'Employee added',
      data: emp.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/employees/:id
router.put('/employees/:id', async (req, res) => {
  try {
    const {
      name, email, department, role, monthly_salary,
      education, phone, gender, birth_date, age, password, address
    } = req.body;

    const empResult = await query(
      `SELECT * FROM employees WHERE id = $1`,
      [req.params.id]
    );

    const emp = empResult.rows[0];

    if (!emp) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const cleanEmail = email ? email.toLowerCase().trim() : emp.email;

    if (cleanEmail !== emp.email) {
      const existing = await query(
        `SELECT id FROM employees WHERE email = $1 AND id <> $2`,
        [cleanEmail, req.params.id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    const values = [
      name ? name.trim() : emp.name,
      cleanEmail,
      department !== undefined ? department : emp.department,
      role || emp.role,
      monthly_salary !== undefined ? Number(monthly_salary) : emp.monthly_salary,
      education !== undefined ? education : emp.education,
      phone !== undefined ? phone : emp.phone,
      gender !== undefined ? gender : emp.gender,
      birth_date !== undefined ? birth_date : emp.birth_date,
      age !== undefined ? Number(age) : emp.age,
      address !== undefined ? address : emp.address
    ];

    let sql = `
      UPDATE employees
      SET name=$1, email=$2, department=$3, role=$4,
          monthly_salary=$5, education=$6, phone=$7,
          gender=$8, birth_date=$9, age=$10, address=$11
    `;

    if (password && password.length >= 6) {
      values.push(bcrypt.hashSync(password, 10));
      sql += `, password=$12 WHERE id=$13`;
      values.push(req.params.id);
    } else {
      sql += ` WHERE id=$12`;
      values.push(req.params.id);
    }

    await query(sql, values);

    const updated = await query(
      `SELECT id, name, email, role, department, monthly_salary,
              education, phone, gender, birth_date, age, address, created_at
       FROM employees
       WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Employee updated',
      data: updated.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/employees/:id
router.delete('/employees/:id', async (req, res) => {
  try {
    const empResult = await query(
      `SELECT * FROM employees WHERE id = $1`,
      [req.params.id]
    );

    const emp = empResult.rows[0];

    if (!emp) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    if (emp.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete admin'
      });
    }

    await query(`DELETE FROM attendance WHERE employee_id = $1`, [req.params.id]);
    await query(`DELETE FROM performance WHERE employee_id = $1`, [req.params.id]);
    await query(`DELETE FROM salary_overrides WHERE employee_id = $1`, [req.params.id]);
    await query(`DELETE FROM employees WHERE id = $1`, [req.params.id]);

    res.json({
      success: true,
      message: 'Employee and all their records deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= DASHBOARD STATS ================= */

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const nowIST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    );
    const today = nowIST.toISOString().split('T')[0];

    const totalEmployeesResult = await query(
      `SELECT COUNT(*) AS count FROM employees WHERE role = 'employee'`
    );

    const presentTodayResult = await query(
      `SELECT COUNT(*) AS count FROM attendance WHERE date = $1`,
      [today]
    );

    const fullTodayResult = await query(
      `SELECT COUNT(*) AS count FROM attendance
       WHERE date = $1 AND salary_type = 'FULL'`,
      [today]
    );

    const halfTodayResult = await query(
      `SELECT COUNT(*) AS count FROM attendance
       WHERE date = $1 AND salary_type = 'HALF'`,
      [today]
    );

    const totalEmployees = Number(totalEmployeesResult.rows[0].count);
    const presentToday = Number(presentTodayResult.rows[0].count);
    const fullToday = Number(fullTodayResult.rows[0].count);
    const halfToday = Number(halfTodayResult.rows[0].count);

    res.json({
      success: true,
      stats: {
        totalEmployees,
        presentToday,
        fullToday,
        halfToday,
        absentToday: Math.max(0, totalEmployees - presentToday),
        today
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= ATTENDANCE ================= */

// GET /api/admin/attendance
router.get('/attendance', async (req, res) => {
  try {
    const { date, employee_id, month, limit = 200 } = req.query;

    let sql = `
      SELECT a.*, e.name AS employee_name, e.email,
             e.department, e.monthly_salary
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `;

    const params = [];
    let idx = 1;

    if (date) {
      sql += ` AND a.date = $${idx}`;
      params.push(date);
      idx++;
    }

    if (month) {
      sql += ` AND a.date LIKE $${idx}`;
      params.push(`${month}%`);
      idx++;
    }

    if (employee_id) {
      sql += ` AND a.employee_id = $${idx}`;
      params.push(employee_id);
      idx++;
    }

    sql += ` ORDER BY a.date DESC, e.name ASC LIMIT $${idx}`;
    params.push(Number(limit));

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/attendance-status
router.get('/attendance-status', async (req, res) => {
  try {
    const { date } = req.query;

    const nowIST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    );

    const targetDate = date || nowIST.toISOString().split('T')[0];

    const result = await query(
      `SELECT 
          e.id AS employee_id,
          e.name AS employee_name,
          e.department,
          e.monthly_salary,
          a.id,
          a.check_in_time,
          a.check_out_time,
          a.salary_type,
          a.deduction_amount,
          a.checkout_deduction_amount,
          a.gps_status,
          a.selfie,
          a.checkout_selfie,
          a.checkin_address,
          a.checkout_address,
          a.status,
          a.date,
          a.notes
       FROM employees e
       LEFT JOIN attendance a
         ON a.employee_id = e.id
        AND a.date = $1
       WHERE e.role = 'employee'
       ORDER BY e.name ASC`,
      [targetDate]
    );

    res.json({
      success: true,
      date: targetDate,
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/attendance/:id/selfie
router.get('/attendance/:id/selfie', async (req, res) => {
  try {
    const result = await query(
      `SELECT selfie FROM attendance WHERE id = $1`,
      [req.params.id]
    );

    const record = result.rows[0];

    if (!record || !record.selfie) {
      return res.status(404).json({
        success: false,
        message: 'No selfie found'
      });
    }

    res.json({ success: true, selfie: record.selfie });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/attendance/:id
router.put('/attendance/:id', async (req, res) => {
  try {
    const {
      check_in_time,
      check_out_time,
      salary_type,
      gps_status,
      notes,
      selfie,
      deduction_amount,
      checkout_deduction_amount,
      status
    } = req.body;

    const recordResult = await query(
      `SELECT * FROM attendance WHERE id = $1`,
      [req.params.id]
    );

    const record = recordResult.rows[0];

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    await query(
      `UPDATE attendance
       SET check_in_time = $1,
           check_out_time = $2,
           salary_type = $3,
           gps_status = $4,
           notes = $5,
           selfie = $6,
           deduction_amount = $7,
           checkout_deduction_amount = $8,
           status = $9,
           is_edited = 1,
           edited_by = $10
       WHERE id = $11`,
      [
        check_in_time || record.check_in_time,
        check_out_time !== undefined ? check_out_time : record.check_out_time,
        salary_type || record.salary_type,
        gps_status || record.gps_status,
        notes !== undefined ? notes : record.notes,
        selfie !== undefined ? selfie : record.selfie,
        deduction_amount !== undefined ? Number(deduction_amount) : Number(record.deduction_amount || 0),
        checkout_deduction_amount !== undefined ? Number(checkout_deduction_amount) : Number(record.checkout_deduction_amount || 0),
        status !== undefined ? status : (record.status || 'Present'),
        req.user.id,
        req.params.id
      ]
    );

    const updated = await query(
      `SELECT * FROM attendance WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Attendance updated',
      data: updated.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= PERFORMANCE ================= */

// GET /api/admin/performance
router.get('/performance', async (req, res) => {
  try {
    const { employee_id, month } = req.query;

    let sql = `
      SELECT p.*, e.name AS employee_name, e.department, e.email
      FROM performance p
      JOIN employees e ON p.employee_id = e.id
      WHERE 1=1
    `;

    const params = [];
    let idx = 1;

    if (employee_id) {
      sql += ` AND p.employee_id = $${idx}`;
      params.push(employee_id);
      idx++;
    }

    if (month) {
      sql += ` AND p.date LIKE $${idx}`;
      params.push(`${month}%`);
      idx++;
    }

    sql += ` ORDER BY p.date DESC, e.name ASC`;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/performance/:id
router.put('/performance/:id', async (req, res) => {
  try {
    const { today_work, num_clients } = req.body;

    const existing = await query(
      `SELECT * FROM performance WHERE id = $1`,
      [req.params.id]
    );

    const record = existing.rows[0];

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Not found'
      });
    }

    await query(
      `UPDATE performance
       SET today_work = $1, num_clients = $2
       WHERE id = $3`,
      [
        today_work !== undefined ? today_work.trim() : record.today_work,
        num_clients !== undefined ? Number(num_clients) || 0 : record.num_clients,
        req.params.id
      ]
    );

    const updated = await query(
      `SELECT * FROM performance WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: updated.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/performance/:id
router.delete('/performance/:id', async (req, res) => {
  try {
    const existing = await query(
      `SELECT id FROM performance WHERE id = $1`,
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Not found'
      });
    }

    await query(
      `DELETE FROM performance WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Deleted'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= SALARY ================= */

// GET /api/admin/salary
router.get('/salary', async (req, res) => {
  try {
    const { month } = req.query;

    const nowIST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    );

    const targetMonth = month || nowIST.toISOString().slice(0, 7);

    const employeesResult = await query(
      `SELECT id, name, email, department, monthly_salary
       FROM employees
       WHERE role = 'employee'
       ORDER BY name ASC`
    );

    const salaryData = [];

    for (const emp of employeesResult.rows) {
      const recordsResult = await query(
        `SELECT * FROM attendance
         WHERE employee_id = $1 AND date LIKE $2`,
        [emp.id, `${targetMonth}%`]
      );

      const summary = calculateMonthlySummary(
        recordsResult.rows,
        emp.monthly_salary
      );

      const overrideResult = await query(
        `SELECT * FROM salary_overrides
         WHERE employee_id = $1 AND month = $2`,
        [emp.id, targetMonth]
      );

      const override = overrideResult.rows[0];
      const presentDays = summary.fullDays + summary.halfDays;

      salaryData.push({
        employee_id: emp.id,
        employee_name: emp.name,
        department: emp.department,
        total_working_days: 26,
        present_days: presentDays,
        full_days: summary.fullDays,
        half_days: summary.halfDays,
        late_check_in_count: summary.lateCount,
        early_check_out_count: summary.earlyCount,
        absent_days: Math.max(0, 26 - presentDays),
        total_deductions: summary.totalDeductions,
        basic_salary: emp.monthly_salary,
        final_salary: override ? override.earned_salary : summary.earned,
        salary_status: override ? 'Manually Overridden' : 'Auto-Calculated',
        email: emp.email,
        override_notes: override ? override.notes : null,
        is_overridden: !!override,
        calculated_salary: summary.earned
      });
    }

    res.json({
      success: true,
      month: targetMonth,
      data: salaryData
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/salary/override
router.put('/salary/override', async (req, res) => {
  try {
    const { employee_id, month, earned_salary, notes } = req.body;

    if (!employee_id || !month) {
      return res.status(400).json({
        success: false,
        message: 'employee_id and month are required'
      });
    }

    const existing = await query(
      `SELECT id FROM salary_overrides
       WHERE employee_id = $1 AND month = $2`,
      [employee_id, month]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE salary_overrides
         SET earned_salary = $1,
             notes = $2,
             updated_by = $3,
             updated_at = NOW()
         WHERE employee_id = $4 AND month = $5`,
        [Number(earned_salary), notes || '', req.user.id, employee_id, month]
      );
    } else {
      await query(
        `INSERT INTO salary_overrides
         (id, employee_id, month, earned_salary, notes, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), employee_id, month, Number(earned_salary), notes || '', req.user.id]
      );
    }

    res.json({
      success: true,
      message: 'Salary override saved'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/salary/override
router.delete('/salary/override', async (req, res) => {
  try {
    const { employee_id, month } = req.query;

    await query(
      `DELETE FROM salary_overrides
       WHERE employee_id = $1 AND month = $2`,
      [employee_id, month]
    );

    res.json({
      success: true,
      message: 'Override removed'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= DOWNLOADS ================= */

// GET /api/admin/employees/export
router.get('/employees/export', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, department, monthly_salary,
              phone, gender, birth_date, age, education, address, created_at
       FROM employees
       ORDER BY name ASC`
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Registered Employees');

    sheet.columns = [
      { header: 'Full Name', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Birth Date', key: 'birth_date', width: 14 },
      { header: 'Age', key: 'age', width: 8 },
      { header: 'Education', key: 'education', width: 18 },
      { header: 'Department', key: 'department', width: 16 },
      { header: 'Role', key: 'role', width: 12 },
      { header: 'Base Salary', key: 'monthly_salary', width: 14 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Joined Date', key: 'created_at', width: 22 },
      { header: 'Employee ID', key: 'id', width: 38 }
    ];

    result.rows.forEach(emp => {
      sheet.addRow({
        ...emp,
        role: emp.role ? emp.role.toUpperCase() : '',
        phone: emp.phone || '—',
        gender: emp.gender || '—',
        birth_date: emp.birth_date || '—',
        age: emp.age || '—',
        education: emp.education || '—',
        address: emp.address || '—',
        created_at: emp.created_at
          ? new Date(emp.created_at).toLocaleString('en-IN')
          : '—'
      });
    });

    const filename = `Employees_${Date.now()}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate employee report',
      error: err.message
    });
  }
});

// GET /api/admin/salary/download
router.get('/salary/download', async (req, res) => {
  try {
    const { month } = req.query;

    const nowIST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    );

    const targetMonth = month || nowIST.toISOString().slice(0, 7);

    const salaryResponse = await query(
      `SELECT id, name, email, department, monthly_salary
       FROM employees
       WHERE role = 'employee'
       ORDER BY name ASC`
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Salary ${targetMonth}`);

    sheet.columns = [
      { header: 'Employee Name', key: 'employee_name', width: 22 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Department', key: 'department', width: 16 },
      { header: 'Present Days', key: 'present_days', width: 14 },
      { header: 'Full Days', key: 'full_days', width: 12 },
      { header: 'Half Days', key: 'half_days', width: 12 },
      { header: 'Absent Days', key: 'absent_days', width: 12 },
      { header: 'Total Deductions', key: 'total_deductions', width: 18 },
      { header: 'Base Salary', key: 'basic_salary', width: 14 },
      { header: 'Final Salary', key: 'final_salary', width: 14 }
    ];

    for (const emp of salaryResponse.rows) {
      const records = await query(
        `SELECT * FROM attendance
         WHERE employee_id = $1 AND date LIKE $2`,
        [emp.id, `${targetMonth}%`]
      );

      const summary = calculateMonthlySummary(records.rows, emp.monthly_salary);
      const presentDays = summary.fullDays + summary.halfDays;

      sheet.addRow({
        employee_name: emp.name,
        email: emp.email,
        department: emp.department,
        present_days: presentDays,
        full_days: summary.fullDays,
        half_days: summary.halfDays,
        absent_days: Math.max(0, 26 - presentDays),
        total_deductions: summary.totalDeductions,
        basic_salary: emp.monthly_salary,
        final_salary: summary.earned
      });
    }

    const filename = `Salary_${targetMonth}_${Date.now()}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate salary report',
      error: err.message
    });
  }
});

module.exports = router;
