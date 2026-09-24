@echo off
chcp 65001 > nul
echo ===================================================
echo   🚀 Запуск Google Flow Live Sync Bridge
echo   🌐 URL: http://127.0.0.1:3210
echo   📂 Локальная папка с кодом: %~dp0src
echo ===================================================
python "%~dp0bridge\server.py"
pause
