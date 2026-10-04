#!/usr/bin/env bash
set -euo pipefail

# Builds and launches the Debug macOS build of the app, with the debug
# environment hooks already set, for UI work that needs the real app rather
# than a simulator.
#
# Three things a hand-rolled one-liner gets wrong, and this fixes:
#
#   1. OS_ACTIVITY_MODE=disable. macOS mirrors os_log activity into whatever
#      stderr the app was started with — WebKit's helper processes,
#      launchservicesd, TCC, the pasteboard server, IconServices — so a first
#      run reads as ~120 lines of other processes' complaints around the app's
#      own handful of `fhLog` lines. Verified with a minimal WKWebView host:
#      127 lines with the mirror on, 2 with it off.
#   2. A left-over instance. Without killing the previous one, the launch does
#      nothing visible and the log you read is the old process's.
#   3. Production. The Xcode scheme points FH_BASE at fihaven.app because that
#      is what a device build wants; a UI pass wants the local server — at its
#      root, with no path on it.
#
# Usage:
#   scripts/run-macos.sh                       # build, launch, stay in front
#   scripts/run-macos.sh --no-build
#   scripts/run-macos.sh --seconds 10 FH_TAB=bills FH_SNAPSHOT=/tmp/bills.png
#   scripts/run-macos.sh FH_AUTOLOGIN=1        # sign in as the dev account
#   scripts/run-macos.sh --seconds 26 FH_AUTOLOGIN=1 FH_REMOUNT=3
#                                              # ...and rebuild the root view 3x
#   scripts/run-macos.sh --sweep               # every Mac screen → /tmp/fh-sweep
#   scripts/run-macos.sh --install             # build Release → /Applications/FiHaven.app
#   scripts/run-macos.sh --sign                # build Apple-signed, report what it grants
#   scripts/run-macos.sh --install --sign      # ...and install the signed app
#
# Options:
#   --no-build      use the binary already in the derived data
#   --install       build the app, replace the copy in the applications folder
#                   with it, and stop — no launch, no dev hooks, no server. The
#                   build is Release unless --config says otherwise, and the
#                   previous copy is removed first. It refuses to touch the App
#                   Store app, which shares its bundle id (ios/README.md)
#   --config NAME   Debug (default) or Release; --install defaults it to Release
#   --sign          build with real code signing instead of
#                   CODE_SIGNING_ALLOWED=NO: an Apple certificate, the app's
#                   entitlements, and an embedded Mac Team provisioning profile
#                   for app.fihaven. Needs an Apple-issued certificate in the
#                   login keychain and Xcode signed in to the account that owns
#                   the app record; ios/README.md, "Signing a local build", says
#                   what it buys and what it costs. Signed builds get their own
#                   derived data (/tmp/fh-mac-signed) and --sign --sweep is
#                   refused, because a sandboxed build cannot write /tmp
#   --seconds N     stop after N seconds instead of running until Ctrl-C
#   --sweep         photograph every Mac screen in every state, then print a
#                   table of what landed
#   --out DIR       --sweep output directory (default /tmp/fh-sweep, cleared first)
#   --delay N       --sweep seconds to settle before each capture (default 5)
#   --size WxH      --sweep window size, through FH_WINDOW (default 1440x900)
#   --only a,b      --sweep a subset, by screen name (e.g. bills,cards)
#   --states a,b    --sweep a subset, by state (default: all of them)
#   --diff DIR      after the sweep, compare it against an earlier sweep in DIR
#                   and report which screens moved (see scripts/sweep-diff.js)
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
# `happy` and `free` are a matched pair on purpose. Four screens (rewards,
# calendar, subscriptions, history) are behind the paywall, and a sweep that
# left `happy` on the dev account's free entitlement photographed those four as
# the upsell rather than as the screens themselves — a whole release review
# quietly substituting the paywall for the product it was meant to check.
#
# That is 17 x 5 = 85 launches at the default delay, so it is a deliberate run
# rather than a per-commit one. Narrow either axis when you do not need all of
# it: `--only bills,cards --states empty,free` is four captures.
# `--install` produces the shipped app rather than a harness run: Release, its
# own derived data, `ditto`'d into the applications folder (FH_MAC_APPS_DIR
# moves it, default /Applications), registered with LaunchServices, then it
# stops. It replaces what is already there, so it removes the old bundle first —
# and it will not delete the App Store copy, which claims the same bundle id.
#
#   -h, --help
#
# The sweep: one launch per screen, because the app photographs its own window
# and has no way to walk its screens in a single run. Each one gets its own PNG
# and its own app log in --out, named `<NN>-<screen>.png` in `TabCatalog`'s
# order (the sidebar itself follows the user's own arrangement), so two sweeps
# are comparable file by file. Every window
# is pinned to one size with FH_WINDOW, which is the Mac's stand-in for the iOS
# FH_VIEWPORT hook — a Mac window is resizable, so without it the size would be
# whatever the last person dragged it to, and the layout breakpoints (the page
# cap starts biting above 1180pt) would differ from shot to shot.
#
# It signs in as the dev account, since the screens are the signed-in shell, and
# refuses to start when nothing is listening on FH_BASE: every one of the 17
# launches would otherwise capture the offline state. Exit status is 0 only when
# every screen in the sweep produced a file; duplicates and near-empty files are
# flagged in the table rather than failing it.
#
# The app inherits this script's stdio, so `fhLog` arrives live in a terminal
# and a copy is a redirect away: `scripts/run-macos.sh --seconds 10 > run.log`.
# Nothing here allocates a pty: `script` can only drive one when its own stdio is
# a terminal, and chaining it through one made the run hang rather than end when
# the app was stopped. That used to cost redirected runs their log — stdout is
# block-buffered off a terminal and a killed process never flushes — so `fhLog`
# writes to unbuffered stderr instead, and a `--seconds` run keeps every line it
# printed up to the kill.
#
# Anything else of the form KEY=VALUE becomes the app's environment, so every
# hook in ios/README.md works: FH_TAB, FH_ROUTE, FH_SCREEN, FH_SNAPSHOT,
# FH_SNAPSHOT_DELAY, FH_DUMP_VIEWS, FH_KEYS, FH_VIEWPORT, FH_WINDOW,
# FH_INTRO_SEEN, FH_INTRO_STEP, FH_ONBOARDING, FH_BIO_DEMO, FH_REMOUNT,
# FH_REMOUNT_DELAY, FH_SKIP_STOREKIT, FH_DEV_ENTITLEMENT, FH_BASE,
# FH_AUTOLOGIN, FH_SESSION_SAVE_NOTICE, FH_DIAG_FRAME.
#
# FH_ONBOARDING=<n> is how the post-signup wizard gets photographed: it opens
# that step for an account that has finished it, and un-gates the wizard in the
# first place. `n` indexes the steps this run shows (so it skips App Lock where
# there is no biometric); pair it with FH_BIO_DEMO=1 to see that step anyway.
#
# FH_DEV_ENTITLEMENT=active is what a *review* sweep wants: four screens
# (rewards, calendar, subscriptions, history) are behind the paywall for the
# free dev account, so without it they photograph as the upsell rather than as
# the screens themselves.
#
# The signed-out first view is the default: the app restores whatever session
# the Keychain holds, so sign out in the app (or delete the item:
# `security delete-generic-password -s app.fihaven -a bearer-token`) to see the
# intro/auth screens, or pass FH_AUTOLOGIN=1 for the signed-in shell.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT/ios/FiHavenApp"
PROJECT="$PROJECT_DIR/FiHaven.xcodeproj"
SPEC="$PROJECT_DIR/project.yml"
BUILD=1
INSTALL=0
SIGN=0
CONFIG=""
APPS_DIR="${FH_MAC_APPS_DIR:-/Applications}"
RUN_FOR=""
SWEEP=0
STATES=""
# The data-free account the `empty` state signs in as is
# `FH_SWEEP_EMPTY_EMAIL` / `FH_SWEEP_EMPTY_PASSWORD`, and the defaults for both
# live with the state table in `sweep-matrix.sh` so the two sweeps cannot
# disagree about which account `empty` means.
OUT_DIR="/tmp/fh-sweep"
SWEEP_DELAY=5
SWEEP_SIZE="1440x900"
ONLY=""
DIFF_OLD=""
declare -a PASSTHROUGH=()

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    --install) INSTALL=1 ;;
    --sign) SIGN=1 ;;
    --config) shift; CONFIG="${1:-}" ;;
    --seconds) shift; RUN_FOR="${1:-}" ;;
    --sweep) SWEEP=1 ;;
    --out) shift; OUT_DIR="${1:-}" ;;
    --delay) shift; SWEEP_DELAY="${1:-}" ;;
    --size) shift; SWEEP_SIZE="${1:-}" ;;
    --only) shift; ONLY="${1:-}" ;;
    --states) shift; STATES="${1:-}" ;;
    --diff) shift; DIFF_OLD="${1:-}" ;;
    -h|--help) sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *=*) PASSTHROUGH+=("$1") ;;
    *) echo "run-macos: unknown argument '$1' — try --help" >&2; exit 2 ;;
  esac
  shift
