#!/usr/bin/env bash
# Archive FiHaven for macOS TestFlight / Mac App Store and upload the .pkg.
# Mirrors scripts/ios-testflight.sh — same scheme, same archive+export flow —
# with a macOS destination. The bundle id (app.fihaven), the shared build
# counter (CURRENT_PROJECT_VERSION), and ExportOptions.plist are the same as
# the iOS path; only the destination and the artifact name differ.
#
# Prerequisites:
#   brew install xcodegen
#   Xcode signed in: Xcode → Settings → Accounts (team 365KR8NF53)
#   App Store Connect app record for app.fihaven (macOS platform record exists
#   since the 1.7.0 debut — the upload lands on the macOS version record)
#
# Auth (pick one):
#   • Xcode account (interactive first upload), or
#   • App Store Connect API key (exported, or in repo-root .env — auto-loaded):
#       APP_STORE_CONNECT_API_KEY_ID=...
#       APP_STORE_CONNECT_API_ISSUER_ID=...
#       APP_STORE_CONNECT_API_KEY_PATH=~/path/to/AuthKey_XXXX.p8
#
# Usage (from repo root):
#   ./scripts/macos-testflight.sh
#   ./scripts/macos-testflight.sh --build 3        # set CURRENT_PROJECT_VERSION then archive
#   ./scripts/macos-testflight.sh --build +1       # bump build by 1, then archive
#   ./scripts/macos-testflight.sh --archive-only   # skip upload; archive in ios/FiHavenApp/build/
#
# The build number is one counter across both platforms and both stores —
# bump it once (see scripts/bump-build.js), not per script.
#
# Interactive (default when run in a terminal): prompts like npm init —
#   Version sources:
#     package.json          1.7.0
#     iOS MARKETING_VERSION 1.7.0
#     Android versionName   1.7.0
#   Version (currently 1.7.0): (1.7.1)
#   iOS build (currently 62): (63)
# Enter accepts the suggested default.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/ios/FiHavenApp"
ARCHIVE="$APP_DIR/build/FiHaven-macOS.xcarchive"
EXPORT_DIR="$APP_DIR/build/export-macos"
EXPORT_PLIST="$APP_DIR/ExportOptions.plist"
SCHEME="FiHaven"

