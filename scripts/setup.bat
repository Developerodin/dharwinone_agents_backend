@echo off
cd /d "%~dp0\.."
echo [studio] Backend root: %CD%

if not exist ".venv\Scripts\python.exe" (
  echo [studio] Creating virtualenv...
  python -m venv .venv
  if errorlevel 1 exit /b 1
)

echo [studio] Installing editable package + dependencies...
".venv\Scripts\pip.exe" install -e ".[dev]"
if errorlevel 1 exit /b 1

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo [studio] Created .env from .env.example
)

echo.
echo [studio] Setup complete. Start the API with:
echo   backend\start.bat
echo or:
echo   backend\.venv\Scripts\python -m studio
