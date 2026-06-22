#!/bin/sh
set -e

# FiHaven.xcodeproj is generated from project.yml and git-ignored.
# Xcode Cloud resolves packages and builds against the .xcodeproj, so
# generate it here before those steps run.
brew install xcodegen

cd "$(dirname "$0")/.."
xcodegen generate

# Xcode Cloud disables automatic SPM resolution and requires Package.resolved
# inside the .xcodeproj. Ours is git-ignored with the project, so copy the
# committed lockfile after XcodeGen runs. Regenerate it when project.yml
# package versions change:
#   xcodebuild -resolvePackageDependencies -project FiHaven.xcodeproj -scheme FiHaven
resolved_dir="FiHaven.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$resolved_dir"
cp xcshareddata/swiftpm/Package.resolved "$resolved_dir/Package.resolved"
