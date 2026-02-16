#!/bin/bash

# Create a simple AgentX icon using emoji
# This creates a basic icon that can be replaced later

RESOURCES_DIR="$(cd "$(dirname "$0")/AgentX.app/Contents/Resources" && pwd)"
TEMP_DIR=$(mktemp -d)

echo "🎨 Creating default AgentX icon..."

# Create a simple colored background image (1024x1024)
# Using sips to create a gradient background

# First, create a solid color image (blue-purple gradient feel)
cat > "$TEMP_DIR/create_icon.swift" << 'EOF'
import Cocoa

let size = CGSize(width: 1024, height: 1024)
let image = NSImage(size: size)

image.lockFocus()

// Create gradient background
let context = NSGraphicsContext.current!
let cgContext = context.cgContext

let colors = [
    NSColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 1.0).cgColor,  // Blue
    NSColor(red: 0.4, green: 0.2, blue: 0.6, alpha: 1.0).cgColor   // Purple
]

let gradient = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: colors as CFArray,
    locations: [0.0, 1.0]
)!

cgContext.drawLinearGradient(
    gradient,
    start: CGPoint(x: 0, y: 0),
    end: CGPoint(x: size.width, y: size.height),
    options: []
)

// Add emoji text
let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 500),
    .foregroundColor: NSColor.white
]

let text = "🤖"
let textSize = text.size(withAttributes: attributes)
let textRect = NSRect(
    x: (size.width - textSize.width) / 2,
    y: (size.height - textSize.height) / 2 - 50,
    width: textSize.width,
    height: textSize.height
)

text.draw(in: textRect, withAttributes: attributes)

image.unlockFocus()

// Save as PNG
if let tiffData = image.tiffRepresentation,
   let bitmap = NSBitmapImageRep(data: tiffData),
   let pngData = bitmap.representation(using: .png, properties: [:]) {
    try? pngData.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
    print("✅ Icon created successfully")
} else {
    print("❌ Failed to create icon")
    exit(1)
}
EOF

# Run Swift script to create icon
if swift "$TEMP_DIR/create_icon.swift" "$RESOURCES_DIR/AppIcon.png" 2>/dev/null; then
    echo "✅ Icon image created"
    
    # Convert to .icns
    ./"$(dirname "$0")/create_iconset.sh"
    
    echo ""
    echo "✨ Default icon created!"
    echo "   Replace AppIcon.png in Resources folder to customize"
else
    echo "⚠️  Could not create icon automatically"
    echo "   Using generic macOS app icon"
    echo ""
    echo "To add a custom icon later:"
    echo "   1. Add 1024x1024 PNG to: $RESOURCES_DIR/AppIcon.png"
    echo "   2. Run: ./macOS/create_iconset.sh"
fi

# Cleanup
rm -rf "$TEMP_DIR"
