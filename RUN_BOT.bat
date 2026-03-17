@echo off
TITLE PostBot Control Panel
COLOR 0A

echo ======================================================
echo           HE THONG POSTBOT - TU DONG HOA FB
echo ======================================================
echo.

echo [1/3] Dang don dep cac tien trinh cu (Node.js)...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] Dang khoi chay Server Backend (Cong 3001)...
start "PostBot-Backend" cmd /c "node server.js"

echo [3/3] Dang khoi chay Giao dien Frontend (Cong 5173)...
cd admin-ui
start "PostBot-Frontend" cmd /c "npm run dev"

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
