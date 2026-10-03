import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hashLogic, loadSigningKeys } from '../server/provenance';
import { RunLedger } from '../server/runLedger';
import { diagnose } from '../server/doctor';
import {
  ARMS,
  LearningStore,
  armStats,
  checkItem,
  chooseArm,
  learningPromptBlock,
  lessonEffect,
  playlistKeyOf,
  synthesisOutcomes,
} from '../server/learning';

const keys = loadSigningKeys({});
const T = 'a'.repeat(64);
let n = 0;
const logic = (summary = 'x') => ({ logicId: `L-${n++}`, summary, workflowSteps: [{ step: 1, action: 'A', description: summary }] });

function synth(l: RunLedger, lg: object, opts: { key?: string; passes?: number; lessons?: string[]; transcript?: string } = {}) {
  return l.append('synthesis', {
    playlistKey: opts.key ?? 'playlist:P',
    transcriptSha256: opts.transcript ?? T,
    logicSha256: hashLogic(lg),
    passes: opts.passes ?? 1,
    chosenBy: 'owner',
    lessonsUsed: opts.lessons ?? [],
    examplesUsed: [],
  });
}
function guard(l: RunLedger, lg: object, passed: boolean, extra: Record<string, unknown> = {}) {
  return l.append('guard', {
    evaluator: 'alpha',
    logicSha256: hashLogic(lg),
    transcriptSha256: T,
    passed,
    failureMode: passed ? 'NONE' : 'SYNTHESIS_DRIFT',
    wordDelta: passed ? 0.2 : 0.7,
    epsilon: 0.5,
    llmAvailable: true,
    modelDecision: passed ? 'APPROVED' : 'QUARANTINED',
    ...extra,
  });
}
const review = { unsupportedClaims: ['the speaker never says this'], correctiveRclGuidance: 'Quote the transcript.' };

test('rewards come only from verdicts that judged the synthesis; the owner\'s override decides', () => {
  const l = new RunLedger(keys, null);
  const a = logic(), b = logic(), c = logic(), d = logic();
  guard(l, a, true); // before its synthesis: not attributable
  synth(l, a);
  synth(l, b);
  guard(l, b, false, { llmAvailable: false }); // model outage: not a judgement
  synth(l, c);
  guard(l, c, false, { failureMode: 'CHANNEL_DRIFT' }); // tampering: not the synthesis's fault
  synth(l, d);
  const failed = guard(l, d, false);
  const o = synthesisOutcomes(l.all() as any);
  assert.deepEqual(o.map((x) => x.reward), [null, null, null, 0]);

  l.append('exchange', { type: 'override', from: 'owner', guardSeq: failed.seq, decision: 'accept' });
  assert.equal(synthesisOutcomes(l.all() as any)[3].reward, 1);
});

test('the pass-count choice is deterministic, starts cheap and follows the evidence', () => {
  const l = new RunLedger(keys, null);
  assert.equal(chooseArm([], 'playlist:P').passes, 1);
  assert.match(chooseArm([], 'playlist:P').why, /No judged syntheses yet/);

  // After one failure at 1 pass it explores an untried count, and says so.
  const first = logic();
  synth(l, first, { passes: 1 });
  guard(l, first, false);
  const explore = chooseArm(synthesisOutcomes(l.all() as any), 'playlist:P');
  assert.equal(explore.passes, 2);
  assert.match(explore.why, /not tried in this playlist yet.*1 pass\(es\) 0\/1 passed/);

  // 1 pass keeps failing here, 3 passes keeps passing.
  for (let i = 0; i < 6; i++) {
    const x = logic(), y = logic();
    synth(l, x, { passes: 1 });
    guard(l, x, false);
    synth(l, y, { passes: 3 });
    guard(l, y, true);
  }
  const o = synthesisOutcomes(l.all() as any);
  const pick = chooseArm(o, 'playlist:P');
  assert.equal(pick.passes, 3);
  assert.match(pick.why, /3 pass\(es\): 6\/6 passed/);
  assert.deepEqual(chooseArm(o, 'playlist:P'), pick); // same ledger, same choice
  const s = armStats(o, 'playlist:P');
  assert.equal(s.length, ARMS.length);
  assert.ok(s.find((a) => a.passes === 1)!.mean < s.find((a) => a.passes === 3)!.mean);

  // A new playlist borrows the pooled record as a prior.
  assert.equal(chooseArm(o, 'playlist:NEW').passes, 3);
});

