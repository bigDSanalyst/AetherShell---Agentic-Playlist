import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { canonicalJson, loadSigningKeys, normalizeTranscript, verifyProvenance, watermarkAndCompress } from '../server/provenance';
import { compareWithPrimary, witnessCanonical, witnessNormalize, witnessRead } from '../server/witness';

const keys = loadSigningKeys({});
const other = loadSigningKeys({});

// Seeded PRNG so failures reproduce.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const ALPHABET = ['a', 'Z', ' ', '"', '\\', '/', '\n', '\r', '\t', '\b', '\f', '\u0000', '\u001f', '\u007f', 'é', 'ü', '中', '😀', '\ud800', '\udfff', ' ', '﻿', ' '];

function randString(r: () => number, max = 12): string {
  let s = '';
  const n = Math.floor(r() * max);
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return s;
}

const NUMBERS = [0, -0, 1, -1, 0.1, 1e21, 1e-7, 123456789.125, Number.MAX_SAFE_INTEGER, -2.5e-300, NaN, Infinity];

function randValue(r: () => number, depth = 0): unknown {
  const k = Math.floor(r() * (depth > 3 ? 5 : 8));
  switch (k) {
    case 0: return null;
    case 1: return r() < 0.5;
    case 2: return NUMBERS[Math.floor(r() * NUMBERS.length)];
    case 3: return randString(r);
    case 4: return undefined;
    case 5: return Array.from({ length: Math.floor(r() * 4) }, () => randValue(r, depth + 1));
    default: {
      const o: Record<string, unknown> = {};
      for (let i = Math.floor(r() * 5); i > 0; i--) o[randString(r, 6)] = randValue(r, depth + 1);
      return o;
    }
  }
}

