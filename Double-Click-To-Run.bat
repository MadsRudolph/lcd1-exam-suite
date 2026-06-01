@echo off
title LCD1 Exam Suite Launcher
cd /d "%~dp0"

:: ============================================================
::  Self-bootstrapping launcher
::  - Downloads a known-good portable Node.js if one isn't present
::    (no system install, no admin rights), so a fresh PC works
::    with nothing pre-installed except git (used to clone this repo).
::  - Builds and launches the app LIVE from this repo folder so the
::    in-app "Check for Updates" button keeps working.
:: ============================================================

:: Pinned, known-good Node version. Newer Node builds have been seen to
:: break Electron's one-time binary download; 20.x LTS is the safe baseline.
set "NODE_VERSION=20.18.1"
set "NODE_DIR=node-v%NODE_VERSION%-win-x64"
set "NODE_HOME=%~dp0node-portable"

:: 1. Ensure a usable Node.js (prefer the repo-local portable copy).
if exist "%NODE_HOME%\node.exe" goto have_node

echo =======================================================
echo Node.js runtime not found. Downloading a portable copy...
echo Version %NODE_VERSION% ^(one-time, ~30 MB^). No install needed.
echo =======================================================

set "NODE_ZIP=%~dp0node-portable.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_DIR%.zip"

:: Try built-in curl + tar first (present on Windows 10 1803+ / Windows 11).
:: NOTE: extract into the current directory (we cd'd to %~dp0 above).
:: Do NOT pass -C "%~dp0": the trailing backslash escapes the closing
:: quote and tar fails with "could not chdir".
where curl >nul 2>nul && where tar >nul 2>nul
if %errorlevel% equ 0 (
    curl -L -o "%NODE_ZIP%" "%NODE_URL%"
    if exist "%NODE_ZIP%" tar -xf "%NODE_ZIP%"
) else (
    :: Fallback for older systems without curl/tar.
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing; Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '.' -Force } catch { exit 1 }"
)

:: The archive extracts to node-v<ver>-win-x64\ ; rename it to node-portable\.
if exist "%~dp0%NODE_DIR%\node.exe" (
    move "%~dp0%NODE_DIR%" "%NODE_HOME%" >nul
)
if exist "%NODE_ZIP%" del "%NODE_ZIP%" >nul 2>nul

if not exist "%NODE_HOME%\node.exe" (
    echo =======================================================
    echo ERROR: Could not download Node.js automatically.
    echo Please check your internet connection and run this file again,
    echo or install Node.js %NODE_VERSION% manually from https://nodejs.org/
    echo =======================================================
    pause
    exit /b
)

:have_node
:: 2. Put the portable Node ^(and its bundled npm/npx^) first on PATH for
::    this session AND every child process -- including the app's
::    "Check for Updates" button, which spawns npm to rebuild.
set "PATH=%NODE_HOME%;%PATH%"

:: 3. Install local dependencies if missing.
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

:: 4. Ensure the Electron runtime binary actually downloaded.
::    npm install does NOT reliably trigger Electron's binary download,
::    so do it explicitly with a few retries to survive a flaky network.
::    (Flat goto flow -- labels inside an if(...) block do not work in batch.)
if exist "node_modules\electron\dist\electron.exe" goto electron_done
echo =======================================================
echo Electron runtime binary missing. Downloading it now...
echo This is a one-time ~230 MB download.
echo =======================================================
set "ELECTRON_TRIES=0"
:electron_retry
node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" goto electron_done
set /a ELECTRON_TRIES+=1
if %ELECTRON_TRIES% geq 3 goto electron_failed
echo Download attempt failed. Retrying (%ELECTRON_TRIES%/3)...
goto electron_retry
:electron_failed
echo ERROR: Electron runtime download failed after 3 attempts!
echo Check your internet connection and run this file again.
pause
exit /b
:electron_done

:: 5. Build the bundle if missing.
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

:: 6. Launch the app LIVE from this repo folder (not a packaged copy).
::    Running directly with electron is what makes the in-app
::    "Check for Updates" button work: git pull + rebuild + reload
::    all operate on these real files, so new features appear on reload.
echo =======================================================
echo Launching desktop application...
echo =======================================================
start "" "node_modules\electron\dist\electron.exe" .
exit
