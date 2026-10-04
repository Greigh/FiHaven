#!/usr/bin/env bash
set -euo pipefail

# Builds, installs and launches the Debug build of the app on an iOS Simulator,
# with the debug environment hooks already set, and photographs the same screen
# matrix `run-macos.sh` photographs on the Mac.
#
# The two are the same review. The screen list, the five states and the closing
# table come from `sweep-matrix.sh`, so a screen that regresses on the phone and
# a screen that regresses on the Mac are found the same way — and a review that
# only covered one of them was covering half the app, which is how the two
# drifted apart in the first place.
#
# What differs is entirely in how a capture is taken, and both differences are
# forced by the platform:
#
#   1. `simctl` photographs, not the app. `FH_SNAPSHOT` renders the app's own
#      window through AppKit and is compiled out where there is no AppKit; the
#      simulator has no such thing, and `simctl io screenshot` is the
#      equivalent — it is also the only one of the two that photographs the
#      whole screen, so an iOS capture *has* the tab bar and the status bar
#      where a Mac capture has the window's chrome.
#   2. The screen list needs a route, and on iOS no single hook is one. A tab
#      in the bottom bar is not a row in More, and which of the two a screen is
#      depends on the account: the user's own tab layout, and the entitlement,
#      because Free users give up a bottom slot to "Get Pro". `payoff` is a
#      bottom tab for a Pro account and a More row for a free one. So the sweep
#      names a screen with `FH_SCREEN` and the shell resolves where it lives,
#      logging `[Shell] screen=<raw> via=<tab|more>` — the line the table's
#      "rendered" check reads, because a PNG cannot say which screen it is.
#
# Usage:
#   scripts/run-ios.sh                            # build, install, launch, stay in front
#   scripts/run-ios.sh --no-build --device ipad   # the iPad, without rebuilding
#   scripts/run-ios.sh --sweep                    # 17 screens x 5 states on an iPhone
#   scripts/run-ios.sh --sweep --device all       # ...and the same on an iPad
#   scripts/run-ios.sh --seconds 20 FH_SCREEN=budget
#
# Options:
#   --no-build      use the app already in the derived data (still reinstalls it)
#   --device KIND   iphone (default), ipad, all — or a simulator UDID
#   --seconds N     stop after N seconds instead of running until Ctrl-C
#   --sweep         photograph every screen in every state, then print a table
#   --out DIR       --sweep output directory (default /tmp/fh-sweep-ios, cleared
#                   first; one subdirectory per device, so a two-device run
#                   keeps its captures apart)
#   --delay N       --sweep seconds to settle before each capture (default 8)
#   --only a,b      --sweep a subset, by screen name (e.g. bills,cards)
#   --states a,b    --sweep a subset, by state (default: all of them)
#   --diff DIR      after the sweep, compare it against an earlier sweep in DIR
#                   and report which screens moved (see scripts/sweep-diff.js).
#                   Usable without --sweep to compare two runs you already have:
#                   `--diff OLD --out NEW`
#
# The sweep is a matrix — every screen in every state — because a sweep of
# populated screens photographs the state the fixtures were built to produce and
# nothing else. The states worth seeing are the ones with the least data in them:
#
#   happy     a Pro subscriber with data — what a paying user sees
#   empty     a verified account with no rows at all
#   free      the same account on the free tier, so every paywall is showing
#   offline   the server cannot be reached
#   error     the server answers 503
#
# `happy` and `free` are a matched pair on purpose. Five screens (payoff,
# rewards, subscriptions, calendar, history) are behind the paywall, and a sweep
# that left `happy` on the dev account's free entitlement photographed those as
# the upsell rather than as the screens themselves — a whole release review
# quietly substituting the paywall for the product it was meant to check.
#
# That is 17 x 5 = 85 launches per device at the default delay, so it is a
# deliberate run rather than a per-commit one. Narrow either axis when you do not
# need all of it: `--only bills,rewards --states happy,free` is four captures.
#   -h, --help
#
# Anything else of the form KEY=VALUE becomes the app's environment, so every
# hook in ios/README.md works. They reach the app through `SIMCTL_CHILD_`,
# which is the only way a `simctl launch` hands one over — a raw `launch` takes
# no environment of its own, and a flag the app cannot see is a flag that
# silently did not run.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$ROOT/ios/FiHavenApp"
PROJECT="$PROJECT_DIR/FiHaven.xcodeproj"
SPEC="$PROJECT_DIR/project.yml"
DERIVED="${FH_IOS_DERIVED_DATA:-/tmp/fh-ios/dd}"
APP="$DERIVED/Build/Products/Debug-iphonesimulator/FiHaven.app"
# The same bundle id the Mac and TestFlight builds carry: one app record, and
# `simctl launch` wants the id rather than a path.
BUNDLE="app.fihaven"

