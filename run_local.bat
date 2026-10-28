@echo off
title Al-Ameen Local Runner
echo ===================================================
echo   Al-Ameen Mission Academy Memari - Local Servers
echo ===================================================
echo.
echo Starting Backend Server (Port 3000)...
start "Al-Ameen Backend" cmd /k "cd /d d:\memari_soft\al_ameen_backend_new && node server.js"

timeout /t 2 >nul

echo Starting Frontend Web Server (Port 8081)...
start "Al-Ameen Frontend" cmd /k "cd /d d:\memari_soft\al_ameen_khadija_memari_old && npx.cmd expo start --web"

timeout /t 4 >nul

echo Opening App in Default Browser...
start http://localhost:8081

echo.
echo Both servers have been launched!
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:8081
echo ===================================================
pause
