import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { inflateSync } from 'node:zlib';

// Guard Beta's own reading of a provenance claim.
//
// server/provenance.ts is how the signer and Guard Alpha check a watermark.
// If Beta reused that code, a bug in it would be vouched for by both guards.
// So this is a second implementation, written separately and differently,
// in the spirit of Dharmapala's witness.py: it shares no code with
// provenance.ts (it does not import it), it serializes JSON with its own
// encoder (including its own string escaping), normalizes transcripts its
// own way, and compares decompressed payloads by bytes and digests rather
// than as strings. The two must agree on every honest input
// (tests/witness.test.ts checks this differentially); a disagreement is a
// refusal, never a tie-break.
//
// What it shares with provenance.ts is the specification (the manifest
// fields, canonical JSON = keys sorted by UTF-16 code unit, no whitespace)
// and the machine: Node's SHA-256, Ed25519 and zlib.

export interface WitnessReading {
  signatureValid: boolean;
  transcriptHashMatch: boolean;
  logicHashMatch: boolean;
  watermarkIdMatch: boolean;
  decompressionMatch: boolean;
  verified: boolean; // all of the above
  reasons: string[];
}

// --- canonical JSON, written from the spec --------------------------------

const HEX = '0123456789abcdef';

function encodeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    switch (code) {
      case 0x22: out += '\\"'; break;
      case 0x5c: out += '\\\\'; break;
      case 0x08: out += '\\b'; break;
      case 0x0c: out += '\\f'; break;
      case 0x0a: out += '\\n'; break;
      case 0x0d: out += '\\r'; break;
      case 0x09: out += '\\t'; break;
      default:
        if (code < 0x20) {
          out += '\\u00' + HEX[code >> 4] + HEX[code & 15];
        } else if (code >= 0xd800 && code <= 0xdfff) {
          // Well-formed surrogate pairs pass through; lone surrogates are
          // escaped (ES2019 well-formed JSON.stringify behaviour).
          const isHigh = code <= 0xdbff;
          const next = s.charCodeAt(i + 1);
          const prev = s.charCodeAt(i - 1);
          const paired = isHigh ? next >= 0xdc00 && next <= 0xdfff : prev >= 0xd800 && prev <= 0xdbff;
          out += paired ? s[i] : '\\u' + code.toString(16).padStart(4, '0');
        } else {
          out += s[i];
        }
    }
  }
  return out + '"';
}

function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) return 'null';
  return Object.is(n, -0) ? '0' : String(n);
}

export function witnessCanonical(v: unknown, inArray = false): string | undefined {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string': return encodeString(v);
    case 'number': return encodeNumber(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'undefined':
    case 'function':
    case 'symbol':
      return inArray ? 'null' : undefined;
    case 'bigint':
      throw new TypeError('BigInt is not representable in canonical JSON');
  }
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) parts.push(witnessCanonical(v[i], true) as string);
    return '[' + parts.join(',') + ']';
  }
  // Plain data only (inputs arrive as parsed JSON): no toJSON handling.
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  for (const k of keys) {
    const enc = witnessCanonical(obj[k]);
    if (enc !== undefined) parts.push(encodeString(k) + ':' + enc);
  }
  return '{' + parts.join(',') + '}';
}

// --- primitives -----------------------------------------------------------

const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

// Line endings to \n, then trim the same whitespace String.prototype.trim does.
const TRIM = /^[\s﻿ ]+|[\s﻿ ]+$/g;
export function witnessNormalize(text: string): string {
  return text.split('\r\n').join('\n').replace(TRIM, '');
}

function logicDigest(logic: unknown): string {
  return digest(typeof logic === 'string' ? logic : (witnessCanonical(logic) ?? 'null'));
}

function bytesInclude(hay: Buffer, needle: Buffer): boolean {
  return needle.length === 0 || hay.indexOf(needle) !== -1;
}

// --- the reading ----------------------------------------------------------

