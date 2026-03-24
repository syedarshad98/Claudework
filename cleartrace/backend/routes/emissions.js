const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// GET /api/emissions?page=1&limit=50&scope=1&period=2026-01
router.get('/', async (req, res) => {
  const { page = 1, limit = 50, scope, period } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params  = [req.companyId];
  const filters = ['company_id = $1'];
  let   idx     = 2;

  if (scope)  { filters.push(`scope = $${idx++}`);  params.push(parseInt(scope)); }
  if (period) { filters.push(`period = $${idx++}`); params.push(period); }

  const where = filters.join(' AND ');
  params.push(parseInt(limit), offset);

  try {
    const result = await db.query(
      `SELECT id, category, scope, amount, unit, period, emission_factor,
              co2e_tonnes, source, notes, created_at
         FROM emissions_entries
        WHERE ${where}
        ORDER BY period DESC, created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM emissions_entries WHERE ${where}`,
      params.slice(0, -2)   // remove limit/offset
    );

    res.json({ entries: result.rows, total: parseInt(countRes.rows[0].total) });
  } catch (err) {
    console.error('Emissions GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emissions' });
  }
});

// POST /api/emissions
router.post('/', async (req, res) => {
  const { category, scope, amount, unit, period, emission_factor, notes } = req.body;

  if (!category || scope == null || amount == null || !unit || !period) {
    return res.status(400).json({ error: 'category, scope, amount, unit and period are required' });
  }
  if (![1, 2, 3].includes(parseInt(scope))) {
    return res.status(400).json({ error: 'scope must be 1, 2 or 3' });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'period must be YYYY-MM format' });
  }

  try {
    const result = await db.query(
      `INSERT INTO emissions_entries
         (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', $9)
       RETURNING *`,
      [
        req.companyId,
        req.userId,
        category,
        parseInt(scope),
        parseFloat(amount),
        unit,
        period,
        parseFloat(emission_factor) || 1.0,
        notes || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Emissions POST error:', err.message);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// DELETE /api/emissions/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM emissions_entries WHERE id = $1 AND company_id = $2 RETURNING id',
      [req.params.id, req.companyId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Emissions DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

module.exports = router;
