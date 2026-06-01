@echo off
title Launching LCD1 Exam Suite...
cd /d "%~dp0"

:: Put the repo-local portable Node (and bundled npm) first on PATH so the
:: in-app "Check for Updates" button can spawn git pull + npm run build.
:: If no portable Node was fetched yet, run Double-Click-To-Run.bat first.
if exist "%~dp0node-portable\node.exe" set "PATH=%~dp0node-portable;%PATH%"

echo Launching desktop application...
start "" "node_modules\electron\dist\electron.exe" .
exit
