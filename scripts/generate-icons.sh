#!/usr/bin/env bash
set -euo pipefail

# Generates iOS AppIcon + LaunchIcon sizes and Android mipmap launcher icons
# from client/public/icon.svg (the canonical FiHaven mark).
# Requires macOS `qlmanage` + `sips` and ImageMagick (`magick`).
#
# IMPORTANT: app/launcher icons must be a FULL-BLEED OPAQUE SQUARE — iOS and
# the Android launcher apply their own corner mask. The web icon.svg is a
# *rounded* maskable tile (rx=15) with transparent corners; rasterizing it
# directly makes qlmanage matte those corners WHITE, leaving every launcher
# icon a blue tile on a white square. So we square the corners (rx=0, gradient
# fills the whole canvas) and strip the alpha before writing each PNG.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_SVG="$ROOT/client/public/icon.svg"
IOS_APPICONSET_DIR="$ROOT/ios/FiHavenApp/Sources/Assets.xcassets/AppIcon.appiconset"
IOS_LAUNCH_DIR="$ROOT/ios/FiHavenApp/Sources/Assets.xcassets/LaunchIcon.imageset"
ANDROID_RES_DIR="$ROOT/android/app/src/main/res"
BRAND_BLUE="#3D6FE1"

if [ ! -f "$SRC_SVG" ]; then
  echo "Source SVG not found at $SRC_SVG"
  exit 1
fi
if ! command -v qlmanage >/dev/null 2>&1; then
  echo "macOS qlmanage is required to rasterize SVG with correct colors."
  exit 1
fi
if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) is required to flatten the alpha channel."
  exit 1
fi

# Full-bleed square variant of the mark: drop the rounded corners so the
# gradient covers every pixel (no transparent corners → no white matte).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
APP_SVG="$WORK/app-icon.svg"
sed 's/rx="15"/rx="0"/' "$SRC_SVG" > "$APP_SVG"

render_png() {
  local px="$1"
  local out="$2"
  local tmpdir
  tmpdir="$(mktemp -d)"
  qlmanage -t -s "$px" -o "$tmpdir" "$APP_SVG" >/dev/null 2>&1
  mv "$tmpdir/app-icon.svg.png" "$out"
  rm -rf "$tmpdir"
  # Flatten onto brand blue and drop the alpha channel: a full-bleed, opaque
  # square is required (Apple rejects alpha; launchers mask the corners).
  magick "$out" -background "$BRAND_BLUE" -alpha remove -alpha off "$out"
}

# Round an already-rendered square PNG, knocking the corners out to
# transparent. Used ONLY for the LaunchIcon (the splash draws the image raw
# with no OS mask, so it needs the rounded app-icon shape baked in, on
# transparent corners that blend into the launch background). Radius matches
# the web icon.svg (rx=15 on a 64 grid).
round_corners() {
  local file="$1"
  local px="$2"
  local r=$(( px * 15 / 64 ))
  local mdir
  mdir="$(mktemp -d)"
  magick -size "${px}x${px}" xc:none -draw "roundrectangle 0,0,$((px-1)),$((px-1)),$r,$r" "$mdir/mask.png"
  magick "$file" "$mdir/mask.png" -alpha set -compose DstIn -composite "$file"
  rm -rf "$mdir"
}

echo "Rendering master icon from $SRC_SVG (squared, opaque)"
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

echo "Generating iOS LaunchIcon sizes (rounded, transparent corners)"
render_png 128 "$IOS_LAUNCH_DIR/LaunchIcon.png";    round_corners "$IOS_LAUNCH_DIR/LaunchIcon.png" 128
render_png 256 "$IOS_LAUNCH_DIR/LaunchIcon@2x.png"; round_corners "$IOS_LAUNCH_DIR/LaunchIcon@2x.png" 256
render_png 384 "$IOS_LAUNCH_DIR/LaunchIcon@3x.png"; round_corners "$IOS_LAUNCH_DIR/LaunchIcon@3x.png" 384

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
