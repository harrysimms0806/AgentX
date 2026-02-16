#!/bin/bash

# Create AgentX Icon Set
# Converts AppIcon.png to macOS .icns format

RESOURCES_DIR="$(cd "$(dirname "$0")/AgentX.app/Contents/Resources" && pwd)"
ICONSET_DIR="$RESOURCES_DIR/AppIcon.iconset"

echo "🎨 Creating AgentX icon set..."

# Check if source image exists
if [ ! -f "$RESOURCES_DIR/AppIcon.png" ]; then
    echo "❌ Error: AppIcon.png not found in Resources folder"
    echo "   Expected: $RESOURCES_DIR/AppIcon.png"
    echo ""
    echo "Please add a 1024x1024 PNG image named AppIcon.png"
    exit 1
fi

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Generate all required sizes
echo "📐 Generating icon sizes..."

sips -z 16 16     "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null 2>&1
sips -z 32 32     "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null 2>&1
sips -z 32 32     "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null 2>&1
sips -z 64 64     "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null 2>&1
sips -z 128 128   "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null 2>&1
sips -z 256 256   "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null 2>&1
sips -z 256 256   "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null 2>&1
sips -z 512 512   "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null 2>&1
sips -z 512 512   "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null 2>&1
sips -z 1024 1024 "$RESOURCES_DIR/AppIcon.png" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null 2>&1

# Create .icns file
echo "🔧 Compiling icon set..."
icontool -c "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"

# Clean up
rm -rf "$ICONSET_DIR"

echo "✅ Icon created: $RESOURCES_DIR/AppIcon.icns"
echo ""
echo "To apply the icon:"
echo "   1. Copy AgentX.app to /Applications"
echo "   2. Double-click to launch"
