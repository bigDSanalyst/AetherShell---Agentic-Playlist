import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { canonicalJson, sha256Hex } from './provenance';

// The guard charter: every setting that decides whether a guard passes,
// signed by the OWNER's key. The server holds only the owner's public key,
// so it can check the owner's signature but never produce one. Without a
// valid charter the guards do not run (fail closed); no environment variable
// can change a guard setting.
//
// Charters form a chain: version n names the SHA-256 of version n-1, so a
// rollback or a skipped version is refused. Every accepted charter is entered
// in the run ledger together with the system's assessment of what it changes.
//
// Owner key rotation: a charter may name `nextOwnerKeyFingerprint`. The
// server accepts a different owner key only if the last charter in the ledger,
// signed by the previous owner key, named it. Anything else blocks the guards.

export const CHARTER_FORMAT = 'aethershell-charter/v1';

export interface GuardSettings {
  minWordOverlap: number; // Guard Alpha: share of content words that must appear in the transcript
  minBigramOverlap: number; // Guard Beta: share of word pairs that must appear in the transcript
  requireLlmApproval: boolean; // the model review must approve
  requireWitness: boolean; // Guard Beta's independent verifier must verify and agree
  reviewModels: string[]; // models allowed to perform the guard review, in order
}

export interface GuardCharter {
  format: typeof CHARTER_FORMAT;
  version: number;
  prevCharterSha256: string | null;
  issuedAt: string;
  reason: string;
  guard: GuardSettings;
  nextOwnerKeyFingerprint?: string | null;
}

export interface SignedCharter {
  charter: GuardCharter;
  ownerSignature: string; // base64 Ed25519 over canonicalJson(charter)
}

export const DEFAULT_GUARD: GuardSettings = {
  minWordOverlap: 0.5,
  minBigramOverlap: 0.2,
  requireLlmApproval: true,
  requireWitness: true,
  reviewModels: ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'],
};

export class CharterError extends Error {}

export function charterSha256(c: GuardCharter): string {
  return sha256Hex(canonicalJson(c));
}

export function keyFingerprint(key: crypto.KeyObject): string {
  return sha256Hex(key.export({ type: 'spki', format: 'der' })).slice(0, 32);
}

export function parsePublicKey(raw: string): crypto.KeyObject {
  const pem = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new CharterError('Owner key must be an Ed25519 public key');
  return key;
}

export function validateCharter(c: any): asserts c is GuardCharter {
  const fail = (m: string) => {
    throw new CharterError(`Invalid charter: ${m}`);
  };
  if (!c || typeof c !== 'object') fail('not an object');
  if (c.format !== CHARTER_FORMAT) fail(`format must be ${CHARTER_FORMAT}`);
  if (!Number.isInteger(c.version) || c.version < 1) fail('version must be a positive integer');
  if (c.version === 1 ? c.prevCharterSha256 !== null : !/^[0-9a-f]{64}$/.test(String(c.prevCharterSha256))) {
    fail('prevCharterSha256 must be null for version 1 and the previous charter hash otherwise');
  }
  if (typeof c.issuedAt !== 'string' || Number.isNaN(Date.parse(c.issuedAt))) fail('issuedAt must be an ISO date');
  if (typeof c.reason !== 'string' || c.reason.trim().length < 3) fail('a reason is required');
  const g = c.guard;
  if (!g || typeof g !== 'object') fail('guard settings missing');
  for (const k of ['minWordOverlap', 'minBigramOverlap'] as const) {
    if (typeof g[k] !== 'number' || !(g[k] >= 0 && g[k] <= 1)) fail(`guard.${k} must be a number in [0, 1]`);
  }
  for (const k of ['requireLlmApproval', 'requireWitness'] as const) {
    if (typeof g[k] !== 'boolean') fail(`guard.${k} must be true or false`);
  }
  if (!Array.isArray(g.reviewModels) || g.reviewModels.length === 0 || g.reviewModels.some((m: unknown) => typeof m !== 'string' || !m)) {
    fail('guard.reviewModels must be a non-empty list of model names');
  }
  const known = new Set(['minWordOverlap', 'minBigramOverlap', 'requireLlmApproval', 'requireWitness', 'reviewModels']);
  for (const k of Object.keys(g)) if (!known.has(k)) fail(`unknown guard setting ${k}`);
  if (c.nextOwnerKeyFingerprint != null && !/^[0-9a-f]{32}$/.test(String(c.nextOwnerKeyFingerprint))) {
    fail('nextOwnerKeyFingerprint must be a 32-hex-character key fingerprint');
  }
}

export function signCharter(charter: GuardCharter, ownerPrivateKey: crypto.KeyObject): SignedCharter {
  validateCharter(charter);
  return { charter, ownerSignature: crypto.sign(null, Buffer.from(canonicalJson(charter)), ownerPrivateKey).toString('base64') };
}

