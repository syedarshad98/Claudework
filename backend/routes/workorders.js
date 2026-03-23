const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const orders = db.prepare('SELECT * FROM work_orders ORDER BY id').all();
  res.json(orders);
});

module.exports = router;
