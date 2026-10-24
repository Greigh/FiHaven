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
PRESENTS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --sweep) ;;
    --presents) PRESENTS=1 ;;
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
if [ -z "$PRESENTS" ]; then
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
fi

if [ -n "$PRESENTS" ]; then
  # The presentation matrix: every dialog/editor/sheet that `present=` can
  # mount, over the real signed-in shell — the same coverage FH_PRESENT gives
  # the Apple sweeps. `expect` is text the mounted presentation must contain;
  # the UI dump check is the mount evidence (a capture without it is invalid).
  PRESENT_MATRIX=(
    "bill-new|New Bill sheet|bills||New Bill"
    "bill-edit|Edit Bill sheet|bills||Edit Bill"
    "pay|Pay dialog|bills||Pay ·"
    "bill-filters|Filter bills sheet|bills||Filter bills"
    "card-new|New Card sheet|cards||New Card"
    "card-edit|Edit Card sheet|cards||Edit Card"
    "pay-card|Pay card dialog|cards||Pay ·"
    "card-filters|Filter cards sheet|cards||Filter cards"
    "account-new|New Account sheet|balances||New Account"
    "account-edit|Edit Account sheet|balances||Edit Account"
    "goal-new|New Goal sheet|budget||New Goal"
    "goal-edit|Edit Goal sheet|budget||Edit Goal"
    "tx-new|Add Transaction sheet|spending||Add Transaction"
    "tx-edit|Edit Transaction sheet|spending||Edit Transaction"
    "category-budgets|Category budgets sheet|spending||Category budgets"
    "income-new|New Income sheet|income||New Income"
    "income-edit|Edit Income sheet|income||Edit Income"
    "income-adj-new|New Adjustment sheet|income||New Adjustment"
    "income-adj-edit|Adjustment sheet|income||Adjustment"
    "edit-payment|Edit payment sheet|history||Edit payment"
    "sub-edit|Edit subscription bill|subscriptions||Edit Bill"
    "manage-link|Manage link dialog|subscriptions||Manage link"
    "rollover-review|Rollover review|dashboard||Review this month's bills"
    "rate-report|Rate report dialog|rewards||Report a wrong rate"
    "group:account|Settings·Account|more|settings|Account"
    "group:security|Settings·Security|more|settings|Security"
    "group:preferences|Settings·Preferences|more|settings|Preferences"
    "group:budget|Settings·Budget|more|settings|Budget"
    "group:notifications|Settings·Notifications|more|settings|Notifications"
    "group:family|Settings·Family|more|settings|Family"
    "group:automation|Settings·Automation|more|settings|Automation"
    "group:bank|Settings·Bank|more|settings|Bank"
    "group:data|Settings·Data|more|settings|Data"
    "group:about|Settings·Help & about|more|settings|Help"
    "dialog:name|Settings·Name sheet|more|settings|Name"
    "dialog:email|Settings·Change email|more|settings|Change email"
    "dialog:password|Settings·Change password|more|settings|Change password"
    "dialog:clear|Settings·Clear data|more|settings|Clear data"
    "dialog:delete|Settings·Delete account|more|settings|Delete account"
    "dialog:totpSetup|Settings·Authenticator setup|more|settings|authenticator"
    "dialog:passkeys|Settings·Passkeys|more|settings|Passkey"
    "dialog:emailEnable|Settings·Email codes|more|settings|Email codes"
    "dialog:emailDisable|Settings·Email codes off|more|settings|Email codes"
    "dialog:backup|Settings·Backup codes|more|settings|Backup codes"
    "dialog:timezone|Settings·Time zone|more|settings|Time zone"
    "dialog:period|Settings·Budget period|more|settings|Budget period"
    "dialog:autopayhour|Settings·Auto-mark time|more|settings|Auto-mark time"
    "dialog:leaddays|Settings·Remind me|more|settings|Remind me"
    "dialog:notifyhour|Settings·Send at|more|settings|Send at"
    "dialog:dashboardlayout|Settings·Dashboard layout|more|settings|Dashboard layout"
    "dialog:currency|Settings·Currency|more|settings|Currency"
    "dialog:defaultview|Settings·Default view|more|settings|Default view"
    "dialog:appearance|Settings·Appearance|more|settings|Appearance"
    "dialog:biolock|Settings·Stay unlocked|more|settings|Stay unlocked"
    "dialog:licenses|Settings·Licenses|more|settings|Open-source licenses"
    "dialog:tabs|Settings·Customize tabs|more|settings|Customize tabs"
    "paywall|Paywall sheet|more|settings|FiHaven Pro"
    "bank-import-prompt|Bank import prompt|more|settings|Bank linked"
    "bank-balance-prompt|Bank balance prompt|more|settings|balance"
  )

  total=${#PRESENT_MATRIX[@]}
  for entry in "${PRESENT_MATRIX[@]}"; do
    IFS='|' read -r spec title tab route expect <<< "$entry"
    if [ -n "$ONLY" ]; then
      case ",$ONLY," in *",$spec,"*|*",${entry%%|*},"*) ;; *) continue ;; esac
    fi
    idx=$((idx + 1))
    stem="$(printf '%02d-%s' "$idx" "$(echo "$spec" | tr ':/' '--')")"
    png="$OUT/$stem.png"; log="$OUT/$stem.log"
    printf 'run-android: [%3d/%3d] %-24s → %s.png\n' "$idx" "$total" "$title" "$stem"
    "$ADB" shell am force-stop "$PKG" >/dev/null 2>&1
    "$ADB" shell am start -W -n "$ACTIVITY" --ez autologin true \
      --es login_email "$DEV_EMAIL" --es login_pass "$DEV_PASSWORD" \
      --es present "$spec" ${tab:+--es tab "$tab"} ${route:+--es route "$route"} \
      >"$log" 2>&1
    sleep "$DELAY"
    # Mount evidence: the UI dump must contain the presentation's own text.
    # The dump can race a mounting dialog — retry once before flagging.
    dump="$OUT/$stem.xml"
    for attempt in 1 2; do
      "$ADB" shell uiautomator dump /sdcard/fh-sweep.xml >/dev/null 2>&1
      "$ADB" exec-out cat /sdcard/fh-sweep.xml > "$dump" 2>/dev/null
      grep -qi "$expect" "$dump" 2>/dev/null && break
      [ "$attempt" -eq 1 ] && sleep 4
    done
    "$ADB" exec-out screencap -p > "$png" 2>/dev/null
    bytes=$(stat -f%z "$png" 2>/dev/null || echo 0)
    note="ok"
    if ! grep -qi "$expect" "$dump" 2>/dev/null; then
      note="MOUNT MISSING ('$expect' not in dump)"; flagged=$((flagged + 1))
    fi
    [ "$bytes" -lt 40000 ] && { note="$note looks blank (${bytes}B)"; flagged=$((flagged + 1)); }
    [ "$bytes" -eq 0 ] && { missing=$((missing + 1)); }
    printf '%s|%s|%s|%s.png|%sB|%s\n' "$idx" "present" "$title" "$stem" "$bytes" "$note" >> "$OUT/rows.txt"
  done
fi

echo
echo "run-android: $((idx - missing))/$idx captured, $missing missing, $flagged flagged"
echo "run-android: PNGs and logs in $OUT"
