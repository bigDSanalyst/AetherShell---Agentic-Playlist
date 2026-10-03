import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { loadSigningKeys } from '../server/provenance';
import { RunLedger } from '../server/runLedger';
import { DEFAULT_GUARD } from '../server/charter';
import {
  ExchangeError,
  assessOverride,
  concerns,
  newOwnerStatement,
  overrides,
  ownerRecord,
  signOwnerStatement,
  systemConcernsFromRecord,
  verifyOwnerStatement,
} from '../server/exchange';

const server = loadSigningKeys({});
const owner = crypto.generateKeyPairSync('ed25519');
const intruder = crypto.generateKeyPairSync('ed25519');
const noDrift = { drifted: false, n: 0, failureRate: 0, p0: 0.15, logE: 0, threshold: 4.6 };

function ledgerWith(guards: Record<string, unknown>[]) {
  const l = new RunLedger(server, null);
  for (const g of guards) l.append('guard', g);
  return l;
}
const failedGrounding = { evaluator: 'alpha', passed: false, failureMode: 'SYNTHESIS_DRIFT', wordDelta: 0.6, epsilon: 0.5, llmAvailable: true, modelDecision: 'APPROVED', signatureStatus: 'VERIFIED' };
const passed = { evaluator: 'alpha', passed: true, failureMode: 'NONE', wordDelta: 0.2, epsilon: 0.5, llmAvailable: true, modelDecision: 'APPROVED', signatureStatus: 'VERIFIED' };

// Submit an owner statement the way the server does.
function submit(l: RunLedger, sst: ReturnType<typeof signOwnerStatement>) {
  const st = verifyOwnerStatement(sst, owner.publicKey, l.all() as any);
  return l.append('exchange', ownerRecord(st, l.all() as any, sst.ownerSignature, 'fp'));
}

test('owner statements: wrong key, replay, stale and future-dated are refused', () => {
  const l = ledgerWith([]);
  const st = newOwnerStatement('concern', { topic: 'quality', body: 'Syntheses feel too generic lately.' });
  assert.throws(() => verifyOwnerStatement(signOwnerStatement(st, intruder.privateKey), owner.publicKey, l.all() as any), /not signed by the owner/);

  const sst = signOwnerStatement(st, owner.privateKey);
  submit(l, sst);
  assert.throws(() => submit(l, sst), /already been recorded/);

  const old = { ...newOwnerStatement('concern', { topic: 'x', body: 'old statement' }), issuedAt: new Date(Date.now() - 48 * 3600_000).toISOString() };
  assert.throws(() => verifyOwnerStatement(signOwnerStatement(old, owner.privateKey), owner.publicKey, l.all() as any), /older than 24 hours/);
  const future = { ...newOwnerStatement('concern', { topic: 'x', body: 'from the future' }), issuedAt: new Date(Date.now() + 3600_000).toISOString() };
  assert.throws(() => verifyOwnerStatement(signOwnerStatement(future, owner.privateKey), owner.publicKey, l.all() as any), /future/);

  // Editing a signed statement breaks it.
  const edited = signOwnerStatement(newOwnerStatement('concern', { topic: 'a', body: 'original text' }), owner.privateKey);
  (edited.statement.body as any).body = 'changed text';
  assert.throws(() => submit(l, edited), /not signed by the owner/);
});

test('concerns are owed answers by the other party', () => {
  const l = ledgerWith([]);
  // Owner raises one: it waits on the system.
  const c = submit(l, signOwnerStatement(newOwnerStatement('concern', { topic: 'quality', body: 'Too generic.' }), owner.privateKey));
  assert.equal(concerns(l.all() as any)[0].status, 'awaiting-system');
  // The owner cannot answer their own concern.
  assert.throws(
    () => submit(l, signOwnerStatement(newOwnerStatement('answer', { concernId: `C-${c.seq}`, decision: 'noted', reason: 'self answer' }), owner.privateKey)),
    /your own/
  );
  // The system answers it.
  l.append('exchange', { type: 'answer', from: 'system', concernId: `C-${c.seq}`, decision: 'noted', reason: 'The record shows 3 runs; too few to judge.' });
  assert.equal(concerns(l.all() as any)[0].status, 'answered');

  // A system concern waits on the owner; an answer needs a reason.
  const sc = l.append('exchange', { type: 'concern', from: 'system', topic: 'guard-failure-drift', body: 'Failure rate rising.', evidence: {} });
  assert.equal(concerns(l.all() as any).find((x) => x.id === `C-${sc.seq}`)!.status, 'awaiting-owner');
  assert.throws(
    () => submit(l, signOwnerStatement(newOwnerStatement('answer', { concernId: `C-${sc.seq}`, decision: 'accepted', reason: '' }), owner.privateKey)),
    /reason/
  );
  submit(l, signOwnerStatement(newOwnerStatement('answer', { concernId: `C-${sc.seq}`, decision: 'accepted', reason: 'Looking into the transcripts.' }), owner.privateKey));
  assert.equal(concerns(l.all() as any).find((x) => x.id === `C-${sc.seq}`)!.status, 'answered');
});

