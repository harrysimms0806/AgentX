#!/bin/bash
# Dev startup script for AgentX

echo "🚀 Starting AgentX development environment..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build packages
echo -e "${BLUE}Building packages...${NC}"
cd packages/api-types && npm run build && cd ../..
cd packages/shared && npm run build && cd ../..

# Start daemon
echo -e "${GREEN}Starting daemon...${NC}"
cd apps/daemon && npm run build && npm start &
DAEMON_PID=$!
cd ../..

# Wait for daemon
echo "Waiting for daemon to start..."
sleep 3

# Check daemon health
if curl -s http://127.0.0.1:3001/health > /dev/null; then
    echo -e "${GREEN}✅ Daemon running on http://127.0.0.1:3001${NC}"
else
    echo "❌ Daemon failed to start"
    kill $DAEMON_PID 2>/dev/null
    exit 1
fi

echo ""
echo "AgentX is ready!"
echo "- Daemon: http://127.0.0.1:3001"
echo "- UI: http://localhost:3000 (when Phase 1 is built)"
echo ""
echo "Press Ctrl+C to stop"

# Wait for interrupt
trap "kill $DAEMON_PID 2>/dev/null; exit 0" INT
wait
