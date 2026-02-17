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
