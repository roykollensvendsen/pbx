#!/bin/bash
# Scan local network for Grandstream devices using arp-scan + MAC OUI filtering
# Usage: scan-devices.sh [interface]

INTERFACE="${1:-eth0}"

# Grandstream MAC OUI prefixes
GRANDSTREAM_OUIS="00:0b:82|c0:74:ad|ec:74:d7|14:4c:ff"

echo "Scanning for Grandstream devices on interface $INTERFACE..."
RESULTS=$(sudo -n arp-scan --localnet --interface="$INTERFACE" 2>/dev/null \
    | grep -iE "$GRANDSTREAM_OUIS")

if [ -z "$RESULTS" ]; then
    echo "No Grandstream devices found."
    exit 1
fi

echo ""
echo "Found Grandstream devices:"
echo "-------------------------------------------"
echo "$RESULTS"
echo "-------------------------------------------"
echo ""
echo "$RESULTS" | wc -l | xargs echo "Total devices:"