test('an override must acknowledge the current system assessment', () => {
  const l = ledgerWith([failedGrounding, passed]);
  const failedEntry = l.all()[0];
  const { assessment, assessmentSha256 } = assessOverride(failedEntry as any);
  assert.equal(assessment.recordedVerdict, 'failed');
  assert.ok(assessment.failedChecks.some((x) => x.startsWith('lexical grounding')));

  const mk = (body: Record<string, unknown>) => signOwnerStatement(newOwnerStatement('override', body), owner.privateKey);
  // Without (or with a wrong) acknowledgement: refused.
  assert.throws(() => submit(l, mk({ guardSeq: 0, decision: 'accept', reason: 'I read it' })), /acknowledge/);
  assert.throws(() => submit(l, mk({ guardSeq: 0, decision: 'accept', reason: 'I read it', acknowledgedAssessmentSha256: '0'.repeat(64) })), /acknowledge/);
  // Nothing to override: accepting a run that already passed.
  const p = assessOverride(l.all()[1] as any);
  assert.throws(() => submit(l, mk({ guardSeq: 1, decision: 'accept', reason: 'already ok', acknowledgedAssessmentSha256: p.assessmentSha256 })), /already passed/);
  // Properly acknowledged: recorded with the assessment it acknowledged.
  submit(l, mk({ guardSeq: 0, decision: 'accept', reason: 'The paraphrase is faithful; I checked the video.', acknowledgedAssessmentSha256: assessmentSha256 }));
  const o = overrides(l.all() as any);
  assert.equal(o.length, 1);
  assert.equal((o[0] as any).assessmentSha256, assessmentSha256);
  // Once only.
  assert.throws(() => submit(l, mk({ guardSeq: 0, decision: 'accept', reason: 'again', acknowledgedAssessmentSha256: assessmentSha256 })), /already been overridden/);
  // Overriding a non-guard entry is refused.
  assert.throws(() => assessOverride(l.all().at(-1) as any), ExchangeError);
});

test('the system raises concerns from the record, once while open', () => {
  // Grounding rejecting what the model approves, in most recent runs.
  const l = ledgerWith([...Array(6).fill(failedGrounding), ...Array(3).fill(passed)]);
  const ctx = { drift: noDrift, guard: DEFAULT_GUARD };
  const found = systemConcernsFromRecord(l.all() as any, ctx);
  assert.deepEqual(found.map((c) => c.topic), ['grounding-threshold']);
  assert.match(found[0].body, /proposal only/);
  assert.ok((found[0].evidence as any).assessment.loosens.length > 0);

  // Raised once: while it is open, it is not raised again.
  l.append('exchange', { type: 'concern', from: 'system', ...found[0] });
  assert.deepEqual(systemConcernsFromRecord(l.all() as any, ctx), []);

  // Witness disagreement and drift are raised too.
  l.append('guard', { ...passed, evaluator: 'beta', witnessAgreed: false, passed: false, failureMode: 'CHANNEL_DRIFT' });
  const more = systemConcernsFromRecord(l.all() as any, { ...ctx, drift: { ...noDrift, drifted: true, n: 40, failureRate: 0.6, logE: 6 } });
  assert.deepEqual(more.map((c) => c.topic).sort(), ['guard-failure-drift', 'implementation-disagreement']);

  // No charter: no threshold proposal (there is nothing to propose against).
  const l2 = ledgerWith(Array(10).fill(failedGrounding));
  assert.deepEqual(systemConcernsFromRecord(l2.all() as any, { drift: noDrift, guard: null }), []);
});
