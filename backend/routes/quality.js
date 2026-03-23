const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const metrics = db.prepare('SELECT * FROM quality_metrics ORDER BY id').all();
  const kpi = db.prepare('SELECT units_produced FROM kpi ORDER BY id DESC LIMIT 1').get();
  res.json({ metrics, units_inspected: kpi?.units_produced ?? 0 });
});

module.exports = router;
