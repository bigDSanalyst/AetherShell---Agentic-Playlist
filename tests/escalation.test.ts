import test from 'node:test';
import assert from 'node:assert/strict';
import { escalationEffect, synthesisOutcomes } from '../server/learning';

let seq = 0;
const synth = (data: Record<string, unknown>) => ({ seq: ++seq, at: '', kind: 'synthesis', data: { playlistKey: 'p', passes: 3, logicSha256: `l${seq}`, ...data } });
const guard = (logic: string, passed: boolean) => ({
  seq: ++seq,
  at: '',
  kind: 'guard',
  data: { logicSha256: logic, passed, evaluator: 'alpha', llmAvailable: true, modelDecision: passed ? 'APPROVED' : 'QUARANTINED' },
});

test('escalation is reported per target, from the ledger alone', () => {
  const e: { seq: number; at: string; kind: string; data: Record<string, unknown> }[] = [
    synth({ escalatedTo: 'pro', problemsAtEnd: 0 }),
    synth({ escalatedTo: 'pro', problemsAtEnd: 2 }),
    synth({ escalatedTo: 'other', problemsAtEnd: 0 }),
    synth({}), // not escalated; and entries from before escalation existed
  ];
  e.push(guard('l1', true), guard('l2', false));
  const r = escalationEffect(synthesisOutcomes(e as any));
  assert.equal(r.runs, 3);
  assert.equal(r.endedWithoutComputedProblems, 2);
  assert.deepEqual([r.judged, r.passed], [2, 1]);
  assert.deepEqual(r.byTarget, [
    { model: 'pro', runs: 2, judged: 2, passed: 1 },
    { model: 'other', runs: 1, judged: 0, passed: 0 },
  ]);
  assert.equal(escalationEffect([]).runs, 0);
});
