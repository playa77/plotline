#!/bin/sh
# Version: 1.0.0 | 2026-07-17
# AppImage Chromium SUID sandbox workaround.
# Electron AppImage cannot use the SUID sandbox helper inside a read-only
# squashfs filesystem. This wrapper launches the binary with --no-sandbox.
# See AGENTS.md §11 (Global Known Pitfalls — Electron + AppImage).

SELF="$(readlink -f "$0")"
HERE="$(dirname "$SELF")"
exec "$HERE/plotline" --no-sandbox "$@"
