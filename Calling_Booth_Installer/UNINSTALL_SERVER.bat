@echo off
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
echo Stopping and removing Al-Ameen Calling Server Auto-Start...
schtasks /end /tn "AlAmeenCallingServer" >nul 2>&1
schtasks /delete /tn "AlAmeenCallingServer" /f >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo Auto-Start task removed!
pause
