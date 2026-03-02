#!/usr/bin/env bash
# Watchdog for chan_mobile — monitors Bluetooth HFP device status and
# automatically reloads the module when the device disconnects or enters
# a broken state (e.g. after SCO audio error 104).
set -euo pipefail

CHECK_INTERVAL=15
RELOAD_COOLDOWN=10
ASTERISK_LOG="/var/log/asterisk/messages"
ERROR_WINDOW=60  # seconds

log() {
  echo "[Watchdog] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

reload_chan_mobile() {
  log "Reloading chan_mobile.so..."
  echo "demo" | sudo -S asterisk -rx "module unload chan_mobile.so" 2>/dev/null || true
  sleep 2
  echo "demo" | sudo -S asterisk -rx "module load chan_mobile.so" 2>/dev/null || true
  log "Reload complete. Waiting ${RELOAD_COOLDOWN}s for reconnection..."
  sleep "$RELOAD_COOLDOWN"
}

check_device_connected() {
  local output
  output=$(echo "demo" | sudo -S asterisk -rx "mobile show devices" 2>/dev/null) || return 1

  # Parse the android device line — columns: ID Address Group Adapter Connected State
  local connected
  connected=$(echo "$output" | awk '/^android/ { print $5 }')

  if [ "$connected" = "Yes" ]; then
    return 0
  else
    return 1
  fi
}

check_recent_read_errors() {
  # Look for chan_mobile read errors in the last ERROR_WINDOW seconds
  if [ ! -f "$ASTERISK_LOG" ]; then
    return 1
  fi

  local cutoff
  cutoff=$(date -d "-${ERROR_WINDOW} seconds" '+%b %_d %H:%M:%S' 2>/dev/null) || return 1

  # Grep for read error lines and check if any are recent
  local errors
  errors=$(echo "demo" | sudo -S grep "chan_mobile" "$ASTERISK_LOG" 2>/dev/null \
    | grep -i "read error" \
    | tail -5) || return 1

  if [ -z "$errors" ]; then
    return 1
  fi

  # Check if the most recent error is within the time window
  local last_error_time
  last_error_time=$(echo "$errors" | tail -1 | awk '{ print $1, $2, $3 }')

  if [ -z "$last_error_time" ]; then
    return 1
  fi

  local last_epoch cutoff_epoch
  last_epoch=$(date -d "$last_error_time" '+%s' 2>/dev/null) || return 1
  cutoff_epoch=$(date -d "-${ERROR_WINDOW} seconds" '+%s' 2>/dev/null) || return 1

  if [ "$last_epoch" -ge "$cutoff_epoch" ]; then
    return 0
  fi

  return 1
}

cleanup() {
  log "Shutting down."
  exit 0
}

trap cleanup SIGINT SIGTERM

log "Started. Checking every ${CHECK_INTERVAL}s."

while true; do
  if ! check_device_connected; then
    log "Device 'android' is NOT connected."
    reload_chan_mobile
  elif check_recent_read_errors; then
    log "Recent read errors detected — device may be in a broken state."
    reload_chan_mobile
  else
    log "Device 'android' is connected and healthy."
  fi

  sleep "$CHECK_INTERVAL"
done
