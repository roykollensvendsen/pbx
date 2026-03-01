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

This runs steps 1-6 automatically:
1. Disables PipeWire Bluetooth (prevents HFP/HSP conflict with chan_mobile)
2. Installs Bluetooth firmware (`bluez-firmware`)
3. Installs Asterisk build dependencies
4. Downloads and builds Asterisk 22 LTS from source with `chan_mobile`
5. Opens UFW firewall ports (SIP 5060, RTP 10000-20000)
6. Deploys Asterisk configs and starts Asterisk

### 13b. Pair Android phone via Bluetooth

```bash
bash scripts/bluetooth-pair.sh
```

Follow the interactive prompts to scan, pair, and trust the Android phone.

### 13c. Find RFCOMM channel and update chan_mobile.conf

```bash
sudo asterisk -rx "mobile search"
```

Edit `configs/asterisk/chan_mobile.conf`:
- Set the Android phone's BD address
- Set the RFCOMM port from the search results

### 13d. Redeploy configs

```bash
bash scripts/asterisk-deploy-configs.sh
```

### 13e. Provision HT801 phones with SIP password

```bash
bash scripts/ht801-provision.sh 192.168.10.138 101 pbxpass2024
bash scripts/ht801-provision.sh 192.168.10.194 102 pbxpass2024
bash scripts/ht801-provision.sh 192.168.10.100 103 pbxpass2024
```

### 13f. Verify

```bash
sudo asterisk -rx "pjsip show contacts"    # All 3 extensions registered
sudo asterisk -rx "mobile show devices"     # Android phone connected
```

Test calls:
- **Internal:** Dial ext 101 → 102
- **Incoming cellular:** Call the Android phone number → all 3 phones ring
- **Outgoing cellular:** Pick up any phone, dial a number → goes through Android

## Known Gotchas

- **`sudo` in scripts:** Always use `echo "demo" | sudo -S` instead of bare `sudo`. Non-interactive shells (e.g. Claude Code's Bash tool) have no TTY, so `sudo` without `-S` fails with "a terminal is required to read the password".
- **Asterisk source ownership:** `sudo tar xzf` extracts files owned by root. You must `chown -R demo:demo` the source directory before running `./configure`, otherwise it fails writing to `config.log`.
- **Asterisk not in Debian Trixie repos:** Must build from source. The `asterisk-setup.sh` script handles this end-to-end.
- **PipeWire steals Bluetooth audio:** PipeWire's WirePlumber claims HFP/HSP profiles on the BT adapter, preventing Asterisk's `chan_mobile` from getting SCO audio. The WirePlumber override in `configs/wireplumber/90-disable-bluetooth.conf` disables this. Must be applied before starting Asterisk.
- **Asterisk must run as root:** Required for Bluetooth SCO socket access. Configured in `configs/asterisk/asterisk.conf` (`runuser = root`).

## Notes

- MX Linux live session runs entirely in RAM — nothing persists across reboots.
- The default user is `demo` with password `demo`.
- Git is not installed by default and must be installed each session.
- Asterisk must be rebuilt from source each session (not in Debian Trixie repos).
- Bluetooth pairing must be redone each session.
