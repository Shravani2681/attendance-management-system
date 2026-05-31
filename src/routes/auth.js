const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { sendOtpEmail } = require('../services/emailService');

// In-memory OTP store: { email -> { code, expiry, userName } }
const otpStore = new Map();
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, email, password, department, monthly_salary, phone, education, birth_date, age, gender, address } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });

    const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email.toLowerCase().trim());
    if (existing)
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    const id = uuidv4();
    db.prepare(`INSERT INTO employees (id,name,email,password,role,department,monthly_salary,phone,education,birth_date,age,gender,address) VALUES (?,?,?,?,'employee',?,?,?,?,?,?,?,?)`)
      .run(id, name.trim(), email.toLowerCase().trim(), hash, department||'General', monthly_salary||30000, phone||null, education||null, birth_date||null, age||null, gender||null, address||null);

    const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const user = db.prepare('SELECT id,name,email,role,department,monthly_salary,phone,education,birth_date,age,gender,address FROM employees WHERE id=?').get(id);
    res.status(201).json({ success: true, message: 'Registered successfully', token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required' });

    const user = db.prepare('SELECT * FROM employees WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const { password: _, ...userSafe } = user;
    res.json({ success: true, message: 'Login successful', token, user: userSafe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Login failed', error: err.message });
  }
});

// POST /api/auth/forgot-password — Step 1: verify email, generate & send OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const norm = email.toLowerCase().trim();
    const user = db.prepare('SELECT id, name, email FROM employees WHERE email = ?').get(norm);
    if (!user)
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });

    const otp = generateOtp();
    otpStore.set(norm, { code: otp, expiry: Date.now() + 10 * 60 * 1000, userName: user.name });

    try {
      await sendOtpEmail(norm, user.name, otp);
    } catch (mailErr) {
      console.error('Email send failed:', mailErr.message);
      return res.status(500).json({ success: false, message: 'Failed to send OTP. Check EMAIL_USER / EMAIL_PASS in .env' });
    }

    console.log(`✉️  OTP ${otp} sent to ${norm}`);
    res.json({ success: true, message: `OTP sent to ${norm}. Valid for 10 minutes.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Something went wrong', error: err.message });
  }
});

// POST /api/auth/verify-otp — Step 2: validate OTP, issue reset token
router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    const norm = email.toLowerCase().trim();
    const record = otpStore.get(norm);

    if (!record)
      return res.status(400).json({ success: false, message: 'No OTP requested for this email. Please start again.' });
    if (Date.now() > record.expiry) {
      otpStore.delete(norm);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }
    if (record.code !== otp.trim())
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please check and try again.' });

    otpStore.delete(norm);
    const user = db.prepare('SELECT id FROM employees WHERE email = ?').get(norm);
    const resetToken = jwt.sign({ id: user.id, email: norm, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.json({ success: true, message: 'OTP verified.', reset_token: resetToken, user_name: record.userName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'OTP verification failed', error: err.message });
  }
});

// POST /api/auth/reset-password — Step 3: set new password
router.post('/reset-password', (req, res) => {
  try {
    const { reset_token, new_password } = req.body;
    if (!reset_token || !new_password)
      return res.status(400).json({ success: false, message: 'Reset token and new password are required' });
    if (new_password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    let decoded;
    try { decoded = jwt.verify(reset_token, process.env.JWT_SECRET); }
    catch { return res.status(400).json({ success: false, message: 'Reset link has expired or is invalid. Please start again.' }); }

    if (decoded.purpose !== 'password_reset')
      return res.status(400).json({ success: false, message: 'Invalid reset token' });

    const user = db.prepare('SELECT id FROM employees WHERE id = ?').get(decoded.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    db.prepare('UPDATE employees SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), decoded.id);
    res.json({ success: true, message: 'Password Reset Successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Password reset failed', error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').auth, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
