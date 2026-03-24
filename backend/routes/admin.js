const express = require('express');
const router = express.Router();
const db = require('../db/database');

const ADMIN_USER  = 'admin';
const ADMIN_PASS  = 'opscommand2024';
const ADMIN_TOKEN = 'ops-admin-secret-token-2024';

function auth(req, res, next) {
  if (req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Update KPI
router.put('/kpi', auth, (req, res) => {
  const { units_produced, machine_uptime_pct, defect_rate_pct, inventory_alerts, open_work_orders } = req.body;
  db.prepare(`
    UPDATE kpi SET
      units_produced     = ?,
      machine_uptime_pct = ?,
      defect_rate_pct    = ?,
      inventory_alerts   = ?,
      open_work_orders   = ?,
      updated_at         = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM kpi ORDER BY id DESC LIMIT 1)
  `).run(units_produced, machine_uptime_pct, defect_rate_pct, inventory_alerts, open_work_orders);
  res.json({ ok: true });
});

// Update machine
router.put('/machines/:id', auth, (req, res) => {
  const { status, uptime_pct } = req.body;
  db.prepare('UPDATE machines SET status = ?, uptime_pct = ? WHERE id = ?')
    .run(status, uptime_pct, req.params.id);
  res.json({ ok: true });
});

// Update work order
router.put('/workorders/:id', auth, (req, res) => {
  const { progress_pct, status } = req.body;
  db.prepare('UPDATE work_orders SET progress_pct = ?, status = ? WHERE id = ?')
    .run(progress_pct, status, req.params.id);
  res.json({ ok: true });
});

// Update inventory item
router.put('/inventory/:id', auth, (req, res) => {
  const { level_pct, alert_level } = req.body;
  db.prepare('UPDATE inventory SET level_pct = ?, alert_level = ? WHERE id = ?')
    .run(level_pct, alert_level, req.params.id);
  res.json({ ok: true });
});

// Update quality metric
router.put('/quality/:id', auth, (req, res) => {
  const { pct } = req.body;
  db.prepare('UPDATE quality_metrics SET pct = ? WHERE id = ?')
    .run(pct, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
