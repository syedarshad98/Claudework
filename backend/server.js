const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend as static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/kpi',        require('./routes/kpi'));
app.use('/api/production', require('./routes/production'));
app.use('/api/machines',   require('./routes/machines'));
app.use('/api/workorders', require('./routes/workorders'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/quality',    require('./routes/quality'));
app.use('/api/alerts',     require('./routes/alerts'));
app.use('/api/admin',      require('./routes/admin'));

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`OpsCommand server running → http://localhost:${PORT}`);
});
