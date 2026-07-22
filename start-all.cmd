@echo off
rem Next-only: Next.js API on :8787 + telephony (:8788). Python studio deprecated.
cd /d "%~dp0"

start "next-backend :8787" cmd /k "npm run dev:8787"
start "telephony :8788" cmd /k "cd telephony && npm start"

echo Started: next-backend (:8787) and telephony (:8788).
echo Dev gate: npm run check:next
