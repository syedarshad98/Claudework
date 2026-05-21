require('dotenv').config();
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');
const db     = require('./database');

async function seed() {
  // Run schema first
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);

  // Check if demo company already exists
  const exists = await db.query(
    "SELECT id FROM companies WHERE name = 'GreenTech Solutions Ltd' LIMIT 1"
  );
  if (exists.rows.length) {
    console.log('Demo data already seeded, skipping.');
    await db.end();
    return;
  }

  // Create demo company
  const compRes = await db.query(
    "INSERT INTO companies (name, industry, country) VALUES ($1, $2, $3) RETURNING id",
    ['GreenTech Solutions Ltd', 'Manufacturing', 'United Kingdom']
  );
  const companyId = compRes.rows[0].id;

  // Create demo admin user  (password: demo1234)
  const hash = await bcrypt.hash('demo1234', 12);
  const userRes = await db.query(
    "INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id",
    [companyId, 'demo@cleartrace.io', hash]
  );
  const userId = userRes.rows[0].id;

  // Seed 12 months of emissions data
  const now   = new Date();
  const scope1Categories = ['Natural Gas', 'Diesel Generator', 'Company Vehicles'];
  const scope2Categories = ['Grid Electricity'];
  const scope3Categories = ['Business Travel', 'Waste', 'Water Usage'];

  // emission factors (kg CO2e per unit → stored as factor, amount in original units)
  const factors = {
    'Natural Gas':       2.204,  // kg CO2e per m3
    'Diesel Generator':  2.68,   // kg CO2e per litre
    'Company Vehicles':  0.171,  // kg CO2e per km
    'Grid Electricity':  0.233,  // kg CO2e per kWh
    'Business Travel':   0.255,  // kg CO2e per km
    'Waste':             0.587,  // kg CO2e per kg
    'Water Usage':       0.149,  // kg CO2e per m3
  };

  const units = {
    'Natural Gas':       'm³',
    'Diesel Generator':  'litres',
    'Company Vehicles':  'km',
    'Grid Electricity':  'kWh',
    'Business Travel':   'km',
    'Waste':             'kg',
    'Water Usage':       'm³',
  };

  // Base monthly amounts
  const baseAmounts = {
    'Natural Gas':       4200,
    'Diesel Generator':  800,
    'Company Vehicles':  12000,
    'Grid Electricity':  45000,
    'Business Travel':   8000,
    'Waste':             2400,
    'Water Usage':       180,
  };

  const entries = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const allCats = [...scope1Categories, ...scope2Categories, ...scope3Categories];
    for (const cat of allCats) {
      const scope = scope1Categories.includes(cat) ? 1
                  : scope2Categories.includes(cat) ? 2 : 3;
      // Add slight monthly variance ±10%
      const variance = 0.9 + Math.random() * 0.2;
      const amount   = Math.round(baseAmounts[cat] * variance * 10) / 10;
      entries.push([companyId, userId, cat, scope, amount, units[cat], period, factors[cat], 'upload', 'DEFRA 2023', 'UK']);
    }
  }

  for (const e of entries) {
    await db.query(
      `INSERT INTO emissions_entries
         (company_id, user_id, category, scope, amount, unit, period, emission_factor, source, factor_source, factor_jurisdiction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      e
    );
  }

  // Seed BRSR submission stub
  await db.query(
    `INSERT INTO brsr_submissions (company_id, financial_year, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (company_id, financial_year) DO NOTHING`,
    [companyId, '2025-26', 'draft']
  );

  // Seed framework statuses
  const frameworks = [
    { framework: 'GRI',   status: 'partial',  details: '8 of 13 disclosures complete' },
    { framework: 'TCFD',  status: 'aligned',  details: 'All 4 pillars reported' },
    { framework: 'SASB',  status: 'not_started', details: null },
    { framework: 'LOCAL', status: 'partial',  details: 'Submission due Q3 2026' },
  ];
  for (const f of frameworks) {
    await db.query(
      `INSERT INTO framework_status (company_id, framework, status, details)
       VALUES ($1,$2,$3,$4) ON CONFLICT (company_id, framework) DO NOTHING`,
      [companyId, f.framework, f.status, f.details]
    );
  }

  console.log('Demo seed complete.');
  console.log('  Company : GreenTech Solutions Ltd');
  console.log('  Email   : demo@cleartrace.io');
  console.log('  Password: demo1234');
  await db.end();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
