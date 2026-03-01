#!/usr/bin/env bash
# Pair an Android phone via Bluetooth for use with Asterisk chan_mobile.
# Uses bluetoothctl for scanning, pairing, and trusting the device.
set -euo pipefail

echo "=== Bluetooth Android Pairing ==="

# Ensure Bluetooth adapter is up
echo "Bringing up Bluetooth adapter..."
sudo hciconfig hci0 up 2>/dev/null || true
sleep 1

echo "Adapter info:"
hciconfig hci0 | head -5

echo ""
echo "Starting interactive Bluetooth pairing..."
echo "Instructions:"
echo "  1. Make sure your Android phone has Bluetooth ON and is discoverable"
echo "  2. In bluetoothctl, run these commands:"
echo "     power on"
echo "     agent on"
echo "     default-agent"
echo "     scan on"
echo "  3. Wait for your Android phone to appear (look for the device name)"
echo "  4. Copy the Android's BD address (XX:XX:XX:XX:XX:XX)"
echo "  5. Run: pair <BD_ADDRESS>"
echo "  6. Confirm the PIN on both devices"
echo "  7. Run: trust <BD_ADDRESS>"
echo "  8. Run: quit"
echo ""
echo "After pairing, update configs/asterisk/chan_mobile.conf with the Android BD address."
echo "Then run: asterisk -rx 'mobile search' to find the RFCOMM channel."
echo ""

bluetoothctl
