@echo off
title Al-Ameen Scanner Helper (Port 4789)
echo Starting Al-Ameen Universal Windows Scanner Helper...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scanner-bridge.ps1" -Port 4789
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Scanner Helper stopped with error. Press any key to close...
  pause >nul
)
