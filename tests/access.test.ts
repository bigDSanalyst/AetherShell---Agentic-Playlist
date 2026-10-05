import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoUsageStore, accessControlAndDemoLimit, envInt, envIntOrZero, isVisitorAllowed } from '../server/http';

// Runs the middleware on a fake request; returns the status it answered with, or "next".
function call(mw: any, method: string, path: string, token?: string, ip = '203.0.113.7') {
  let status: number | 'next' = 'next';
  let body: any = null;
  const req: any = { method, path, ip, socket: {}, header: (h: string) => (h === 'x-aethershell-token' ? token : undefined) };
  const res: any = {
    setHeader() {},
    status(c: number) {
      status = c;
      return this;
    },
    json(b: any) {
      body = b;
      return this;
    },
  };
  mw(req, res, () => {});
  return { status, code: body?.code };
}

test('no token configured: the owner\'s own server, everything open and nothing counted', () => {
  const store = new DemoUsageStore(null);
  const mw = accessControlAndDemoLimit(undefined, { store, limit: () => 3 });
  for (let i = 0; i < 10; i++) assert.equal(call(mw, 'POST', '/api/knowledge/chat').status, 'next');
  assert.equal(call(mw, 'POST', '/api/crypto/watermark-and-bind').status, 'next');
  assert.equal(store.get('203.0.113.7'), 0);
});

test('token configured: visitors browse freely, get N AI calls, and cannot sign or import', () => {
  const store = new DemoUsageStore(null);
  const mw = accessControlAndDemoLimit('secret', { store, limit: () => 3 });
  assert.equal(call(mw, 'GET', '/api/transcripts/library').status, 'next');
  assert.equal(call(mw, 'POST', '/api/transcripts/collection').status, 'next');
  for (let i = 0; i < 3; i++) assert.equal(call(mw, 'POST', '/api/knowledge/chat').status, 'next');
  assert.deepEqual(call(mw, 'POST', '/api/knowledge/chat'), { status: 429, code: 'DEMO_LIMIT_EXCEEDED' });
  // Another visitor has their own allowance.
  assert.equal(call(mw, 'POST', '/api/knowledge/chat', undefined, '198.51.100.1').status, 'next');
  for (const p of ['/api/crypto/watermark-and-bind', '/api/transcripts/import', '/api/youtube/provided-transcript', '/api/charter', '/api/exchange/owner', '/api/twin/absorb', '/api/guard/github-import']) {
    assert.deepEqual(call(mw, 'POST', p), { status: 401, code: 'ACCESS_TOKEN_REQUIRED' }, p);
  }
  // The owner, with the token, is never counted or refused.
  for (let i = 0; i < 5; i++) assert.equal(call(mw, 'POST', '/api/knowledge/chat', 'secret').status, 'next');
  assert.equal(call(mw, 'POST', '/api/crypto/watermark-and-bind', 'secret').status, 'next');
  assert.equal(call(mw, 'POST', '/api/knowledge/chat', 'wrong').status, 429);
});

test('DEMO_LIMIT_PER_IP=0 turns visitor AI calls off, as documented', () => {
  const mw = accessControlAndDemoLimit('secret', { store: new DemoUsageStore(null), limit: () => 0 });
  assert.deepEqual(call(mw, 'POST', '/api/knowledge/chat'), { status: 429, code: 'DEMO_LIMIT_EXCEEDED' });
  assert.equal(call(mw, 'GET', '/api/ledger/head').status, 'next');
});

test('playlist ingest counts as an AI call (it may transcribe with Gemini)', () => {
  assert.equal(isVisitorAllowed('POST', '/api/youtube/fetch-playlist'), 'ai');
  assert.equal(isVisitorAllowed('GET', '/api/transcripts/export'), 'read');
  assert.equal(isVisitorAllowed('POST', '/transcripts/import'), 'owner-only'); // path as mounted under /api
});

test('envInt keeps 0 as "use the default"; envIntOrZero accepts 0', () => {
  process.env.X_TEST_INT = '0';
  assert.equal(envInt('X_TEST_INT', 60), 60);
  assert.equal(envIntOrZero('X_TEST_INT', 3), 0);
  delete process.env.X_TEST_INT;
});

test('a visitor\'s own Gemini key: AI calls are not counted, owner-only actions still need the token, the key stays in the request', async () => {
  const { visitorKey, redactKey } = await import('../server/byok');
  const store = new DemoUsageStore(null);
  const mw = accessControlAndDemoLimit('secret', { store, limit: () => 1 });
  const key = 'AIzaSyD-THIS_is_a_fake_key_0123456789ab';
  const run = (method: string, path: string, k: string | undefined) => {
    let status: number | 'next' = 'next';
    let seen: string | null = null;
    const req: any = { method, path, ip: '203.0.113.9', socket: {}, header: (h: string) => (h === 'x-gemini-api-key' ? k : undefined) };
    const res: any = { setHeader() {}, status(c: number) { status = c; return this; }, json() { return this; } };
    mw(req, res, () => {
      seen = visitorKey();
    });
    return { status, seen };
  };
  for (let i = 0; i < 5; i++) assert.deepEqual(run('POST', '/knowledge/chat', key), { status: 'next', seen: key });
  assert.equal(store.get('203.0.113.9'), 0); // nothing counted
  assert.equal(run('POST', '/crypto/watermark-and-bind', key).status, 401); // still owner-only
  assert.equal(visitorKey(), null); // gone once the request is handled
  // Not a key: ignored, so the demo allowance applies (1, then refused).
  assert.equal(run('POST', '/knowledge/chat', 'not a key!').status, 'next');
  assert.equal(run('POST', '/knowledge/chat', 'not a key!').status, 429);
  // Error text never carries the key.
  const { runWithVisitorKey } = await import('../server/byok');
  assert.equal(runWithVisitorKey(key, () => redactKey(`bad key ${key} refused`)), 'bad key [your key] refused');
});
