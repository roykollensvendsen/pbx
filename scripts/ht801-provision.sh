#!/bin/bash
# All-in-one provisioning for Grandstream HT801 v2
# Logs in, configures SIP account, and reboots
# Usage: ht801-provision.sh <IP> <extension> <sip_password> [asterisk_ip]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

IP="$1"
EXTENSION="$2"
SIP_PASSWORD="$3"
ASTERISK_IP="${4:-192.168.10.107}"

if [ -z "$IP" ] || [ -z "$EXTENSION" ] || [ -z "$SIP_PASSWORD" ]; then
    echo "Usage: ht801-provision.sh <IP> <extension> <sip_password> [asterisk_ip]" >&2
    echo "Example: ht801-provision.sh 192.168.10.50 101 secret123 192.168.10.107" >&2
    exit 1
fi

echo "=== Provisioning HT801 at $IP ==="
echo "Extension: $EXTENSION"
echo "Asterisk IP: $ASTERISK_IP"
echo ""

# Step 1: Login
echo "Step 1: Logging in..."
SESSION=$("$SCRIPT_DIR/ht801-login.sh" "$IP")
if [ $? -ne 0 ] || [ -z "$SESSION" ]; then
    echo "Failed to login to $IP" >&2
    exit 1
fi
echo "Login successful."

# Step 2: Configure SIP
echo "Step 2: Configuring SIP account..."
SESSION=$("$SCRIPT_DIR/ht801-set-config.sh" "$IP" "$SESSION" \
    "P271=1" \
    "P47=$ASTERISK_IP" \
    "P35=$EXTENSION" \
    "P36=$EXTENSION" \
    "P34=$SIP_PASSWORD" \
    "P3=Ext $EXTENSION" \
    "P31=1" \
    "P130=0")

if [ $? -ne 0 ]; then
    echo "Failed to set config on $IP" >&2
    exit 1
fi
echo "SIP config applied."

# Step 3: Reboot
echo "Step 3: Rebooting device..."
"$SCRIPT_DIR/ht801-reboot.sh" "$IP" "$SESSION"

echo ""
echo "=== Provisioning complete for $IP (ext $EXTENSION) ==="
echo "Device will reboot and register to $ASTERISK_IP"
