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
#   ./scripts/ios-testflight.sh --archive-only   # skip upload; IPA in ios/FiHavenApp/build/export/

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/ios/FiHavenApp"
ARCHIVE="$APP_DIR/build/FiHaven.xcarchive"
EXPORT_DIR="$APP_DIR/build/export"
EXPORT_PLIST="$APP_DIR/ExportOptions.plist"
SCHEME="FiHaven"

archive_only=false
for arg in "$@"; do
  case "$arg" in
    --archive-only) archive_only=true ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

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

if $archive_only; then
  echo "✓ Archive: $ARCHIVE"
  echo "  Upload manually: Xcode → Window → Organizer → Distribute App"
  exit 0
fi

echo "→ Exporting and uploading to App Store Connect"
(cd "$APP_DIR" && xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates)

echo "✓ Upload complete. Check App Store Connect → TestFlight for processing status."
echo "  Build: $(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$ARCHIVE/Info.plist") ($(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$ARCHIVE/Info.plist"))"