# Soft-load repo-root .env so APP_STORE_CONNECT_API_* work without exporting by
# hand — same semantics as loadEnvFile() in scripts/play-upload.js: comments
# skipped, already-set vars win, one layer of matching quotes stripped.
# Parsed line-by-line rather than `source`d: .env isn't guaranteed to be valid
# shell (a stray backtick or unquoted metachar can make it unloadable).
load_env_file() {
  local env_file="$ROOT/.env" line key val first last
  [[ -f $env_file ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    line="${line%$'\r'}"
    [[ $line =~ ^[[:space:]]*# ]] && continue
    if [[ $line =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      val="${val%"${val##*[![:space:]]}"}"
      if [[ ${#val} -ge 2 ]]; then
        first="${val:0:1}"; last="${val:$((${#val}-1)):1}"
        if [[ ( $first == '"' && $last == '"' ) || ( $first == "'" && $last == "'" ) ]]; then
          val="${val:1:$((${#val}-2))}"
        fi
      fi
      [[ -z ${!key:-} ]] && export "$key=$val"
    fi
  done < "$env_file"
}
load_env_file

archive_only=false
build_arg=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive-only) archive_only=true; shift ;;
    --build)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ --build requires a value (e.g. --build 3 or --build +1)" >&2
        exit 1
      fi
      build_arg="$1"
      shift
      ;;
    --build=*)
      build_arg="${1#--build=}"
      shift
      ;;
    -h|--help)
      sed -n '2,41p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -n "$build_arg" ]]; then
  current="$(node -e "console.log(require('$ROOT/scripts/native-versions').readIos().build)")"
  echo "→ Build (currently $current) → setting to $build_arg"
  node "$ROOT/scripts/native-versions.js" --ios "$build_arg" >/dev/null
elif [[ -t 0 ]]; then
  node "$ROOT/scripts/native-versions.js" --prompt-ios
else
  current="$(node -e "console.log(require('$ROOT/scripts/native-versions').readIos().build)")"
  echo "→ Non-interactive: keeping build $current from project.yml"
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "❌ Full Xcode required (xcodebuild not found)." >&2
  exit 1
fi

if [[ "$(xcode-select -p)" == *CommandLineTools* ]]; then
  echo "❌ Point xcode-select at Xcode.app:" >&2
  echo "   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi

echo "→ Generating FiHaven.xcodeproj"
(cd "$APP_DIR" && xcodegen generate)

resolved_dir="$APP_DIR/FiHaven.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$resolved_dir"
cp "$APP_DIR/xcshareddata/swiftpm/Package.resolved" "$resolved_dir/Package.resolved"

echo "→ Resolving Swift packages"
(cd "$APP_DIR" && xcodebuild -resolvePackageDependencies -project FiHaven.xcodeproj -scheme "$SCHEME" -quiet)

# Clean only this script's outputs — the iOS path shares build/ and its
# archive + export may still be wanted.
rm -rf "$ARCHIVE" "$EXPORT_DIR"
mkdir -p "$APP_DIR/build"

echo "→ Archiving (Release, macOS)"
(cd "$APP_DIR" && xcodebuild archive \
  -project FiHaven.xcodeproj \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=365KR8NF53)

# Sanity-check: Release must not compile with the DEBUG flag (store builds
# must not ship the Developer settings screen or other #if DEBUG tooling).
if (cd "$APP_DIR" && xcodebuild -project FiHaven.xcodeproj -scheme "$SCHEME" \
  -showBuildSettings -configuration Release 2>/dev/null) | grep -q 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG'; then
  echo "❌ Release configuration still defines DEBUG — aborting." >&2
  exit 1
fi
echo "✓ Release build verified (DEBUG compile flag off)"

# No LinkKit dSYM step here: the macOS bundle links every SwiftPM dependency
# statically — Contents/Frameworks is empty, FiHaven.app.dSYM already covers it.

if $archive_only; then
  echo "✓ Archive: $ARCHIVE"
  echo "  Upload manually: Xcode → Window → Organizer → Distribute App"
  exit 0
fi

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$ARCHIVE/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$ARCHIVE/Info.plist")"

# Uploading needs an Apple identity. Two ways, in order of preference:
#
#   1. App Store Connect API key. The key id + issuer id + .p8 path. This is the
#      only way that works headlessly (no GUI, no keychain prompt).
#   2. A signed-in Xcode account (Xcode → Settings → Accounts).
#
# Without either, xcodebuild dies with the useless "exportArchive Failed to Use
# Accounts". Detect that up front, and if we can't upload, still leave a signed
# .pkg on disk so the build isn't wasted.
KEY_ID="${APP_STORE_CONNECT_API_KEY_ID:-}"
ISSUER_ID="${APP_STORE_CONNECT_API_ISSUER_ID:-}"
KEY_PATH="${APP_STORE_CONNECT_API_KEY_PATH:-}"
if [[ -n "$KEY_ID" && -z "$KEY_PATH" ]]; then
  # Apple's conventional search location.
  KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
fi

auth_args=()
if [[ -n "$KEY_ID" && -n "$ISSUER_ID" && -f "$KEY_PATH" ]]; then
  echo "→ Authenticating with App Store Connect API key $KEY_ID"
  auth_args=(-authenticationKeyID "$KEY_ID"
             -authenticationKeyIssuerID "$ISSUER_ID"
             -authenticationKeyPath "$KEY_PATH")
elif [[ -n "$KEY_ID" || -n "$ISSUER_ID" ]]; then
  echo "⚠ Partial API-key config — need KEY_ID + ISSUER_ID + a readable .p8" >&2
  echo "  key_id=${KEY_ID:-<unset>} issuer=${ISSUER_ID:-<unset>} key_path=${KEY_PATH:-<unset>}" >&2
fi

if [[ ${#auth_args[@]} -eq 0 ]]; then
  # No API key. Try the account path, but don't let a cryptic failure eat the build.
  echo "→ Exporting and uploading to App Store Connect (Xcode account)"
  if (cd "$APP_DIR" && xcodebuild -exportArchive \
        -archivePath "$ARCHIVE" \
        -exportPath "$EXPORT_DIR" \
        -exportOptionsPlist "$EXPORT_PLIST" \
        -allowProvisioningUpdates); then
    echo "✓ Upload complete. Check App Store Connect → macOS version record for processing status."
    echo "  Build: $VERSION ($BUILD)"
    exit 0
  fi

  echo "" >&2
  echo "✗ Upload failed — no usable Apple identity." >&2
  echo "" >&2
  echo "  Export a signed .pkg anyway so the archive isn't wasted…" >&2
  LOCAL_PLIST="$(mktemp -t fihaven-export-macos).plist"
  /usr/libexec/PlistBuddy -c 'Add :teamID string 365KR8NF53' \
                          -c 'Add :destination string export' \
                          -c 'Add :method string app-store-connect' \
                          -c 'Add :uploadSymbols bool true' \
                          "$LOCAL_PLIST" >/dev/null
  (cd "$APP_DIR" && xcodebuild -exportArchive \
     -archivePath "$ARCHIVE" \
     -exportPath "$EXPORT_DIR" \
     -exportOptionsPlist "$LOCAL_PLIST") >/dev/null 2>&1 || true
  rm -f "$LOCAL_PLIST"

  echo "" >&2
  if [[ -f "$EXPORT_DIR/FiHaven.pkg" ]]; then
    echo "  ✓ Signed pkg: $EXPORT_DIR/FiHaven.pkg  ($VERSION build $BUILD)" >&2
  fi
  cat >&2 <<EOF

  To upload, pick one:

    a) App Store Connect API key (works headlessly — recommended):
         App Store Connect → Users and Access → Integrations → App Store Connect API
         Copy the Issuer ID (a UUID) and your Key ID, then:

           export APP_STORE_CONNECT_API_KEY_ID=XXXXXXXXXX
           export APP_STORE_CONNECT_API_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
           # .p8 at ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
           npm run deploy:macos

    b) Sign in to Xcode: Xcode → Settings → Accounts → (+) Apple ID, then rerun.

    c) Upload the .pkg by hand: Xcode → Window → Organizer → Distribute App,
       or drag it into Transporter.app.

EOF
  exit 1
fi

echo "→ Exporting and uploading to App Store Connect"
(cd "$APP_DIR" && xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates \
  "${auth_args[@]}")

echo "✓ Upload complete. Check App Store Connect → macOS version record for processing status."
echo "  Build: $VERSION ($BUILD)"
