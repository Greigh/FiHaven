/* ═══════════════════════════════════════════════════════════
   dataDir.js — the one directory holding server-side writable
   state (cleartab.db, the mfa.key fallback). Resolved in a
   single place so the database and its encryption key can
   never drift into different directories.
   FIHAVEN_DATA_DIR overrides it so a container can persist
   everything with one volume; the default is the historical
   <repo>/data layout.
═════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');

module.exports = process.env.FIHAVEN_DATA_DIR
  ? path.resolve(process.env.FIHAVEN_DATA_DIR)
  : path.join(__dirname, '..', 'data');
