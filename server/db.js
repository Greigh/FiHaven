/* ═══════════════════════════════════════════════════════════
   db.js — SQLite connection, schema init, and prepared statements
   The database file lives in ../data/cleartab.db and is created
   on first run. Schema DDL is idempotent (CREATE TABLE IF NOT
   EXISTS), so requiring this module also "migrates" a fresh db.
═════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const mfa = require('./mfa');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.FIHAVEN_TEST_DB_PATH
  ? path.resolve(process.env.FIHAVEN_TEST_DB_PATH)
  : path.join(DATA_DIR, 'cleartab.db');

if (process.env.FIHAVEN_TEST_DB_PATH) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER,
    name          TEXT,
    ical_token    TEXT,
    role          TEXT NOT NULL DEFAULT 'user'   -- 'user' | 'admin'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    user_agent  TEXT,
    ip          TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  -- Single-use, expiring tokens delivered by email for email
  -- verification, password reset, and 2FA recovery. The raw token only
  -- ever lives in the emailed link; we persist its SHA-256 hash.
  CREATE TABLE IF NOT EXISTS email_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     TEXT NOT NULL,        -- 'verify-email' | 'password-reset' | 'recover-2fa'
    token_hash  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash);

  -- One-time Android OAuth handoffs (Custom Tab → App Link). Stores the
  -- provider id_token under a random code so JWTs are never put in a
  -- hijackable custom-scheme URL. Codes are hashed at rest.
  CREATE TABLE IF NOT EXISTS oauth_handoffs (
    code_hash   TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,        -- 'apple' | 'google'
    id_token    TEXT NOT NULL,
    name        TEXT,
    state       TEXT,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_expires ON oauth_handoffs(expires_at);

  CREATE TABLE IF NOT EXISTS user_data (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Per-user TOTP / backup-code state. Each user has at most one
  -- TOTP secret; backup codes live in a sibling table so we can mark
  -- them used individually.
  CREATE TABLE IF NOT EXISTS user_totp (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_enc     TEXT NOT NULL,
    enabled_at     INTEGER,
    last_used_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_backup_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    used_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_backup_codes_user ON user_backup_codes(user_id);

  -- WebAuthn / FIDO2 passkeys. credential_id is base64url.
  -- public_key is the COSE-encoded public key as base64.
  -- counter is the FIDO authenticator signature counter for replay
  -- protection. transports is a JSON array (e.g. ["internal","hybrid"]).
  CREATE TABLE IF NOT EXISTS user_passkeys (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key    TEXT NOT NULL,
    counter       INTEGER NOT NULL DEFAULT 0,
    transports    TEXT,
    name          TEXT,
    created_at    INTEGER NOT NULL,
    last_used_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_passkeys_user ON user_passkeys(user_id);

  -- Short-lived auth challenges: WebAuthn registration / login, and
  -- post-password "MFA pending" tokens. Pruned on lookup; expired
  -- rows can be left until the next housekeeping pass.
  CREATE TABLE IF NOT EXISTS mfa_challenges (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    payload    TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON mfa_challenges(expires_at);

  -- Store subscription / purchase records (Apple StoreKit, Google Play).
  -- One row per store transaction, keyed by the store's stable id
  -- (Apple originalTransactionId, Google purchaseToken). The user's
  -- effective Pro entitlement is DERIVED from the active rows here plus
  -- any active promo grants — see server/billing.js.
  CREATE TABLE IF NOT EXISTS subscriptions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform     TEXT NOT NULL,            -- 'apple' | 'google'
    product_id   TEXT NOT NULL,
    txn_id       TEXT NOT NULL,            -- originalTransactionId / purchaseToken
    status       TEXT NOT NULL,            -- 'active' | 'expired' | 'refunded' | 'grace'
    expires_at   INTEGER,                  -- epoch ms; null = non-expiring
    environment  TEXT,                     -- 'Production' | 'Sandbox'
    auto_renew   INTEGER NOT NULL DEFAULT 1,
    raw          TEXT,                     -- decoded payload JSON, for audit
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    UNIQUE(platform, txn_id)
  );
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

  -- Custom, server-issued promo codes. kind:
  --   'free_sub'    — grants Pro directly for grant_days (null = lifetime),
  --                   no store purchase involved.
  --   'store_offer' — maps to a NATIVE store discount; offer_id is the
  --                   Apple offer-code / Google promo id the client
  --                   redeems through the store. The server only tracks it.
  CREATE TABLE IF NOT EXISTS promo_codes (
    code            TEXT PRIMARY KEY COLLATE NOCASE,
    kind            TEXT NOT NULL,         -- 'free_sub' | 'store_offer'
    grant_days      INTEGER,              -- free_sub: days granted; null = lifetime
    product_id      TEXT,                 -- product the grant/offer maps to
    offer_id        TEXT,                 -- store_offer: store offer identifier
    platform        TEXT,                 -- optional 'apple'|'google' restriction
    max_redemptions INTEGER,              -- null = unlimited
    redeemed_count  INTEGER NOT NULL DEFAULT 0,
    expires_at      INTEGER,              -- code expiry (epoch ms); null = never
    note            TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL
  );

  -- Redemption ledger: one row per (code, user). Enforces one redemption
  -- per user and records when a free_sub grant lapses.
  CREATE TABLE IF NOT EXISTS promo_redemptions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT NOT NULL COLLATE NOCASE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at      INTEGER NOT NULL,
    grant_expires_at INTEGER,             -- free_sub: when the grant lapses; null = lifetime
    UNIQUE(code, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id);

  -- Plaid (optional, Pro-gated bank linking). One row per linked
  -- "item" (a bank login). access_token is a bank credential, so it
  -- is stored ENCRYPTED (AES-256-GCM via mfa.js) — never in plaintext.
  -- The cursor column holds the transactions-sync cursor; status
  -- reflects the last known item health.
  CREATE TABLE IF NOT EXISTS plaid_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id           TEXT NOT NULL UNIQUE,        -- Plaid item_id
    access_token_enc  TEXT NOT NULL,               -- encrypted access_token
    institution_id    TEXT,
    institution_name  TEXT,
    status            TEXT NOT NULL DEFAULT 'active', -- 'active'|'login_required'|'error'
    cursor            TEXT,                         -- transactions sync cursor
    error             TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id);

  -- Accounts under each item, with the most recent balance snapshot.
  CREATE TABLE IF NOT EXISTS plaid_accounts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    item_pk           INTEGER NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
    account_id        TEXT NOT NULL UNIQUE,         -- Plaid account_id
    name              TEXT,
    official_name     TEXT,
    mask              TEXT,
    type              TEXT,
    subtype           TEXT,
    current_balance   REAL,
    available_balance REAL,
    limit_balance     REAL,
    iso_currency      TEXT,
    enc               TEXT,                         -- AES-256-GCM blob of all consumer fields
    updated_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_plaid_accounts_item ON plaid_accounts(item_pk);

  -- Federated sign-in identities (Sign in with Apple / Google). One row
  -- per (provider, subject); a user may link several. OAuth-only accounts
  -- carry a sentinel password_hash so password login simply never matches.
  CREATE TABLE IF NOT EXISTS oauth_identities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,                -- 'google' | 'apple'
    subject     TEXT NOT NULL,                -- provider's stable user id ("sub")
    created_at  INTEGER NOT NULL,
    UNIQUE(provider, subject)
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id);

  -- Shared households (couples / families). Each household groups members
  -- who keep their own login + Pro status. Phase 1 stores membership and
  -- invites only; the shared per-entity data store arrives in Phase 2.
  CREATE TABLE IF NOT EXISTS households (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS household_members (
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
    share_prefs  TEXT,                            -- JSON selective-sharing prefs (Phase 2)
    joined_at    INTEGER NOT NULL,
    PRIMARY KEY (household_id, user_id)
  );
  -- A user belongs to at most one household (enforced at the DB level).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);

  -- Pending email invites. Like email_tokens, only the SHA-256 hash of the
  -- raw token is stored; the raw token lives only in the emailed link.
  CREATE TABLE IF NOT EXISTS household_invites (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    email        TEXT NOT NULL COLLATE NOCASE,
    token_hash   TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member',
    created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    accepted_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_household_invites_hh ON household_invites(household_id);
  CREATE INDEX IF NOT EXISTS idx_household_invites_email ON household_invites(email);

  -- The shared per-entity store (Phase 2). Each row is one shared item
  -- (a bill, card, goal, …) contributed by a member. Per-entity rows let
  -- members merge changes and share selectively; tombstones (deleted = 1)
  -- are kept so clients can sync deletes. id is the item's own stable id.
  CREATE TABLE IF NOT EXISTS household_entities (
    household_id  INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,           -- 'bill' | 'card' | 'goal' | 'account' | 'transaction'
    id            TEXT NOT NULL,           -- the item's own id
    data          TEXT NOT NULL,           -- JSON of the item
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    updated_at    INTEGER NOT NULL,
    updated_by    INTEGER NOT NULL,
    deleted       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (household_id, kind, id)
  );
  CREATE INDEX IF NOT EXISTS idx_household_entities_sync ON household_entities(household_id, updated_at);

  -- Append-only delta log for live collaboration (Phase 3). Every shared-
  -- entity change appends a row; the SSE stream replays rows after a
  -- client's last-seen seq, then streams new ones live.
  CREATE TABLE IF NOT EXISTS household_events (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    payload      TEXT NOT NULL,           -- JSON { entity }
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_household_events_hh ON household_events(household_id, seq);

  -- Registered device tokens for server push (APNs / FCM).
  CREATE TABLE IF NOT EXISTS push_devices (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform   TEXT NOT NULL,              -- 'ios' | 'android'
    token      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, token)
  );
  CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);

  -- Global credit-card reward catalog (admin-editable). Seeded from
  -- cardPresets.seed.json on first empty table; web ranking loads this
  -- via GET /api/card-presets (falls back to bundled client presets).
  CREATE TABLE IF NOT EXISTS card_presets (
    id                 TEXT PRIMARY KEY,
    issuer             TEXT NOT NULL,
    name               TEXT NOT NULL,
    network            TEXT NOT NULL,
    reward_base        REAL NOT NULL DEFAULT 1,
    reward_categories  TEXT NOT NULL DEFAULT '{}',
    point_value        REAL,
    rotating_rate      REAL,
    rotating_pool      TEXT,
    updated_at         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_card_presets_issuer ON card_presets(issuer COLLATE NOCASE);
`);

// Idempotent column additions for older databases created before
// these features existed. PRAGMA table_info returns each column;
// we only ALTER when missing.
(function migrateUserColumns() {
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!cols.includes('name'))               db.exec(`ALTER TABLE users ADD COLUMN name TEXT`);
  if (!cols.includes('ical_token'))         db.exec(`ALTER TABLE users ADD COLUMN ical_token TEXT`);
  if (!cols.includes('email_mfa_enabled'))  db.exec(`ALTER TABLE users ADD COLUMN email_mfa_enabled INTEGER DEFAULT 0`);
  if (!cols.includes('role'))               db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  if (!cols.includes('email_verified'))     db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
  if (!cols.includes('email_verified_at'))  db.exec(`ALTER TABLE users ADD COLUMN email_verified_at INTEGER`);
  // Admin soft-suspend: blocks login + API without deleting data.
  if (!cols.includes('suspended'))          db.exec(`ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0`);
  if (!cols.includes('suspended_at'))       db.exec(`ALTER TABLE users ADD COLUMN suspended_at INTEGER`);
  if (!cols.includes('suspended_reason'))   db.exec(`ALTER TABLE users ADD COLUMN suspended_reason TEXT`);
  if (!cols.includes('onboarded')) {
    db.exec(`ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0`);
    // Grandfather every existing account so only NEW signups get the
    // first-run onboarding flow.
    db.exec(`UPDATE users SET onboarded = 1`);
  }
  // Scheduler de-dup stamps: the local day a reminder last went out, and
  // the local month a summary last went out, so neither double-sends.
  if (!cols.includes('last_reminder_day'))  db.exec(`ALTER TABLE users ADD COLUMN last_reminder_day TEXT`);
  if (!cols.includes('last_summary_month')) db.exec(`ALTER TABLE users ADD COLUMN last_summary_month TEXT`);
  // The local day autopay items were last auto-marked, so it runs once/day.
  if (!cols.includes('last_autopay_day'))   db.exec(`ALTER TABLE users ADD COLUMN last_autopay_day TEXT`);
  // The local ISO week (YYYY-Www) the weekly digest last went out.
  if (!cols.includes('last_digest_week'))   db.exec(`ALTER TABLE users ADD COLUMN last_digest_week TEXT`);
  // The local day trial-ending reminders last went out.
  if (!cols.includes('last_trial_reminder_day')) db.exec(`ALTER TABLE users ADD COLUMN last_trial_reminder_day TEXT`);
  // The local day card-linked-offer expiry reminders last went out.
  if (!cols.includes('last_offer_reminder_day')) db.exec(`ALTER TABLE users ADD COLUMN last_offer_reminder_day TEXT`);
})();

(function migratePlaidItemColumns() {
  const cols = db.prepare(`PRAGMA table_info(plaid_items)`).all().map((c) => c.name);
  // When we last actually pulled from Plaid for this item. Drives the sync
  // throttle so an app-open sync can't hammer Plaid on every launch.
  // `updated_at` can't stand in — a status/cursor write bumps it too.
  if (!cols.includes('last_sync_at')) db.exec(`ALTER TABLE plaid_items ADD COLUMN last_sync_at INTEGER`);
})();

// Encrypt-at-rest for Plaid account data: add the `enc` blob column to
// databases created before it existed. Account names/masks/balances are now
// stored only as an AES-256-GCM ciphertext blob (see routes/plaid.js); the
// legacy plaintext columns remain for read-fallback but are no longer written.
(function migratePlaidColumns() {
  const cols = db.prepare(`PRAGMA table_info(plaid_accounts)`).all().map((c) => c.name);
  if (!cols.includes('enc')) db.exec(`ALTER TABLE plaid_accounts ADD COLUMN enc TEXT`);
})();

// Unique index for iCal token lookups (the column allows NULL so
// many rows can share NULL without a clash).
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL`);

/* ── prepared statements ─────────────────────────────────────── */

