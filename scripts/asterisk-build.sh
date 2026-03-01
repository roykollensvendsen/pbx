#!/usr/bin/env bash
# Build and install Asterisk from source with chan_mobile (Bluetooth) support.
# Expects source already extracted in /usr/local/src/asterisk-22.*.
set -euo pipefail

ASTERISK_DIR=$(ls -d /usr/local/src/asterisk-22.* 2>/dev/null | head -1)
if [ -z "$ASTERISK_DIR" ]; then
  echo "ERROR: Asterisk source not found in /usr/local/src/"
  echo "Run asterisk-download.sh first"
  exit 1
fi

echo "=== Building Asterisk from $ASTERISK_DIR ==="
cd "$ASTERISK_DIR"

# Configure with Bluetooth support
echo "Running ./configure --with-bluetooth..."
./configure --with-bluetooth

# Enable chan_mobile in menuselect (it's in addons, disabled by default)
echo "Configuring menuselect..."
make menuselect.makeopts

# Enable chan_mobile addon
menuselect/menuselect --enable chan_mobile menuselect.makeopts

# Disable BUILD_NATIVE for portability
menuselect/menuselect --disable BUILD_NATIVE menuselect.makeopts

# Build
echo "Building with $(nproc) cores..."
make -j"$(nproc)"

# Install
echo "Installing..."
echo "demo" | sudo -S make install
echo "demo" | sudo -S make samples

echo "Verifying installation..."
asterisk -V

# Check chan_mobile.so exists
if [ -f /usr/lib/asterisk/modules/chan_mobile.so ]; then
  echo "chan_mobile.so: OK"
else
  echo "WARNING: chan_mobile.so not found in /usr/lib/asterisk/modules/"
  echo "Checking alternative path..."
  find /usr -name "chan_mobile.so" 2>/dev/null || echo "chan_mobile.so NOT FOUND"
fi

echo "=== Asterisk build complete ==="
