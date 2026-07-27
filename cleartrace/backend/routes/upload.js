const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const XLSX        = require('xlsx');
const { parse }   = require('csv-parse/sync');
const fs          = require('fs');
const path        = require('path');
const db          = require('../db/database');
const requireRole = require('../middleware/roles');
const { decideFactor, defaultRegionFromJurisdiction } = require('../lib/decide-factor');
const { resolveMethodFields }      = require('../lib/entry-method');
const { logAction, getIp }         = require('../lib/audit');
const { isFuturePeriod }           = require('../lib/period');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },  // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['xlsx', 'xls', 'csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls and .csv files are supported'));
  }
});

// ── Lazy migration ─────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const sql              = fs.readFileSync(path.join(__dirname, '../db/region_factors_migration.sql'), 'utf8');
  const patch2026        = fs.readFileSync(path.join(__dirname, '../db/region_factors_2026_patch_migration.sql'), 'utf8');
  const vehicleFlightSql = fs.readFileSync(path.join(__dirname, '../db/vehicle_flight_migration.sql'), 'utf8');
  const flightRouteSql   = fs.readFileSync(path.join(__dirname, '../db/flight_2026_route_patch_migration.sql'), 'utf8');
  const deleteGuardSql   = fs.readFileSync(path.join(__dirname, '../db/emission_factors_delete_guard_migration.sql'), 'utf8');
  await db.query(sql);
  await db.query(patch2026);
  await db.query(vehicleFlightSql);
  await db.query(flightRouteSql);
  await db.query(deleteGuardSql);
  migrated = true;
}

/** Parse a spreadsheet cell as a boolean. Blank -> undefined (not "false") so
 * a missing column is distinguishable from an explicit false. */
function parseCellBoolean(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '') return undefined;
  return ['true', '1', 'yes', 'y'].includes(s);
}

