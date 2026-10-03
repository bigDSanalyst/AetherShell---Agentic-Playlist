import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { canonicalJson, loadSigningKeys } from '../server/provenance';
import { RunLedger, merkleProof, merkleRoot, verifyEntries, verifyMerkleProof } from '../server/runLedger';
import { EProcessDrift, analyzeOutcomes, ledgerDrift } from '../server/eprocess';
import { diagnose } from '../server/doctor';

const keys = loadSigningKeys({});
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aeth-ledger-')), 'ledger.jsonl');

function fill(l: RunLedger, n: number) {
  for (let i = 0; i < n; i++) l.append(i % 2 ? 'guard' : 'bind', { i, passed: i % 3 !== 0 });
}

test('ledger persists, reloads and keeps its chain', () => {
  const p = tmp();
  const a = new RunLedger(keys, p);
  fill(a, 5);
  const b = new RunLedger(keys, p);
  assert.equal(b.size, 5);
  assert.deepEqual(b.verify(), { ok: true, size: 5, problems: [] });
  b.append('guard', { i: 5 });
  assert.equal(new RunLedger(keys, p).size, 6);
});

test('edits, reorders and drops from the middle are detected', () => {
  const p = tmp();
  fill(new RunLedger(keys, p), 4);
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');

  const edited = [...lines];
  const e = JSON.parse(edited[1]);
  e.data.passed = !e.data.passed;
  edited[1] = JSON.stringify(e);
  assert.ok(verifyEntries(edited.map((l) => JSON.parse(l))).problems.some((x) => x.includes('edited')));

  const reordered = [lines[0], lines[2], lines[1], lines[3]].map((l) => JSON.parse(l));
  assert.equal(verifyEntries(reordered).ok, false);

  const dropped = [lines[0], lines[2], lines[3]].map((l) => JSON.parse(l));
  assert.equal(verifyEntries(dropped).ok, false);
});

test('a ledger that fails verification on load refuses new entries', () => {
  const p = tmp();
  fill(new RunLedger(keys, p), 3);
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  const e = JSON.parse(lines[0]);
  e.kind = 'guard';
  lines[0] = JSON.stringify(e);
  fs.writeFileSync(p, lines.join('\n') + '\n');
  const l = new RunLedger(keys, p);
  assert.equal(l.verify().ok, false);
  assert.throws(() => l.append('guard', {}), /failed verification/);
});

test('signed head verifies with the public key and changes when the ledger grows', () => {
  const l = new RunLedger(keys, null);
  fill(l, 3);
  const h1 = l.head();
  assert.ok(crypto.verify(null, Buffer.from(canonicalJson(h1.head)), keys.publicKey, Buffer.from(h1.signature, 'base64')));
  l.append('guard', { x: 1 });
  const h2 = l.head();
  assert.notEqual(h1.head.merkleRoot, h2.head.merkleRoot);
  // A truncated ledger cannot reproduce a head someone has already seen.
  const truncated = l.all().slice(0, 3).map((e) => e.hash);
  assert.equal(merkleRoot(truncated), h1.head.merkleRoot);
  assert.notEqual(merkleRoot(truncated), h2.head.merkleRoot);
});

test('Merkle inclusion proofs verify for every leaf and pin the position', () => {
  for (const n of [1, 2, 3, 5, 8, 13]) {
    const hashes = Array.from({ length: n }, (_, i) => crypto.createHash('sha256').update(String(i)).digest('hex'));
    const root = merkleRoot(hashes);
    for (let i = 0; i < n; i++) {
      const proof = merkleProof(hashes, i);
      assert.ok(verifyMerkleProof(hashes[i], proof, root, n, i), `n=${n} i=${i}`);
      if (n > 1) assert.equal(verifyMerkleProof(hashes[i], proof, root, n, (i + 1) % n), false, 'wrong index must fail');
    }
    assert.equal(verifyMerkleProof('ff'.repeat(32), merkleProof(hashes, 0), root, n, 0), false);
  }
});

test('e-process: no false alarm at the null rate, detects a real rise', () => {
  // Deterministic sequences: 10% failures (below p0=0.15) and 50% failures.
  const low = Array.from({ length: 400 }, (_, i) => i % 10 === 0);
  const high = Array.from({ length: 60 }, (_, i) => i % 2 === 0);
  assert.equal(analyzeOutcomes(low).drifted, false);
  const r = analyzeOutcomes(high);
  assert.equal(r.drifted, true);
  assert.equal(r.direction, 'rising');
  assert.throws(() => new EProcessDrift(0, 0.5, 0.01));
});

test('e-process false-alarm rate stays under alpha on random null data', () => {
  // Seeded LCG so the test is reproducible.
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let alarms = 0;
  const trials = 400;
  for (let t = 0; t < trials; t++) {
    const ep = new EProcessDrift(0.15, 0.5, 0.05);
    let fired = false;
    for (let i = 0; i < 300; i++) fired = ep.update(rand() < 0.15) || fired;
    if (fired) alarms++;
  }
  assert.ok(alarms / trials <= 0.05 + 0.03, `alarm rate ${alarms / trials}`);
});

test('ledger drift ignores model outages and non-guard entries', () => {
  const entries = [
    { kind: 'bind', data: {} },
    ...Array.from({ length: 30 }, () => ({ kind: 'guard', data: { passed: false, llmAvailable: false } })),
    { kind: 'guard', data: { passed: true, llmAvailable: true } },
  ];
  const r = ledgerDrift(entries);
  assert.equal(r.n, 1);
  assert.equal(r.drifted, false);
});

test('doctor names what blocks and what is degraded', () => {
  const r = diagnose({
    env: {},
    host: '0.0.0.0',
    signingKeyEphemeral: true,
    ledger: { path: null, size: 0, ok: true, problems: [] },
    drift: { n: 0, drifted: false, failureRate: 0, p0: 0.15, logE: 0, threshold: 4.6 },
    charter: { ok: false, problems: ['No owner key configured'], version: null },
  });
  assert.equal(r.status, 'BLOCK');
  const by = Object.fromEntries(r.findings.map((f) => [f.check, f.severity]));
  assert.deepEqual(by, { gemini: 'BLOCK', 'signing-key': 'DEGRADED', charter: 'BLOCK', access: 'BLOCK', 'youtube-data-api': 'DEGRADED', ledger: 'DEGRADED', drift: 'ok' });
  const ok = diagnose({
    env: { GEMINI_API_KEY: 'x', YOUTUBE_API_KEY: 'y' },
    host: '127.0.0.1',
    signingKeyEphemeral: false,
    ledger: { path: '/x', size: 3, ok: true, problems: [] },
    drift: { n: 3, drifted: false, failureRate: 0, p0: 0.15, logE: 0, threshold: 4.6 },
    charter: { ok: true, problems: [], version: 1 },
  });
  assert.equal(ok.status, 'ok');
});