done

# How the sweep re-invokes itself, so a screen's launch is the *same* code path
# as a hand-run one — the build check, the environment, the kill. `$0` alone is
# whatever the caller typed (npm runs `bash ./scripts/run-macos.sh`), which a
# child started after a `cd` could not resolve.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -n "$RUN_FOR" ] && ! [[ "$RUN_FOR" =~ ^[0-9]+$ ]]; then
  echo "run-macos: --seconds wants a whole number, got '$RUN_FOR'" >&2
  exit 2
fi

if [ "$SWEEP" = "1" ]; then
  if ! [[ "$SWEEP_DELAY" =~ ^[0-9]+$ ]]; then
    echo "run-macos: --delay wants a whole number, got '$SWEEP_DELAY'" >&2
    exit 2
  fi
  if ! [[ "$SWEEP_SIZE" =~ ^[0-9]+x[0-9]+$ ]]; then
    echo "run-macos: --size wants WxH, got '$SWEEP_SIZE'" >&2
    exit 2
  fi
fi

if [ "$INSTALL" = "1" ] && [ "$SWEEP" = "1" ]; then
  echo "run-macos: --install and --sweep are different runs — one replaces the app in $APPS_DIR, the other photographs the Debug build" >&2
  exit 2
fi

# A signed build is sandboxed, and a sandboxed app cannot write a snapshot
# outside its own container — FH_SNAPSHOT points the app at /tmp, so every
# capture of such a sweep would be refused and the table would report a missing
# file per screen. Refused up front rather than half-run: the sweep's build is
# the unsigned one (FH_MAC_DERIVED_DATA=/tmp/fh-mac-unsigned).
if [ "$SIGN" = "1" ] && [ "$SWEEP" = "1" ]; then
  echo "run-macos: --sign and --sweep are different builds — a signed app is sandboxed and cannot write FH_SNAPSHOT under /tmp" >&2
  echo "run-macos:   sweep the unsigned build instead: FH_MAC_DERIVED_DATA=/tmp/fh-mac-unsigned scripts/run-macos.sh --no-build --sweep" >&2
  exit 2
fi

if [ -n "$CONFIG" ] && [ "$CONFIG" != "Debug" ] && [ "$CONFIG" != "Release" ]; then
  echo "run-macos: --config wants Debug or Release, got '$CONFIG'" >&2
  exit 2
fi

# ── what gets built, and where it goes ──────────────────────────────────────
#
# A run wants the Debug build: dev hooks, `fhLog` lines, the
# `app.fihaven.debug` keychain service, in the harness's own derived data. An
# install wants the *shipped* app, because that is what the Dock and Launchpad
# are for — a Debug app launched by LaunchServices reads no `FH_*` from anyone's
# environment, so it would be the Debug app (asserts, logging, the debug keychain
# service, dev affordances compiled in) while looking exactly like the shipped
# one. So `--install` defaults to Release, in its own derived data.
#
# Both are overridable rather than fixed: `--config Debug` installs the harness
# build instead (`FH_MAC_DERIVED_DATA=/tmp/fh-mac-unsigned ios/README.md`), and
# either derived data path can be moved with the environment.
if [ -z "$CONFIG" ]; then
  if [ "$INSTALL" = "1" ]; then CONFIG="Release"; else CONFIG="Debug"; fi
fi
if [ -n "${FH_MAC_DERIVED_DATA:-}" ]; then
  DERIVED="$FH_MAC_DERIVED_DATA"
elif [ "$SIGN" = "1" ]; then
  # Its own derived data, so a signed build never becomes the binary a later
  # `--no-build` run or sweep picks up by accident: the two behave differently
  # (sandbox, keychain identity) and only one of them can write a snapshot.
  DERIVED="${FH_MAC_SIGNED_DERIVED_DATA:-/tmp/fh-mac-signed}"
elif [ "$CONFIG" = "Release" ]; then
  DERIVED="${FH_MAC_RELEASE_DERIVED_DATA:-/tmp/fh-mac-rel}"
else
  DERIVED="/tmp/fh-mac/dd"
fi
APP="$DERIVED/Build/Products/$CONFIG/FiHaven.app"
BIN="$APP/Contents/MacOS/FiHaven"

# The team the signature must belong to for the keychain to name this build the
# way it names the shipped app. Read from project.yml rather than hardcoded, so
# the one place that decides it is the spec.
TEAM="${FH_MAC_TEAM:-$(sed -n 's/^ *DEVELOPMENT_TEAM: *//p' "$SPEC" | head -1)}"

# Debug defaults. Everything here is overridable by a KEY=VALUE argument, which
# is applied after these, so the last word is always the caller's.
# No path: the server serves at its own root (`const BASE = ''` in
# server/index.js), and the app appends `/api/...` itself. A `/fihaven` here
# points every request — auto-login included — at a 404 page.
export FH_BASE="${FH_BASE:-http://localhost:5222}"
export FH_SKIP_STOREKIT="${FH_SKIP_STOREKIT:-1}"
export OS_ACTIVITY_MODE="${OS_ACTIVITY_MODE:-disable}"
for kv in ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}; do export "$kv"; done

# The dev account only exists on a server that has it, so the credentials are
# filled in only when the caller asked to auto-login. The fixture server's demo
# user; override FH_DEV_EMAIL / FH_DEV_PASSWORD for anything else.
if [ "${FH_AUTOLOGIN:-}" = "1" ]; then
  export FH_DEV_EMAIL="${FH_DEV_EMAIL:-ipad@example.com}"
  export FH_DEV_PASSWORD="${FH_DEV_PASSWORD:-IpAd-Demo-Pass!2026}"
fi

