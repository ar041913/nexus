@echo off
REM Start NEXUS.ai Backend API
REM Usage: start-backend.bat

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║ NEXUS.ai Backend API Server                                   ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Starting backend API on http://localhost:8000...
echo API Documentation: http://localhost:8000/docs
echo Health Check: http://localhost:8000/health
echo.

call venv\Scripts\activate.bat
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

pause
