import crypto from 'crypto';
import zlib from 'zlib';

// Provenance binding for transcripts and the logic derived from them.
//
// The server holds an Ed25519 private key. Each binding produces a manifest
// (SHA-256 of the transcript, SHA-256 of the canonical logic JSON, ids,
// timestamp) and an Ed25519 signature over the canonical manifest. Anyone with
// the public key can verify it; nobody without the private key can forge it.
// The key never comes from the client.

export interface ProvenanceManifest {
  v: 1;
  watermarkId: string;
  transcriptSha256: string;
  logicSha256: string | null;
  videoId: string | null;
  playlistId: string | null;
  createdAt: number;
  // How the transcript was obtained, from the server's own ingest record (absent in older manifests).
  transcriptSource?: string;
}

export interface SigningKeys {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  publicKeyPem: string;
  fingerprint: string;
  ephemeral: boolean;
}

export function loadSigningKeys(env: NodeJS.ProcessEnv = process.env): SigningKeys {
  const raw = env.AETHERSHELL_SIGNING_KEY?.trim();
  let privateKey: crypto.KeyObject;
  let ephemeral = false;

  if (raw) {
    // Accept a PEM directly or base64-encoded PEM (easier to put in a secret store).
    const pem = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
    privateKey = crypto.createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('AETHERSHELL_SIGNING_KEY must be an Ed25519 private key');
    }
  } else {
    privateKey = crypto.generateKeyPairSync('ed25519').privateKey;
    ephemeral = true;
  }

  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const fingerprint = sha256Hex(publicKey.export({ type: 'spki', format: 'der' })).slice(0, 32);
  return { privateKey, publicKey, publicKeyPem, fingerprint, ephemeral };
}

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Deterministic JSON: object keys sorted recursively, so the same logic object
// hashes the same regardless of key order after a client round-trip.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v === undefined ? null : v)).join(',') + ']';
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k]));
  return '{' + entries.join(',') + '}';
}