export function verifyCharterSignature(sc: SignedCharter, ownerPublicKey: crypto.KeyObject): boolean {
  try {
    return crypto.verify(null, Buffer.from(canonicalJson(sc.charter)), ownerPublicKey, Buffer.from(String(sc.ownerSignature), 'base64'));
  } catch {
    return false;
  }
}

export function nextCharter(prev: GuardCharter, changes: Partial<GuardSettings>, reason: string, extra: Partial<GuardCharter> = {}): GuardCharter {
  return {
    format: CHARTER_FORMAT,
    version: prev.version + 1,
    prevCharterSha256: charterSha256(prev),
    issuedAt: new Date().toISOString(),
    reason,
    guard: { ...prev.guard, ...changes },
    nextOwnerKeyFingerprint: extra.nextOwnerKeyFingerprint ?? null,
  };
}

export function firstCharter(reason: string, guard: GuardSettings = DEFAULT_GUARD): GuardCharter {
  return { format: CHARTER_FORMAT, version: 1, prevCharterSha256: null, issuedAt: new Date().toISOString(), reason, guard: { ...guard }, nextOwnerKeyFingerprint: null };
}

// --- the system's side of the exchange --------------------------------------
// Before the owner signs a change, the system states what it would do, from
// the record: which past guard verdicts would flip. This is computed, not
// generated. Runs whose outcome depends on data the ledger did not keep are
// reported as not replayable rather than guessed.

export interface GuardRunRecord {
  evaluator?: unknown;
  passed?: unknown;
  failureMode?: unknown;
  signatureStatus?: unknown;
  wordDelta?: unknown;
  llmAvailable?: unknown;
  modelDecision?: unknown;
  witnessAgreed?: unknown;
}

export function replayRun(r: GuardRunRecord, g: GuardSettings): boolean | null {
  if (typeof r.wordDelta !== 'number' || (r.evaluator !== 'alpha' && r.evaluator !== 'beta')) return null;
  // The channel check (signature + decompression) is recorded only as its outcome.
  const channelFailed = r.failureMode === 'CHANNEL_DRIFT';
  if (channelFailed) {
    // A Beta channel failure caused only by the witness could pass without it,
    // but the ledger does not separate the causes well enough to say so.
    if (r.evaluator === 'beta' && !g.requireWitness && r.signatureStatus === 'VERIFIED') return null;
    return false;
  }
  if (r.evaluator === 'beta' && g.requireWitness && r.witnessAgreed === false) return false;
  const ratio = 1 - r.wordDelta;
  const minOverlap = r.evaluator === 'alpha' ? g.minWordOverlap : g.minBigramOverlap;
  // A ratio of 0 can mean "nothing matched" or "nothing to match"; the ledger
  // does not say which, and only a threshold of 0 would care.
  if (ratio <= 0 && minOverlap === 0) return null;
  const grounding = ratio > 0 && ratio + 1e-12 >= minOverlap;
  const llm = r.llmAvailable === true && r.modelDecision === 'APPROVED';
  return grounding && (g.requireLlmApproval ? llm : true);
}

export interface CharterAssessment {
  replayed: number;
  notReplayable: number;
  wouldNowPass: number; // failed under the current charter, would pass under the proposal
  wouldNowFail: number; // passed before, would fail
  unchanged: number;
  loosens: string[]; // settings that make it easier to pass
  tightens: string[];
  summary: string;
}

export function assessChange(current: GuardSettings, proposed: GuardSettings, runs: GuardRunRecord[]): CharterAssessment {
  const loosens: string[] = [];
  const tightens: string[] = [];
  const cmp = (name: string, a: number, b: number) => {
    if (b < a) loosens.push(`${name} ${a} → ${b}`);
    if (b > a) tightens.push(`${name} ${a} → ${b}`);
  };
  cmp('minWordOverlap', current.minWordOverlap, proposed.minWordOverlap);
  cmp('minBigramOverlap', current.minBigramOverlap, proposed.minBigramOverlap);
  for (const k of ['requireLlmApproval', 'requireWitness'] as const) {
    if (current[k] && !proposed[k]) loosens.push(`${k} on → off`);
    if (!current[k] && proposed[k]) tightens.push(`${k} off → on`);
  }
  if (canonicalJson(current.reviewModels) !== canonicalJson(proposed.reviewModels)) {
    loosens.push(`reviewModels changed (${current.reviewModels.join(', ')} → ${proposed.reviewModels.join(', ')}); a different reviewer can judge differently`);
  }

  let replayed = 0, notReplayable = 0, wouldNowPass = 0, wouldNowFail = 0, unchanged = 0;
  for (const r of runs) {
    const after = replayRun(r, proposed);
    const before = typeof r.passed === 'boolean' ? r.passed : null;
    if (after === null || before === null) {
      notReplayable++;
      continue;
    }
    replayed++;
    if (!before && after) wouldNowPass++;
    else if (before && !after) wouldNowFail++;
    else unchanged++;
  }
  const parts = [
    loosens.length ? `Loosens: ${loosens.join('; ')}.` : 'Loosens nothing.',
    tightens.length ? `Tightens: ${tightens.join('; ')}.` : '',
    `Replayed ${replayed} recorded guard run(s): ${wouldNowPass} that failed would now pass, ${wouldNowFail} that passed would now fail, ${unchanged} unchanged` +
      (notReplayable ? `; ${notReplayable} could not be replayed from the record.` : '.'),
  ].filter(Boolean);
  return { replayed, notReplayable, wouldNowPass, wouldNowFail, unchanged, loosens, tightens, summary: parts.join(' ') };
}

