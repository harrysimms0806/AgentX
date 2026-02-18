// Phase 3 terminal security checks
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sandbox } from '../sandbox';
import { validateTerminalAccess } from '../terminal-policy';

async function run() {
  process.env.AGENTX_SANDBOX = path.join(os.tmpdir(), `agentx-phase3-${Date.now()}`);
  await sandbox.initialize();

  const root = process.env.AGENTX_SANDBOX!;
  const projectId = 'phase3-test';
  fs.mkdirSync(path.join(root, projectId), { recursive: true });

  // Ensure traversal is blocked by sandbox validator path.
  const traversal = sandbox.validatePath(projectId, '../../..');
  if (traversal.allowed) {
    throw new Error('Expected traversal to be blocked');
  }

  const absolute = sandbox.validatePath(projectId, '/etc');
  if (absolute.allowed) {
    throw new Error('Expected absolute path to be blocked');
  }

  console.log('✅ sandbox traversal checks passed');

  // validateTerminalAccess requires project metadata, so for this focused test we only verify
  // that missing project is refused with explicit code.
  const noProject = validateTerminalAccess('missing-project', '.');
  if (noProject.allowed || noProject.code !== 'PROJECT_NOT_FOUND') {
    throw new Error('Expected project policy check to reject missing project');
  }

  console.log('✅ terminal policy missing-project check passed');
}

run().catch((err) => {
  console.error('❌ phase3-terminal-security failed', err);
  process.exit(1);
});
