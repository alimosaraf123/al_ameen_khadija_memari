@echo off
title Al-Ameen Calling Booth Server - Installer
color 0A

:: Auto-elevate to Administrator if not already Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   Al-Ameen Mission Academy Memari - Calling Booth Installer
echo ============================================================
echo.

:: 1. Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js is NOT installed on this PC.
    echo Attempting automatic install via winget...
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo.
        echo [ERROR] Automatic Node.js install failed.
        echo Please install Node.js LTS from https://nodejs.org/ and run this script again!
        start https://nodejs.org/
        pause
        exit /b 1
    )
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

for /f "delims=" %%i in ('where node') do set "NODE_EXE=%%i"
echo [OK] Node.js found: %NODE_EXE%
echo.

:: 2. Copy server files to C:\AlAmeen_Calling_Server
set "TARGET_DIR=C:\AlAmeen_Calling_Server"
echo [1/5] Copying server files to %TARGET_DIR% ...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
robocopy "%~dp0server" "%TARGET_DIR%" /E /NFL /NDL /NJH /NJS /nc /ns /np
if not exist "%TARGET_DIR%\server.js" (
    echo [ERROR] server.js not found in %~dp0server !
    pause
    exit /b 1
)
echo [OK] Files copied to %TARGET_DIR%
echo.

:: 3. Install dependencies if node_modules or @breezystack/lamejs missing
cd /d "%TARGET_DIR%"
if not exist "%TARGET_DIR%\node_modules\@breezystack\lamejs" (
    echo [2/5] Installing/updating Node.js packages ^(internet needed^)...
    call npm install --omit=dev
    if %errorLevel% neq 0 (
        echo [ERROR] npm install failed! Check internet connection and try again.
        pause
        exit /b 1
    )
) else (
    echo [2/5] Dependencies already up-to-date, skipping npm install.
)
echo [OK] Dependencies ready.
echo.

:: 4. Create background launcher PowerShell & VBScript
echo [3/5] Creating background auto-launcher...
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "C:\AlAmeen_Calling_Server"
echo WshShell.Run "cmd /c ""%NODE_EXE%"" server.js >> ""C:\AlAmeen_Calling_Server\server.log"" 2>&1", 0, False
) > "%TARGET_DIR%\start_hidden.vbs"
echo [OK] Launcher created.
echo.

:: 5. Configure Windows Firewall
echo [4/5] Opening Windows Firewall ports (5060 UDP, 3000 TCP, Node.js)...
netsh advfirewall firewall delete rule name="AlAmeen SIP 5060 UDP" >nul 2>&1
netsh advfirewall firewall delete rule name="AlAmeen API 3000 TCP" >nul 2>&1
netsh advfirewall firewall delete rule name="AlAmeen Node RTP" >nul 2>&1
netsh advfirewall firewall add rule name="AlAmeen SIP 5060 UDP" dir=in action=allow protocol=UDP localport=5060 >nul
netsh advfirewall firewall add rule name="AlAmeen API 3000 TCP" dir=in action=allow protocol=TCP localport=3000 >nul
netsh advfirewall firewall add rule name="AlAmeen Node RTP" dir=in action=allow program="%NODE_EXE%" >nul
echo [OK] Firewall rules configured.
echo.

:: 6. Register Windows Startup Task (runs even before login, auto-restarts)
echo [5/5] Setting up Windows Auto-Start Task (AlAmeenCallingServer)...
schtasks /end /tn "AlAmeenCallingServer" >nul 2>&1
schtasks /delete /tn "AlAmeenCallingServer" /f >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c cd /d C:\AlAmeen_Calling_Server && \"%NODE_EXE%\" server.js >> C:\AlAmeen_Calling_Server\server.log 2>&1'; " ^
  "$trigger = New-ScheduledTaskTrigger -AtStartup; " ^
  "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; " ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero); " ^
  "Register-ScheduledTask -TaskName 'AlAmeenCallingServer' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null"

schtasks /run /tn "AlAmeenCallingServer" >nul
timeout /t 4 /nobreak >nul

echo.
echo ============================================================
echo   Checking Server Status...
echo ============================================================
netstat -ano | findstr ":5060"
echo.
echo Local IPv4 Address of this PC:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -ExpandProperty IPAddress"
echo.
echo ============================================================
echo   SUCCESS! Calling Server is ACTIVE & Auto-Start ENABLED!
echo   - You can safely remove the Pen Drive now.
echo   - Note: Make sure this PC's Static IP is 192.168.0.133
echo     (or update Yealink SIP Server IP to match above IP).
echo ============================================================
pause
