# MX Linux Fresh Setup Guide

Steps to reproduce the initial setup on a fresh MX Linux (RAM-only) session.

## 1. Install Claude Code

_(Assuming Node.js/npm is available)_

```bash
npm install -g @anthropic-ai/claude-code
```

## 2. Set Norwegian Keyboard Layout

```bash
setxkbmap no
echo "demo" | sudo -S bash -c 'cat > /etc/X11/xorg.conf.d/00-keyboard.conf << EOF
Section "InputClass"
    Identifier "system-keyboard"
    MatchIsKeyboard "on"
    Option "XkbLayout" "no"
    Option "XkbModel" "pc105"
EndSection
EOF'
```

> `setxkbmap no` applies it immediately. The xorg config makes it persist for the session.

## 3. Install Git

```bash
echo "demo" | sudo -S apt-get install -y git
```

> **Note:** Default password on MX Linux live session is `demo`.

## 4. Initialize the Project Repository

```bash
mkdir -p ~/phone-home
cd ~/phone-home
git init
git branch -m main
```

## 5. Configure Git Identity

```bash
git config user.name "Roy Kollen Svendsen"
git config user.email "roykollensvendsen@gmail.com"
```

## 6. Generate SSH Key for GitHub

```bash
ssh-keygen -t ed25519 -C "roykollensvendsen@gmail.com" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the public key to GitHub: **github.com → Settings → SSH and GPG keys → New SSH key**

> **Note:** Since this is a RAM-only session, the key must be regenerated and added to GitHub each reboot.

## 7. Connect to GitHub Remote

```bash
git remote add origin git@github.com:roykollensvendsen/pbx.git
git branch -M main
git push -u origin main
```

## 8. Create Initial Commit

```bash
touch .gitkeep
git add .gitkeep
git commit -m "chore: initial commit"
```

## 9. Install Commitlint

```bash
npm init -y
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

Create `commitlint.config.js`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

## 10. Set Up Commit-msg Git Hook

```bash
cat > .git/hooks/commit-msg << 'HOOK'
#!/bin/bash

npx --no -- commitlint --edit "$1"
HOOK
chmod +x .git/hooks/commit-msg
```

## 11. Install Network Tools

```bash
echo "demo" | sudo -S apt-get install -y nmap arp-scan
```

> Required for scanning the local network for Grandstream HT801 devices (`scripts/scan-devices.sh`).

## 12. Launch Claude Code

```bash
cd ~/phone-home
claude
```

> Claude Code will automatically read `CLAUDE.md` for project conventions.

## 13. Asterisk PBX with Bluetooth Mobile Bridging

This sets up Asterisk with chan_mobile to bridge cellular calls from an Android phone
(via Bluetooth) to the 3 HT801 SIP phones.

### 13a. Run the master setup script

```bash
bash scripts/asterisk-setup.sh
```

This runs 8 steps automatically:
1. Disables PipeWire Bluetooth (prevents HFP/HSP conflict with chan_mobile)
2. Installs `bluez-firmware` package
3. Downloads Broadcom BCM20702A1 dongle firmware (not in bluez-firmware) and reloads btusb
4. Enables BlueZ SDP server (`--compat` mode in `/etc/init.d/bluetooth`)
5. Installs Asterisk build dependencies
6. Downloads and builds Asterisk 22 LTS from source with `chan_mobile` (applies patches from `patches/`)
7. Opens UFW firewall ports (SIP 5060, RTP 10000-20000)
8. Deploys Asterisk configs and starts Asterisk

> **Note:** The script will detect the adapter name (may be `hci1` after btusb reload)
> and tell you to update `chan_mobile.conf` accordingly.

### 13b. Update chan_mobile.conf with adapter name

After the setup script, check which `hciX` adapter is active:

```bash
hciconfig
```

Edit `configs/asterisk/chan_mobile.conf`:
- Set `id = hciX` in the `[adapter]` section
- Set `adapter = hciX` in the `[android]` section (must match the `id` value, NOT the section name)

### 13c. Pair Android phone via Bluetooth

