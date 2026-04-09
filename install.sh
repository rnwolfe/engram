#!/usr/bin/env bash
set -euo pipefail

REPO="rnwolfe/engram"
BINARY="engram"

# Detect OS
case "$(uname -s)" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="macos" ;;
  *)
    echo "error: unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

# Detect architecture
case "$(uname -m)" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

TARGET="${BINARY}-${OS}-${ARCH}"

# Resolve install directory (prefer /usr/local/bin, fall back to ~/.local/bin)
if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
elif [ "$(id -u)" -eq 0 ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

INSTALL_PATH="${INSTALL_DIR}/${BINARY}"

# Fetch latest release download URL
echo "Fetching latest release from github.com/${REPO}..."

API_URL="https://api.github.com/repos/${REPO}/releases/latest"

if command -v curl &>/dev/null; then
  RELEASE_JSON=$(curl -fsSL "$API_URL")
elif command -v wget &>/dev/null; then
  RELEASE_JSON=$(wget -qO- "$API_URL")
else
  echo "error: curl or wget is required" >&2
  exit 1
fi

DOWNLOAD_URL=$(echo "$RELEASE_JSON" \
  | grep -o "\"browser_download_url\": *\"[^\"]*${TARGET}[^\"]*\"" \
  | grep -o 'https://[^"]*' \
  | head -1)

if [ -z "$DOWNLOAD_URL" ]; then
  echo "error: no release asset found for ${TARGET}" >&2
  echo "Available assets can be found at: https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | grep -o 'v[^"]*' | head -1)
echo "Installing engram ${VERSION} (${OS}/${ARCH}) to ${INSTALL_PATH}..."

# Download binary
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

if command -v curl &>/dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TMP"
else
  wget -qO "$TMP" "$DOWNLOAD_URL"
fi

chmod +x "$TMP"

# Install (may need sudo if /usr/local/bin isn't writable by current user)
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "$INSTALL_PATH"
else
  echo "sudo required to write to ${INSTALL_DIR}"
  sudo mv "$TMP" "$INSTALL_PATH"
fi

echo "engram ${VERSION} installed to ${INSTALL_PATH}"

# Warn if install dir isn't in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo ""
  echo "warning: ${INSTALL_DIR} is not in your PATH."
  echo "Add this to your shell profile:"
  echo "  export PATH=\"\$PATH:${INSTALL_DIR}\""
fi
