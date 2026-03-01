#!/usr/bin/env bash
# Disable PipeWire/WirePlumber Bluetooth to prevent HFP/HSP profile conflicts
# with Asterisk chan_mobile. Copies override config and restarts WirePlumber.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="$REPO_DIR/configs/wireplumber/90-disable-bluetooth.conf"
TARGET_DIR="/etc/wireplumber/wireplumber.conf.d"

echo "=== Disabling PipeWire Bluetooth ==="

echo "demo" | sudo -S mkdir -p "$TARGET_DIR"
echo "demo" | sudo -S cp "$SOURCE" "$TARGET_DIR/90-disable-bluetooth.conf"
echo "Copied override to $TARGET_DIR/"

echo "Restarting WirePlumber..."
systemctl --user restart wireplumber 2>/dev/null || true

echo "Verifying (wpctl status should show no BT devices)..."
sleep 1
wpctl status 2>/dev/null | head -30 || echo "(wpctl not available)"

echo "=== PipeWire Bluetooth disabled ==="
