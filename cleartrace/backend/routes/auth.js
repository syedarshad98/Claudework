const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db/database');

function makeToken(userId, companyId, role) {
  return jwt.sign(
    { userId, companyId, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
// Creates a new company + admin user in one step
router.post('/register', async (req, res) => {
  const { companyName, industry, country, email, password } = req.body;

  if (!companyName || !email || !password) {
    return res.status(400).json({ error: 'companyName, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const compRes = await client.query(
      'INSERT INTO companies (name, industry, country) VALUES ($1, $2, $3) RETURNING id',
      [companyName, industry || null, country || null]
    );
    const companyId = compRes.rows[0].id;

    const hash    = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      "INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id, role",
      [companyId, email.toLowerCase().trim(), hash]
    );
    const user = userRes.rows[0];

    // Seed default framework rows for this company
    for (const fw of ['GRI', 'TCFD', 'SASB', 'LOCAL']) {
      await client.query(
        'INSERT INTO framework_status (company_id, framework, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [companyId, fw, 'not_started']
      );
    }

    await client.query('COMMIT');

    const token = makeToken(user.id, companyId, user.role);
    res.status(201).json({ token, companyName, email: email.toLowerCase().trim(), role: user.role });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await db.query(
      `SELECT u.id, u.password_hash, u.role, u.company_id, c.name AS company_name
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user  = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = makeToken(user.id, user.company_id, user.role);
    res.json({
      token,
      companyName: user.company_name,
      email: email.toLowerCase().trim(),
      role: user.role
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
