#!/bin/bash
# macOS launcher for the LCD1 Exam Suite — double-click in Finder (or run in
# Terminal). Mirrors Double-Click-To-Run.bat:
#   - Downloads a known-good portable Node.js if one isn't present (no system
#     install), so a fresh Mac works with nothing but git (used to clone this).
#   - Falls back to a direct curl download of the Electron runtime when
#     Electron's own downloader fails on a flaky network.
#   - Launches Electron LIVE from this folder so the in-app "Check for Updates"
#     (git pull + rebuild + reload) keeps working.
cd "$(dirname "$0")" || exit 1

pause() { read -n 1 -s -r -p "Press any key to close..."; echo; }

# Pinned, known-good Node version (matches the Windows launcher).
NODE_VERSION="20.18.1"
NODE_HOME="$(pwd)/node-portable"

# Apple Silicon (arm64) vs Intel (x86_64). Node and Electron both label these
# "arm64" / "x64".
ARCH="$(uname -m)"
case "$ARCH" in
  arm64)  PKG_ARCH="arm64" ;;
  x86_64) PKG_ARCH="x64" ;;
  *) echo "Unsupported CPU architecture: $ARCH"; pause; exit 1 ;;
esac

# 1. Ensure a usable Node.js (prefer the repo-local portable copy).
if [ ! -x "$NODE_HOME/bin/node" ]; then
  echo "======================================================="
  echo "Node.js runtime not found. Downloading a portable copy..."
  echo "Version $NODE_VERSION ($PKG_ARCH, one-time, ~30 MB). No install needed."
  echo "======================================================="
  NODE_DIR="node-v${NODE_VERSION}-darwin-${PKG_ARCH}"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.tar.gz"
  if curl -L --retry 3 --retry-delay 2 -o node-portable.tar.gz "$NODE_URL"; then
    tar -xzf node-portable.tar.gz
    [ -d "$NODE_DIR" ] && mv "$NODE_DIR" "$NODE_HOME"
  fi
  rm -f node-portable.tar.gz
  if [ ! -x "$NODE_HOME/bin/node" ]; then
    echo "======================================================="
    echo "ERROR: Could not download Node.js automatically."
    echo "Please check your internet connection and run this file again,"
    echo "or install Node.js $NODE_VERSION manually from https://nodejs.org/"
    echo "======================================================="
    pause
    exit 1
  fi
fi
# Put the portable Node (and its bundled npm/npx) first on PATH for this
# session AND every child process — including the app's "Check for Updates".
export PATH="$NODE_HOME/bin:$PATH"

# 2. Dependencies installed?
if [ ! -d "node_modules" ]; then
  echo "Node modules not found. Installing dependencies (one-time, ~a minute)..."
  if ! npm install; then echo "ERROR: npm install failed."; pause; exit 1; fi
fi

# 3. Ensure the Electron runtime actually downloaded. npm install can skip this
#    silently, and Electron's downloader fails on some networks — so try its own
#    installer once, then fall back to a direct curl fetch (same robust path we
#    use for Node above).
if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
  echo "======================================================="
  echo "Electron runtime missing. Downloading it now (one-time ~150 MB)..."
  echo "======================================================="
  node "node_modules/electron/install.js"

  if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
    echo "Standard download failed. Trying a direct download instead..."
    ELECTRON_VER="$(node -p "require('./node_modules/electron/package.json').version")"
    EL_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-darwin-${PKG_ARCH}.zip"
    mkdir -p "node_modules/electron/dist"
    if curl -L --retry 3 --retry-delay 2 -o electron-dist.zip "$EL_URL"; then
      unzip -q -o electron-dist.zip -d "node_modules/electron/dist"
    fi
    rm -f electron-dist.zip
  fi

  if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
    echo "======================================================="
    echo "ERROR: Electron runtime download failed."
    echo "Check your internet connection and run this file again."
    echo "======================================================="
    pause
    exit 1
  fi
fi

# 4. Bundle built?
if [ ! -f "bundle.js" ]; then
  echo "Bundling JavaScript components..."
  if ! npm run build; then echo "ERROR: Bundling failed."; pause; exit 1; fi
fi

# 5. Launch live from this repo (not a packaged copy) so self-update works.
echo "Launching the desktop application..."
exec "./node_modules/.bin/electron" .
