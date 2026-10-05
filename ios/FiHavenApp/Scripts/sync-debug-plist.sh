#!/bin/bash
# Regenerate Sources/Info.Debug.plist — the Debug-config INFOPLIST_FILE —
# from the committed Sources/Info.plist. Debug builds point at
# http://localhost:5222 or a LAN dev server (FH_BASE=http://<ip>:5222), which
# needs NSAllowsLocalNetworking; Release points at production HTTPS and must
# not carry that exception, so the committed Info.plist stays strict for
# every configuration and only the Debug copy gets the key.
#
# Run this after changing `info.properties` in project.yml (xcodegen
# regenerates Sources/Info.plist from it; the Debug copy is then stale).
set -euo pipefail

cd "$(dirname "$0")/.."
cp Sources/Info.plist Sources/Info.Debug.plist
/usr/bin/plutil -insert NSAppTransportSecurity -dictionary Sources/Info.Debug.plist
/usr/bin/plutil -insert NSAppTransportSecurity.NSAllowsLocalNetworking -bool YES Sources/Info.Debug.plist
echo "Regenerated Sources/Info.Debug.plist from Sources/Info.plist (+ NSAllowsLocalNetworking)."
