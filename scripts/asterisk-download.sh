#!/usr/bin/env bash
# Download Asterisk 22 LTS source tarball and extract to /usr/local/src/.
set -euo pipefail

ASTERISK_URL="https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-22-current.tar.gz"
SRC_DIR="/usr/local/src"

echo "=== Downloading Asterisk 22 LTS ==="

cd /tmp
if [ -f asterisk-22-current.tar.gz ]; then
  echo "Tarball already downloaded, skipping download"
else
  wget -q --show-progress "$ASTERISK_URL"
fi

echo "Extracting to $SRC_DIR/..."
sudo -n tar xzf asterisk-22-current.tar.gz -C "$SRC_DIR"

# Find the extracted directory
ASTERISK_DIR=$(ls -d "$SRC_DIR"/asterisk-22.* 2>/dev/null | head -1)

# Fix ownership so build runs as normal user
sudo -n chown -R "$(id -un):$(id -gn)" "$ASTERISK_DIR"
if [ -z "$ASTERISK_DIR" ]; then
  echo "ERROR: Could not find extracted Asterisk directory"
  exit 1
fi

echo "Asterisk source extracted to: $ASTERISK_DIR"
echo "=== Download complete ==="
