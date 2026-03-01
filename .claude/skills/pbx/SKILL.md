---
name: pbx
description: Manage Grandstream HT801 v2 ATA devices and PBX infrastructure
user-invocable: true
---

# PBX Management Skill

Manage Grandstream HT801 v2 ATA devices and Asterisk PBX with Bluetooth mobile bridging.

## Environment

- **Machine IP:** 192.168.10.107
- **Network:** 192.168.10.0/24
- **Device admin password:** Garasje123
- **Extensions:** 101, 102, 103
- **Helper scripts:** `scripts/` directory in project root

## Sub-commands

Parse the user's arguments to determine which sub-command to run:

### `/pbx scan`

Scan the local network for Grandstream HT801 devices.

```bash
bash scripts/scan-devices.sh
```

If no devices found on default interface, try other interfaces (check with `ip link show`).

### `/pbx status`

Check Asterisk SIP endpoint registration status.

```bash
echo "demo" | sudo -S asterisk -rx "pjsip show endpoints"
```

If Asterisk is not installed yet, report that and suggest running the Asterisk setup.

### `/pbx provision <ip> <extension> <password>`

Provision a Grandstream HT801 v2 with SIP credentials.

```bash
bash scripts/ht801-provision.sh <ip> <extension> <password> 192.168.10.107
```

Confirm with the user before provisioning. After provisioning, the device reboots and should register to the Asterisk server.

### `/pbx config read <ip> [P-codes...]`

Read configuration values from a device.

```bash
SESSION=$(bash scripts/ht801-login.sh <ip>)
bash scripts/ht801-get-config.sh <ip> "$SESSION" [P-codes...]
```

If no P-codes given, reads default SIP config values (P271, P47, P35, P36, P34, P3, P31, P130).

### `/pbx config write <ip> <P=value pairs...>`

Write configuration values to a device.

```bash
SESSION=$(bash scripts/ht801-login.sh <ip>)
bash scripts/ht801-set-config.sh <ip> "$SESSION" <P=value pairs...>
```

After writing, ask the user if they want to reboot the device to apply changes.

### `/pbx mobile search`

Search for Bluetooth mobile devices from Asterisk (used after pairing to find RFCOMM port).

```bash
echo "demo" | sudo -S asterisk -rx "mobile search"
```

Report the device name, BD address, and RFCOMM channel. Remind the user to update `configs/asterisk/chan_mobile.conf` with the results.

### `/pbx mobile status`

Show connected Bluetooth mobile devices.

```bash
echo "demo" | sudo -S asterisk -rx "mobile show devices"
```

### `/pbx asterisk reload`

Reload Asterisk configuration after changes.

```bash
echo "demo" | sudo -S asterisk -rx "core reload"
```

## HT801 v2 P-value Reference

| P-code | Description | Common values |
|--------|------------|---------------|
| P271 | Account Active | 1=yes, 0=no |
| P47 | SIP Server | IP address of Asterisk |
| P35 | SIP User ID | Extension number (e.g. 101) |
| P36 | Authenticate ID | Extension number (e.g. 101) |
| P34 | Auth Password | SIP password |
| P3 | Display Name | Friendly name |
| P31 | SIP Registration | 1=yes, 0=no |
| P130 | SIP Transport | 0=UDP, 1=TCP, 2=TLS |
| P48 | Outbound Proxy | IP address |
| P52 | NAT Traversal | 0=no, various modes |
| P2 | Admin Password | Device admin password |
| P64 | Preferred DTMF | 0=InBand, 1=RFC2833, 2=SIP INFO |
| P73 | Preferred Codec 1 | 0=PCMU, 2=G726, 4=G723, 9=G722, 18=G729, 98=OPUS |
| P20000 | Firmware Version | Read-only |
| P30 | SIP Registrar Port | Default 5060 |

## HT801 v2 Web Interface Endpoints

- **Login:** `POST http://<IP>/cgi-bin/dologin` with body `username=admin&P2=<base64_password>`
  - Returns `Set-Cookie: session_id=...` header AND `session_token` in JSON body
  - Both are needed: cookie for auth, token in POST body for CSRF protection
- **Get config:** `POST http://<IP>/cgi-bin/api.values.get` with body `request=P271:P47:P35&session_token=<token>` (colon-separated P-codes)
- **Set config:** `POST http://<IP>/cgi-bin/api.values.post` with body `P47=value&update=1&session_token=<token>`
  - **Important:** Write returns a new `token` in the response — subsequent requests must use the new token
- **Reboot:** `POST http://<IP>/cgi-bin/api-sys_operation` with body `request=REBOOT&session_token=<token>`
- **System info:** `POST http://<IP>/cgi-bin/api-get_system_base_info` (returns product model, vendor)

### Session handling

Scripts output `session_id:session_token` format. The token rotates after each write operation — `ht801-set-config.sh` outputs the updated session credentials.

## Grandstream MAC OUI Prefixes

- `00:0B:82`
- `C0:74:AD`
- `EC:74:D7`
- `14:4C:FF`

## Asterisk + Bluetooth Architecture

```
Cellular → Android Phone → [Bluetooth HFP] → Belkin BT Dongle → Asterisk (chan_mobile + res_pjsip) → HT801 phones
```

- **Bluetooth adapter:** Belkin Broadcom 4.0 (050d:065a, BD 5C:F3:70:85:9C:08)
- **SIP password:** pbxpass2024 (shared across all 3 endpoints)
- **Incoming cellular:** rings all 3 phones via `[incoming-mobile]` context
- **Outgoing cellular:** any phone dials through Android via `Mobile/android/${EXTEN}`
- **Config files:** `configs/asterisk/` → deployed to `/etc/asterisk/`
- **Build scripts:** `scripts/asterisk-*.sh` for install/build/deploy
- **Master setup:** `scripts/asterisk-setup.sh` runs everything in order

## Troubleshooting

- **Login fails:** Verify device is reachable (`ping <IP>`), check password, try from browser first
- **Config read returns empty:** Session may have expired, re-login and retry
- **Device not found in scan:** Try different network interface, check cable/switch, verify device is powered on
- **SIP registration fails after provisioning:** Check Asterisk is running, verify credentials match pjsip.conf, check firewall rules
- **chan_mobile not loaded:** Check `asterisk -rx "module show like chan_mobile"`, verify built with `--with-bluetooth`
- **Bluetooth audio issues:** Ensure PipeWire BT is disabled (`scripts/disable-pipewire-bluetooth.sh`), check `bluez-firmware` installed
- **Mobile search finds nothing:** Ensure Android is paired and trusted in `bluetoothctl`, adapter is up (`hciconfig hci0 up`)
