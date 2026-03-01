#!/bin/bash
# Write config values to Grandstream HT801 v2
# Usage: ht801-set-config.sh <IP> <session_id:session_token> <P=value...>
# Outputs the new session credentials (token rotates after each write)
# Example: ht801-set-config.sh 192.168.10.50 abc:def123 P47=192.168.10.107 P35=101

IP="$1"
SESSION="$2"
shift 2 2>/dev/null

if [ -z "$IP" ] || [ -z "$SESSION" ] || [ $# -eq 0 ]; then
    echo "Usage: ht801-set-config.sh <IP> <session_id:session_token> <P=value...>" >&2
    echo "Example: ht801-set-config.sh 192.168.10.50 abc:def123 P47=192.168.10.107 P35=101" >&2
    exit 1
fi

SESSION_ID="${SESSION%%:*}"
SESSION_TOKEN="${SESSION#*:}"

# Build POST body
BODY="update=1&session_token=${SESSION_TOKEN}"
for PAIR in "$@"; do
    BODY="${BODY}&${PAIR}"
done

RESPONSE=$(curl -s -X POST "http://${IP}/cgi-bin/api.values.post" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -b "session_id=${SESSION_ID}" \
    -d "$BODY" \
    --connect-timeout 5 \
    --max-time 10 2>&1)

if echo "$RESPONSE" | grep -q '"error"'; then
    echo "Error writing config to $IP" >&2
    echo "$RESPONSE" >&2
    exit 1
fi

# Extract new token (rotates after each write)
NEW_TOKEN=$(echo "$RESPONSE" | grep -oP '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$NEW_TOKEN" ]; then
    echo "${SESSION_ID}:${NEW_TOKEN}"
else
    echo "$RESPONSE" >&2
    exit 1
fi
