#!/usr/bin/env python3
"""
Generate AgentX App Icon
Creates a simple, clean macOS app icon with robot emoji
"""

import os
import subprocess
import tempfile

# Icon sizes needed for macOS
ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024]

def create_icon():
    resources_dir = "/Users/bud/BUD BOT/projects/AgentX/macOS/AgentX.app/Contents/Resources"
    
    # Create a simple colored square with emoji using ImageMagick or sips
    # For now, create a placeholder that tells user how to add custom icon
    
    readme_path = os.path.join(resources_dir, "ICON_README.txt")
    with open(readme_path, 'w') as f:
        f.write("""AgentX Icon
============

To set a custom icon:

1. Find an image you like (PNG, 1024x1024 recommended)
2. Rename it to AppIcon.png
3. Copy it to this folder
4. Run: /Users/bud/BUD BOT/projects/AgentX/macOS/create_iconset.sh

Or use the default macOS generic app icon.

Suggested icons:
- Robot emoji 🤖
- Gear icon ⚙️
- Control center style icon
""")
    
    print("✅ Icon README created")
    print(f"   Location: {readme_path}")
    print("\nTo add a custom icon, replace the file and run:")
    print("   ./macOS/create_iconset.sh")

if __name__ == '__main__':
    create_icon()
