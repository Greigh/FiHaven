#!/bin/bash
#
# FiHaven production deploy — build locally, back up remote, rsync, restart.
#
# Copy to repo root as upload.sh (gitignored):
#   cp scripts/examples/upload.example.sh upload.sh
#
# Unlike a pure static site, FiHaven is a Node + Express app with a SQLite
# store. This script:
#   1. backs up the remote deploy dir (includes data/, excludes node_modules/)
#   2. builds Tailwind + Vite into dist/
#   3. rsyncs dist/, server/, production scripts (promo.js; not dev/ or
#      examples/), package files, and sanitized .env — never overwrites data/
#   4. runs npm ci --omit=dev on the remote and restarts PM2
#   5. verifies PM2 + HTTP, then prints a summary
#
# First-time remote setup (once by hand):
#   ssh root@$SSH_HOST
#   mkdir -p /var/www/fihaven.app/data
#   cd /var/www/fihaven.app
#   pm2 start server/index.js --name fihaven --update-env
#   pm2 save
#   # nginx: proxy_pass http://127.0.0.1:5222;
#
# Authentication (preferred: SSH keys, no secrets in .env):
#   ssh-copy-id $SSH_USER@$SSH_HOST     # once, then nothing else is needed
# Fallback, if the host has no key installed — requires sshpass:
#   SSH_PASSWORD=<VPS password>         in .env (repo root, gitignored)
#
# Either way the deploy authenticates ONCE and multiplexes every later
# ssh/rsync over that connection (ControlMaster), so server-side throttling
# can't reject a step mid-run.
#
# Optional:
#   SSH_KEY (path to a specific private key), SSH_USER, SSH_HOST,
#   DEPLOY_PATH, REMOTE_RESTART_CMD, BACKUP_RETENTION_DAYS
#   PUBLIC_ORIGIN (used for post-deploy HTTP check and summary URL)

set -euo pipefail

# ── Flags ────────────────────────────────────────────────────────
# --allow-sandbox[=DAYS]
#   Open a TIME-LIMITED window in which Apple StoreKit *sandbox* transactions
#   and Play *license-tester* purchases are accepted (App Review and TestFlight
#   purchase against sandbox, so without this reviewers and testers cannot buy).
#
#   The window is stamped as a deadline into the deployed .env, not a boolean,
#   and neither APPLE_ALLOW_SANDBOX nor GOOGLE_ALLOW_TEST_PURCHASES is read from
#   your local .env — so the hole cannot be left open by forgetting to edit a
#   file back. It closes on its own even if nobody deploys again, and a plain
#   deploy never carries it forward.
#
#   You mostly should not need this on the Apple side: every deploy stamps
#   APPLE_SANDBOX_BUILD from ios/FiHavenApp/project.yml, which accepts sandbox
#   purchases from the build you just shipped and nothing else. Play has no
#   equivalent — the purchase carries no app version — so the dated window is
#   the only lever there.
ALLOW_SANDBOX_DAYS=""
_args=()
for _arg in "$@"; do
  case "$_arg" in
    --allow-sandbox)    ALLOW_SANDBOX_DAYS="14" ;;
    --allow-sandbox=*)  ALLOW_SANDBOX_DAYS="${_arg#--allow-sandbox=}" ;;
    -h|--help)
      sed -n '2,41p' "$0"
      echo
      echo "Flags:"
      echo "  --allow-sandbox[=DAYS]  Accept Apple sandbox + Play test purchases for DAYS"
      echo "                          (default 14). For App Review / TestFlight."
      echo "                          Expires by itself; a plain deploy closes it."
      exit 0
      ;;
    *) _args+=("$_arg") ;;
  esac
