#!/bin/bash
# Reboot Grandstream HT801 v2 to apply config changes
# Usage: ht801-reboot.sh <IP> <session_id:session_token>

IP="$1"
SESSION="$2"

if [ -z "$IP" ] || [ -z "$SESSION" ]; then
    echo "Usage: ht801-reboot.sh <IP> <session_id:session_token>" >&2
    exit 1
fi

SESSION_ID="${SESSION%%:*}"
SESSION_TOKEN="${SESSION#*:}"

echo "Rebooting device at $IP..."
RESPONSE=$(curl -s -X POST "http://${IP}/cgi-bin/api-sys_operation" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -b "session_id=${SESSION_ID}" \
    -d "request=REBOOT&session_token=${SESSION_TOKEN}" \
    --connect-timeout 5 \
    --max-time 10 2>&1)

echo "Reboot command sent to $IP"
echo "$RESPONSE"
