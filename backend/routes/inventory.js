const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM inventory ORDER BY id').all();
  res.json(items);
});

module.exports = router;
