#!/bin/bash
# Plaid's LinkKit SPM binary ships without a dSYM; App Store export warns when
# uploadSymbols is true. Generate one from the embedded framework so symbol
# upload completes cleanly (crash reports inside LinkKit may still be limited).
set -euo pipefail

FW="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/LinkKit.framework/LinkKit"
OUT="${DWARF_DSYM_FOLDER_PATH}/LinkKit.framework.dSYM"

if [[ -f "$FW" && ! -d "$OUT" ]]; then
  xcrun dsymutil "$FW" -o "$OUT"
fi
