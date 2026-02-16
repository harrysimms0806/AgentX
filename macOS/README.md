# AgentX for macOS

A native macOS app bundle for AgentX — your AI agent management platform.

---

## 🚀 Quick Start

### Option 1: One-Line Install (Recommended)

```bash
cd "/Users/bud/BUD BOT/projects/AgentX"
./macOS/install.sh
```

This will:
- Install AgentX.app to /Applications
- Set up auto-start at login (optional)
- Launch AgentX immediately (optional)

### Option 2: Manual Install

1. Copy `AgentX.app` to `/Applications`
2. Double-click to launch

---

## 📁 What's Included

```
macOS/
├── AgentX.app/                    # The macOS app bundle
│   ├── Contents/
│   │   ├── Info.plist            # App metadata
│   │   ├── MacOS/
│   │   │   └── AgentX            # Launcher script
│   │   └── Resources/
│   │       ├── AppIcon.icns      # App icon
│   │       └── AppIcon.png       # Source icon
│   └── ...
├── install.sh                     # One-line installer
├── uninstall.sh                   # Clean uninstaller
├── create_iconset.sh              # Convert PNG to .icns
├── create_default_icon.sh         # Generate default icon
├── statusbar.sh                   # Status bar helper
└── README.md                      # This file
```

---

## 🎮 Using AgentX

### First Launch

1. **Double-click AgentX** in Applications
2. **Wait 10-15 seconds** for the server to start
3. **Dashboard opens automatically** in your default browser
4. **Look for the icon in your Dock**

### Daily Use

- **Launch**: Click AgentX in Applications or Dock
- **Dashboard**: http://localhost:5173
- **View Logs**: `~/Library/Logs/AgentX/`
- **Stop**: Quit from Dock or Activity Monitor

### Auto-Start at Login

The installer asks if you want AgentX to start automatically. To change this later:

```bash
# Enable auto-start
launchctl load ~/Library/LaunchAgents/ai.agentx.app.plist

# Disable auto-start
launchctl unload ~/Library/LaunchAgents/ai.agentx.app.plist
```

---

## 🎨 Customizing the Icon

### Option 1: Replace PNG (Easy)

1. Find or create a 1024×1024 PNG image
2. Copy it to:
   ```
   /Applications/AgentX.app/Contents/Resources/AppIcon.png
   ```
3. Run:
   ```bash
   cd "/Users/bud/BUD BOT/projects/AgentX/macOS"
   ./create_iconset.sh
   ```

### Option 2: Use macOS Built-In

1. Find an `.icns` file you like
2. Copy it to:
   ```
   /Applications/AgentX.app/Contents/Resources/AppIcon.icns
   ```

### Option 3: Drag & Drop (Easiest)

1. Find an image you like
2. Right-click AgentX.app → Get Info
3. Drag image onto the icon in the Info window

---

## 🔧 Troubleshooting

### "AgentX can't be opened"

**Cause**: macOS Gatekeeper security

**Fix**:
```bash
# Allow the app
xattr -cr /Applications/AgentX.app

# Or go to System Preferences → Security & Privacy → Open Anyway
```

### "Port already in use"

**Cause**: Another instance running

**Fix**:
```bash
# Stop all AgentX processes
pkill -f "AgentX"

# Or use the status helper
./macOS/statusbar.sh
```

### Dashboard doesn't open

**Check if running**:
```bash
curl http://localhost:3001/api/health
```

**View logs**:
```bash
tail -f ~/Library/Logs/AgentX/agentx.log
```

**Manual start**:
```bash
cd "/Users/bud/BUD BOT/projects/AgentX"
npm run dev
```

---

## 🗑️ Uninstall

```bash
cd "/Users/bud/BUD BOT/projects/AgentX"
./macOS/uninstall.sh
```

Or manually:
```bash
# Stop AgentX
pkill -f "AgentX"

# Remove app
rm -rf /Applications/AgentX.app

# Remove auto-start
rm ~/Library/LaunchAgents/ai.agentx.app.plist

# Remove logs (optional)
rm -rf ~/Library/Logs/AgentX
```

---

## 📋 Requirements

- macOS 10.15 (Catalina) or later
- Node.js 18+ (installed automatically if missing)
- ~500MB disk space

---

## 🆘 Getting Help

1. **Check logs**: `~/Library/Logs/AgentX/`
2. **Check health**: http://localhost:3001/api/health
3. **Restart**: Quit and reopen AgentX

---

## 🎉 What's New in v1.1

- ✅ Native macOS app bundle
- ✅ Auto-start at login option
- ✅ Proper Dock icon
- ✅ One-line installer
- ✅ Clean uninstaller
- ✅ Log file organization

---

Built with 🌱 by Bud for Harry's AI workforce.
