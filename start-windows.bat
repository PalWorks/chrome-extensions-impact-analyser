@echo off
rem Starts Chrome Extensions Impact Analyser on Windows. Double-click this file.
setlocal
cd /d "%~dp0"
title Chrome Extensions Impact Analyser

where node >nul 2>nul
if errorlevel 1 goto nonode

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 goto oldnode

if not exist "node_modules\puppeteer" goto install
if not exist ".cache\puppeteer\chrome" goto install
goto run

:install
echo First run: downloading what Chrome Extensions Impact Analyser needs (about 200 MB). This happens only once.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo The download failed. Check your internet connection and double-click this file again.
  pause
  exit /b 1
)

:run
node src\server.js %*
pause
exit /b 0

:nonode
echo Chrome Extensions Impact Analyser needs Node.js version 22.12 or newer.
echo Opening the download page. Install the LTS version, then double-click this file again.
start "" "https://nodejs.org/"
pause
exit /b 1

:oldnode
echo Your Node.js is too old. Chrome Extensions Impact Analyser needs version 22.12 or newer.
echo Opening the download page. Install the LTS version, then double-click this file again.
start "" "https://nodejs.org/"
pause
exit /b 1
