/**
 * demoGuard — blocks state-changing requests for demo accounts.
 *
 * Only fires on POST, PATCH, PUT, DELETE.
 * Caches the is_demo flag on req.company to avoid extra DB queries
 * when other middleware has already loaded the company row.
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
    // Fail open — don't block legitimate users if DB is momentarily unavailable
    console.error('demoGuard error:', err.message);
    next();
  }
}

module.exports = demoGuard;
