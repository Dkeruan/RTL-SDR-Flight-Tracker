#!/bin/bash

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$PROJECT_DIR/.flight-tracker.env"
if [ -f "$CONFIG_FILE" ]; then
  # Optional local configuration; this file is ignored by Git.
  . "$CONFIG_FILE"
fi

PYTHON="${FLIGHT_TRACKER_PYTHON:-}"
if [ -z "$PYTHON" ] && [ -n "${HOME:-}" ] && [ -x "$HOME/radioconda/bin/python" ]; then
  PYTHON="$HOME/radioconda/bin/python"
fi
if [ -z "$PYTHON" ]; then
  PYTHON="$(command -v python3 || true)"
fi
PORT="8000"
DASHBOARD_URL="http://127.0.0.1:${PORT}/dashboard/"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${TMPDIR:-/tmp}/flight-path-tracker-${RUN_ID}"

SUBSCRIBER_LOG="${LOG_DIR}/subscriber.log"
RADIO_LOG="${LOG_DIR}/gnu-radio.log"
WEB_LOG="${LOG_DIR}/web-server.log"
SUBSCRIBER_PID=""
RADIO_PID=""
WEB_PID=""

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

if [ ! -d "$PROJECT_DIR" ]; then
  fail "Project folder not found: $PROJECT_DIR"
fi
if [ ! -x "$PYTHON" ]; then
  fail "Python interpreter not found. Set FLIGHT_TRACKER_PYTHON in .flight-tracker.env to the Python executable in your GNU Radio environment."
fi
if [ ! -f "$PROJECT_DIR/aircraft_stream.py" ] || [ ! -f "$PROJECT_DIR/adsb_rx.py" ]; then
  fail "Expected aircraft_stream.py and adsb_rx.py in the project folder."
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port 5001 is already in use. Stop the existing GNU Radio flowgraph before launching this one."
  fi
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port $PORT is already in use. Stop the existing local web server before launching this one."
  fi
fi
if command -v pgrep >/dev/null 2>&1 && pgrep -f '[a]ircraft_stream.py' >/dev/null 2>&1; then
  fail "An aircraft_stream.py subscriber is already running. Stop it before launching this one."
fi

mkdir -p "$LOG_DIR" || fail "Could not create log folder: $LOG_DIR"
cd "$PROJECT_DIR" || fail "Could not open project folder: $PROJECT_DIR"

cleanup() {
  printf '\nStopping flight tracker processes...\n'
  for pid in "$WEB_PID" "$RADIO_PID" "$SUBSCRIBER_PID"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$WEB_PID" "$RADIO_PID" "$SUBSCRIBER_PID"; do
    if [ -n "$pid" ]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
  printf 'Stopped.\n'
}

show_log_tail() {
  log_file="$1"
  if [ -f "$log_file" ]; then
    tail -n 30 "$log_file"
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Starting aircraft subscriber...\n'
"$PYTHON" "$PROJECT_DIR/aircraft_stream.py" >"$SUBSCRIBER_LOG" 2>&1 &
SUBSCRIBER_PID=$!
sleep 2
if ! kill -0 "$SUBSCRIBER_PID" 2>/dev/null; then
  printf 'Subscriber exited during startup. Recent log output:\n' >&2
  show_log_tail "$SUBSCRIBER_LOG" >&2
  exit 1
fi

printf 'Starting GNU Radio flowgraph...\n'
"$PYTHON" "$PROJECT_DIR/adsb_rx.py" >"$RADIO_LOG" 2>&1 &
RADIO_PID=$!
sleep 2
if ! kill -0 "$RADIO_PID" 2>/dev/null; then
  printf 'GNU Radio exited during startup. Recent log output:\n' >&2
  show_log_tail "$RADIO_LOG" >&2
  exit 1
fi

printf 'Starting local dashboard server...\n'
"$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 >"$WEB_LOG" 2>&1 &
WEB_PID=$!

server_ready=0
for attempt in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:${PORT}/dashboard/" >/dev/null; then
    server_ready=1
    break
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [ "$server_ready" -ne 1 ]; then
  printf 'Dashboard server did not start. Recent log output:\n' >&2
  show_log_tail "$WEB_LOG" >&2
  exit 1
fi

open "$DASHBOARD_URL"
printf '\nFlight tracker is running.\n'
printf 'Dashboard: %s\n' "$DASHBOARD_URL"
printf 'Logs: %s\n' "$LOG_DIR"
printf 'Keep this Terminal window open. Press Control-C here to stop all three processes.\n\n'

while true; do
  if ! kill -0 "$SUBSCRIBER_PID" 2>/dev/null; then
    printf 'Subscriber stopped unexpectedly. Recent log output:\n' >&2
    show_log_tail "$SUBSCRIBER_LOG" >&2
    exit 1
  fi
  if ! kill -0 "$RADIO_PID" 2>/dev/null; then
    printf 'GNU Radio stopped unexpectedly. Recent log output:\n' >&2
    show_log_tail "$RADIO_LOG" >&2
    exit 1
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    printf 'Dashboard server stopped unexpectedly. Recent log output:\n' >&2
    show_log_tail "$WEB_LOG" >&2
    exit 1
  fi
  sleep 2
done
