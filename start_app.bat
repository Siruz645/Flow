@echo off
chcp 65001 > nul
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ===================================================
echo   🚀 Запуск Magic Element Editor (Локальный Flow)
echo   🌐 URL: http://127.0.0.1:5173
echo ===================================================
call npm run dev
pause