// POST /api/upload
// Expected spreadsheet columns (case-insensitive):
//   category | scope | amount | unit | period | emission_factor (optional) | notes (optional)
router.post('/', requireRole('admin', 'editor'), upload.single('file'), async (req, res) => {
  await ensureMigrated();
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const compRow = await db.query('SELECT jurisdiction, region FROM companies WHERE id=$1', [req.companyId]);
  const jurisdiction = compRow.rows[0]?.jurisdiction || 'UK';
  const companyRegion = compRow.rows[0]?.region || defaultRegionFromJurisdiction(jurisdiction);

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  let rows  = [];

  try {
    if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } else {
      rows = parse(req.file.buffer.toString(), {
        columns:           true,
        skip_empty_lines:  true,
        trim:              true
      });
    }
  } catch (parseErr) {
    return res.status(422).json({ error: 'Could not parse file: ' + parseErr.message });
  }

  if (!rows.length) {
    return res.status(422).json({ error: 'File is empty or has no data rows' });
  }

  // Normalise column names to lowercase, stripping whitespace
  rows = rows.map(r => {
    const out = {};
    for (const k of Object.keys(r)) out[k.toLowerCase().trim()] = r[k];
    return out;
  });

  const inserted = [];
  const errors   = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // account for header row

    const category       = String(r.category       || '').trim();
    const scopeRaw       = String(r.scope           || '').trim();
    const amountRaw      = String(r.amount          || '').trim();
    const unit           = String(r.unit            || '').trim();
    const period         = String(r.period          || '').trim();
    const notes          = String(r.notes           || '').trim() || null;
    const region         = String(r.region          || '').trim() || companyRegion;
    const method         = String(r.method          || '').trim() || undefined;
    const fuelType       = String(r.fuel_type       || '').trim() || undefined;
    const distanceKmRaw  = String(r.distance_km     || '').trim();
    const cabinClass     = String(r.cabin_class     || '').trim() || undefined;
    const touchesUk      = parseCellBoolean(r.touches_uk);
    const bothEndpointsUk = parseCellBoolean(r.both_endpoints_uk);

    if (!category || !scopeRaw || !amountRaw || !unit || !period) {
      errors.push(`Row ${rowNum}: missing required field (category, scope, amount, unit, period)`);
      continue;
    }

    const scope  = parseInt(scopeRaw);
    const amount = parseFloat(amountRaw);

    if (![1, 2, 3].includes(scope)) {
      errors.push(`Row ${rowNum}: scope must be 1, 2 or 3`);
      continue;
    }
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowNum}: amount must be a positive number`);
      continue;
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      errors.push(`Row ${rowNum}: period must be YYYY-MM format`);
      continue;
    }
    if (isFuturePeriod(period)) {
      errors.push(`Row ${rowNum}: period cannot be in the future`);
      continue;
    }

    // Same resolution + normalization as the manual entry form (routes/emissions.js).
    // A row that supplies its own factor for a resolvable category has that factor
    // discarded and logged, exactly like the form path — a spreadsheet is not a
    // more trusted source than the entry form. A blank cell resolves the server's
    // factor rather than falling through to 1.0. An unresolvable category is a
    // rejected row, not a silently-inserted 1.0.
    const efCellRaw = r.emission_factor != null ? String(r.emission_factor).trim() : '';
    const efProvided = efCellRaw !== '';

    // Same dispatch as the manual form for the two new methods: a row with
    // method='fuel' but no/unrecognised fuel_type, or a flight row with a
    // missing/unrecognised cabin_class or distance_km, is a rejected row —
    // never a silent fall-through to distance-basis or a factor of 1.0.
    const methodFields = resolveMethodFields({
      category, method, fuelType, distanceKm: distanceKmRaw, cabinClass,
      touchesUk, bothEndpointsUk,
    });
    if (methodFields.error) {
      errors.push(`Row ${rowNum}: ${methodFields.error}`);
      continue;
    }
    const { lookupCategory, subtype, flightBand, substitutedCabinClass, substitutionReason } = methodFields;

    if (substitutedCabinClass) {
      console.warn(`[upload row ${rowNum}] cabin_class substitution — company_id=${req.companyId} category="${category}": ${substitutionReason}`);
    }

    const decided = await decideFactor({
      db, category, lookupCategory, subtype, region, unit,
      clientFactor: efProvided ? efCellRaw : undefined,
      clientSource: undefined,
      companyId:    req.companyId,
      logPrefix:    `[upload row ${rowNum}]`,
    });

    if (decided.error) {
      errors.push(`Row ${rowNum}: ${decided.error}`);
      continue;
    }

    const { ef, factorSource, factorJurisdiction, regionResolved, isFallback, fallbackReason } = decided;

    const storedMethod          = method === 'fuel' ? 'fuel' : (method === 'distance' ? 'distance' : null);
    const storedFuelType        = method === 'fuel' ? fuelType : null;
    const storedDistanceKm      = flightBand ? (distanceKmRaw !== '' ? parseFloat(distanceKmRaw) : null) : null;
    const storedCabinClass      = flightBand ? cabinClass : null;
    const storedTouchesUk       = flightBand ? !!touchesUk : null;
    const storedBothEndpointsUk = flightBand ? (bothEndpointsUk === true) : null;

    try {
      const result = await db.query(
        `INSERT INTO emissions_entries
           (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, notes,
            factor_source, factor_jurisdiction, region, region_resolved, is_fallback_factor, fallback_reason,
            method, fuel_type, distance_km, cabin_class, flight_band, touches_uk, both_endpoints_uk)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upload',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id`,
        [req.companyId, req.userId, category, scope, amount, unit, period, ef, notes,
         factorSource, factorJurisdiction, region, regionResolved, isFallback, fallbackReason,
         storedMethod, storedFuelType, storedDistanceKm, storedCabinClass, flightBand || null,
         storedTouchesUk, storedBothEndpointsUk]
      );
      inserted.push(result.rows[0].id);

      // lib/audit.js's rule is "call logAction() after any data-mutating
      // operation." upload.js does not audit its other rows today (a
      // pre-existing gap, not this step's to fix) — but these two methods
      // are new code, so their rows are audited from the start.
      if (storedMethod === 'fuel' || flightBand) {
        await logAction({
          companyId: req.companyId, userId: req.userId, userEmail: req.userEmail || '',
          action: 'create', recordId: result.rows[0].id,
          newValues: {
            category, scope, amount, unit, period,
            ...(storedMethod === 'fuel' ? { method: 'fuel', fuel_type: storedFuelType } : {}),
            ...(flightBand ? {
              distance_km: storedDistanceKm, cabin_class: storedCabinClass, flight_band: flightBand,
              touches_uk: storedTouchesUk, both_endpoints_uk: storedBothEndpointsUk,
              ...(substitutedCabinClass ? { cabin_class_substitution: substitutionReason } : {}),
            } : {}),
          },
          ip: getIp(req),
        });
      }
    } catch (dbErr) {
      errors.push(`Row ${rowNum}: database error — ${dbErr.message}`);
    }
  }

  res.json({
    imported: inserted.length,
    total:    rows.length,
    errors:   errors.length ? errors : undefined
  });
});

module.exports = router;
