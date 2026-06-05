#!/usr/bin/env bash
set -euo pipefail

# Generates iOS AppIcon sizes and Android mipmap launcher icons from
# ios/FiHavenApp/Sources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
# Requires macOS `sips` (bundled) and writes into the repo in-place.

SRC_IOS="ios/FiHavenApp/Sources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
IOS_APPICONSET_DIR="ios/FiHavenApp/Sources/Assets.xcassets/AppIcon.appiconset"
ANDROID_RES_DIR="android/app/src/main/res"

if [ ! -f "$SRC_IOS" ]; then
  echo "Source iOS AppIcon not found at $SRC_IOS"
  exit 1
fi

echo "Generating iOS App Icons from $SRC_IOS"
mkdir -p "$IOS_APPICONSET_DIR"

# iOS sizes: tuples of {base size, scale}
IOS_SIZES=(
  "20 1" "20 2" "20 3"
  "29 1" "29 2" "29 3"
  "40 1" "40 2" "40 3"
  "60 2" "60 3"
  "76 1" "76 2"
  "83.5 2"
  "1024 1"
)

# Build Contents.json entries
CONTENTS="{\n  \"images\" : [\n"
FIRST=true
for entry in "${IOS_SIZES[@]}"; do
  size=$(echo "$entry" | awk '{print $1}')
  scale=$(echo "$entry" | awk '{print $2}')
  # Remove decimal for filename
  name_size=$(echo "$size" | sed 's/\./_/g')
  px=$(printf "%.0f" "$(echo "$size * $scale" | bc -l)")
  filename=AppIcon-${name_size}@${scale}x.png
  sips -Z "$px" "$SRC_IOS" --out "$IOS_APPICONSET_DIR/$filename" >/dev/null

  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    CONTENTS+=",\n"
  fi

  CONTENTS+="    { \"idiom\" : \"universal\", \"filename\" : \"$filename\", \"size\" : \"${size}x${size}\", \"scale\" : \"${scale}x\" }"
done

CONTENTS+="\n  ],\n  \"info\" : { \"version\" : 1, \"author\" : \"xcode\" }\n}"

printf "%s" "$CONTENTS" > "$IOS_APPICONSET_DIR/Contents.json"

echo "iOS App icons generated in $IOS_APPICONSET_DIR"

# Android mipmap sizes (px for launcher icon)
# mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192
declare -A ANDROID_SIZES=( [mipmap-mdpi]=48 [mipmap-hdpi]=72 [mipmap-xhdpi]=96 [mipmap-xxhdpi]=144 [mipmap-xxxhdpi]=192 )

echo "Generating Android mipmap icons from $SRC_IOS"
for folder in "${!ANDROID_SIZES[@]}"; do
  size=${ANDROID_SIZES[$folder]}
  outdir="$ANDROID_RES_DIR/$folder"
  mkdir -p "$outdir"
  outpng="$outdir/ic_launcher.png"
  sips -Z "$size" "$SRC_IOS" --out "$outpng" >/dev/null
  # Round icon variant
  sips -Z "$size" "$SRC_IOS" --out "$outdir/ic_launcher_round.png" >/dev/null
done

echo "Android mipmap icons generated under $ANDROID_RES_DIR"

echo "Done. Update & commit the generated assets as needed."
