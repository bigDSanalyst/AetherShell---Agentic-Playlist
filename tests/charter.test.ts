import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_GUARD,
  assessChange,
  charterSha256,
  firstCharter,
  keyFingerprint,
  loadCharterState,
  nextCharter,
  replayRun,
  signCharter,
  validateCharter,
  verifyCharterSignature,
  writeCharterFile,
  type LedgerCharterRecord,
  type SignedCharter,
} from '../server/charter';
import { loadSigningKeys } from '../server/provenance';

const server = loadSigningKeys({});
const owner = crypto.generateKeyPairSync('ed25519');
const intruder = crypto.generateKeyPairSync('ed25519');
const pubB64 = (k: crypto.KeyObject) => Buffer.from(k.export({ type: 'spki', format: 'pem' }).toString()).toString('base64');
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aeth-charter-')), 'charter.json');

function ledgerRecord(sc: SignedCharter, ownerPub: crypto.KeyObject): LedgerCharterRecord {
  return {
    version: sc.charter.version,
    charterSha256: charterSha256(sc.charter),
    ownerKeyFingerprint: keyFingerprint(ownerPub),
    ownerPublicKeyPem: ownerPub.export({ type: 'spki', format: 'pem' }).toString(),
    nextOwnerKeyFingerprint: sc.charter.nextOwnerKeyFingerprint ?? null,
  };
}

function load(file: string, ownerPub: crypto.KeyObject | string | undefined, last: LedgerCharterRecord | null) {
  return loadCharterState({
    ownerPublicKeyRaw: typeof ownerPub === 'string' || ownerPub === undefined ? ownerPub : pubB64(ownerPub),
    serverKeyFingerprint: server.fingerprint,
    charterPath: file,
    lastLedgerCharter: last,
  });
}

test('owner-signed charter loads; signature checks out', () => {
  const file = tmpFile();
  const sc = signCharter(firstCharter('initial settings'), owner.privateKey);
  writeCharterFile(file, sc);
  const st = load(file, owner.publicKey, null);
  assert.equal(st.ok, true, st.problems.join('; '));
  assert.deepEqual(st.signed!.charter.guard, DEFAULT_GUARD);
  assert.ok(verifyCharterSignature(sc, owner.publicKey));
  assert.equal(verifyCharterSignature(sc, intruder.publicKey), false);
});

test('guards stay off without an owner key, a charter, or a valid signature', () => {
  const file = tmpFile();
  assert.match(load(file, undefined, null).problems[0], /No owner key/);
  assert.match(load(file, owner.publicKey, null).problems[0], /No charter/);

  writeCharterFile(file, signCharter(firstCharter('signed by someone else'), intruder.privateKey));
  assert.match(load(file, owner.publicKey, null).problems[0], /does not verify/);

  // Editing a signed charter (loosening a threshold) breaks the signature.
  const sc = signCharter(firstCharter('initial'), owner.privateKey);
  sc.charter.guard.minWordOverlap = 0;
  writeCharterFile(file, sc);
  assert.match(load(file, owner.publicKey, null).problems[0], /does not verify/);
});

test('the server key cannot be the owner key', () => {
  const file = tmpFile();
  const serverPub = Buffer.from(server.publicKeyPem).toString('base64');
  const st = load(file, serverPub, null);
  assert.equal(st.ok, false);
  assert.match(st.problems[0], /server signing key/);
});

test('versions chain: rollback, fork and skipped versions are refused', () => {
  const file = tmpFile();
  const v1 = signCharter(firstCharter('first version'), owner.privateKey);
  const v2 = signCharter(nextCharter(v1.charter, { minWordOverlap: 0.6 }, 'tighten'), owner.privateKey);
  const v3 = signCharter(nextCharter(v2.charter, { minWordOverlap: 0.7 }, 'tighten more'), owner.privateKey);

  // Next version in order: accepted.
  writeCharterFile(file, v2);
  assert.equal(load(file, owner.publicKey, ledgerRecord(v1, owner.publicKey)).ok, true);

  // Rollback to v1 after the ledger accepted v2.
  writeCharterFile(file, v1);
  assert.match(load(file, owner.publicKey, ledgerRecord(v2, owner.publicKey)).problems[0], /rollback/);

  // Skipping v2.
  writeCharterFile(file, v3);
  assert.match(load(file, owner.publicKey, ledgerRecord(v1, owner.publicKey)).problems[0], /skips versions/);

  // A v2 that forks from a different v1.
  const otherV1 = signCharter(firstCharter('different v1'), owner.privateKey);
  const fork = signCharter(nextCharter(otherV1.charter, {}, 'forked version'), owner.privateKey);
  writeCharterFile(file, fork);
  assert.match(load(file, owner.publicKey, ledgerRecord(v1, owner.publicKey)).problems[0], /does not chain/);
});

