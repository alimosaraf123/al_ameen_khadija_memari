@echo off
set "SCRIPT_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_PATH=%STARTUP_DIR%\AlAmeenScannerHelper.vbs"

(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%SCRIPT_DIR%scanner-bridge.ps1"" -Port 4789", 0, False
) > "%VBS_PATH%"

echo Auto-start installed at: "%VBS_PATH%"
echo Starting Scanner Helper in background now...
wscript.exe "%VBS_PATH%"
echo Done! You can now click "Direct Scan (Scanner)" in Student Entry.
pause
