@echo off
chcp 65001 >nul
TITLE PostBot Control Panel
COLOR 0A
setlocal

set "ROOT_DIR=%~dp0"
set "NODE_DIR=%ROOT_DIR%tools\node-v22.22.1-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

if exist "%NODE_EXE%" (
    set "PATH=%NODE_DIR%;%PATH%"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [LOI] Khong tim thay Node portable trong:
        echo %NODE_DIR%
        echo.
        echo [LOI] May cung chua co Node.js trong PATH.
        echo Hay cai Node.js roi chay lai.
        pause
        exit /b 1
    )

    set "NODE_EXE=node"
    set "NPM_CMD=npm"
    echo [THONG BAO] Khong co Node portable, su dung Node.js he thong.
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
start "PostBot-Backend" cmd /k "cd /d "%ROOT_DIR%" && "%NODE_EXE%" server.js"

echo [3/3] Dang khoi chay Giao dien Frontend (Cong 5173)...
start "PostBot-Frontend" cmd /k "cd /d "%ROOT_DIR%admin-ui" && npx vite"

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