done
if [ -n "$ALLOW_SANDBOX_DAYS" ]; then
  case "$ALLOW_SANDBOX_DAYS" in
    ''|*[!0-9]*) echo "--allow-sandbox needs a whole number of days" >&2; exit 1 ;;
  esac
  if [ "$ALLOW_SANDBOX_DAYS" -lt 1 ] || [ "$ALLOW_SANDBOX_DAYS" -gt 90 ]; then
    echo "--allow-sandbox must be between 1 and 90 days" >&2; exit 1
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT=""
_dir="$SCRIPT_DIR"
while [ "$_dir" != "/" ]; do
  if [ -f "$_dir/package.json" ] && [ -d "$_dir/server" ]; then
    REPO_ROOT="$_dir"
    break
  fi
  _dir="$(dirname "$_dir")"
done
if [ -z "$REPO_ROOT" ]; then
  echo "❌ Run from the FiHaven repo root, or copy this script to upload.sh there."
  exit 1
fi
cd "$REPO_ROOT"

BUILD_DATE=""
BACKUP_PATH=""
TMP_ENV=""

# ─── Logging ─────────────────────────────────────────────────────

log_step() { echo "🔹 $*"; }
log_ok()   { echo "✅ $*"; }
log_warn() { echo "⚠️  $*"; }
log_fail() { echo "❌ $*" >&2; }

