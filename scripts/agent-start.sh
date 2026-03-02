#!/bin/bash
# Start the AI phone agent (AudioSocket server)
set -e

cd "$(dirname "$0")/.."

if [ ! -f agent/.env ]; then
  echo "ERROR: agent/.env not found. Copy agent/.env.example to agent/.env and fill in API keys."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting chan_mobile watchdog in background..."
bash scripts/chan-mobile-watchdog.sh &
WATCHDOG_PID=$!
echo "Watchdog PID: $WATCHDOG_PID"

cleanup() {
  echo "Stopping watchdog (PID $WATCHDOG_PID)..."
  kill "$WATCHDOG_PID" 2>/dev/null || true
  wait "$WATCHDOG_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting AI phone agent on port ${AGENT_PORT:-9092}..."
node agent/server.js
