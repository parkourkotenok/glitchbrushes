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

if not exist "node_modules\.bin\tsc.cmd" goto :install_dependencies
if not exist "node_modules\.bin\vite.cmd" goto :install_dependencies
goto :dependencies_ready

:install_dependencies
echo Installing or repairing dependencies...
call npm install
if errorlevel 1 goto :failed

:dependencies_ready
if not exist "node_modules\.bin\tsc.cmd" (
  echo [ERROR] TypeScript was not installed correctly.
  goto :failed
)
if not exist "node_modules\.bin\vite.cmd" (
  echo [ERROR] Vite was not installed correctly.
  goto :failed
)

echo Building the production version...
call npm run build
if errorlevel 1 goto :failed

echo Starting production Glitchbrushes at http://127.0.0.1:4173/
call npm run preview -- --host 127.0.0.1 --port 4173 --open

if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Server failed to start. See the error above.
pause
exit /b 1
