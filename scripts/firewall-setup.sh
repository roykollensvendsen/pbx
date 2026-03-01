#!/usr/bin/env bash
# Open UFW firewall ports for Asterisk PBX (SIP signaling + RTP media).
# Only allows traffic from the local LAN subnet.
set -euo pipefail

SUBNET="192.168.10.0/24"

echo "=== Configuring UFW for Asterisk ==="

# SIP signaling (UDP 5060)
echo "Allowing SIP (UDP 5060) from $SUBNET..."
echo "demo" | sudo -S ufw allow from "$SUBNET" to any port 5060 proto udp

# RTP media (UDP 10000-20000)
echo "Allowing RTP (UDP 10000:20000) from $SUBNET..."
echo "demo" | sudo -S ufw allow from "$SUBNET" to any port 10000:20000 proto udp

echo "Current UFW status:"
echo "demo" | sudo -S ufw status numbered

echo "=== Firewall configured ==="
