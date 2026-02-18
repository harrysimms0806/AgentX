"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Test for Blocker 1 fix: Sandbox escape via prefix-match
const sandbox_1 = require("../sandbox");
async function runTests() {
    // Initialize sandbox
    await sandbox_1.sandbox.initialize();
    console.log('🧪 Testing Blocker 1 Fix: Sandbox Escape Prevention\n');
    // Test 1: Valid project ID
    console.log('1. Valid project ID (test-project):');
    const validCheck = sandbox_1.sandbox.validatePath('test-project', 'file.txt');
    console.log(`   Allowed: ${validCheck.allowed}`);
    console.log(`   ${validCheck.allowed ? '✅ PASS' : '❌ FAIL'}`);
    // Test 2: Path traversal in projectId (the vulnerability)
    console.log('\n2. Path traversal in projectId (../projects-evil):');
    const traversalCheck = sandbox_1.sandbox.validatePath('../projects-evil', 'file.txt');
    console.log(`   Allowed: ${traversalCheck.allowed}`);
    console.log(`   Error: ${traversalCheck.error}`);
    console.log(`   ${!traversalCheck.allowed ? '✅ BLOCKED' : '❌ VULNERABLE'}`);
    // Test 3: Path traversal with slash
    console.log('\n3. Path traversal with slash (../other):');
    const slashCheck = sandbox_1.sandbox.validatePath('../other', 'file.txt');
    console.log(`   Allowed: ${slashCheck.allowed}`);
    console.log(`   Error: ${slashCheck.error}`);
    console.log(`   ${!slashCheck.allowed ? '✅ BLOCKED' : '❌ VULNERABLE'}`);
    // Test 4: Invalid characters in projectId
    console.log('\n4. Invalid characters (test@project):');
    const invalidCheck = sandbox_1.sandbox.validatePath('test@project', 'file.txt');
    console.log(`   Allowed: ${invalidCheck.allowed}`);
    console.log(`   Error: ${invalidCheck.error}`);
    console.log(`   ${!invalidCheck.allowed ? '✅ BLOCKED' : '❌ VULNERABLE'}`);
    // Test 5: Prefix attack (projects-evil without ..)
    console.log('\n5. Prefix attack (projects-evil):');
    const prefixCheck = sandbox_1.sandbox.validatePath('projects-evil', 'file.txt');
    // This should be allowed as a valid project name, but confined to its own directory
    console.log(`   Allowed: ${prefixCheck.allowed}`);
    if (prefixCheck.allowed && prefixCheck.realPath) {
        const sandboxRoot = '/Users/bud/BUD BOT/projects';
        const isConfined = prefixCheck.realPath.startsWith(sandboxRoot + '/projects-evil/') ||
            prefixCheck.realPath === sandboxRoot + '/projects-evil';
        console.log(`   Real path: ${prefixCheck.realPath}`);
        console.log(`   ${isConfined ? '✅ CONFINED to own directory' : '❌ ESCAPED sandbox'}`);
    }
    // Test 6: Boundary check with relative path escape attempt
    console.log('\n6. Relative path escape (test-project/../../etc):');
    const escapeCheck = sandbox_1.sandbox.validatePath('test-project', '../../etc/passwd');
    console.log(`   Allowed: ${escapeCheck.allowed}`);
    console.log(`   Error: ${escapeCheck.error}`);
    console.log(`   ${!escapeCheck.allowed ? '✅ BLOCKED' : '❌ VULNERABLE'}`);
    console.log('\n--- Summary ---');
    const tests = [
        validCheck.allowed,
        !traversalCheck.allowed,
        !slashCheck.allowed,
        !invalidCheck.allowed,
        prefixCheck.allowed,
        !escapeCheck.allowed,
    ];
    const passed = tests.filter(t => t).length;
    console.log(`${passed}/${tests.length} tests passed`);
    if (passed === tests.length) {
        console.log('✅ All security tests passed!');
        process.exit(0);
    }
    else {
        console.log('❌ Some tests failed');
        process.exit(1);
    }
}
runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
