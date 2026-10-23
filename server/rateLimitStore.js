/* ═══════════════════════════════════════════════════════════
   rateLimitStore.js — express-rate-limit Store backed by SQLite.

   The default MemoryStore keeps counters in process memory, so under a
   multi-process deploy (PM2 cluster mode) every tier's effective limit is
   multiplied by the worker count. These buckets live in the shared SQLite
   file instead: better-sqlite3 is synchronous and its write transaction
   serializes at the database lock, so N workers increment the same row and
   each sees the exact total.
═════════════════════════════════════════════════════════════════ */

'use strict';

const dbApi = require('./db');

class SqliteRateLimitStore {
  // `prefix` namespaces the tiers (global/api/auth/unsubscribe) so an IP's
  // hit on one doesn't count against another.
  constructor(prefix) {
    this.prefix = `${prefix}:`;
    this.windowMs = 60 * 1000;
  }

  // express-rate-limit hands the limiter's windowMs here.
  init(options) {
    if (options && options.windowMs) this.windowMs = options.windowMs;
  }

  async increment(key) {
    const row = dbApi.rateLimitHit(this.prefix + key, Date.now(), this.windowMs);
    return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
  }

  async decrement(key) {
    dbApi.rateLimitDecrement(this.prefix + key);
  }

  async resetKey(key) {
    dbApi.rateLimitReset(this.prefix + key);
  }
}

module.exports = { SqliteRateLimitStore };
