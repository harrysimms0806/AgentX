#!/bin/bash

# Build Standalone AgentX for macOS with Electron
# Creates a native desktop app with its own window

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="/Users/bud/BUD BOT/projects/AgentX"
BUILD_DIR="$PROJECT_DIR/build"
APP_NAME="AgentX"
APP_BUNDLE="$BUILD_DIR/${APP_NAME}.app"
NODE_VERSION="20.11.0"
ARCH="arm64"

echo "🔨 Building Standalone AgentX with Electron..."
echo "==============================================="
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

# Copy Electron files
cp "$PROJECT_DIR/electron-main.cjs" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy electron-main"; exit 1; }
cp "$PROJECT_DIR/electron-preload.cjs" "$APP_BUNDLE/Contents/Resources/" || { echo "❌ Failed to copy electron-preload"; exit 1; }

# Copy Node.js binary
echo "🔧 Embedding Node.js binary..."
mkdir -p "$APP_BUNDLE/Contents/Resources/node"
cp -R "$NODE_DIR/bin" "$APP_BUNDLE/Contents/Resources/node/"
cp -R "$NODE_DIR/lib" "$APP_BUNDLE/Contents/Resources/node/"
cp -R "$NODE_DIR/include" "$APP_BUNDLE/Contents/Resources/node/" 2>/dev/null || true

# Install node_modules in the bundle
echo "📦 Installing dependencies in bundle..."
cd "$APP_BUNDLE/Contents/Resources"
export PATH="$APP_BUNDLE/Contents/Resources/node/bin:$PATH"

# Install all dependencies (including devDependencies for build)
"$APP_BUNDLE/Contents/Resources/node/bin/npm" install 2>&1 | tail -5

# Build the frontend
echo "🏗️ Building frontend..."
cd "$APP_BUNDLE/Contents/Resources/frontend"
export PATH="$APP_BUNDLE/Contents/Resources/node/bin:$PATH"

# Install frontend dependencies
"$APP_BUNDLE/Contents/Resources/node/bin/npm" install 2>&1 | tail -5

# Build frontend
"$APP_BUNDLE/Contents/Resources/node/bin/npx" tsc 2>&1 | tail -5
"$APP_BUNDLE/Contents/Resources/node/bin/npx" vite build 2>&1 | tail -10

# Go back to resources
cd "$APP_BUNDLE/Contents/Resources"

# Install Electron
echo "📦 Installing Electron runtime..."
"$APP_BUNDLE/Contents/Resources/node/bin/npm" install electron --save-dev 2>&1 | tail -5

# Create launcher script that starts Electron
echo "⚙️  Creating Electron launcher..."
cat > "$APP_BUNDLE/Contents/MacOS/AgentX" << 'LAUNCHER_EOF'
#!/bin/bash

# AgentX Electron Launcher
# Native desktop app - no browser needed

APP_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
NODE_BIN="$APP_DIR/node/bin/node"
NPM_BIN="$APP_DIR/node/bin/npm"
PID_FILE="/tmp/agentx-electron.pid"
LOG_DIR="$HOME/Library/Logs/AgentX"
LOG_FILE="$LOG_DIR/electron.log"

# Create log directory
mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "🚀 AgentX Electron Starting..."
log "📁 App Directory: $APP_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        log "⚠️ AgentX already running (PID: $OLD_PID)"
        exit 0
    else
        rm "$PID_FILE"
    fi
fi

# Verify Node.js works
if [ ! -f "$NODE_BIN" ]; then
    log "❌ Node binary not found"
    osascript -e 'display alert "AgentX Error" message "Node.js binary missing"'
    exit 1
fi

# Set environment
export PATH="$APP_DIR/node/bin:$PATH"
export AGENTX_STANDALONE="1"
export NODE_ENV="production"

cd "$APP_DIR" || exit 1

# Install electron if not present
if [ ! -d "node_modules/electron" ]; then
    log "📦 Installing Electron..."
    "$NPM_BIN" install electron --save-dev >> "$LOG_FILE" 2>&1
fi

# Start Electron
log "🔧 Starting Electron..."
"$NODE_BIN" node_modules/.bin/electron electron-main.cjs >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

log "✨ AgentX Electron started"
log "   Logs: $LOG_FILE"

# Keep script running
wait
LAUNCHER_EOF

chmod +x "$APP_BUNDLE/Contents/MacOS/AgentX"

# Copy Info.plist
cp "$PROJECT_DIR/macOS/AgentX.app/Contents/Info.plist" "$APP_BUNDLE/Contents/"

# Copy icon
cp "$PROJECT_DIR/macOS/AgentX.app/Contents/Resources/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/" 2>/dev/null || echo "⚠️ No icon found, using generic"

# Create update script
cat > "$APP_BUNDLE/Contents/Resources/UPDATE.sh" << 'UPDATE_EOF'
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
UPDATE_EOF

chmod +x "$APP_BUNDLE/Contents/Resources/UPDATE.sh"

# Create README
cat > "$APP_BUNDLE/Contents/Resources/README.txt" << 'README_EOF'
AgentX Desktop App
==================

This is a native desktop version of AgentX with its own window.
No browser needed!

FEATURES:
- Native macOS window (not browser)
- System tray icon
- Menu bar integration
- Embedded Node.js (no install required)

HOW TO USE:
1. Double-click AgentX.app
2. Wait 5-10 seconds for startup
3. Dashboard opens in native window

FOR DEVELOPERS (Bud):
To update after making code changes:
   /Applications/AgentX.app/Contents/Resources/UPDATE.sh

WHAT'S INCLUDED:
- Node.js binary (embedded)
- Frontend source code
- Backend source code
- Electron runtime

SIZE: ~200MB

TROUBLESHOOTING:
- Check logs: ~/Library/Logs/AgentX/electron.log
- If stuck, quit and reopen
- Delete database/agentx.db to reset
README_EOF

# Calculate size
echo ""
echo "📊 Build Summary:"
echo "=================="
du -sh "$APP_BUNDLE" | awk '{print "App Size: " $1}'
find "$APP_BUNDLE/Contents/Resources" -name "node_modules" -prune -o -type f -print | wc -l | awk '{print "Source Files: " $1}'
echo ""
echo "✅ Standalone AgentX with Electron built successfully!"
echo ""
echo "📍 Location: $APP_BUNDLE"
echo ""
echo "To install:"
echo "   cp -R \"$APP_BUNDLE\" /Applications/"
echo ""
echo "🎨 Features:"
echo "   ✅ Native desktop window (no browser)"
echo "   ✅ Embedded Node.js (no install needed)"
echo "   ✅ Editable source code for updates"
echo "   ✅ System tray icon"
echo "   ✅ macOS menu bar integration"
echo ""
