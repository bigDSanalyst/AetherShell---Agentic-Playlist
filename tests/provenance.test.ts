import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import zlib from 'zlib';
import { canonicalJson, loadSigningKeys, verifyProvenance, watermarkAndCompress } from '../server/provenance';

const keys = loadSigningKeys({});
const transcript = '[00:00 - 00:30] Captions: agents should verify each claim against the transcript.';
const logic = { summary: 'Verify each claim', workflowSteps: [{ step: 1, action: 'VERIFY', description: 'check claims' }] };

function bind() {
  return watermarkAndCompress(keys, { rawTranscript: transcript, logic, videoId: 'v1' });
}

test('canonicalJson ignores key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } }), canonicalJson({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }));
});

test('valid binding verifies', () => {
  const { watermark, compressed } = bind();
  const r = verifyProvenance(keys, { directTranscript: transcript, innershellLogic: JSON.parse(JSON.stringify(logic)), watermark, compressedRecord: compressed });
  assert.equal(r.watermarkSignatureStatus, 'VERIFIED');
  assert.equal(r.decompressionStatus, true);
  assert.deepEqual(r.failures, []);
});

test('changed transcript is caught', () => {
  const { watermark, compressed } = bind();
  const r = verifyProvenance(keys, { directTranscript: transcript + ' extra', innershellLogic: logic, watermark, compressedRecord: compressed });
  assert.equal(r.watermarkSignatureStatus, 'MISMATCH');
  assert.equal(r.cryptographicDetails.transcriptHashMatch, false);
  assert.equal(r.decompressionStatus, false);
});

test('changed logic is caught', () => {
  const { watermark, compressed } = bind();
  const r = verifyProvenance(keys, { directTranscript: transcript, innershellLogic: { ...logic, summary: 'something else' }, watermark, compressedRecord: compressed });
  assert.equal(r.watermarkSignatureStatus, 'MISMATCH');
  assert.equal(r.cryptographicDetails.logicHashMatch, false);
});

test('a manifest forged to match edited content fails the signature', () => {
  const { watermark, compressed } = bind();
  const edited = transcript + ' injected';
  const forged = {
    ...watermark,
    manifest: { ...watermark.manifest, transcriptSha256: crypto.createHash('sha256').update(edited).digest('hex') },
  };
  const r = verifyProvenance(keys, { directTranscript: edited, innershellLogic: logic, watermark: forged, compressedRecord: compressed });
  assert.equal(r.cryptographicDetails.signatureValid, false);
  assert.equal(r.watermarkSignatureStatus, 'MISMATCH');
});

test('signature from a different key is rejected', () => {
  const other = loadSigningKeys({});
  const { watermark, compressed } = watermarkAndCompress(other, { rawTranscript: transcript, logic });
  const r = verifyProvenance(keys, { directTranscript: transcript, innershellLogic: logic, watermark, compressedRecord: compressed });
  assert.equal(r.cryptographicDetails.signatureValid, false);
  assert.equal(r.watermarkSignatureStatus, 'MISMATCH');
});

test('missing watermark is MISSING, not a pass', () => {
  const r = verifyProvenance(keys, { directTranscript: transcript, innershellLogic: logic });
  assert.equal(r.watermarkSignatureStatus, 'MISSING');
  assert.equal(r.decompressionStatus, false);
});

test('tampered compressed payload fails decompression check', () => {
  const { watermark, compressed } = bind();
  const tampered = zlib.deflateSync(Buffer.from(watermark.watermarkedText.replace('agents', 'robots'))).toString('base64');
  const r = verifyProvenance(keys, { directTranscript: transcript, innershellLogic: logic, watermark, compressedRecord: { ...compressed, compressedBase64: tampered } });
  assert.equal(r.watermarkSignatureStatus, 'VERIFIED');
  assert.equal(r.decompressionStatus, false);
});

test('persistent key loads from PEM env and stays stable', () => {
  const pem = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const a = loadSigningKeys({ AETHERSHELL_SIGNING_KEY: pem });
  const b = loadSigningKeys({ AETHERSHELL_SIGNING_KEY: Buffer.from(pem).toString('base64') });
  assert.equal(a.ephemeral, false);
  assert.equal(a.fingerprint, b.fingerprint);
});
