@echo off
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
echo Restarting Al-Ameen Calling Server...
schtasks /end /tn "AlAmeenCallingServer" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /run /tn "AlAmeenCallingServer"
timeout /t 3 /nobreak >nul
echo Server restarted!
pause
