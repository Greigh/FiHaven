#!/usr/bin/env bash
set -euo pipefail

# Generates iOS AppIcon + LaunchIcon sizes and Android mipmap launcher icons
# from client/public/icon.svg (the canonical FiHaven mark).
# Requires ImageMagick (`magick`) and macOS `sips`.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_SVG="$ROOT/client/public/icon.svg"
IOS_APPICONSET_DIR="$ROOT/ios/FiHavenApp/Sources/Assets.xcassets/AppIcon.appiconset"
IOS_LAUNCH_DIR="$ROOT/ios/FiHavenApp/Sources/Assets.xcassets/LaunchIcon.imageset"
ANDROID_RES_DIR="$ROOT/android/app/src/main/res"

if [ ! -f "$SRC_SVG" ]; then
  echo "Source SVG not found at $SRC_SVG"
  exit 1
fi
if ! command -v qlmanage >/dev/null 2>&1; then
  echo "macOS qlmanage is required to rasterize SVG with correct colors."
  exit 1
fi

render_png() {
  local px="$1"
  local out="$2"
  local tmpdir
  tmpdir="$(mktemp -d)"
  qlmanage -t -s "$px" -o "$tmpdir" "$SRC_SVG" >/dev/null 2>&1
  mv "$tmpdir/icon.svg.png" "$out"
  rm -rf "$tmpdir"
}

echo "Rendering master icon from $SRC_SVG"
MASTER="$IOS_APPICONSET_DIR/AppIcon-1024.png"
mkdir -p "$IOS_APPICONSET_DIR" "$IOS_LAUNCH_DIR"
render_png 1024 "$MASTER"

echo "Generating iOS AppIcon sizes"
declare -a IOS_FILES=(
  "40:icon-20@2x.png"
  "60:icon-20@3x.png"
  "58:icon-29@2x.png"
  "87:icon-29@3x.png"
  "80:icon-40@2x.png"
  "120:icon-40@3x.png"
  "120:icon-60@2x.png"
  "180:icon-60@3x.png"
  "20:icon-20.png"
  "29:icon-29.png"
  "40:icon-40.png"
  "76:icon-76.png"
  "152:icon-76@2x.png"
  "167:icon-83.5@2x.png"
)
for spec in "${IOS_FILES[@]}"; do
  px="${spec%%:*}"
  file="${spec##*:}"
  render_png "$px" "$IOS_APPICONSET_DIR/$file"
done

echo "Generating iOS LaunchIcon sizes"
render_png 128 "$IOS_LAUNCH_DIR/LaunchIcon.png"
render_png 256 "$IOS_LAUNCH_DIR/LaunchIcon@2x.png"
render_png 384 "$IOS_LAUNCH_DIR/LaunchIcon@3x.png"

echo "Generating Android mipmap icons"
while IFS='=' read -r folder size; do
  outdir="$ANDROID_RES_DIR/$folder"
  mkdir -p "$outdir"
  render_png "$size" "$outdir/ic_launcher.png"
  render_png "$size" "$outdir/ic_launcher_round.png"
done <<'EOF'
mipmap-mdpi=48
mipmap-hdpi=72
mipmap-xhdpi=96
mipmap-xxhdpi=144
mipmap-xxxhdpi=192
EOF

echo "Done. iOS icons: $IOS_APPICONSET_DIR"
