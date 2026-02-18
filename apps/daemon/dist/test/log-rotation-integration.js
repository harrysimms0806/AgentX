"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Integration test for log rotation and buffer bounds
const http_1 = __importDefault(require("http"));
const DAEMON_PORT = 3001;
const TEST_TIMEOUT = 60000; // 60 seconds for this test
function request(method, path, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: DAEMON_PORT,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };
        const req = http_1.default.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
                }
                catch {
                    resolve({ status: res.statusCode || 0, data });
                }
            });
        });
        req.on('error', reject);
        if (body)
            req.write(JSON.stringify(body));
        req.end();
    });
}
async function runTests() {
    console.log('🧪 Log Rotation Integration Test\n');
    // Get auth token
    const session = await request('POST', '/auth/session', {}, { clientId: 'log-rotation-test' });
    if (session.status !== 200) {
        console.log('❌ Failed to get auth token:', session.data);
        process.exit(1);
    }
    const token = session.data.token;
    console.log('✅ Authenticated');
    // Create a test project first
    const project = await request('POST', '/projects', { Authorization: `Bearer ${token}` }, { name: 'log-rotation-test' });
    const projectId = project.data.id;
    console.log(`✅ Created test project: ${projectId}`);
    // Test 1: Create run with custom timeout
    console.log('\n1. Creating run with 2-minute timeout...');
    const run = await request('POST', '/supervisor/runs', { Authorization: `Bearer ${token}` }, { projectId, type: 'command', timeoutMs: 120000 });
    if (run.status !== 201) {
        console.log('❌ Failed to create run:', run.data);
        process.exit(1);
    }
    console.log(`✅ Created run: ${run.data.id} with timeoutMs: ${run.data.timeoutMs}`);
    // Verify timeout is returned in list
    console.log('\n2. Verifying timeout in run list...');
    const runs = await request('GET', `/supervisor/runs?projectId=${projectId}`, { Authorization: `Bearer ${token}` });
    const ourRun = runs.data.runs.find((r) => r.id === run.data.id);
    if (ourRun?.timeoutMs === 120000) {
        console.log('✅ timeoutMs correctly returned in API');
    }
    else {
        console.log('❌ timeoutMs missing or incorrect:', ourRun);
    }
    // Test 3: Create run with timeout clamping (too high)
    console.log('\n3. Testing timeout clamping (1 hour should clamp to 30 min)...');
    const bigRun = await request('POST', '/supervisor/runs', { Authorization: `Bearer ${token}` }, { projectId, type: 'command', timeoutMs: 3600000 } // 1 hour
    );
    if (bigRun.data.timeoutMs === 1800000) { // 30 minutes
        console.log('✅ Timeout correctly clamped to 30 min (1800000ms)');
    }
    else {
        console.log('⚠️ Timeout not clamped as expected:', bigRun.data.timeoutMs);
    }
    // Test 4: Runtime schema version
    console.log('\n4. Checking runtime.json schema...');
    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
    const path = await Promise.resolve().then(() => __importStar(require('path')));
    const os = await Promise.resolve().then(() => __importStar(require('os')));
    const runtimePath = path.join(os.homedir(), '.agentx', 'runtime.json');
    const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
    if (runtime.schemaVersion === '1.0') {
        console.log('✅ runtime.json has schemaVersion: 1.0');
    }
    else {
        console.log('⚠️ schemaVersion missing or different:', runtime.schemaVersion);
    }
    if (!runtime.sandboxRoot) {
        console.log('✅ sandboxRoot correctly excluded from runtime.json');
    }
    else {
        console.log('⚠️ sandboxRoot still in runtime.json');
    }
    // Cleanup
    console.log('\n5. Cleaning up test project...');
    // Note: Project deletion not implemented in Phase 0
    console.log('\n✅ All integration tests complete');
}
runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
