#!/usr/bin/env bash
# Export the IAP promo SVGs → 1024×1024 PNGs (App Store Connect promotional image spec).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "Install librsvg: brew install librsvg" >&2
  exit 1
fi
for name in monthly yearly family; do
  rsvg-convert -w 1024 -h 1024 "iap-promo-$name.svg" -o "iap-promo-$name.png"
  echo "✓ Wrote $DIR/iap-promo-$name.png ($(file -b "iap-promo-$name.png"))"
done
