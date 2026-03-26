const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const db          = require('../db/database');
const requireRole = require('../middleware/roles');

// ── Lazy migration ────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../db/team_migration.sql'), 'utf8');
  await db.query(sql);
  migrated = true;
}

// ── GET /api/team ─────────────────────────────────────────────────────────────
// Returns all members + pending (unexpired, unaccepted) invites.
// Accessible by admin and editor (viewers see the page read-only via frontend).
router.get('/', async (req, res) => {
  await ensureMigrated();
  try {
    const [membersRes, invitesRes] = await Promise.all([
      db.query(
        `SELECT id, email, COALESCE(name, '') AS name, role, created_at
           FROM users
          WHERE company_id = $1
          ORDER BY created_at ASC`,
        [req.companyId]
      ),
      db.query(
        `SELECT id, email, role, created_at, expires_at
           FROM team_invites
          WHERE company_id = $1
            AND accepted_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at DESC`,
        [req.companyId]
      ),
    ]);
    res.json({ members: membersRes.rows, pending: invitesRes.rows });
  } catch (err) {
    console.error('GET /api/team error:', err.message);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// ── POST /api/team/invite ─────────────────────────────────────────────────────
// Admin can invite any role. Editor can only invite viewer.
// If email already exists in the system (different company) → move them in directly.
// If email is unknown → create a pending team_invite row.
router.post('/invite', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const { email, role = 'viewer' } = req.body;

  if (!email) return res.status(400).json({ error: 'email is required' });
  const normalised = email.toLowerCase().trim();

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer.' });
  }
  if (req.role === 'editor' && role !== 'viewer') {
    return res.status(403).json({ error: 'Editors can only invite viewers.' });
  }

  try {
    // Check if email exists in users table
    const existing = await db.query(
      'SELECT id, company_id FROM users WHERE email = $1',
      [normalised]
    );

    if (existing.rows.length > 0) {
      const u = existing.rows[0];
      if (u.company_id === req.companyId) {
        return res.status(409).json({ error: 'This email is already a member of your team.' });
      }
      // Existing user from another company — move them in
      await db.query(
        'UPDATE users SET company_id = $1, role = $2 WHERE id = $3',
        [req.companyId, role, u.id]
      );
      return res.json({ added: true, email: normalised, role });
    }

    // Unknown email — create pending invite (replace any stale one)
    await db.query(
      'DELETE FROM team_invites WHERE company_id = $1 AND email = $2',
      [req.companyId, normalised]
    );
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO team_invites (company_id, invited_by, email, role, token)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.companyId, req.userId, normalised, role, token]
    );

    res.status(201).json({ invited: true, email: normalised, role });
  } catch (err) {
    console.error('POST /api/team/invite error:', err.message);
    res.status(500).json({ error: 'Failed to process invite' });
  }
});

// ── PATCH /api/team/:userId/role ──────────────────────────────────────────────
// Admin: can change anyone.
// Editor: can only change viewers, and cannot promote above viewer.
router.patch('/:userId/role', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();
  const targetId = parseInt(req.params.userId);
  const { role }  = req.body;

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  try {
    const targetRes = await db.query(
      'SELECT id, role FROM users WHERE id = $1 AND company_id = $2',
      [targetId, req.companyId]
    );
    if (!targetRes.rows.length) return res.status(404).json({ error: 'User not found.' });

    const target = targetRes.rows[0];

    if (req.role === 'editor') {
      if (target.role !== 'viewer') {
        return res.status(403).json({ error: "Editors can only change a viewer's role." });
      }
      if (role !== 'viewer') {
        return res.status(403).json({ error: 'Editors cannot promote users above viewer.' });
      }
    }

    await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3',
      [role, targetId, req.companyId]
    );

    res.json({ updated: true, userId: targetId, role });
  } catch (err) {
    console.error('PATCH /api/team/:userId/role error:', err.message);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ── DELETE /api/team/:userId ──────────────────────────────────────────────────
// Admin only. Cannot remove yourself.
router.delete('/:userId', requireRole('admin'), async (req, res) => {
  await ensureMigrated();
  const targetId = parseInt(req.params.userId);

  if (targetId === req.userId) {
    return res.status(400).json({ error: 'You cannot remove yourself from the team.' });
  }

  try {
    const r = await db.query(
      'DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id',
      [targetId, req.companyId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });

    res.json({ removed: true });
  } catch (err) {
    console.error('DELETE /api/team/:userId error:', err.message);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// ── DELETE /api/team/invites/:id ──────────────────────────────────────────────
// Cancel a pending invite. Admin only.
router.delete('/invites/:id', requireRole('admin'), async (req, res) => {
  await ensureMigrated();
  const inviteId = parseInt(req.params.id);
  try {
    const r = await db.query(
      'DELETE FROM team_invites WHERE id = $1 AND company_id = $2 RETURNING id',
      [inviteId, req.companyId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Invite not found.' });
    res.json({ cancelled: true });
  } catch (err) {
    console.error('DELETE /api/team/invites/:id error:', err.message);
    res.status(500).json({ error: 'Failed to cancel invite' });
  }
});

module.exports = router;
