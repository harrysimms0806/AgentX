#!/bin/bash
# Update AgentX Source Code

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_PROJECT="/Users/bud/BUD BOT/projects/AgentX"

echo "🔄 Updating AgentX from source..."

# Stop running instance
if [ -f "/tmp/agentx-electron.pid" ]; then
    echo "🛑 Stopping AgentX..."
    pkill -f "AgentX"
    sleep 2
fi

# Copy updated source
echo "📋 Copying updated files..."
rsync -av "$SOURCE_PROJECT/frontend/" "$APP_DIR/frontend/" --exclude node_modules --exclude dist
rsync -av "$SOURCE_PROJECT/backend/" "$APP_DIR/backend/" --exclude node_modules
rsync -av "$SOURCE_PROJECT/shared/" "$APP_DIR/shared/"
rsync -av "$SOURCE_PROJECT/config/" "$APP_DIR/config/"
cp "$SOURCE_PROJECT/package.json" "$APP_DIR/"
cp "$SOURCE_PROJECT/electron-main.cjs" "$APP_DIR/"
cp "$SOURCE_PROJECT/electron-preload.cjs" "$APP_DIR/"

# Rebuild frontend
echo "🏗️ Rebuilding frontend..."
cd "$APP_DIR/frontend"
export PATH="$APP_DIR/node/bin:$PATH"
"$APP_DIR/node/bin/npm" run build

echo "✅ Update complete!"
echo "🚀 Restart AgentX to see changes."