const stmt = {
  insertUser: db.prepare(
    `INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)`
  ),
  // Create an account with the email already verified (used by OAuth, where
  // the provider has confirmed the address).
  insertVerifiedUser: db.prepare(
    `INSERT INTO users (email, password_hash, created_at, email_verified, email_verified_at)
     VALUES (?, ?, ?, 1, ?)`
  ),
  findOAuthIdentity: db.prepare(
    `SELECT * FROM oauth_identities WHERE provider = ? AND subject = ?`
  ),
  insertOAuthIdentity: db.prepare(
    `INSERT OR IGNORE INTO oauth_identities (user_id, provider, subject, created_at) VALUES (?, ?, ?, ?)`
  ),
  listOAuthIdentities: db.prepare(
    `SELECT provider, subject, created_at FROM oauth_identities WHERE user_id = ?`
  ),
  findUserByEmail: db.prepare(
    `SELECT id, email, password_hash, name, email_mfa_enabled, email_verified, onboarded, suspended, suspended_at, suspended_reason FROM users WHERE email = ?`
  ),
  findUserById: db.prepare(
    `SELECT id, email, password_hash, name, ical_token, email_mfa_enabled, role, email_verified, onboarded, created_at, suspended, suspended_at, suspended_reason FROM users WHERE id = ?`
  ),
  setEmailMfa: db.prepare(`UPDATE users SET email_mfa_enabled = ? WHERE id = ?`),
  findUserByIcalToken: db.prepare(
    `SELECT id, email, name FROM users WHERE ical_token = ?`
  ),
  touchLastLogin: db.prepare(
    `UPDATE users SET last_login_at = ? WHERE id = ?`
  ),
  updateUserPassword: db.prepare(
    `UPDATE users SET password_hash = ? WHERE id = ?`
  ),
  updateUserEmail: db.prepare(
    `UPDATE users SET email = ?, email_verified = 0, email_verified_at = NULL WHERE id = ?`
  ),
  updateUserName: db.prepare(`UPDATE users SET name = ? WHERE id = ?`),
  updateUserIcalToken: db.prepare(`UPDATE users SET ical_token = ? WHERE id = ?`),
  deleteUser: db.prepare(`DELETE FROM users WHERE id = ?`),
  setUserRole: db.prepare(`UPDATE users SET role = ? WHERE id = ?`),
  setRoleByEmail: db.prepare(`UPDATE users SET role = ? WHERE email = ?`),
  setVerifiedByEmail: db.prepare(
    `UPDATE users SET email_verified = 1, email_verified_at = ? WHERE email = ? AND email_verified = 0`
  ),
  listUsers: db.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at,
            u.suspended, u.suspended_at, u.suspended_reason,
            ud.updated_at AS data_updated_at
       FROM users u
       LEFT JOIN user_data ud ON ud.user_id = u.id
      WHERE u.email LIKE ? OR COALESCE(u.name, '') LIKE ?
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`
  ),
  countUsers: db.prepare(
    `SELECT COUNT(*) AS n FROM users u
      WHERE u.email LIKE ? OR COALESCE(u.name, '') LIKE ?`
  ),
  setUserSuspended: db.prepare(
    `UPDATE users SET suspended = ?, suspended_at = ?, suspended_reason = ? WHERE id = ?`
  ),
  deleteCompSubscription: db.prepare(
    `DELETE FROM subscriptions WHERE platform = 'comp' AND user_id = ?`
  ),
  insertSession: db.prepare(
    `INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at, user_agent, ip)
     VALUES (@id, @user_id, @csrf_token, @created_at, @expires_at, @user_agent, @ip)`
  ),
  findSession: db.prepare(
    `SELECT s.id, s.user_id, s.csrf_token, s.expires_at, u.email, u.name, u.role, u.email_verified, u.onboarded,
            u.suspended, u.suspended_at, u.suspended_reason
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`
  ),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE id = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),
  deleteOtherSessions: db.prepare(
    `DELETE FROM sessions WHERE user_id = ? AND id != ?`
  ),
  deleteUserSessions: db.prepare(`DELETE FROM sessions WHERE user_id = ?`),

  /* ── Email tokens (verify / reset / recover) ───────────────── */
  insertEmailToken: db.prepare(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, created_at, expires_at)
     VALUES (@user_id, @purpose, @token_hash, @created_at, @expires_at)`
  ),
  findEmailTokenByHash: db.prepare(
    `SELECT id, user_id, purpose, expires_at, used_at FROM email_tokens WHERE token_hash = ?`
  ),
  markEmailTokenUsed: db.prepare(`UPDATE email_tokens SET used_at = ? WHERE id = ?`),
  deleteEmailTokensByPurpose: db.prepare(
    `DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?`
  ),
  insertOAuthHandoff: db.prepare(
    `INSERT INTO oauth_handoffs
       (code_hash, provider, id_token, name, state, created_at, expires_at)
     VALUES (@code_hash, @provider, @id_token, @name, @state, @created_at, @expires_at)`
  ),
  findOAuthHandoffByHash: db.prepare(
    `SELECT code_hash, provider, id_token, name, state, expires_at, used_at
       FROM oauth_handoffs WHERE code_hash = ?`
  ),
  markOAuthHandoffUsed: db.prepare(
    `UPDATE oauth_handoffs SET used_at = ? WHERE code_hash = ? AND used_at IS NULL`
  ),
  deleteExpiredOAuthHandoffs: db.prepare(
    `DELETE FROM oauth_handoffs WHERE expires_at < ? OR used_at IS NOT NULL`
  ),
  setEmailVerified: db.prepare(
    `UPDATE users SET email_verified = 1, email_verified_at = ? WHERE id = ?`
  ),
  setOnboarded: db.prepare(`UPDATE users SET onboarded = 1 WHERE id = ?`),

  /* ── Scheduler (reminders / summaries) ─────────────────────── */
  allUsersWithData: db.prepare(
    `SELECT u.id, u.email, u.email_verified, u.last_reminder_day, u.last_summary_month, u.last_autopay_day, u.last_digest_week, u.last_trial_reminder_day, u.last_offer_reminder_day, ud.data
       FROM users u JOIN user_data ud ON ud.user_id = u.id
      WHERE u.email_verified = 1`
  ),
  setReminderDay: db.prepare(`UPDATE users SET last_reminder_day = ? WHERE id = ?`),
  setSummaryMonth: db.prepare(`UPDATE users SET last_summary_month = ? WHERE id = ?`),
  setAutopayDay: db.prepare(`UPDATE users SET last_autopay_day = ? WHERE id = ?`),
  setDigestWeek: db.prepare(`UPDATE users SET last_digest_week = ? WHERE id = ?`),
  setTrialReminderDay: db.prepare(`UPDATE users SET last_trial_reminder_day = ? WHERE id = ?`),
  setOfferReminderDay: db.prepare(`UPDATE users SET last_offer_reminder_day = ? WHERE id = ?`),
  getUserData: db.prepare(`SELECT data FROM user_data WHERE user_id = ?`),
  upsertUserData: db.prepare(
    `INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ),

  /* ── TOTP ──────────────────────────────────────────────── */
  getTotp: db.prepare(
    `SELECT user_id, secret_enc, enabled_at, last_used_at FROM user_totp WHERE user_id = ?`
  ),
  upsertTotp: db.prepare(
    `INSERT INTO user_totp (user_id, secret_enc, enabled_at, last_used_at) VALUES (?, ?, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE
         SET secret_enc = excluded.secret_enc,
             enabled_at = excluded.enabled_at`
  ),
  touchTotpUsed: db.prepare(`UPDATE user_totp SET last_used_at = ? WHERE user_id = ?`),
  deleteTotp: db.prepare(`DELETE FROM user_totp WHERE user_id = ?`),

  /* ── Backup codes ──────────────────────────────────────── */
  insertBackupCode: db.prepare(
    `INSERT INTO user_backup_codes (user_id, code_hash) VALUES (?, ?)`
  ),
  listBackupCodes: db.prepare(
    `SELECT id, code_hash, used_at FROM user_backup_codes WHERE user_id = ? ORDER BY id`
  ),
  markBackupUsed: db.prepare(
    `UPDATE user_backup_codes SET used_at = ? WHERE id = ?`
  ),
  deleteBackupCodes: db.prepare(`DELETE FROM user_backup_codes WHERE user_id = ?`),

  /* ── Passkeys ──────────────────────────────────────────── */
  insertPasskey: db.prepare(
    `INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, transports, name, created_at)
     VALUES (@user_id, @credential_id, @public_key, @counter, @transports, @name, @created_at)`
  ),
  findPasskeyByCredId: db.prepare(
    `SELECT id, user_id, credential_id, public_key, counter, transports, name, created_at, last_used_at
       FROM user_passkeys WHERE credential_id = ?`
  ),
  listPasskeys: db.prepare(
    `SELECT id, credential_id, transports, name, created_at, last_used_at
       FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC`
  ),
  listPasskeysForChallenge: db.prepare(
    `SELECT id, credential_id, transports FROM user_passkeys WHERE user_id = ?`
  ),
  deletePasskey: db.prepare(
    `DELETE FROM user_passkeys WHERE id = ? AND user_id = ?`
  ),
  deleteAllPasskeys: db.prepare(`DELETE FROM user_passkeys WHERE user_id = ?`),
  bumpPasskeyUsage: db.prepare(
    `UPDATE user_passkeys SET counter = ?, last_used_at = ? WHERE id = ?`
  ),
  countPasskeys: db.prepare(
    `SELECT COUNT(*) AS n FROM user_passkeys WHERE user_id = ?`
  ),

  /* ── MFA challenges ────────────────────────────────────── */
  insertChallenge: db.prepare(
    `INSERT INTO mfa_challenges (id, user_id, kind, payload, created_at, expires_at)
     VALUES (@id, @user_id, @kind, @payload, @created_at, @expires_at)`
  ),
  findChallenge: db.prepare(
    `SELECT id, user_id, kind, payload, expires_at FROM mfa_challenges WHERE id = ?`
  ),
  deleteChallenge: db.prepare(`DELETE FROM mfa_challenges WHERE id = ?`),
  pruneChallenges: db.prepare(`DELETE FROM mfa_challenges WHERE expires_at < ?`),

  /* ── Subscriptions ─────────────────────────────────────── */
  upsertSubscription: db.prepare(
    `INSERT INTO subscriptions
       (user_id, platform, product_id, txn_id, status, expires_at, environment, auto_renew, raw, created_at, updated_at)
     VALUES (@user_id, @platform, @product_id, @txn_id, @status, @expires_at, @environment, @auto_renew, @raw, @created_at, @updated_at)
     ON CONFLICT(platform, txn_id) DO UPDATE SET
       user_id     = excluded.user_id,
       product_id  = excluded.product_id,
       status      = excluded.status,
       expires_at  = excluded.expires_at,
       environment = excluded.environment,
       auto_renew  = excluded.auto_renew,
       raw         = excluded.raw,
       updated_at  = excluded.updated_at`
  ),
  findSubscriptionByTxn: db.prepare(
    `SELECT * FROM subscriptions WHERE platform = ? AND txn_id = ?`
  ),
  activeSubscriptions: db.prepare(
    `SELECT * FROM subscriptions
      WHERE user_id = ?
        AND status IN ('active','grace')
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY expires_at DESC`
  ),

  /* ── Promo codes ───────────────────────────────────────── */
  insertPromoCode: db.prepare(
    `INSERT INTO promo_codes
       (code, kind, grant_days, product_id, offer_id, platform, max_redemptions, expires_at, note, active, created_at)
     VALUES (@code, @kind, @grant_days, @product_id, @offer_id, @platform, @max_redemptions, @expires_at, @note, 1, @created_at)`
  ),
  findPromoCode: db.prepare(`SELECT * FROM promo_codes WHERE code = ?`),
  // Redeemable (or still marked active) codes for the admin overlay.
  listPromoCodes: db.prepare(
    `SELECT code, kind, grant_days, product_id, offer_id, platform,
            max_redemptions, redeemed_count, expires_at, note, active, created_at
       FROM promo_codes
      WHERE active = 1
      ORDER BY created_at DESC
      LIMIT ?`
  ),
  setPromoActive: db.prepare(
    `UPDATE promo_codes SET active = ? WHERE code = ?`
  ),
  bumpPromoRedeemed: db.prepare(
    `UPDATE promo_codes SET redeemed_count = redeemed_count + 1 WHERE code = ?`
  ),
  insertPromoRedemption: db.prepare(
    `INSERT INTO promo_redemptions (code, user_id, redeemed_at, grant_expires_at)
     VALUES (@code, @user_id, @redeemed_at, @grant_expires_at)`
  ),
  findPromoRedemption: db.prepare(
    `SELECT * FROM promo_redemptions WHERE code = ? AND user_id = ?`
  ),
  activePromoGrants: db.prepare(
    `SELECT r.code, r.grant_expires_at, r.redeemed_at, p.product_id
       FROM promo_redemptions r JOIN promo_codes p ON p.code = r.code
      WHERE r.user_id = ?
        AND p.kind = 'free_sub'
        AND (r.grant_expires_at IS NULL OR r.grant_expires_at > ?)
      ORDER BY r.grant_expires_at DESC`
  ),

  /* ── Plaid items / accounts ────────────────────────────── */
  insertPlaidItem: db.prepare(
    `INSERT INTO plaid_items
       (user_id, item_id, access_token_enc, institution_id, institution_name, status, cursor, error, created_at, updated_at)
     VALUES (@user_id, @item_id, @access_token_enc, @institution_id, @institution_name, @status, @cursor, @error, @created_at, @updated_at)`
  ),
  listPlaidItems: db.prepare(
    `SELECT id, user_id, item_id, institution_id, institution_name, status, error,
            created_at, updated_at, last_sync_at
       FROM plaid_items WHERE user_id = ? ORDER BY created_at DESC`
  ),
  findPlaidItemById: db.prepare(
    `SELECT * FROM plaid_items WHERE id = ? AND user_id = ?`
  ),
  findPlaidItemByItemId: db.prepare(
    `SELECT * FROM plaid_items WHERE item_id = ?`
  ),
  setPlaidItemCursor: db.prepare(
    `UPDATE plaid_items SET cursor = ?, updated_at = ? WHERE id = ?`
  ),
  setPlaidItemSynced: db.prepare(
    `UPDATE plaid_items SET last_sync_at = ?, updated_at = ? WHERE id = ?`
  ),
  setPlaidItemStatus: db.prepare(
    `UPDATE plaid_items SET status = ?, error = ?, updated_at = ? WHERE id = ?`
  ),
  deletePlaidItem: db.prepare(`DELETE FROM plaid_items WHERE id = ? AND user_id = ?`),
  upsertPlaidAccount: db.prepare(
    `INSERT INTO plaid_accounts (item_pk, account_id, enc, updated_at)
     VALUES (@item_pk, @account_id, @enc, @updated_at)
     ON CONFLICT(account_id) DO UPDATE SET
       item_pk    = excluded.item_pk,
       enc        = excluded.enc,
       updated_at = excluded.updated_at,
       -- Scrub any legacy plaintext now that everything lives in the enc blob.
       name = NULL, official_name = NULL, mask = NULL, type = NULL, subtype = NULL,
       current_balance = NULL, available_balance = NULL, limit_balance = NULL, iso_currency = NULL`
  ),
  listPlaidAccountsByItem: db.prepare(
    `SELECT account_id, enc, name, official_name, mask, type, subtype, current_balance, available_balance, limit_balance, iso_currency, updated_at
       FROM plaid_accounts WHERE item_pk = ? ORDER BY updated_at`
  ),

  /* ── Households (couples / families) ──────────────────────── */
  insertHousehold: db.prepare(
    `INSERT INTO households (name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)`
  ),
  findHouseholdById: db.prepare(`SELECT * FROM households WHERE id = ?`),
  updateHouseholdName: db.prepare(`UPDATE households SET name = ?, updated_at = ? WHERE id = ?`),
  deleteHousehold: db.prepare(`DELETE FROM households WHERE id = ?`),
  transferHouseholdOwner: db.prepare(`UPDATE households SET owner_user_id = ?, updated_at = ? WHERE id = ?`),

  insertHouseholdMember: db.prepare(
    `INSERT INTO household_members (household_id, user_id, role, share_prefs, joined_at)
     VALUES (@household_id, @user_id, @role, @share_prefs, @joined_at)`
  ),
  findHouseholdMembership: db.prepare(`SELECT * FROM household_members WHERE user_id = ?`),
  listHouseholdMembers: db.prepare(
    `SELECT m.household_id, m.user_id, m.role, m.joined_at, u.email, u.name
       FROM household_members m JOIN users u ON u.id = m.user_id
      WHERE m.household_id = ? ORDER BY m.joined_at`
  ),
  countHouseholdMembers: db.prepare(`SELECT COUNT(*) AS n FROM household_members WHERE household_id = ?`),
  deleteHouseholdMember: db.prepare(`DELETE FROM household_members WHERE household_id = ? AND user_id = ?`),
  setHouseholdMemberRole: db.prepare(
    `UPDATE household_members SET role = ? WHERE household_id = ? AND user_id = ?`
  ),
  updateMemberSharePrefs: db.prepare(
    `UPDATE household_members SET share_prefs = ? WHERE household_id = ? AND user_id = ?`
  ),

  insertHouseholdInvite: db.prepare(
    `INSERT INTO household_invites (household_id, email, token_hash, role, created_by, created_at, expires_at)
     VALUES (@household_id, @email, @token_hash, @role, @created_by, @created_at, @expires_at)`
  ),
  findHouseholdInviteByHash: db.prepare(`SELECT * FROM household_invites WHERE token_hash = ?`),
  listHouseholdInvites: db.prepare(
    `SELECT id, email, role, created_at, expires_at, accepted_at FROM household_invites
      WHERE household_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC`
  ),
  markHouseholdInviteAccepted: db.prepare(`UPDATE household_invites SET accepted_at = ? WHERE id = ?`),
  deleteHouseholdInvite: db.prepare(`DELETE FROM household_invites WHERE id = ? AND household_id = ?`),
  deletePendingInvitesForEmail: db.prepare(
    `DELETE FROM household_invites WHERE household_id = ? AND email = ? AND accepted_at IS NULL`
  ),

  /* ── Household shared entities (Phase 2) ──────────────────── */
  upsertHouseholdEntity: db.prepare(
    `INSERT INTO household_entities (household_id, kind, id, data, owner_user_id, updated_at, updated_by, deleted)
     VALUES (@household_id, @kind, @id, @data, @owner_user_id, @updated_at, @updated_by, @deleted)
     ON CONFLICT(household_id, kind, id) DO UPDATE SET
       data = excluded.data, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by, deleted = excluded.deleted`
  ),
  getHouseholdEntity: db.prepare(
    `SELECT * FROM household_entities WHERE household_id = ? AND kind = ? AND id = ?`
  ),
  listHouseholdEntities: db.prepare(
    `SELECT id, kind, data, owner_user_id, updated_at, updated_by, deleted
       FROM household_entities WHERE household_id = ? ORDER BY updated_at`
  ),
  listHouseholdEntitiesSince: db.prepare(
    `SELECT id, kind, data, owner_user_id, updated_at, updated_by, deleted
       FROM household_entities WHERE household_id = ? AND updated_at > ? ORDER BY updated_at`
  ),
  maxHouseholdEntityVersion: db.prepare(
    `SELECT COALESCE(MAX(updated_at), 0) AS v FROM household_entities WHERE household_id = ?`
  ),

  /* ── Household events (live-collaboration delta log, Phase 3) ─ */
  insertHouseholdEvent: db.prepare(
    `INSERT INTO household_events (household_id, payload, created_at) VALUES (?, ?, ?)`
  ),
  listHouseholdEventsSince: db.prepare(
    `SELECT seq, payload FROM household_events WHERE household_id = ? AND seq > ? ORDER BY seq`
  ),
  maxHouseholdEventSeq: db.prepare(
    `SELECT COALESCE(MAX(seq), 0) AS s FROM household_events WHERE household_id = ?`
  ),

  /* ── Push device tokens (APNs / FCM) ─────────────────────────── */
  upsertPushDevice: db.prepare(
    `INSERT INTO push_devices (user_id, platform, token, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform, updated_at = excluded.updated_at`
  ),
  deletePushDevice: db.prepare(
    `DELETE FROM push_devices WHERE user_id = ? AND token = ?`
  ),
  listPushDevices: db.prepare(
    `SELECT platform, token FROM push_devices WHERE user_id = ?`
  ),
  deletePushDeviceByToken: db.prepare(
    `DELETE FROM push_devices WHERE token = ?`
  ),
};

/* ── thin function wrappers ──────────────────────────────────── */

function createUser(email, passwordHash) {
  const info = stmt.insertUser.run(email, passwordHash, Date.now());
  return { id: info.lastInsertRowid, email };
}

// A sentinel hash for federated (OAuth) accounts: it isn't a valid bcrypt
// digest, so password login can never match it. The user can later set a
// real password via the reset flow.
const OAUTH_SENTINEL_HASH = '!oauth-no-password';

// Create an OAuth-first account: email already verified (the provider
// confirmed it), no usable password. Returns { id, email }.
function createOAuthUser(email, name) {
  const now = Date.now();
  const info = stmt.insertVerifiedUser.run(email, OAUTH_SENTINEL_HASH, now, now);
  const id = info.lastInsertRowid;
  if (name) { try { stmt.updateUserName.run(String(name).slice(0, 80), id); } catch (_) { /* best effort */ } }
  return { id, email };
}

// Resolve the local user for a verified provider identity, or null.
function findUserByOAuth(provider, subject) {
  const row = stmt.findOAuthIdentity.get(provider, String(subject));
  return row ? findUserById(row.user_id) : null;
}

// Attach a provider identity to a user (idempotent on provider+subject).
function linkOAuth(userId, provider, subject) {
  stmt.insertOAuthIdentity.run(userId, provider, String(subject), Date.now());
}

function listOAuthIdentities(userId) {
  return stmt.listOAuthIdentities.all(userId);
}

function findUserByEmail(email) {
  return stmt.findUserByEmail.get(email);
}

function findUserById(id) {
  return stmt.findUserById.get(id);
}

function updateUserPassword(userId, passwordHash) {
  stmt.updateUserPassword.run(passwordHash, userId);
}

function updateUserEmail(userId, email) {
  stmt.updateUserEmail.run(email, userId);
}

function updateUserName(userId, name) {
  stmt.updateUserName.run(name, userId);
}

function setEmailMfa(userId, enabled) {
  stmt.setEmailMfa.run(enabled ? 1 : 0, userId);
}

function findUserByIcalToken(token) {
  return stmt.findUserByIcalToken.get(token);
}

function updateUserIcalToken(userId, token) {
  stmt.updateUserIcalToken.run(token, userId);
}

function deleteUser(userId) {
  // sessions and user_data rows cascade-delete via their foreign keys.
  stmt.deleteUser.run(userId);
}

/* ── Roles / admin ──────────────────────────────────────────── */
function setUserRole(userId, role) { stmt.setUserRole.run(role, userId); }

function setUserSuspended(userId, suspended, reason) {
  const on = !!suspended;
  stmt.setUserSuspended.run(
    on ? 1 : 0,
    on ? Date.now() : null,
    on ? (reason || null) : null,
    userId,
  );
}

// Promote the configured ADMIN_EMAILS to 'admin' on boot (bootstrap path
// so there's always a way back in even if roles get edited).
function seedAdminEmails(emails) {
  for (const email of emails) {
    if (email) stmt.setRoleByEmail.run('admin', email);
  }
}

// Auto-verify trusted bootstrap emails on boot, so a "require everyone"
// verification rollout never locks the operator/admins out of their own
// accounts. Only flips unverified rows (won't re-stamp the timestamp).
function seedVerifiedEmails(emails) {
  const now = Date.now();
  for (const email of emails) {
    if (email) stmt.setVerifiedByEmail.run(now, email);
  }
}

function listUsers(query, limit = 50, offset = 0) {
  const like = `%${query || ''}%`;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const off = Math.max(0, Number(offset) || 0);
  return stmt.listUsers.all(like, like, lim, off);
}

function countUsers(query) {
  const like = `%${query || ''}%`;
  const row = stmt.countUsers.get(like, like);
  return row && row.n != null ? row.n : 0;
}

// Admin "comp" entitlement: a non-store subscription row (platform
// 'comp') that computeEntitlement treats like any active subscription.
function deleteCompSubscription(userId) { stmt.deleteCompSubscription.run(userId); }

// Logs out every other device after a password change.
function deleteOtherSessions(userId, keepSessionId) {
  return stmt.deleteOtherSessions.run(userId, keepSessionId).changes;
}

// Logs out ALL devices (password reset / 2FA recovery).
function deleteUserSessions(userId) {
  return stmt.deleteUserSessions.run(userId).changes;
}

/* ── Email tokens (verify / reset / recover) ────────────────── */
function insertEmailToken(row) { stmt.insertEmailToken.run(row); }
function findEmailTokenByHash(tokenHash) { return stmt.findEmailTokenByHash.get(tokenHash); }
function markEmailTokenUsed(id, ts) { stmt.markEmailTokenUsed.run(ts, id); }
function deleteEmailTokensByPurpose(userId, purpose) {
  stmt.deleteEmailTokensByPurpose.run(userId, purpose);
}

/* ── OAuth handoffs (Android App Link return) ───────────────── */
function insertOAuthHandoff(row) { stmt.insertOAuthHandoff.run(row); }
function findOAuthHandoffByHash(codeHash) { return stmt.findOAuthHandoffByHash.get(codeHash); }
function markOAuthHandoffUsed(codeHash, ts) {
  return stmt.markOAuthHandoffUsed.run(ts, codeHash).changes;
}
function deleteExpiredOAuthHandoffs(beforeTs) {
  return stmt.deleteExpiredOAuthHandoffs.run(beforeTs).changes;
}

function setEmailVerified(userId, ts) { stmt.setEmailVerified.run(ts, userId); }
function setOnboarded(userId) { stmt.setOnboarded.run(userId); }

/* ── Scheduler ──────────────────────────────────────────────── */
// All verified users with their parsed app data — for the reminder /
// summary scheduler. Small user counts make a full scan fine.
function allUsersWithData() {
  return stmt.allUsersWithData.all().map((r) => {
    const data = decodeUserDataBlob(r.data);
    return {
      id: r.id,
      email: r.email,
      email_verified: r.email_verified,
      last_reminder_day: r.last_reminder_day,
      last_summary_month: r.last_summary_month,
      last_autopay_day: r.last_autopay_day,
      last_digest_week: r.last_digest_week,
      last_trial_reminder_day: r.last_trial_reminder_day,
      last_offer_reminder_day: r.last_offer_reminder_day,
      data: {
        bills: data.bills,
        cards: data.cards,
        payments: data.payments,
        settings: data.settings,
      },
    };
  });
}
function setAutopayDay(userId, ymd) { stmt.setAutopayDay.run(ymd, userId); }
function setReminderDay(userId, ymd) { stmt.setReminderDay.run(ymd, userId); }
function setSummaryMonth(userId, ym) { stmt.setSummaryMonth.run(ym, userId); }
function setDigestWeek(userId, week) { stmt.setDigestWeek.run(week, userId); }
function setTrialReminderDay(userId, ymd) { stmt.setTrialReminderDay.run(ymd, userId); }
function setOfferReminderDay(userId, ymd) { stmt.setOfferReminderDay.run(ymd, userId); }

function touchLastLogin(userId) {
  stmt.touchLastLogin.run(Date.now(), userId);
}

function insertSession(row) {
  stmt.insertSession.run(row);
}

function findSession(id) {
  return stmt.findSession.get(id);
}

function deleteSession(id) {
  stmt.deleteSession.run(id);
}

function deleteExpiredSessions() {
  return stmt.deleteExpiredSessions.run(Date.now()).changes;
}

const EMPTY_DATA = { bills: [], cards: [], payments: [], accounts: [], goals: [], transactions: [], settings: {} };

/**
 * Decode a user_data.data TEXT cell.
 * Legacy rows are plaintext JSON (`{…}`); new rows are AES-256-GCM (mfa.encrypt).
 */
function decodeUserDataBlob(raw) {
  if (raw == null || raw === '') return { ...EMPTY_DATA };
  const s = String(raw).trim();
  try {
    const json = s.startsWith('{') ? s : mfa.decrypt(s);
    const parsed = JSON.parse(json);
    return {
      bills: Array.isArray(parsed.bills) ? parsed.bills : [],
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      settings:
        parsed.settings && typeof parsed.settings === 'object'
          ? parsed.settings
          : {},
    };
  } catch (_) {
    return { ...EMPTY_DATA };
  }
}

/** Encrypt a user_data object for storage (AES-256-GCM via mfa.encrypt). */
function encodeUserDataBlob(data) {
  return mfa.encrypt(JSON.stringify(data));
}

// Returns the user's saved app data, or empty defaults when none exists.
function getUserData(userId) {
  const row = stmt.getUserData.get(userId);
  if (!row) return { ...EMPTY_DATA };
  return decodeUserDataBlob(row.data);
}

function upsertUserData(userId, data) {
  stmt.upsertUserData.run(userId, encodeUserDataBlob(data), Date.now());
}

// True when the account has any second factor enrolled (TOTP, a passkey,
// or email codes). Used to decide whether 2FA recovery applies.
function userHasMfa(userId) {
  const totp = stmt.getTotp.get(userId);
  if (totp && totp.enabled_at) return true;
  if (stmt.listPasskeys.all(userId).length) return true;
  const u = stmt.findUserById.get(userId);
  return !!(u && u.email_mfa_enabled);
}

// 2FA recovery (the data-wipe path the user chose): disable every second
// factor, erase the user's financial data while PRESERVING settings, and
// revoke all sessions. One transaction so it fully lands or not at all.
const recover2faTxn = db.transaction((userId) => {
  stmt.deleteTotp.run(userId);
  stmt.deleteBackupCodes.run(userId);
  stmt.deleteAllPasskeys.run(userId);
  stmt.setEmailMfa.run(0, userId);
  const current = getUserData(userId);
  upsertUserData(userId, {
    bills: [], cards: [], payments: [],
    settings: current.settings || {},
  });
  stmt.deleteUserSessions.run(userId);
});
function recover2faWipe(userId) { recover2faTxn(userId); }

/* ── TOTP wrappers ──────────────────────────────────────────── */
function getTotp(userId)          { return stmt.getTotp.get(userId); }
function upsertTotp(userId, encSecret, enabledAt) {
  stmt.upsertTotp.run(userId, encSecret, enabledAt || null);
}
function touchTotpUsed(userId)    { stmt.touchTotpUsed.run(Date.now(), userId); }
function deleteTotp(userId)       { stmt.deleteTotp.run(userId); }

/* ── Backup-code wrappers ───────────────────────────────────── */
function insertBackupCode(userId, hash) { stmt.insertBackupCode.run(userId, hash); }
function listBackupCodes(userId)        { return stmt.listBackupCodes.all(userId); }
function markBackupCodeUsed(id)         { stmt.markBackupUsed.run(Date.now(), id); }
function deleteBackupCodes(userId)      { stmt.deleteBackupCodes.run(userId); }

/* ── Passkey wrappers ───────────────────────────────────────── */
function insertPasskey(row)             { stmt.insertPasskey.run(row); }
function findPasskeyByCredId(credId)    { return stmt.findPasskeyByCredId.get(credId); }
function listPasskeys(userId)           { return stmt.listPasskeys.all(userId); }
function listPasskeysForChallenge(userId) { return stmt.listPasskeysForChallenge.all(userId); }
function deletePasskey(id, userId)      { stmt.deletePasskey.run(id, userId); }
function deleteAllPasskeys(userId)      { stmt.deleteAllPasskeys.run(userId); }
function bumpPasskeyUsage(id, counter)  { stmt.bumpPasskeyUsage.run(counter, Date.now(), id); }
function countPasskeys(userId)          { return stmt.countPasskeys.get(userId).n; }

/* ── MFA-challenge wrappers ─────────────────────────────────── */
function insertChallenge(row)           { stmt.insertChallenge.run(row); }
function findChallenge(id)              { return stmt.findChallenge.get(id); }
function deleteChallenge(id)            { stmt.deleteChallenge.run(id); }
function pruneChallenges()              { return stmt.pruneChallenges.run(Date.now()).changes; }

/* ── Subscription wrappers ──────────────────────────────────── */
function upsertSubscription(row)        { stmt.upsertSubscription.run(row); }
function findSubscriptionByTxn(platform, txnId) {
  return stmt.findSubscriptionByTxn.get(platform, txnId);
}
function activeSubscriptions(userId)    { return stmt.activeSubscriptions.all(userId, Date.now()); }

/* ── Promo wrappers ─────────────────────────────────────────── */
function insertPromoCode(row)           { stmt.insertPromoCode.run(row); }
function findPromoCode(code)            { return stmt.findPromoCode.get(code); }
function listPromoCodes(limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  return stmt.listPromoCodes.all(n);
}
function setPromoActive(code, active) {
  return stmt.setPromoActive.run(active ? 1 : 0, code).changes;
}
function bumpPromoRedeemed(code)        { stmt.bumpPromoRedeemed.run(code); }
function insertPromoRedemption(row)     { stmt.insertPromoRedemption.run(row); }
function findPromoRedemption(code, userId) {
  return stmt.findPromoRedemption.get(code, userId);
}

/* ── Card preset catalog (admin-editable rewards) ───────────── */
function parseJsonObject(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
  } catch (_) {
    return fallback;
  }
}
function parseJsonArray(raw) {
  if (raw == null || raw === '') return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : undefined;
  } catch (_) {
    return undefined;
  }
}

function rowToCardPreset(row) {
  if (!row) return null;
  const out = {
    id: row.id,
    issuer: row.issuer,
    name: row.name,
    network: row.network,
    rewardBase: row.reward_base,
    rewardCategories: parseJsonObject(row.reward_categories, {}),
  };
  if (row.point_value != null) out.pointValue = row.point_value;
  if (row.rotating_rate != null) out.rotatingRate = row.rotating_rate;
  const pool = parseJsonArray(row.rotating_pool);
  if (pool) out.rotatingPool = pool;
  if (row.updated_at != null) out.updatedAt = row.updated_at;
  return out;
}

function cardPresetFilterSql(q, issuer) {
  const clauses = [];
  const params = [];
  const qq = String(q || '').trim().slice(0, 100);
  if (qq) {
    const like = '%' + qq.replace(/[%_]/g, '') + '%';
    clauses.push('(id LIKE ? COLLATE NOCASE OR issuer LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE OR network LIKE ? COLLATE NOCASE)');
    params.push(like, like, like, like);
  }
  const iss = String(issuer || '').trim().slice(0, 80);
  if (iss) {
    clauses.push('issuer = ? COLLATE NOCASE');
    params.push(iss);
  }
  return {
    where: clauses.length ? (' WHERE ' + clauses.join(' AND ')) : '',
    params,
  };
}

function countCardPresets(q, issuer) {
  const f = cardPresetFilterSql(q, issuer);
  return db.prepare('SELECT COUNT(*) AS c FROM card_presets' + f.where).get(...f.params).c;
}

function listCardPresets(q, issuer, limit, offset) {
  const f = cardPresetFilterSql(q, issuer);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  return db.prepare(
    'SELECT * FROM card_presets' + f.where +
    ' ORDER BY issuer COLLATE NOCASE ASC, name COLLATE NOCASE ASC LIMIT ? OFFSET ?'
  ).all(...f.params, lim, off).map(rowToCardPreset);
}

function allCardPresets() {
  return db.prepare(
    'SELECT * FROM card_presets ORDER BY issuer COLLATE NOCASE ASC, name COLLATE NOCASE ASC'
  ).all().map(rowToCardPreset);
}

function listCardPresetIssuers() {
  return db.prepare(
    'SELECT DISTINCT issuer FROM card_presets ORDER BY issuer COLLATE NOCASE ASC'
  ).all().map((r) => r.issuer);
}

function findCardPreset(id) {
  return rowToCardPreset(db.prepare('SELECT * FROM card_presets WHERE id = ?').get(id));
}

function upsertCardPreset(preset) {
  const id = String(preset.id || '').trim();
  if (!id) throw new Error('missing-id');
  const issuer = String(preset.issuer || '').trim();
  const name = String(preset.name || '').trim();
  const network = String(preset.network || '').trim();
  if (!issuer || !name || !network) throw new Error('missing-fields');
  const rewardBase = Number(preset.rewardBase);
  if (!Number.isFinite(rewardBase) || rewardBase < 0) throw new Error('bad-reward-base');
  const cats = preset.rewardCategories && typeof preset.rewardCategories === 'object' && !Array.isArray(preset.rewardCategories)
    ? preset.rewardCategories
    : {};
  let pointValue = null;
  if (preset.pointValue != null && preset.pointValue !== '') {
    pointValue = Number(preset.pointValue);
    if (!Number.isFinite(pointValue) || pointValue < 0) throw new Error('bad-point-value');
  }
  let rotatingRate = null;
  if (preset.rotatingRate != null && preset.rotatingRate !== '') {
    rotatingRate = Number(preset.rotatingRate);
    if (!Number.isFinite(rotatingRate) || rotatingRate < 0) throw new Error('bad-rotating-rate');
  }
  let rotatingPool = null;
  if (Array.isArray(preset.rotatingPool) && preset.rotatingPool.length) {
    rotatingPool = JSON.stringify(preset.rotatingPool.map((x) => String(x)));
  }
  const now = Date.now();
  db.prepare(`
    INSERT INTO card_presets (
      id, issuer, name, network, reward_base, reward_categories,
      point_value, rotating_rate, rotating_pool, updated_at
    ) VALUES (
      @id, @issuer, @name, @network, @reward_base, @reward_categories,
      @point_value, @rotating_rate, @rotating_pool, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      issuer = excluded.issuer,
      name = excluded.name,
      network = excluded.network,
      reward_base = excluded.reward_base,
      reward_categories = excluded.reward_categories,
      point_value = excluded.point_value,
      rotating_rate = excluded.rotating_rate,
      rotating_pool = excluded.rotating_pool,
      updated_at = excluded.updated_at
  `).run({
    id,
    issuer,
    name,
    network,
    reward_base: rewardBase,
    reward_categories: JSON.stringify(cats),
    point_value: pointValue,
    rotating_rate: rotatingRate,
    rotating_pool: rotatingPool,
    updated_at: now,
  });
  return findCardPreset(id);
}

function deleteCardPreset(id) {
  return db.prepare('DELETE FROM card_presets WHERE id = ?').run(id).changes;
}

function ensureCardPresetsSeeded() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM card_presets').get().c;
  if (n === 0) {
    const seedPath = path.join(__dirname, 'cardPresets.seed.json');
    if (fs.existsSync(seedPath)) {
      let seed;
      try {
        seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      } catch (_) {
        seed = null;
      }
      if (Array.isArray(seed) && seed.length) {
        const tx = db.transaction((rows) => {
          for (const p of rows) {
            try { upsertCardPreset(p); } catch (_) { /* skip bad seed rows */ }
          }
        });
        tx(seed);
      }
    }
  }
  refreshStaleCardPresetRates();
}

/**
 * Idempotent catalog rate fixes for already-seeded DBs. Only rewrites rows that
 * still match the known-stale shape so admin edits are preserved. Also inserts
 * any new seed ids that are missing (Bilt 2.0 lineup, etc.).
 */
function refreshStaleCardPresetRates() {
  const csp = findCardPreset('chase-csp');
  if (csp) {
    const cats = csp.rewardCategories || {};
    // Pre-June-2026 Preferred listed blanket "Online shopping" 3x; issuer is
    // online grocery + gas/EV + streaming (we map gas; grocery stays ambiguous).
    if (cats['Online shopping'] === 3 && cats.Dining === 3) {
      const next = Object.assign({}, cats);
      delete next['Online shopping'];
      if (next.Gas == null) next.Gas = 3;
      try {
        upsertCardPreset(Object.assign({}, csp, { rewardCategories: next }));
      } catch (_) { /* ignore */ }
    }
  }
  const csr = findCardPreset('chase-csr');
  if (csr) {
    const cats = csr.rewardCategories || {};
    const keys = Object.keys(cats);
    // Pre-June-2025 Reserve was 3x all travel; now 4x flights/hotels booked direct.
    if (cats.Travel === 3 && cats.Dining === 3 && keys.length <= 2) {
      try {
        upsertCardPreset(Object.assign({}, csr, {
          rewardCategories: Object.assign({}, cats, { Travel: 4 }),
        }));
      } catch (_) { /* ignore */ }
    }
  }

  // Legacy single Bilt Mastercard → Obsidian (closest everyday earn shape).
  const legacyBilt = findCardPreset('bilt');
  if (legacyBilt && String(legacyBilt.name || '').toLowerCase().includes('mastercard')) {
    try {
      upsertCardPreset({
        id: 'bilt-obsidian',
        issuer: 'Bilt',
        name: 'Obsidian Card',
        network: 'Mastercard',
        rewardBase: 1,
        rewardCategories: { Travel: 2 },
        rotatingRate: 3,
        rotatingPool: ['Dining', 'Groceries'],
        pointValue: 2.2,
      });
      deleteCardPreset('bilt');
    } catch (_) { /* ignore */ }
  }

  ensureMissingSeedPresets();
}

/** Insert seed presets that are not yet in the DB (never overwrites existing). */
function ensureMissingSeedPresets() {
  const seedPath = path.join(__dirname, 'cardPresets.seed.json');
  if (!fs.existsSync(seedPath)) return;
  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (_) {
    return;
  }
  if (!Array.isArray(seed) || !seed.length) return;
  for (const p of seed) {
    if (!p || !p.id) continue;
    if (findCardPreset(p.id)) continue;
    try { upsertCardPreset(p); } catch (_) { /* skip */ }
  }
}

ensureCardPresetsSeeded();
function activePromoGrants(userId)      { return stmt.activePromoGrants.all(userId, Date.now()); }

/* ── Plaid wrappers ─────────────────────────────────────────── */
function insertPlaidItem(row) {
  const info = stmt.insertPlaidItem.run(row);
  return info.lastInsertRowid;
}
function listPlaidItems(userId)              { return stmt.listPlaidItems.all(userId); }
function findPlaidItemById(id, userId)       { return stmt.findPlaidItemById.get(id, userId); }
function findPlaidItemByItemId(itemId)       { return stmt.findPlaidItemByItemId.get(itemId); }
function setPlaidItemCursor(id, cursor)      { stmt.setPlaidItemCursor.run(cursor, Date.now(), id); }
function setPlaidItemSynced(id, at)          { stmt.setPlaidItemSynced.run(at || Date.now(), Date.now(), id); }
function setPlaidItemStatus(id, status, error) {
  stmt.setPlaidItemStatus.run(status, error || null, Date.now(), id);
}
function deletePlaidItem(id, userId)         { return stmt.deletePlaidItem.run(id, userId).changes; }
function upsertPlaidAccount(row)             { stmt.upsertPlaidAccount.run(row); }
function listPlaidAccountsByItem(itemPk)     { return stmt.listPlaidAccountsByItem.all(itemPk); }

/* ── Household wrappers ─────────────────────────────────────── */
function createHousehold(name, ownerUserId) {
  const now = Date.now();
  const info = stmt.insertHousehold.run(name, ownerUserId, now, now);
  return info.lastInsertRowid;
}
function findHouseholdById(id)               { return stmt.findHouseholdById.get(id); }
function updateHouseholdName(id, name)       { stmt.updateHouseholdName.run(name, Date.now(), id); }
function deleteHousehold(id)                 { stmt.deleteHousehold.run(id); }
function transferHouseholdOwner(id, newOwnerId) { stmt.transferHouseholdOwner.run(newOwnerId, Date.now(), id); }
function insertHouseholdMember(row)          { stmt.insertHouseholdMember.run(row); }
function findHouseholdMembership(userId)     { return stmt.findHouseholdMembership.get(userId); }
function listHouseholdMembers(householdId)   { return stmt.listHouseholdMembers.all(householdId); }
function countHouseholdMembers(householdId)  { return stmt.countHouseholdMembers.get(householdId).n; }
function deleteHouseholdMember(householdId, userId) { return stmt.deleteHouseholdMember.run(householdId, userId).changes; }
function setHouseholdMemberRole(householdId, userId, role) { stmt.setHouseholdMemberRole.run(role, householdId, userId); }
function updateMemberSharePrefs(householdId, userId, prefsJson) {
  stmt.updateMemberSharePrefs.run(prefsJson, householdId, userId);
}
function insertHouseholdInvite(row)          { stmt.insertHouseholdInvite.run(row); }
function findHouseholdInviteByHash(hash)     { return stmt.findHouseholdInviteByHash.get(hash); }
function listHouseholdInvites(householdId)   { return stmt.listHouseholdInvites.all(householdId, Date.now()); }
function markHouseholdInviteAccepted(id)     { stmt.markHouseholdInviteAccepted.run(Date.now(), id); }
function deleteHouseholdInvite(id, householdId) { return stmt.deleteHouseholdInvite.run(id, householdId).changes; }
function deletePendingInvitesForEmail(householdId, email) {
  stmt.deletePendingInvitesForEmail.run(householdId, email);
}
function upsertHouseholdEntity(row)          { stmt.upsertHouseholdEntity.run(row); }
function getHouseholdEntity(householdId, kind, id) { return stmt.getHouseholdEntity.get(householdId, kind, String(id)); }
function listHouseholdEntities(householdId)  { return stmt.listHouseholdEntities.all(householdId); }
function listHouseholdEntitiesSince(householdId, since) { return stmt.listHouseholdEntitiesSince.all(householdId, since); }
function householdDataVersion(householdId)   { return stmt.maxHouseholdEntityVersion.get(householdId).v; }
function insertHouseholdEvent(householdId, payload) {
  return stmt.insertHouseholdEvent.run(householdId, payload, Date.now()).lastInsertRowid;
}
function listHouseholdEventsSince(householdId, sinceSeq) { return stmt.listHouseholdEventsSince.all(householdId, sinceSeq); }
function householdEventSeq(householdId)      { return stmt.maxHouseholdEventSeq.get(householdId).s; }

/* ── Push device wrappers ─────────────────────────────────────── */
function upsertPushDevice(userId, platform, token) {
  stmt.upsertPushDevice.run(userId, platform, token, Date.now());
}
function deletePushDevice(userId, token) {
  return stmt.deletePushDevice.run(userId, token).changes;
}
function listPushDevices(userId) {
  return stmt.listPushDevices.all(userId);
}
function deletePushDeviceByToken(token) {
  return stmt.deletePushDeviceByToken.run(token).changes;
}

module.exports = {
  db,
  DB_PATH,
  createUser,
  createOAuthUser,
  findUserByOAuth,
  linkOAuth,
  listOAuthIdentities,
  findUserByEmail,
  findUserById,
  findUserByIcalToken,
  touchLastLogin,
  updateUserPassword,
  updateUserEmail,
  updateUserName,
  setEmailMfa,
  updateUserIcalToken,
  deleteUser,
  setUserRole,
  setUserSuspended,
  seedAdminEmails,
  seedVerifiedEmails,
  listUsers,
  countUsers,
  deleteCompSubscription,
  insertSession,
  findSession,
  deleteSession,
  deleteExpiredSessions,
  deleteOtherSessions,
  deleteUserSessions,
  // Email tokens / verification
  insertEmailToken,
  findEmailTokenByHash,
  markEmailTokenUsed,
  deleteEmailTokensByPurpose,
  insertOAuthHandoff,
  findOAuthHandoffByHash,
  markOAuthHandoffUsed,
  deleteExpiredOAuthHandoffs,
  setEmailVerified,
  setOnboarded,
  allUsersWithData,
  setReminderDay,
  setSummaryMonth,
  setAutopayDay,
  setDigestWeek,
  setTrialReminderDay,
  setOfferReminderDay,
  getUserData,
  upsertUserData,
  decodeUserDataBlob,
  encodeUserDataBlob,
  userHasMfa,
  recover2faWipe,
  // TOTP
  getTotp,
  upsertTotp,
  touchTotpUsed,
  deleteTotp,
  // Backup codes
  insertBackupCode,
  listBackupCodes,
  markBackupCodeUsed,
  deleteBackupCodes,
  // Passkeys
  insertPasskey,
  findPasskeyByCredId,
  listPasskeys,
  listPasskeysForChallenge,
  deletePasskey,
  deleteAllPasskeys,
  bumpPasskeyUsage,
  countPasskeys,
  // MFA challenges
  insertChallenge,
  findChallenge,
  deleteChallenge,
  pruneChallenges,
  // Subscriptions
  upsertSubscription,
  findSubscriptionByTxn,
  activeSubscriptions,
  // Promo codes
  insertPromoCode,
  findPromoCode,
  listPromoCodes,
  setPromoActive,
  bumpPromoRedeemed,
  insertPromoRedemption,
  findPromoRedemption,
  activePromoGrants,
  // Card presets (rewards catalog)
  allCardPresets,
  listCardPresets,
  countCardPresets,
  listCardPresetIssuers,
  findCardPreset,
  upsertCardPreset,
  deleteCardPreset,
  // Plaid
  insertPlaidItem,
  listPlaidItems,
  findPlaidItemById,
  findPlaidItemByItemId,
  setPlaidItemCursor,
  setPlaidItemSynced,
  setPlaidItemStatus,
  deletePlaidItem,
  upsertPlaidAccount,
  listPlaidAccountsByItem,
  // Households (couples / families)
  createHousehold,
  findHouseholdById,
  updateHouseholdName,
  deleteHousehold,
  transferHouseholdOwner,
  insertHouseholdMember,
  findHouseholdMembership,
  listHouseholdMembers,
  countHouseholdMembers,
  deleteHouseholdMember,
  setHouseholdMemberRole,
  updateMemberSharePrefs,
  insertHouseholdInvite,
  findHouseholdInviteByHash,
  listHouseholdInvites,
  markHouseholdInviteAccepted,
  deleteHouseholdInvite,
  deletePendingInvitesForEmail,
  upsertHouseholdEntity,
  getHouseholdEntity,
  listHouseholdEntities,
  listHouseholdEntitiesSince,
  householdDataVersion,
  insertHouseholdEvent,
  listHouseholdEventsSince,
  householdEventSeq,
  upsertPushDevice,
  deletePushDevice,
  listPushDevices,
  deletePushDeviceByToken,
};
