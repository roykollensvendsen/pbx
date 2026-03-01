#!/usr/bin/env bash
# Deploy Asterisk configuration files from configs/asterisk/ to /etc/asterisk/
# and start (or restart) Asterisk.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_SRC="$REPO_DIR/configs/asterisk"
CONFIG_DST="/etc/asterisk"

echo "=== Deploying Asterisk configs ==="

if [ ! -d "$CONFIG_SRC" ]; then
  echo "ERROR: Config source directory not found: $CONFIG_SRC"
  exit 1
fi

echo "demo" | sudo -S mkdir -p "$CONFIG_DST"

for conf in "$CONFIG_SRC"/*.conf; do
  filename=$(basename "$conf")
  echo "  Deploying $filename..."
  echo "demo" | sudo -S cp "$conf" "$CONFIG_DST/$filename"
done

echo "Setting permissions..."
echo "demo" | sudo -S chown -R root:root "$CONFIG_DST"
echo "demo" | sudo -S chmod 644 "$CONFIG_DST"/*.conf

# Create required directories
echo "demo" | sudo -S mkdir -p /var/lib/asterisk
echo "demo" | sudo -S mkdir -p /var/spool/asterisk
echo "demo" | sudo -S mkdir -p /var/run/asterisk
echo "demo" | sudo -S mkdir -p /var/log/asterisk

# Start or restart Asterisk
if pidof asterisk > /dev/null 2>&1; then
  echo "Reloading Asterisk..."
  echo "demo" | sudo -S asterisk -rx "core reload"
else
  echo "Starting Asterisk..."
  echo "demo" | sudo -S asterisk
  sleep 2
fi

echo "Asterisk status:"
echo "demo" | sudo -S asterisk -rx "core show version" 2>/dev/null || echo "(Asterisk not responding)"

echo "=== Deploy complete ==="
