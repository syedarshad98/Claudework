const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/hourly', (req, res) => {
  const today     = db.prepare("SELECT * FROM production_hourly WHERE day = 'today'     ORDER BY id").all();
  const yesterday = db.prepare("SELECT * FROM production_hourly WHERE day = 'yesterday' ORDER BY id").all();
  res.json({ today, yesterday });
});

module.exports = router;