export function witnessRead(
  publicKeyPem: string,
  input: { directTranscript: string; innershellLogic: unknown; watermark?: any; compressedRecord?: any }
): WitnessReading {
  const reasons: string[] = [];
  const wm = input.watermark;
  const m = wm && typeof wm === 'object' ? wm.manifest : undefined;
  const sig = wm && typeof wm.signature === 'string' ? wm.signature : '';

  let signatureValid = false;
  if (!m || !sig) {
    reasons.push('witness: no signed manifest');
  } else {
    try {
      const msg = Buffer.from(witnessCanonical(m) as string, 'utf8');
      signatureValid = edVerify(null, msg, createPublicKey(publicKeyPem), Buffer.from(sig, 'base64'));
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) reasons.push('witness: signature does not verify');
  }

  const transcriptHashMatch = !!m && m.transcriptSha256 === digest(witnessNormalize(String(input.directTranscript ?? '')));
  if (m && !transcriptHashMatch) reasons.push('witness: transcript digest differs from manifest');

  const logicHashMatch = !!m && typeof m.logicSha256 === 'string' && m.logicSha256 === logicDigest(input.innershellLogic);
  if (m && !logicHashMatch) reasons.push('witness: logic digest differs from manifest');

  const watermarkIdMatch = !!m && wm.watermarkId === m.watermarkId;
  if (m && !watermarkIdMatch) reasons.push('witness: watermark id differs from manifest');

  let decompressionMatch = false;
  const b64 = input.compressedRecord?.compressedBase64;
  if (typeof b64 !== 'string' || !b64) {
    reasons.push('witness: no compressed payload');
  } else {
    try {
      const inflated = inflateSync(Buffer.from(b64, 'base64'));
      const expected = typeof wm?.watermarkedText === 'string' ? Buffer.from(wm.watermarkedText, 'utf8') : null;
      const sameAsWatermark = !!expected && digest(inflated) === digest(expected) && inflated.length === expected.length;
      // A transcript that does not survive UTF-8 (lone surrogates) cannot be
      // what the payload holds, whatever the bytes say.
      const norm = witnessNormalize(String(input.directTranscript ?? ''));
      const normBytes = Buffer.from(norm, 'utf8');
      const faithful = normBytes.toString('utf8') === norm;
      if (!faithful) reasons.push('witness: transcript is not well-formed Unicode');
      const holdsTranscript = faithful && bytesInclude(inflated, normBytes);
      const holdsSignature = !!sig && bytesInclude(inflated, Buffer.from(`ED25519_SIGNATURE: ${sig}\n`, 'utf8'));
      decompressionMatch = sameAsWatermark && holdsTranscript && holdsSignature;
      if (!sameAsWatermark) reasons.push('witness: inflated payload is not the watermarked text');
      if (!holdsTranscript) reasons.push('witness: inflated payload lacks the transcript');
      if (!holdsSignature) reasons.push('witness: inflated payload lacks the signature line');
    } catch {
      reasons.push('witness: payload does not inflate');
    }
  }

  const verified = signatureValid && transcriptHashMatch && logicHashMatch && watermarkIdMatch && decompressionMatch;
  return { signatureValid, transcriptHashMatch, logicHashMatch, watermarkIdMatch, decompressionMatch, verified, reasons };
}

// Field-by-field agreement between the primary check and the witness.
// Any difference means one implementation is wrong, so it is a refusal.
export function compareWithPrimary(
  primary: { signatureValid: boolean; transcriptHashMatch: boolean; logicHashMatch: boolean; decompression: boolean },
  w: WitnessReading
): { agreesWithPrimary: boolean; disagreements: string[] } {
  const pairs: [string, boolean, boolean][] = [
    ['signature', primary.signatureValid, w.signatureValid],
    ['transcript digest', primary.transcriptHashMatch, w.transcriptHashMatch],
    ['logic digest', primary.logicHashMatch, w.logicHashMatch],
    ['decompression', primary.decompression, w.decompressionMatch],
  ];
  const disagreements = pairs.filter(([, a, b]) => a !== b).map(([n, a, b]) => `${n}: primary=${a} witness=${b}`);
  return { agreesWithPrimary: disagreements.length === 0, disagreements };
}