**CRITICAL: Pairing must be initiated FROM the Android phone, not from the PBX.**
Pairing from the PBX side fails to store link keys (bonding doesn't complete).

```bash
# Make PBX discoverable
bluetoothctl discoverable on
bluetoothctl pairable on
```

On the Android phone:
1. Go to **Settings > Connected devices > Pair new device**
2. Find and tap the PBX device (appears as "mx1" or similar)
3. Accept the pairing prompt on both devices
4. On Android, ensure **"Phone calls"** is enabled for the device

Then back on the PBX:
```bash
bluetoothctl trust <ANDROID_BD_ADDRESS>
```

### 13d. Find RFCOMM channel and update chan_mobile.conf

```bash
echo "demo" | sudo -S asterisk -rx "mobile search"
```

Edit `configs/asterisk/chan_mobile.conf`:
- Set `address = <ANDROID_BD_ADDRESS>` in the `[android]` section
- Set `port = <RFCOMM_PORT>` from the search results

### 13e. Redeploy configs and load chan_mobile

```bash
bash scripts/asterisk-deploy-configs.sh
echo "demo" | sudo -S asterisk -rx "module unload chan_mobile.so"
echo "demo" | sudo -S asterisk -rx "module load chan_mobile.so"
```

> **Note:** chan_mobile does not support `core reload` — you must unload/load the module.

### 13f. Provision HT801 phones

```bash
bash scripts/ht801-provision.sh 192.168.10.138 101 pbxpass2024
bash scripts/ht801-provision.sh 192.168.10.194 102 pbxpass2024
bash scripts/ht801-provision.sh 192.168.10.100 103 pbxpass2024
```

> **Note:** The HT801 v2 API silently ignores writes to P34 (SIP auth password).
> The pjsip.conf uses no auth since the phones are on a trusted LAN.

### 13g. Verify

```bash
echo "demo" | sudo -S asterisk -rx "pjsip show contacts"    # All 3 extensions registered
echo "demo" | sudo -S asterisk -rx "mobile show devices"     # Android: Connected=Yes, State=Free
```

Test calls:
- **Echo test:** Dial `*43` from any phone — hear your voice echoed back
- **Internal:** Dial ext 101 → 102
- **Incoming cellular:** Call the Android phone number → all 3 phones ring 15s, then AI agent answers
- **Outgoing cellular:** Pick up any phone, dial a number → goes through Android

### Available extensions

| Extension | Purpose |
|-----------|---------|
| 101 | Phone 1 (192.168.10.138) |
| 102 | Phone 2 (192.168.10.194) |
| 103 | Phone 3 (192.168.10.100) |
| *43 | Echo test (note: star codes unreliable from HT801 keypads) |

> **Important:** HT801 v2 phones only reliably send extensions in the `10x` range (100–109).
> Star codes and other numbers are silently dropped. See Known Gotchas.

## 14. AI Phone Agent (Claude-powered)

An AI receptionist answers incoming cellular calls when nobody picks up the phone.
Uses Deepgram (STT) → Claude (brain) → ElevenLabs (TTS) pipeline via Asterisk AudioSocket.

### 14a. Configure API keys

```bash
cp agent/.env.example agent/.env
```

Edit `agent/.env` and fill in:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `DEEPGRAM_API_KEY` — from console.deepgram.com
- `ELEVENLABS_API_KEY` — from elevenlabs.io
- `ELEVENLABS_VOICE_ID` — voice ID from ElevenLabs voice library

### 14b. chan_mobile watchdog

The watchdog monitors the Bluetooth device connection and automatically reloads
`chan_mobile.so` when the device disconnects or enters a broken state (e.g. after
SCO audio error 104). It starts automatically with `agent-start.sh`, but can also
be run standalone:

```bash
bash scripts/chan-mobile-watchdog.sh
```

The watchdog checks every 15 seconds:
- Whether the `android` device shows `Connected=Yes` in `mobile show devices`
- Whether recent `read error` entries exist in the Asterisk log (broken state detection)

### 14c. Install dependencies

```bash
npm install
```

### 14d. Start the agent

```bash
npm run agent
```

Or for echo test (no API keys needed):
```bash
npm run agent:echo
```

### 14e. Test

- **Echo test:** Start with `npm run agent:echo`, dial `104` from any phone — hear yourself echoed back
- **AI test:** Start with `npm run agent`, dial `104` from any phone — speak Norwegian, hear AI response
- **Incoming call test:** Call the Android phone from outside — phones ring 15s, then AI answers

### Available extensions (updated)

| Extension | Purpose |
|-----------|---------|
| 101 | Phone 1 (192.168.10.138) |
| 102 | Phone 2 (192.168.10.194) |
| 103 | Phone 3 (192.168.10.100) |
| 104 | AI agent (Claude-powered receptionist) |
| *43 | Echo test (note: star codes unreliable from HT801 keypads) |

## Known Gotchas

- **`sudo` in scripts:** Always use `echo "demo" | sudo -S` instead of bare `sudo`. Non-interactive shells (e.g. Claude Code's Bash tool) have no TTY, so `sudo` without `-S` fails with "a terminal is required to read the password".
- **Asterisk source ownership:** `sudo tar xzf` extracts files owned by root. You must `chown -R demo:demo` the source directory before running `./configure`, otherwise it fails writing to `config.log`.
- **Asterisk not in Debian Trixie repos:** Must build from source. The `asterisk-setup.sh` script handles this end-to-end.
- **PipeWire steals Bluetooth audio:** PipeWire's WirePlumber claims HFP/HSP profiles on the BT adapter, preventing Asterisk's `chan_mobile` from getting SCO audio. The WirePlumber override in `configs/wireplumber/90-disable-bluetooth.conf` disables this. Must be applied before starting Asterisk.
- **Asterisk must run as root:** Required for Bluetooth SCO socket access. Configured in `configs/asterisk/asterisk.conf` (`runuser = root`).
- **Broadcom dongle firmware:** The Belkin Broadcom 4.0 USB dongle (050d:065a) needs `BCM20702A1-050d-065a.hcd` which is NOT in the `bluez-firmware` package. Must be downloaded from [winterheart/broadcom-bt-firmware](https://github.com/winterheart/broadcom-bt-firmware) to `/lib/firmware/brcm/`. After placing the firmware, reload btusb (`sudo rmmod btusb && sudo modprobe btusb`) to apply it. This may change the adapter from `hci0` to `hci1`.
- **BlueZ SDP server:** chan_mobile requires the SDP server which BlueZ 5 disables by default. Must add `--compat` flag to bluetoothd. On MX Linux (sysvinit), edit `/etc/init.d/bluetooth` and restart.
- **chan_mobile adapter reference:** The `adapter` field in the phone section must match the adapter's `id` value (e.g., `hci1`), NOT the config section name. The source code at `chan_mobile.c:4499` compares `adapter->id` (the `id` field) with the phone's `adapter` setting.
- **Bluetooth pairing direction:** Pairing MUST be initiated from the Android phone, not from the PBX. When initiated from the PBX via `bluetoothctl pair`, the link keys are not stored (bonding fails silently). Make the PBX discoverable with `bluetoothctl discoverable on` and pair from Android Settings.
- **HT801 v2 SIP password (P34):** The Grandstream HT801 v2 config API silently ignores writes to P34 (auth password). The API returns success but the value is not persisted. Workaround: use no SIP auth in pjsip.conf (acceptable on trusted LAN).
- **chan_mobile reload:** `core reload` does NOT reload chan_mobile. You must `module unload chan_mobile.so` then `module load chan_mobile.so`.
- **HT801 v2 dial plan limitations:** The HT801 v2 only reliably sends extensions matching the `10x` pattern (100–109). Star codes (`*97`, `*86`) and arbitrary numbers (`123`) are silently dropped by the phone without sending a SIP INVITE. Always use `10x`-range extensions for custom features.
- **HT801 v2 P290 and `+` encoding:** The `+` character in P290 (Dial Plan) values is silently converted to a space because the config API uses `application/x-www-form-urlencoded`. Use `x.` instead of `x+` in dial plan patterns.
- **chan_mobile CIEV race on back-to-back calls:** When a new incoming call arrives immediately after a previous call ends, the Android phone sends `callsetup=incoming` (new call) followed by a lagging `call=0` (old call done). chan_mobile interprets `call=0` as the *new* call being disconnected, causing the caller to go straight to the Android handset. Fixed by `patches/chan_mobile-ciev-call-race.patch`, which ignores `call=0` during incoming call setup (before the channel is created). The patch is applied automatically during `asterisk-build.sh`.

## Notes

- MX Linux live session runs entirely in RAM — nothing persists across reboots.
- The default user is `demo` with password `demo`.
- Git is not installed by default and must be installed each session.
- Asterisk must be rebuilt from source each session (not in Debian Trixie repos).
- Bluetooth pairing must be redone each session.
