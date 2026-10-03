import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GeminiUsage, classifyGeminiError, pacificDay, secondsUntilReset } from '../server/geminiUsage';
import { diagnose } from '../server/doctor';
import { SNAPSHOT_FORMAT, buildSnapshot, parseSnapshot } from '../src/utils/snapshot';

const dailyErr = { status: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded for metric generate_content_free_tier_requests, quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier' };
const minuteErr = { status: 429, message: 'RESOURCE_EXHAUSTED: quotaId GenerateRequestsPerMinutePerProjectPerModel-FreeTier' };

test('Google errors are classified from what Google says', () => {
  assert.equal(classifyGeminiError(dailyErr), 'daily-quota');
  assert.equal(classifyGeminiError(minuteErr), 'rate-limit');
  assert.equal(classifyGeminiError(new Error('fetch failed')), 'failed');
  assert.equal(classifyGeminiError({ status: 404, message: 'model not found' }), 'failed');
});

test('the quota day is Pacific and resets at midnight Pacific', () => {
  // 2026-10-04 06:30 UTC is 2026-10-03 23:30 PDT: thirty minutes to the reset.
  const d = new Date('2026-10-04T06:30:00Z');
  assert.equal(pacificDay(d), '2026-10-03');
  assert.equal(secondsUntilReset(d), 30 * 60);
});

test('usage: counts, stops calling a model Google says is exhausted, resets the next Pacific day, persists', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usage-')), 'gemini-usage.json');
  let now = new Date('2026-10-03T20:00:00Z');
  const u = new GeminiUsage(file, () => now);
  u.record('a', 'ok');
  u.record('a', 'ok');
  u.record('a', 'rate-limit', minuteErr);
  assert.equal(u.dailyQuotaReached('a'), false); // a per-minute refusal clears by itself
  u.record('a', 'daily-quota', dailyErr);
  assert.equal(u.dailyQuotaReached('a'), true);

  let r = u.report(['a', 'b'], 20);
  const a = r.models[0];
  assert.deepEqual([a.answered, a.rateLimitRefusals, a.dailyQuotaRefusals], [2, 1, 1]);
  assert.equal(a.usedFraction, 1); // Google's refusal overrides the count
  assert.equal(r.models[1].usedFraction, 0);
  assert.equal(r.allModelsExhausted, false);
  assert.equal(u.report(['a'], null).models[0].usedFraction, 1);
  assert.equal(new GeminiUsage(null).report(['x'], null).models[0].usedFraction, null); // no stated limit: no bar

  // A restart the same day keeps the counts.
  const again = new GeminiUsage(file, () => now);
  assert.equal(again.dailyQuotaReached('a'), true);
  assert.equal(again.report(['a'], 20).models[0].answered, 2);

  // After midnight Pacific everything starts fresh.
  now = new Date('2026-10-04T08:00:00Z');
  assert.equal(again.dailyQuotaReached('a'), false);
  r = again.report(['a'], 20);
  assert.equal(r.day, '2026-10-04');
  assert.equal(r.models[0].answered, 0);
});

test('doctor reports a used-up quota', () => {
  const base = {
    env: { GEMINI_API_KEY: 'x' },
    host: '127.0.0.1',
    signingKeyEphemeral: false,
    ledger: { path: '/x', size: 0, ok: true, problems: [] },
    drift: { n: 0, drifted: false, failureRate: 0, p0: 0.15, logE: 0, threshold: 4.6 },
    charter: { ok: true, problems: [], version: 1 },
  };
  const q = (a: boolean, b: boolean) => ({
    allModelsExhausted: a && b,
    secondsUntilReset: 3 * 3600 + 5 * 60,
    models: [
      { model: 'a', dailyQuotaReached: a, lastRefusalAt: null },
      { model: 'b', dailyQuotaReached: b, lastRefusalAt: null },
    ],
  });
  const find = (d: ReturnType<typeof diagnose>) => d.findings.find((f) => f.check === 'gemini-quota');
  assert.equal(find(diagnose({ ...base, geminiQuota: q(false, false) })), undefined);
  assert.equal(find(diagnose({ ...base, geminiQuota: q(true, false) }))!.severity, 'DEGRADED');
  const all = find(diagnose({ ...base, geminiQuota: q(true, true) }))!;
  assert.equal(all.severity, 'BLOCK');
  assert.match(all.detail, /about 3h 5m/);
});

const memory = { sessionId: 'S1', sessionName: 'n', createdAt: 1, lastActive: 2, memoryLattice: { k: 1 }, historyRuns: [{ id: 'r', timestamp: 1, videoTitle: 't', alignmentScore: 99, boundaryDecision: 'APPROVED' }] };
const video = { id: 'v1', youtubeId: 'v1', title: 'T', channel: 'c', duration: '1:00', url: 'u', rawTranscript: 'hello' };
const playlist = { id: 'P', title: 'My list', description: '', url: '', videos: [video] };

test('snapshot round trip restores the work and never the verdict history', () => {
  const snap = buildSnapshot({ sessionMemory: memory, playlist, activeVideo: video, innershellLogic: { logicId: 'L' } as any, rclAnalysis: null });
  assert.equal(snap.format, SNAPSHOT_FORMAT);
  assert.deepEqual(snap.sessionMemory.historyRuns, []);
  assert.equal(snap.activeVideo, null); // it is in the playlist; stored once

  const p = parseSnapshot(JSON.stringify(snap));
  assert.ok(p.ok && p.kind === 'snapshot');
  if (!(p.ok && p.kind === 'snapshot')) return;
  assert.equal(p.activeVideo?.id, 'v1');
  assert.equal(p.snapshot.innershellLogic?.logicId, 'L');
  assert.match(p.summary, /1 memory keys, playlist "My list" \(1 videos\), synthesized logic/);

  // Verdicts written into the file are dropped on import.
  const forged = { ...snap, sessionMemory: { ...snap.sessionMemory, historyRuns: memory.historyRuns } };
  const f = parseSnapshot(JSON.stringify(forged));
  assert.ok(f.ok && f.kind === 'snapshot' && f.snapshot.sessionMemory.historyRuns.length === 0);
});

test('snapshot import: old memory-only files still work; bad files are refused with a reason', () => {
  const old = parseSnapshot(JSON.stringify(memory));
  assert.ok(old.ok && old.kind === 'memory-only');
  assert.deepEqual(parseSnapshot('not json'), { ok: false, error: 'Not a JSON file.' });
  assert.match((parseSnapshot('[]') as any).error, /expected a JSON object/);
  assert.match((parseSnapshot(JSON.stringify({ format: 'other/v9' })) as any).error, /Unknown snapshot format/);
  const snap = buildSnapshot({ sessionMemory: memory, playlist, activeVideo: video, innershellLogic: null, rclAnalysis: null });
  assert.match((parseSnapshot(JSON.stringify({ ...snap, playlist: { id: 'P', videos: [1] } })) as any).error, /playlist is malformed/);
  assert.match((parseSnapshot(JSON.stringify({ ...snap, sessionMemory: {} })) as any).error, /no valid sessionMemory/);
});
