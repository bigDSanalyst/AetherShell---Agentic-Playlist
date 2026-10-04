import test from 'node:test';
import assert from 'node:assert/strict';
import { hashLogic, loadSigningKeys } from '../server/provenance';
import { RunLedger } from '../server/runLedger';
import {
  LearningStore,
  checkItem,
  chooseArm,
  chooseWriter,
  learningPromptBlock,
  lessonEffect,
  modelShells,
  synthesisOutcomes,
  writerOf,
} from '../server/learning';

const keys = loadSigningKeys({});
const T1 = 'a'.repeat(64);
const T2 = 'b'.repeat(64);
let n = 0;
const logic = () => ({ logicId: `L-${n++}`, summary: 's', workflowSteps: [] });

function synth(l: RunLedger, lg: object, writer: string, o: { transcript?: string; passes?: number; lessonWriters?: string[] } = {}) {
  return l.append('synthesis', {
    playlistKey: 'playlist:P',
    transcriptSha256: o.transcript ?? T1,
    logicSha256: hashLogic(lg),
    passes: o.passes ?? 1,
    writer,
    modelsUsed: [writer],
    lessonsUsed: (o.lessonWriters ?? []).map((_, i) => `L-x${i}`),
    lessonWriters: o.lessonWriters ?? [],
    examplesUsed: [],
  });
}
function guard(l: RunLedger, lg: object, passed: boolean, reviewer: string) {
  return l.append('guard', {
    evaluator: 'alpha',
    logicSha256: hashLogic(lg),
    passed,
    failureMode: passed ? 'NONE' : 'SYNTHESIS_DRIFT',
    wordDelta: passed ? 0.2 : 0.7,
    epsilon: 0.5,
    llmAvailable: true,
    modelDecision: passed ? 'APPROVED' : 'QUARANTINED',
    reviewModel: reviewer,
  });
}
const review = { unsupportedClaims: ['x'], correctiveRclGuidance: 'quote it' };

test('the writer of a synthesis: recorded, or the last model that wrote a pass', () => {
  assert.equal(writerOf({ seq: 0, at: '', kind: 'synthesis', data: { writer: 'local:q' } }), 'local:q');
  assert.equal(writerOf({ seq: 0, at: '', kind: 'synthesis', data: { modelsUsed: ['a', 'b'] } }), 'b');
  assert.equal(writerOf({ seq: 0, at: '', kind: 'synthesis', data: {} }), 'unknown');
});

test('every lesson and example names its writer and reviewer, and a false claim is caught', () => {
  const l = new RunLedger(keys, null);
  const store = new LearningStore(null);
  const bad = logic();
  synth(l, bad, 'local:qwen3:8b');
  const lesson: any = store.observe(guard(l, bad, false, 'local:gemma3:12b'), l.all() as any, bad, review);
  assert.equal(lesson.writer, 'local:qwen3:8b');
  assert.equal(lesson.reviewer, 'local:gemma3:12b');
  const good = logic();
  synth(l, good, 'gemini-flash-latest');
  const ex: any = store.observe(guard(l, good, true, 'local:gemma3:12b'), l.all() as any, good, review);
  assert.equal(ex.writer, 'gemini-flash-latest');

  assert.equal(checkItem(lesson, l.all() as any).ok, true);
  const forgedWriter = checkItem({ ...lesson, writer: 'gemini-flash-latest' }, l.all() as any) as any;
  assert.equal(forgedWriter.tampered, true);
  assert.match(forgedWriter.why, /claims writer gemini-flash-latest, the ledger says local:qwen3:8b/);
  const forgedReviewer = checkItem({ ...lesson, reviewer: 'claude' }, l.all() as any) as any;
  assert.match(forgedReviewer.why, /claims reviewer claude/);
  // Items stored before provenance existed carry none, and are still checked on everything else.
  const { writer: _w, reviewer: _r, ...legacy } = lesson;
  assert.equal(checkItem(legacy, l.all() as any).ok, true);

  const block = learningPromptBlock([lesson], ex);
  assert.match(block, /written by local:qwen3:8b, reviewed by local:gemma3:12b/);
  assert.match(block, /written by gemini-flash-latest\)/);
});