test('witness shares no code with provenance.ts', () => {
  const src = fs.readFileSync(new URL('../server/witness.ts', import.meta.url), 'utf8');
  assert.equal(/from\s+['"]\.\/provenance['"]/.test(src), false);
  assert.equal(/canonicalJson|normalizeTranscript|verifyProvenance/.test(src), false);
});

test('canonical JSON: both encoders agree on 3000 random values', () => {
  const r = rng(7);
  for (let i = 0; i < 3000; i++) {
    const v = randValue(r);
    const obj = { v, list: [v, undefined], nested: { b: v, a: [v] } };
    assert.equal(witnessCanonical(obj), canonicalJson(obj), `case ${i}: ${JSON.stringify(obj)}`);
  }
});

test('transcript normalization: both agree on random text', () => {
  const r = rng(11);
  for (let i = 0; i < 3000; i++) {
    const t = randString(r, 30) + (r() < 0.5 ? '\r\n' : '') + randString(r, 10);
    assert.equal(witnessNormalize(t), normalizeTranscript(t), JSON.stringify(t));
  }
});

function bound(logic: unknown, transcript = '[00:00 - 00:30] Captions: agents verify claims\r\n') {
  return watermarkAndCompress(keys, { rawTranscript: transcript, logic });
}

function bothReadings(input: Parameters<typeof verifyProvenance>[1]) {
  const p = verifyProvenance(keys, input);
  const w = witnessRead(keys.publicKeyPem, input);
  const cmp = compareWithPrimary(
    {
      signatureValid: p.cryptographicDetails.signatureValid,
      transcriptHashMatch: p.cryptographicDetails.transcriptHashMatch,
      logicHashMatch: p.cryptographicDetails.logicHashMatch,
      decompression: p.decompressionStatus,
    },
    w
  );
  return { p, w, cmp };
}

test('honest bindings: witness verifies and agrees, over random logic objects', () => {
  const r = rng(23);
  for (let i = 0; i < 200; i++) {
    const logic = { logicId: `L${i}`, summary: randString(r, 40), extra: randValue(r) };
    // Well-formed text only: signing refuses lone surrogates (tested below).
    const transcript = ('[00:00] ' + randString(r, 60) + 'x').replace(/[\ud800-\udfff]/g, '?');
    const { watermark, compressed } = bound(logic, transcript);
    // Round-trip through JSON as the browser would.
    const input = JSON.parse(JSON.stringify({ directTranscript: transcript, innershellLogic: logic, watermark, compressedRecord: compressed }));
    const { p, w, cmp } = bothReadings(input);
    assert.equal(p.watermarkSignatureStatus, 'VERIFIED', `case ${i}`);
    assert.equal(w.verified, true, `case ${i}: ${w.reasons.join('; ')}`);
    assert.deepEqual(cmp, { agreesWithPrimary: true, disagreements: [] });
  }
});

test('tampering: both implementations reject, and agree on why', () => {
  const logic = { logicId: 'L', summary: 'verify claims' };
  const { watermark, compressed } = bound(logic);
  const base = { directTranscript: '[00:00 - 00:30] Captions: agents verify claims', innershellLogic: logic, watermark, compressedRecord: compressed };
  const cases: Record<string, typeof base> = {
    transcript: { ...base, directTranscript: base.directTranscript + ' and more' },
    logic: { ...base, innershellLogic: { ...logic, summary: 'changed' } },
    signature: { ...base, watermark: { ...watermark, signature: watermarkAndCompress(other, { rawTranscript: 'x', logic }).watermark.signature } },
    manifest: { ...base, watermark: { ...watermark, manifest: { ...watermark.manifest, videoId: 'other' } } },
    payload: {
      ...base,
      compressedRecord: { ...compressed, compressedBase64: zlib.deflateSync(Buffer.from(watermark.watermarkedText.replace('agents', 'robots'))).toString('base64') },
    },
    missing: { ...base, watermark: undefined as any, compressedRecord: undefined as any },
  };
  for (const [name, input] of Object.entries(cases)) {
    const { p, w, cmp } = bothReadings(input);
    assert.notEqual(p.watermarkSignatureStatus === 'VERIFIED' && p.decompressionStatus, true, `${name}: primary accepted`);
    assert.equal(w.verified, false, `${name}: witness accepted`);
    assert.deepEqual(cmp.disagreements, [], `${name}: ${cmp.disagreements.join('; ')}`);
  }
});

test('a primary that wrongly accepts is caught as a disagreement', () => {
  const logic = { logicId: 'L', summary: 'verify claims' };
  const { watermark, compressed } = bound(logic);
  const w = witnessRead(keys.publicKeyPem, {
    directTranscript: 'something else entirely',
    innershellLogic: logic,
    watermark,
    compressedRecord: compressed,
  });
  // Simulate a bug in provenance.ts that says everything matches.
  const buggyPrimary = { signatureValid: true, transcriptHashMatch: true, logicHashMatch: true, decompression: true };
  const cmp = compareWithPrimary(buggyPrimary, w);
  assert.equal(cmp.agreesWithPrimary, false);
  assert.ok(cmp.disagreements.some((d) => d.startsWith('transcript digest')));
  assert.ok(cmp.disagreements.some((d) => d.startsWith('decompression')));
});

test('witness rejects a manifest signed by a different key', () => {
  const logic = { a: 1 };
  const b = watermarkAndCompress(other, { rawTranscript: 'hello world', logic });
  const w = witnessRead(keys.publicKeyPem, { directTranscript: 'hello world', innershellLogic: logic, watermark: b.watermark, compressedRecord: b.compressed });
  assert.equal(w.signatureValid, false);
  assert.equal(w.verified, false);
});

test('malformed transcript (lone surrogate): signing refuses, and both checks reject it', () => {
  const logic = { a: 1 };
  assert.throws(() => watermarkAndCompress(keys, { rawTranscript: 'bad \ud800 text', logic }), /well-formed/);
  // A guard input carrying one is rejected by both implementations, consistently.
  const { watermark, compressed } = bound(logic, 'good text');
  const { p, w, cmp } = bothReadings({ directTranscript: 'good text \udfff', innershellLogic: logic, watermark, compressedRecord: compressed });
  assert.equal(p.decompressionStatus, false);
  assert.equal(w.verified, false);
  assert.deepEqual(cmp.disagreements, []);
});
