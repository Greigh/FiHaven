#!/bin/sh
set -e

# FiHaven.xcodeproj is generated from project.yml and git-ignored.
# Xcode Cloud resolves packages and builds against the .xcodeproj, so
# generate it here before those steps run.
brew install xcodegen

cd "$(dirname "$0")/.."
xcodegen generate
