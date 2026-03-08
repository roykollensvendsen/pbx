#!/usr/bin/env bash
# Install Asterisk build dependencies on Debian/MX Linux.
# Includes libbluetooth-dev for chan_mobile support.
set -euo pipefail

echo "=== Installing Asterisk build dependencies ==="

sudo -n apt-get update

sudo -n apt-get install -y \
  build-essential \
  pkg-config \
  autoconf \
  automake \
  libtool \
  libedit-dev \
  libjansson-dev \
  libsqlite3-dev \
  uuid-dev \
  libxml2-dev \
  libncurses5-dev \
  libssl-dev \
  libsrtp2-dev \
  libbluetooth-dev

echo "=== Dependencies installed ==="