if [ "$BUILD" = "1" ]; then
  if ! command -v xcodegen >/dev/null 2>&1; then
    echo "run-macos: xcodegen is missing — brew install xcodegen" >&2
    exit 1
  fi
  # The project is generated (and git-ignored), so regenerate it when the spec
  # is newer — or when any source file is, since a new .swift file does not
  # touch project.yml at all — otherwise a change to project.yml, like a new
  # scheme variable or a new source file, silently does not reach the build.
  if [ ! -d "$PROJECT" ] || [ "$SPEC" -nt "$PROJECT/project.pbxproj" ] \
    || [ -n "$(find "$PROJECT_DIR/Sources" -name '*.swift' -newer "$PROJECT/project.pbxproj" -print -quit 2>/dev/null)" ]; then
    (cd "$PROJECT_DIR" && xcodegen generate >/dev/null)
  fi
  # Signing is a *build setting* rather than a `codesign` afterwards, so
  # xcodebuild resolves the entitlements, the nested code and the provisioning
  # profile in the order it is defined to; `-allowProvisioningUpdates` is what
  # lets it fetch a Mac Team profile for this Mac instead of failing on one that
  # is not installed. CODE_SIGNING_ALLOWED=NO stays the default because it is
  # what makes a local build possible with no Developer account at all.
  sign_opts=()
  sign_settings=()
  if [ "$SIGN" = "1" ]; then
    echo "run-macos: building $PROJECT_DIR ($CONFIG, signed, team $TEAM)"
    sign_opts=(-allowProvisioningUpdates)
    sign_settings=(CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM")
  else
    echo "run-macos: building $PROJECT_DIR ($CONFIG, unsigned)"
    sign_settings=(CODE_SIGNING_ALLOWED=NO)
  fi
  BUILD_LOG="$(mktemp -t fihaven-macos-build)"
  if ! xcodebuild build -project "$PROJECT" -scheme FiHaven \
        -configuration "$CONFIG" \
        -destination 'platform=macOS' -derivedDataPath "$DERIVED" \
        ${sign_opts[@]+"${sign_opts[@]}"} ${sign_settings[@]+"${sign_settings[@]}"} \
        >"$BUILD_LOG" 2>&1; then
    echo "run-macos: build failed" >&2
    grep -E "^/.*error:|^error:" "$BUILD_LOG" | sort -u | head -20 >&2
    if [ "$SIGN" = "1" ]; then
      echo "run-macos: a signed build needs an Apple-issued certificate for team $TEAM in the login keychain, and Xcode signed in to the account that owns app.fihaven — ios/README.md, \"Signing a local build\"" >&2
    fi
    echo "run-macos: full log at $BUILD_LOG" >&2
    exit 1
  fi
  rm -f "$BUILD_LOG"
  echo "run-macos: build ok"
fi

# ── what the signature actually grants ─────────────────────────────────────
#
# `--sign` is only worth having if it is checkable, and the interesting parts
# are not in the build log: which certificate signed it, which team the keychain
# will name, what the profile grants, and whether the result would launch at all.
# So a signed build is read back the way an installed copy is (see
# `install_macos_app`) and reported.
#
# Measured on this machine, where the only Apple Development identity installed
# belongs to a *personal* team (7YU86S3FJS) while project.yml pins
# DEVELOPMENT_TEAM 365KR8NF53: automatic signing still produced an app whose
# TeamIdentifier is 365KR8NF53 and whose profile grants
# keychain-access-groups = ["365KR8NF53.*"]. What the keychain names is the
# profile's application-identifier, not the certificate's own team string —
# which is the whole reason this is worth reporting rather than assuming.
report_signed_build() {
  local authority identifier team profile pfile name expiry groups keys gate
  authority="$(codesign -dv --verbose=2 "$APP" 2>&1 | sed -n 's/^Authority=//p' | head -1 || true)"
  identifier="$(codesign -dv --verbose=2 "$APP" 2>&1 | sed -n 's/^Identifier=//p' | head -1 || true)"
  team="$(codesign -dv --verbose=2 "$APP" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -1 || true)"

  echo "run-macos: signed by    ${authority:-no authority — this build is not signed}"
  echo "run-macos: identifier   ${identifier:-?}, TeamIdentifier ${team:-none}"

  profile="$APP/Contents/embedded.provisionprofile"
  if [ -e "$profile" ]; then
    pfile="$(mktemp -t fihaven-profile)"
    if security cms -D -i "$profile" >"$pfile" 2>/dev/null; then
      name="$(plutil -extract Name raw "$pfile" 2>/dev/null || echo '?')"
      expiry="$(plutil -extract ExpirationDate raw "$pfile" 2>/dev/null | cut -d' ' -f1 || true)"
      groups="$(plutil -extract Entitlements.keychain-access-groups.0 raw "$pfile" 2>/dev/null || true)"
      echo "run-macos: profile      $name${expiry:+ (expires $expiry)}${groups:+, keychain group $groups}"
    fi
    rm -f "$pfile"
  else
    echo "run-macos: profile      none — the restricted entitlements (Sign in with Apple, associated domains, push) cannot be granted to this build"
  fi

  keys="$(codesign -d --entitlements - "$APP" 2>/dev/null | sed -n 's/.*\[Key\] //p' | tr '\n' ' ' | sed 's/ *$//' || true)"
  echo "run-macos: entitlements ${keys:-none}"

  if codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
    echo "run-macos: verify       codesign --verify --deep --strict: ok"
  else
    echo "run-macos: codesign --verify failed — the signature is not valid on disk" >&2
    return 1
  fi

  # Printed rather than left as a surprise: `spctl` answers the question a
  # *downloaded* app is asked, and this one never had a quarantine attribute, so
  # the rejection does not stop it running.
  gate="$(spctl -a -t exec -vvv "$APP" 2>&1 | tail -1 || true)"
  echo "run-macos: spctl        ${gate:-?} — expected for an Apple Development signature; a local build carries no quarantine, so it still runs"

  case "$keys" in
    *aps-environment*) ;;
    *) echo "run-macos: note         no aps-environment: the Release config asks for production, a team profile grants development, so signing drops it — push does not reach a signed local build" ;;
  esac
  echo "run-macos: sandboxed    FH_SNAPSHOT outside the container is refused, so a sweep stays on the unsigned build"
  return 0
}

if [ "$SIGN" = "1" ] && [ -x "$BIN" ]; then
  report_signed_build || exit 1
fi

if [ ! -x "$BIN" ]; then
  echo "run-macos: no binary at $BIN — drop --no-build" >&2
  exit 1
fi

