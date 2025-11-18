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
      return 1
    else
      rm -f "$pidfile"
    fi
  fi
  bash -c "$cmd" >> "$logfile" 2>&1 &
  echo $! > "$pidfile"
  echo "Started: $cmd (pid $(cat "$pidfile")) -> $logfile"
  return 0
}

trap 'cleanup; exit' INT TERM

# Try to start backend and server. start_if_not_running returns 0 when it started the process.
start_if_not_running "node \"$ROOT/public/backend.cjs\"" "$PID_BACKEND" "$LOG_BACKEND"
BACK_STARTED=$?
start_if_not_running "node \"$ROOT/server.js\"" "$PID_SERVER" "$LOG_SERVER"
SRV_STARTED=$?

# Read pids (may be pre-existing)
BACK_PID=$(cat "$PID_BACKEND" 2>/dev/null || true)
SRV_PID=$(cat "$PID_SERVER" 2>/dev/null || true)

echo "Press Ctrl+C to stop both processes."
echo "Backend pid: $BACK_PID (started_by_script=$BACK_STARTED)"
echo "Server pid:  $SRV_PID (started_by_script=$SRV_STARTED)"

# Monitor both PIDs without using wait on non-child processes.
# Loop will exit when neither PID exists or is running.
while true; do
  any_running=0

  if [ -n "$BACK_PID" ] && kill -0 "$BACK_PID" 2>/dev/null; then
    any_running=1
  else
    BACK_PID=""
  fi

  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    any_running=1
  else
    SRV_PID=""
  fi

  [ "$any_running" -eq 0 ] && break

  sleep 1
done

echo "No monitored processes are running anymore."
cleanup