test('a writer sees lessons about this transcript first, its own before other models\'', () => {
  const l = new RunLedger(keys, null);
  const store = new LearningStore(null);
  const add = (writer: string, transcript: string) => {
    const lg = logic();
    synth(l, lg, writer, { transcript });
    return store.observe(guard(l, lg, false, 'r'), l.all() as any, lg, review)!.id;
  };
  const otherHere = add('gemini', T1);
  const ownElsewhere = add('qwen', T2);
  const ownHere = add('qwen', T1);
  add('gemini', T2);
  const picked = store.select(l.all() as any, 'playlist:P', T1, 'qwen').lessons.map((x) => x.id);
  assert.deepEqual(picked, [ownHere, otherHere, ownElsewhere]);
  // Gemini writing the same transcript gets its own lesson first.
  assert.equal(store.select(l.all() as any, 'playlist:P', T1, 'gemini').lessons[0].id, otherHere);
});

test('pass counts are learned per writer, borrowing from the other models while a writer is new', () => {
  const l = new RunLedger(keys, null);
  for (let i = 0; i < 5; i++) {
    const a = logic();
    synth(l, a, 'qwen', { passes: 1 });
    guard(l, a, false, 'r');
    const b = logic();
    synth(l, b, 'qwen', { passes: 3 });
    guard(l, b, true, 'r');
    const c = logic();
    synth(l, c, 'gemini', { passes: 1 });
    guard(l, c, true, 'r');
  }
  // qwen has also found that 2 passes is not enough.
  const q2 = logic();
  synth(l, q2, 'qwen', { passes: 2 });
  guard(l, q2, false, 'r');
  const o = synthesisOutcomes(l.all() as any);
  assert.equal(chooseArm(o, 'playlist:P', 'qwen').passes, 3); // qwen needs revision passes
  assert.equal(chooseArm(o, 'playlist:P', 'gemini').passes, 1); // gemini gets it right first time: no dearer exploring
  assert.match(chooseArm(o, 'playlist:P', 'qwen').why, /^qwen: 3 pass\(es\): 5\/5 passed/);
  // A model with no history here starts from what the others did.
  const fresh = chooseArm(o, 'playlist:P', 'claude');
  assert.ok([1, 3].includes(fresh.passes));
});

test('which model writes: the better record wins, the first configured breaks ties, same ledger same answer', () => {
  assert.equal(chooseWriter([], 'playlist:P', []), null);
  const none = chooseWriter([], 'playlist:P', ['local:qwen3:8b', 'gemini-flash-latest'])!;
  assert.equal(none.writer, 'local:qwen3:8b');
  assert.match(none.why, /first configured/);

  const l = new RunLedger(keys, null);
  for (let i = 0; i < 6; i++) {
    const a = logic();
    synth(l, a, 'local:qwen3:8b');
    guard(l, a, i === 0, 'r');
    const b = logic();
    synth(l, b, 'gemini-flash-latest');
    guard(l, b, true, 'r');
  }
  const o = synthesisOutcomes(l.all() as any);
  const pick = chooseWriter(o, 'playlist:P', ['local:qwen3:8b', 'gemini-flash-latest'])!;
  assert.equal(pick.writer, 'gemini-flash-latest');
  assert.match(pick.why, /6\/6 of its syntheses passed/);
  assert.match(pick.why, /local:qwen3:8b 1\/6/);
  assert.deepEqual(chooseWriter(o, 'playlist:P', ['local:qwen3:8b', 'gemini-flash-latest']), pick);
});

