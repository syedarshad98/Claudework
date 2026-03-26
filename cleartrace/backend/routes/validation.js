const express     = require('express');
const router      = express.Router();
const db          = require('../db/database');
const { logAction, getIp } = require('../lib/audit');
const requireRole = require('../middleware/roles');

// GET /api/validation/summary — count of pending flags (for dashboard banner)
router.get('/summary', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) AS pending FROM validation_flags
        WHERE company_id=$1 AND status='pending'`,
      [req.companyId]
    );
    res.json({ pending: parseInt(r.rows[0].pending) });
  } catch (err) {
    console.error('Validation summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch validation summary' });
  }
});

// GET /api/validation/flags?status=pending&page=1&limit=50
router.get('/flags', async (req, res) => {
  const { status = 'pending', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const result = await db.query(
      `SELECT vf.id, vf.entry_id, vf.rule, vf.message, vf.status,
              vf.reviewed_at, vf.created_at,
              e.category, e.scope, e.amount, e.unit, e.period,
              e.co2e_tonnes, e.notes,
              CASE WHEN lp.id IS NOT NULL THEN true ELSE false END AS locked
         FROM validation_flags vf
         JOIN emissions_entries e ON e.id = vf.entry_id
         LEFT JOIN locked_periods lp
                ON lp.company_id = vf.company_id AND lp.period = e.period
        WHERE vf.company_id=$1 AND vf.status=$2
        ORDER BY vf.created_at DESC
        LIMIT $3 OFFSET $4`,
      [req.companyId, status, parseInt(limit), offset]
    );

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM validation_flags
        WHERE company_id=$1 AND status=$2`,
      [req.companyId, status]
    );

    res.json({ flags: result.rows, total: parseInt(countRes.rows[0].total) });
  } catch (err) {
    console.error('Validation flags GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch validation flags' });
  }
});

// POST /api/validation/flags/:id/approve — mark as reviewed/approved
router.post('/flags/:id/approve', requireRole('admin', 'editor'), async (req, res) => {
  const flagId = parseInt(req.params.id);
  try {
    const r = await db.query(
      `UPDATE validation_flags
          SET status='approved', reviewed_by=$1, reviewed_at=NOW()
        WHERE id=$2 AND company_id=$3
        RETURNING entry_id`,
      [req.userId, flagId, req.companyId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Flag not found' });

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'approve', recordType: 'validation_flag', recordId: flagId,
      ip: getIp(req),
    });

    res.json({ approved: true });
  } catch (err) {
    console.error('Approve flag error:', err.message);
    res.status(500).json({ error: 'Failed to approve flag' });
  }
});

// DELETE /api/validation/flags/:id — delete the underlying emission entry
router.delete('/flags/:id', requireRole('admin', 'editor'), async (req, res) => {
  const flagId = parseInt(req.params.id);
  try {
    // Fetch the entry_id first
    const flagRes = await db.query(
      'SELECT entry_id FROM validation_flags WHERE id=$1 AND company_id=$2',
      [flagId, req.companyId]
    );
    if (!flagRes.rows.length) return res.status(404).json({ error: 'Flag not found' });

    const entryId = flagRes.rows[0].entry_id;

    // Fetch old entry for audit
    const entryRes = await db.query(
      'SELECT * FROM emissions_entries WHERE id=$1 AND company_id=$2',
      [entryId, req.companyId]
    );
    const oldEntry = entryRes.rows[0];

    // Delete the emission entry (flags cascade)
    await db.query('DELETE FROM emissions_entries WHERE id=$1 AND company_id=$2', [entryId, req.companyId]);

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'delete', recordId: entryId,
      oldValues: oldEntry ? {
        category: oldEntry.category, scope: oldEntry.scope,
        amount: oldEntry.amount, unit: oldEntry.unit, period: oldEntry.period,
        deleted_via: 'validation_review',
      } : null,
      ip: getIp(req),
    });

    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete flagged entry error:', err.message);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// GET /api/validation/locked — list locked periods
router.get('/locked', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT lp.id, lp.period, lp.locked_at, u.email AS locked_by_email
         FROM locked_periods lp
         LEFT JOIN users u ON u.id = lp.locked_by
        WHERE lp.company_id=$1
        ORDER BY lp.period DESC`,
      [req.companyId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Locked periods GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch locked periods' });
  }
});

// POST /api/validation/locked — lock a period (admin only)
router.post('/locked', requireRole('admin'), async (req, res) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can lock periods' });
  }
  const { period } = req.body;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'period must be YYYY-MM format' });
  }
  try {
    await db.query(
      `INSERT INTO locked_periods (company_id, period, locked_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, period) DO NOTHING`,
      [req.companyId, period, req.userId]
    );

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'lock', recordType: 'period',
      newValues: { period },
      ip: getIp(req),
    });

    res.json({ locked: true, period });
  } catch (err) {
    console.error('Lock period error:', err.message);
    res.status(500).json({ error: 'Failed to lock period' });
  }
});

// DELETE /api/validation/locked/:period — unlock (admin only)
router.delete('/locked/:period', requireRole('admin'), async (req, res) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can unlock periods' });
  }
  const { period } = req.params;
  try {
    await db.query(
      'DELETE FROM locked_periods WHERE company_id=$1 AND period=$2',
      [req.companyId, period]
    );

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'unlock', recordType: 'period',
      oldValues: { period },
      ip: getIp(req),
    });

    res.json({ unlocked: true, period });
  } catch (err) {
    console.error('Unlock period error:', err.message);
    res.status(500).json({ error: 'Failed to unlock period' });
  }
});

module.exports = router;
