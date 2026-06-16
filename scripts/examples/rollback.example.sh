#!/bin/bash
#
# FiHaven manual rollback — restore a pre-deploy backup on the VPS.
#
# Backups are created by scripts/examples/upload.example.sh before each deploy:
#   ${DEPLOY_PATH}.backup_YYYYMMDD_HHMMSS
#
# Usage:
#   bash scripts/examples/rollback.example.sh --list
#   bash scripts/examples/rollback.example.sh --latest
#   bash scripts/examples/rollback.example.sh --latest --yes
#   bash scripts/examples/rollback.example.sh /var/www/fihaven.app.backup_20260615_153045
#   bash scripts/examples/rollback.example.sh --data-only --latest
#
# Requires the same .env deploy keys as upload.sh (SSH_*, DEPLOY_PATH, etc.).

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
  echo "❌ Run from the FiHaven repo root."
  exit 1
fi
cd "$REPO_ROOT"

# ─── Logging ─────────────────────────────────────────────────────

log_step() { echo "🔹 $*"; }
log_ok()   { echo "✅ $*"; }
log_warn() { echo "⚠️  $*"; }
log_fail() { echo "❌ $*" >&2; }

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
  REMOTE_RESTART_CMD="${REMOTE_RESTART_CMD:-pm2 restart fihaven --update-env || pm2 start server/index.js --name fihaven --update-env}"

  if [ -z "${SSH_PASSWORD:-}" ]; then
    log_fail "SSH_PASSWORD not set in .env"
    exit 1
  fi
}

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
  log_ok "Password auth → $SSH_TARGET"
}

remote_exec() {
  "${SSH_CMD[@]}" "$@"
}

list_backups() {
  log_step "Available backups on $SSH_HOST"
  remote_exec bash -s <<EOF
set -euo pipefail
DEPLOY_PATH='$DEPLOY_PATH'
PARENT=\$(dirname "\$DEPLOY_PATH")
BASE=\$(basename "\$DEPLOY_PATH")
shopt -s nullglob
backups=( "\$PARENT/\${BASE}.backup_"* )
if [ \${#backups[@]} -eq 0 ]; then
  echo "(none)"
  exit 0
fi
for b in "\$(printf '%s\n' "\${backups[@]}" | sort -r)"; do
  when=\$(stat -c '%y' "\$b" 2>/dev/null | cut -d. -f1 || stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' "\$b" 2>/dev/null || echo '?')
  echo "\$b  (\$when)"
done
EOF
}

resolve_backup_path() {
  local arg="${1:-}"
  case "$arg" in
    --list)
      list_backups
      exit 0
      ;;
    --latest)
      SELECTED_BACKUP=$(remote_exec bash -s <<EOF
set -euo pipefail
DEPLOY_PATH='$DEPLOY_PATH'
PARENT=\$(dirname "\$DEPLOY_PATH")
BASE=\$(basename "\$DEPLOY_PATH")
shopt -s nullglob
backups=( "\$PARENT/\${BASE}.backup_"* )
if [ \${#backups[@]} -eq 0 ]; then exit 2; fi
printf '%s\n' "\${backups[@]}" | sort -r | head -1
EOF
) || {
        log_fail "No backups found for $DEPLOY_PATH"
        exit 1
      }
      ;;
    "")
      log_fail "Pass --list, --latest, or a backup path"
      echo "Usage: $0 [--list | --latest [--yes] | BACKUP_PATH] [--data-only]" >&2
      exit 1
      ;;
    --*)
      log_fail "Unknown option: $arg"
      exit 1
      ;;
    *)
      SELECTED_BACKUP="$arg"
      ;;
  esac
}

confirm_rollback() {
  local mode="$1"
  if [ "${ASSUME_YES:-0}" -eq 1 ]; then
    return 0
  fi
  echo
  log_warn "This will overwrite the live deploy at:"
  echo "       $DEPLOY_PATH"
  if [ "$mode" = "data-only" ]; then
    echo "       (data/ only, from $SELECTED_BACKUP)"
  else
    echo "       (full restore from $SELECTED_BACKUP, excluding node_modules/)"
  fi
  echo
  read -r -p "Type yes to continue: " answer
  if [ "$answer" != "yes" ]; then
    log_fail "Rollback cancelled"
    exit 1
  fi
}

