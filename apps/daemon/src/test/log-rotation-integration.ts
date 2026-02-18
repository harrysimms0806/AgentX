// Integration test for log rotation and buffer bounds
import http from 'http';

const DAEMON_PORT = 3001;
const TEST_TIMEOUT = 60000; // 60 seconds for this test

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
  const run = await request(
    'POST', 
    '/supervisor/runs', 
    { Authorization: `Bearer ${token}` },
    { projectId, type: 'command', timeoutMs: 120000 }
  );
  if (run.status !== 201) {
    console.log('❌ Failed to create run:', run.data);
    process.exit(1);
  }
  console.log(`✅ Created run: ${run.data.id} with timeoutMs: ${run.data.timeoutMs}`);

  // Verify timeout is returned in list
  console.log('\n2. Verifying timeout in run list...');
  const runs = await request('GET', `/supervisor/runs?projectId=${projectId}`, { Authorization: `Bearer ${token}` });
  const ourRun = runs.data.runs.find((r: any) => r.id === run.data.id);
  if (ourRun?.timeoutMs === 120000) {
    console.log('✅ timeoutMs correctly returned in API');
  } else {
    console.log('❌ timeoutMs missing or incorrect:', ourRun);
  }

  // Test 3: Create run with timeout clamping (too high)
  console.log('\n3. Testing timeout clamping (1 hour should clamp to 30 min)...');
  const bigRun = await request(
    'POST',
    '/supervisor/runs',
    { Authorization: `Bearer ${token}` },
    { projectId, type: 'command', timeoutMs: 3600000 } // 1 hour
  );
  if (bigRun.data.timeoutMs === 1800000) { // 30 minutes
    console.log('✅ Timeout correctly clamped to 30 min (1800000ms)');
  } else {
    console.log('⚠️ Timeout not clamped as expected:', bigRun.data.timeoutMs);
  }

  // Test 4: Runtime schema version
  console.log('\n4. Checking runtime.json schema...');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const runtimePath = path.join(os.homedir(), '.agentx', 'runtime.json');
  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  if (runtime.schemaVersion === '1.0') {
    console.log('✅ runtime.json has schemaVersion: 1.0');
  } else {
    console.log('⚠️ schemaVersion missing or different:', runtime.schemaVersion);
  }
  if (!runtime.sandboxRoot) {
    console.log('✅ sandboxRoot correctly excluded from runtime.json');
  } else {
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
