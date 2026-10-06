// The API surface, route file by route file: every endpoint is registered once,
// in the file that owns it. A route lost or duplicated in a refactor fails here;
// what each route does is tested end to end in http.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-routes-'));
// Throwaway data files: loading server/core.ts must not touch data/.
Object.assign(process.env, {
  AETHERSHELL_CHARTER_PATH: path.join(dir, 'charter.json'),
  AETHERSHELL_LEDGER_PATH: path.join(dir, 'ledger.jsonl'),
  AETHERSHELL_TRANSCRIPTS_PATH: path.join(dir, 'transcripts.jsonl'),
  AETHERSHELL_LEARNING_PATH: path.join(dir, 'learning.jsonl'),
  AETHERSHELL_USAGE_PATH: path.join(dir, 'usage.json'),
  AETHERSHELL_DEMO_USAGE_PATH: path.join(dir, 'demo-usage.json'),
});

const EXPECTED: Record<string, string[]> = {
  auth: ['GET /api/crypto/public-key', 'GET /api/auth/demo-status', 'POST /api/auth/verify-token', 'POST /api/auth/check-own-key'],
  youtube: [
    'GET /api/youtube/curated',
    'POST /api/youtube/fetch-playlist',
    'POST /api/youtube/transcribe',
    'GET /api/config/google-client',
    'POST /api/youtube/ingest-videos',
    'POST /api/youtube/provided-transcript',
  ],
  transcripts: ['GET /api/transcripts/library', 'GET /api/transcripts/export', 'POST /api/transcripts/import', 'POST /api/transcripts/collection'],
  notebooks: ['POST /api/notebooks/import', 'POST /api/notebooks/export'],
  engine: ['POST /api/crypto/watermark-and-bind', 'POST /api/engine/rcl-ssi-cycle', 'POST /api/engine/guard-validate', 'POST /api/engine/guard-validate-beta'],
  knowledge: ['POST /api/knowledge/synthesize', 'POST /api/knowledge/chat', 'POST /api/audio/transcribe-mic'],
  githubGuards: ['POST /api/guard/github-import', 'POST /api/guard/github-execute'],
  twin: [
    'GET /api/twin/telemetry',
    'POST /api/twin/absorb',
    'POST /api/twin/simulate-counterfactual',
    'GET /api/gemini/usage',
    'GET /api/models',
    'GET /api/learning',
    'POST /api/twin/sync-to-primary',
  ],
  governance: [
    'GET /api/charter',
    'POST /api/charter/assess',
    'POST /api/charter',
    'GET /api/exchange',
    'GET /api/exchange/override-assessment/:seq',
    'POST /api/exchange/owner',
    'POST /api/exchange/system-answer/:id',
  ],
  ledger: ['GET /api/ledger/head', 'GET /api/ledger/verify', 'GET /api/ledger/entries', 'GET /api/ledger/proof/:seq', 'GET /api/doctor'],
};

// Records registrations instead of serving them.
function recorder() {
  const seen: string[] = [];
  const app: any = {
    get: (p: string) => seen.push(`GET ${p}`),
    post: (p: string) => seen.push(`POST ${p}`),
    use: () => assert.fail('route files must not add middleware'),
  };
  return { app, seen };
}

test('each route file registers exactly its endpoints, and no endpoint twice', async () => {
  const all: string[] = [];
  for (const [file, expected] of Object.entries(EXPECTED)) {
    const mod = await import(`../server/routes/${file}.ts`);
    const register = Object.values(mod).find((v) => typeof v === 'function') as (app: any) => void;
    const { app, seen } = recorder();
    register(app);
    assert.deepEqual(seen, expected, file);
    all.push(...seen);
  }
  assert.equal(new Set(all).size, all.length, 'an endpoint is registered twice');
  assert.equal(all.length, 44);
});

test('server.ts registers every route file', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'server.ts'), 'utf8');
  for (const file of Object.keys(EXPECTED)) assert.match(src, new RegExp(`from './server/routes/${file}'`), file);
  assert.doesNotMatch(src, /app\.(get|post)\('\/api/, 'API routes belong in server/routes/');
});
