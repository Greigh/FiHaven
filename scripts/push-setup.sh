#!/usr/bin/env bash
# Interactive push credential setup for FiHaven.
# Does NOT commit secrets — copies keys into data/ and android/app/, updates .env.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TEAM_ID="365KR8NF53"
BUNDLE_ID="app.fihaven"
REMOTE_DATA="/var/www/fihaven.app/data"

log() { echo "→ $*"; }
ok()  { echo "✅ $*"; }
warn(){ echo "⚠️  $*"; }

ensure_env_line() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    warn ".env already has ${key}= — update manually if needed"
  else
    echo "${key}=${value}" >> .env
    ok "Appended ${key} to .env"
  fi
}

echo ""
echo "FiHaven push setup"
echo "=================="
echo "Team ID: ${TEAM_ID}  |  Bundle/package: ${BUNDLE_ID}"
echo ""

# ── APNs .p8 ─────────────────────────────────────────────────────
echo "Step 1 — APNs key (.p8)"
echo "  Create/download at: https://developer.apple.com/account/resources/authkeys/list"
echo "  Enable: Apple Push Notifications service (APNs)"
echo ""
DEFAULT_P8=""
if compgen -G "$HOME/Downloads/AuthKey_*.p8" > /dev/null; then
  DEFAULT_P8="$(ls -t "$HOME"/Downloads/AuthKey_*.p8 | head -1)"
  echo "  Found in Downloads: $(basename "$DEFAULT_P8")"
fi
read -r -p "Path to AuthKey_*.p8 [${DEFAULT_P8:-skip}]: " P8_SRC
P8_SRC="${P8_SRC:-$DEFAULT_P8}"
if [[ -n "$P8_SRC" && -f "$P8_SRC" ]]; then
  KEY_ID="$(basename "$P8_SRC" .p8 | sed 's/^AuthKey_//')"
  mkdir -p data
  P8_DEST="data/apns-key.p8"
  cp "$P8_SRC" "$P8_DEST"
  chmod 600 "$P8_DEST"
  ok "Copied APNs key → ${P8_DEST} (Key ID: ${KEY_ID})"
  ensure_env_line "APNS_KEY_ID" "$KEY_ID"
  ensure_env_line "APNS_TEAM_ID" "$TEAM_ID"
  ensure_env_line "APNS_BUNDLE_ID" "$BUNDLE_ID"
  ensure_env_line "APNS_PRODUCTION" "1"
  ensure_env_line "APNS_SA_LOCAL" "$P8_SRC"
  ensure_env_line "APNS_KEY_PATH" "${REMOTE_DATA}/apns-key.p8"
else
  warn "Skipped APNs key — add APNS_* to .env later"
fi

echo ""
echo "Step 2 — Firebase service account (server send)"
echo "  Firebase console → Project settings → Service accounts → Generate new private key"
read -r -p "Path to firebase *adminsdk*.json [skip]: " FCM_SRC
if [[ -n "$FCM_SRC" && -f "$FCM_SRC" ]]; then
  mkdir -p data
  FCM_DEST="data/firebase-sa.json"
  cp "$FCM_SRC" "$FCM_DEST"
  chmod 600 "$FCM_DEST"
  ok "Copied FCM SA → ${FCM_DEST}"
  ensure_env_line "FCM_SA_LOCAL" "$FCM_SRC"
  ensure_env_line "FCM_SERVICE_ACCOUNT_JSON" "${REMOTE_DATA}/firebase-sa.json"
else
  warn "Skipped FCM service account"
fi

echo ""
echo "Step 3 — google-services.json (Android app)"
echo "  Firebase → Add Android app → package ${BUNDLE_ID} → download JSON"
echo "  (NOT the BlueBubbles file — package must be app.fihaven)"
read -r -p "Path to google-services.json [skip]: " GS_SRC
if [[ -n "$GS_SRC" && -f "$GS_SRC" ]]; then
  PKG="$(node -e "const j=require('fs').readFileSync('$GS_SRC','utf8'); const p=JSON.parse(j); console.log(p.client?.[0]?.client_info?.android_client_info?.package_name||'');")"
  if [[ "$PKG" != "$BUNDLE_ID" ]]; then
    warn "Package in JSON is '${PKG}', expected '${BUNDLE_ID}' — wrong file?"
    read -r -p "Copy anyway? [y/N]: " CONF
    [[ "${CONF,,}" == "y" ]] || { warn "Skipped google-services.json"; GS_SRC=""; }
  fi
  if [[ -n "$GS_SRC" ]]; then
    cp "$GS_SRC" android/app/google-services.json
    ok "Copied → android/app/google-services.json"
  fi
else
  warn "Skipped google-services.json"
fi

echo ""
echo "Step 4 — Apple Developer portal (manual)"
echo "  1. Enable Push Notifications on App ID app.fihaven:"
echo "     https://developer.apple.com/account/resources/identifiers/bundleId/edit/app.fihaven"
echo "  2. Xcode → Download Manual Profiles (team ${TEAM_ID})"
echo ""

if command -v node >/dev/null; then
  node scripts/push-check.js || true
fi

echo ""
ok "Local setup done. Deploy with ./upload.sh to push credentials + .env to production."
echo "   Full guide: docs/push-setup.md"
echo ""
