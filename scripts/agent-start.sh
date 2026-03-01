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

echo "Starting AI phone agent on port ${AGENT_PORT:-9092}..."
exec node agent/server.js
