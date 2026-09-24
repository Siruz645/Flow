@echo off
chcp 65001 > nul
echo =========================================================
echo   🚀 Запуск Google Flow Studio (Bridge Server + Web App)
echo =========================================================
echo.
echo 1. Запуск Bridge-сервера (127.0.0.1:3210)...
start "Google Flow Bridge Server" cmd /k "chcp 65001 > nul && python "%~dp0bridge\server.py""

echo 2. Запуск локального веб-приложения (127.0.0.1:5173)...
start "Google Flow Studio App" cmd /k "chcp 65001 > nul && set PATH=C:\Program Files\nodejs;%PATH% && npm run dev"

echo.
echo ✅ Серверы запущены в фоновых окнах!
echo 🌐 Откройте в браузере: http://127.0.0.1:5173
echo 🌐 Вкладка Google Flow: https://flow.google.com
echo =========================================================
timeout /t 5 > nul
