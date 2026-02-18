// Test for Blocker fixes - runs against live daemon
import http from 'http';

const DAEMON_PORT = 3001;

function request(method: string, path: string, headers?: Record<string, string>, body?: any): Promise<{ status: number; data: any }> {
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

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Blocker Fixes Against Live Daemon\n');

  // Test 1: Health endpoint includes ports
  console.log('1. Health endpoint includes daemonPort and uiPort:');
  const health = await request('GET', '/health');
  if (health.data.daemonPort && health.data.uiPort) {
    console.log(`   ✅ daemonPort: ${health.data.daemonPort}, uiPort: ${health.data.uiPort}`);
  } else {
    console.log('   ❌ Missing ports in health response');
    console.log('   Response:', health.data);
  }

  // Test 2: Sandbox escape blocked - invalid projectId
  console.log('\n2. Sandbox escape blocked (invalid projectId):');
  const session = await request('POST', '/auth/session', {}, { clientId: 'test' });
  const token = session.data.token;
  
  // Try to use ../projects-evil as projectId
  const escapeAttempt = await request(
    'GET', 
    '/fs/tree?projectId=../projects-evil',
    { Authorization: `Bearer ${token}` }
  );
  if (escapeAttempt.status === 403 || escapeAttempt.status === 400) {
    console.log(`   ✅ Blocked with status ${escapeAttempt.status}`);
    console.log(`   Error: ${escapeAttempt.data.error}`);
  } else {
    console.log(`   ❌ Not blocked (status ${escapeAttempt.status})`);
  }

  // Test 3: Auth required for /auth/revoke
  console.log('\n3. Auth required for /auth/revoke:');
  const revokeNoAuth = await request('POST', '/auth/revoke');
  if (revokeNoAuth.status === 401) {
    console.log(`   ✅ Returns 401 without auth`);
  } else {
    console.log(`   ❌ Returns ${revokeNoAuth.status} (expected 401)`);
  }

  // Test 4: Auth revoke with valid token works
  console.log('\n4. Auth revoke with valid token:');
  const revokeWithAuth = await request(
    'POST',
    '/auth/revoke',
    { Authorization: `Bearer ${token}` }
  );
  if (revokeWithAuth.status === 200) {
    console.log(`   ✅ Revoke succeeded with valid token`);
  } else {
    console.log(`   Status: ${revokeWithAuth.status}`, revokeWithAuth.data);
  }

  console.log('\n✅ All live tests complete');
}

runTests().catch(console.error);