BUILD=1
RUN_FOR=""
SWEEP=0
DEVICE=""
OUT_DIR="/tmp/fh-sweep-ios"
SWEEP_DELAY=8
ONLY=""
STATES=""
DIFF_OLD=""
declare -a PASSTHROUGH=()

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    --seconds) shift; RUN_FOR="${1:-}" ;;
    --sweep) SWEEP=1 ;;
    --device) shift; DEVICE="${1:-}" ;;
    --out) shift; OUT_DIR="${1:-}" ;;
    --delay) shift; SWEEP_DELAY="${1:-}" ;;
    --only) shift; ONLY="${1:-}" ;;
    --states) shift; STATES="${1:-}" ;;
    --diff) shift; DIFF_OLD="${1:-}" ;;
    -h|--help) sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *=*) PASSTHROUGH+=("$1") ;;
    *) echo "run-ios: unknown argument '$1' — try --help" >&2; exit 2 ;;
  esac
  shift
done

if [ -n "$RUN_FOR" ] && ! [[ "$RUN_FOR" =~ ^[0-9]+$ ]]; then
  echo "run-ios: --seconds wants a whole number, got '$RUN_FOR'" >&2
  exit 2
fi

if [ "$SWEEP" = "1" ]; then
  if ! [[ "$SWEEP_DELAY" =~ ^[0-9]+$ ]]; then
    echo "run-ios: --delay wants a whole number, got '$SWEEP_DELAY'" >&2
    exit 2
  fi
fi

# Debug defaults, overridable by a KEY=VALUE argument, which is applied after
# these so the last word is always the caller's.
#
# No path: the server serves at its own root, and the app appends `/api/...`
# itself. The simulator shares the host's network, so `localhost` here is the
# same `localhost` the dev server is on — which is also what
# `#if targetEnvironment(simulator)` in `AppEnvironment` is for.
export FH_BASE="${FH_BASE:-http://localhost:5222}"
export FH_SKIP_STOREKIT="${FH_SKIP_STOREKIT:-1}"
# The screens are all signed-in screens, so a sweep always signs in. The
# credentials are only filled in when the caller asked for it, because the dev
# account only exists on a server that has it; the `empty` state brings its own.
if [ "${FH_AUTOLOGIN:-}" = "1" ] || [ "$SWEEP" = "1" ]; then
  export FH_AUTOLOGIN=1
  export FH_DEV_EMAIL="${FH_DEV_EMAIL:-ipad@example.com}"
  export FH_DEV_PASSWORD="${FH_DEV_PASSWORD:-IpAd-Demo-Pass!2026}"
fi

# A local server that isn't running is the usual reason every photograph comes
# back identical, so say so rather than making the next person read the table.
BASE_HOSTPORT="$(printf '%s' "$FH_BASE" | sed -E 's#^[a-z]+://([^/]+).*#\1#')"
BASE_PORT="${BASE_HOSTPORT##*:}"
BASE_HOST="${BASE_HOSTPORT%%:*}"
SERVER_DOWN=0

# The screen list, the state table, the tally and the closing table.
. "$SCRIPT_DIR/sweep-matrix.sh"

# The liveness check needs `sweep_is_local_host`, so it lives after the source
# rather than beside the URL parsing above it. Only a loopback base is probed:
# a port that answers nothing on a remote host says something about that
# network, not about whether the server a sweep needs is up.
if [ "$BASE_PORT" != "$BASE_HOSTPORT" ] && sweep_is_local_host "$BASE_HOST" \
   && ! nc -z 127.0.0.1 "$BASE_PORT" 2>/dev/null; then
  SERVER_DOWN=1
  echo "run-ios: nothing is listening on $BASE_HOST:$BASE_PORT — start it with \`npm run dev:server\`" >&2
fi

