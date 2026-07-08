@echo off
setlocal
cd /d "%~dp0.."
call .venv\Scripts\ruff format studio
call .venv\Scripts\ruff check studio --fix
cd ..\Frontend\Dharwin-One
call npm run format
echo Studio formatting complete.
