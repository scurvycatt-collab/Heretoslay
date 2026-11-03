@echo off
cd /d "%~dp0"
call npm install --no-audit --no-fund || (echo Cai dat that bai & pause & exit /b 1)
start "" "http://localhost:5173/?asset-import"
call npm run dev:web
pause
