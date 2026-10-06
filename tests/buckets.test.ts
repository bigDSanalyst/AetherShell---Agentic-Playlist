import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDIUM_MAX_WORDS,
  SHORT_MAX_WORDS,
  armStats,
  chooseArm,
  lengthBucketOf,
  synthesisOutcomes,
  transcriptWords,
  type LengthBucket,
  type SynthesisOutcome,
} from '../server/learning';

let seq = 0;
const run = (playlistKey: string, lengthBucket: LengthBucket | null, passes: number, passed: boolean): SynthesisOutcome => ({
  seq: ++seq,
  playlistKey,
  transcriptSha256: 't',
  logicSha256: `l${seq}`,
  passes,
  writer: 'w',
  lessonsUsed: [],
  lessonWriters: [],
  examplesUsed: [],
  refine: 'revise',
  passesRun: passes,
  lengthBucket,
  escalatedTo: null,
  problemsAtEnd: null,
  verdicts: [],
  reward: passed ? 1 : 0,
});

test('length buckets by word count', () => {
  assert.equal(transcriptWords('  0:00 Gravity  fills\nthe hole '), 5);
  assert.equal(lengthBucketOf(0), 'short');
  assert.equal(lengthBucketOf(SHORT_MAX_WORDS - 1), 'short');
  assert.equal(lengthBucketOf(SHORT_MAX_WORDS), 'medium');
  assert.equal(lengthBucketOf(MEDIUM_MAX_WORDS), 'medium');
  assert.equal(lengthBucketOf(MEDIUM_MAX_WORDS + 1), 'long');
});

// In playlist P, short transcripts pass with 1 pass; long ones fail with 1 and pass with 3.
const P: SynthesisOutcome[] = [];
for (let i = 0; i < 6; i++) {
  P.push(run('playlist:P', 'short', 1, true));
  P.push(run('playlist:P', 'long', 1, false));
  P.push(run('playlist:P', 'long', 3, true));
}
P.push(run('playlist:P', 'long', 2, false));

test('a short clip is not charged the passes a long panel in the same playlist needs', () => {
  assert.equal(chooseArm(P, 'playlist:P', undefined, 'short').passes, 1);
  const long = chooseArm(P, 'playlist:P', undefined, 'long');
  assert.equal(long.passes, 3);
  assert.equal(long.bucket, 'long');
  assert.match(long.why, /^3 pass\(es\): 6\/6 passed the guards in this playlist's long transcripts \(6\/6 across all playlists on long transcripts\)/);
  // Each bucket's own evidence is only its own runs.
  assert.equal(armStats(P, 'playlist:P', undefined, 'short').find((a) => a.passes === 1)!.n, 6);
  assert.equal(armStats(P, 'playlist:P', undefined, 'long').find((a) => a.passes === 1)!.n, 6);
});

test('a new playlist borrows from the same length in other playlists', () => {
  assert.equal(chooseArm(P, 'playlist:NEW', undefined, 'long').passes, 3);
  assert.equal(chooseArm(P, 'playlist:NEW', undefined, 'short').passes, 1);
  assert.match(chooseArm(P, 'playlist:NEW', undefined, 'medium').why, /No judged syntheses yet on medium transcripts/);
});

test('runs from before lengths were recorded count only in the overall prior; no bucket means the old behaviour', () => {
  const old = [...Array(4)].map(() => run('playlist:R', null, 2, true));
  const all = [...P, ...old];
  assert.ok(armStats(all, 'playlist:R', undefined, 'long').every((a) => a.n === 0));
  assert.equal(armStats(all, 'playlist:R').find((a) => a.passes === 2)!.n, 4);
  assert.equal(chooseArm(all, 'playlist:R').bucket, null);
  // Same ledger, same choice.
  assert.deepEqual(chooseArm(all, 'playlist:P', undefined, 'long'), chooseArm(all, 'playlist:P', undefined, 'long'));
});

test('synthesisOutcomes reads the recorded bucket and ignores anything else', () => {
  const e = (data: Record<string, unknown>) => ({ seq: ++seq, at: '', kind: 'synthesis', data: { playlistKey: 'p', passes: 1, logicSha256: `x${seq}`, ...data } });
  const o = synthesisOutcomes([e({ lengthBucket: 'long' }), e({ lengthBucket: 'huge' }), e({})]);
  assert.deepEqual(o.map((x) => x.lengthBucket), ['long', null, null]);
});
