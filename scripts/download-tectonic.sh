#!/bin/bash
# Version: 0.1.0 | 2026-07-17
# Download the Tectonic LaTeX engine binary for local development/testing.
# This is fetched at build time and never committed (vendor/tectonic/ is gitignored).

set -euo pipefail

VERSION="${TECTONIC_VERSION:-0.15.0}"
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENDOR_DIR="$SCRIPT_DIR/../vendor/tectonic"

mkdir -p "$VENDOR_DIR"

# Map platform/arch to Tectonic release asset name
case "$PLATFORM" in
  Linux)
    case "$ARCH" in
      x86_64)  ASSET="tectonic-${VERSION}-x86_64-unknown-linux-gnu.tar.gz" ;;
      aarch64) ASSET="tectonic-${VERSION}-aarch64-unknown-linux-gnu.tar.gz" ;;
      *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  Darwin)
    case "$ARCH" in
      x86_64)  ASSET="tectonic-${VERSION}-x86_64-apple-darwin.tar.gz" ;;
      arm64)   ASSET="tectonic-${VERSION}-aarch64-apple-darwin.tar.gz" ;;
      *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported platform: $PLATFORM"; exit 1 ;;
esac

URL="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/${ASSET}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Downloading Tectonic ${VERSION} for ${PLATFORM}/${ARCH}..."
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] URL: $URL"

curl -fsSL "$URL" -o "$VENDOR_DIR/${ASSET}"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Extracting..."

tar -xzf "$VENDOR_DIR/${ASSET}" -C "$VENDOR_DIR"
rm "$VENDOR_DIR/${ASSET}"

# Make executable
chmod +x "$VENDOR_DIR/tectonic"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Tectonic ${VERSION} installed to $VENDOR_DIR/tectonic"
"$VENDOR_DIR/tectonic" --version
