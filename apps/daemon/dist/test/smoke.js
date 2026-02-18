"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Smoke tests for Phase 0
const http_1 = __importDefault(require("http"));
const DAEMON_URL = 'http://127.0.0.1:3001';
let authToken;
function request(path, method = 'GET', body, token) {
    return new Promise((resolve, reject) => {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const options = {
            hostname: '127.0.0.1',
            port: 3001,
            path,
            method,
            headers,
        };
        const req = http_1.default.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: JSON.parse(data),
                    });
                }
                catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}
async function runTests() {
    console.log('🧪 Phase 0 Smoke Tests\n');
    // Test 1: Health check (no auth)
    console.log('1. Testing /health (no auth required)...');
    const health = await request('/health');
    if (health.status === 200 && health.body.status === 'ok') {
        console.log('   ✅ Health check passed');
        console.log(`   📦 Version: ${health.body.version}`);
        console.log(`   📁 Sandbox: ${health.body.sandbox}`);
    }
    else {
        console.log('   ❌ Health check failed');
        process.exit(1);
    }
    // Test 2: Auth required
    console.log('\n2. Testing auth enforcement...');
    const projectsNoAuth = await request('/projects');
    if (projectsNoAuth.status === 401) {
        console.log('   ✅ Auth required for protected routes');
    }
    else {
        console.log('   ❌ Auth not enforced');
        process.exit(1);
    }
    // Test 3: Create session
    console.log('\n3. Testing /auth/session...');
    const session = await request('/auth/session', 'POST', { clientId: 'test-client' });
    if (session.status === 200 && session.body.token) {
        authToken = session.body.token;
        console.log('   ✅ Session created');
        console.log(`   🔑 Token: ${authToken.substring(0, 20)}...`);
    }
    else {
        console.log('   ❌ Failed to create session');
        process.exit(1);
    }
    // Test 4: Create project
    console.log('\n4. Testing /projects (create)...');
    const createProject = await request('/projects', 'POST', { name: 'Test Project' }, authToken);
    if (createProject.status === 201) {
        console.log('   ✅ Project created');
        console.log(`   📁 ID: ${createProject.body.id}`);
    }
    else {
        console.log('   ❌ Failed to create project:', createProject.body);
        process.exit(1);
    }
    // Test 5: List projects
    console.log('\n5. Testing /projects (list)...');
    const listProjects = await request('/projects', 'GET', undefined, authToken);
    if (listProjects.status === 200 && Array.isArray(listProjects.body)) {
        console.log(`   ✅ Listed ${listProjects.body.length} project(s)`);
    }
    else {
        console.log('   ❌ Failed to list projects');
        process.exit(1);
    }
    // Test 6: Sandbox enforcement - path traversal
    console.log('\n6. Testing sandbox path traversal rejection...');
    const traverse = await request('/fs/read?projectId=test-project&path=../../etc/passwd', 'GET', undefined, authToken);
    if (traverse.status === 403) {
        console.log('   ✅ Path traversal blocked');
    }
    else {
        console.log('   ❌ Path traversal NOT blocked');
        process.exit(1);
    }
    // Test 7: Write and read file
    console.log('\n7. Testing file write/read...');
    const writeFile = await request('/fs/write', 'PUT', {
        projectId: 'test-project',
        path: 'test.txt',
        content: 'Hello from Phase 0!',
    }, authToken);
    if (writeFile.status === 200) {
        console.log('   ✅ File written');
        const readFile = await request('/fs/read?projectId=test-project&path=test.txt', 'GET', undefined, authToken);
        if (readFile.status === 200 && readFile.body.content === 'Hello from Phase 0!') {
            console.log('   ✅ File read back correctly');
        }
        else {
            console.log('   ❌ Failed to read file');
            process.exit(1);
        }
    }
    else {
        console.log('   ❌ Failed to write file:', writeFile.body);
        process.exit(1);
    }
    // Test 8: Audit log
    console.log('\n8. Testing audit log...');
    const auditLog = await request('/audit?limit=10', 'GET', undefined, authToken);
    if (auditLog.status === 200 && Array.isArray(auditLog.body)) {
        console.log(`   ✅ Audit log has ${auditLog.body.length} event(s)`);
    }
    else {
        console.log('   ❌ Failed to read audit log');
        process.exit(1);
    }
    console.log('\n✨ All smoke tests passed!');
    process.exit(0);
}
// Wait a moment for daemon to start if running concurrently
setTimeout(runTests, 1000);
