const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const { calculateSalaryType, calculateDeduction, calculateEarnedAmount,
        calculateCheckoutSalaryType, calculateCheckoutDeduction, calculateCheckoutDeductionReason } = require('../services/salary');
const { appendRow } = require('../services/googleSheets');

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Haversine distance (meters)
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Reverse geocode using OpenStreetMap Nominatim (free, no API key)
const reverseGeocode = (lat, lng) =>
  new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`;
    const req = https.get(url, { headers: { 'User-Agent': 'AttendanceApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.display_name || `${lat}, ${lng}`);
        } catch { resolve(`${lat}, ${lng}`); }
      });
    });
    req.on('error', () => resolve(`${lat}, ${lng}`));
    req.setTimeout(5000, () => { req.destroy(); resolve(`${lat}, ${lng}`); });
  });

// ─── Routes ────────────────────────────────────────────────────────────────────

// POST /api/attendance/mark
router.post('/mark', auth, async (req, res) => {
  try {
    const { selfie, latitude, longitude } = req.body;
    const employeeId = req.user.id;

    // ── Require Camera selfie ──
    if (!selfie) {
      return res.status(400).json({
        success: false,
        message: 'Camera and GPS Location access are required for attendance.'
      });
    }

    // ── Require GPS ──
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Camera and GPS Location access are required for attendance.'
      });
    }

    // IST-aware date
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = nowIST.toISOString().split('T')[0];

    // One attendance per day rule
    const existing = db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, today);
    if (existing)
      return res.status(409).json({ success: false, message: 'Attendance already marked for today' });

    // GPS Validation against office location
    const officeLat = parseFloat(process.env.OFFICE_LATITUDE);
    const officeLon = parseFloat(process.env.OFFICE_LONGITUDE);
    const radius = parseFloat(process.env.OFFICE_RADIUS_METERS || '5000');
    const gpsDistance = Math.round(haversine(latitude, longitude, officeLat, officeLon));
    const gpsStatus = gpsDistance <= radius ? 'VALID' : 'INVALID';

    // Salary calculation
    const salaryType = calculateSalaryType(nowIST);
    const deductionAmount = calculateDeduction(nowIST);
    const earnedAmount = calculateEarnedAmount(req.user.monthly_salary, salaryType, deductionAmount);

    const id = uuidv4();
    const checkInTime = nowIST.toTimeString().split(' ')[0]; // HH:MM:SS

    // Reverse geocode check-in address (non-blocking start, await below)
    const checkinAddress = await reverseGeocode(latitude, longitude);

    // Auto-derive display status
    const autoStatus = salaryType === 'HALF' ? 'Half Day' : deductionAmount > 0 ? 'Late' : 'Present';

    db.prepare(`
      INSERT INTO attendance
        (id, employee_id, date, check_in_time, selfie,
         latitude, longitude, gps_status, gps_distance, salary_type,
         deduction_amount, checkin_address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, employeeId, today, checkInTime, selfie,
      latitude, longitude, gpsStatus, gpsDistance, salaryType,
      deductionAmount, checkinAddress, autoStatus
    );

    // Google Sheets sync (non-blocking)
    const fullEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
    appendRow({
      employee_id: employeeId,
      employee_name: fullEmployee.name,
      department: fullEmployee.department,
      email: fullEmployee.email,
      date: today,
      check_in_time: checkInTime,
      checkin_address: checkinAddress,
      gps_status: gpsStatus,
      gps_distance: gpsDistance,
      salary_type: salaryType,
      deduction_amount: deductionAmount,
      monthly_salary: fullEmployee.monthly_salary,
      earned_amount: earnedAmount,
      is_edited: false,
      notes: ''
    }).then(rowNum => {
      if (rowNum) db.prepare('UPDATE attendance SET sheets_row = ? WHERE id = ?').run(rowNum, id);
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully',
      data: {
        id, date: today, check_in_time: checkInTime,
        checkin_address: checkinAddress,
        gps_status: gpsStatus, gps_distance: gpsDistance,
        salary_type: salaryType, deduction_amount: deductionAmount,
        earned_amount: earnedAmount
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to mark attendance', error: err.message });
  }
});

