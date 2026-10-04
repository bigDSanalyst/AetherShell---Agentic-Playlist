import test from 'node:test';
import assert from 'node:assert/strict';
import { LatencyStats, transcriptBlock } from '../server/latency';

test('call times are grouped per task, with median, slowest 10% and first-words time', () => {
  const l = new LatencyStats();
  for (const ms of [1000, 2000, 3000, 4000, 10000]) l.record('rcl-pass-1', 'gemini-flash-latest', ms);
  l.record('rcl-pass-2', 'gemini-flash-latest', 2500);
  l.record('chat', 'gemini-flash-lite-latest', 3000, 700);
  const r = l.report();
  const rcl = r.find((x) => x.task === 'rcl-pass')!;
  assert.equal(rcl.calls, 6);
  assert.equal(rcl.medianMs, 3000);
  assert.equal(rcl.p90Ms, 10000);
  assert.equal(rcl.firstTokenMedianMs, null);
  const chat = r.find((x) => x.task === 'chat')!;
  assert.equal(chat.firstTokenMedianMs, 700);
  assert.equal(r[0].task, 'rcl-pass'); // slowest first
});

test('the transcript block is the same opening for the same transcript, and a cut is marked', () => {
  const t = Array.from({ length: 100 }, (_, i) => `[${i}:00] Speaker: sentence ${i}`).join('\n');
  const a = transcriptBlock(t, 1_000_000);
  assert.equal(a.text, transcriptBlock(t, 1_000_000).text); // identical prefix: cacheable
  assert.equal(a.included, a.total);
  assert.doesNotMatch(a.text, /cut here/);
  const b = transcriptBlock(t, 500);
  assert.ok(b.included <= 500 && b.included < b.total);
  assert.match(b.text, /transcript cut here for length: \d+ of \d+ characters included/);
  assert.doesNotMatch(b.text.split('[transcript cut')[0], /sentence 99/); // cut at a line, the tail is not there
});
