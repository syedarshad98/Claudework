const express     = require('express');
const router      = express.Router();
const db          = require('../db/database');
const requireRole = require('../middleware/roles');
const { getRecommendationsForCompany, TRIGGER_DESCRIPTIONS } = require('../lib/recommendations');

// ── Lazy migration ─────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(
    path.join(__dirname, '../db/recommendations_migration.sql'), 'utf8'
  );
  await db.query(sql);
  migrated = true;
}

// ── GET /api/recommendations ───────────────────────────────────────────────────
// Runs gap analysis, upserts results, returns full list with library metadata.
// Query params: ?scope=1|2|3  ?cost=low|medium|high
//               ?time=quick_win|medium_term|long_term  ?status=new|saved|…
router.get('/', async (req, res) => {
  await ensureMigrated();
  const companyId = req.companyId;

  try {
    // Run gap analysis
    const { recommendations, matchedTriggers, triggerDescriptions } =
      await getRecommendationsForCompany(companyId, db);

    // Upsert into company_recommendations (insert new, preserve existing status)
    for (const r of recommendations) {
      await db.query(
        `INSERT INTO company_recommendations (company_id, recommendation_id, gap_score)
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id, recommendation_id)
         DO UPDATE SET gap_score    = EXCLUDED.gap_score,
                       updated_at   = NOW()
         WHERE company_recommendations.status = 'new'`,
        [companyId, r.id, r.gapScore]
      );
    }

    // Also upsert rows whose triggers are now matched but may not yet be in table
    // (covers first-run scenario for all triggers)
    const recIds = recommendations.map(r => r.id);

    // Fetch full list for this company (joined with library)
    let query = `
      SELECT cr.id, cr.status, cr.gap_score, cr.surfaced_at, cr.updated_at,
             rl.title, rl.description, rl.scope, rl.category,
             rl.co2e_saving_min, rl.co2e_saving_max, rl.co2e_saving_unit,
             rl.cost_band, rl.time_to_impact,
             rl.gri_reference, rl.tcfd_reference, rl.sasb_reference,
             rl.trigger_condition, rl.applies_to_sectors
        FROM company_recommendations cr
        JOIN recommendation_library rl ON rl.id = cr.recommendation_id
       WHERE cr.company_id = $1`;

    const params = [companyId];
    let p = 2;

    if (req.query.scope) {
      // scope can be '1','2','3' or 'scope1','scope2','scope3'
      const s = req.query.scope;
      query += ` AND (rl.scope = $${p} OR rl.scope = 'scope${s}' OR rl.scope LIKE $${p+1})`;
      params.push(`scope${s}`, `%scope${s}%`);
      p += 2;
    }
    if (req.query.cost) {
      query += ` AND rl.cost_band = $${p}`;
      params.push(req.query.cost); p++;
    }
    if (req.query.time) {
      query += ` AND rl.time_to_impact = $${p}`;
      params.push(req.query.time); p++;
    }
    if (req.query.status) {
      query += ` AND cr.status = $${p}`;
      params.push(req.query.status); p++;
    }

    query += ` ORDER BY cr.gap_score DESC NULLS LAST, rl.cost_band ASC`;

    const result = await db.query(query, params);

    const rows = result.rows.map(r => ({
      ...r,
      co2e_saving_min: r.co2e_saving_min !== null ? parseFloat(r.co2e_saving_min) : null,
      co2e_saving_max: r.co2e_saving_max !== null ? parseFloat(r.co2e_saving_max) : null,
      gap_score:       r.gap_score !== null ? parseFloat(r.gap_score) : null,
      trigger_label:   triggerDescriptions[r.trigger_condition] || r.trigger_condition,
    }));

    res.json({ recommendations: rows, matched_triggers: matchedTriggers });
  } catch (err) {
    console.error('GET /api/recommendations error:', err.message);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// ── GET /api/recommendations/summary ──────────────────────────────────────────
// Returns status counts and total estimated saving for dashboard panel.
router.get('/summary', async (req, res) => {
  await ensureMigrated();
  const companyId = req.companyId;

  try {
    // Status counts
    const countsRes = await db.query(
      `SELECT cr.status, COUNT(*) AS cnt
         FROM company_recommendations cr
        WHERE cr.company_id = $1
        GROUP BY cr.status`,
      [companyId]
    );

    const counts = { new: 0, saved: 0, in_progress: 0, completed: 0, dismissed: 0 };
    for (const r of countsRes.rows) counts[r.status] = parseInt(r.cnt);

    // Total saving from in_progress + completed
    const savingRes = await db.query(
      `SELECT COALESCE(SUM(rl.co2e_saving_max), 0) AS total_saving
         FROM company_recommendations cr
         JOIN recommendation_library rl ON rl.id = cr.recommendation_id
        WHERE cr.company_id = $1
          AND cr.status IN ('in_progress','completed')`,
      [companyId]
    );
    const totalSaving = parseFloat(savingRes.rows[0].total_saving);

    // Top 3 quick wins (new, quick_win, low cost, ordered by co2e_saving_max desc)
    const quickWinsRes = await db.query(
      `SELECT rl.title, rl.co2e_saving_min, rl.co2e_saving_max, rl.co2e_saving_unit
         FROM company_recommendations cr
         JOIN recommendation_library rl ON rl.id = cr.recommendation_id
        WHERE cr.company_id = $1
          AND cr.status = 'new'
          AND rl.time_to_impact = 'quick_win'
          AND rl.cost_band = 'low'
        ORDER BY rl.co2e_saving_max DESC NULLS LAST
        LIMIT 3`,
      [companyId]
    );

    res.json({
      counts,
      total_saving: totalSaving,
      quick_wins: quickWinsRes.rows.map(r => ({
        title: r.title,
        co2e_saving_min: r.co2e_saving_min !== null ? parseFloat(r.co2e_saving_min) : null,
        co2e_saving_max: r.co2e_saving_max !== null ? parseFloat(r.co2e_saving_max) : null,
        unit:            r.co2e_saving_unit,
      })),
    });
  } catch (err) {
    console.error('GET /api/recommendations/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch recommendations summary' });
  }
});

// ── PATCH /api/recommendations/:id/status ────────────────────────────────────
// Update the status of a company recommendation. Requires admin or editor.
router.patch('/:id/status', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { id } = req.params;
  const { status } = req.body;
  const VALID_STATUSES = ['new', 'saved', 'in_progress', 'completed', 'dismissed'];

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const r = await db.query(
      `UPDATE company_recommendations
          SET status     = $1,
              updated_at = NOW(),
              updated_by = $2
        WHERE id = $3 AND company_id = $4
        RETURNING id, status`,
      [status, req.userId, id, req.companyId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Recommendation not found' });
    res.json({ ok: true, id: r.rows[0].id, status: r.rows[0].status });
  } catch (err) {
    console.error('PATCH /api/recommendations/:id/status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
