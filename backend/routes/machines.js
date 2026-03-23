const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const machines = db.prepare('SELECT * FROM machines ORDER BY id').all();
  res.json(machines);
});

module.exports = router;