// --- loading ----------------------------------------------------------------

export interface CharterState {
  ok: boolean;
  problems: string[];
  signed: SignedCharter | null;
  sha256: string | null;
  ownerKey: crypto.KeyObject | null;
  ownerKeyFingerprint: string | null;
  ownerPublicKeyPem: string | null;
}

export interface LedgerCharterRecord {
  version: number;
  charterSha256: string;
  ownerKeyFingerprint: string;
  ownerPublicKeyPem: string;
  nextOwnerKeyFingerprint: string | null;
}

export function loadCharterState(opts: {
  ownerPublicKeyRaw: string | undefined;
  serverKeyFingerprint: string;
  charterPath: string;
  lastLedgerCharter: LedgerCharterRecord | null;
}): CharterState {
  const st: CharterState = { ok: false, problems: [], signed: null, sha256: null, ownerKey: null, ownerKeyFingerprint: null, ownerPublicKeyPem: null };

  if (!opts.ownerPublicKeyRaw) {
    st.problems.push('No owner key configured (AETHERSHELL_OWNER_PUBLIC_KEY)');
    return st;
  }
  try {
    st.ownerKey = parsePublicKey(opts.ownerPublicKeyRaw);
    st.ownerKeyFingerprint = keyFingerprint(st.ownerKey);
    st.ownerPublicKeyPem = st.ownerKey.export({ type: 'spki', format: 'pem' }).toString();
  } catch (e: any) {
    st.problems.push(`Owner key is not usable: ${e.message}`);
    return st;
  }
  if (st.ownerKeyFingerprint === opts.serverKeyFingerprint) {
    st.problems.push('The owner key is the server signing key; the server could sign as the owner. Use a separate key.');
    return st;
  }

  const last = opts.lastLedgerCharter;
  if (last && last.ownerKeyFingerprint !== st.ownerKeyFingerprint && last.nextOwnerKeyFingerprint !== st.ownerKeyFingerprint) {
    st.problems.push(
      `Owner key changed (${last.ownerKeyFingerprint} → ${st.ownerKeyFingerprint}) without a charter signed by the previous key authorizing it`
    );
    return st;
  }

  if (!fs.existsSync(opts.charterPath)) {
    st.problems.push(`No charter at ${opts.charterPath}`);
    return st;
  }
  let sc: SignedCharter;
  try {
    sc = JSON.parse(fs.readFileSync(opts.charterPath, 'utf8'));
    validateCharter(sc?.charter);
  } catch (e: any) {
    st.problems.push(e instanceof CharterError ? e.message : `Charter file is not valid JSON: ${e.message}`);
    return st;
  }
  if (!verifyCharterSignature(sc, st.ownerKey)) {
    st.problems.push('Charter signature does not verify with the owner key');
    return st;
  }
  const sha = charterSha256(sc.charter);
  if (last && sha !== last.charterSha256) {
    // The file differs from the last charter the ledger accepted: it must be
    // a later version in the same chain, never an older or forked one.
    if (sc.charter.version <= last.version) {
      st.problems.push(`Charter version ${sc.charter.version} is not newer than the ledger's version ${last.version} (rollback or fork)`);
      return st;
    }
    if (sc.charter.version === last.version + 1 && sc.charter.prevCharterSha256 !== last.charterSha256) {
      st.problems.push('Charter does not chain to the last charter in the ledger');
      return st;
    }
    if (sc.charter.version > last.version + 1) {
      st.problems.push(`Charter skips versions (ledger has ${last.version}, file has ${sc.charter.version}); submit each version in order`);
      return st;
    }
  }
  st.signed = sc;
  st.sha256 = sha;
  st.ok = true;
  return st;
}

export function writeCharterFile(p: string, sc: SignedCharter) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(sc, null, 2) + '\n');
}
