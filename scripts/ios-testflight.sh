#!/usr/bin/env bash
# Archive FiHaven for TestFlight / App Store Connect and upload the IPA.
#
# Prerequisites:
#   brew install xcodegen
#   Xcode signed in: Xcode → Settings → Accounts (team 365KR8NF53)
#   App Store Connect app record for app.fihaven
#
# Auth (pick one):
#   • Xcode account (interactive first upload), or
#   • App Store Connect API key:
#       export APP_STORE_CONNECT_API_KEY_ID=...
#       export APP_STORE_CONNECT_API_ISSUER_ID=...
#       export APP_STORE_CONNECT_API_KEY_PATH=~/path/to/AuthKey_XXXX.p8
#
# Usage (from repo root):
#   ./scripts/ios-testflight.sh
#   ./scripts/ios-testflight.sh --build 3        # set CURRENT_PROJECT_VERSION then archive
#   ./scripts/ios-testflight.sh --build +1       # bump build by 1, then archive
#   ./scripts/ios-testflight.sh --archive-only   # skip upload; IPA in ios/FiHavenApp/build/export/
#
# Interactive (default when run in a terminal): prompts like npm init —
#   Version sources:
#     package.json          1.6.0
#     iOS MARKETING_VERSION 1.6.0
#     Android versionName   1.6.0
#   Version (currently 1.6.0): (1.6.1)
#   Are you sure? You haven't updated package.json (still 1.6.0). (y/N)
#   Do you want me to update them (package.json + iOS + Android) to 1.6.1? (Y/n)
#   iOS build (currently 2): (1)
# Enter accepts the suggested default.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/ios/FiHavenApp"
ARCHIVE="$APP_DIR/build/FiHaven.xcarchive"
EXPORT_DIR="$APP_DIR/build/export"
EXPORT_PLIST="$APP_DIR/ExportOptions.plist"
SCHEME="FiHaven"

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
      sed -n '2,24p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -n "$build_arg" ]]; then
  current="$(node -e "console.log(require('$ROOT/scripts/native-versions').readIos().build)")"
  echo "→ iOS build (currently $current) → setting to $build_arg"
  node "$ROOT/scripts/native-versions.js" --ios "$build_arg" >/dev/null
elif [[ -t 0 ]]; then
  node "$ROOT/scripts/native-versions.js" --prompt-ios
else
  current="$(node -e "console.log(require('$ROOT/scripts/native-versions').readIos().build)")"
  echo "→ Non-interactive: keeping iOS build $current from project.yml"
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

rm -rf "$APP_DIR/build"
mkdir -p "$APP_DIR/build"

echo "→ Archiving (Release, generic iOS device)"
(cd "$APP_DIR" && xcodebuild archive \
  -project FiHaven.xcodeproj \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=365KR8NF53)

# Sanity-check: Release must not compile with the DEBUG flag (TestFlight builds
# must not ship the Developer settings screen or other #if DEBUG tooling).
if (cd "$APP_DIR" && xcodebuild -project FiHaven.xcodeproj -scheme "$SCHEME" \
  -showBuildSettings -configuration Release 2>/dev/null) | grep -q 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG'; then
  echo "❌ Release configuration still defines DEBUG — aborting." >&2
  exit 1
fi
echo "✓ Release build verified (DEBUG compile flag off)"

# Plaid LinkKit is a prebuilt binary without a bundled dSYM. Ensure one exists
# in the archive before export so uploadSymbols does not warn.
LINKKIT_BIN="$ARCHIVE/Products/Applications/FiHaven.app/Frameworks/LinkKit.framework/LinkKit"
LINKKIT_DSYM="$ARCHIVE/dSYMs/LinkKit.framework.dSYM"
if [[ -f "$LINKKIT_BIN" && ! -d "$LINKKIT_DSYM" ]]; then
  echo "→ Generating LinkKit.framework.dSYM for symbol upload"
  mkdir -p "$ARCHIVE/dSYMs"
  xcrun dsymutil "$LINKKIT_BIN" -o "$LINKKIT_DSYM"
fi

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
# .ipa on disk so the build isn't wasted.
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
    echo "✓ Upload complete. Check App Store Connect → TestFlight for processing status."
    echo "  Build: $VERSION ($BUILD)"
    exit 0
  fi

  echo "" >&2
  echo "✗ Upload failed — no usable Apple identity." >&2
  echo "" >&2
  echo "  Export a signed .ipa anyway so the archive isn't wasted…" >&2
  LOCAL_PLIST="$(mktemp -t fihaven-export).plist"
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
  if [[ -f "$EXPORT_DIR/FiHaven.ipa" ]]; then
    echo "  ✓ Signed IPA: $EXPORT_DIR/FiHaven.ipa  ($VERSION build $BUILD)" >&2
  fi
  cat >&2 <<EOF

  To upload, pick one:

    a) App Store Connect API key (works headlessly — recommended):
         App Store Connect → Users and Access → Integrations → App Store Connect API
         Copy the Issuer ID (a UUID) and your Key ID, then:

           export APP_STORE_CONNECT_API_KEY_ID=XXXXXXXXXX
           export APP_STORE_CONNECT_API_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
           # .p8 at ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
           npm run deploy:ios

    b) Sign in to Xcode: Xcode → Settings → Accounts → (+) Apple ID, then rerun.

    c) Upload the .ipa by hand: Xcode → Window → Organizer → Distribute App,
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

echo "✓ Upload complete. Check App Store Connect → TestFlight for processing status."
echo "  Build: $VERSION ($BUILD)"
