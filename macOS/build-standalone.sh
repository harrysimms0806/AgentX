#!/bin/bash

# Build Standalone AgentX for macOS
# Embeds Node.js binary so no installation is required
# Source code remains editable for updates

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="/Users/bud/BUD BOT/projects/AgentX"
BUILD_DIR="$PROJECT_DIR/build"
APP_NAME="AgentX"
APP_BUNDLE="$BUILD_DIR/${APP_NAME}.app"
NODE_VERSION="20.11.0"
ARCH="arm64"  # Change to "x64" for Intel Macs

echo "🔨 Building Standalone AgentX..."
echo "================================"
echo ""

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Download Node.js binary if not present
NODE_DIR="$BUILD_DIR/node-v${NODE_VERSION}-darwin-${ARCH}"
NODE_TARBALL="node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz"

if [ ! -d "$NODE_DIR" ]; then
    echo "📥 Downloading Node.js ${NODE_VERSION}..."
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
    echo "   URL: $NODE_URL"
    curl -fsSL -o "$NODE_TARBALL" "$NODE_URL" || {
        echo "❌ Download failed, trying x64..."
        # Try x64 as fallback
        ALT_ARCH="x64"
        ALT_TARBALL="node-v${NODE_VERSION}-darwin-${ALT_ARCH}.tar.gz"
        ALT_URL="https://nodejs.org/dist/v${NODE_VERSION}/${ALT_TARBALL}"
        curl -fsSL -o "$NODE_TARBALL" "$ALT_URL"
    }
    
    if [ -f "$NODE_TARBALL" ] && [ -s "$NODE_TARBALL" ]; then
        echo "✅ Download complete, extracting..."
        tar -xzf "$NODE_TARBALL"
        rm "$NODE_TARBALL"
    else
        echo "❌ Failed to download Node.js"
        exit 1
    fi
fi

# Create app bundle structure
echo "📦 Creating app bundle..."
mkdir -p "$APP_BUNDLE/Contents/"{MacOS,Resources}

# Copy source code (editable!)
echo "📋 Copying source code..."
cp -R "$PROJECT_DIR/frontend" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy frontend"; exit 1; }
cp -R "$PROJECT_DIR/backend" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy backend"; exit 1; }
cp -R "$PROJECT_DIR/shared" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy shared"; exit 1; }
cp -R "$PROJECT_DIR/config" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy config"; exit 1; }
mkdir -p "$APP_BUNDLE/Contents/Resources/database"
cp "$PROJECT_DIR/package.json" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy package.json"; exit 1; }
cp "$PROJECT_DIR/README.md" "$APP_BUNDLE/Contents/Resources/" 2>/dev/null || true

# Copy Node.js binary
echo "🔧 Embedding Node.js binary..."
mkdir -p "$APP_BUNDLE/Contents/Resources/node"
cp -R "$NODE_DIR/bin" "$APP_BUNDLE/Contents/Resources/node/"
cp -R "$NODE_DIR/lib" "$APP_BUNDLE/Contents/Resources/node/"
cp -R "$NODE_DIR/include" "$APP_BUNDLE/Contents/Resources/node/" 2>/dev/null || true

# Create launcher script
echo "⚙️  Creating launcher..."
cat > "$APP_BUNDLE/Contents/MacOS/AgentX" << 'LAUNCHER_EOF'
#!/bin/bash

# AgentX Standalone Launcher
# Uses embedded Node.js, no system installation required

APP_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
NODE_BIN="$APP_DIR/node/bin/node"
NPM_BIN="$APP_DIR/node/bin/npm"
PID_FILE="/tmp/agentx-standalone.pid"
LOG_DIR="$HOME/Library/Logs/AgentX"
LOG_FILE="$LOG_DIR/standalone.log"

# Create log directory
mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🚀 AgentX Standalone Starting..."
log "📁 App Directory: $APP_DIR"
log "🔧 Node Binary: $NODE_BIN"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        log "⚠️ AgentX already running (PID: $OLD_PID)"
        open "http://localhost:5173"
        exit 0
    else
        rm "$PID_FILE"
    fi
fi

# Verify Node.js works
if [ ! -f "$NODE_BIN" ]; then
    log "❌ Node binary not found at: $NODE_BIN"
    osascript -e 'display alert "AgentX Error" message "Node.js binary missing. Please reinstall AgentX."'
    exit 1
fi

# Check Node version
NODE_VERSION=$($NODE_BIN --version 2>&1)
log "✅ Node.js version: $NODE_VERSION"

# Change to app directory
cd "$APP_DIR" || exit 1

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log "📦 Installing dependencies..."
    osascript -e 'display notification "Installing dependencies (first launch)..." with title "AgentX"'
    
    # Use embedded npm
    export PATH="$APP_DIR/node/bin:$PATH"
    "$NPM_BIN" install >> "$LOG_FILE" 2>&1
fi

# Initialize database if needed
if [ ! -f "database/agentx.db" ]; then
    log "🗄️ Initializing database..."
    export PATH="$APP_DIR/node/bin:$PATH"
    "$NODE_BIN" backend/scripts/init-db.js >> "$LOG_FILE" 2>&1 || true
