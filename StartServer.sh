#!/usr/bin/env bash
set -euo pipefail

# PID file ensures the backend is started only once
PIDFILE="/tmp/yt-dlp-backend.pid"
LOGFILE="$(dirname "$0")/backend.log"
BACKEND_JS="$(dirname "$0")/backend.js"

# if a pidfile exists and process is alive, exit quietly
if [ -f "$PIDFILE" ]; then
  pid=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "Backend already running (pid $pid)"
    exit 0
  else
    echo "Removing stale pidfile"
    rm -f "$PIDFILE"
  fi
fi

# start backend in background and write its pid
nohup node "$BACKEND_JS" >> "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"
echo "Started backend (pid $(cat "$PIDFILE"))"