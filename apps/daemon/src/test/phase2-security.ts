import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeConfig } from '../config';
import { sandbox } from '../sandbox';

async function run() {
  const sandboxRoot = path.join(os.tmpdir(), `agentx-phase2-${Date.now()}`);
  process.env.AGENTX_SANDBOX = sandboxRoot;

  await initializeConfig();
  await sandbox.initialize();

  const projectId = 'phase2-test';
  const create = sandbox.createProject(projectId);
  assert.equal(create.success, true);

  const traversal = sandbox.validatePath(projectId, '../../../../etc/passwd');
  assert.equal(traversal.allowed, false, 'path traversal must be blocked');

  const absolute = sandbox.validatePath(projectId, '/etc/passwd');
  assert.equal(absolute.allowed, false, 'absolute path must be blocked');

  const projectInfo = sandbox.getProjectPath(projectId);
  assert.equal(projectInfo.allowed, true);
  const projectRoot = projectInfo.path;

  const insideFile = path.join(projectRoot, 'inside.txt');
  fs.writeFileSync(insideFile, 'ok');

  const outsideDir = path.join(sandboxRoot, '..', 'outside-phase2');
  fs.mkdirSync(outsideDir, { recursive: true });
  const outsideFile = path.join(outsideDir, 'secret.txt');
  fs.writeFileSync(outsideFile, 'secret');

  const symlinkPath = path.join(projectRoot, 'escape-link');
  fs.symlinkSync(outsideFile, symlinkPath);

  const symlinkCheck = sandbox.validatePath(projectId, 'escape-link');
  assert.equal(symlinkCheck.allowed, false, 'symlink escape must be blocked');

  console.log('Phase2 security checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
