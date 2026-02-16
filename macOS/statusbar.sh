#!/bin/bash

# AgentX Status Bar Helper
# Shows AgentX status in macOS menu bar

# This uses SwiftBar or similar if available, or just a simple script
# For now, create a launchd service that shows notifications

# Check if AgentX is running
check_status() {
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "✅ Running"
        return 0
    else
        echo "❌ Stopped"
        return 1
    fi
}

# Show status menu
show_menu() {
    STATUS=$(check_status)
    
    osascript << EOF
tell application "System Events"
    activate
    set buttonList to {"Open Dashboard", "View Logs", "Restart", "Quit"}
    
    set theSelection to choose from list buttonList with title "AgentX" with prompt "$STATUS\n\nWhat would you like to do?" default items {"Open Dashboard"} cancel button name "Cancel"
    
    if theSelection is false then
        return "cancelled"
    else if item 1 of theSelection is "Open Dashboard" then
        return "open"
    else if item 1 of theSelection is "View Logs" then
        return "logs"
    else if item 1 of theSelection is "Restart" then
        return "restart"
    else if item 1 of theSelection is "Quit" then
        return "quit"
    end if
end tell
EOF
}

# Handle menu selection
handle_selection() {
    case $1 in
        "open")
            open "http://localhost:5173"
            ;;
        "logs")
            open "$HOME/Library/Logs/AgentX"
            ;;
        "restart")
            pkill -f "AgentX" || true
            sleep 2
            open "/Applications/AgentX.app"
            ;;
        "quit")
            pkill -f "AgentX" || true
            osascript -e 'display notification "AgentX has been stopped" with title "AgentX"'
            ;;
    esac
}

# Main
SELECTION=$(show_menu)
if [ "$SELECTION" != "cancelled" ]; then
    handle_selection "$SELECTION"
fi
