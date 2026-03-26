/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — validation engine
   Returns an array of { rule, message } objects. Never throws.
   ───────────────────────────────────────────────────────────────────────────── */

const db = require('../db/database');

/**
 * Run all validation rules against an entry.
 * @param {object} entry  — the saved entry row (must have .id, .amount, etc.)
 * @param {number} companyId
 * @returns {Promise<Array<{rule:string, message:string}>>}
 */
async function validateEntry(entry, companyId) {
  const issues = [];

  // ── Rule 1: negative / zero amount ─────────────────────────────────────
  if (parseFloat(entry.amount) <= 0) {
    issues.push({
      rule:    'negative_value',
      message: `Amount ${entry.amount} is zero or negative — all consumption figures must be positive.`,
    });
  }

  // ── Rule 2: spike (>3× company average for this category) ──────────────
  try {
    const avgRes = await db.query(
      `SELECT AVG(amount) AS avg_amount, COUNT(*) AS cnt
         FROM emissions_entries
        WHERE company_id = $1
          AND LOWER(category) = LOWER($2)
          AND id <> $3`,
      [companyId, entry.category, entry.id]
    );
    const row      = avgRes.rows[0];
    const avg      = parseFloat(row.avg_amount);
    const cnt      = parseInt(row.cnt);
    if (cnt >= 2 && avg > 0 && parseFloat(entry.amount) > avg * 3) {
      issues.push({
        rule:    'spike',
        message: `${entry.amount} ${entry.unit} is more than 3× the company average of ${avg.toFixed(1)} ${entry.unit} for "${entry.category}". Please verify.`,
      });
    }
  } catch (e) {
    console.error('Validation spike check error:', e.message);
  }

  // ── Rule 3: duplicate — same category, scope, period, source='manual' ──
  try {
    const dupRes = await db.query(
      `SELECT COUNT(*) AS cnt
         FROM emissions_entries
        WHERE company_id = $1
          AND LOWER(category) = LOWER($2)
          AND scope = $3
          AND period = $4
          AND source = 'manual'
          AND id <> $5`,
      [companyId, entry.category, entry.scope, entry.period, entry.id]
    );
    if (parseInt(dupRes.rows[0].cnt) > 0) {
      issues.push({
        rule:    'duplicate',
        message: `A manual entry for "${entry.category}" (Scope ${entry.scope}) in ${entry.period} already exists. This may be a duplicate.`,
      });
    }
  } catch (e) {
    console.error('Validation duplicate check error:', e.message);
  }

  return issues;
}

/**
 * Persist validation results to the validation_flags table.
 * Clears previous flags for the entry first.
 */
async function saveFlags(entryId, companyId, issues) {
  try {
    // Remove any previously auto-resolved or pending flags for this entry
    await db.query(
      `DELETE FROM validation_flags WHERE entry_id = $1 AND status IN ('pending','auto_resolved')`,
      [entryId]
    );
    for (const { rule, message } of issues) {
      await db.query(
        `INSERT INTO validation_flags (company_id, entry_id, rule, message)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (entry_id, rule)
         DO UPDATE SET message = $4, status = 'pending', reviewed_by = NULL, reviewed_at = NULL`,
        [companyId, entryId, rule, message]
      );
    }
    // Mark any remaining flags for this entry as auto_resolved if not in current issues
    if (issues.length > 0) {
      const activeRules = issues.map(i => i.rule);
      await db.query(
        `UPDATE validation_flags
            SET status = 'auto_resolved'
          WHERE entry_id = $1
            AND rule <> ALL($2::text[])
            AND status = 'pending'`,
        [entryId, activeRules]
      );
    }
  } catch (e) {
    console.error('Save flags error:', e.message);
  }
}

module.exports = { validateEntry, saveFlags };
