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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Building Asterisk from $ASTERISK_DIR ==="
cd "$ASTERISK_DIR"

# Apply patches
if [ -d "$PROJECT_DIR/patches" ]; then
  for patch in "$PROJECT_DIR/patches"/*.patch; do
    [ -f "$patch" ] || continue
    if patch -p1 --forward --dry-run < "$patch" >/dev/null 2>&1; then
      echo "Applying patch: $(basename "$patch")"
      patch -p1 --forward < "$patch"
    else
      echo "Patch already applied or N/A: $(basename "$patch")"
    fi
  done
fi

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
sudo -n make install
sudo -n make samples

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
