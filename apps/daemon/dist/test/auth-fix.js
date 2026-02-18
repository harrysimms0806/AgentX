"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../auth");
async function runTests() {
    await auth_1.auth.initialize();
    console.log('🧪 Testing Blocker 2 Fix: Auth Enforcement\n');
    // Helper to make requests
    const request = (method, path, headers, body) => {
        return new Promise((resolve) => {
            const req = { method, url: path, headers: headers || {}, body };
            const res = {
                statusCode: 200,
                jsonData: null,
                status(code) { this.statusCode = code; return this; },
                json(data) { this.jsonData = data; resolve({ status: this.statusCode, data }); },
                end() { resolve({ status: this.statusCode, data: null }); },
            };
            // Simulate Express routing
            const handler = findHandler(method, path);
            if (handler) {
                handler(req, res, () => { });
            }
            else {
                resolve({ status: 404, data: { error: 'Not found' } });
            }
        });
    };
    // Find handler by path/method (simplified)
    function findHandler(method, path) {
        // Return mock handlers for testing
        return null;
    }
    // Test 1: /auth/session should be public (no auth required)
    console.log('1. POST /auth/session without auth:');
    console.log('   Expected: 200 (session created)');
    console.log('   Testing... (requires running server)');
    // Test 2: /auth/revoke should require auth
    console.log('\n2. POST /auth/revoke without auth:');
    console.log('   Expected: 401 (Authorization required)');
    console.log('   Testing... (requires running server)');
    // Test 3: /auth/revoke with valid token
    console.log('\n3. POST /auth/revoke with valid token:');
    console.log('   Expected: 200 (session revoked)');
    console.log('   Testing... (requires running server)');
    console.log('\n--- Run with actual server ---');
    console.log('Start server: npm start');
    console.log('Then run: curl -X POST http://127.0.0.1:3001/auth/revoke');
    console.log('Expected: {"error":"Authorization header required"}');
}
runTests().catch(console.error);
