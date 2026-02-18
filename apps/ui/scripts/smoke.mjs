import assert from 'node:assert/strict';

const baseUrl = process.env.UI_BASE_URL ?? 'http://localhost:3000';

async function fetchText(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  const text = await res.text();
  return { res, text };
}

const pages = ['/', '/workspace', '/audit', '/settings'];

for (const page of pages) {
  const { res } = await fetchText(page);
  assert.equal(res.status, 200, `${page} should return 200`);
}

const { res: homeRes, text: homeHtml } = await fetchText('/');
assert.equal(homeRes.status, 200, 'home should return 200');
assert.match(homeHtml, /Dashboard/, 'home should render Dashboard heading');
assert.match(homeHtml, /Connection state:/, 'home should render connection state details');
assert.match(homeHtml, /Connection Details/, 'home should render connection details panel');

const discoveryRes = await fetch(`${baseUrl}/api/daemon/discovery`);
const discoveryJson = await discoveryRes.json();
assert.ok(
  discoveryRes.status === 200 || discoveryRes.status === 404 || discoveryRes.status === 500,
  'discovery should return structured status'
);
assert.equal(typeof discoveryJson, 'object', 'discovery response should be JSON object');

console.log('✅ UI smoke checks passed');
