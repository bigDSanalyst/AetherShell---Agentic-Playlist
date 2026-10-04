import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorpus, collectionId } from '../server/corpus';
import { collectionId as browserCollectionId, mergeIntoSet } from '../src/utils/collection';

const video = (title: string, n: number) => ({
  title,
  segments: Array.from({ length: n }, (_, i) => ({ start: `${i}:00`, end: `${i + 1}:00`, speaker: 'S', text: `line ${i} of ${title} `.padEnd(80, '.') })),
});

test('every video gets a fair share; a long first video no longer crowds out the rest', () => {
  const long = video('long lecture', 500); // ~45k chars
  const short = video('short talk', 10); // ~1k chars
  const { text, coverage } = buildCorpus([long, short, long], 20_000);
  assert.ok(text.length <= 20_000 + 600); // headers and cut notes on top of the budget
  assert.equal(coverage[1].complete, true); // the short one is whole
  assert.equal(coverage[0].complete, false);
  assert.equal(coverage[2].complete, false);
  assert.ok(Math.abs(coverage[0].includedChars - coverage[2].includedChars) < 200); // the long ones share equally
  assert.match(text, /### VIDEO 3: "long lecture"/); // the third video is present
  assert.match(text, /transcript cut here for length: \d+ of \d+ characters included/);
});

test('when everything fits, nothing is cut or marked', () => {
  const { text, coverage } = buildCorpus([video('a', 3), video('b', 3)], 400_000);
  assert.ok(coverage.every((c) => c.complete && c.includedChars === c.totalChars));
  assert.doesNotMatch(text, /cut here/);
  // Segments without an end time (machine or pasted) are not shown with a dangling dash.
  assert.match(buildCorpus([{ title: 'x', segments: [{ start: '40:07', end: '', speaker: 'S', text: 'last' }] }], 1000).text, /\[40:07\] S: last/);
});

test('a set of videos has one id, whichever order they come in, on the server and in the browser', async () => {
  const a = collectionId(['bbbbbbbbbbb', 'aaaaaaaaaaa', 'aaaaaaaaaaa']);
  assert.equal(a, collectionId(['aaaaaaaaaaa', 'bbbbbbbbbbb']));
  assert.match(a, /^collection-[0-9a-f]{16}$/);
  assert.equal(await browserCollectionId(['bbbbbbbbbbb', 'aaaaaaaaaaa']), a);
  assert.notEqual(collectionId(['aaaaaaaaaaa']), a);
});

test('adding to the current set keeps what is already there', async () => {
  const v = (id: string, extra: object = {}) => ({ id: `yt-${id}`, youtubeId: id, title: id, channel: '', duration: '', url: '', ...extra });
  const current = { id: 'video-aaaaaaaaaaa', title: 'First', description: '', url: '', videos: [v('aaaaaaaaaaa', { watermark: { id: 'kept' } })] } as any;
  const incoming = { id: 'p', title: 'Second', description: '', url: '', videos: [v('aaaaaaaaaaa'), v('bbbbbbbbbbb')] } as any;
  const m = await mergeIntoSet(current, incoming);
  assert.deepEqual(m.videos.map((x: any) => x.youtubeId), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  assert.equal((m.videos[0] as any).watermark.id, 'kept');
  assert.equal(m.id, collectionId(['aaaaaaaaaaa', 'bbbbbbbbbbb']));
});