# ── the device ──────────────────────────────────────────────────────────────
#
# Named rather than hard-coded, because the set of simulators installed moves
# with every Xcode and a name that is gone is a script that refuses to run on
# the machine that needs it. `all` is a *kind* sweep, not every device: an
# iPhone and an iPad, which is the two sizes the store listings are reviewed
# at. The newest runtime wins, so a machine with two runtimes installed sweeps
# the one it would be testing on.
#
# The same shape as the runner image's device pick in .github/workflows/ios.yml,
# for the same reason: a model named in a script is a model to update by hand.
device_for() {
  python3 - "$1" <<'PY'
import json, subprocess, sys
kind = sys.argv[1]
list_ = json.loads(subprocess.run(
    ["xcrun", "simctl", "list", "devices", "available", "--json"],
    capture_output=True, text=True, check=True).stdout)["devices"]
# iPad before iPhone in the families so "iPad" never matches an "iPhone".
wanted = {"iphone": "iPhone", "ipad": "iPad"}[kind]
# Newest runtime first. The keys are
# com.apple.CoreSimulator.SimRuntime.iOS-27-0, which sorts correctly
# lexically for the two-digit majors Xcode ships.
for runtime in sorted(list_, reverse=True):
    for dev in list_[runtime]:
        name = dev["name"]
        if wanted in name and dev.get("isAvailable", True):
            print(dev["udid"] + "\t" + name)
            sys.exit(0)
sys.exit(1)
PY
}

name_for_udid() {
  xcrun simctl list devices --json 2>/dev/null | python3 -c '
import json, sys
udid = sys.argv[1]
for runtime, devices in json.load(sys.stdin)["devices"].items():
    for d in devices:
        if d["udid"] == udid:
            print(d["name"]); raise SystemExit
' "$1"
}

# A directory-safe name for the device, so `--device all` keeps two runs of the
# same screen apart instead of one overwriting the other.
slug() {
  printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'
}

# Boot and wait. `bootstatus -b` is the part that matters: `boot` returns as
# soon as it has asked, and a screenshot taken against a simulator still coming
# up is a screenshot of the lock screen — which is a real, plausible-looking PNG
# of the wrong thing, and the one failure here that no other check catches.
boot_device() {
  local udid="$1"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1 || true
}

# ── build and install ───────────────────────────────────────────────────────
build_app() {
  local udid="$1"
  if [ "$BUILD" = "1" ]; then
    if ! command -v xcodegen >/dev/null 2>&1; then
      echo "run-ios: xcodegen is missing — brew install xcodegen" >&2
      return 1
    fi
    # The project is generated (and git-ignored), so regenerate it when the spec
    # is newer — or when any source file is, since a new .swift file does not
    # touch project.yml and would otherwise never reach the build.
    if [ ! -d "$PROJECT" ] || [ "$SPEC" -nt "$PROJECT/project.pbxproj" ] \
      || [ -n "$(find "$PROJECT_DIR/Sources" -name '*.swift' -newer "$PROJECT/project.pbxproj" -print -quit 2>/dev/null)" ]; then
      (cd "$PROJECT_DIR" && xcodegen generate >/dev/null)
    fi
    echo "run-ios: building $PROJECT_DIR (Debug, unsigned, for $udid)"
    local build_log; build_log="$(mktemp -t fihaven-ios-build)"
    if ! xcodebuild build -project "$PROJECT" -scheme FiHaven \
          -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$DERIVED" \
          CODE_SIGNING_ALLOWED=NO >"$build_log" 2>&1; then
      echo "run-ios: build failed" >&2
      grep -E "^/.*error:|^error:" "$build_log" | sort -u | head -20 >&2
      echo "run-ios: full log at $build_log" >&2
      return 1
    fi
    rm -f "$build_log"
    echo "run-ios: build ok"
  fi
  if [ ! -d "$APP" ]; then
    echo "run-ios: no app at $APP — drop --no-build" >&2
    return 1
  fi
  # Every cell is a fresh launch, and a fresh launch has to be the build under
  # review: an app left installed from a previous sweep is how a run photographs
  # code that is not on the branch.
  xcrun simctl install "$udid" "$APP"
}

