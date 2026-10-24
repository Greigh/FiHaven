#!/usr/bin/env bash
set -euo pipefail

# The Android half of the visual review matrix: the same screens, states and
# presentations run-ios.sh / run-macos.sh photograph, driven through `adb`
# intent extras on a debug build.
#
# The emulator reaches the dev server at 10.0.2.2; build with
#   ./gradlew -PfhApiBase=http://10.0.2.2:5222 :app:assembleDebug
# once, then this script installs and sweeps.
#
#   scripts/run-android.sh --sweep                # 14 screens x 5 states + More/Pro/Settings
#   scripts/run-android.sh --only bills,payoff --states happy,free
#   scripts/run-android.sh --delay 14             # slower settle
#
# The tab list is TabId's in MainScaffold.kt — the More route reaches every
# one regardless of the account's saved bottom-bar layout, which is what the
# iOS sweep's FH_SCREEN does by tag.
#
# Environment variables override the defaults:
#   FH_DEV_EMAIL / FH_DEV_PASSWORD   populated Pro account (default: the dev seed)
#   FH_SWEEP_EMPTY_EMAIL / _PASSWORD the empty account (same defaults as iOS)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PKG="app.fihaven"
ACTIVITY="$PKG/.MainActivity"
OUT="/tmp/fh-sweep-android"
DELAY=8
ONLY=""
STATES=""

while [ $# -gt 0 ]; do
  case "$1" in
    --sweep) ;;
    --out) shift; OUT="${1:-}" ;;
    --delay) shift; DELAY="${1:-}" ;;
    --only) shift; ONLY="${1:-}" ;;
    --states) shift; STATES="${1:-}" ;;
    -h|--help) sed -n '/^# The Android/,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "run-android: unknown argument '$1'" >&2; exit 2 ;;
  esac
  shift
done

DEV_EMAIL="${FH_DEV_EMAIL:-ipad@example.com}"
DEV_PASSWORD="${FH_DEV_PASSWORD:-IpAd-Demo-Pass!2026}"
EMPTY_EMAIL="${FH_SWEEP_EMPTY_EMAIL:-fhsweep-empty@fihaven.app}"
EMPTY_PASSWORD="${FH_SWEEP_EMPTY_PASSWORD:-demopassword11}"

# The screen matrix: every TabId, plus the More-level destinations. Each cell
# is `raw|Title` — the same names the iOS/Mac table carries so the three
# sweeps read as one review.
SCREENS=(
  "dashboard|Home" "bills|Bills" "cards|Cards" "loans|Loans" "payoff|Payoff"
  "rewards|Rewards" "income|Income" "budget|Budget" "spending|Spending"
  "subscriptions|Subscriptions" "calendar|Calendar" "history|History"
  "networth|Net Worth" "balances|Account Balances"
  "more|More menu" "pro|FiHaven Pro" "settings|Settings"
)

# States mirror SWEEP_STATES on iOS: which account and which extras.
# `offline`+`error` both land on the data-error screen via the `datafault`
# extra — Android's DataErrorScreen covers them as one presentation.
state_env() {
  case "$1" in
    happy)   printf -- '--es login_email %s --es login_pass %s --es entitlement active' "$DEV_EMAIL" "$DEV_PASSWORD" ;;
    empty)   printf -- '--es login_email %s --es login_pass %s' "$EMPTY_EMAIL" "$EMPTY_PASSWORD" ;;
    free)    printf -- '--es login_email %s --es login_pass %s --es entitlement free' "$DEV_EMAIL" "$DEV_PASSWORD" ;;
    offline) printf -- '--es login_email %s --es login_pass %s --ez datafault true' "$DEV_EMAIL" "$DEV_PASSWORD" ;;
    error)   printf -- '--es login_email %s --es login_pass %s --ez datafault true' "$DEV_EMAIL" "$DEV_PASSWORD" ;;
  esac
}

want_screen() {
  [ -z "$ONLY" ] && return 0
  case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac
}
want_state() {
  [ -z "$STATES" ] && return 0
  case ",$STATES," in *",$1,"*) return 0 ;; *) return 1 ;; esac
}

rm -rf "$OUT"; mkdir -p "$OUT"
"$ADB" install -r "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" >/dev/null 2>&1

idx=0; missing=0; flagged=0
for entry in "${SCREENS[@]}"; do
  raw="${entry%%|*}"; title="${entry#*|}"
  want_screen "$raw" || continue
  for state in happy empty free offline error; do
    want_state "$state" || continue
    idx=$((idx + 1))
    stem="$(printf '%02d-%s__%s' "$idx" "$raw" "$state")"
    png="$OUT/$stem.png"; log="$OUT/$stem.log"
    printf 'run-android: [%3d] %-19s %-8s → %s.png\n' "$idx" "$title" "$state" "$stem"
    "$ADB" shell am force-stop "$PKG" >/dev/null 2>&1
    # shellcheck disable=SC2046
    "$ADB" shell am start -W -n "$ACTIVITY" --ez autologin true \
      $(state_env "$state") \
      --es tab more --es route "$raw" >"$log" 2>&1
    sleep "$DELAY"
    "$ADB" exec-out screencap -p > "$png" 2>/dev/null
    bytes=$(stat -f%z "$png" 2>/dev/null || echo 0)
    # A cold start on a software-GPU emulator can still be on the launch
    # splash when the timer runs out — a flat-colour capture is the tell.
    # Wait once more rather than record a raced frame.
    if [ "$bytes" -lt 30000 ]; then
      sleep "$DELAY"
      "$ADB" exec-out screencap -p > "$png" 2>/dev/null
      bytes=$(stat -f%z "$png" 2>/dev/null || echo 0)
    fi
    note="ok"
    [ "$bytes" -lt 40000 ] && { note="looks blank (${bytes}B)"; flagged=$((flagged + 1)); }
    [ "$bytes" -eq 0 ] && { missing=$((missing + 1)); }
    printf '%s|%s|%s|%s.png|%sB|%s\n' "$idx" "$state" "$title" "$stem" "$bytes" "$note" >> "$OUT/rows.txt"
  done
done

echo
echo "run-android: $((idx - missing))/$idx captured, $missing missing, $flagged flagged"
echo "run-android: PNGs and logs in $OUT"
