#!/usr/bin/env bash
# Start the whole DharwinOne backend on Linux: studio (:8787) + telephony (:8788).
# Logs go to studio.log / telephony.log next to this script. Ctrl-C stops both.
set -e
cd "$(dirname "$0")"

# ponytail: nohup+trap keeps this a plain script; move to systemd/pm2 when you
# need restarts on crash or boot.
PY=.venv/bin/python
[ -x "$PY" ] || PY=python3

"$PY" -m studio > studio.log 2>&1 &
STUDIO_PID=$!
echo "studio-backend :8787 (pid $STUDIO_PID, logs: studio.log)"

(cd telephony && npm start) > telephony.log 2>&1 &
TEL_PID=$!
echo "telephony :8788 (pid $TEL_PID, logs: telephony.log)"

trap 'kill $STUDIO_PID $TEL_PID 2>/dev/null' INT TERM
wait
