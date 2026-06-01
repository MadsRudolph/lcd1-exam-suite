#!/bin/bash
# macOS launcher for the LCD1 Exam Suite — double-click in Finder (or run in
# Terminal). Mirrors Double-Click-To-Run.bat: ensure Node, install deps once,
# build the bundle, then launch Electron live from this folder so the in-app
# "Check for Updates" (git pull + rebuild + reload) keeps working.
cd "$(dirname "$0")" || exit 1

pause() { read -n 1 -s -r -p "Press any key to close..."; echo; }

# 1. Node.js present?
if ! command -v node >/dev/null 2>&1; then
  echo "======================================================="
  echo "ERROR: Node.js is NOT installed on this Mac."
  echo "Node.js is required to install dependencies and run the app."
  echo "Install it from https://nodejs.org/ and run this file again."
  echo "======================================================="
  pause
  exit 1
fi

# 2. Dependencies installed?
if [ ! -d "node_modules" ]; then
  echo "Node modules not found. Installing dependencies (one-time, ~a minute)..."
  if ! npm install; then echo "ERROR: npm install failed."; pause; exit 1; fi
fi

# 2b. Electron runtime actually downloaded? (npm install can skip this silently.)
if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
  echo "Electron runtime missing. Downloading it now (one-time ~230 MB)..."
  node "node_modules/electron/install.js"
  if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
    echo "ERROR: Electron runtime download failed — check your connection and retry."
    pause
    exit 1
  fi
fi

# 3. Bundle built?
if [ ! -f "bundle.js" ]; then
  echo "Bundling JavaScript components..."
  if ! npm run build; then echo "ERROR: Bundling failed."; pause; exit 1; fi
fi

# 4. Launch live from this repo (not a packaged copy) so self-update works.
echo "Launching the desktop application..."
exec "./node_modules/.bin/electron" .
