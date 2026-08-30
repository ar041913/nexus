@echo off
REM Start NEXUS.ai Frontend
REM Usage: start-frontend.bat

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║ NEXUS.ai Frontend (Next.js)                                    ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Starting frontend on http://localhost:3000...
echo.

cd apps\web
npm run dev

pause
