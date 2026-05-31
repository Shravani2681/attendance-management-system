const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

router.use(auth);

// POST /api/performance  – submit today's performance
router.post('/', (req, res) => {
  try {
    const { date, today_work, num_clients } = req.body;
    if (!date || !today_work)
      return res.status(400).json({ success: false, message: 'Date and Today Work are required' });

    const existing = db.prepare('SELECT id FROM performance WHERE employee_id = ? AND date = ?').get(req.user.id, date);
    if (existing)
      return res.status(409).json({ success: false, message: 'Performance already submitted for this date' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO performance (id, employee_id, date, today_work, num_clients)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user.id, date, today_work.trim(), parseInt(num_clients) || 0);

    const record = db.prepare('SELECT * FROM performance WHERE id = ?').get(id);
    res.status(201).json({ success: true, message: 'Performance submitted', data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/performance/my  – view own records
router.get('/my', (req, res) => {
  try {
    const { month } = req.query;
    let query = 'SELECT * FROM performance WHERE employee_id = ?';
    const params = [req.user.id];
    if (month) { query += ' AND date LIKE ?'; params.push(`${month}%`); }
    query += ' ORDER BY date DESC';
    const records = db.prepare(query).all(...params);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/performance/:id  – edit own record
router.put('/:id', (req, res) => {
  try {
    const { today_work, num_clients } = req.body;
    const record = db.prepare('SELECT * FROM performance WHERE id = ? AND employee_id = ?').get(req.params.id, req.user.id);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found or not yours' });

    db.prepare(`
      UPDATE performance SET today_work = ?, num_clients = ? WHERE id = ?
    `).run(
      today_work !== undefined ? today_work.trim() : record.today_work,
      num_clients !== undefined ? parseInt(num_clients) || 0 : record.num_clients,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM performance WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Updated', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
