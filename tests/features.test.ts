import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSigningKeys, verifyProvenance, watermarkAndCompress, hashLogic } from '../server/provenance';
import { parseIsoDuration, parsePlaylistPage } from '../server/youtube';
import { parseModelJson } from '../server/modelJson';
import { buildPlaylistExport, canonicalJson as clientCanonicalJson, sha256Hex } from '../src/utils/playlistExport';
import { youtubeThumbnailUrl } from '../src/utils/youtube';
import type { PlaylistData } from '../src/types';

test('playlist page parsing extracts real ids, titles and durations', () => {
  const data = {
    metadata: { playlistMetadataRenderer: { title: 'My List', description: 'desc' } },
    contents: [
      { playlistVideoRenderer: { videoId: 'Nbwv5wHQoj0', title: { runs: [{ text: 'IMO' }] }, lengthText: { simpleText: '51:56' }, shortBylineText: { runs: [{ text: '3Blue1Brown' }] } } },
      { nested: { playlistVideoRenderer: { videoId: 'GlYgs6v2YfU', title: { simpleText: 'Cross-entropy' }, lengthSeconds: '2031' } } },
      { playlistVideoRenderer: { videoId: 'Nbwv5wHQoj0', title: { simpleText: 'duplicate' } } },
      { playlistVideoRenderer: { videoId: 'not-valid', title: { simpleText: 'bad id' } } },
    ],
  };
  const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
  const listing = parsePlaylistPage(html, 25);
  assert.equal(listing.title, 'My List');
  assert.equal(listing.source, 'youtube-page');
  assert.deepEqual(
    listing.items.map((i) => [i.videoId, i.title, i.duration]),
    [
      ['Nbwv5wHQoj0', 'IMO', '51:56'],
      ['GlYgs6v2YfU', 'Cross-entropy', '33:51'],
    ]
  );
  assert.throws(() => parsePlaylistPage('<html>nothing</html>', 25));
});

test('ISO 8601 durations', () => {
  assert.equal(parseIsoDuration('PT51M56S'), 3116);
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(parseIsoDuration('P1DT1S'), 86401);
  assert.equal(parseIsoDuration('nonsense'), null);
});

test('model JSON parsing tolerates fences but never invents a default', () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Here you go: {"a":1} hope it helps'), { a: 1 });
  assert.equal(parseModelJson('no json here'), undefined);
});

test('client canonical JSON hashes match the server', async () => {
  const logic = { b: [1, { z: 2, y: undefined }], a: 'x', summary: 'ünïcødé' };
  assert.equal(await sha256Hex(clientCanonicalJson(logic)), hashLogic(logic));
});

test('thumbnail URL is derived from a valid video id only', () => {
  assert.equal(youtubeThumbnailUrl('Nbwv5wHQoj0'), 'https://i.ytimg.com/vi/Nbwv5wHQoj0/mqdefault.jpg');
  assert.equal(youtubeThumbnailUrl('akKz2kLzP8"'), null);
  assert.equal(youtubeThumbnailUrl(undefined), null);
});

test('playlist export includes every video, verifies logic hashes, and flags tampering', async () => {
  const keys = loadSigningKeys({});
  const logicA = { logicId: 'A', summary: 'first', workflowSteps: [], executableScript: '', expectedOutputs: { verifiedInvariantsCount: 0, stateMutations: {} }, criticalGuardRequirements: [] };
  const logicB = { ...logicA, logicId: 'B', summary: 'second' };
  const t1 = '[00:00 - 00:30] Captions: first video text';
  const t2 = '[00:00 - 00:30] Captions: second video text';
  const b1 = watermarkAndCompress(keys, { rawTranscript: t1, logic: logicA });
  const b2 = watermarkAndCompress(keys, { rawTranscript: t2, logic: logicB });

  const playlist: PlaylistData = {
    id: 'p',
    title: 'P',
    description: '',
    url: 'https://www.youtube.com/playlist?list=PLabcdefghij',
    videos: [
      { id: 'v1', youtubeId: 'Nbwv5wHQoj0', title: 'one', channel: 'c', duration: '1:00', url: 'u1', rawTranscript: t1, watermark: b1.watermark, compressedTranscript: b1.compressed, boundLogic: logicA, uploadDate: '2024-01-02T00:00:00Z' },
      // Logic edited after signing: must be reported as a mismatch.
      { id: 'v2', youtubeId: 'GlYgs6v2YfU', title: 'two', channel: 'c', duration: '2:00', url: 'u2', rawTranscript: t2, watermark: b2.watermark, compressedTranscript: b2.compressed, boundLogic: { ...logicB, summary: 'edited' } },
      { id: 'v3', youtubeId: 'l6DKRf-fAAM', title: 'three', channel: 'c', duration: '3:00', url: 'u3' },
    ],
  };

  const out = await buildPlaylistExport(playlist, { currentLogic: logicB as any });
  assert.equal(out.videos.length, 3);
  assert.deepEqual(out.summary, { videos: 3, signed: 2, notSigned: 1, withCompressedTranscript: 2, logicHashMismatches: 1 });
  assert.equal(out.videos[0].checks.logicSha256MatchesManifest, true);
  assert.equal(out.videos[1].checks.logicSha256MatchesManifest, false);
  assert.equal(out.videos[2].status, 'not_signed');
  assert.equal(out.videos[0].uploadDate, '2024-01-02T00:00:00Z');

  // The exported pieces of video 1 still verify on the server side.
  const v = out.videos[0];
  const r = verifyProvenance(keys, {
    directTranscript: t1,
    innershellLogic: v.synthesizedLogic,
    watermark: { ...v.watermark, watermarkedText: b1.watermark.watermarkedText },
    compressedRecord: v.compressedTranscript,
  });
  assert.equal(r.watermarkSignatureStatus, 'VERIFIED');
  assert.equal(r.decompressionStatus, true);
});
