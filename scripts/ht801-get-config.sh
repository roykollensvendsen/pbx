#!/bin/bash
# Read config values from Grandstream HT801 v2
# Usage: ht801-get-config.sh <IP> <session_id:session_token> [P-codes...]
# If no P-codes given, reads common SIP config values

IP="$1"
SESSION="$2"
shift 2 2>/dev/null

if [ -z "$IP" ] || [ -z "$SESSION" ]; then
    echo "Usage: ht801-get-config.sh <IP> <session_id:session_token> [P-codes...]" >&2
    exit 1
fi

SESSION_ID="${SESSION%%:*}"
SESSION_TOKEN="${SESSION#*:}"

# Default P-codes: common SIP account settings
if [ $# -eq 0 ]; then
    PCODES="P271:P47:P35:P36:P34:P3:P31:P130"
else
    PCODES=$(IFS=:; echo "$*")
fi

RESPONSE=$(curl -s -X POST "http://${IP}/cgi-bin/api.values.get" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -b "session_id=${SESSION_ID}" \
    -d "request=${PCODES}&session_token=${SESSION_TOKEN}" \
    --connect-timeout 5 \
    --max-time 10 2>&1)

if echo "$RESPONSE" | grep -q '"error"'; then
    echo "Error reading config from $IP" >&2
    echo "$RESPONSE" >&2
    exit 1
fi

echo "$RESPONSE"