perform_rollback() {
  local mode="$1"
  log_step "Stopping PM2 process"
  remote_exec "pm2 stop fihaven 2>/dev/null || true"
  log_ok "PM2 stopped (or was not running)"

  if [ "$mode" = "data-only" ]; then
    log_step "Restoring data/ from backup"
    remote_exec bash -s <<EOF
set -euo pipefail
BACKUP='$SELECTED_BACKUP'
LIVE='$DEPLOY_PATH'
if [ ! -d "\$BACKUP/data" ]; then
  echo "ERROR: backup has no data/ directory" >&2
  exit 1
fi
mkdir -p "\$LIVE/data"
rsync -a --delete "\$BACKUP/data/" "\$LIVE/data/"
EOF
    log_ok "data/ restored"
  else
    log_step "Restoring full deploy from backup"
    remote_exec bash -s <<EOF
set -euo pipefail
BACKUP='$SELECTED_BACKUP'
LIVE='$DEPLOY_PATH'
if [ ! -d "\$BACKUP" ]; then
  echo "ERROR: backup path does not exist: \$BACKUP" >&2
  exit 1
fi
mkdir -p "\$LIVE"
rsync -a --delete --exclude 'node_modules/' "\$BACKUP/" "\$LIVE/"
EOF
    log_ok "Files restored"
  fi

  log_step "npm ci + PM2 restart"
  remote_exec bash -s <<EOF
set -euo pipefail
cd '$DEPLOY_PATH'
npm ci --omit=dev --no-audit --no-fund --loglevel=error
$REMOTE_RESTART_CMD
pm2 save >/dev/null 2>&1 || true
EOF
  log_ok "App restarted"
}

verify_rollback() {
  if ! remote_exec "pm2 status 2>/dev/null | grep -q online"; then
    log_fail "PM2 process not online after rollback"
    return 1
  fi
  log_ok "PM2 process online"

  if [ -z "${PUBLIC_ORIGIN:-}" ]; then
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
  log_fail "HTTP check failed: $PUBLIC_ORIGIN"
  return 1
}

usage() {
  cat <<EOF
FiHaven rollback — restore a pre-deploy backup on the VPS.

Usage:
  $0 --list
  $0 --latest [--yes]
  $0 BACKUP_PATH [--yes]
  $0 --latest --data-only [--yes]

Options:
  --list       Show timestamped backups on the remote host
  --latest     Restore the newest backup
  --data-only  Restore only data/ (SQLite + MFA key), not code
  --yes        Skip confirmation prompt

Backups live next to DEPLOY_PATH, e.g.:
  /var/www/fihaven.app.backup_20260615_153045
EOF
}

main() {
  local mode="full"
  local backup_arg=""
  ASSUME_YES=0

  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help) usage; exit 0 ;;
      --yes) ASSUME_YES=1; shift ;;
      --data-only) mode="data-only"; shift ;;
      --list) backup_arg="--list"; shift ;;
      --latest) backup_arg="--latest"; shift ;;
      -*) log_fail "Unknown option: $1"; usage; exit 1 ;;
      *) backup_arg="$1"; shift ;;
    esac
  done

  echo
  echo "🔄 FiHaven rollback"
  echo "───────────────────"

  load_env
  apply_defaults
  setup_ssh_auth

  echo "  Live:   $DEPLOY_PATH"
  echo

  if [ "$backup_arg" = "--list" ]; then
    list_backups
    exit 0
  fi

  resolve_backup_path "$backup_arg"
  log_ok "Selected backup: $SELECTED_BACKUP"

  confirm_rollback "$mode"
  perform_rollback "$mode"
  verify_rollback

  echo
  echo "═══════════════════════════════════════════════════════════"
  echo "  Rollback complete"
  echo "═══════════════════════════════════════════════════════════"
  echo "  Restored from: $SELECTED_BACKUP"
  echo "  Live path:     $DEPLOY_PATH"
  if [ -n "${PUBLIC_ORIGIN:-}" ]; then
    echo "  URL:           $PUBLIC_ORIGIN"
  fi
  echo "═══════════════════════════════════════════════════════════"
}

main "$@"
