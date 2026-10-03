import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadSigningKeys } from '../server/provenance';
import { RunLedger } from '../server/runLedger';
import { calendarsAnswered, canonical, coreHash, ledgerHead, parseInfo, staleUnsubmitted, verifyChain, type AnchorEntry } from '../scripts/anchor';

const entry = (seq: number, prev: string | null, manifest = `anchors/${seq}.json`, sha = 'x'): AnchorEntry => ({
  seq, anchor_id: `${seq}`, git_head: 'h', git_tree: 't', manifest, manifest_sha256: sha, prev, status: 'unsubmitted', created: '2026-10-01T00:00:00Z',
});

test('canonical JSON matches Python json.dumps(sort_keys=True, separators=(",", ":"))', () => {
  assert.equal(canonical({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 'é' } }), '{"a":[true,null,"x"],"b":1,"c":{"y":"é","z":1}}');
  // The core hash covers only the core fields: status changes do not break the chain.
  const e = entry(1, null);
  assert.equal(coreHash(e), coreHash({ ...e, status: 'confirmed', height: 9 }));
  assert.notEqual(coreHash(e), coreHash({ ...e, git_head: 'other' }));
});

test('verify catches a broken chain and an edited manifest', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'));
  fs.mkdirSync(path.join(repo, 'anchors'));
  const write = (n: number, body: string) => fs.writeFileSync(path.join(repo, `anchors/${n}.json`), body);
  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  write(1, 'one');
  write(2, 'two');
  const e1 = entry(1, null, 'anchors/1.json', sha('one'));
  const e2 = entry(2, coreHash(e1), 'anchors/2.json', sha('two'));
  const log = path.join(repo, 'anchors/log.jsonl');
  fs.writeFileSync(log, [e1, e2].map((e) => canonical(e) + '\n').join(''));
  assert.equal(verifyChain(repo, log, false), true);

  write(2, 'TWO'); // edited after anchoring
  assert.equal(verifyChain(repo, log, false), false);
  write(2, 'two');
  fs.writeFileSync(log, [e1, { ...e2, prev: 'f'.repeat(64) }].map((e) => canonical(e) + '\n').join('')); // chain cut
  assert.equal(verifyChain(repo, log, false), false);
});

test('an unreachable calendar is "could not look", never "not yet confirmed"', () => {
  const down = { status: 1, stdout: '', stderr: 'Calendar https://alice.btc.calendar.opentimestamps.org: Tunnel connection failed: 403 Forbidden' };
  assert.deepEqual(calendarsAnswered(down), [false, 'https://alice.btc.calendar.opentimestamps.org: Tunnel connection failed: 403 Forbidden']);
  const pending = { status: 1, stdout: '', stderr: 'Calendar https://alice.btc.calendar.opentimestamps.org: Pending confirmation in Bitcoin blockchain' };
  assert.deepEqual(calendarsAnswered(pending), [true, '']);
  assert.deepEqual(calendarsAnswered({ status: 1, stdout: '', stderr: 'Failed! Timestamp not complete' }), [false, 'Failed! Timestamp not complete']);
  assert.deepEqual(calendarsAnswered(null), [false, 'ots was never run']);
});

test('ots info parsing: digest, and the earliest attesting block', () => {
  const info = parseInfo('File sha256 hash: abc123\n BitcoinBlockHeaderAttestation(915200)\n BitcoinBlockHeaderAttestation(915123)');
  assert.deepEqual(info, { digest: 'abc123', confirmed: true, height: 915123 });
  assert.deepEqual(parseInfo('File sha256 hash: abc123\n PendingAttestation(...)'), { digest: 'abc123', confirmed: false, height: null });
});

test('stale unsubmitted anchors need a human', () => {
  const e = entry(1, null);
  assert.deepEqual(staleUnsubmitted([e], new Date('2026-10-10T00:00:00Z')), []);
  assert.deepEqual(staleUnsubmitted([e], new Date('2026-10-20T00:00:00Z')), [1]);
  assert.deepEqual(staleUnsubmitted([{ ...e, status: 'pending' }], new Date('2026-10-20T00:00:00Z')), []);
});

test('the ledger head is anchored only from a ledger that verifies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-ledger-'));
  const file = path.join(dir, 'ledger.jsonl');
  const l = new RunLedger(loadSigningKeys({}), file);
  l.append('guard', { passed: true });
  l.append('guard', { passed: false });
  const h = ledgerHead(file);
  assert.equal(h.size, 2);
  assert.equal(h.lastHash, l.all()[1].hash);
  assert.equal(h.merkleRoot, l.head().head.merkleRoot);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  fs.writeFileSync(file, lines[1] + '\n' + lines[0] + '\n'); // reordered
  assert.throws(() => ledgerHead(file), /fails verification/);
});