// POST /api/attendance/checkout
router.post('/checkout', auth, async (req, res) => {
  try {
    const { checkout_selfie, checkout_latitude, checkout_longitude } = req.body;
    const employeeId = req.user.id;

    // ── Require selfie ──
    if (!checkout_selfie) {
      return res.status(400).json({
        success: false,
        message: 'Camera and GPS Location access are required for attendance.'
      });
    }

    // ── Require GPS ──
    if (checkout_latitude === null || checkout_latitude === undefined ||
        checkout_longitude === null || checkout_longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Camera and GPS Location access are required for attendance.'
      });
    }

    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = nowIST.toISOString().split('T')[0];

    const existing = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, today);
    if (!existing) return res.status(404).json({ success: false, message: 'No check-in found for today' });
    if (existing.check_out_time) return res.status(409).json({ success: false, message: 'Check-out already marked for today' });

    const checkOutTime = nowIST.toTimeString().split(' ')[0]; // HH:MM:SS

    // ── Checkout Salary Deduction Rules ──
    // Pass a Date object with the correct HH:MM for checkout time calculations
    const checkOutDate = new Date(nowIST); // already IST-aware
    const checkoutSalaryTypeOverride = calculateCheckoutSalaryType(checkOutDate);
    const checkoutDeduction          = calculateCheckoutDeduction(checkOutDate);
    const checkoutDeductionReason    = calculateCheckoutDeductionReason(checkOutDate);

    // Determine effective salary type:
    //   If checkout forces HALF (before 2 PM), override regardless of check-in type.
    //   Otherwise keep the existing salary_type from check-in.
    const finalSalaryType = checkoutSalaryTypeOverride || existing.salary_type;

    // Reverse geocode checkout address
    const checkoutAddress = await reverseGeocode(checkout_latitude, checkout_longitude);

    // Auto-derive display status based on checkout rules
    const autoStatus = finalSalaryType === 'HALF' ? 'Half Day'
      : checkoutDeduction > 0 ? 'Early Check-Out'
      : (existing.deduction_amount || 0) > 0 ? 'Late'
      : 'Present';

    db.prepare(`
      UPDATE attendance
      SET check_out_time = ?, checkout_selfie = ?,
          checkout_latitude = ?, checkout_longitude = ?, checkout_address = ?,
          checkout_deduction_amount = ?, checkout_deduction_reason = ?,
          salary_type = ?, status = ?
      WHERE id = ?
    `).run(
      checkOutTime, checkout_selfie,
      checkout_latitude, checkout_longitude, checkoutAddress,
      checkoutDeduction, checkoutDeductionReason,
      finalSalaryType, autoStatus,
      existing.id
    );

    // Google Sheets sync
    if (existing.sheets_row) {
      const fullEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
      const earnedAmount = calculateEarnedAmount(
        fullEmployee.monthly_salary,
        finalSalaryType,
        existing.deduction_amount || 0,
        checkoutDeduction
      );
      const { updateRow } = require('../services/googleSheets');
      updateRow(existing.sheets_row, {
        employee_id:     employeeId,
        employee_name:   fullEmployee.name,
        department:      fullEmployee.department,
        email:           fullEmployee.email,
        date:            today,
        check_in_time:   existing.check_in_time,
        check_out_time:  checkOutTime,
        checkin_address: existing.checkin_address,
        checkout_address: checkoutAddress,
        gps_status:      existing.gps_status,
        gps_distance:    existing.gps_distance,
        salary_type:     finalSalaryType,
        deduction_amount: (existing.deduction_amount || 0) + checkoutDeduction,
        monthly_salary:  fullEmployee.monthly_salary,
        earned_amount:   earnedAmount,
        is_edited:       existing.is_edited === 1,
        notes:           existing.notes || ''
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: 'Check-out successful',
      check_out_time: checkOutTime,
      checkout_address: checkoutAddress,
      checkout_deduction_amount: checkoutDeduction,
      checkout_deduction_reason: checkoutDeductionReason,
      salary_type: finalSalaryType,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to check out', error: err.message });
  }
});


// GET /api/attendance/today
router.get('/today', auth, (req, res) => {
  try {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = nowIST.toISOString().split('T')[0];
    const record = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(req.user.id, today);
    res.json({ success: true, marked: !!record, record: record || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/my?month=2025-05
router.get('/my', auth, (req, res) => {
  try {
    const { month, limit = 60 } = req.query;
    let query = 'SELECT * FROM attendance WHERE employee_id = ?';
    const params = [req.user.id];
    if (month) { query += ' AND date LIKE ?'; params.push(`${month}%`); }
    query += ' ORDER BY date DESC LIMIT ?';
    params.push(parseInt(limit));
    const records = db.prepare(query).all(...params);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/summary
router.get('/summary', auth, (req, res) => {
  try {
    const { month } = req.query;
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentMonth = month || nowIST.toISOString().slice(0, 7);
    const records = db.prepare(
      'SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?'
    ).all(req.user.id, `${currentMonth}%`);

    const { calculateMonthlySummary } = require('../services/salary');
    const summary = calculateMonthlySummary(records, req.user.monthly_salary);
    res.json({ success: true, month: currentMonth, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
