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
# Required in .env (repo root, gitignored):
#   SSH_PASSWORD=<VPS password>
# Optional:
#   SSH_USER, SSH_HOST, DEPLOY_PATH, REMOTE_RESTART_CMD, BACKUP_RETENTION_DAYS
#   PUBLIC_ORIGIN (used for post-deploy HTTP check and summary URL)

set -euo pipefail

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

  if [ -z "${SSH_PASSWORD:-}" ]; then
    log_fail "SSH_PASSWORD not set in .env"
    exit 1
  fi
}

sanity_check_repo() {
  if [ ! -f package.json ] || [ ! -d server ] || [ ! -d client ]; then
    log_fail "Missing package.json, server/, or client/ — run from repo root"
    exit 1
  fi
}

# ─── SSH / rsync ─────────────────────────────────────────────────

setup_ssh_auth() {
  log_step "SSH authentication"
  if ! command -v sshpass >/dev/null 2>&1; then
    log_fail "sshpass not found — install with: brew install hudochenkov/sshpass/sshpass"
    exit 1
  fi
  export SSHPASS="$SSH_PASSWORD"
  SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
  SSH_TARGET="$SSH_USER@$SSH_HOST"
  SSH_CMD=(sshpass -e ssh $SSH_OPTS "$SSH_TARGET")
  RSYNC_BASE=(sshpass -e rsync -az --stats
              -e "ssh $SSH_OPTS"
              --exclude '.DS_Store')
  log_ok "Password auth → $SSH_TARGET"
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
    grep -E '^(PORT|TURNSTILE_SECRET|TURNSTILE_SITEKEY|SESSION_COOKIE|SESSION_TTL_HOURS|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|MAIL_FROM|MAIL_CHECK_TO|MFA_ENCRYPTION_KEY|STRIPE_[A-Z_]+|GOOGLE_OAUTH_CLIENT_ID|APPLE_CLIENT_ID|OAUTH_VERIFY_MODE|PUBLIC_ORIGIN|ADMIN_EMAILS|PASSKEY_[A-Z_]+|IAP_[A-Z_]+|GOOGLE_VERIFY_ENABLED|GOOGLE_PLAY_[A-Z_]+|APNS_[A-Z_]+|FCM_[A-Z_]+)=' .env || true
    # Plaid (Pro bank linking) — PRODUCTION keys only. Sandbox creds
    # (PLAID_SANDBOX_*) and the sandbox test-login helpers (PLAID_DEFAULT_USER*)
    # stay local and never ship to production.
    grep -E '^(PLAID_ENV|PLAID_CLIENT_ID|PLAID_SECRET|PLAID_PRODUCTION_SECRET|PLAID_WEBHOOK_URL|PLAID_REDIRECT_URI|PLAID_PRODUCTS|PLAID_COUNTRY_CODES)=' .env || true
  } > "$TMP_ENV"

  if ! grep -q '^TURNSTILE_SECRET=' "$TMP_ENV" || ! grep -q '^TURNSTILE_SITEKEY=' "$TMP_ENV"; then
    log_fail "Local .env missing TURNSTILE_SECRET and/or TURNSTILE_SITEKEY"
    exit 1
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

  if remote_exec "pm2 status 2>/dev/null | grep -q online"; then
    log_ok "PM2 process online"
  else
    log_fail "PM2 process not online"
    return 1
  fi

  if [ -z "${PUBLIC_ORIGIN:-}" ]; then
    log_warn "PUBLIC_ORIGIN not set — skipping HTTP check"
    return 0
  fi

  local i
  for i in 1 2 3 4 5; do
    if curl -sf "$PUBLIC_ORIGIN" >/dev/null; then
      log_ok "HTTP check: $PUBLIC_ORIGIN"
      return 0
    fi
    log_warn "Site not responding yet ($i/5)…"
    sleep 2
  done

  log_fail "HTTP check failed after 5 attempts: $PUBLIC_ORIGIN"
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
