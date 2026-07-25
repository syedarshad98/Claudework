const express  = require('express');
const router   = express.Router();
const db       = require('../db/database');
const { logAction, getIp }         = require('../lib/audit');
const { validateEntry, saveFlags } = require('../lib/validate');
const requireRole                  = require('../middleware/roles');
const { decideFactor, defaultRegionFromJurisdiction } = require('../lib/decide-factor');
const { resolveMethodFields } = require('../lib/entry-method');

// ── Lazy migration ────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql            = fs.readFileSync(path.join(__dirname, '../db/audit_migration.sql'), 'utf8');
  const regionSql      = fs.readFileSync(path.join(__dirname, '../db/region_factors_migration.sql'), 'utf8');
  const patch2026       = fs.readFileSync(path.join(__dirname, '../db/region_factors_2026_patch_migration.sql'), 'utf8');
  const vehicleFlightSql = fs.readFileSync(path.join(__dirname, '../db/vehicle_flight_migration.sql'), 'utf8');
  await db.query(sql);
  await db.query(regionSql);
  await db.query(patch2026);
  await db.query(vehicleFlightSql);
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
router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const {
    category, scope, amount, unit, period, emission_factor, notes, region: reqRegion,
    method, fuel_type, distance_km, cabin_class,
    // factor_jurisdiction is accepted off the wire but never trusted — the
    // server derives it from the resolved factor. See decideFactor().
    factor_source: reqFactorSource,
  } = req.body;

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

  const compRow = await db.query('SELECT jurisdiction, region FROM companies WHERE id=$1', [req.companyId]);
  const jurisdiction = compRow.rows[0]?.jurisdiction || 'UK';
  const region = reqRegion || compRow.rows[0]?.region || defaultRegionFromJurisdiction(jurisdiction);

  const methodFields = resolveMethodFields({
    category, method, fuelType: fuel_type, distanceKm: distance_km, cabinClass: cabin_class,
    companyRegion: region,
  });
  if (methodFields.error) return res.status(400).json({ error: methodFields.error });
  const { lookupCategory, subtype, flightBand } = methodFields;

  const decided = await decideFactor({
    db, category, lookupCategory, subtype, region, unit,
    clientFactor: emission_factor,
    clientSource: reqFactorSource,
    companyId:    req.companyId,
  });
  if (decided.error) return res.status(400).json({ error: decided.error });

  const { ef, factorSource, factorJurisdiction, regionResolved, isFallback, fallbackReason } = decided;

  const storedMethod     = method === 'fuel' ? 'fuel' : (method === 'distance' ? 'distance' : null);
  const storedFuelType   = method === 'fuel' ? fuel_type : null;
  const storedDistanceKm = flightBand ? parseFloat(distance_km) : null;
  const storedCabinClass = flightBand ? cabin_class : null;

  try {
    const result = await db.query(
      `INSERT INTO emissions_entries
         (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, notes,
          factor_source, factor_jurisdiction, region, region_resolved, is_fallback_factor, fallback_reason,
          method, fuel_type, distance_km, cabin_class, flight_band)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [req.companyId, req.userId, category, parseInt(scope),
       parseFloat(amount), unit, period, ef, notes || null, factorSource, factorJurisdiction,
       region, regionResolved, isFallback, fallbackReason,
       storedMethod, storedFuelType, storedDistanceKm, storedCabinClass, flightBand || null]
    );
    const entry = result.rows[0];

    const issues = await validateEntry(entry, req.companyId);
    await saveFlags(entry.id, req.companyId, issues);

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'create', recordId: entry.id,
      newValues: {
        category, scope, amount, unit, period, notes,
        ...(storedMethod === 'fuel' ? { method: 'fuel', fuel_type: storedFuelType } : {}),
        ...(flightBand ? { distance_km: storedDistanceKm, cabin_class: storedCabinClass, flight_band: flightBand } : {}),
      },
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
router.patch('/:id', requireRole('admin', 'editor'), async (req, res) => {
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

  const {
    category, scope, amount, unit, period, emission_factor, notes,
    method, fuel_type, distance_km, cabin_class,
  } = req.body;
  const newPeriod = period || oldEntry.period;
  if (newPeriod !== oldEntry.period && await isPeriodLocked(req.companyId, newPeriod)) {
    return res.status(423).json({ error: `Target period ${newPeriod} is locked.`, locked: true });
  }

  const compRowP = await db.query('SELECT jurisdiction, region FROM companies WHERE id=$1', [req.companyId]);
  const jurisdictionP = compRowP.rows[0]?.jurisdiction || 'UK';
  const region = req.body.region || oldEntry.region || compRowP.rows[0]?.region || defaultRegionFromJurisdiction(jurisdictionP);

  const effectiveCategory    = category || oldEntry.category;
  const effectiveUnit        = unit || oldEntry.unit;
  const effectiveMethod      = method !== undefined ? method : oldEntry.method;
  const effectiveFuelType    = fuel_type !== undefined ? fuel_type : oldEntry.fuel_type;
  const effectiveDistanceKm  = distance_km !== undefined ? distance_km : oldEntry.distance_km;
  const effectiveCabinClass  = cabin_class !== undefined ? cabin_class : oldEntry.cabin_class;
  const categoryChanged      = !!(category && category !== oldEntry.category);

  const methodFields = resolveMethodFields({
    category: effectiveCategory, method: effectiveMethod, fuelType: effectiveFuelType,
    distanceKm: effectiveDistanceKm, cabinClass: effectiveCabinClass, companyRegion: region,
  });
  if (methodFields.error) return res.status(400).json({ error: methodFields.error });
  const { lookupCategory, subtype, flightBand } = methodFields;

  const decided = await decideFactor({
    db, category: effectiveCategory, lookupCategory, subtype, region, unit: effectiveUnit,
    // For a custom category the user's number is the mechanism; when this PATCH
    // does not carry one, keep whatever the entry already had.
    clientFactor: emission_factor != null ? emission_factor : oldEntry.emission_factor,
    clientSource: undefined,
    companyId:    req.companyId,
  });

  let ef, factorSource, factorJurisdiction, regionResolved, isFallback, fallbackReason;
  if (decided.error) {
    // Switching to an unresolvable category is a client error. Leaving an
    // already-unresolvable category untouched is not — that would make legacy
    // rows uneditable, so keep their stored factor.
    if (categoryChanged) return res.status(400).json({ error: decided.error });
    ef                 = parseFloat(oldEntry.emission_factor);
    factorSource       = oldEntry.factor_source || null;
    factorJurisdiction = oldEntry.factor_jurisdiction || null;
    regionResolved     = oldEntry.region_resolved || null;
    isFallback         = oldEntry.is_fallback_factor || false;
    fallbackReason      = oldEntry.fallback_reason || null;
  } else {
    ({ ef, factorSource, factorJurisdiction, regionResolved, isFallback, fallbackReason } = decided);
  }

  if (emission_factor != null && Number(emission_factor) !== Number(ef)) {
    console.warn(
      `[emissions] rejected client-supplied factor fields — company_id=${req.companyId} ` +
      `category="${effectiveCategory}" emission_factor=${emission_factor}; ` +
      `server-resolved factor ${ef} used instead`
    );
  }

  const storedMethod     = effectiveMethod === 'fuel' ? 'fuel' : (effectiveMethod === 'distance' ? 'distance' : null);
  const storedFuelType   = effectiveMethod === 'fuel' ? effectiveFuelType : null;
  const storedDistanceKm = flightBand ? parseFloat(effectiveDistanceKm) : null;
  const storedCabinClass = flightBand ? effectiveCabinClass : null;

  try {
    const result = await db.query(
      `UPDATE emissions_entries
          SET category           = COALESCE($1, category),
              scope              = COALESCE($2, scope),
              amount             = COALESCE($3, amount),
              unit               = COALESCE($4, unit),
              period             = COALESCE($5, period),
              emission_factor    = $6,
              notes              = COALESCE($7, notes),
              factor_source      = $10,
              factor_jurisdiction = $11,
              region             = $12,
              region_resolved    = $13,
              is_fallback_factor = $14,
              fallback_reason    = $15,
              method             = $16,
              fuel_type          = $17,
              distance_km        = $18,
              cabin_class        = $19,
              flight_band        = $20
        WHERE id=$8 AND company_id=$9
        RETURNING *`,
      [category || null, scope != null ? parseInt(scope) : null,
       amount != null ? parseFloat(amount) : null, unit || null,
       period || null, ef,
       notes !== undefined ? notes : null,
       id, req.companyId, factorSource, factorJurisdiction,
       region, regionResolved, isFallback, fallbackReason,
       storedMethod, storedFuelType, storedDistanceKm, storedCabinClass, flightBand || null]
    );
    const entry = result.rows[0];

    const issues = await validateEntry(entry, req.companyId);
    await saveFlags(entry.id, req.companyId, issues);

    await logAction({
      companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
      action: 'edit', recordId: id,
      oldValues: { category: oldEntry.category, scope: oldEntry.scope,
                   amount: oldEntry.amount, unit: oldEntry.unit, period: oldEntry.period,
                   method: oldEntry.method, fuel_type: oldEntry.fuel_type,
                   distance_km: oldEntry.distance_km, cabin_class: oldEntry.cabin_class },
      newValues: { category: entry.category, scope: entry.scope,
                   amount: entry.amount, unit: entry.unit, period: entry.period,
                   method: entry.method, fuel_type: entry.fuel_type,
                   distance_km: entry.distance_km, cabin_class: entry.cabin_class },
      ip: getIp(req),
    });

    res.json({ ...entry, locked: false, validation_status: issues.length > 0 ? 'warning' : 'ok' });
  } catch (err) {
    console.error('Emissions PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// ── DELETE /api/emissions/:id ─────────────────────────────────────────────────
router.delete('/:id', requireRole('admin', 'editor'), async (req, res) => {
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
