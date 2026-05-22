const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const db         = require('../db/database');
const supabase   = require('../lib/supabase');
const requireRole = require('../middleware/roles');

const BUCKET = 'brsr-evidence';

const ALLOWED_EXTS = ['pdf', 'xlsx', 'xls', 'csv', 'jpg', 'jpeg', 'png'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (ALLOWED_EXTS.includes(ext)) cb(null, true);
    else cb(new Error(`Only ${ALLOWED_EXTS.join(', ')} files are supported`));
  }
});

// ── Lazy migration ─────────────────────────────────────────────────────────────
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../db/brsr_migration.sql'), 'utf8');
  await db.query(sql);
  migrated = true;
}

// Sanitise a path segment so it cannot escape the bucket prefix
function sanitiseSegment(s) {
  return String(s).replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
}

// ── POST /api/brsr/evidence/:submissionId/:fieldRef ───────────────────────────
router.post(
  '/evidence/:submissionId/:fieldRef',
  requireRole('admin', 'editor'),
  upload.single('file'),
  async (req, res) => {
    await ensureMigrated();

    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const submissionId = parseInt(req.params.submissionId, 10);
    const fieldRef     = sanitiseSegment(req.params.fieldRef);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submissionId' });

    try {
      const subRes = await db.query(
        'SELECT id, status FROM brsr_submissions WHERE id = $1 AND company_id = $2',
        [submissionId, req.companyId]
      );
      if (!subRes.rows.length) {
        return res.status(403).json({ error: 'Submission not found or access denied' });
      }
      if (subRes.rows[0].status === 'locked') {
        return res.status(403).json({ error: 'Submission is locked and cannot accept new evidence' });
      }

      const safeName    = sanitiseSegment(req.file.originalname);
      const storagePath = `${req.companyId}/brsr/${submissionId}/${fieldRef}/${Date.now()}-${safeName}`;

      const { error: storageErr } = await supabase().storage
        .from(BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (storageErr) {
        console.error('Supabase storage upload error:', storageErr.message);
        return res.status(500).json({ error: 'File upload failed: ' + storageErr.message });
      }

      const insertRes = await db.query(
        `INSERT INTO brsr_evidence_vault
           (company_id, submission_id, field_ref, file_name, file_url,
            file_size_bytes, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          req.companyId, submissionId, req.params.fieldRef,
          req.file.originalname, storagePath,
          req.file.size, req.file.mimetype, req.userId
        ]
      );

      res.status(201).json(insertRes.rows[0]);
    } catch (err) {
      console.error('POST /api/brsr/evidence error:', err.message);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// ── GET /api/brsr/evidence/:submissionId ──────────────────────────────────────
router.get('/evidence/:submissionId', async (req, res) => {
  await ensureMigrated();

  const submissionId = parseInt(req.params.submissionId, 10);
  if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid submissionId' });

  try {
    const subRes = await db.query(
      'SELECT id FROM brsr_submissions WHERE id = $1 AND company_id = $2',
      [submissionId, req.companyId]
    );
    if (!subRes.rows.length) {
      return res.status(403).json({ error: 'Submission not found or access denied' });
    }

    const { rows } = await db.query(
      'SELECT * FROM brsr_evidence_vault WHERE submission_id = $1 ORDER BY uploaded_at ASC',
      [submissionId]
    );

    const grouped = {};
    for (const row of rows) {
      const { data } = await supabase().storage
        .from(BUCKET)
        .createSignedUrl(row.file_url, 3600);
      row.signed_url = data?.signedUrl || null;

      if (!grouped[row.field_ref]) grouped[row.field_ref] = [];
      grouped[row.field_ref].push(row);
    }

    res.json(grouped);
  } catch (err) {
    console.error('GET /api/brsr/evidence error:', err.message);
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

// ── DELETE /api/brsr/evidence/:evidenceId ─────────────────────────────────────
router.delete('/evidence/:evidenceId', requireRole('admin', 'editor'), async (req, res) => {
  await ensureMigrated();

  const evidenceId = parseInt(req.params.evidenceId, 10);
  if (isNaN(evidenceId)) return res.status(400).json({ error: 'Invalid evidenceId' });

  try {
    const evRes = await db.query(
      'SELECT * FROM brsr_evidence_vault WHERE id = $1 AND company_id = $2',
      [evidenceId, req.companyId]
    );
    if (!evRes.rows.length) {
      return res.status(403).json({ error: 'Evidence not found or access denied' });
    }

    const row = evRes.rows[0];

    const { error: storageErr } = await supabase().storage
      .from(BUCKET)
      .remove([row.file_url]);

    if (storageErr) {
      console.error('Supabase storage delete error:', storageErr.message);
      return res.status(500).json({ error: 'Failed to delete file from storage' });
    }

    await db.query('DELETE FROM brsr_evidence_vault WHERE id = $1', [evidenceId]);

    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/brsr/evidence error:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