# ── installing the build as the Mac app ─────────────────────────────────────
#
# `--install` is the three commands in ios/README.md's "Installing a local build
# as your Mac app" as one: build the configuration, `ditto` the bundle into the
# applications folder, register it with LaunchServices, and report what landed.
# It stops there — no launch, no dev hooks, and no server needed, because what it
# produces is the app the Dock and Launchpad launch rather than a harness run.
#
# Two things it does not do casually:
#
#   - It replaces an existing copy, and a bundle is files *plus* metadata, so the
#     old one is removed first — `ditto` merges, and a file this build no longer
#     ships would otherwise stay behind inside the new bundle. Where the removal
#     is refused (an entry in /Applications that this account does not own, which
#     is how the App Store puts one there) it copies over it in place and says so.
#   - It refuses to delete the App Store app. The native build and the store build
#     share `app.fihaven`, so replacing that one would hand it this build's Dock
#     tile and identity; ios/README.md has the long way round. An App Store
#     receipt or a nested `Wrapper/` is what tells the two apart.
install_macos_app() {
  local dest="$APPS_DIR/$(basename "$APP")"
  local ls_register="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  local store_why=""

  if [ -e "$dest/Contents/_MASReceipt" ]; then
    store_why="it carries an App Store receipt"
  elif [ -e "$dest/Contents/Wrapper/FiHaven.app" ]; then
    store_why="it is a designed-for-iPad bundle, with the iPad app nested at Contents/Wrapper/"
  fi
  if [ -n "$store_why" ]; then
    echo "run-macos: $dest is the App Store copy — $store_why — so it is not ours to delete." >&2
    echo "run-macos:   both builds claim app.fihaven, and installing over it would give this build the store app's Dock tile and identity." >&2
    echo "run-macos:   move it aside first: ios/README.md, \"One bundle id, two apps — do not install both\"." >&2
    echo "run-macos:   or install somewhere else: FH_MAC_APPS_DIR=<folder> scripts/run-macos.sh --install" >&2
    return 1
  fi

  # `~/Applications` is a normal place to put a personal copy and does not exist
  # on a fresh account, so the folder is made rather than refused.
  if [ ! -d "$APPS_DIR" ]; then
    if ! mkdir -p "$APPS_DIR"; then
      echo "run-macos: could not create $APPS_DIR" >&2
      return 1
    fi
    echo "run-macos: created $APPS_DIR"
  fi

  # The same reason a launch kills the previous instance: a copy that is running
  # holds its bundle open, so the removal would "succeed" and leave the window on
  # screen running from a directory that no longer exists — every resource it has
  # not already read is gone. Quitting it first is what makes the replacement
  # mean anything.
  if pgrep -f "$dest/Contents/MacOS/FiHaven" >/dev/null 2>&1; then
    echo "run-macos: stopping the copy running from $dest"
    pkill -f "$dest/Contents/MacOS/FiHaven" 2>/dev/null || true
    sleep 1
    pkill -KILL -f "$dest/Contents/MacOS/FiHaven" 2>/dev/null || true
  fi

  local replaced=""
  if [ -e "$dest" ]; then
    if rm -rf "$dest" && [ ! -e "$dest" ]; then
      replaced="removed"
    else
      replaced="over"
      echo "run-macos: could not remove the existing $dest — copying over it instead" >&2
      echo "run-macos:   (a file this build no longer ships can stay behind in the old bundle)" >&2
    fi
  fi

  echo "run-macos: installing $APP → $dest"
  if ! ditto "$APP" "$dest"; then
    echo "run-macos: ditto failed — $dest may be incomplete; delete it and re-run" >&2
    return 1
  fi

  # Launchpad and Spotlight notice a new bundle in the applications folder on
  # their own; this makes it immediate rather than eventually. Not worth
  # stopping for if it is unavailable.
  if [ -x "$ls_register" ]; then
    "$ls_register" -f "$dest" >/dev/null 2>&1 || true
  fi

  # Read back what was installed rather than trusting the copy. The two numbers
  # are the pair the stores are told, so a mismatch here is the file-level check
  # that the bundle that landed is the bundle that was built.
  local built_short built_build installed_short installed_build sig kilobytes
  built_short="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo '?')"
  built_build="$(defaults read "$APP/Contents/Info" CFBundleVersion 2>/dev/null || echo '?')"
  installed_short="$(defaults read "$dest/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo '?')"
  installed_build="$(defaults read "$dest/Contents/Info" CFBundleVersion 2>/dev/null || echo '?')"
  sig="$(codesign -dv "$dest" 2>&1 | grep -m1 '^Signature=' | sed 's/^Signature=//' || true)"
  kilobytes="$(du -sk "$dest" | awk '{print $1}' || echo 0)"

  echo "run-macos: installed $installed_short (build $installed_build), built as $built_short (build $built_build) — $((kilobytes / 1024)) MB, ${sig:-unsigned} signature"
  if [ "$built_short" != "$installed_short" ] || [ "$built_build" != "$installed_build" ]; then
    echo "run-macos: the installed copy does not report the built version — check $dest" >&2
    return 1
  fi
  case "$replaced" in
    removed) echo "run-macos: the previous copy was removed first" ;;
    over)    echo "run-macos: the previous copy was copied over in place — a fresh install folder avoids that" ;;
    *)       echo "run-macos: there was no previous copy to replace" ;;
  esac
  echo "run-macos: it talks to production, reads no FH_* hooks, and uses the shipped keychain service app.fihaven"
  echo "run-macos:   StoreKit still loads the Pro products from an ad-hoc build, but a purchase and its receipt want an Apple-signed bundle — ios/README.md, \"Signing a local build\"; install signed with --install --sign"
  echo "run-macos:   open \"$dest\"   # or ⌘-space → FiHaven"
  return 0
}

if [ "$INSTALL" = "1" ]; then
  if install_macos_app; then exit 0; else exit 1; fi
fi

# CODE_SIGNING_ALLOWED=NO is what makes a local build possible at all (the Mac
# target's entitlements are restricted ones), and it has a price worth knowing
# before the app looks broken: Sign in with Apple cannot work, and the Keychain
# won't hand this build the token a differently signed build saved.

# A local server that isn't running is the usual reason a launch "does
# nothing", so say so rather than making the next person read the log.
BASE_HOSTPORT="$(printf '%s' "$FH_BASE" | sed -E 's#^[a-z]+://([^/]+).*#\1#')"
BASE_PORT="${BASE_HOSTPORT##*:}"
BASE_HOST="${BASE_HOSTPORT%%:*}"
SERVER_DOWN=0

# ── the visual review sweep ─────────────────────────────────────────────────
#
# One launch per screen: the app photographs its own window, and there is no
# in-process way to walk its screens inside one run, so a sweep is a loop of
# single runs. `$SELF` is what makes that cheap to write — each screen goes
# through the same code path as a hand-run launch, its output captured in its
# own log rather than mixed into the table.
#
# The screen list, the state table, the per-state tally and the closing table
# all live in `sweep-matrix.sh`, which `run-ios.sh` reads too: the iPhone and
# iPad sweeps photograph the same seventeen screens in the same five states,
# and two copies of that list would drift.
. "$(cd "$(dirname "$0")" && pwd)/sweep-matrix.sh"

# The liveness check needs `sweep_is_local_host`, so it lives after the source
# rather than beside the URL parsing above it. A host this machine can spell as
# `localhost`, `127.0.0.1` or `[::1]` is the one whose empty port means the
# server is down; a remote base is not probed, because a port that answers
# nothing here may be someone else's firewall rather than their outage.
if [ "$BASE_PORT" != "$BASE_HOSTPORT" ] && sweep_is_local_host "$BASE_HOST" \
   && ! nc -z 127.0.0.1 "$BASE_PORT" 2>/dev/null; then
  SERVER_DOWN=1
  echo "run-macos: nothing is listening on $BASE_HOST:$BASE_PORT — start it with \`npm run dev:server\`" >&2
fi

# The narrowest a table may be offered before the screen counts as broken. A
# table needs room for an identifying column and a figure; below this it can lay
# out neither, which is what a fixed side column does to its main column at a
# small window — and what that looks like in a PNG is an ordinary empty table,
# so a picture will not tell you. `MacTableWidth.fit` logs the width it was
# offered on every layout pass (see `[Table] pane`), so the sweep can.
SWEEP_TABLE_MIN_PTS=320

