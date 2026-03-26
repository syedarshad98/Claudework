require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve the ClearTrace frontend as static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Public routes — no auth required
app.use('/api/auth', require('./routes/auth'));

// DEFRA emission factors — public so the frontend can fetch them without auth
const { DEFRA_FACTORS } = require('./db/emission_factors');
app.get('/api/emission-factors', (_req, res) => res.json(DEFRA_FACTORS));

// Protected routes — JWT required
const auth = require('./middleware/auth');
app.use('/api/emissions',  auth, require('./routes/emissions'));
app.use('/api/kpi',        auth, require('./routes/kpi'));
app.use('/api/charts',     auth, require('./routes/charts'));
app.use('/api/frameworks', auth, require('./routes/frameworks'));
app.use('/api/upload',      auth, require('./routes/upload'));
app.use('/api/report',      auth, require('./routes/report'));
app.use('/api/onboarding',  auth, require('./routes/onboarding'));
app.use('/api/targets',     auth, require('./routes/targets'));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`ClearTrace server running → http://localhost:${PORT}`);
});
