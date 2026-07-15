'use strict';

/**
 * Lightweight liveness probe for deploy scripts and uptime monitors.
 * Unauthenticated; does not touch sessions or rate-limit buckets when
 * mounted on the root app (outside the /api routers).
 */
function healthHandler(dbApi) {
  return function health(req, res) {
    try {
      dbApi.db.prepare('SELECT 1 AS ok').get();
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('health check failed:', err && err.message);
      res.status(503).json({ ok: false });
    }
  };
}

module.exports = { healthHandler };
