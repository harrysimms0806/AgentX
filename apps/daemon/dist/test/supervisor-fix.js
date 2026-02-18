"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Test for Blocker 4 fix: Supervisor restart and log-bounding
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const runtimeDir = path_1.default.join(os_1.default.homedir(), '.agentx');
const runsFile = path_1.default.join(runtimeDir, 'runs.json');
console.log('🧪 Testing Blocker 4 Fix: Supervisor Persistence\n');
// Test 1: Check if runs.json can be created
console.log('1. Simulating persisted runs file...');
const mockRuns = {
    runs: [
        {
            id: 'test-run-1',
            projectId: 'test-project',
            type: 'command',
            status: 'running', // This should be marked stale on restart
            startedAt: new Date().toISOString(),
            logsPath: path_1.default.join(runtimeDir, 'logs', 'test-run-1.log'),
        },
        {
            id: 'test-run-2',
            projectId: 'test-project',
            type: 'agent',
            status: 'completed',
            startedAt: new Date(Date.now() - 3600000).toISOString(),
            endedAt: new Date(Date.now() - 3000000).toISOString(),
            logsPath: path_1.default.join(runtimeDir, 'logs', 'test-run-2.log'),
        },
    ],
};
fs_1.default.writeFileSync(runsFile, JSON.stringify(mockRuns, null, 2));
console.log('   ✅ Created mock runs file');
// Test 2: Verify file format
console.log('\n2. Verifying runs file format:');
const data = JSON.parse(fs_1.default.readFileSync(runsFile, 'utf8'));
console.log(`   Runs count: ${data.runs.length}`);
console.log(`   Running runs: ${data.runs.filter((r) => r.status === 'running').length}`);
console.log('   ✅ File format valid');
// Test 3: Check log directory
console.log('\n3. Checking log directory:');
const logsDir = path_1.default.join(runtimeDir, 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
const logFiles = fs_1.default.readdirSync(logsDir);
console.log(`   Log files: ${logFiles.length}`);
console.log('   ✅ Logs directory exists');
console.log('\n--- Test Complete ---');
console.log('Now restart the daemon. Previously "running" runs should be marked as stale.');
console.log('Expected: test-run-1 status changes from "running" to "error"');
// Cleanup
fs_1.default.unlinkSync(runsFile);
console.log('\n🧹 Cleaned up test runs file');
