#!/usr/bin/env bash
# Version: 1.0.0 | 2026-07-16
# CI gate: run typecheck, lint, and tests in sequence.
set -euo pipefail

echo "=== TypeScript type-check ==="
npm run typecheck

echo ""
echo "=== ESLint ==="
npm run lint

echo ""
echo "=== Vitest ==="
npm test

echo ""
echo "=== All CI gates passed ==="
