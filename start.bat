@echo off
title Harm [Auto-Restart Engine]

set MODE=cluster
if "%1"=="dev" set MODE=dev
if "%1"=="single" set MODE=single

:loop
cls
if "%MODE%"=="dev" (
    echo [Harm] Starting bot in dev mode with automatic file watcher...
    node --watch src/index.js
) else if "%MODE%"=="single" (
    echo [Harm] Starting bot in standalone mode...
    node src/index.js
) else (
    echo [Harm] Starting bot with hybrid clustering and auto-healing...
    node src/cluster.js
)
echo.
echo [Harm] Process ended or crashed. Restarting in 3 seconds... (Ctrl+C to abort)
timeout /t 3 >nul
goto loop

