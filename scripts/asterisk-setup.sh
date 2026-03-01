#!/usr/bin/env bash
# Master orchestrator for Asterisk PBX setup with Bluetooth mobile bridging.
# Runs steps 1-6 of the setup plan in order.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo " Asterisk PBX Setup with Bluetooth"
echo "========================================="
echo ""

# Step 1: Disable PipeWire Bluetooth
echo "[Step 1/6] Disabling PipeWire Bluetooth..."
bash "$SCRIPT_DIR/disable-pipewire-bluetooth.sh"
echo ""

# Step 2: Install Bluetooth firmware
echo "[Step 2/6] Installing Bluetooth firmware..."
echo "demo" | sudo -S apt-get update -qq
echo "demo" | sudo -S apt-get install -y bluez-firmware
echo "Verifying Bluetooth adapter..."
echo "demo" | sudo -S hciconfig hci0 up 2>/dev/null || true
hciconfig hci0 2>/dev/null | head -3 || echo "WARNING: hci0 not available"
echo ""

# Step 3: Install Asterisk build dependencies
echo "[Step 3/6] Installing build dependencies..."
bash "$SCRIPT_DIR/asterisk-install-deps.sh"
echo ""

# Step 4: Download and build Asterisk
echo "[Step 4/6] Downloading Asterisk..."
bash "$SCRIPT_DIR/asterisk-download.sh"
echo ""

echo "[Step 4b/6] Building Asterisk (this may take a while)..."
bash "$SCRIPT_DIR/asterisk-build.sh"
echo ""

# Step 5: Configure firewall
echo "[Step 5/6] Configuring firewall..."
bash "$SCRIPT_DIR/firewall-setup.sh"
echo ""

# Step 6: Deploy configs and start Asterisk
echo "[Step 6/6] Deploying configs and starting Asterisk..."
bash "$SCRIPT_DIR/asterisk-deploy-configs.sh"
echo ""

echo "========================================="
echo " Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Pair Android phone: bash scripts/bluetooth-pair.sh"
echo "  2. Find RFCOMM port: asterisk -rx 'mobile search'"
echo "  3. Update configs/asterisk/chan_mobile.conf with Android BD address + port"
echo "  4. Redeploy: bash scripts/asterisk-deploy-configs.sh"
echo "  5. Provision HT801s: bash scripts/ht801-provision.sh <IP> <EXT> pbxpass2024"
echo ""
