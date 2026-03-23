const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const kpi = db.prepare('SELECT * FROM kpi ORDER BY id DESC LIMIT 1').get();
  if (!kpi) return res.status(404).json({ error: 'No KPI data found' });
  res.json(kpi);
});

module.exports = router;
