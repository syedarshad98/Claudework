/**
 * demoGuard — blocks state-changing requests for demo accounts.
 *
 * Only fires on POST, PATCH, PUT, DELETE.
 * Caches the is_demo flag on req.company to avoid extra DB queries
 * when other middleware has already loaded the company row.
 *
 * Fails closed: if the is_demo lookup itself errors, we don't know whether
 * this tenant is a demo account, so the write is denied rather than let
 * through. A transient DB blip should degrade to "temporarily unavailable"
 * for writes, not silently drop the one protection this middleware exists
 * to provide.
 */

const db = require('../db/database');

async function demoGuard(req, res, next) {
  // Only block write operations
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return next();
  }

  try {
    // Use cached value if a prior middleware already loaded it
    if (req.company && req.company.is_demo !== undefined) {
      if (req.company.is_demo) {
        return res.status(403).json({
          error:   'Demo mode',
          message: 'Data cannot be modified in the demo account.',
        });
      }
      return next();
    }

    const result = await db.query(
      'SELECT is_demo FROM companies WHERE id = $1',
      [req.companyId]
    );

    const isDemo = result.rows[0]?.is_demo ?? false;

    // Cache on req.company for downstream use
    if (!req.company) req.company = {};
    req.company.is_demo = isDemo;

    if (isDemo) {
      return res.status(403).json({
        error:   'Demo mode',
        message: 'Data cannot be modified in the demo account.',
      });
    }

    next();
  } catch (err) {
    // Fail closed — if we can't confirm this tenant isn't a demo account,
    // deny the write rather than let it through.
    console.error('demoGuard error:', err.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

module.exports = demoGuard;
