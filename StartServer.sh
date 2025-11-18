#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_BACKEND="/tmp/yt-dlp-backend.pid"
PID_SERVER="/tmp/yt-dlp-server.pid"
LOG_BACKEND="$ROOT/backend.log"
LOG_SERVER="$ROOT/server.log"

cleanup() {
  echo "Stopping processes..."
  [ -f "$PID_BACKEND" ] && { pid=$(cat "$PID_BACKEND"); kill -TERM "$pid" 2>/dev/null || true; }
  [ -f "$PID_SERVER" ] && { pid=$(cat "$PID_SERVER"); kill -TERM "$pid" 2>/dev/null || true; }
  sleep 0.5
  [ -f "$PID_BACKEND" ] && { pid=$(cat "$PID_BACKEND"); kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true; }
  [ -f "$PID_SERVER" ] && { pid=$(cat "$PID_SERVER"); kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true; }

  rm -f "$PID_BACKEND" "$PID_SERVER"
  echo "Stopped."
}

start_if_not_running() {
  local cmd="$1" pidfile="$2" logfile="$3"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Already running (pid $pid) - leaving as-is"
      return
    else
      rm -f "$pidfile"
    fi
  fi
  bash -c "$cmd" >> "$logfile" 2>&1 &
  echo $! > "$pidfile"
  echo "Started: $cmd (pid $(cat "$pidfile")) -> $logfile"
}

trap 'cleanup; exit' INT TERM

start_if_not_running "node \"$ROOT/public/backend.cjs\"" "$PID_BACKEND" "$LOG_BACKEND"
start_if_not_running "node \"$ROOT/server.js\"" "$PID_SERVER" "$LOG_SERVER"

BACK_PID=$(cat "$PID_BACKEND" 2>/dev/null || true)
SRV_PID=$(cat "$PID_SERVER" 2>/dev/null || true)

echo "Press Ctrl+C to stop both processes."
echo "Backend pid: $BACK_PID"
echo "Server pid:  $SRV_PID"

# Wait for backend first; if it exits, leave server running and notify.
if [ -n "$BACK_PID" ]; then
  echo "Waiting for backend (pid $BACK_PID)..."
  wait "$BACK_PID"
  echo "Backend (pid $BACK_PID) exited with status $?. The server will remain running. Press Ctrl+C to stop the server."
fi

# Now wait for the server. When the server exits (or user presses Ctrl+C), cleanup runs.
if [ -n "$SRV_PID" ]; then
  echo "Waiting for server (pid $SRV_PID)..."
  wait "$SRV_PID"
  echo "Server (pid $SRV_PID) exited with status $?."
fi

cleanup