const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// GET /api/audit?page=1&limit=50&action=&user_email=&record_type=&from=&to=
router.get('/', async (req, res) => {
  const {
    page = 1, limit = 50,
    action, user_email, record_type,
    from, to,
  } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params  = [req.companyId];
  const filters = ['company_id = $1'];
  let   idx     = 2;

  if (action)      { filters.push(`action = $${idx++}`);           params.push(action); }
  if (user_email)  { filters.push(`user_email ILIKE $${idx++}`);   params.push(`%${user_email}%`); }
  if (record_type) { filters.push(`record_type = $${idx++}`);      params.push(record_type); }
  if (from)        { filters.push(`created_at >= $${idx++}`);      params.push(from); }
  if (to)          { filters.push(`created_at <= $${idx++}::date + interval '1 day'`); params.push(to); }

  const where = filters.join(' AND ');
  params.push(parseInt(limit), offset);

  try {
    const result = await db.query(
      `SELECT id, user_email, action, record_type, record_id,
              old_values, new_values, ip_address, created_at
         FROM audit_log
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM audit_log WHERE ${where}`,
      params.slice(0, -2)
    );

    res.json({ logs: result.rows, total: parseInt(countRes.rows[0].total) });
  } catch (err) {
    console.error('Audit GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
