@echo off
title Al-Ameen Calling Server - Status Check
echo ============================================================
echo   Al-Ameen Calling Booth Server - Status
echo ============================================================
echo.
echo [1] Scheduled Task Status:
schtasks /query /tn "AlAmeenCallingServer" /fo LIST | findstr /I "TaskName Status"
echo.
echo [2] Port 5060 (Yealink SIP) & Port 3000 (API):
netstat -ano | findstr ":5060 :3000"
echo.
echo [3] This PC IPv4 Address:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -ExpandProperty IPAddress"
echo.
echo [4] Latest 20 lines from Server Log:
if exist "C:\AlAmeen_Calling_Server\server.log" (
    powershell -NoProfile -Command "Get-Content 'C:\AlAmeen_Calling_Server\server.log' -Tail 20"
) else (
    echo Log file not found yet.
)
echo.
pause
