#!/bin/sh
set -e

# FiHaven.xcodeproj is generated from project.yml and git-ignored.
# Xcode Cloud resolves packages and builds against the .xcodeproj, so
# generate it here before those steps run.
#
# Do not use Homebrew for XcodeGen on Xcode Cloud — brew auto-update +
# bottle pours frequently fail with:
#   Error: /usr/local/Cellar/xcodegen/... is not a directory
# Install the official release zip instead.

XCODEGEN_VERSION="2.46.0"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TOOLS_DIR="${CI_WORKSPACE:-${TMPDIR:-/tmp}}/fihaven-tools"
BIN_DIR="$TOOLS_DIR/xcodegen/bin"
XCODEGEN_BIN="$BIN_DIR/xcodegen"

install_xcodegen() {
  echo "==> Installing XcodeGen ${XCODEGEN_VERSION} from GitHub release"
  mkdir -p "$TOOLS_DIR"
  zip_path="$TOOLS_DIR/xcodegen.zip"
  # Xcode Cloud occasionally resets the GitHub connection mid-download
  # (`curl: (35) Recv failure: Connection reset by peer`). Retry with backoff.
  attempt=1
  max_attempts=5
  while [ "$attempt" -le "$max_attempts" ]; do
    if curl --retry 3 --retry-delay 2 --retry-connrefused -fsSL \
      "https://github.com/yonaskolb/XcodeGen/releases/download/${XCODEGEN_VERSION}/xcodegen.zip" \
      -o "$zip_path"; then
      break
    fi
    echo "⚠ XcodeGen download failed (attempt ${attempt}/${max_attempts})"
    if [ "$attempt" -eq "$max_attempts" ]; then
      echo "✗ Could not download XcodeGen ${XCODEGEN_VERSION}"
      exit 1
    fi
    sleep $((attempt * 3))
    attempt=$((attempt + 1))
  done
  rm -rf "$TOOLS_DIR/xcodegen"
  unzip -q "$zip_path" -d "$TOOLS_DIR"
  rm -f "$zip_path"
  chmod +x "$XCODEGEN_BIN"
}

if [ ! -x "$XCODEGEN_BIN" ]; then
  install_xcodegen
fi

export PATH="$BIN_DIR:$PATH"
"$XCODEGEN_BIN" --version

cd "$SCRIPT_DIR/.."
"$XCODEGEN_BIN" generate

# Xcode Cloud disables automatic SPM resolution and requires Package.resolved
# inside the .xcodeproj. Ours is git-ignored with the project, so copy the
# committed lockfile after XcodeGen runs. Regenerate it when project.yml
# package versions change:
#   xcodebuild -resolvePackageDependencies -project FiHaven.xcodeproj -scheme FiHaven
resolved_dir="FiHaven.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$resolved_dir"
cp xcshareddata/swiftpm/Package.resolved "$resolved_dir/Package.resolved"
