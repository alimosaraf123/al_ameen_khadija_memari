@echo off
title Launching Android Emulator - Gateman
echo ===================================================
echo   Al-Ameen Mission Academy Memari - Gateman Emulator
echo ===================================================
echo.
echo Starting Android Virtual Device (GatemanTest)...
echo Please wait a few seconds for the emulator window to appear...
echo.

set ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_SDK_ROOT%\emulator;%ANDROID_SDK_ROOT%\platform-tools;%PATH%

start "" "%ANDROID_SDK_ROOT%\emulator\emulator.exe" -avd GatemanTest -gpu host -no-boot-anim

echo.
echo Waiting for device to connect...
"%ANDROID_SDK_ROOT%\platform-tools\adb.exe" wait-for-device

echo Forwarding ports (API: 3000, Web: 8081)...
"%ANDROID_SDK_ROOT%\platform-tools\adb.exe" reverse tcp:3000 tcp:3000
"%ANDROID_SDK_ROOT%\platform-tools\adb.exe" reverse tcp:8081 tcp:8081

echo Launching Al-Ameen App...
"%ANDROID_SDK_ROOT%\platform-tools\adb.exe" shell monkey -p com.alameenmission.memari -c android.intent.category.LAUNCHER 1 >nul 2>&1

echo.
echo Done! The Emulator is now running on your desktop.
timeout /t 4
