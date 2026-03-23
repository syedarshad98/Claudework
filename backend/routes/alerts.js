const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Initial load — all active alerts
router.get('/', (req, res) => {
  const alerts = db.prepare('SELECT * FROM alerts WHERE active = 1 ORDER BY id').all();
  res.json(alerts);
});

// SSE stream — pushes a random alert every 12 seconds to simulate live activity
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Send a heartbeat comment immediately so the client knows the connection is alive
  res.write(': connected\n\n');

  const getAlerts = db.prepare('SELECT * FROM alerts WHERE active = 1');

  const emit = () => {
    const alerts = getAlerts.all();
    if (!alerts.length) return;
    const alert = alerts[Math.floor(Math.random() * alerts.length)];
    res.write(`event: new_alert\ndata: ${JSON.stringify(alert)}\n\n`);
  };

  // First alert after 4 s, then every 12 s
  const timeout  = setTimeout(emit, 4000);
  const interval = setInterval(emit, 12000);

  req.on('close', () => {
    clearTimeout(timeout);
    clearInterval(interval);
  });
});

module.exports = router;
