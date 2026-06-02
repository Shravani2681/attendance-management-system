const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { query } = require('../config/postgres');
const { auth, adminOnly } = require('../middleware/auth');
const { calculateEarnedAmount } = require('../services/salary');
const { updateRow } = require('../services/googleSheets');

// All admin routes require auth + admin role
router.use(auth, adminOnly);

// GET /api/admin/employees
router.get('/employees', (req, res) => {
  try {
    const employees = db.prepare(
      `SELECT id, name, email, role, department, monthly_salary, phone, gender, birth_date, age, education, created_at
       FROM employees WHERE role = 'employee' ORDER BY name ASC`
    ).all();
    res.json({ success: true, data: employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/employees - Add employee from admin panel
router.post('/employees', (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, password, department, monthly_salary } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email, password required' });

    const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ success: false, message: 'Email already exists' });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`
      INSERT INTO employees (id, name, email, password, role, department, monthly_salary)
      VALUES (?, ?, ?, ?, 'employee', ?, ?)
    `).run(id, name.trim(), email.toLowerCase().trim(), hash, department || 'General', monthly_salary || 30000);

    const emp = db.prepare('SELECT id, name, email, role, department, monthly_salary FROM employees WHERE id = ?').get(id);
    res.status(201).json({ success: true, message: 'Employee added', data: emp });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/employees/:id
router.delete('/employees/:id', (req, res) => {
  try {
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (emp.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin' });

    // Delete in a transaction: attendance records first (FK), then employee
    const deleteAll = db.transaction(() => {
      db.prepare('DELETE FROM attendance WHERE employee_id = ?').run(req.params.id);
      db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
    });
    deleteAll();

    res.json({ success: true, message: 'Employee and all their records deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/employees/:id
router.put('/employees/:id', (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, department, role, monthly_salary, education, phone, gender, birth_date, age, password } = req.body;
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Validate email if changed
    if (email && email.toLowerCase().trim() !== emp.email) {
      const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const updates = {
      name:           name           ? name.trim()                    : emp.name,
      email:          email          ? email.toLowerCase().trim()      : emp.email,
      department:     department     !== undefined ? department        : emp.department,
      role:           role           || emp.role,
      monthly_salary: monthly_salary !== undefined ? Number(monthly_salary) : emp.monthly_salary,
      education:      education      !== undefined ? education         : emp.education,
      phone:          phone          !== undefined ? phone             : emp.phone,
      gender:         gender         !== undefined ? gender            : emp.gender,
      birth_date:     birth_date     !== undefined ? birth_date        : emp.birth_date,
      age:            age            !== undefined ? Number(age)       : emp.age,
    };

    // Hash new password only if provided
    let passwordSet = '';
    if (password && password.length >= 6) {
      passwordSet = ', password=?';
    }

    if (passwordSet) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(`
        UPDATE employees
        SET name=?, email=?, department=?, role=?, monthly_salary=?, education=?, phone=?, gender=?, birth_date=?, age=?, password=?
        WHERE id=?
      `).run(updates.name, updates.email, updates.department, updates.role, updates.monthly_salary,
             updates.education, updates.phone, updates.gender, updates.birth_date, updates.age, hash, req.params.id);
    } else {
      db.prepare(`
        UPDATE employees
        SET name=?, email=?, department=?, role=?, monthly_salary=?, education=?, phone=?, gender=?, birth_date=?, age=?
        WHERE id=?
      `).run(updates.name, updates.email, updates.department, updates.role, updates.monthly_salary,
             updates.education, updates.phone, updates.gender, updates.birth_date, updates.age, req.params.id);
    }

    const updated = db.prepare(
      'SELECT id, name, email, role, department, monthly_salary, education, phone, gender, birth_date, age, created_at FROM employees WHERE id = ?'
    ).get(req.params.id);
    res.json({ success: true, message: 'Employee updated', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/attendance?date=2025-05-01&employee_id=xxx&month=2025-05
router.get('/attendance', (req, res) => {
  try {
    const { date, employee_id, month, limit = 200 } = req.query;
    let query = `
      SELECT a.*, e.name as employee_name, e.email, e.department, e.monthly_salary
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (date) { query += ' AND a.date = ?'; params.push(date); }
    if (month) { query += ' AND a.date LIKE ?'; params.push(`${month}%`); }
    if (employee_id) { query += ' AND a.employee_id = ?'; params.push(employee_id); }
    query += ' ORDER BY a.date DESC, e.name ASC LIMIT ?';
    params.push(parseInt(limit));

    const records = db.prepare(query).all(...params);
    // Include selfie as-is for photo display (base64 data URL)
    res.json({ success: true, data: records, total: records.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/attendance/:id/selfie
router.get('/attendance/:id/selfie', (req, res) => {
  try {
    const record = db.prepare('SELECT selfie FROM attendance WHERE id = ?').get(req.params.id);
    if (!record || !record.selfie)
      return res.status(404).json({ success: false, message: 'No selfie found' });
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
      `SELECT a.*, e.name as employee_name, e.email, e.department, e.monthly_salary
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.id = $1`,
      [req.params.id]
    );

    const record = recordResult.rows[0];

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    const updates = {
      check_in_time: check_in_time || record.check_in_time,
      check_out_time: check_out_time !== undefined ? check_out_time : record.check_out_time,
      salary_type: salary_type || record.salary_type,
      gps_status: gps_status || record.gps_status,
      notes: notes !== undefined ? notes : record.notes,
      selfie: selfie !== undefined ? selfie : record.selfie,
      deduction_amount: deduction_amount !== undefined ? Number(deduction_amount) : Number(record.deduction_amount || 0),
      checkout_deduction_amount: checkout_deduction_amount !== undefined ? Number(checkout_deduction_amount) : Number(record.checkout_deduction_amount || 0),
      status: status !== undefined ? status : (record.status || 'Present')
    };

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
        updates.check_in_time,
        updates.check_out_time,
        updates.salary_type,
        updates.gps_status,
        updates.notes,
        updates.selfie,
        updates.deduction_amount,
        updates.checkout_deduction_amount,
        updates.status,
        req.user.id,
        req.params.id
      ]
    );

    const updatedResult = await query(
      `SELECT * FROM attendance WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Attendance updated',
      data: updatedResult.rows[0]
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = nowIST.toISOString().split('T')[0];

    const totalEmployees = db.prepare("SELECT COUNT(*) as count FROM employees WHERE role = 'employee'").get().count;
    const presentToday = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ?").get(today).count;
    const fullToday = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND salary_type = 'FULL'").get(today).count;
    const halfToday = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND salary_type = 'HALF'").get(today).count;
    const absentToday = totalEmployees - presentToday;

    res.json({
      success: true,
      stats: { totalEmployees, presentToday, fullToday, halfToday, absentToday, today }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/reports/download?month=2025-05&employee_id=xxx
router.get('/reports/download', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { month, employee_id } = req.query;

    let query = `
      SELECT a.*, e.name as employee_name, e.email, e.department, e.monthly_salary
      FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE 1=1
    `;
    const params = [];
    if (month)       { query += ' AND a.date LIKE ?';     params.push(`${month}%`); }
    if (employee_id) { query += ' AND a.employee_id = ?'; params.push(employee_id); }
    query += ' ORDER BY e.name ASC, a.date ASC';

    const records = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance Management System';
    const sheet = workbook.addWorksheet('Attendance Report');

    sheet.columns = [
      { header: 'Check-In Photo',        key: 'photo_in',                 width: 12 },
      { header: 'Check-Out Photo',        key: 'photo_out',                width: 12 },
      { header: 'Employee Name',          key: 'employee_name',            width: 22 },
      { header: 'Department',             key: 'department',               width: 16 },
      { header: 'Email',                  key: 'email',                    width: 26 },
      { header: 'Date',                   key: 'date',                     width: 13 },
      { header: 'Check-In Time',          key: 'check_in_time',            width: 14 },
      { header: 'Check-In Address',       key: 'checkin_address',          width: 30 },
      { header: 'Check-Out Time',         key: 'check_out_time',           width: 14 },
      { header: 'Check-Out Address',      key: 'checkout_address',         width: 30 },
      { header: 'Salary Type',            key: 'salary_type',              width: 12 },
      { header: 'Late Deduction (₹)',     key: 'late_deduction',           width: 16 },
      { header: 'Checkout Deduction (₹)', key: 'checkout_deduction',       width: 19 },
      { header: 'Total Deduction (₹)',    key: 'deduction',                width: 17 },
      { header: 'GPS Status',             key: 'gps_status',               width: 12 },
      { header: 'GPS Distance (m)',       key: 'gps_distance',             width: 16 },
      { header: 'Monthly Salary',         key: 'monthly_salary',           width: 15 },
      { header: 'Earned Amount',          key: 'earned_amount',            width: 15 },
      { header: 'Edited',                 key: 'is_edited',                width: 8  },
      { header: 'Notes',                  key: 'notes',                    width: 22 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF6366F1' } } };
    });

    const { calculateEarnedAmount } = require('../services/salary');

    const embedImage = (workbook, sheet, selfieData, col, rowIndex) => {
      if (!selfieData) return;
      try {
        const match = selfieData.match(/^data:image\/(jpeg|png|gif|webp);base64,(.+)$/);
        const base64Data = match ? match[2] : selfieData;
        const extension  = match ? match[1] : 'jpeg';
        const imageId = workbook.addImage({ base64: base64Data, extension });
        sheet.addImage(imageId, {
          tl: { col: col + 0.1, row: rowIndex - 1 + 0.1 },
          br: { col: col + 0.9, row: rowIndex - 0.1 },
        });
      } catch (imgErr) {
        console.warn(`Image embed failed row ${rowIndex} col ${col}:`, imgErr.message);
      }
    };

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const rowIndex = i + 2;
      const lateDeduction     = r.deduction_amount || 0;
      const checkoutDeduction = r.checkout_deduction_amount || 0;
      const totalDeduction    = lateDeduction + checkoutDeduction;
      const earned = calculateEarnedAmount(r.monthly_salary, r.salary_type, lateDeduction, checkoutDeduction);

      const row = sheet.addRow({
        photo_in:          '',
        photo_out:         '',
        employee_name:     r.employee_name,
        department:        r.department,
        email:             r.email,
        date:              r.date,
        check_in_time:     r.check_in_time,
        checkin_address:   r.checkin_address   || '—',
        check_out_time:    r.check_out_time    || '—',
        checkout_address:  r.checkout_address  || '—',
        salary_type:       r.salary_type,
        late_deduction:    lateDeduction     > 0 ? `-₹${lateDeduction}`     : '—',
        checkout_deduction:checkoutDeduction > 0 ? `-₹${checkoutDeduction}` : '—',
        deduction:         totalDeduction    > 0 ? `-₹${totalDeduction}`    : '—',
        gps_status:        r.gps_status,
        gps_distance:      r.gps_distance ? `${r.gps_distance} m` : 'N/A',
        monthly_salary:    r.monthly_salary,
        earned_amount:     Math.round(earned * 100) / 100,
        is_edited:         r.is_edited ? 'YES' : 'NO',
        notes:             r.notes || '',
      });

      row.height = 58;
      row.alignment = { vertical: 'middle', wrapText: true };

      // Color code salary type
      const salaryCell = row.getCell('salary_type');
      if (r.salary_type === 'FULL')      salaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      else if (r.salary_type === 'HALF') salaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      else                               salaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

      // Embed check-in selfie (col 0 = A)
      embedImage(workbook, sheet, r.selfie, 0, rowIndex);
      // Embed check-out selfie (col 1 = B)
      embedImage(workbook, sheet, r.checkout_selfie, 1, rowIndex);
    }

    const filename = `Attendance_${month || 'All'}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to generate report', error: err.message });
  }
});

// GET /api/admin/employees/export
router.get('/employees/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const records = db.prepare(
      `SELECT id, name, email, role, department, monthly_salary,
              phone, gender, birth_date, age, education, address, created_at
       FROM employees ORDER BY name ASC`
    ).all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance Management System';
    const sheet = workbook.addWorksheet('Registered Employees');

    sheet.columns = [
      { header: 'Full Name',    key: 'name',           width: 22 },
      { header: 'Email',        key: 'email',          width: 28 },
      { header: 'Phone',        key: 'phone',          width: 16 },
      { header: 'Gender',       key: 'gender',         width: 10 },
      { header: 'Birth Date',   key: 'birth_date',     width: 14 },
      { header: 'Age',          key: 'age',            width: 8  },
      { header: 'Education',    key: 'education',      width: 18 },
      { header: 'Department',   key: 'department',     width: 16 },
      { header: 'Role',         key: 'role',           width: 12 },
      { header: 'Base Salary',  key: 'monthly_salary', width: 14 },
      { header: 'Address',      key: 'address',        width: 30 },
      { header: 'Joined Date',  key: 'created_at',     width: 22 },
      { header: 'Employee ID',  key: 'id',             width: 38 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF6366F1' } } };
    });

    records.forEach((r, idx) => {
      const row = sheet.addRow({
        ...r,
        role:       r.role ? r.role.toUpperCase() : '',
        phone:      r.phone      || '—',
        gender:     r.gender     || '—',
        birth_date: r.birth_date || '—',
        age:        r.age        || '—',
        education:  r.education  || '—',
        address:    r.address    || '—',
        created_at: r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—',
      });
      // Alternate row shading
      if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
        });
      }
    });

    const filename = `Employees_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to generate employee report', error: err.message });
  }
});

// ── Admin Performance Routes ──────────────────────────────────────────────────

// GET /api/admin/performance?employee_id=&month=2025-05
router.get('/performance', async (req, res) => {
  try {
    const { employee_id, month } = req.query;

    let sql = `
      SELECT p.*, e.name as employee_name, e.department, e.email
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
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// PUT /api/admin/performance/:id
router.put('/performance/:id', (req, res) => {
  try {
    const { today_work, num_clients } = req.body;
    const record = db.prepare('SELECT * FROM performance WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found' });
    db.prepare('UPDATE performance SET today_work = ?, num_clients = ? WHERE id = ?').run(
      today_work !== undefined ? today_work.trim() : record.today_work,
      num_clients !== undefined ? parseInt(num_clients) || 0 : record.num_clients,
      req.params.id
    );
    res.json({ success: true, data: db.prepare('SELECT * FROM performance WHERE id = ?').get(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/performance/:id
router.delete('/performance/:id', (req, res) => {
  try {
    const record = db.prepare('SELECT id FROM performance WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found' });
    db.prepare('DELETE FROM performance WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Salary Management Routes ─────────────────────────────────────────────────

/**
 * GET /api/admin/salary?month=YYYY-MM
 * Returns per-employee salary summary for the given month.
 */
router.get('/salary', (req, res) => {
  try {
    const { month } = req.query;
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const targetMonth = month || nowIST.toISOString().slice(0, 7);

    // Get all non-admin employees
    const employees = db.prepare(
      `SELECT id, name, email, department, monthly_salary FROM employees WHERE role = 'employee' ORDER BY name ASC`
    ).all();

    const { calculateMonthlySummary } = require('../services/salary');

    const salaryData = employees.map(emp => {
      const records = db.prepare(
        `SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?`
      ).all(emp.id, `${targetMonth}%`);

      const summary = calculateMonthlySummary(records, emp.monthly_salary);

      // Check for admin override
      const override = db.prepare(
        `SELECT * FROM salary_overrides WHERE employee_id = ? AND month = ?`
      ).get(emp.id, targetMonth);

      const presentDays = summary.fullDays + summary.halfDays;
      return {
        employee_id:    emp.id,
        employee_name:  emp.name,
        department:     emp.department,
        total_working_days: 26,
        present_days:   presentDays,
        half_days:      summary.halfDays,
        late_check_in_count: summary.lateCount,
        early_check_out_count: summary.earlyCount,
        absent_days:    Math.max(0, 26 - presentDays),
        total_deductions: summary.totalDeductions,
        basic_salary:   emp.monthly_salary,
        final_salary:   override ? override.earned_salary : summary.earned,
        salary_status:  override ? 'Manually Overridden' : 'Auto-Calculated',
        
        // extra info needed by UI for modals, etc.
        email:          emp.email,
        override_notes: override ? override.notes : null,
        is_overridden:  !!override,
        calculated_salary: summary.earned,
        full_days:      summary.fullDays,
      };
    });

    res.json({ success: true, month: targetMonth, data: salaryData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/admin/salary/override
 * Body: { employee_id, month, earned_salary, notes }
 */
router.put('/salary/override', (req, res) => {
  try {
    const { employee_id, month, earned_salary, notes } = req.body;
    if (!employee_id || !month)
      return res.status(400).json({ success: false, message: 'employee_id and month are required' });

    const { v4: uuidv4 } = require('uuid');
    const existing = db.prepare(
      `SELECT id FROM salary_overrides WHERE employee_id = ? AND month = ?`
    ).get(employee_id, month);

    if (existing) {
      db.prepare(
        `UPDATE salary_overrides SET earned_salary = ?, notes = ?, updated_by = ?, updated_at = datetime('now') WHERE employee_id = ? AND month = ?`
      ).run(Number(earned_salary), notes || '', req.user.id, employee_id, month);
    } else {
      db.prepare(
        `INSERT INTO salary_overrides (id, employee_id, month, earned_salary, notes, updated_by) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), employee_id, month, Number(earned_salary), notes || '', req.user.id);
    }

    res.json({ success: true, message: 'Salary override saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/admin/salary/override
 * Removes override so auto-calculation takes effect again.
 */
router.delete('/salary/override', (req, res) => {
  try {
    const { employee_id, month } = req.query;
    db.prepare(`DELETE FROM salary_overrides WHERE employee_id = ? AND month = ?`).run(employee_id, month);
    res.json({ success: true, message: 'Override removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/salary/download?month=YYYY-MM
 * Downloads an Excel salary report.
 */
router.get('/salary/download', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { month } = req.query;
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const targetMonth = month || nowIST.toISOString().slice(0, 7);

    const employees = db.prepare(
      `SELECT id, name, email, department, monthly_salary FROM employees WHERE role = 'employee' ORDER BY name ASC`
    ).all();

    const { calculateMonthlySummary } = require('../services/salary');

    const salaryData = employees.map(emp => {
      const records = db.prepare(
        `SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?`
      ).all(emp.id, `${targetMonth}%`);
      const summary = calculateMonthlySummary(records, emp.monthly_salary);
      const lateEntries = records.filter(r => (r.deduction_amount || 0) > 0).length;
      const override = db.prepare(
        `SELECT * FROM salary_overrides WHERE employee_id = ? AND month = ?`
      ).get(emp.id, targetMonth);
      const presentDays = summary.fullDays + summary.halfDays;
      return {
        name:            emp.name,
        email:           emp.email,
        department:      emp.department,
        monthly_salary:  emp.monthly_salary,
        present_days:    presentDays,
        full_days:       summary.fullDays,
        half_days:       summary.halfDays,
        absent_days:     Math.max(0, 26 - presentDays),
        late_entries:    lateEntries,
        total_deductions: summary.totalDeductions,
        calculated_salary: summary.earned,
        final_salary:    override ? override.earned_salary : summary.earned,
        override_notes:  override ? override.notes : '',
      };
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance Management System';
    const sheet = workbook.addWorksheet(`Salary ${targetMonth}`);

    sheet.columns = [
      { header: 'Employee Name',      key: 'name',              width: 22 },
      { header: 'Email',              key: 'email',             width: 26 },
      { header: 'Department',         key: 'department',        width: 16 },
      { header: 'Base Monthly Salary',key: 'monthly_salary',    width: 20 },
      { header: 'Present Days',       key: 'present_days',      width: 14 },
      { header: 'Full Days',          key: 'full_days',         width: 12 },
      { header: 'Half Days',          key: 'half_days',         width: 12 },
      { header: 'Absent Days',        key: 'absent_days',       width: 12 },
      { header: 'Late Entries',       key: 'late_entries',      width: 14 },
      { header: 'Total Deductions (₹)',key: 'total_deductions', width: 20 },
      { header: 'Calculated Salary',  key: 'calculated_salary', width: 18 },
      { header: 'Final Salary (₹)',   key: 'final_salary',      width: 18 },
      { header: 'Override Notes',     key: 'override_notes',    width: 24 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF6366F1' } } };
    });

    salaryData.forEach((r, idx) => {
      const row = sheet.addRow(r);
      row.height = 22;
      row.alignment = { vertical: 'middle' };
      if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
        });
      }
      // Highlight final salary cell
      const finalCell = row.getCell('final_salary');
      finalCell.font = { bold: true, color: { argb: 'FF10B981' } };
    });

    // Totals row
    const totalRow = sheet.addRow({
      name: 'TOTAL',
      monthly_salary: salaryData.reduce((s, r) => s + r.monthly_salary, 0),
      present_days:   salaryData.reduce((s, r) => s + r.present_days, 0),
      full_days:      salaryData.reduce((s, r) => s + r.full_days, 0),
      half_days:      salaryData.reduce((s, r) => s + r.half_days, 0),
      absent_days:    salaryData.reduce((s, r) => s + r.absent_days, 0),
      late_entries:   salaryData.reduce((s, r) => s + r.late_entries, 0),
      total_deductions: salaryData.reduce((s, r) => s + r.total_deductions, 0),
      calculated_salary: salaryData.reduce((s, r) => s + r.calculated_salary, 0),
      final_salary:   salaryData.reduce((s, r) => s + r.final_salary, 0),
    });
    totalRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDD6FE' } };
    });

    const filename = `Salary_${targetMonth}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to generate salary report', error: err.message });
  }
});

/**
 * GET /api/admin/attendance-status?date=YYYY-MM-DD
 * Returns ALL employees with Present/Absent status for the given date.
 */
router.get('/attendance-status', async (req, res) => {
  try {
    const { date } = req.query;

    const nowIST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    );

    const targetDate = date || nowIST.toISOString().split('T')[0];

    const result = await query(
      `SELECT 
          e.id as employee_id,
          e.name as employee_name,
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
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;