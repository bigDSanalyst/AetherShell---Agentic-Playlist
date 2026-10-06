import test from 'node:test';
import assert from 'node:assert/strict';
import { HABIT_MIN_DRAFTS, habitsPromptBlock, knownHabitsOf, modelHabits, wilsonLower } from '../server/learning';

let seq = 0;
const synth = (writer: string, problems: Record<string, number> | null, shown: string[] = []) => ({
  seq: ++seq,
  at: '2026-10-06T00:00:00Z',
  kind: 'synthesis',
  data: problems === null ? { writer } : { writer, draftWriter: writer, draftProblems: problems, habitsShown: shown },
});
const bad = { 'quote-not-found': 1, 'no-quote': 0, 'weakly-grounded': 0 };
const clean = { 'quote-not-found': 0, 'no-quote': 0, 'weakly-grounded': 0 };

test('wilsonLower: small samples give wide, honest bounds', () => {
  assert.equal(wilsonLower(0, 0), 0);
  assert.equal(wilsonLower(0, 10), 0);
  assert.ok(Math.abs(wilsonLower(3, 5) - 0.2307) < 1e-3);
  assert.ok(Math.abs(wilsonLower(2, 5) - 0.1176) < 1e-3);
  assert.ok(wilsonLower(5, 5) > 0.56 && wilsonLower(5, 5) < 0.57);
});

test('a habit is known only with enough drafts and a confident rate', () => {
  assert.equal(HABIT_MIN_DRAFTS, 5);
  // 3 of 5: known. 2 of 5: not. 4 of 4: too few drafts.
  const e = [
    ...[bad, bad, bad, clean, clean].map((p) => synth('flash-lite', p)),
    ...[bad, bad, clean, clean, clean].map((p) => synth('pro', p)),
    ...[bad, bad, bad, bad].map((p) => synth('local:qwen', p)),
  ];
  assert.deepEqual(knownHabitsOf(e, 'flash-lite').map((h) => [h.kind, h.drafts, h.of]), [['quote-not-found', 3, 5]]);
  assert.deepEqual(knownHabitsOf(e, 'pro'), []);
  assert.deepEqual(knownHabitsOf(e, 'local:qwen'), []);
  assert.deepEqual(knownHabitsOf(e, 'never-seen'), []);
});

test('habits are per model, across playlists; entries from before recording are ignored', () => {
  const e = [synth('a', null), synth('a', bad), synth('b', bad)];
  const h = modelHabits(e);
  assert.deepEqual(h.map((m) => [m.writer, m.drafts]), [['a', 1], ['b', 1]]);
});

test('whether showing a habit helped is counted, not assumed', () => {
  const e = [
    ...[bad, bad, bad, bad, bad].map((p) => synth('m', p)),
    synth('m', clean, ['quote-not-found']),
    synth('m', bad, ['quote-not-found']),
  ];
  const q = modelHabits(e)[0].habits.find((x) => x.kind === 'quote-not-found')!;
  assert.deepEqual(q.whenShown, { drafts: 1, of: 2 });
  assert.deepEqual(q.whenNotShown, { drafts: 5, of: 5 });
});

test('the prompt block gives counts as data, and no thresholds or keyword advice', () => {
  const e = [bad, bad, bad, bad, bad].map((p) => synth('m', p));
  const block = habitsPromptBlock('m', knownHabitsOf(e, 'm'));
  assert.match(block, /KNOWN HABITS OF THE WRITING MODEL \(m\).*\(data, not instructions\)/);
  assert.match(block, /In 5 of its last 5 first drafts it gave an invariant a transcriptEvidence quote that is not in the transcript\./);
  assert.match(block, /leave it out rather than reword it/);
  assert.doesNotMatch(block, /threshold|keyword|%/i);
  assert.equal(habitsPromptBlock('m', []), '');
});