# ── the environment the app is launched with ────────────────────────────────
#
# `simctl launch` takes no environment of its own; `SIMCTL_CHILD_` is how one
# is handed over, and a hook that does not arrive is a hook that did not run.
# Built as an `env` argument vector rather than exported into this shell, so
# one cell's `FH_DEV_ENTITLEMENT=free` is not still set on the next cell's
# `FH_DEV_ENTITLEMENT=active`.
launch_env() {
  local -a envv=()
  local key value kv
  for key in FH_BASE FH_SKIP_STOREKIT FH_AUTOLOGIN FH_DEV_EMAIL FH_DEV_PASSWORD; do
    value="${!key:-}"
    [ -n "$value" ] && envv+=("SIMCTL_CHILD_$key=$value")
  done
  for kv in ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"} $1; do
    envv+=("SIMCTL_CHILD_${kv%%=*}=${kv#*=}")
  done
  printf '%s\n' "${envv[@]}"
}

# One cell: launch, let it settle, photograph the screen, stop it.
#
# The app is launched with `--console` in the background so its `fhLog` output
# lands in this cell's own log, which is where the screen, the entitlement and
# the fault evidence come from. No pty: `simctl io screenshot` is a separate
# process that does not need the app's terminal, and a pty here would only add
# a way for the run to hang.
capture_cell() {
  local udid="$1" png="$2" log="$3" state_env="$4" raw="$5" delay="$6"
  local -a envv=()
  local envv_one
  while IFS= read -r envv_one; do envv+=("$envv_one"); done < <(launch_env "$state_env")
  envv+=("SIMCTL_CHILD_FH_SCREEN=$raw")
  xcrun simctl terminate "$udid" "$BUNDLE" 2>/dev/null || true
  sleep 1
  env "${envv[@]}" xcrun simctl launch --console "$udid" "$BUNDLE" >"$log" 2>&1 &
  local runner=$!
  sleep "$delay"
  # `--type=png` is the default; stated so a future `--type=heic` on this line
  # cannot quietly make every `sips` probe below report `?`.
  xcrun simctl io "$udid" screenshot --type=png "$png" >/dev/null 2>&1 || true
  xcrun simctl terminate "$udid" "$BUNDLE" 2>/dev/null || true
  wait "$runner" 2>/dev/null || true
}

