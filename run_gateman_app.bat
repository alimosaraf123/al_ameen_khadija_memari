@echo off
cd /d "%~dp0al_ameen_gateman_app"
echo ========================================================
echo   Starting Al-Ameen Dedicated Gate Security App...
echo ========================================================
cmd /c "npm.cmd run web"
pause
