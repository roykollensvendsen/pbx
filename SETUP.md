# MX Linux Fresh Setup Guide

Steps to reproduce the initial setup on a fresh MX Linux (RAM-only) session.

## 1. Install Claude Code

_(Assuming Node.js/npm is available)_

```bash
npm install -g @anthropic-ai/claude-code
```

## 2. Install Git

```bash
echo "demo" | sudo -S apt-get install -y git
```

> **Note:** Default password on MX Linux live session is `demo`.

## 3. Initialize the Project Repository

```bash
mkdir -p ~/phone-home
cd ~/phone-home
git init
git branch -m main
```

## 4. Configure Git Identity

```bash
git config user.name "Roy Kollen Svendsen"
git config user.email "roykollensvendsen@gmail.com"
```

## 5. Create Initial Commit

```bash
touch .gitkeep
git add .gitkeep
git commit -m "Initial commit"
```

## 6. Launch Claude Code

```bash
cd ~/phone-home
claude
```

## Notes

- MX Linux live session runs entirely in RAM — nothing persists across reboots.
- The default user is `demo` with password `demo`.
- Git is not installed by default and must be installed each session.
