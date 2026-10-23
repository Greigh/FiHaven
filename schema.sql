CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER,
    name          TEXT,
    ical_token    TEXT,
    role          TEXT NOT NULL DEFAULT 'user'   -- 'user' | 'admin'
  , email_mfa_enabled INTEGER DEFAULT 0, email_verified INTEGER NOT NULL DEFAULT 0, email_verified_at INTEGER, onboarded INTEGER NOT NULL DEFAULT 0, last_reminder_day TEXT, last_summary_month TEXT, last_autopay_day TEXT, last_digest_week TEXT, last_trial_reminder_day TEXT, last_offer_reminder_day TEXT, suspended INTEGER NOT NULL DEFAULT 0, suspended_at INTEGER, suspended_reason TEXT, last_seen_at INTEGER, last_login_method TEXT);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE user_data (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
CREATE TABLE user_totp (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_enc     TEXT NOT NULL,
    enabled_at     INTEGER,
    last_used_at   INTEGER
  , last_used_step INTEGER);
CREATE TABLE user_backup_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    used_at    INTEGER
  );
CREATE INDEX idx_backup_codes_user ON user_backup_codes(user_id);
CREATE TABLE user_passkeys (
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
CREATE INDEX idx_passkeys_user ON user_passkeys(user_id);
CREATE TABLE mfa_challenges (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    payload    TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  , attempts INTEGER NOT NULL DEFAULT 0, sends INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_mfa_challenges_expires ON mfa_challenges(expires_at);
CREATE TABLE subscriptions (
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
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE TABLE promo_codes (
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
CREATE TABLE promo_redemptions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT NOT NULL COLLATE NOCASE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at      INTEGER NOT NULL,
    grant_expires_at INTEGER, revoked_at INTEGER,             -- free_sub: when the grant lapses; null = lifetime
    UNIQUE(code, user_id)
  );
CREATE INDEX idx_promo_redemptions_user ON promo_redemptions(user_id);
CREATE UNIQUE INDEX idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;
CREATE TABLE plaid_items (
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
  , last_sync_at INTEGER);
CREATE INDEX idx_plaid_items_user ON plaid_items(user_id);
CREATE TABLE plaid_accounts (
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
    updated_at        INTEGER NOT NULL
  , enc TEXT);
CREATE INDEX idx_plaid_accounts_item ON plaid_accounts(item_pk);
CREATE TABLE email_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     TEXT NOT NULL,        -- 'verify-email' | 'password-reset' | 'recover-2fa'
    token_hash  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  );
CREATE INDEX idx_email_tokens_hash ON email_tokens(token_hash);
CREATE TABLE oauth_identities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,                -- 'google' | 'apple'
    subject     TEXT NOT NULL,                -- provider's stable user id ("sub")
    created_at  INTEGER NOT NULL,
    UNIQUE(provider, subject)
  );
CREATE INDEX idx_oauth_identities_user ON oauth_identities(user_id);
CREATE TABLE households (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
CREATE TABLE household_members (
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
    share_prefs  TEXT,                            -- JSON selective-sharing prefs (Phase 2)
    joined_at    INTEGER NOT NULL,
    PRIMARY KEY (household_id, user_id)
  );
CREATE UNIQUE INDEX idx_household_members_user ON household_members(user_id);
CREATE TABLE household_invites (
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
CREATE INDEX idx_household_invites_hh ON household_invites(household_id);
CREATE INDEX idx_household_invites_email ON household_invites(email);
CREATE TABLE household_entities (
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
CREATE INDEX idx_household_entities_sync ON household_entities(household_id, updated_at);
CREATE TABLE household_events (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    payload      TEXT NOT NULL,           -- JSON { entity }
    created_at   INTEGER NOT NULL
  );
CREATE INDEX idx_household_events_hh ON household_events(household_id, seq);
CREATE TABLE push_devices (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform   TEXT NOT NULL,              -- 'ios' | 'android'
    token      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, token)
  );
CREATE INDEX idx_push_devices_user ON push_devices(user_id);
CREATE TABLE card_presets (
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
CREATE INDEX idx_card_presets_issuer ON card_presets(issuer COLLATE NOCASE);
CREATE TABLE oauth_handoffs (
    code_hash   TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,        -- 'apple' | 'google'
    id_token    TEXT NOT NULL,
    name        TEXT,
    state       TEXT,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  );
CREATE INDEX idx_oauth_handoffs_expires ON oauth_handoffs(expires_at);
CREATE TABLE login_throttle (
    key          TEXT PRIMARY KEY,
    count        INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  );
CREATE UNIQUE INDEX idx_push_devices_token ON push_devices(token);
CREATE TABLE sessions (
      id_hash     TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      user_agent  TEXT,
      ip          TEXT
    );
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
