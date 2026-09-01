@echo off
setlocal enabledelayedexpansion

title Smart Attendance System

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║        Smart Attendance AI System — Launcher         ║
echo  ║   One server · One URL · http://localhost:8000       ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ─── Check Node ──────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)

:: ─── Check Python ────────────────────────────────────────────────────
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Python not found. Install from https://python.org
    pause & exit /b 1
)

:: ─── Install root dependencies (concurrently) ────────────────────────
echo  [1/4] Installing root dependencies...
call npm install --silent
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] npm install failed.
    pause & exit /b 1
)

:: ─── Build Admin Frontend ────────────────────────────────────────────
echo  [2/4] Building Admin Dashboard...
cd frontend-admin
call npm install --silent
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Admin frontend build failed.
    cd ..
    pause & exit /b 1
)
cd ..

:: ─── Build Live Frontend ─────────────────────────────────────────────
echo  [3/4] Building Live Detection HUD...
cd frontend-live
call npm install --silent
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Live frontend build failed.
    cd ..
    pause & exit /b 1
)
cd ..

:: ─── Start Backend ───────────────────────────────────────────────────
echo  [4/4] Starting Smart Attendance backend...
echo.
echo  ┌─────────────────────────────────────────────────────┐
echo  │  Admin Dashboard  →  http://localhost:8000/         │
echo  │  Live HUD         →  http://localhost:8000/live/    │
echo  │  API Docs         →  http://localhost:8000/docs     │
echo  │  Credentials      →  admin / admin123               │
echo  └─────────────────────────────────────────────────────┘
echo.

cd smart-attendance\backend
if exist venv\Scripts\python.exe (
    venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 2>nul || python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
) else (
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [INFO] If uvicorn failed, activate the venv first:
    echo        cd smart-attendance\backend
    echo        venv\Scripts\activate
    echo        pip install -r requirements.txt
    echo        python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
    pause
)
