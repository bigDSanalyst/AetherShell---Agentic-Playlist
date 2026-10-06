// End-to-end tests of the HTTP API: the real server (server.ts) is started on a
// spare port with throwaway data files, an owner key and a signed charter, and
// no model provider (so model steps fail closed or fall back, as documented).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { firstCharter, signCharter, writeCharterFile } from '../server/charter';

const TOKEN = 'test-owner-token';
let base = '';
let child: ChildProcess | null = null;
let log = '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-http-'));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

before(async () => {
  const owner = crypto.generateKeyPairSync('ed25519');
  const ownerPub = Buffer.from(owner.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
  writeCharterFile(path.join(dir, 'charter.json'), signCharter(firstCharter('http test'), owner.privateKey));
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'LOCAL_LLM_BASE_URL', 'MODEL_CASCADE', 'YOUTUBE_API_KEY', 'GOOGLE_OAUTH_CLIENT_ID', 'AETHERSHELL_SIGNING_KEY']) delete env[k];
  Object.assign(env, {
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    AETHERSHELL_ACCESS_TOKEN: TOKEN,
    AETHERSHELL_OWNER_PUBLIC_KEY: ownerPub,
    AETHERSHELL_CHARTER_PATH: path.join(dir, 'charter.json'),
    AETHERSHELL_LEDGER_PATH: path.join(dir, 'ledger.jsonl'),
    AETHERSHELL_TRANSCRIPTS_PATH: path.join(dir, 'transcripts.jsonl'),
    AETHERSHELL_LEARNING_PATH: path.join(dir, 'learning.jsonl'),
    AETHERSHELL_USAGE_PATH: path.join(dir, 'usage.json'),
    AETHERSHELL_DEMO_USAGE_PATH: path.join(dir, 'demo-usage.json'),
    DEMO_LIMIT_PER_IP: '2',
    RATE_LIMIT_MAX: '1000',
  });
  child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout!.on('data', (d) => (log += d));
  child.stderr!.on('data', (d) => (log += d));
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/api/charter`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`server did not start:\n${log}`);
});

after(() => {
  child?.kill();
});

const owner = { 'x-aethershell-token': TOKEN, 'Content-Type': 'application/json' };
const visitor = { 'Content-Type': 'application/json' };
const get = (p: string, headers: Record<string, string> = owner) => fetch(base + p, { headers });
const post = (p: string, body: unknown, headers: Record<string, string> = owner) => fetch(base + p, { method: 'POST', headers, body: JSON.stringify(body) });

const TEXT = '0:00 Gravity is what fills the hole in quantum mechanics.\n0:10 Collapse happens without any observer at all.';

test('the charter is in force, unknown routes are 404 JSON', async () => {
  const c = await (await get('/api/charter')).json();
  assert.equal(c.ok, true, JSON.stringify(c.problems));
  assert.equal(c.charter.version, 1);
  const nf = await get('/api/no-such-thing');
  assert.equal(nf.status, 404);
  assert.match((await nf.json()).error, /Not found/);
});

test('access: visitors browse, owner-only actions need the token, the ledger is public', async () => {
  assert.equal((await get('/api/transcripts/library', visitor)).status, 200);
  assert.equal((await get('/api/ledger/head', visitor)).status, 200);
  for (const p of ['/api/transcripts/export', '/api/doctor']) assert.equal((await get(p, visitor)).status, 401, p);
  assert.equal((await post('/api/crypto/watermark-and-bind', { rawTranscript: 'x', pertainedLogic: { s: 1 } }, visitor)).status, 401);
  assert.equal((await post('/api/charter', {}, visitor)).status, 401);
  assert.equal((await get('/api/doctor')).status, 200);
  const st = await (await get('/api/auth/demo-status', visitor)).json();
  assert.equal(st.isAuthorized, false);
  assert.equal(st.hasAccessTokenConfigured, true);
  assert.equal((await (await get('/api/auth/demo-status')).json()).isAuthorized, true);
});

test('paste → archive → library → set → bind (signed source) → ledger verifies', async () => {
  const p = await (await post('/api/youtube/provided-transcript', { youtubeId: 'aaaaaaaaaaa', title: 'Lecture', text: TEXT })).json();
  assert.equal(p.source, 'owner-provided');
  const lib = await (await get('/api/transcripts/library')).json();
  assert.ok(lib.videos.some((v: any) => v.videoId === 'aaaaaaaaaaa' && v.source === 'owner-provided'));
  const set = await (await post('/api/transcripts/collection', { videoIds: ['aaaaaaaaaaa', 'zzzzzzzzzzz'] })).json();
  assert.deepEqual(set.missing, ['zzzzzzzzzzz']);
  assert.match(set.playlist.id, /^collection-[0-9a-f]{16}$/);
  const v = set.playlist.videos[0];
  const bind = await (await post('/api/crypto/watermark-and-bind', { rawTranscript: v.rawTranscript, videoId: v.youtubeId, pertainedLogic: { logicId: 'L1', summary: 'plan', workflowSteps: [] } })).json();
  assert.equal(bind.watermark.manifest.transcriptSource, 'owner-provided');
  const ver = await (await get('/api/ledger/verify')).json();
  assert.equal(ver.ok, true, JSON.stringify(ver));
});

test('guards: with no model to review, the guard fails closed and the verdict is recorded', async () => {
  const lib = await (await post('/api/transcripts/collection', { videoIds: ['aaaaaaaaaaa'] })).json();
  const v = lib.playlist.videos[0];
  const logic = { logicId: 'L-guard', summary: 'Gravity fills the hole in quantum mechanics', workflowSteps: [{ step: 1, action: 'collapse', description: 'collapse without observer' }] };
  const bind = await (await post('/api/crypto/watermark-and-bind', { rawTranscript: v.rawTranscript, pertainedLogic: logic })).json();
  const res = await post('/api/engine/guard-validate', { directTranscript: v.rawTranscript, innershellLogic: logic, watermark: bind.watermark, compressedRecord: bind.compressed });
  assert.equal(res.status, 200);
  const g = await res.json();
  assert.equal(g.guardReport.passedPhaseBoundary, false); // the required model review could not run
  const entries = await (await get('/api/ledger/entries')).json();
  assert.ok(entries.entries.some((e: any) => e.kind === 'guard'));
});

test('transcribing without a model fails closed; the archive export round-trips', async () => {
  const t = await post('/api/youtube/transcribe', { youtubeId: 'bbbbbbbbbbb', method: 'model' });
  assert.equal(t.status, 422);
  assert.match((await t.json()).error, /needs a Gemini model/);
  const file = await (await get('/api/transcripts/export')).json();
  assert.equal(file.format, 'aethershell-transcripts/v1');
  const again = await (await post('/api/transcripts/import', file)).json();
  assert.equal(again.alreadyHere, file.count);
});

test('picked videos are ingested from the archive; bad ids are refused', async () => {
  const r = await (await post('/api/youtube/ingest-videos', { playlistId: 'PLx1', title: 'Mine', items: [{ videoId: 'aaaaaaaaaaa' }], modelFallback: false })).json();
  assert.equal(r.playlist.id, 'playlist-PLx1');
  assert.equal(r.playlist.videos[0].fromArchive, true);
  assert.equal((await post('/api/youtube/ingest-videos', { items: [{ videoId: '<x>' }] })).status, 400);
  assert.deepEqual(await (await get('/api/config/google-client')).json(), { clientId: null });
});

test('notebooks: import, then export with a signed plan whose check verifies', async () => {
  const nb = { nbformat: 4, metadata: {}, cells: [{ cell_type: 'markdown', source: '# Notes\nCollapse time is hbar over E_G.' }, { cell_type: 'code', source: 'print(1)', outputs: [{ output_type: 'stream', text: '1\n' }] }] };
  const imp = await (await post('/api/notebooks/import', { content: JSON.stringify(nb), filename: 'notes.ipynb' })).json();
  const v = imp.playlist.videos[0];
  assert.equal(v.transcriptSource, 'notebook');
  assert.equal(v.segments.length, 2);
  const logic = { logicId: 'L-nb', summary: 'Compute', workflowSteps: [{ step: 1, action: 'Compute tau', description: 'tau = hbar / E_G' }] };
  const bind = await (await post('/api/crypto/watermark-and-bind', { rawTranscript: v.rawTranscript, pertainedLogic: logic })).json();
  assert.equal(bind.watermark.manifest.transcriptSource, 'notebook');
  const exp = await (await post('/api/notebooks/export', { title: 'T', sources: [v], logic, boundVideo: { rawTranscript: v.rawTranscript, watermark: bind.watermark } }, visitor)).json();
  assert.equal(exp.signedCheck, 'verified');
  assert.equal(exp.notebook.nbformat, 4);
});

test('chat streams; with no model it answers by keyword search over the archived text, not the browser\'s copy', async () => {
  const res = await post('/api/knowledge/chat', {
    stream: true,
    messages: [{ role: 'user', content: 'gravity bananas' }],
    videos: [{ youtubeId: 'aaaaaaaaaaa', title: 'Lecture', segments: [{ start: '0:00', speaker: 'S', text: 'Bananas are the answer.' }] }],
  });
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
  const events = (await res.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  const text = events.filter((e) => e.delta).map((e) => e.delta).join('');
  assert.match(text, /Gravity is what fills the hole/);
  assert.doesNotMatch(text, /Bananas are the answer/);
  const done = events.find((e) => e.done);
  assert.equal(done.degraded, true);
  assert.equal(done.corpusCoverage[0].fromArchive, true);
});

test('visitors get DEMO_LIMIT_PER_IP AI calls, then a clear refusal', async () => {
  const body = { messages: [{ role: 'user', content: 'x' }], videos: [] };
  assert.equal((await post('/api/knowledge/chat', body, visitor)).status, 200);
  assert.equal((await post('/api/knowledge/chat', body, visitor)).status, 200);
  const third = await post('/api/knowledge/chat', body, visitor);
  assert.equal(third.status, 429);
  assert.equal((await third.json()).code, 'DEMO_LIMIT_EXCEEDED');
  assert.equal((await post('/api/knowledge/chat', body)).status, 200); // the owner is never counted
});
