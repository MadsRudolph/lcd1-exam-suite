@echo off
title Control Block Diagram Reducer Launcher
cd /d "%~dp0"

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo =======================================================
    echo ERROR: Node.js is NOT installed on this computer!
    echo =======================================================
    echo Node.js is required to install dependencies and run the app.
    echo Please download and install Node.js from: https://nodejs.org/
    echo =======================================================
    pause
    exit /b
)

:: 2. Check if local dependencies exist (auto-install)
if not exist "node_modules\" (
    echo =======================================================
    echo Node modules not found. Installing dependencies...
    echo This may take a minute...
    echo =======================================================
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed!
        pause
        exit /b
    )
)

:: 2b. Ensure the Electron runtime binary actually downloaded.
::     npm install does NOT reliably trigger Electron's binary download
::     (it can be skipped or fail silently), which would stop the app launching.
if not exist "node_modules\electron\dist\electron.exe" (
    echo =======================================================
    echo Electron runtime binary missing. Downloading it now...
    echo This is a one-time ~230 MB download.
    echo =======================================================
    node "node_modules\electron\install.js"
    if not exist "node_modules\electron\dist\electron.exe" (
        echo ERROR: Electron runtime download failed!
        echo Check your internet connection and run this file again.
        pause
        exit /b
    )
)

:: 3. Check if bundle exists (auto-build)
if not exist "bundle.js" (
    echo =======================================================
    echo Bundling modular javascript components...
    echo =======================================================
    call npm run build
    if %errorlevel% neq 0 (
        echo ERROR: Bundling failed!
        pause
        exit /b
    )
)

:: 4. Launch the app LIVE from this repo folder (not a packaged copy).
::     Running directly with electron is what makes the in-app
::     "Check for Updates" button work: git pull + rebuild + reload
::     all operate on these real files, so new features appear on reload.
echo =======================================================
echo Launching desktop application...
echo =======================================================
start "" "node_modules\electron\dist\electron.exe" .
exit