# ── the sweep ───────────────────────────────────────────────────────────────
sweep_device() {
  local udid="$1" name="$2" out="$3"

  if [ "$SERVER_DOWN" = "1" ]; then
    echo "run-ios: --sweep needs the server at $FH_BASE — every screen would capture the offline state" >&2
    return 1
  fi

  local chosen chosen_states
  # `happy` and `free` are added to each other: they are one review, and a sweep
  # of one without the other photographs five paywalls as if they were screens
  # (or misses the gate entirely). The states come out in the table's order
  # whatever order they were asked for in, so the Pro run is always captured
  # before the free one and is always there to compare against.
  local added
  added="$(sweep_tiers_complete "$STATES")"
  if [ -n "$added" ]; then
    echo "run-ios: --states also sweeping $added — the two tiers are one review, and a Pro screen photographed as a paywall is the failure the pair exists to catch"
    STATES="${STATES:+$STATES,}$added"
  fi
  chosen="$(sweep_choose run-ios --only "$ONLY" "$(printf '%s\n' "${SWEEP_SCREENS[@]}")")" || return $?
  chosen_states="$(sweep_choose run-ios --states "$STATES" "$(sweep_states)")" || return $?

  # Counted through a here-string, not an unquoted expansion: half these rows
  # are titles with spaces in them, and word-splitting them counts 3 screens
  # as 4 and 3 states as 16.
  local screens states
  screens="$(grep -c . <<< "$chosen" || true)"
  states="$(grep -c . <<< "$chosen_states" || true)"
  local total=$((screens * states))

  local per_state="" entry raw title state state_entry
  local seed
  while IFS= read -r seed; do
    [ -n "$seed" ] || continue
    per_state="$per_state$(sweep_field "$seed" 1)|0|0
"
  done <<< "$chosen_states"

  rm -rf "$out"
  mkdir -p "$out"

  # Every state except `empty` signs in as the dev account, and that account is a
  # property of the *server's* database rather than of this script. Against a
  # database that has never had it, the app cannot sign in, and then `happy`,
  # `free`, `offline` and `error` all photograph the sign-in screen — four states
  # of five, silently, at the right size with the right screen name in the log.
  #
  # It is checked rather than seeded unconditionally, because seeding
  # `ipad@example.com` with `--force` on every sweep would wipe a real person's
  # local rows to save them a command. One request decides, and the remedy is
  # only taken when it is needed.
  if [ "$total" -gt 0 ] && sweep_needs_dev_account "$chosen_states"; then
    local dev_email="${FH_DEV_EMAIL:-ipad@example.com}"
    local dev_password="${FH_DEV_PASSWORD:-IpAd-Demo-Pass!2026}"
    local dev_why
    if ! dev_why="$(sweep_can_sign_in "$FH_BASE" "$dev_email" "$dev_password" 2>&1)"; then
      echo "run-ios: $dev_email cannot sign in at $FH_BASE — seeding it for this run" >&2
      local -a dev_seed_env=()
      if [ -z "${FIHAVEN_DB_PATH:-}" ]; then
        local dev_server_db; dev_server_db="$(sweep_server_db "$FH_BASE")"
        [ -n "$dev_server_db" ] && dev_seed_env=(FIHAVEN_TEST_DB_PATH="$dev_server_db")
      fi
      # `--create`: against a database that has never held this account there
      # is nothing to verify, and without it the seeder refuses to make one.
      if ! env ${dev_seed_env[@]+"${dev_seed_env[@]}"} node "$SCRIPT_DIR/seed-user-data.js" "$dev_email" \
           --create --verify --onboard --pro --password "$dev_password" \
           >"$out/00-dev-account.log" 2>&1; then
        cat "$out/00-dev-account.log" >&2
        echo "run-ios: could not prepare the dev account $dev_email — every state but empty needs it" >&2
        return 1
      fi
      if ! dev_why="$(sweep_can_sign_in "$FH_BASE" "$dev_email" "$dev_password" 2>&1)"; then
        echo "run-ios: $dev_email still cannot sign in after seeding, so every state but empty would photograph the sign-in screen." >&2
        echo "run-ios:   the server said: $dev_why" >&2
        return 1
      fi
      echo "run-ios: $dev_email seeded into $(grep -o 'Database: .*' "$out/00-dev-account.log" | tail -1 | sed 's/Database: //')" >&2
    fi
  fi

  # The empty state signs in as an account with no rows, which has to exist and
  # be verified before the run: an unverified one photographs the verify screen
  # on every row of the table, seventeen times over. Preparation belongs to the
  # script whose job is preparing accounts, so it is asked for here rather than
  # grown here.
  if [ "$total" -gt 0 ] && grep -q '^empty|' <<< "$chosen_states"; then
    local empty_email="${FH_SWEEP_EMPTY_EMAIL:-fhsweep-empty@fihaven.app}"
    local empty_password="${FH_SWEEP_EMPTY_PASSWORD:-demopassword11}"
    # Seed into the database the server is actually using. The seeder resolves
    # the path from its own environment and the simulator signs in against
    # whatever is listening, so without this the two can name different files —
    # and then the account below is real in a database nothing serves. An
    # explicit `FIHAVEN_DB_PATH` in the caller's environment still wins: that is
    # how a deliberate override is spelled, and the sweep should not overrule it.
    local -a seed_env=()
    if [ -z "${FIHAVEN_DB_PATH:-}" ]; then
      local server_db; server_db="$(sweep_server_db "$FH_BASE")"
      [ -n "$server_db" ] && seed_env=(FIHAVEN_TEST_DB_PATH="$server_db")
    fi
    # `--password` because the sweep is about to sign in as this account and the
    # seeder's own default agreeing with the sweep's default is a coincidence
    # that stops being true the first time either one is changed.
    if ! env ${seed_env[@]+"${seed_env[@]}"} node "$SCRIPT_DIR/seed-user-data.js" "$empty_email" \
         --empty --verify --onboard --force --password "$empty_password" \
         >"$out/00-empty-account.log" 2>&1; then
      cat "$out/00-empty-account.log" >&2
      echo "run-ios: could not prepare the empty account $empty_email — the empty state needs it" >&2
      return 1
    fi
    # The seeder resolves the database from its own environment; the simulator
    # signs in against whatever server is listening, and those are two separate
    # resolutions. When they disagree the account does not exist as far as the
    # app is concerned and every `empty` capture is the sign-in screen — at the
    # right size, with the right screen name in the log, and `ok` in the table.
    if ! why="$(sweep_can_sign_in "$FH_BASE" "$empty_email" "$empty_password" 2>&1)"; then
      echo "run-ios: $empty_email cannot sign in at $FH_BASE, so the empty state would photograph the sign-in screen." >&2
      echo "run-ios:   the server said: $why" >&2
      echo "run-ios:   seeded into: $(grep -o 'Database: .*' "$out/00-empty-account.log" | tail -1 | sed 's/Database: //')" >&2
      # Only a wrong password or an unknown account points at the database. A
      # captcha or rate-limit refusal says the request never got that far, and
      # telling the reader to seed a different file would send them off to fix
      # something that is not broken.
      case "$why" in
        *invalid-credentials*)
          echo "run-ios:   the server does not know that account. It is probably using a different database:" >&2
          echo "run-ios:     FIHAVEN_DB_PATH=<the server's database> scripts/run-ios.sh --sweep …" >&2
          ;;
        *captcha*)
          echo "run-ios:   the login route refused the captcha. A dev server wants the always-pass secret:" >&2
          echo "run-ios:     TURNSTILE_SECRET=1x0000000000000000000000000000000AA node server/index.js" >&2
          ;;
        *rate-limited*)
          echo "run-ios:   the login route is rate-limited this address (5 per 15 min). Wait, or start the server with DISABLE_RATE_LIMIT=1." >&2
          ;;
      esac
      return 1
    fi
  fi

  echo
  echo "run-ios: $name ($udid) — $screens screen(s) x $states state(s) = $total into $out"
  # Booted before installed: `simctl install` needs a running simulator, and a
  # build does not.
  boot_device "$udid"
  build_app "$udid" || return 1

  local started=$SECONDS idx=0 missing=0 flagged=0
  local -a rows=()
  local seen="" happy_seen=""
  # Each screen's `happy` bytes and what its Pro gate said — the baseline for
  # "must differ from happy" and for the free tier's gate check alike. A
  # newline-joined `raw hash gate` list, because `/bin/bash` on macOS is 3.2 and
  # has never had `declare -A`.
  # The screen size this device photographs at, taken from the first capture.
  # There is no table of simulator screen sizes to ask for — `simctl list` does
  # not have one, and a hard-coded one is wrong on the next device — so the run
  # establishes it and every later capture is checked against it. A capture at
  # a different size is a different device, a stale file, or a screenshot taken
  # of something that is not the app.
  local device_pixels=""

  # Screen-major, state-minor: the state column beside each screen says "this is
  # what Bills looks like when it is empty, and when the server is gone" without
  # asking the reader to hold five pictures in their head at once.
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    raw="$(sweep_field "$entry" 1)"
    title="$(sweep_field "$entry" 2)"

    while IFS= read -r state_entry; do
      [ -n "$state_entry" ] || continue
      idx=$((idx + 1))
      state="$(sweep_field "$state_entry" 1)"
      local state_env state_evidence state_differs
      state_env="$(sweep_field "$state_entry" 3)"
      state_evidence="$(sweep_field "$state_entry" 4)"
      state_differs="$(sweep_field "$state_entry" 5)"

      # Deltas, not the running totals: `missing` and `flagged` accumulate over
      # the whole sweep, so folding them in per capture would count every
      # earlier capture's problems again.
      local before_missing=$missing before_flagged=$flagged
      # The state goes in the filename, not just the table: 85 PNGs in one
      # directory are unreadable, and the state is the thing you cannot recover
      # from the contents of the picture.
      local stem; stem="$(printf '%02d-%s__%s' "$idx" "$raw" "$state")"
      local png="$out/$stem.png"
      local log="$out/$stem.log"

      printf 'run-ios: [%3d/%3d] %-19s %-8s → %s.png\n' "$idx" "$total" "$title" "$state" "$stem"

      capture_cell "$udid" "$png" "$log" "$state_env" "$raw" "$SWEEP_DELAY"

      local note="" pixels="—" size="—" gate_word="—"
      if [ ! -f "$png" ]; then
        note="no capture — see $(basename "$log")"
        missing=$((missing + 1))
      else
        local bytes; bytes="$(stat -f%z "$png" 2>/dev/null || echo 0)"
        pixels="$(file_pixels "$png")"
        size="$(file_size "$bytes")"
        [ -n "$device_pixels" ] || device_pixels="$pixels"

        # The one thing a file on disk cannot tell you: which screen the app had
        # selected when `simctl` took the picture. A mismatch means `FH_SCREEN`
        # did not land, which is the failure a full table of plausible PNGs
        # would hide — and on iOS it is likelier than on the Mac, because the
        # route depends on the account's tab layout and its entitlement.
        local rendered; rendered="$(grep -o 'screen=[a-z]*' "$log" | tail -1 | cut -d= -f2)"
        if [ -z "$rendered" ]; then
          note="$(note_join "$note" "screen unconfirmed")"
        elif [ "$rendered" != "$raw" ]; then
          note="$(note_join "$note" "rendered '$rendered'")"
        fi
        # Whether this capture is the product or the upsell, from the app's own
        # answer. On the phone this is the state that most needs saying out
        # loud: five of the seventeen screens are paywalls for a free account,
        # and without the column a `free` sweep is seventeen rows that all say
        # `ok`.
        local gate; gate="$(sweep_gate "$log")"
        gate_word="$(sweep_gate_word "$gate")"
        local gate_note; gate_note="$(sweep_gate_finding "$state" "$gate")"
        if [ -n "$gate_note" ]; then
          note="$(note_join "$note" "$gate_note")"
        fi
        # The state has to say it happened: a state that sets itself up has to
        # say so in its own log, because a PNG cannot tell a paywall from a
        # product and the run that cannot tell them is the one that photographs
        # the wrong one and calls it a review. Every state has to have signed
        # in, or the capture is the sign-in screen.
        if [ -n "$state_evidence" ]; then
          local missing_evidence
          missing_evidence="$(sweep_evidence_missing "$log" "$state_evidence")"
          if [ -n "$missing_evidence" ]; then
            note="$(note_join "$note" "no '$missing_evidence' in log")"
          fi
        fi
        if [ "$bytes" -lt "$SWEEP_BLANK_BYTES" ]; then
          note="$(note_join "$note" "looks blank at $size")"
        fi
        if [ -n "$device_pixels" ] && [ "$pixels" != "$device_pixels" ]; then
          note="$(note_join "$note" "got $pixels, device is $device_pixels")"
        fi
        # Two screens with the same bytes means the route did not apply — the
        # one failure a sweep has to notice, because the table would otherwise
        # report a full set of captures.
        local hash; hash="$(shasum -a 256 "$png" | cut -d' ' -f1)"
        if [ -n "$seen" ]; then
          local twin; twin="$(printf '%s' "$seen" | grep -m1 "^$hash " | cut -d' ' -f2)"
          [ -n "$twin" ] && note="$(note_join "$note" "identical to $twin")"
        fi
        seen="$seen$hash $stem.png
  "
        # The same screen in a state that *has* to look different, photographed
        # exactly as `happy` did. The file-level check above catches two
        # identical captures, but not a whole column that is wrong in the same
        # direction — which is what a fault hook that did not compile looks like.
        # Only meaningful when `happy` is in the run, since that is the baseline.
        if [ "$state_differs" = "yes" ]; then
          local baseline
          baseline="$(printf '%s' "$happy_seen" | awk -v k="$raw" '$1 == k { print $2; exit }')"
          if [ -n "$baseline" ] && [ "$baseline" = "$hash" ]; then
            note="$(note_join "$note" "same as happy")"
          fi
        elif [ "$state" = "happy" ]; then
          happy_seen="$happy_seen$raw $hash $gate