# How many times a screen may correct its own window frame before the sweep calls
# it a fight rather than a race.
#
# The threshold is set by what each number *does* to a capture, not by taste:
#
# - The floor's known 141pt proposal (the window's own content minimum,
#   140x556, against a 640x520 frame — docs/maintainer/follow-ups.md) corrects
#   about 32 times in a 5s run and every capture is still exact, because the
#   guard wins and re-asserts the pin immediately before the snapshot. It is
#   real, and it is not this check's business.
# - A rigid-height banner in front of the detail column proposed 1440x2984 for a
#   1440x900 window: 344 corrections in one screen, and the screen captured
#   *blank*, because the content was laid out 2000pt below the titlebar. That is
#   the failure this was added to catch.
#
# The count comes from the guard's own doubling line (`×N so far`) rather than
# the number of log lines: past 8 corrections the app stops logging each one, so
# a line count would read a bad run as a quiet one.
SWEEP_FRAME_FIGHT_MAX=128

# Pixels of a PNG, through `sips` — it ships with macOS, and the table is not
# worth a dependency on ImageMagick. (`file_pixels`, `file_size` and
# `note_join` come from sweep-matrix.sh.)

# Record one capture: every check the sweep makes of a file on disk, its log
# and the run's own bookkeeping, in one place so a signed-in cell and a
# signed-out sample cannot drift apart.
#
#   sweep_record_cell <png> <log> <title> <raw> <state> <evidence> <differs>
#                     <expected_screen> <blank_bytes>
#
# Sets `SWEEP_ROW` to the table row and updates `missing`, `flagged`, `sizes`,
# `seen` and `happy_seen` — `sweep_main`'s locals, which are in scope here
# because bash is dynamically scoped, and the reason this is a function rather
# than a block copied for the signed-out samples. The row list and the
# per-state tally stay with the caller, which owns the `before_*` deltas.
#
# `expected_screen` is what the snapshot's own `screen=` should say: the raw
# name for a signed-in cell, `none` for a sample, where no shell is mounted.
# `blank_bytes` is the flat-colour threshold — higher for a screen full of
# rows than for a card on a flat background.
sweep_record_cell() {
  local png="$1" log="$2" title="$3" raw="$4" state="$5" evidence="$6" differs="$7" expected_screen="$8" blank_bytes="$9"
  local note="" window="—" pixels="—" size="—" gate_word="—"
  if [ ! -f "$png" ]; then
    note="no capture — see $(basename "$log")"
    missing=$((missing + 1))
  else
    local bytes; bytes="$(stat -f%z "$png" 2>/dev/null || echo 0)"
    pixels="$(file_pixels "$png")"
    size="$(file_size "$bytes")"
    # What the app says it made the window: the size we asked for, the
    # display's (not the same thing on a small screen), or — until the capture
    # started re-asserting the pin — a size SwiftUI proposed and the guard had
    # not yet put back. See the `asked` note below.
    window="$(grep -o 'window=[0-9]*x[0-9]*' "$log" | tail -1 | cut -d= -f2)"
    local scale; scale="$(grep -o 'scale=[0-9]*' "$log" | tail -1 | cut -d= -f2)"
    [ -n "$window" ] || window="—"
    [ -n "$scale" ] && pixels="$pixels@${scale}x"

    if grep -q '\[Snapshot\] FAILED' "$log"; then
      note="$(note_join "$note" "write failed")"
    fi
    # Whether this capture is the product or the upsell, from the app's own
    # answer. A paywall where the Pro state should be is a finding; the free
    # tier's paywalls are the point, and the column says which is which on
    # every row. A signed-out sample has no gate to report, and `—` is exact.
    local gate; gate="$(sweep_gate "$log")"
    gate_word="$(sweep_gate_word "$gate")"
    local gate_note; gate_note="$(sweep_gate_finding "$state" "$gate")"
    if [ -n "$gate_note" ]; then
      note="$(note_join "$note" "$gate_note")"
    fi
    # The one thing a file on disk cannot tell you: which screen the app had
    # selected when it took the picture. A mismatch means FH_ROUTE did not
    # land, which is the failure a full table of plausible PNGs would hide.
    #
    # A signed-out launch passes an empty expectation and skips the check: the
    # shell is not on screen, and the snapshot's `screen=` reads whatever nav
    # value the last session left in UserDefaults — `about` on this machine.
    # That is not a fact about the picture, and `none` is not either.
    if [ -n "$expected_screen" ]; then
      local rendered; rendered="$(grep -o 'screen=[a-z]*' "$log" | tail -1 | cut -d= -f2)"
      if [ -z "$rendered" ]; then
        note="$(note_join "$note" "screen unconfirmed")"
      elif [ "$rendered" != "$expected_screen" ]; then
        note="$(note_join "$note" "rendered '$rendered'")"
      fi
    fi
    # The state has to say it happened. `happy` sets the entitlement and logs
    # `pro=true`; if that line is missing, or says `false`, the run
    # photographed a paywall and called it the product — which is the whole
    # reason `happy` and `free` are a matched pair. And every state has to
    # have signed in, or the capture is the sign-in screen. Nothing about a
    # PNG distinguishes any of these, and a sweep that did not read the log
    # would report five states captured and one screen's worth of pictures.
    #
    # The needle is `missing_evidence` and not `missing`, which is the count
    # of captures that never landed. A `local missing` here shadows that
    # counter for the rest of this scope, and because the value is a *string*
    # like `session=signedIn`, every later `$((missing - …))` reads it as
    # arithmetic, parses `session=signedIn` as an assignment, and dies under
    # `set -u` on `signedIn`. It failed on exactly the runs that had something
    # to report, which is the worst possible time.
    if [ -n "$evidence" ]; then
      local missing_evidence
      missing_evidence="$(sweep_evidence_missing "$log" "$evidence")"
      if [ -n "$missing_evidence" ]; then
        note="$(note_join "$note" "no '$missing_evidence' in log")"
      fi
    fi
    if [ "$bytes" -lt "$blank_bytes" ]; then
      note="$(note_join "$note" "looks blank at $size")"
    fi
    # The narrowest width any table on this screen *settled* at.
    #
    # Two corrections to the obvious reading of that log. `fit` prints on
    # every layout pass and the small values are transient — a
    # `NavigationSplitView` animating its sidebar in offers the pane 0pt, then
    # 176pt, and only then its real width — so the number to keep is the
    # largest each table saw, not the smallest or the last. And a screen with
    # two tables must not be able to hide a starved one behind a healthy
    # neighbour, so the widths are kept per table and the *smallest* of those
    # is what is judged. A table is identified by its own two thresholds,
    # which each table supplies and no two share (see `MacTableWidth.fit`).
    # A screen with no table logs nothing, and is not checked.
    local settled
    settled="$(sed -n 's/.*pane \([0-9]*\)pt.*wide ≥\([0-9]*\), medium ≥\([0-9]*\)).*/\1 \2 \3/p' "$log" \
      | awk '{ k = $2 "/" $3; if (!(k in mx) || $1 > mx[k]) mx[k] = $1 }
             END { narrowest = "";
                   for (k in mx) if (narrowest == "" || mx[k] < narrowest) narrowest = mx[k];
                   print narrowest }')"
    if [ -n "$settled" ] && [ "$settled" -lt "$SWEEP_TABLE_MIN_PTS" ]; then
      note="$(note_join "$note" "table only ${settled}pt")"
    fi
    # Both numbers, because the difference is not by itself a verdict on the
    # screen. The window is pinned with FH_WINDOW and SwiftUI re-proposes a
    # content-fitted size on every layout pass, so a capture can land on
    # whichever side of that race the frame was on: the same Cards screen came
    # out 659x520 in one floor run and 640x520 in the next. The one case that
    # *is* a verdict — a pin larger than the display, which comes back clamped
    # — reads the same way, so the note reports both numbers rather than a
    # conclusion. The old wording, "asked 640x520", read as the screen
    # refusing the size; see docs/maintainer/follow-ups.md.
    if [ -n "$window" ] && [ "$window" != "$SWEEP_SIZE" ]; then
      note="$(note_join "$note" "asked $SWEEP_SIZE, got $window")"
    fi
    # A screen that is being resized over and over is not being drawn: the
    # frame guard is undoing a proposal the content keeps re-making, and the
    # picture lands wherever that fight happens to be. A caption is not
    # enough — the log is the only place the count shows up.
    local fights
    fights="$(sed -n 's/.*put back from .*(×\([0-9]*\) so far).*/\1/p' "$log" | sort -n | tail -1)"
    if [ -z "$fights" ]; then
      # No doubling line means few enough corrections that the app logged each.
      fights="$(grep -c 'put back from' "$log" 2>/dev/null | head -1)"
    fi
    [ -n "$fights" ] || fights=0
    if [ "$fights" -gt "$SWEEP_FRAME_FIGHT_MAX" ]; then
      note="$(note_join "$note" "window frame fought ${fights}x")"
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
    # The other duplicate, and the one that matters more: the same screen in
    # a state that *has* to look different, photographed exactly as `happy`
    # did. `FH_FAULT` compiled out of the app it existed for and every
    # `error` row came back as a copy of `happy`; the file-level check above
    # caught it that day by accident, because `offline` had gone missing
    # from the build too. This one is the deliberate version: it compares
    # against the baseline for the same screen, so it holds even when the
    # whole column is wrong in the same direction.
    if [ "$differs" = "yes" ]; then
      local baseline
      baseline="$(printf '%s' "$happy_seen" | awk -v k="$raw" '$1 == k { print $2; exit }')"
      if [ -n "$baseline" ] && [ "$baseline" = "$hash" ]; then
        note="$(note_join "$note" "same as happy")"
      fi
    elif [ "$state" = "happy" ]; then
      happy_seen="$happy_seen$raw $hash $gate
"
    elif [ "$state" = "free" ]; then
      # The gate the Pro run showed on this screen. `sweep_gate_missing_note`
      # takes the Pro run's answer rather than a list of gated screens, so it
      # cannot name the wrong five.
      local pro_gate
      pro_gate="$(printf '%s' "$happy_seen" | awk -v k="$raw" '$1 == k { print $3; exit }')"
      gate_note="$(sweep_gate_missing_note "$pro_gate" "$state" "$gate")"
      [ -n "$gate_note" ] && note="$(note_join "$note" "$gate_note")"
    fi
  fi
  [ -n "$note" ] || note="ok"
  [ "$note" = "ok" ] || flagged=$((flagged + 1))
  sizes+=("$window")
  SWEEP_ROW="$(printf '%s|%s|%s|%s.png|%s|%s|%s|%s|%s' "$idx" "$state" "$title" "$stem" "$window" "$pixels" "$size" "$gate_word" "$note")"
}

