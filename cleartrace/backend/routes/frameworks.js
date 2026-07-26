const express     = require('express');
const router      = express.Router();
const db          = require('../db/database');
const requireRole = require('../middleware/roles');

// GET /api/frameworks
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM framework_status WHERE company_id = $1 ORDER BY framework',
      [req.companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Frameworks GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch framework status' });
  }
});

// PATCH /api/frameworks/:framework
// Updates status for a given framework (GRI, TCFD, SASB, LOCAL)
router.patch('/:framework', requireRole('admin', 'editor'), async (req, res) => {
  const framework = req.params.framework.toUpperCase();
  const { status, details } = req.body;

  const validFrameworks = ['GRI', 'TCFD', 'SASB', 'LOCAL'];
  const validStatuses   = ['aligned', 'partial', 'not_started'];

  if (!validFrameworks.includes(framework)) {
    return res.status(400).json({ error: `framework must be one of: ${validFrameworks.join(', ')}` });
  }
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const result = await db.query(
      `INSERT INTO framework_status (company_id, framework, status, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, framework)
       DO UPDATE SET
         status     = COALESCE(EXCLUDED.status, framework_status.status),
         details    = EXCLUDED.details,
         updated_at = NOW()
       RETURNING *`,
      [req.companyId, framework, status || 'not_started', details || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Frameworks PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update framework status' });
  }
});

module.exports = router;
