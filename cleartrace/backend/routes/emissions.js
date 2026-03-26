const express  = require('express');
const router   = express.Router();
const db       = require('../db/database');
const { lookupFactor }             = require('../db/emission_factors');
const { logAction, getIp }         = require('../lib/audit');
const { validateEntry, saveFlags } = require('../lib/validate');

// ── Lazy migration ────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../db/audit_migration.sql'), 'utf8');
  await db.query(sql);
  migrated = true;
}

// ── Lock check helper ─────────────────────────────────────────────────────────
async function isPeriodLocked(companyId, period) {
  const r = await db.query(
    'SELECT id FROM locked_periods WHERE company_id=$1 AND period=$2',
    [companyId, period]
  );
  return r.rows.length > 0;
}

// ── GET /api/emissions ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  await ensureMigrated();
  const { page = 1, limit = 50, scope, period } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params  = [req.companyId];
  const filters = ['e.company_id = $1'];
  let   idx     = 2;

  if (scope)  { filters.push(`e.scope = $${idx++}`);  params.push(parseInt(scope)); }
  if (period) { filters.push(`e.period = $${idx++}`); params.push(period); }

  const where = filters.join(' AND ');
  params.push(parseInt(limit), offset);

  try {
    const result = await db.query(
      `SELECT e.id, e.category, e.scope, e.amount, e.unit, e.period,
              e.emission_factor, e.co2e_tonnes, e.source, e.notes, e.created_at,
              CASE WHEN lp.id IS NOT NULL THEN true ELSE false END AS locked,
              COALESCE(
                (SELECT CASE
                   WHEN COUNT(*) FILTER (WHERE vf.status='pending')  > 0 THEN 'warning'
                   WHEN COUNT(*) FILTER (WHERE vf.status='approved') > 0 THEN 'approved'
                   ELSE 'ok'
                 END
                 FROM validation_flags vf WHERE vf.entry_id = e.id
                ), 'ok'
              ) AS validation_status
         FROM emissions_entries e
         LEFT JOIN locked_periods lp
                ON lp.company_id = e.company_id AND lp.period = e.period
        WHERE ${where}
        ORDER BY e.period DESC, e.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM emissions_entries e WHERE ${where}`,
      params.slice(0, -2)
    );

    res.json({ entries: result.rows, total: parseInt(countRes.rows[0].total) });
  } catch (err) {
    console.error('Emissions GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emissions' });
  }
});

// ── POST /api/emissions ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  await ensureMigrated();
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
  if (await isPeriodLocked(req.companyId, period)) {
    return res.status(423).json({ error: `Period ${period} is locked. Contact an admin to unlock.` });
  }

  const defra = lookupFactor(category);
  let ef;
  if (defra && !defra.custom && defra.factor != null) {
    ef = defra.factor;
  } else {
    ef = parseFloat(emission_factor) || 1.0;
  }

  try {
    const result = await db.query(
      `INSERT INTO emissions_entries
         (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9)
       RETURNING *`,
      [req.companyId, req.userId, category, parseInt(scope),
       parseFloat(amount), unit, period, ef, notes || null]
    );
    const entry = result.rows[0];

    const issues = await validateEntry(entry, req.companyId);
    await saveFlags(entry.id, req.companyId, issues);

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'create', recordId: entry.id,
      newValues: { category, scope, amount, unit, period, notes },
      ip: getIp(req),
    });

    res.status(201).json({
      ...entry,
      locked:            false,
      validation_status: issues.length > 0 ? 'warning' : 'ok',
      validation_flags:  issues,
    });
  } catch (err) {
    console.error('Emissions POST error:', err.message);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// ── PATCH /api/emissions/:id ──────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  await ensureMigrated();
  const id = parseInt(req.params.id);

  const oldRes = await db.query(
    'SELECT * FROM emissions_entries WHERE id=$1 AND company_id=$2',
    [id, req.companyId]
  );
  if (!oldRes.rows.length) return res.status(404).json({ error: 'Entry not found' });
  const oldEntry = oldRes.rows[0];

  if (await isPeriodLocked(req.companyId, oldEntry.period) && req.query.force !== '1') {
    return res.status(423).json({ error: `Period ${oldEntry.period} is locked.`, locked: true });
  }

  const { category, scope, amount, unit, period, emission_factor, notes } = req.body;
  const newPeriod = period || oldEntry.period;
  if (newPeriod !== oldEntry.period && await isPeriodLocked(req.companyId, newPeriod)) {
    return res.status(423).json({ error: `Target period ${newPeriod} is locked.`, locked: true });
  }

  let ef = parseFloat(oldEntry.emission_factor);
  if (category && category !== oldEntry.category) {
    const defra = lookupFactor(category);
    ef = (defra && !defra.custom && defra.factor != null) ? defra.factor : (parseFloat(emission_factor) || ef);
  } else if (emission_factor != null) {
    ef = parseFloat(emission_factor);
  }

  try {
    const result = await db.query(
      `UPDATE emissions_entries
          SET category        = COALESCE($1, category),
              scope           = COALESCE($2, scope),
              amount          = COALESCE($3, amount),
              unit            = COALESCE($4, unit),
              period          = COALESCE($5, period),
              emission_factor = $6,
              notes           = COALESCE($7, notes)
        WHERE id=$8 AND company_id=$9
        RETURNING *`,
      [category || null, scope != null ? parseInt(scope) : null,
       amount != null ? parseFloat(amount) : null, unit || null,
       period || null, ef,
       notes !== undefined ? notes : null,
       id, req.companyId]
    );
    const entry = result.rows[0];

    const issues = await validateEntry(entry, req.companyId);
    await saveFlags(entry.id, req.companyId, issues);

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'edit', recordId: id,
      oldValues: { category: oldEntry.category, scope: oldEntry.scope,
                   amount: oldEntry.amount, unit: oldEntry.unit, period: oldEntry.period },
      newValues: { category: entry.category, scope: entry.scope,
                   amount: entry.amount, unit: entry.unit, period: entry.period },
      ip: getIp(req),
    });

    res.json({ ...entry, locked: false, validation_status: issues.length > 0 ? 'warning' : 'ok' });
  } catch (err) {
    console.error('Emissions PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// ── DELETE /api/emissions/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  await ensureMigrated();
  const id = parseInt(req.params.id);

  const oldRes = await db.query(
    'SELECT * FROM emissions_entries WHERE id=$1 AND company_id=$2',
    [id, req.companyId]
  );
  if (!oldRes.rows.length) return res.status(404).json({ error: 'Entry not found' });
  const oldEntry = oldRes.rows[0];

  if (await isPeriodLocked(req.companyId, oldEntry.period) && req.query.force !== '1') {
    return res.status(423).json({
      error:  `Period ${oldEntry.period} is locked. Pass ?force=1 with admin role to override.`,
      locked: true,
    });
  }

  try {
    await db.query('DELETE FROM emissions_entries WHERE id=$1 AND company_id=$2', [id, req.companyId]);

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'delete', recordId: id,
      oldValues: { category: oldEntry.category, scope: oldEntry.scope,
                   amount: oldEntry.amount, unit: oldEntry.unit, period: oldEntry.period },
      ip: getIp(req),
    });

    res.json({ deleted: true });
  } catch (err) {
    console.error('Emissions DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

module.exports = router;
