import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { buildContextPack, renderInjectedContext } from '../context-pack';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentx-phase5-'));
const projectA = path.join(root, 'project-a');
const memoryDir = path.join(projectA, 'memory');
fs.mkdirSync(memoryDir, { recursive: true });

fs.writeFileSync(path.join(memoryDir, 'snippet1.md'), 'Implement login workflow with oauth token exchange and callback validation.');
fs.writeFileSync(path.join(memoryDir, 'snippet2.md'), 'Unrelated gardening notes about tomatoes and soil acidity.');

const input = {
  projectId: 'proj-a',
  projectRootPath: projectA,
  prompt: 'Fix oauth callback token flow and login issue',
  openFiles: ['src/auth.ts'],
  userNotes: 'apiKey=supersecret\nBearer abc.def.ghi',
  maxChars: 300,
};

const pack = buildContextPack(input);
const injected = renderInjectedContext(pack);
const pack2 = buildContextPack(input);

assert(pack.sizeChars <= 300, 'budget cap should be enforced');
assert(pack.truncated === true, 'pack should be marked truncated for small budget');
assert(injected.includes('truncated to fit budget') || pack.sections.userNotes.includes('truncated to fit budget'));
assert(!pack.sections.userNotes.includes('supersecret'), 'secret must be redacted');
assert(!pack.sections.userNotes.includes('abc.def.ghi'), 'bearer token must be redacted');
assert(pack.retrievalDebug && pack.retrievalDebug.length > 0, 'retrieval debug expected');
assert.deepStrictEqual(pack.retrievedSnippetIds, pack2.retrievedSnippetIds, 'retrieval should be deterministic');

console.log('Phase 5 context pack checks passed');
