const jwt = require('jsonwebtoken');
const { query } = require('../config/postgres');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      `SELECT id, name, email, role, department, monthly_salary
       FROM employees
       WHERE id = $1`,
      [decoded.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};

module.exports = { auth, adminOnly };