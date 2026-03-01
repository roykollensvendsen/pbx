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

## 11. Launch Claude Code

```bash
cd ~/phone-home
claude
```

> Claude Code will automatically read `CLAUDE.md` for project conventions.

## Notes

- MX Linux live session runs entirely in RAM — nothing persists across reboots.
- The default user is `demo` with password `demo`.
- Git is not installed by default and must be installed each session.
