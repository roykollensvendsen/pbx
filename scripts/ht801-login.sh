#!/bin/bash
# Login to Grandstream HT801 v2 and output session credentials
# Usage: ht801-login.sh <IP> [password]
# Output: session_id:session_token (both needed for subsequent API calls)

IP="$1"
PASSWORD="${2:-Garasje123}"

if [ -z "$IP" ]; then
    echo "Usage: ht801-login.sh <IP> [password]" >&2
    exit 1
fi

PASSWORD_B64=$(echo -n "$PASSWORD" | base64)

RESPONSE=$(curl -s -i -X POST "http://${IP}/cgi-bin/dologin" \
    -d "username=admin&P2=${PASSWORD_B64}" \
    --connect-timeout 5 \
    --max-time 10 2>&1)

SESSION_ID=$(echo "$RESPONSE" | grep -i 'set-cookie' | grep -oP 'session_id=\K[^;]+')
SESSION_TOKEN=$(echo "$RESPONSE" | grep -oP '"session_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ] || [ -z "$SESSION_TOKEN" ]; then
    echo "Login failed for $IP" >&2
    echo "$RESPONSE" | tail -1 >&2
    exit 1
fi

echo "${SESSION_ID}:${SESSION_TOKEN}"
