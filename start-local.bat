@echo off
setlocal
title Glitchbrushes Local Server
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js / npm is not installed or is not available in PATH.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

echo Starting Glitchbrushes at http://127.0.0.1:5173/
call npm run dev -- --host 127.0.0.1 --port 5173 --open

if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Server failed to start. See the error above.
pause
exit /b 1
