/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — audit helper
   Call logAction() after any data-mutating operation.
   ───────────────────────────────────────────────────────────────────────────── */

const db = require('../db/database');

/**
 * @param {object} opts
 * @param {number}  opts.companyId
 * @param {number}  opts.userId
 * @param {string}  opts.userEmail
 * @param {string}  opts.action       create | edit | delete | approve | lock | unlock
 * @param {string}  [opts.recordType] default 'emission'
 * @param {number}  [opts.recordId]
 * @param {object}  [opts.oldValues]
 * @param {object}  [opts.newValues]
 * @param {string}  [opts.ip]
 */
async function logAction(opts) {
  const {
    companyId, userId, userEmail = '', action,
    recordType = 'emission', recordId = null,
    oldValues = null, newValues = null, ip = null,
  } = opts;

  try {
    await db.query(
      `INSERT INTO audit_log
         (company_id, user_id, user_email, action, record_type, record_id,
          old_values, new_values, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        companyId, userId, userEmail, action, recordType, recordId,
        oldValues  ? JSON.stringify(oldValues)  : null,
        newValues  ? JSON.stringify(newValues)  : null,
        ip,
      ]
    );
  } catch (err) {
    // Audit failures must never break the primary operation
    console.error('Audit log error:', err.message);
  }
}

function getIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

module.exports = { logAction, getIp };
