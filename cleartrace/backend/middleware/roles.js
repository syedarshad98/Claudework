/**
 * requireRole(...roles) — Express middleware factory.
 * Returns 403 if req.role is not in the allowed list.
 *
 * Usage:
 *   router.post('/foo', requireRole('admin','editor'), handler)
 */
module.exports = function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.role || !roles.includes(req.role)) {
      return res.status(403).json({
        error: `Access denied. Requires role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
};
