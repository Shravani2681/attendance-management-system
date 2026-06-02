const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/postgres');
const { auth } = require('../middleware/auth');

router.use(auth);

// POST /api/performance
router.post('/', async (req, res) => {
  try {
    const { date, today_work, num_clients } = req.body;

    if (!date || !today_work) {
      return res.status(400).json({
        success: false,
        message: 'Date and Today Work are required'
      });
    }

    const existing = await query(
      `SELECT id FROM performance
       WHERE employee_id = $1 AND date = $2`,
      [req.user.id, date]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Performance already submitted for this date'
      });
    }

    const id = uuidv4();

    await query(
      `INSERT INTO performance
       (id, employee_id, date, today_work, num_clients)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        req.user.id,
        date,
        today_work.trim(),
        parseInt(num_clients) || 0
      ]
    );

    const record = await query(
      `SELECT * FROM performance WHERE id = $1`,
      [id]
    );

    res.status(201).json({
      success: true,
      message: 'Performance submitted',
      data: record.rows[0]
    });

  } catch (err) {
    console.error('Performance submit error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// GET /api/performance/my
router.get('/my', async (req, res) => {
  try {
    const { month } = req.query;

    let sql = `SELECT * FROM performance WHERE employee_id = $1`;
    const params = [req.user.id];
    let idx = 2;

    if (month) {
      sql += ` AND date LIKE $${idx}`;
      params.push(`${month}%`);
      idx++;
    }

    sql += ` ORDER BY date DESC`;

    const records = await query(sql, params);

    res.json({
      success: true,
      data: records.rows
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// PUT /api/performance/:id
router.put('/:id', async (req, res) => {
  try {
    const { today_work, num_clients } = req.body;

    const existing = await query(
      `SELECT * FROM performance
       WHERE id = $1 AND employee_id = $2`,
      [req.params.id, req.user.id]
    );

    const record = existing.rows[0];

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found or not yours'
      });
    }

    await query(
      `UPDATE performance
       SET today_work = $1,
           num_clients = $2
       WHERE id = $3`,
      [
        today_work !== undefined ? today_work.trim() : record.today_work,
        num_clients !== undefined ? parseInt(num_clients) || 0 : record.num_clients,
        req.params.id
      ]
    );

    const updated = await query(
      `SELECT * FROM performance WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Updated',
      data: updated.rows[0]
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;