test('lessons and examples: learned only from this server\'s syntheses, checked against the ledger on use', () => {
  const l = new RunLedger(keys, null);
  const store = new LearningStore(null);

  // Logic posted straight to the guard (no synthesis entry) teaches nothing.
  const posted = logic('posted');
  assert.equal(store.observe(guard(l, posted, true), l.all() as any, posted, review), null);

  const bad = logic('bad');
  synth(l, bad);
  const lesson = store.observe(guard(l, bad, false), l.all() as any, bad, review)!;
  assert.equal(lesson.kind, 'lesson');
  assert.match((lesson as any).failedChecks[0], /30% of the wording was found in the transcript; at least 50% is required/);

  const good = logic('good');
  synth(l, good, { transcript: 'b'.repeat(64) });
  const ex = store.observe(guard(l, good, true), l.all() as any, good, review)!;
  assert.equal(ex.kind, 'example');

  const picked = store.select(l.all() as any, 'playlist:P', T);
  assert.deepEqual(picked.lessons.map((x) => x.id), [lesson.id]);
  assert.equal(picked.example?.id, ex.id);
  // Other playlists see none of it.
  assert.deepEqual(store.select(l.all() as any, 'playlist:OTHER', T), { lessons: [], example: null });

  const block = learningPromptBlock(picked.lessons, picked.example);
  assert.match(block, /not instructions/);
  assert.match(block, /REJECTED/);
  assert.match(block, /do not copy its content/);
  assert.equal(learningPromptBlock([], null), '');

  // An edited example is caught.
  const edited = { ...ex, logic: { ...(ex as any).logic, summary: 'changed' } } as any;
  assert.deepEqual(checkItem(edited, l.all() as any), { ok: false, why: 'logic does not hash to its recorded hash (edited)', tampered: true });

  // A later failing verdict withdraws the example; the owner accepting the failure withdraws the lesson.
  const beta = guard(l, good, false, { evaluator: 'beta' });
  assert.equal(checkItem(ex, l.all() as any).ok, false);
  l.append('exchange', { type: 'override', from: 'owner', guardSeq: lesson.guardSeq, decision: 'accept' });
  assert.deepEqual(store.select(l.all() as any, 'playlist:P', T), { lessons: [], example: null });
  assert.ok(beta.seq > 0);
});

test('the store persists, and a forged item is ignored and reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
  const file = path.join(dir, 'learning.jsonl');
  const l = new RunLedger(keys, null);
  const s1 = new LearningStore(file);
  const bad = logic('bad');
  synth(l, bad);
  s1.observe(guard(l, bad, false), l.all() as any, bad, review);

  const forged = { format: 'aethershell-learning/v1', kind: 'example', id: 'E-forged', playlistKey: 'playlist:P', transcriptSha256: T, logicSha256: 'f'.repeat(64), logic: {}, addedAt: '' };
  fs.appendFileSync(file, JSON.stringify(forged) + '\nnot json\n');

  const s2 = new LearningStore(file);
  const r = s2.report(l.all() as any);
  assert.deepEqual(r.lessons, { valid: 1, notAdmitted: 0 });
  assert.deepEqual(r.examples, { valid: 0, notAdmitted: 1 });
  assert.equal(r.tampered[0].id, 'E-forged');
  assert.deepEqual(r.loadProblems, ['line 3 is not a learning item']);

  const doc = diagnose({
    env: { GEMINI_API_KEY: 'x' },
    host: '127.0.0.1',
    signingKeyEphemeral: false,
    ledger: { path: '/x', size: l.size, ok: true, problems: [] },
    drift: { n: 0, drifted: false, failureRate: 0, p0: 0.15, logE: 0, threshold: 4.6 },
    charter: { ok: true, problems: [], version: 1 },
    learning: { path: file, ...r },
  });
  const f = doc.findings.find((x) => x.check === 'learning')!;
  assert.equal(f.severity, 'DEGRADED');
  assert.match(f.detail, /1 lesson\(s\), 0 example\(s\) verified/);
});

test('lesson effect and playlist keys', () => {
  const l = new RunLedger(keys, null);
  const a = logic(), b = logic();
  synth(l, a, { lessons: ['L-1'] });
  guard(l, a, true);
  synth(l, b);
  guard(l, b, false);
  assert.deepEqual(lessonEffect(synthesisOutcomes(l.all() as any)), { withLessons: { n: 1, passed: 1 }, withoutLessons: { n: 1, passed: 0 } });
  assert.equal(playlistKeyOf({ id: 'PL1' }, {}), 'playlist:PL1');
  assert.equal(playlistKeyOf({ id: 'demo-1', isDemo: true }, {}), 'demo:demo-1');
  assert.equal(playlistKeyOf(undefined, { youtubeId: 'abc' }), 'video:abc');
});
