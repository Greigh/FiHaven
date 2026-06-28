#!/bin/bash
# Plaid's LinkKit SPM binary ships without a dSYM; App Store export warns when
# uploadSymbols is true. Generate one from the embedded framework so symbol
# upload completes cleanly (crash reports inside LinkKit may still be limited).
#
# This is BEST-EFFORT: a missing LinkKit dSYM is only an upload warning, never a
# real failure, so a dsymutil error must not break the build. (The script needs
# to read the embedded framework — see ENABLE_USER_SCRIPT_SANDBOXING: NO in
# project.yml, without which the read is sandbox-denied in CI.)
set -uo pipefail

FW="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/LinkKit.framework/LinkKit"
OUT="${DWARF_DSYM_FOLDER_PATH}/LinkKit.framework.dSYM"

if [[ ! -f "$FW" ]]; then
  echo "note: LinkKit framework not found at $FW — skipping dSYM generation."
  exit 0
fi
if [[ -d "$OUT" ]]; then
  exit 0
fi

if ! xcrun dsymutil "$FW" -o "$OUT"; then
  echo "warning: could not generate LinkKit dSYM (continuing; symbol upload may warn about a missing LinkKit dSYM)."
fi
exit 0
