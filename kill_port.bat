@echo off
set PORT=8092

:: Read PORT from .env if it exists
if exist .env (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="PORT" set PORT=%%b
    )
)

echo Looking for processes listening on port %PORT%...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo Found process with PID %%a listening on port %PORT%.
    echo Killing PID %%a...
    taskkill /F /PID %%a
)

echo Done.
