@echo off
TITLE PostBot Control Panel
COLOR 0A
setlocal

set "ROOT_DIR=%~dp0"
set "NODE_DIR=%ROOT_DIR%tools\node-v22.22.1-win-x64"
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%NODE_DIR%\node.exe" (
    echo [LOI] Khong tim thay Node portable trong:
    echo %NODE_DIR%
    pause
    exit /b 1
)

if not exist "%ROOT_DIR%\.env" (
    echo [CANH BAO] Chua co file .env. Hay tao tu .env.example va dien thong tin tai khoan.
)

echo ======================================================
echo           HE THONG POSTBOT - TU DONG HOA FB
echo ======================================================
echo.

echo [1/3] Dang don dep cac tien trinh cu (Node.js)...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] Dang khoi chay Server Backend (Cong 3001)...
start "PostBot-Backend" cmd /k "cd /d "%ROOT_DIR%" && "%NODE_DIR%\node.exe" server.js"

echo [3/3] Dang khoi chay Giao dien Frontend (Cong 5173)...
start "PostBot-Frontend" cmd /k "cd /d "%ROOT_DIR%admin-ui" && "%NODE_DIR%\npm.cmd" run dev"

echo.
echo ======================================================
echo   BOT DA KHOI DONG XONG!
echo   1. Giao dien web: http://localhost:5173
echo   2. API Backend: http://localhost:3001
echo.
echo   Luu y: Vui long khong dong cac cua so vưa hien len.
echo ======================================================
echo.
pause