export function normalizeTranscript(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

export class MalformedTextError extends Error {}

export function isWellFormedText(text: string): boolean {
  return Buffer.from(text, 'utf8').toString('utf8') === text;
}

export function hashTranscript(text: string): string {
  return sha256Hex(normalizeTranscript(text));
}

export function hashLogic(logic: unknown): string {
  const str = typeof logic === 'string' ? logic : canonicalJson(logic);
  return sha256Hex(str);
}

export function signManifest(keys: SigningKeys, manifest: ProvenanceManifest): string {
  return crypto.sign(null, Buffer.from(canonicalJson(manifest)), keys.privateKey).toString('base64');
}

export function verifyManifest(keys: SigningKeys, manifest: ProvenanceManifest, signatureB64: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(canonicalJson(manifest)), keys.publicKey, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

// Zero-width steganographic marker. This is a visible-to-tools tag, not a
// security control: it only carries ids so a copied transcript can be traced
// back to its manifest. Integrity comes from the signature.
const ZERO_WIDTH_CHARS = ['​', '‌', '‍', '﻿'];

export function encodeZeroWidth(dataStr: string): string {
  const binary = Array.from(Buffer.from(dataStr, 'utf8'))
    .map((b) => b.toString(2).padStart(8, '0'))
    .join('');
  let encoded = '';
  for (let i = 0; i < binary.length; i += 2) {
    encoded += ZERO_WIDTH_CHARS[parseInt(binary.substring(i, i + 2), 2)];
  }
  return encoded;
}

export interface WatermarkResult {
  watermark: {
    watermarkId: string;
    transcriptHash: string;
    steganographicToken: string;
    signatureAlgorithm: string;
    signedLogicHash: string | null;
    watermarkedAt: number;
    watermarkedText: string;
    manifest: ProvenanceManifest;
    signature: string;
    logicHash: string | null;
    publicKeyFingerprint: string;
  };
  compressed: {
    rawSizeTokens: number;
    rawSizeBytes: number;
    compressedSizeBytes: number;
    compressionRatioPercent: number;
    compressedBase64: string;
    algorithm: string;
    compressedAt: number;
    decompressionVerified: boolean;
  };
}

export function watermarkAndCompress(
  keys: SigningKeys,
  input: { rawTranscript: string; logic?: unknown; videoId?: string; playlistId?: string; transcriptSource?: string },
  now: number = Date.now()
): WatermarkResult {
  // UTF-8 cannot carry a lone surrogate (it becomes U+FFFD), so the compressed
  // copy of such a transcript would not be the transcript. Refuse to sign it.
  if (!isWellFormedText(input.rawTranscript)) {
    throw new MalformedTextError('Transcript is not well-formed Unicode (lone surrogate); refusing to sign');
  }
  const transcriptSha256 = hashTranscript(input.rawTranscript);
  const logicSha256 = input.logic ? hashLogic(input.logic) : null;
  const watermarkId = `WM-${transcriptSha256.slice(0, 16).toUpperCase()}-${now.toString(36).toUpperCase()}`;

  const manifest: ProvenanceManifest = {
    v: 1,
    watermarkId,
    transcriptSha256,
    logicSha256,
    videoId: input.videoId ?? null,
    playlistId: input.playlistId ?? null,
    createdAt: now,
    ...(input.transcriptSource ? { transcriptSource: input.transcriptSource } : {}),
  };
  // The signature covers the logic hash, and is produced before compression.
  const signature = signManifest(keys, manifest);

  const stegoToken = encodeZeroWidth(JSON.stringify({ wmId: watermarkId, tx: transcriptSha256.slice(0, 12) }));
  const header =
    `\n[--- AETHERSHELL PROVENANCE WATERMARK BEGIN ---]\n` +
    `WATERMARK_ID: ${watermarkId}\n` +
    `TRANSCRIPT_SHA256: ${transcriptSha256}\n` +
    `LOGIC_SHA256: ${logicSha256 || 'NO_LOGIC_BOUND'}\n` +
    `ED25519_SIGNATURE: ${signature}\n` +
    `SIGNER_KEY_FINGERPRINT: ${keys.fingerprint}\n` +
    `[--- WATERMARK METADATA END ---]\n`;
  const watermarkedText = header + normalizeTranscript(input.rawTranscript) + `\n${stegoToken}\n[--- WATERMARK END ---]\n`;

  const rawBuffer = Buffer.from(watermarkedText, 'utf8');
  const compressedBuffer = zlib.deflateSync(rawBuffer, { level: 9 });
  const decompressionVerified = zlib.inflateSync(compressedBuffer).equals(rawBuffer);

  return {
    watermark: {
      watermarkId,
      transcriptHash: transcriptSha256,
      steganographicToken: stegoToken,
      signatureAlgorithm: 'Ed25519 over canonical manifest (SHA-256 transcript + logic)',
      signedLogicHash: logicSha256 ? signature : null,
      watermarkedAt: now,
      watermarkedText,
      manifest,
      signature,
      logicHash: logicSha256,
      publicKeyFingerprint: keys.fingerprint,
    },
    compressed: {
      // Rough whitespace-token estimate; not a model tokenizer count.
      rawSizeTokens: Math.round(watermarkedText.split(/\s+/).filter(Boolean).length * 1.33),
      rawSizeBytes: rawBuffer.length,
      compressedSizeBytes: compressedBuffer.length,
      compressionRatioPercent: Math.max(0, Math.round((1 - compressedBuffer.length / rawBuffer.length) * 100)),
      compressedBase64: compressedBuffer.toString('base64'),
      algorithm: 'DEFLATE (zlib, level 9)',
      compressedAt: Date.now(),
      decompressionVerified,
    },
  };
}

export type SignatureStatus = 'VERIFIED' | 'MISMATCH' | 'MISSING';

export interface ProvenanceCheck {
  watermarkSignatureStatus: SignatureStatus;
  decompressionStatus: boolean;
  failures: string[];
  cryptographicDetails: {
    expectedTranscriptHash: string;
    computedTranscriptHash: string;
    signedLogicHashProvided: string | null;
    computedLogicSig: string;
    signedBeforeCompression: boolean;
    signatureValid: boolean;
    transcriptHashMatch: boolean;
    logicHashMatch: boolean;
    expectedLogicHash: string | null;
    computedLogicHash: string;
    signerKeyFingerprint: string;
  };
}

// Verifies everything a client sends back against the server's own key.
// Any missing or mismatched piece makes the check fail; nothing defaults to pass.
export function verifyProvenance(
  keys: SigningKeys,
  input: { directTranscript: string; innershellLogic: unknown; watermark?: any; compressedRecord?: any }
): ProvenanceCheck {
  const failures: string[] = [];
  const computedTranscriptHash = hashTranscript(input.directTranscript);
  const computedLogicHash = hashLogic(input.innershellLogic);
  const wm = input.watermark;
  const manifest: ProvenanceManifest | undefined = wm?.manifest;

  const details: ProvenanceCheck['cryptographicDetails'] = {
    expectedTranscriptHash: manifest?.transcriptSha256 || '',
    computedTranscriptHash,
    signedLogicHashProvided: wm?.signature || null,
    computedLogicSig: '',
    signedBeforeCompression: false,
    signatureValid: false,
    transcriptHashMatch: false,
    logicHashMatch: false,
    expectedLogicHash: manifest?.logicSha256 ?? null,
    computedLogicHash,
    signerKeyFingerprint: keys.fingerprint,
  };

  let status: SignatureStatus;
  if (!wm || !manifest || !wm.signature) {
    status = 'MISSING';
    failures.push('No signed watermark manifest supplied');
  } else {
    details.signatureValid = verifyManifest(keys, manifest, wm.signature);
    details.transcriptHashMatch = manifest.transcriptSha256 === computedTranscriptHash;
    details.logicHashMatch = !!manifest.logicSha256 && manifest.logicSha256 === computedLogicHash;
    const idMatch = wm.watermarkId === manifest.watermarkId;

    if (!details.signatureValid) failures.push('Ed25519 signature does not verify against this server key');
    if (!details.transcriptHashMatch) failures.push('Transcript SHA-256 does not match the signed manifest');
    if (!manifest.logicSha256) failures.push('Manifest has no logic bound to it');
    else if (!details.logicHashMatch) failures.push('Logic SHA-256 does not match the signed manifest (logic changed after signing)');
    if (!idMatch) failures.push('Watermark id does not match the signed manifest');

    const ok = details.signatureValid && details.transcriptHashMatch && details.logicHashMatch && idMatch;
    status = ok ? 'VERIFIED' : 'MISMATCH';
    details.signedBeforeCompression = ok;
    details.computedLogicSig = ok ? wm.signature : '';
  }

  // Decompression must reproduce the exact watermarked text, and that text
  // must contain the exact transcript being audited.
  let decompressionStatus = false;
  if (!input.compressedRecord?.compressedBase64) {
    failures.push('No compressed record supplied');
  } else {
    try {
      const inflated = zlib.inflateSync(Buffer.from(input.compressedRecord.compressedBase64, 'base64')).toString('utf8');
      const matchesWatermark = typeof wm?.watermarkedText === 'string' && inflated === wm.watermarkedText;
      const containsTranscript = inflated.includes(normalizeTranscript(input.directTranscript));
      const headerSigMatches = !!wm?.signature && inflated.includes(`ED25519_SIGNATURE: ${wm.signature}\n`);
      decompressionStatus = matchesWatermark && containsTranscript && headerSigMatches;
      if (!matchesWatermark) failures.push('Decompressed payload differs from the watermarked text');
      if (!containsTranscript) failures.push('Decompressed payload does not contain the audited transcript');
      if (!headerSigMatches) failures.push('Decompressed payload does not carry the manifest signature');
    } catch {
      failures.push('Compressed payload failed to inflate');
    }
  }

  return { watermarkSignatureStatus: status, decompressionStatus, failures, cryptographicDetails: details };
}