test('owner key rotation needs the previous key to have named the new one', () => {
  const file = tmpFile();
  const newOwner = crypto.generateKeyPairSync('ed25519');
  const v1 = signCharter(firstCharter('first version'), owner.privateKey);

  // Unauthorized: swap in another key and a charter it signed.
  const swapped = signCharter(nextCharter(v1.charter, { minWordOverlap: 0 }, 'loosen'), intruder.privateKey);
  writeCharterFile(file, swapped);
  assert.match(load(file, intruder.publicKey, ledgerRecord(v1, owner.publicKey)).problems[0], /Owner key changed/);

  // Authorized: v2 (signed by the old key) names the new key; v3 is signed by the new key.
  const v2 = signCharter(
    nextCharter(v1.charter, {}, 'hand over to new key', { nextOwnerKeyFingerprint: keyFingerprint(newOwner.publicKey) }),
    owner.privateKey
  );
  const v3 = signCharter(nextCharter(v2.charter, {}, 'first charter under new key'), newOwner.privateKey);
  writeCharterFile(file, v3);
  const st = load(file, newOwner.publicKey, ledgerRecord(v2, owner.publicKey));
  assert.equal(st.ok, true, st.problems.join('; '));
});

test('charter validation rejects missing reasons, out-of-range values and unknown settings', () => {
  const ok = firstCharter('fine');
  assert.throws(() => validateCharter({ ...ok, reason: '' }), /reason/);
  assert.throws(() => validateCharter({ ...ok, guard: { ...ok.guard, minWordOverlap: 1.5 } }), /minWordOverlap/);
  assert.throws(() => validateCharter({ ...ok, guard: { ...ok.guard, disableEverything: true } }), /unknown guard setting/);
  assert.throws(() => validateCharter({ ...ok, guard: { ...ok.guard, reviewModels: [] } }), /reviewModels/);
  assert.throws(() => validateCharter({ ...ok, version: 2 }), /prevCharterSha256/);
});

test('assessment replays recorded runs and names what loosens', () => {
  const runs = [
    { evaluator: 'alpha', passed: false, failureMode: 'SYNTHESIS_DRIFT', wordDelta: 0.45, llmAvailable: true, modelDecision: 'APPROVED', signatureStatus: 'VERIFIED' }, // 55% grounded
    { evaluator: 'alpha', passed: true, failureMode: 'NONE', wordDelta: 0.3, llmAvailable: true, modelDecision: 'APPROVED', signatureStatus: 'VERIFIED' }, // 70%
    { evaluator: 'alpha', passed: false, failureMode: 'CHANNEL_DRIFT', wordDelta: 0.1, llmAvailable: true, modelDecision: 'APPROVED', signatureStatus: 'MISMATCH' },
    { evaluator: 'beta', passed: false, failureMode: 'FORMAL_INVARIANT_VIOLATION', wordDelta: 0.5, llmAvailable: true, modelDecision: 'QUARANTINED', signatureStatus: 'VERIFIED', witnessAgreed: true },
  ];
  const base = { ...DEFAULT_GUARD, minWordOverlap: 0.6 };
  // Loosen alpha threshold to 0.5: run 1 (55%) would now pass.
  const loosen = assessChange(base, { ...base, minWordOverlap: 0.5 }, runs);
  assert.equal(loosen.wouldNowPass, 1);
  assert.equal(loosen.wouldNowFail, 0);
  assert.ok(loosen.loosens.some((x) => x.startsWith('minWordOverlap')));
  // Tighten to 0.75: run 2 (70%) would now fail.
  const tighten = assessChange(base, { ...base, minWordOverlap: 0.75 }, runs);
  assert.equal(tighten.wouldNowFail, 1);
  assert.deepEqual(tighten.loosens, []);
  // Dropping model approval: the beta run the model quarantined would pass.
  const noLlm = assessChange(base, { ...base, requireLlmApproval: false }, runs);
  assert.equal(noLlm.wouldNowPass, 1);
  assert.ok(noLlm.loosens.includes('requireLlmApproval on → off'));
  // A channel failure never flips.
  assert.equal(replayRun(runs[2], { ...base, minWordOverlap: 0 }), false);
});
