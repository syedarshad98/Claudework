const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const XLSX        = require('xlsx');
const { parse }   = require('csv-parse/sync');
const db          = require('../db/database');
const { lookupFactor } = require('../db/emission_factors');
const requireRole = require('../middleware/roles');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },  // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['xlsx', 'xls', 'csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls and .csv files are supported'));
  }
});

// POST /api/upload
// Expected spreadsheet columns (case-insensitive):
//   category | scope | amount | unit | period | emission_factor (optional) | notes (optional)
router.post('/', requireRole('admin', 'editor'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const compRow = await db.query('SELECT jurisdiction FROM companies WHERE id=$1', [req.companyId]);
  const jurisdiction = compRow.rows[0]?.jurisdiction || 'UK';

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

    // Resolve emission factor: if the spreadsheet provides one, use it.
    // Otherwise auto-apply the standard factor for the category (DEFRA or CEA by jurisdiction).
    const efProvided = r.emission_factor != null && String(r.emission_factor).trim() !== '';
    let ef;
    let factorSource = null;
    let factorJurisdiction = null;
    if (efProvided) {
      ef = parseFloat(String(r.emission_factor).trim()) || 1.0;
    } else {
      const factorResult = lookupFactor(category, { jurisdiction });
      if (factorResult && !factorResult.custom && factorResult.factor != null) {
        ef = factorResult.factor;
        factorSource = factorResult.source || 'DEFRA 2023';
        factorJurisdiction = factorResult.jurisdiction || 'UK';
      } else {
        ef = 1.0;
      }
    }

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

    try {
      const result = await db.query(
        `INSERT INTO emissions_entries
           (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, notes, factor_source, factor_jurisdiction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upload',$9,$10,$11)
         RETURNING id`,
        [req.companyId, req.userId, category, scope, amount, unit, period, ef, notes, factorSource, factorJurisdiction]
      );
      inserted.push(result.rows[0].id);
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