test('each model has its own shell: record as writer, as reviewer, and its own lessons', () => {
  const l = new RunLedger(keys, null);
  const store = new LearningStore(null);
  const a = logic();
  synth(l, a, 'qwen');
  store.observe(guard(l, a, false, 'gemma'), l.all() as any, a, review);
  const b = logic();
  synth(l, b, 'gemma');
  store.observe(guard(l, b, true, 'gemma'), l.all() as any, b, review); // gemma reviewed its own writing
  const s = modelShells(l.all() as any, store);
  const qwen = s.asWriter.find((x) => x.model === 'qwen')!;
  assert.deepEqual([qwen.syntheses, qwen.judged, qwen.passed, qwen.lessons, qwen.examples], [1, 1, 0, 1, 0]);
  const gemmaW = s.asWriter.find((x) => x.model === 'gemma')!;
  assert.deepEqual([gemmaW.passed, gemmaW.examples], [1, 1]);
  const gemmaR = s.reviewers.find((x) => x.model === 'gemma')!;
  assert.deepEqual([gemmaR.verdicts, gemmaR.approved, gemmaR.reviewedOwnWriting], [2, 1, 1]);
});

test('lesson effect separates a model\'s own lessons from other models\'', () => {
  const l = new RunLedger(keys, null);
  const a = logic();
  synth(l, a, 'qwen', { lessonWriters: ['qwen'] });
  guard(l, a, true, 'r');
  const b = logic();
  synth(l, b, 'qwen', { lessonWriters: ['gemini'] });
  guard(l, b, false, 'r');
  const e = lessonEffect(synthesisOutcomes(l.all() as any));
  assert.deepEqual(e.withOwnLessons, { n: 1, passed: 1 });
  assert.deepEqual(e.withOnlyOtherModelsLessons, { n: 1, passed: 0 });
});

test('confidence (competing-theorems Theorem 2): Hoeffding radius, runs needed, credible leader', async () => {
  const { hoeffdingRadius, runsNeeded, rateIntervals, credibleLeader } = await import('../server/learning');
  // eps = sqrt(ln(2k/delta) / 2n): one rate, 100 runs, 95% -> ~0.136
  assert.equal(hoeffdingRadius(100, 1), 0.1358);
  assert.equal(hoeffdingRadius(0, 1), null); // no runs, no claim
  // Comparing more options at once widens every interval (union bound).
  assert.ok(hoeffdingRadius(100, 4)! > hoeffdingRadius(100, 1)!);
  // Runs needed for +/-0.1 across 2 options at 95%: ceil(ln(80) / 0.02) = 220
  assert.equal(runsNeeded(0.1, 2), 220);
  assert.ok(runsNeeded(0.05, 2) > runsNeeded(0.1, 2) * 3); // halving eps quadruples the runs
  const iv = rateIntervals([{ key: 'a', n: 10, wins: 8 }, { key: 'b', n: 0, wins: 0 }]);
  assert.deepEqual(iv[1], { key: 'b', n: 0, wins: 0, rate: null, low: null, high: null, epsilon: null });
  assert.ok(iv[0].low! >= 0 && iv[0].high! <= 1 && iv[0].low! < 0.8 && iv[0].high! > 0.8);

  // 6/6 vs 1/6 looks decisive but is not, at 95%, with 6 runs each.
  const small = credibleLeader([{ key: 'gemini', n: 6, wins: 6 }, { key: 'qwen', n: 6, wins: 1 }]);
  assert.equal(small.separated, false);
  assert.match(small.statement, /not yet distinguishable at 95% confidence; separating a gap of 83 points needs about \d+ judged runs each/);
  // With enough runs it is.
  const big = credibleLeader([{ key: 'gemini', n: 200, wins: 190 }, { key: 'qwen', n: 200, wins: 40 }]);
  assert.equal(big.leader, 'gemini');
  assert.match(big.statement, /gemini is credibly best at 95% confidence/);
  assert.match(credibleLeader([{ key: 'x', n: 3, wins: 3 }]).statement, /nothing to compare/);
});