cleanup() {
  rm -f "$TMP_ENV"
  # Close the shared SSH connection instead of leaving it idling until
  # ControlPersist expires.
  if [ -n "${SSH_TARGET:-}" ] && [ -n "${SSH_OPTS:-}" ]; then
    ssh $SSH_OPTS -O exit "$SSH_TARGET" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ─── Load .env ───────────────────────────────────────────────────
# Read KEY=VALUE without word-splitting so values with spaces or shell
# metacharacters survive.

load_env() {
  if [ ! -f .env ]; then
    log_fail ".env not found in $REPO_ROOT"
    exit 1
  fi
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      ''|\#*) continue ;;
    esac
    value="${value%$'\r'}"
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < .env
}

apply_defaults() {
  SSH_USER="${SSH_USER:-root}"
  SSH_HOST="${SSH_HOST:-82.25.91.225}"
  DEPLOY_PATH="${DEPLOY_PATH:-/var/www/fihaven.app}"
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
  REMOTE_RESTART_CMD="${REMOTE_RESTART_CMD:-pm2 restart fihaven --update-env || pm2 start server/index.js --name fihaven --update-env}"

  # SSH_PASSWORD is no longer required up front — setup_ssh_auth only asks for
  # it when key auth isn't available.
}

sanity_check_repo() {
  if [ ! -f package.json ] || [ ! -d server ] || [ ! -d client ]; then
    log_fail "Missing package.json, server/, or client/ — run from repo root"
    exit 1
  fi
}

# ─── SSH / rsync ─────────────────────────────────────────────────

# A deploy runs a dozen-odd remote steps (backup, mkdir, rsyncs, chmods,
# npm/PM2, verify). Each one used to open its own connection and authenticate
# from scratch, so any server-side throttling — pam_faillock, fail2ban,
# OpenSSH PerSourcePenalties — could reject one at random and the deploy died
# at a different step every time ("Permission denied, please try again" with a
# password that is in fact correct).
#
# Now: authenticate ONCE, then multiplex every later ssh/rsync over that one
# connection via ControlMaster. Keys are preferred; sshpass stays as a
# fallback so an unconfigured host still deploys.
setup_ssh_auth() {
  log_step "SSH authentication"

  SSH_TARGET="$SSH_USER@$SSH_HOST"

  local control_dir="${HOME}/.ssh/cm"
  mkdir -p "$control_dir"
  chmod 700 "$control_dir"

  # %C is a short hash of (host, port, user) — keeps the socket path well under
  # the ~104-char limit for unix sockets.
  SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
  SSH_OPTS="$SSH_OPTS -o ControlMaster=auto -o ControlPath=${control_dir}/%C -o ControlPersist=5m"
  if [ -n "${SSH_KEY:-}" ]; then
    SSH_OPTS="$SSH_OPTS -o IdentitiesOnly=yes -i ${SSH_KEY}"
  fi

  # BatchMode makes the probe fail fast instead of dropping to an interactive
  # password prompt. On success this connection becomes the shared master.
  if ssh $SSH_OPTS -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" true 2>/dev/null; then
    log_ok "Key auth → $SSH_TARGET (single multiplexed connection)"
  else
    if ! command -v sshpass >/dev/null 2>&1; then
      log_fail "No SSH key on $SSH_TARGET and sshpass not found."
      log_fail "  Preferred:  ssh-copy-id $SSH_TARGET"
      log_fail "  Or:         brew install hudochenkov/sshpass/sshpass"
      exit 1
    fi
    if [ -z "${SSH_PASSWORD:-}" ]; then
      log_fail "No SSH key on $SSH_TARGET and SSH_PASSWORD not set in .env."
      log_fail "  Fix once with: ssh-copy-id $SSH_TARGET"
      exit 1
    fi
    export SSHPASS="$SSH_PASSWORD"
    # -f backgrounds ssh once authenticated, so sshpass exits cleanly and the
    # master survives to serve every later step.
    if ! sshpass -e ssh $SSH_OPTS -N -f "$SSH_TARGET"; then
      log_fail "Password auth to $SSH_TARGET failed."
      log_fail "  If the password is correct, the server may be throttling logins"
      log_fail "  (pam_faillock / fail2ban). Check: ssh $SSH_TARGET 'tail -50 /var/log/auth.log'"
      exit 1
    fi
    log_warn "Password auth (sshpass) → $SSH_TARGET — one connection, then multiplexed."
    log_warn "  Switch to keys and drop SSH_PASSWORD from .env: ssh-copy-id $SSH_TARGET"
  fi

  # Every later step rides the master. BatchMode means that if the master dies
  # mid-deploy they fail loudly instead of hanging on an invisible prompt.
  local run_opts="$SSH_OPTS -o BatchMode=yes"
  SSH_CMD=(ssh $run_opts "$SSH_TARGET")
  RSYNC_BASE=(rsync -az --stats
              -e "ssh $run_opts"
              --exclude '.DS_Store')
}

remote_exec() {
  "${SSH_CMD[@]}" "$@"
}

# ─── Backup (remote, before upload) ──────────────────────────────

create_backup() {
  log_step "Pre-deploy backup on remote"
  BACKUP_PATH=$("${SSH_CMD[@]}" bash -s <<EOF
set -euo pipefail
DEPLOY_PATH='$DEPLOY_PATH'
RETENTION_DAYS='$BACKUP_RETENTION_DAYS'
if [ ! -d "\$DEPLOY_PATH" ]; then
  echo "SKIP"
  exit 0
fi
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP="\${DEPLOY_PATH}.backup_\${TIMESTAMP}"
rsync -a --exclude 'node_modules/' "\${DEPLOY_PATH}/" "\${BACKUP}/"
PARENT=\$(dirname "\$DEPLOY_PATH")
BASE=\$(basename "\$DEPLOY_PATH")
find "\$PARENT" -maxdepth 1 -name "\${BASE}.backup_*" -mtime +"\${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true
echo "\$BACKUP"
EOF
)
  if [ "$BACKUP_PATH" = "SKIP" ]; then
    BACKUP_PATH=""
    log_warn "No existing deploy dir — first deploy, backup skipped"
  else
    log_ok "Backup: $BACKUP_PATH (data/ included, node_modules/ excluded)"
    log_ok "Pruned backups older than ${BACKUP_RETENTION_DAYS} days"
  fi
}

# ─── Local build ─────────────────────────────────────────────────

build_local() {
  log_step "Build Tailwind CSS"
  npm run build:css --silent
  log_ok "Tailwind built"

  log_step "Build Vite client → dist/"
  npm run build --silent
  log_ok "Vite client built"

  TZ=America/New_York date > dist/build-date.txt
  BUILD_DATE=$(cat dist/build-date.txt)
  log_ok "Build date: $BUILD_DATE"
}

precompress_dist() {
  log_step "Pre-compress dist/ for nginx gzip_static"
  find dist -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" \
                     -o -name "*.svg" -o -name "*.xml" -o -name "*.txt" \
                     -o -name "*.webmanifest" \) \
    -exec gzip -9 -f -k {} \;
  log_ok "gzip -9 complete"
}

ensure_remote_dirs() {
  log_step "Ensure remote directories exist"
  remote_exec "mkdir -p '$DEPLOY_PATH/dist' '$DEPLOY_PATH/server' '$DEPLOY_PATH/data' '$DEPLOY_PATH/scripts'"
  log_ok "Remote dirs ready"
}

build_production_env() {
  log_step "Build sanitized production .env"
  TMP_ENV=$(mktemp)
  {
    echo "# Generated by upload.sh — do not edit on the server."
    echo "# Update your local .env and re-run ./upload.sh."
    echo "NODE_ENV=production"
    grep -E '^(PORT|TURNSTILE_SECRET|TURNSTILE_SITEKEY|SESSION_COOKIE|SESSION_TTL_HOURS|TOKEN_TTL_DAYS|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|MAIL_FROM|MAIL_CHECK_TO|MFA_ENCRYPTION_KEY|PADDLE_[A-Z_]+|GOOGLE_OAUTH_CLIENT_ID|APPLE_CLIENT_ID|OAUTH_VERIFY_MODE|APPLE_VERIFY_ENABLED|APPLE_BUNDLE_ID|PUBLIC_ORIGIN|ADMIN_EMAILS|PASSKEY_[A-Z_]+|IAP_[A-Z_]+|GOOGLE_VERIFY_ENABLED|GOOGLE_PLAY_[A-Z_]+|GOOGLE_PUBSUB_[A-Z_]+|CSP_ENFORCE|APNS_[A-Z_]+|FCM_[A-Z_]+|VAPID_[A-Z_]+|HOUSEHOLD_MAX_[A-Z_]+|SUBSCRIPTION_LINK_INBOX)=' .env || true
    # Plaid (Pro bank linking) — PRODUCTION keys only. Sandbox creds
    # (PLAID_SANDBOX_*) and the sandbox test-login helpers (PLAID_DEFAULT_USER*)
    # stay local and never ship to production.
    grep -E '^(PLAID_ENV|PLAID_CLIENT_ID|PLAID_SECRET|PLAID_PRODUCTION_SECRET|PLAID_WEBHOOK_URL|PLAID_REDIRECT_URI|PLAID_PRODUCTS|PLAID_COUNTRY_CODES)=' .env || true
  } > "$TMP_ENV"

  if ! grep -q '^TURNSTILE_SECRET=' "$TMP_ENV" || ! grep -q '^TURNSTILE_SITEKEY=' "$TMP_ENV"; then
    log_fail "Local .env missing TURNSTILE_SECRET and/or TURNSTILE_SITEKEY"
    exit 1
  fi
  if ! grep -qE '^MFA_ENCRYPTION_KEY=[0-9a-fA-F]{64}$' "$TMP_ENV"; then
    log_fail "Local .env must set MFA_ENCRYPTION_KEY (64 hex chars). Generate with: openssl rand -hex 32 — or copy data/mfa.key if migrating an existing server."
    exit 1
  fi
  # Mirror server/securityConfig.js assertProductionSafe(), against the
  # SANITIZED file rather than the local .env — a var that exists locally but
  # isn't on the allowlist above never reaches the server, and the failure mode
  # is the app exiting on boot after the deploy has already swung over.
  if grep -q '^APPLE_VERIFY_ENABLED=' "$TMP_ENV" && ! grep -q '^APPLE_BUNDLE_ID=' "$TMP_ENV"; then
    log_fail "APPLE_VERIFY_ENABLED is set but APPLE_BUNDLE_ID is not — the server refuses to boot without it (receipts must be pinned to this app). Add APPLE_BUNDLE_ID=app.fihaven to .env."
    exit 1
  fi
  if grep -q '^GOOGLE_VERIFY_ENABLED=' "$TMP_ENV" \
     && ! grep -q '^GOOGLE_PUBSUB_AUDIENCE=' "$TMP_ENV" \
     && ! grep -q '^PUBLIC_ORIGIN=' "$TMP_ENV"; then
    log_fail "GOOGLE_VERIFY_ENABLED is set but neither GOOGLE_PUBSUB_AUDIENCE nor PUBLIC_ORIGIN is — Play notifications would all be rejected."
    exit 1
  fi
  # Pin sandbox StoreKit purchases to the build we are shipping alongside this
  # server. Read from project.yml rather than .env so it can never drift from
  # what TestFlight actually has, and stamped on EVERY deploy so the previous
  # release's pin is replaced rather than accumulated.
  #
  # Both versions go in: Apple reports CFBundleVersion as the app version in
  # sandbox and the marketing version in production, and guessing wrong should
  # cost a fallback to --allow-sandbox, not a failed review.
  local ios_build ios_market
  ios_build="$(sed -n 's/^ *CURRENT_PROJECT_VERSION: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p' \
    "$REPO_ROOT/ios/FiHavenApp/project.yml" | head -1)"
  ios_market="$(sed -n 's/^ *MARKETING_VERSION: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p' \
    "$REPO_ROOT/ios/FiHavenApp/project.yml" | head -1)"
  if [ -n "$ios_build" ]; then
    echo "APPLE_SANDBOX_BUILD=$ios_build${ios_market:+,$ios_market}" >> "$TMP_ENV"
    log_ok "Sandbox purchases pinned to iOS build $ios_build${ios_market:+ ($ios_market)}"
  else
    log_warn "Could not read CURRENT_PROJECT_VERSION from project.yml — sandbox build pin not set."
    log_warn "  App Review will need --allow-sandbox until this is fixed."
  fi

  # APPLE_ALLOW_SANDBOX / GOOGLE_ALLOW_TEST_PURCHASES are intentionally absent
  # from the allowlist above: they are set ONLY here, only when --allow-sandbox
  # was passed, and only as deadlines. That way the window cannot be left open
  # by forgetting to edit .env back, and a plain deploy always closes it.
  if [ -n "$ALLOW_SANDBOX_DAYS" ]; then
    local until_iso
    until_iso="$(node -e 'process.stdout.write(new Date(Date.now()+Number(process.argv[1])*864e5).toISOString())' "$ALLOW_SANDBOX_DAYS")"
    echo "APPLE_ALLOW_SANDBOX=$until_iso" >> "$TMP_ENV"
    echo "GOOGLE_ALLOW_TEST_PURCHASES=$until_iso" >> "$TMP_ENV"
    log_warn "Apple SANDBOX + Play TEST purchases accepted until $until_iso (${ALLOW_SANDBOX_DAYS}d) — for App Review / TestFlight."
    log_warn "  Closes itself at that time; any later deploy without --allow-sandbox closes it immediately."
  fi
  log_ok "Production .env ready"
}

# Local-only: GOOGLE_PLAY_SA_LOCAL → remote GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
upload_play_service_account() {
  local local_path="${GOOGLE_PLAY_SA_LOCAL:-}"
  local remote_path="${GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:-}"
  if [ -z "$local_path" ] || [ -z "$remote_path" ]; then
    return 0
  fi
  if [ ! -f "$local_path" ]; then
    log_warn "GOOGLE_PLAY_SA_LOCAL not found ($local_path) — skipping Play SA upload"
    return 0
  fi
  log_step "Upload Google Play service account JSON"
  "${RSYNC_BASE[@]}" "$local_path" "$SSH_TARGET:$remote_path"
  remote_exec "chmod 600 '$remote_path'"
  log_ok "Play SA JSON → $remote_path"
}

upload_apns_key() {
  local local_path="${APNS_SA_LOCAL:-}"
  local remote_path="${APNS_KEY_PATH:-}"
  if [ -z "$local_path" ] || [ -z "$remote_path" ]; then return 0; fi
  if [ ! -f "$local_path" ]; then
    log_warn "APNS_SA_LOCAL not found ($local_path) — skipping APNs key upload"
    return 0
  fi
  log_step "Upload APNs key (.p8)"
  "${RSYNC_BASE[@]}" "$local_path" "$SSH_TARGET:$remote_path"
  remote_exec "chmod 600 '$remote_path'"
  log_ok "APNs key → $remote_path"
}

upload_fcm_service_account() {
  local local_path="${FCM_SA_LOCAL:-}"
  local remote_path="${FCM_SERVICE_ACCOUNT_JSON:-}"
  if [ -z "$local_path" ] || [ -z "$remote_path" ]; then return 0; fi
  if [ ! -f "$local_path" ]; then
    log_warn "FCM_SA_LOCAL not found ($local_path) — skipping FCM SA upload"
    return 0
  fi
  log_step "Upload Firebase service account JSON"
  "${RSYNC_BASE[@]}" "$local_path" "$SSH_TARGET:$remote_path"
  remote_exec "chmod 600 '$remote_path'"
  log_ok "FCM SA JSON → $remote_path"
}

upload_artifacts() {
  local dest="$SSH_TARGET:$DEPLOY_PATH"

  log_step "Upload dist/"
  "${RSYNC_BASE[@]}" --delete dist/ "$dest/dist/"
  log_ok "dist/ uploaded"

  log_step "Upload server/"
  "${RSYNC_BASE[@]}" --delete server/ "$dest/server/"
  log_ok "server/ uploaded"

  log_step "Upload scripts/ (production CLIs only)"
  "${RSYNC_BASE[@]}" --delete \
    --exclude 'dev/' --exclude 'examples/' --exclude 'README.md' \
    scripts/ "$dest/scripts/"
  log_ok "scripts/ uploaded"

  log_step "Upload package.json + package-lock.json"
  "${RSYNC_BASE[@]}" package.json package-lock.json "$dest/"
  log_ok "package files uploaded"

  upload_play_service_account
  upload_apns_key
  upload_fcm_service_account

  log_step "Upload production .env"
  "${RSYNC_BASE[@]}" "$TMP_ENV" "$dest/.env"
  remote_exec "chmod 600 '$DEPLOY_PATH/.env'"
  log_ok ".env uploaded (remote data/ untouched)"

  log_step "Lock down remote data/ permissions"
  remote_exec bash -s <<EOF
set -euo pipefail
DATA='$DEPLOY_PATH/data'
mkdir -p "\$DATA"
chmod 700 "\$DATA"
# DB + key files if present (ignore missing)
shopt -s nullglob 2>/dev/null || true
for f in "\$DATA"/*.db "\$DATA"/*.db-* "\$DATA"/mfa.key; do
  [ -e "\$f" ] && chmod 600 "\$f"
done
EOF
  log_ok "data/ is 700; DB/key files are 600"
}

remote_install_restart() {
  log_step "Remote npm ci + PM2 restart"
  remote_exec bash -s <<EOF
set -euo pipefail
cd '$DEPLOY_PATH'

if ! command -v make >/dev/null 2>&1 || ! command -v g++ >/dev/null 2>&1; then
  echo "🔹 Installing build toolchain (one-time)…"
  export DEBIAN_FRONTEND=noninteractive
  export NEEDRESTART_MODE=a
  export NEEDRESTART_SUSPEND=1
  export APT_LISTCHANGES_FRONTEND=none
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq -o Dpkg::Use-Pty=0 build-essential python3
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q make gcc gcc-c++ python3
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q make gcc gcc-c++ python3
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache make g++ python3
  else
    echo "ERROR: no supported package manager; install build-essential manually." >&2
    exit 1
  fi
fi

npm ci --omit=dev --no-audit --no-fund --loglevel=error
$REMOTE_RESTART_CMD
pm2 save >/dev/null 2>&1 || true
EOF
  log_ok "Dependencies installed and app restarted"
}

verify_deployment() {
  log_step "Verify deployment"

  # An unreachable server and a dead app are different failures. Conflating
  # them reported a perfectly healthy PM2 as offline whenever the SSH step
  # itself failed. ssh exits 255 on its own transport/auth errors (a remote
  # command exiting 255 is indistinguishable, but pm2/grep never do).
  local pm2_out pm2_rc=0
  pm2_out=$(remote_exec "pm2 status 2>/dev/null") || pm2_rc=$?
  if [ "$pm2_rc" -eq 255 ]; then
    log_fail "Could not reach $SSH_TARGET — deployment NOT verified."
    log_fail "  This says nothing about the app; it may well be running."
    log_fail "  Check by hand: ssh $SSH_TARGET 'pm2 status'"
    return 1
  fi
  if printf '%s' "$pm2_out" | grep -q online; then
    log_ok "PM2 process online"
  else
    log_fail "PM2 process not online"
    return 1
  fi

  if [ -z "${PUBLIC_ORIGIN:-}" ]; then
    log_warn "PUBLIC_ORIGIN not set — skipping HTTP check"
    return 0
  fi

  local health_url="${PUBLIC_ORIGIN%/}/health"
  local i
  for i in 1 2 3 4 5; do
    if curl -sf "$health_url" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
      log_ok "Health check: $health_url"
      return 0
    fi
    log_warn "Health not ready yet ($i/5)…"
    sleep 2
  done

  log_fail "Health check failed after 5 attempts: $health_url"
  return 1
}

submit_indexnow() {
  if [ -z "${INDEXNOW_KEY:-}" ]; then
    log_warn "INDEXNOW_KEY not set — skipping IndexNow"
    return 0
  fi
  log_step "Notify search engines (IndexNow)"
  if npm run indexnow --silent; then
    log_ok "IndexNow ping sent"
  else
    log_warn "IndexNow ping failed (deploy succeeded)"
  fi
}

cleanup_local() {
  log_step "Flush local caches"
  if [ -d node_modules/.cache ]; then
    rm -rf node_modules/.cache
  fi
  npm cache clean --force >/dev/null 2>&1 || true
  log_ok "Local caches cleared"
}

print_summary() {
  echo
  echo "═══════════════════════════════════════════════════════════"
  echo "  ✅ Deployment complete"
  echo "═══════════════════════════════════════════════════════════"
  echo "  Target:     $SSH_USER@$SSH_HOST:$DEPLOY_PATH"
  echo "  Build date: $BUILD_DATE"
  if [ -n "$BACKUP_PATH" ]; then
    echo "  Backup:     $BACKUP_PATH"
  fi
  if [ -n "${PUBLIC_ORIGIN:-}" ]; then
    echo "  URL:        $PUBLIC_ORIGIN"
  fi
  echo
  echo "  🔄 Hard-refresh the browser (Cmd+Shift+R) to see changes."
  echo "═══════════════════════════════════════════════════════════"
}

# ─── Main ────────────────────────────────────────────────────────

main() {
  echo
  echo "🚀 FiHaven deploy"
  echo "─────────────────"

  load_env
  apply_defaults
  sanity_check_repo

  echo "  📍 $SSH_USER@$SSH_HOST:$DEPLOY_PATH"
  echo

  setup_ssh_auth
  create_backup
  build_local
  precompress_dist
  ensure_remote_dirs
  build_production_env
  upload_artifacts
  remote_install_restart
  verify_deployment
  submit_indexnow
  cleanup_local
  print_summary
}

main "$@"
