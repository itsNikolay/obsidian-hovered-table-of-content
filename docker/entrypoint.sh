#!/usr/bin/env bash
# unit:       lint, typecheck, unit tests, build.
# check:      everything from unit, then end-to-end tests against the real Linux Obsidian app.
# e2e:        build, then only the real Obsidian tests.
# demo:       build, then record the README demo GIF in the real Obsidian app.
# demo-title: build, then record the focused linked-note TOC title preview MP4.
set -euo pipefail
mode="${1:-check}"
[ "$#" -gt 0 ] && shift
# A filtered unit run skips unrelated lint, build and tests. The default stays complete.
if [ "$mode" = "unit" ] && [ "$#" -gt 0 ]; then
  npx vitest run "$@"
  exit 0
fi
if [ "$mode" = "e2e" ] || [ "$mode" = "demo" ] || [ "$mode" = "demo-title" ]; then
  npm run build
else
  npm run check
fi
[ "$mode" = "unit" ] && exit 0
Xvfb :99 -screen 0 1440x1000x24 -ac -nolisten tcp > /tmp/xvfb.log 2>&1 &
display_pid=$!
trap 'kill "$display_pid" 2>/dev/null || true' EXIT
for _attempt in {1..30}; do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
if [ "$mode" = "demo" ]; then
  node --experimental-strip-types scripts/record-demo.mts
elif [ "$mode" = "demo-title" ]; then
  node --experimental-strip-types scripts/record-demo.mts --title
else
  node --experimental-strip-types scripts/test-obsidian-docker.mts "$@"
fi
