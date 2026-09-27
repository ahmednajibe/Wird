@echo off
rem Learning tracker launcher: installs, builds if needed, opens the browser, runs the server.
setlocal
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

set NEED_BUILD=0
if not exist "dist\server\index.js" set NEED_BUILD=1
if not exist "dist\web\index.html" set NEED_BUILD=1
if "%NEED_BUILD%"=="1" (
  echo Building...
  call npm run build
  if errorlevel 1 goto :fail
)

rem Open the browser after ~2 s in a separate minimized window so the server can start first.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:4545"

echo Starting server on http://127.0.0.1:4545 (Ctrl+C to stop)
call npm start
goto :eof

:fail
echo.
echo Launcher failed. See the messages above.
pause
exit /b 1
