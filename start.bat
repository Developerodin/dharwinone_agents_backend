@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo [studio] Run backend\scripts\setup.bat first to create .venv and .env
  exit /b 1
)
".venv\Scripts\python.exe" -m studio
