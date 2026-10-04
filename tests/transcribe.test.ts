import test from 'node:test';
import assert from 'node:assert/strict';
import { hashTranscript, loadSigningKeys, verifyProvenance, watermarkAndCompress } from '../server/provenance';
import { witnessRead } from '../server/witness';
import { RunLedger } from '../server/runLedger';
import {
  MAX_PROVIDED_CHARS,
  modelTranscribedVideo,
  ownerProvidedVideo,
  parseTimestamp,
  parseTranscription,
  segmentsToRawText,
  transcriptSourceFromLedger,
} from '../server/transcribe';
import type { IngestedVideo } from '../server/youtube';

const base: IngestedVideo = {
  id: 'yt-abcdefghijk',
  youtubeId: 'abcdefghijk',
  title: 't',
  channel: '',
  duration: '',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
  segments: [],
  rawTranscript: '',
  transcriptSource: 'unavailable',
  transcriptError: 'YouTube refused this server',
};

test('timestamps: mm:ss, h:mm:ss, seconds; anything else is rejected', () => {
  assert.equal(parseTimestamp('01:05'), 65);
  assert.equal(parseTimestamp('1:00:01'), 3601);
  assert.equal(parseTimestamp(12.5), 12.5);
  for (const bad of ['', 'abc', '1:2:3:4', '-1:00', null, undefined, -3]) assert.equal(parseTimestamp(bad), null);
});

test('a model transcription is checked, not repaired', () => {
  const good = parseTranscription({ segments: [{ start: '00:00', text: 'Hello and welcome back.' }, { start: '0:12', text: '  Today we  test it. ' }] }, 30) as any;
  assert.deepEqual(
    good.segments.map((s: any) => [s.start, s.end, s.text]),
    [['00:00', '00:12', 'Hello and welcome back.'], ['00:12', '00:30', 'Today we test it.']]
  );
  assert.match((parseTranscription({}) as any).error, /no "segments"/);
  assert.match((parseTranscription({ segments: [] }) as any).error, /heard no speech/);
  assert.match((parseTranscription({ segments: [{ start: 'soon', text: 'x' }] }) as any).error, /no valid start/);
  assert.match((parseTranscription({ segments: [{ start: '01:00', text: 'a long enough line' }, { start: '00:10', text: 'b' }] }) as any).error, /back in time/);
  assert.match((parseTranscription({ segments: [{ start: '05:00', text: 'after the end of it' }] }, 60) as any).error, /after the video ends/);
  assert.match((parseTranscription({ segments: [{ start: '00:00', text: 'hi' }] }) as any).error, /too short/);
});

test('a machine transcription is labelled with its model and method', () => {
  const segs = (parseTranscription({ segments: [{ start: 0, text: 'Everything said in this video.' }] }) as any).segments;
  const v = modelTranscribedVideo(base, segs, 'gemini-flash-latest', new Date('2026-10-04T00:00:00Z'));
  assert.equal(v.transcriptSource, 'model-transcription');
  assert.deepEqual(v.transcriptMethod, { model: 'gemini-flash-latest', via: 'gemini-youtube-url', at: '2026-10-04T00:00:00.000Z' });
  assert.equal(v.transcriptError, undefined);
  assert.equal(v.rawTranscript, '[00:00] Speaker: Everything said in this video.');
  assert.equal(segmentsToRawText([{ id: 'a', start: '00:01', end: '00:02', speaker: 'S', text: 'x' }]), '[00:01 - 00:02] S: x');
});

test('a pasted transcript is owner-provided, keeps its times, and has limits', () => {
  const v = ownerProvidedVideo(base, '0:00 Welcome back to the channel\n0:05 today we look at agents\n\nA paragraph with no time.') as IngestedVideo;
  assert.equal(v.transcriptSource, 'owner-provided');
  assert.equal(v.transcriptMethod?.via, 'pasted by the owner');
  assert.deepEqual(v.segments.map((s) => [s.start, s.text]), [['0:00', 'Welcome back to the channel'], ['0:05', 'today we look at agents'], ['', 'A paragraph with no time.']]);
  assert.match((ownerProvidedVideo(base, 'too short') as any).error, /too short/);
  assert.match((ownerProvidedVideo(base, 'x'.repeat(MAX_PROVIDED_CHARS + 1)) as any).error, /longer than/);
});

test('the source is what the server recorded for this exact text, else unrecorded', () => {
  const keys = loadSigningKeys({});
  const l = new RunLedger(keys, null);
  const a = 'a'.repeat(64);
  assert.deepEqual(transcriptSourceFromLedger(l.all() as any, a), { source: 'unrecorded', model: null });
  l.append('ingest', { videoId: 'v', transcriptSha256: a, source: 'youtube-captions', model: null, via: 'x' });
  l.append('ingest', { videoId: 'v', transcriptSha256: 'b'.repeat(64), source: 'owner-provided', model: null, via: 'x' });
  l.append('ingest', { videoId: 'v', transcriptSha256: a, source: 'model-transcription', model: 'gemini-flash-latest', via: 'x' });
  assert.deepEqual(transcriptSourceFromLedger(l.all() as any, a), { source: 'model-transcription', model: 'gemini-flash-latest' });
  assert.equal(l.verify().ok, true);
});

test('the transcript source is signed: both verifiers accept it, and changing it breaks the signature', () => {
  const keys = loadSigningKeys({});
  const rawTranscript = '[00:00] Speaker: Everything said in this video.';
  const logic = { summary: 's', workflowSteps: [] };
  const { watermark, compressed } = watermarkAndCompress(keys, { rawTranscript, logic, transcriptSource: 'model-transcription:gemini-flash-latest' });
  assert.equal(watermark.manifest.transcriptSource, 'model-transcription:gemini-flash-latest');
  assert.equal(watermark.manifest.transcriptSha256, hashTranscript(rawTranscript));
  const input = { directTranscript: rawTranscript, innershellLogic: logic, watermark, compressedRecord: compressed };
  assert.equal(verifyProvenance(keys, input).watermarkSignatureStatus, 'VERIFIED');
  assert.equal(witnessRead(keys.publicKeyPem, input).verified, true);

  const relabelled = { ...watermark, manifest: { ...watermark.manifest, transcriptSource: 'youtube-captions' } };
  const forged = { ...input, watermark: relabelled };
  assert.notEqual(verifyProvenance(keys, forged).watermarkSignatureStatus, 'VERIFIED');
  assert.equal(witnessRead(keys.publicKeyPem, forged).signatureValid, false);

  // Manifests signed before the field existed carry none, and still verify.
  const old = watermarkAndCompress(keys, { rawTranscript, logic });
  assert.equal('transcriptSource' in old.watermark.manifest, false);
});
