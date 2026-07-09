@echo off
rem Start the whole DharwinOne backend: Python studio (:8787) + Node telephony (:8788).
rem Each service opens in its own window; close a window to stop that service.
cd /d "%~dp0"

start "studio-backend :8787" cmd /k .venv\Scripts\python -m studio
start "telephony :8788" cmd /k "cd telephony && npm start"

echo Started: studio-backend (:8787) and telephony (:8788) in separate windows.
