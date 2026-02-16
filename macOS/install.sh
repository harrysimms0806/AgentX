#!/bin/bash

# AgentX macOS Installer
# Installs AgentX.app to /Applications and sets up auto-start

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_APP="$SCRIPT_DIR/AgentX.app"
TARGET_APP="/Applications/AgentX.app"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "🚀 AgentX macOS Installer"
echo "========================="
echo ""

# Check if source exists
if [ ! -d "$SOURCE_APP" ]; then
    echo "❌ Error: AgentX.app not found in: $SCRIPT_DIR"
    exit 1
fi

# Check if already installed
if [ -d "$TARGET_APP" ]; then
    echo "⚠️  AgentX is already installed."
    read -p "   Replace existing installation? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Installation cancelled."
        exit 0
    fi
    
    # Stop running instance
    if pgrep -f "AgentX" > /dev/null; then
        echo "🛑 Stopping running AgentX..."
        pkill -f "AgentX" || true
        sleep 2
    fi
    
    # Remove old version
    echo "🗑️  Removing old version..."
    rm -rf "$TARGET_APP"
fi

# Copy app to Applications
echo "📦 Installing AgentX..."
cp -R "$SOURCE_APP" "$TARGET_APP"

# Set permissions
chmod +x "$TARGET_APP/Contents/MacOS/AgentX"

# Create LaunchAgent for auto-start (optional)
read -p "🔄 Start AgentX automatically at login? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    PLIST_FILE="$LAUNCH_AGENTS_DIR/ai.agentx.app.plist"
    
    mkdir -p "$LAUNCH_AGENTS_DIR"
    
    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.agentx.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>$TARGET_APP/Contents/MacOS/AgentX</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/AgentX/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/AgentX/launchd.error.log</string>
</dict>
</plist>
EOF

    launchctl load "$PLIST_FILE" 2>/dev/null || true
    
    echo "✅ Auto-start enabled"
fi

echo ""
echo "✨ Installation complete!"
echo ""
echo "📍 Location: $TARGET_APP"
echo "🎮 Launch: Double-click AgentX in Applications"
echo "🌐 Dashboard: http://localhost:5173"
echo ""
echo "To uninstall:"
echo "   rm -rf '$TARGET_APP'"
if [ -f "$PLIST_FILE" ]; then
    echo "   rm '$PLIST_FILE'"
fi

# Ask to launch now
read -p "🚀 Launch AgentX now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "$TARGET_APP"
    echo "🌟 AgentX is starting..."
    echo "   The dashboard will open in your browser shortly."
fi

echo ""
echo "Enjoy using AgentX! 🤖"