"
        elif [ "$state" = "free" ]; then
          # The gate the Pro run showed on this screen, read from the log rather
          # than from a list of gated screens — so it cannot name the wrong five.
          local pro_gate
          pro_gate="$(printf '%s' "$happy_seen" | awk -v k="$raw" '$1 == k { print $3; exit }')"
          gate_note="$(sweep_gate_missing_note "$pro_gate" "$state" "$gate")"
          if [ -n "$gate_note" ]; then
            note="$(note_join "$note" "$gate_note")"
          fi
        fi
      fi
      [ -n "$note" ] || note="ok"
      [ "$note" = "ok" ] || flagged=$((flagged + 1))
      rows+=("$(printf '%s|%s|%s|%s.png||%s|%s|%s|%s' "$idx" "$state" "$title" "$stem" "$pixels" "$size" "$gate_word" "$note")")
      per_state="$(printf '%s' "$per_state" | awk -F'|' -v k="$state" \
          -v m="$((missing - before_missing))" -v f="$((flagged - before_flagged))" '
        $1 == k { print $1 "|" $2 + m "|" $3 + f; next } { print }')"
    done <<< "$chosen_states"
  done <<< "$chosen"

  local seconds=$((SECONDS - started))
  sweep_table run-ios "" "$(printf '%s\n' ${rows[@]+"${rows[@]}"})" "$per_state" "$screens"
  echo "run-ios: $name — $((total - missing))/$total captured, $missing missing, $flagged flagged, ${seconds}s"
  echo "run-ios: device screen: ${device_pixels:-unknown}"
  echo "run-ios: PNGs and per-screen app logs in $out"
  # Once per run, not once per device: on `--device all` each device's table
  # would otherwise compare the whole baseline tree. The diff walks all of
  # `--out`, pairing devices by name, so one call covers every device.
  if [ -n "$DIFF_OLD" ] && [ "$out" = "$OUT_DIR/$(slug "$name")" ]; then
    sweep_diff run-ios "$SCRIPT_DIR" "$DIFF_OLD" "$OUT_DIR"
  fi

  # A sweep that quietly produced nothing is worse than no sweep, so a missing
  # capture fails the run. A duplicate or a flat image is a judgement call, and
  # the table is where that judgement gets made.
  [ "$missing" = "0" ] || return 1
  return 0
}