sweep_main() {
  if [ "$SERVER_DOWN" = "1" ]; then
    echo "run-macos: --sweep needs the server at $FH_BASE — every screen would capture the offline state" >&2
    return 1
  fi

  # Both halves of the matrix are narrowed the same way and validated by the
  # same rule: an unknown name is a typo and says so rather than quietly
  # sweeping the rest of the list.
  #
  # `happy` and `free` are added to each other: they are one review, and a sweep
  # of one without the other photographs five paywalls as if they were screens
  # (or misses the gate entirely). The states come out in the table's order
  # whatever order they were asked for in, so the Pro run is always captured
  # before the free one and is always there to compare against.
  local added
  added="$(sweep_tiers_complete "$STATES")"
  if [ -n "$added" ]; then
    echo "run-macos: --states also sweeping $added — the two tiers are one review, and a Pro screen photographed as a paywall is the failure the pair exists to catch"
    STATES="${STATES:+$STATES,}$added"
  fi
  # `--only` selects from both matrices at once: the seventeen screens and the
  # signed-out samples, which are not screen × state cells at all. One list to
  # validate and order, then split — the loop below runs `chosen`, the block
  # after it runs `chosen_out`.
  local chosen chosen_all chosen_out chosen_states entry
  chosen_all="$(sweep_choose run-macos --only "$ONLY" "$(printf '%s\n' "${SWEEP_SCREENS[@]}" "${SWEEP_SIGNED_OUT[@]}")")" || return $?
  chosen=""
  chosen_out=""
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    if sweep_is_signed_out "$(sweep_field "$entry" 1)"; then
      chosen_out="$chosen_out$entry
"
    else
      chosen="$chosen$entry
"
    fi
  done <<< "$chosen_all"
  chosen_states="$(sweep_choose run-macos --states "$STATES" "$(sweep_states)")" || return $?

  # Declared here rather than beside the capture loop, because the state tally
  # is seeded from the chosen states above the captures start.
  local per_state="" raw title state
  local screens states out_count
  # Counted through a here-string, not an unquoted expansion: half these rows
  # are titles with spaces in them, and word-splitting them counted 3 screens
  # as 4 and 3 states as 16, so the progress counter said 64 of 64 for a
  # nine-capture run.
  screens="$(grep -c . <<< "$chosen" || true)"
  states="$(grep -c . <<< "$chosen_states" || true)"
  out_count="$(grep -c . <<< "$chosen_out" || true)"
  local total=$((screens * states + out_count))
  # The tally lists the states that were swept and then the signed-out samples
  # as their own line: they are not account states, and there are three of them
  # rather than seventeen screens. A run that asked for only signed-out samples
  # has no state lines at all.
  local seed
  if [ "$screens" -gt 0 ]; then
    while IFS= read -r seed; do
      [ -n "$seed" ] || continue
      per_state="$per_state$(sweep_field "$seed" 1)|0|0
"
    done <<< "$chosen_states"
  fi
  if [ "$out_count" -gt 0 ]; then
    per_state="${per_state}signedout|0|0|signed out — no session|$out_count
"
  fi

  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR"

  # Every state except `empty` signs in as the dev account, and that account is
  # a property of the *server's* database rather than of this script. Against a
  # database that has never had it — a fresh test database, or one seeded by
  # somebody else's fixture — the app cannot sign in, and then `happy`, `free`,
  # `offline` and `error` all photograph the sign-in screen. Four states of five,
  # silently, at the right size with the right screen name in the log.
  #
  # It is checked rather than seeded unconditionally, because seeding
  # `ipad@example.com` with `--force` on every sweep would wipe a real person's
  # local rows to save them a command. One request decides, and the remedy is
  # only taken when it is needed.
  local dev_email="${FH_DEV_EMAIL:-ipad@example.com}"
  local dev_password="${FH_DEV_PASSWORD:-IpAd-Demo-Pass!2026}"
  if [ "$screens" -gt 0 ] && sweep_needs_dev_account "$chosen_states"; then
    local dev_why
    if ! dev_why="$(sweep_can_sign_in "$FH_BASE" "$dev_email" "$dev_password" 2>&1)"; then
      echo "run-macos: $dev_email cannot sign in at $FH_BASE — seeding it for this run" >&2
      # `--create`: against a database that has never held this account there
      # is nothing to verify, and without it the seeder refuses to make one.
      if ! env FIHAVEN_TEST_DB_PATH="${FIHAVEN_DB_PATH:-$(sweep_server_db "$FH_BASE")}" \
           node "$SCRIPT_DIR/seed-user-data.js" "$dev_email" \
           --create --verify --onboard --pro --password "$dev_password" \
           >"$OUT_DIR/00-dev-account.log" 2>&1; then
        cat "$OUT_DIR/00-dev-account.log" >&2
        echo "run-macos: could not prepare the dev account $dev_email — every state but empty needs it" >&2
        return 1
      fi
      # Asked twice, because seeding into a database nothing is serving produces
      # a healthy-looking log and the same sign-in screen it started with.
      if ! dev_why="$(sweep_can_sign_in "$FH_BASE" "$dev_email" "$dev_password" 2>&1)"; then
        echo "run-macos: $dev_email still cannot sign in after seeding, so every state but empty would photograph the sign-in screen." >&2
        echo "run-macos:   the server said: $dev_why" >&2
        return 1
      fi
      echo "run-macos: $dev_email seeded into $(grep -o 'Database: .*' "$OUT_DIR/00-dev-account.log" | tail -1 | sed 's/Database: //')" >&2
    fi
  fi

  # The empty state signs in as an account with no rows, which has to exist and
  # be verified before the run: an unverified one photographs the verify screen
  # on every row of the table, seventeen times over. Preparation belongs to the
  # script whose job is preparing accounts, so it is asked for here rather than
  # grown here.
  if [ "$screens" -gt 0 ] && grep -q '^empty|' <<< "$chosen_states"; then
    local empty_email="${FH_SWEEP_EMPTY_EMAIL:-fhsweep-empty@fihaven.app}"
    local empty_password="${FH_SWEEP_EMPTY_PASSWORD:-demopassword11}"
    # Seed into the database the server is actually using. The seeder resolves
    # the path from its own environment and the app signs in against whatever is
    # listening, so without this the two can name different files — and then the
    # account below is real in a database nothing serves. An explicit
    # `FIHAVEN_DB_PATH` in the caller's environment still wins: that is how a
    # deliberate override is spelled, and the sweep should not overrule it.
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
         >"$OUT_DIR/00-empty-account.log" 2>&1; then
      cat "$OUT_DIR/00-empty-account.log" >&2
      echo "run-macos: could not prepare the empty account $empty_email — the empty state needs it" >&2
      return 1
    fi
    # The seeder resolves the database from its own environment; the app signs
    # in against whatever server is listening, and those are two separate
    # resolutions. When they disagree the account does not exist as far as the
    # app is concerned and every `empty` capture is the sign-in screen — at the
    # right size, with the right screen name in the log, and `ok` in the table.
    # That is what happened here, for a whole state of the matrix, and one
    # request is what it takes to find out.
    if ! why="$(sweep_can_sign_in "$FH_BASE" "$empty_email" "$empty_password" 2>&1)"; then
      echo "run-macos: $empty_email cannot sign in at $FH_BASE, so the empty state would photograph the sign-in screen." >&2
      echo "run-macos:   the server said: $why" >&2
      echo "run-macos:   seeded into: $(grep -o 'Database: .*' "$OUT_DIR/00-empty-account.log" | tail -1 | sed 's/Database: //')" >&2
      # Only a wrong password or an unknown account points at the database. A
      # captcha or rate-limit refusal says the request never got that far, and
      # telling the reader to seed a different file would send them off to fix
      # something that is not broken.
      case "$why" in
        *invalid-credentials*)
          echo "run-macos:   the server does not know that account. It is probably using a different database:" >&2
          echo "run-macos:     FIHAVEN_DB_PATH=<the server's database> scripts/run-macos.sh --sweep …" >&2
          ;;
        *captcha*)
          echo "run-macos:   the login route refused the captcha. A dev server wants the always-pass secret:" >&2
          echo "run-macos:     TURNSTILE_SECRET=1x0000000000000000000000000000000AA node server/index.js" >&2
          ;;
        *rate-limited*)
          echo "run-macos:   the login route is rate-limited this address (5 per 15 min). Wait, or start the server with DISABLE_RATE_LIMIT=1." >&2
          ;;
      esac
      return 1
    fi
  fi

  echo "run-macos: sweeping $screens screen(s) x $states state(s) + $out_count signed-out = $total at $SWEEP_SIZE into $OUT_DIR"

  local started=$SECONDS idx=0 missing=0 flagged=0
  # Arrays, not one newline-joined string: $( ) strips the trailing newline a
  # printf would add, so a string accumulator has to smuggle its separators in
  # by hand — and when it does, the indentation of the closing quote ends up
  # inside the value too, which is how rows 2..n came out indented.
  local -a rows=() sizes=()
  local seen=""
  # Each screen's `happy` bytes and what its Pro gate said, so a state that has
  # to look different can be compared against its own baseline rather than
  # against every other capture in the run, and so the free tier can be checked
  # against the gate the Pro tier actually showed. A newline-joined
  # `raw hash gate` list, not an associative array: `/bin/bash` on macOS is 3.2
  # and has never had `declare -A`.
  local happy_seen=""

  # Screen-major, state-minor. The screen is the outer loop because that is how
  # the table reads — a state column beside each screen says "this is what Bills
  # looks like when it is empty, and when the server is gone" without asking the
  # reader to hold five pictures in their head at once.
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    raw="${entry%%|*}"
    title="${entry#*|}"

    while IFS= read -r state_entry; do
      [ -n "$state_entry" ] || continue
      idx=$((idx + 1))
      state="${state_entry%%|*}"
      local state_desc state_env state_evidence state_differs
      state_desc="$(sweep_field "$state_entry" 2)"
      state_env="$(sweep_field "$state_entry" 3)"
      state_evidence="$(sweep_field "$state_entry" 4)"
      state_differs="$(sweep_field "$state_entry" 5)"

      # The state goes in the filename, not just the table: 85 PNGs in one
      # directory are unreadable, and the state is the thing you cannot recover
      # from the contents of the picture.
      # Deltas, not the running totals: `missing` and `flagged` accumulate over
      # the whole sweep, so folding them in per capture would count every
      # earlier capture's problems again — and the per-state line would report
      # more flags than the table above it shows.
      local before_missing=$missing before_flagged=$flagged
      local stem; stem="$(printf '%02d-%s__%s' "$idx" "$raw" "$state")"
      local png="$OUT_DIR/$stem.png"
      local log="$OUT_DIR/$stem.log"

      printf 'run-macos: [%2d/%2d] %-19s %-8s → %s.png\n' "$idx" "$total" "$title" "$state" "$stem"

      # `--seconds` is the bound, not the schedule: the app captures at
      # FH_SNAPSHOT_DELAY and then keeps running, and a GUI app only stops when
      # something kills it. The slack covers launch plus the capture's own
      # activation wait.
      # Word-splitting `$state_env` is the point: it is a list of KEY=VALUE
      # pairs, which is the same shape `PASSTHROUGH` already carries, and the
      # child's argument parser exports them.
      "$SELF" --no-build --seconds "$((SWEEP_DELAY + 6))" \
        ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"} \
        $state_env \
        "FH_SCREEN=$raw" "FH_SNAPSHOT=$png" "FH_SNAPSHOT_DELAY=$SWEEP_DELAY" \
        "FH_WINDOW=$SWEEP_SIZE" "FH_AUTOLOGIN=1" >"$log" 2>&1 || true

      # Every check of the capture is in `sweep_record_cell`; the signed-out
      # block at the end of this function runs the same one.
      sweep_record_cell "$png" "$log" "$title" "$raw" "$state" "$state_evidence" "$state_differs" "$raw" "$SWEEP_BLANK_BYTES"
      rows+=("$SWEEP_ROW")
      # Per-state tally, so the summary can name the state a capture went
      # missing from instead of only reporting a total.
      per_state="$(sweep_tally_add "$per_state" "$state" \
        "$((missing - before_missing))" "$((flagged - before_flagged))")"
    done <<< "$chosen_states"
  done <<< "$chosen"

  # ── the signed-out samples ───────────────────────────────────────────
  #
  # The three screens that exist only before there is a session. They are not
  # states of the matrix above — every one of those signs in — so each is one
  # launch with its own setup, and `FH_SIGNED_OUT=1` keeps a token left by the
  # cell before it from putting the shell back on screen. There is no
  # `FH_SCREEN` and no `FH_AUTOLOGIN`: these are what the app shows when
  # neither is set.
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    idx=$((idx + 1))
    raw="$(sweep_field "$entry" 1)"
    title="$(sweep_field "$entry" 2)"
    local out_env out_evidence out_delay
    out_env="$(sweep_field "$entry" 3)"
    out_evidence="$(sweep_field "$entry" 4)"
    out_delay="$(sweep_field "$entry" 5)"
    # An entry with no delay of its own rides the run's. The stalled check
    # needs longer than any signed-in cell: its reveal arrives either when
    # Cloudflare draws the widget or at the 12-second deadline, whichever the
    # network allows.
    [ -n "$out_delay" ] || out_delay="$SWEEP_DELAY"

    local before_missing=$missing before_flagged=$flagged
    local stem; stem="$(printf '%02d-%s__signedout' "$idx" "$raw")"
    local png="$OUT_DIR/$stem.png"
    local log="$OUT_DIR/$stem.log"

    printf 'run-macos: [%2d/%2d] %-19s %-8s → %s.png\n' "$idx" "$total" "$title" "out" "$stem"

    "$SELF" --no-build --seconds "$((out_delay + 6))" \
      ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"} \
      $out_env \
      "FH_SNAPSHOT=$png" "FH_SNAPSHOT_DELAY=$out_delay" "FH_WINDOW=$SWEEP_SIZE" >"$log" 2>&1 || true

    # A signed-out capture has no shell on screen, so it passes no expected
    # screen; everything else is the same pipeline the signed-in cells use.
    sweep_record_cell "$png" "$log" "$title" "$raw" "signedout" "$out_evidence" "" "" "$SWEEP_SIGNED_OUT_BLANK_BYTES"
    rows+=("$SWEEP_ROW")
    # The tally line carries its own description and denominator (five
    # fields), which `sweep_tally_add` keeps — rebuilding the line from the
    # first three dropped both, and the `3/3` became `3/17`.
    per_state="$(sweep_tally_add "$per_state" signedout \
      "$((missing - before_missing))" "$((flagged - before_flagged))")"
  done <<< "$chosen_out"

  local seconds=$((SECONDS - started))
  sweep_table run-macos Window "$(printf '%s\n' ${rows[@]+"${rows[@]}"})" "$per_state" "$screens"
  echo "run-macos: $((total - missing))/$total captured, $missing missing, $flagged flagged, ${seconds}s"
  echo "run-macos: window sizes seen: $(printf '%s\n' ${sizes[@]+"${sizes[@]}"} | sort -u | tr '\n' ' ' | sed 's/ *$//')"
  echo "run-macos: PNGs and per-screen app logs in $OUT_DIR"
  if [ -n "$DIFF_OLD" ]; then
    sweep_diff run-macos "$SCRIPT_DIR" "$DIFF_OLD" "$OUT_DIR"
  fi

  # A sweep that quietly produced nothing is worse than no sweep, so a missing
  # capture fails the run. A duplicate or a flat image is a judgement call, and
  # the table is where that judgement gets made.
  [ "$missing" = "0" ] || return 1
  return 0
}

