#!/bin/sh
# Build a read-only HTTP Git mirror of the current commit for static hosting.
set -eu
cd "$(dirname "$0")"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
git bundle create "$stage/source.bundle" HEAD main
git init --quiet --bare -b main "$stage/source.git"
git rev-list --objects HEAD | cut -d' ' -f1 | git pack-objects --stdout | git --git-dir="$stage/source.git" unpack-objects
git --git-dir="$stage/source.git" update-ref refs/heads/main "$(git rev-parse HEAD)"
git --git-dir="$stage/source.git" update-server-info
if [ -d dist/source.git ]; then mv dist/source.git "$stage/previous"; fi
mkdir -p dist/source.git
cp -R "$stage/source.git/objects" "$stage/source.git/refs" "$stage/source.git/info" "$stage/source.git/HEAD" dist/source.git/
cp "$stage/source.bundle" dist/source.bundle
