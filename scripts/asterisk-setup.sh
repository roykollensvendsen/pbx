#!/usr/bin/env bash
# Master orchestrator for Asterisk PBX setup with Bluetooth mobile bridging.
# Runs all automated setup steps in order.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo " Asterisk PBX Setup with Bluetooth"
echo "========================================="
echo ""

# Step 1: Disable PipeWire Bluetooth
echo "[Step 1/8] Disabling PipeWire Bluetooth..."
bash "$SCRIPT_DIR/disable-pipewire-bluetooth.sh"
echo ""

# Step 2: Install Bluetooth firmware package
echo "[Step 2/8] Installing Bluetooth firmware package..."
sudo -n apt-get update -qq
sudo -n apt-get install -y bluez-firmware
echo ""

# Step 3: Download Broadcom dongle firmware (not in bluez-firmware package)
echo "[Step 3/8] Downloading Broadcom BCM20702A1 dongle firmware..."
if [ ! -f /lib/firmware/brcm/BCM20702A1-050d-065a.hcd ]; then
  sudo -n wget -q -O /lib/firmware/brcm/BCM20702A1-050d-065a.hcd \
    "https://raw.githubusercontent.com/winterheart/broadcom-bt-firmware/master/brcm/BCM20702A1-050d-065a.hcd"
  echo "Firmware downloaded. Reloading btusb to apply..."
  sudo -n hciconfig hci0 down 2>/dev/null || true
  sudo -n rmmod btusb 2>/dev/null || true
  sleep 1
  sudo -n modprobe btusb
  sleep 3
else
  echo "Firmware already present."
fi

# Detect current adapter name (may be hci1 after btusb reload)
HCI_DEV=$(hciconfig 2>/dev/null | grep -oP 'hci\d+' | head -1)
if [ -z "$HCI_DEV" ]; then
  echo "ERROR: No Bluetooth adapter found"
  exit 1
fi
echo "Bluetooth adapter: $HCI_DEV"
sudo -n hciconfig "$HCI_DEV" up 2>/dev/null || true
echo ""

# Step 4: Enable BlueZ SDP server (--compat mode)
echo "[Step 4/8] Enabling BlueZ SDP server (--compat mode)..."
sudo -n sed -i 's|--exec $DAEMON -- $NOPLUGIN_OPTION|--exec $DAEMON -- --compat $NOPLUGIN_OPTION|' /etc/init.d/bluetooth 2>/dev/null || true
sudo -n /etc/init.d/bluetooth restart 2>/dev/null || true
sleep 2
sudo -n hciconfig "$HCI_DEV" up 2>/dev/null || true

# Verify SDP
if sudo -n sdptool browse local 2>&1 | grep -q "Service RecHandle"; then
  echo "SDP server: OK"
else
  echo "WARNING: SDP server not responding"
fi
echo ""

# Step 5: Install Asterisk build dependencies
echo "[Step 5/8] Installing build dependencies..."
bash "$SCRIPT_DIR/asterisk-install-deps.sh"
echo ""

# Step 6: Download and build Asterisk
echo "[Step 6/8] Downloading Asterisk..."
bash "$SCRIPT_DIR/asterisk-download.sh"
echo ""

echo "[Step 6b/8] Building Asterisk (this may take a while)..."
bash "$SCRIPT_DIR/asterisk-build.sh"
echo ""

# Step 7: Configure firewall
echo "[Step 7/8] Configuring firewall..."
bash "$SCRIPT_DIR/firewall-setup.sh"
echo ""

# Step 8: Deploy configs and start Asterisk
echo "[Step 8/8] Deploying configs and starting Asterisk..."
bash "$SCRIPT_DIR/asterisk-deploy-configs.sh"
echo ""

echo "========================================="
echo " Automated setup complete!"
echo "========================================="
echo ""
echo "Adapter detected: $HCI_DEV"
echo ""
echo "IMPORTANT: Update configs/asterisk/chan_mobile.conf"
echo "  - Set 'id = $HCI_DEV' in the [adapter] section"
echo "  - Set 'adapter = $HCI_DEV' in the [android] section"
echo ""
echo "Next steps (manual):"
echo "  1. Make PBX discoverable: bluetoothctl discoverable on && bluetoothctl pairable on"
echo "  2. Pair FROM the Android phone (Settings > Bluetooth > scan > pair the PBX)"
echo "  3. Run: sudo asterisk -rx 'mobile search' to verify RFCOMM port"
echo "  4. Update configs/asterisk/chan_mobile.conf with Android BD address + port"
echo "  5. Redeploy: bash scripts/asterisk-deploy-configs.sh"
echo "  6. Reload chan_mobile: sudo asterisk -rx 'module unload chan_mobile.so' && sudo asterisk -rx 'module load chan_mobile.so'"
echo "  7. Provision HT801s: bash scripts/ht801-provision.sh <IP> <EXT> pbxpass2024"
echo ""