if [ "$SWEEP" = "1" ]; then
  if sweep_main; then exit 0; else exit $?; fi
fi

pkill -f "$BIN" 2>/dev/null || true
sleep 1

# ── the user's own window frame ──────────────────────────────────────────────
#
# The Debug build and the installed app carry the *same* bundle id (`app.fihaven`
# — only the keychain service is suffixed), so they share one UserDefaults
# domain, and a launch that pins the window to 1440x900 writes 1440x900 into the
# frame the user's window reopens at. AppKit autosaves that on its own schedule;
# all a harness can do is put it back, so the two `NSWindow Frame *` keys are
# read before the app starts and written back after it stops. `FH_WINDOW`'s own
# "autosave untouched" note is about the guard's key, not this one.
DEFAULTS_DOMAIN="app.fihaven"
FRAME_GUARD_KEY="NSWindow Frame FiHavenWindow"
FRAME_SWIFTUI_KEY="NSWindow Frame main"
SAVED_GUARD_FRAME="" SAVED_SWIFTUI_FRAME=""

save_user_frames() {
  SAVED_GUARD_FRAME="$(defaults read "$DEFAULTS_DOMAIN" "$FRAME_GUARD_KEY" 2>/dev/null || true)"
  SAVED_SWIFTUI_FRAME="$(defaults read "$DEFAULTS_DOMAIN" "$FRAME_SWIFTUI_KEY" 2>/dev/null || true)"
}

