#!/bin/bash

# Uninstall AgentX
# Removes the app and all associated files

echo "🗑️  AgentX Uninstaller"
echo "======================"
echo ""

read -p "⚠️  This will remove AgentX and all its data. Continue? (y/n): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Uninstall cancelled."
    exit 0
fi

echo ""
echo "Stopping AgentX..."
pkill -f "AgentX" 2>/dev/null || true
sleep 2

echo "Removing application..."
rm -rf "/Applications/AgentX.app"

echo "Removing LaunchAgent..."
launchctl unload "$HOME/Library/LaunchAgents/ai.agentx.app.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/ai.agentx.app.plist"

read -p "🗑️  Remove all AgentX data (database, logs, configs)? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing data..."
    rm -rf "/Users/bud/BUD BOT/projects/AgentX/database"
    rm -rf "$HOME/Library/Logs/AgentX"
    echo "✅ Data removed."
fi

echo ""
echo "✅ AgentX has been uninstalled."
echo ""
echo "To reinstall, run: ./macOS/install.sh"
