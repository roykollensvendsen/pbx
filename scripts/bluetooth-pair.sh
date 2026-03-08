#!/usr/bin/env bash
# Pair an Android phone via Bluetooth for use with Asterisk chan_mobile.
#
# IMPORTANT: Pairing must be initiated FROM the Android phone, not from the PBX.
# This script makes the PBX discoverable so the phone can find and pair with it.
set -euo pipefail

# Detect current adapter
HCI_DEV=$(hciconfig 2>/dev/null | grep -oP 'hci\d+' | head -1)
if [ -z "$HCI_DEV" ]; then
  echo "ERROR: No Bluetooth adapter found"
  exit 1
fi

echo "=== Bluetooth Android Pairing ==="
echo ""
echo "Adapter: $HCI_DEV"

# Ensure adapter is up
echo "Bringing up Bluetooth adapter..."
sudo -n hciconfig "$HCI_DEV" up 2>/dev/null || true
sleep 1

echo "Adapter info:"
hciconfig "$HCI_DEV" | head -5

echo ""
echo "Making PBX discoverable and pairable..."
bluetoothctl discoverable on 2>/dev/null
bluetoothctl pairable on 2>/dev/null

echo ""
echo "==========================================================="
echo " The PBX is now visible to nearby Bluetooth devices."
echo ""
echo " On your Android phone:"
echo "   1. Go to Settings > Connected devices > Pair new device"
echo "   2. Find and tap the PBX device (mx1 or similar)"
echo "   3. Accept the pairing prompt on BOTH devices"
echo "   4. On Android, enable 'Phone calls' for this device"
echo ""
echo " IMPORTANT: Pairing must be initiated FROM the Android phone."
echo " Pairing from the PBX side does not properly store link keys."
echo "==========================================================="
echo ""
echo "After pairing from the phone, run these commands:"
echo "  bluetoothctl trust <ANDROID_BD_ADDRESS>"
echo "  sudo asterisk -rx 'mobile search'"
echo ""
echo "Then update configs/asterisk/chan_mobile.conf with:"
echo "  - Android BD address"
echo "  - RFCOMM port from mobile search"
echo "  - adapter = $HCI_DEV"
echo ""
echo "Waiting for incoming pairing... (Ctrl+C to cancel)"
echo ""

# Keep discoverable and wait — the Android phone initiates the pairing
bluetoothctl