fi

# Start the server
log "🔧 Starting AgentX Server..."
export PATH="$APP_DIR/node/bin:$PATH"
export AGENTX_STANDALONE="1"

# Start both frontend and backend
"$NODE_BIN" --max-old-space-size=1024 backend/server.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
SERVER_PID=$!

log "   Server PID: $SERVER_PID"

# Also start frontend dev server in background
sleep 2
cd frontend
"$NPM_BIN" run dev >> "$LOG_FILE" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID >> "$PID_FILE"

log "   Frontend PID: $FRONTEND_PID"

# Wait for server
log "⏳ Waiting for server to start..."
for i in {1..45}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        log "✅ Server is ready!"
        break
    fi
    sleep 1
done

# Open dashboard
log "🌐 Opening dashboard..."
sleep 2
open "http://localhost:5173"

# Show notification
osascript -e 'display notification "AgentX is running" with title "AgentX Started"'

log "✨ AgentX is now running!"
log "   Dashboard: http://localhost:5173"
log "   Logs: $LOG_FILE"

# Keep script running to maintain Dock icon
wait $SERVER_PID
LAUNCHER_EOF

chmod +x "$APP_BUNDLE/Contents/MacOS/AgentX"

# Copy Info.plist
cp "$PROJECT_DIR/macOS/AgentX.app/Contents/Info.plist" "$APP_BUNDLE/Contents/"

# Copy icon
cp "$PROJECT_DIR/macOS/AgentX.app/Contents/Resources/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/" 2>/dev/null || echo "⚠️ No icon found, using generic"

# Create update script (for developers)
cat > "$APP_BUNDLE/Contents/Resources/UPDATE.sh" << 'UPDATE_EOF'
#!/bin/bash
# Update AgentX Source Code
# Run this after making changes to apply them

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_PROJECT="/Users/bud/BUD BOT/projects/AgentX"

echo "🔄 Updating AgentX from source..."

# Stop running instance
if [ -f "/tmp/agentx-standalone.pid" ]; then
    echo "🛑 Stopping AgentX..."
    pkill -f "AgentX" || true
    sleep 2
fi

# Copy updated source
echo "📋 Copying updated files..."
rsync -av "$SOURCE_PROJECT/frontend/" "$APP_DIR/frontend/" --exclude node_modules --exclude dist
rsync -av "$SOURCE_PROJECT/backend/" "$APP_DIR/backend/" --exclude node_modules
rsync -av "$SOURCE_PROJECT/shared/" "$APP_DIR/shared/"
rsync -av "$SOURCE_PROJECT/config/" "$APP_DIR/config/"
cp "$SOURCE_PROJECT/package.json" "$APP_DIR/"

echo "✅ Update complete!"
echo "🚀 Restart AgentX to see changes."
UPDATE_EOF

chmod +x "$APP_BUNDLE/Contents/Resources/UPDATE.sh"

# Create README for standalone
cat > "$APP_BUNDLE/Contents/Resources/STANDALONE_README.txt" << 'EOF'
AgentX Standalone Version
==========================

This is a self-contained version of AgentX with Node.js embedded.
No Node.js installation required!

HOW TO USE:
1. Copy AgentX.app to /Applications
2. Double-click to launch
3. Dashboard opens automatically in browser

FOR DEVELOPERS (Bud):
To update the app after making code changes:
1. Edit files in /Users/bud/BUD BOT/projects/AgentX/
2. Run: /Applications/AgentX.app/Contents/Resources/UPDATE.sh
3. Restart AgentX

Or manually copy files:
- Source is in: AgentX.app/Contents/Resources/
- Edit frontend/, backend/, shared/ directly
- Changes apply on restart

WHAT'S INCLUDED:
- Node.js binary (embedded)
- Frontend source code
- Backend source code  
- Database files
- Configuration files

LOGS:
~/Library/Logs/AgentX/standalone.log

TROUBLESHOOTING:
If app won't start:
1. Check logs in ~/Library/Logs/AgentX/
2. Try deleting node_modules and restarting
3. Delete database/agentx.db to reset

SIZE:
~180MB (includes Node.js binary)
EOF

# Calculate size
echo ""
echo "📊 Build Summary:"
echo "=================="
du -sh "$APP_BUNDLE" | awk '{print "App Size: " $1}'
find "$APP_BUNDLE/Contents/Resources" -name "node_modules" -prune -o -type f -print | wc -l | awk '{print "Source Files: " $1}'
echo ""
echo "✅ Standalone AgentX built successfully!"
echo ""
echo "📍 Location: $APP_BUNDLE"
echo ""
echo "To install:"
echo "   cp -R \"$APP_BUNDLE\" /Applications/"
echo ""
echo "To update source code after changes:"
echo "   /Applications/AgentX.app/Contents/Resources/UPDATE.sh"
echo ""
echo "📋 What's inside:"
echo "   ✅ Embedded Node.js binary (no install needed)"
echo "   ✅ Editable source code for updates"
echo "   ✅ One-click launcher"
echo "   ✅ Auto-start capability"
echo ""