# ── which devices, and then what ────────────────────────────────────────────
resolve_devices() {
  case "$DEVICE" in
    ""|iphone|ipad)
      local kind="${DEVICE:-iphone}"
      local picked; picked="$(device_for "$kind")" || {
        echo "run-ios: no $kind simulator is installed — 'xcrun simctl list devices available'" >&2
        return 1
      }
      printf '%s\n' "$picked"
      ;;
    all)
      device_for iphone >/dev/null 2>&1 || { echo "run-ios: no iPhone simulator installed" >&2; return 1; }
      device_for ipad   >/dev/null 2>&1 || { echo "run-ios: no iPad simulator installed" >&2; return 1; }
      device_for iphone
      device_for ipad
      ;;
    *)
      # A UDID, so a sweep can be run on a device this script would not have
      # chosen — an iPad mini, a landscape fixture, the simulator a bug is only
      # on.
      printf '%s\t%s\n' "$DEVICE" "$(name_for_udid "$DEVICE")"
      ;;
  esac
}

main() {
  # `--diff OLD` without `--sweep` compares two runs you already have, which is
  # the form you want the morning after: sweep on the branch, sweep on main, and
  # the question is what moved. Nothing is built and no device is touched.
  if [ -n "$DIFF_OLD" ] && [ "$SWEEP" != "1" ]; then
    if [ ! -d "$OUT_DIR" ]; then
      echo "run-ios: nothing to compare — $OUT_DIR does not exist. Give the newer run with --out, or add --sweep to take one." >&2
      exit 2
    fi
    sweep_diff run-ios "$SCRIPT_DIR" "$DIFF_OLD" "$OUT_DIR"
    return 0
  fi
  local list; list="$(resolve_devices)" || exit 2
  local rc=0
  local line udid name
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    IFS=$'\t' read -r udid name <<< "$line"
    [ -n "$name" ] || name="$udid"
    if [ "$SWEEP" = "1" ]; then
      sweep_device "$udid" "$name" "$OUT_DIR/$(slug "$name")" || rc=$?
    else
      single_run "$udid" "$name" || rc=$?
    fi
  done <<< "$list"
  return $rc
}

# Not the sweep: build, install, launch once and stay in front of it, which is
# the hand-run mode `run-macos.sh` has and the reason to reach for a phone at
# all. `--seconds N` bounds it.
single_run() {
  local udid="$1" name="$2"
  local -a envv=()
  local envv_one
  while IFS= read -r envv_one; do envv+=("$envv_one"); done < <(launch_env "")
  boot_device "$udid"
  build_app "$udid" || return 1
  echo "run-ios: $name ($udid)  FH_BASE=$FH_BASE  autologin=${FH_AUTOLOGIN:-0}"
  xcrun simctl terminate "$udid" "$BUNDLE" 2>/dev/null || true
  env "${envv[@]}" xcrun simctl launch --console "$udid" "$BUNDLE" &
  local runner=$!
  if [ -n "$RUN_FOR" ]; then
    sleep "$RUN_FOR"
    xcrun simctl terminate "$udid" "$BUNDLE" 2>/dev/null || true
    wait "$runner" 2>/dev/null || true
    echo "run-ios: stopped"
  else
    echo "run-ios: running — Ctrl-C to stop"
    wait "$runner" 2>/dev/null || true
  fi
}

main