restore_user_frames() {
  if [ -n "$SAVED_GUARD_FRAME" ]; then
    defaults write "$DEFAULTS_DOMAIN" "$FRAME_GUARD_KEY" "$SAVED_GUARD_FRAME" 2>/dev/null || true
  else
    defaults delete "$DEFAULTS_DOMAIN" "$FRAME_GUARD_KEY" 2>/dev/null || true
  fi
  if [ -n "$SAVED_SWIFTUI_FRAME" ]; then
    defaults write "$DEFAULTS_DOMAIN" "$FRAME_SWIFTUI_KEY" "$SAVED_SWIFTUI_FRAME" 2>/dev/null || true
  else
    defaults delete "$DEFAULTS_DOMAIN" "$FRAME_SWIFTUI_KEY" 2>/dev/null || true
  fi
}

save_user_frames

echo "run-macos: FH_BASE=$FH_BASE  autologin=${FH_AUTOLOGIN:-0}"

# The trap is what makes Ctrl-C stop the *app*: a GUI app does not exit on
# SIGINT, and it often ignores SIGTERM too, so a bounded run escalates. The app
# is started in the background so both paths can share one wait, and pkill by
# full path so this never touches the App Store copy in /Applications.
trap 'pkill -f "$BIN" 2>/dev/null || true; restore_user_frames' INT TERM EXIT

"$BIN" &
RUNNER=$!

if [ -n "$RUN_FOR" ]; then
  sleep "$RUN_FOR"
  pkill -f "$BIN" 2>/dev/null || true
  sleep 1
  pkill -KILL -f "$BIN" 2>/dev/null || true
fi

wait "$RUNNER" 2>/dev/null || true
echo "run-macos: stopped"
