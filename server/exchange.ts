import crypto from 'crypto';
import { canonicalJson, sha256Hex } from './provenance';
import { assessChange, type GuardSettings } from './charter';

// The exchange between the owner and the system, kept in the run ledger.
//
// Reciprocity, made mechanical:
//   - either party can raise a concern; the other party owes it an answer
//   - every concern, answer and override carries a reason
//   - owner statements are signed with the owner's key (verified here);
//     system statements are written by the server into its signed ledger
//   - neither party changes the guards alone: the system can only propose
//     (a concern with a computed assessment); the owner decides by charter
//   - the owner may override one guard verdict, but only after seeing the
//     system's assessment of it, and the override names that assessment
//
// Nothing here is deleted or edited; an answer or override is a new entry.

export const OWNER_STATEMENT_FORMAT = 'aethershell-owner-statement/v1';
const MAX_AGE_MS = 24 * 3600_000;
const MAX_SKEW_MS = 5 * 60_000;

export type Party = 'owner' | 'system';

export interface OwnerStatement {
  format: typeof OWNER_STATEMENT_FORMAT;
  type: 'concern' | 'answer' | 'override';
  issuedAt: string;
  nonce: string;
  body: Record<string, unknown>;
}

export interface SignedOwnerStatement {
  statement: OwnerStatement;
  ownerSignature: string;
}

export class ExchangeError extends Error {}

interface Entry {
  seq: number;
  at: string;
  kind: string;
  data: Record<string, any>;
}

export function signOwnerStatement(st: OwnerStatement, ownerPrivateKey: crypto.KeyObject): SignedOwnerStatement {
  return { statement: st, ownerSignature: crypto.sign(null, Buffer.from(canonicalJson(st)), ownerPrivateKey).toString('base64') };
}

export function newOwnerStatement(type: OwnerStatement['type'], body: Record<string, unknown>): OwnerStatement {
  return { format: OWNER_STATEMENT_FORMAT, type, issuedAt: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex'), body };
}

function reason(v: unknown, what = 'reason'): string {
  if (typeof v !== 'string' || v.trim().length < 3) throw new ExchangeError(`A ${what} of at least 3 characters is required`);
  return v.trim().slice(0, 4000);
}

// --- reading the exchange out of the ledger ---------------------------------

export interface ExchangeItem {
  id: string; // C-<seq> for concerns
  seq: number;
  at: string;
  from: Party;
  topic: string;
  body: string;
  evidence: unknown;
  answers: { seq: number; at: string; from: Party; decision: string; reason: string; evidence?: unknown }[];
  status: 'awaiting-owner' | 'awaiting-system' | 'answered';
}

export function exchangeEntries(entries: readonly Entry[]) {
  return entries.filter((e) => e.kind === 'exchange');
}

export function concerns(entries: readonly Entry[]): ExchangeItem[] {
  const ex = exchangeEntries(entries);
  const items = new Map<string, ExchangeItem>();
  for (const e of ex) {
    if (e.data.type === 'concern') {
      items.set(`C-${e.seq}`, {
        id: `C-${e.seq}`,
        seq: e.seq,
        at: e.at,
        from: e.data.from,
        topic: e.data.topic,
        body: e.data.body,
        evidence: e.data.evidence ?? null,
        answers: [],
        status: e.data.from === 'system' ? 'awaiting-owner' : 'awaiting-system',
      });
    }
  }
  for (const e of ex) {
    if (e.data.type !== 'answer') continue;
    const item = items.get(e.data.concernId);
    if (!item) continue;
    item.answers.push({ seq: e.seq, at: e.at, from: e.data.from, decision: e.data.decision, reason: e.data.reason, evidence: e.data.evidence });
    // A concern is answered once the OTHER party has answered it.
    if (e.data.from !== item.from) item.status = 'answered';
  }
  return [...items.values()];
}

export function overrides(entries: readonly Entry[]) {
  return exchangeEntries(entries)
    .filter((e) => e.data.type === 'override')
    .map((e) => ({ seq: e.seq, at: e.at, ...e.data }));
}

// --- owner statements ---------------------------------------------------------

export function verifyOwnerStatement(
  sst: SignedOwnerStatement,
  ownerKey: crypto.KeyObject,
  entries: readonly Entry[],
  now = Date.now()
): OwnerStatement {
  const st = sst?.statement;
  if (!st || st.format !== OWNER_STATEMENT_FORMAT) throw new ExchangeError('Not an owner statement');
  if (!['concern', 'answer', 'override'].includes(st.type)) throw new ExchangeError(`Unknown statement type ${String(st.type)}`);
  if (typeof st.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(st.nonce)) throw new ExchangeError('Statement nonce must be 32 hex characters');
  const t = Date.parse(st.issuedAt);
  if (Number.isNaN(t)) throw new ExchangeError('issuedAt must be an ISO date');
  if (t > now + MAX_SKEW_MS) throw new ExchangeError('Statement is dated in the future');
  if (now - t > MAX_AGE_MS) throw new ExchangeError('Statement is older than 24 hours; sign a fresh one');
  let ok = false;
  try {
    ok = crypto.verify(null, Buffer.from(canonicalJson(st)), ownerKey, Buffer.from(String(sst.ownerSignature), 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new ExchangeError('Statement is not signed by the owner key');
  // A signed statement is accepted once: a replay is refused.
  if (exchangeEntries(entries).some((e) => e.data.statementNonce === st.nonce)) {
    throw new ExchangeError('This signed statement has already been recorded');
  }
  return st;
}

// What a single-verdict override would admit, computed from the guard entry.
export function assessOverride(guardEntry: Entry) {
  if (guardEntry.kind !== 'guard') throw new ExchangeError(`Ledger entry ${guardEntry.seq} is not a guard verdict`);
  const d = guardEntry.data;
  const failed: string[] = [];
  if (d.failureMode === 'CHANNEL_DRIFT') {
    failed.push(
      `signature/decompression (signature ${d.signatureStatus}${d.witnessAgreed === false ? ', implementations disagreed' : ''}): the transcript or logic may not be what was signed`
    );
  }
  if (typeof d.wordDelta === 'number' && typeof d.epsilon === 'number' && d.wordDelta > d.epsilon) {
    failed.push(`lexical grounding: δ ${d.wordDelta} above limit ${d.epsilon} (wording not found in the transcript)`);
  }
  if (d.llmAvailable === false) failed.push('model review did not run (model unavailable)');
  else if (d.modelDecision && d.modelDecision !== 'APPROVED') failed.push(`model review decided ${d.modelDecision}`);
  const assessment = {
    guardSeq: guardEntry.seq,
    evaluator: d.evaluator,
    recordedVerdict: d.passed === true ? 'passed' : 'failed',
    charterVersion: d.charterVersion ?? null,
    failedChecks: d.passed === true ? [] : failed,
    summary:
      d.passed === true
        ? 'The guard passed this run; an override would reject a verdict every check accepted.'
        : failed.length
        ? `Accepting this run would admit: ${failed.join('; ')}.`
        : 'The guard failed this run, but the ledger does not record which check failed.',
  };
  return { assessment, assessmentSha256: sha256Hex(canonicalJson(assessment)) };
}

// Turn a verified owner statement into the ledger record for it.
export function ownerRecord(st: OwnerStatement, entries: readonly Entry[], ownerSignature: string, ownerKeyFingerprint: string): Record<string, unknown> {
  const base = { from: 'owner' as const, statementNonce: st.nonce, statementIssuedAt: st.issuedAt, ownerSignature, ownerKeyFingerprint };
  const b = st.body;
  if (st.type === 'concern') {
    const topic = reason(b.topic, 'topic').slice(0, 200);
    return { ...base, type: 'concern', topic, body: reason(b.body, 'concern text'), evidence: b.evidence ?? null };
  }
  if (st.type === 'answer') {
    const item = concerns(entries).find((c) => c.id === b.concernId);
    if (!item) throw new ExchangeError(`No concern ${String(b.concernId)}`);
    if (item.from === 'owner') throw new ExchangeError('That concern is your own; the system owes it an answer');
    if (!['accepted', 'declined', 'noted'].includes(String(b.decision))) throw new ExchangeError('decision must be accepted, declined or noted');
    return { ...base, type: 'answer', concernId: item.id, decision: b.decision, reason: reason(b.reason) };
  }
  // override
  const seq = Number(b.guardSeq);
  const guard = entries.find((e) => e.seq === seq);
  if (!guard) throw new ExchangeError(`No ledger entry ${String(b.guardSeq)}`);
  const { assessment, assessmentSha256 } = assessOverride(guard);
  if (b.acknowledgedAssessmentSha256 !== assessmentSha256) {
    throw new ExchangeError('The override must acknowledge the current system assessment (fetch it, read it, sign its sha256)');
  }
  if (!['accept', 'reject'].includes(String(b.decision))) throw new ExchangeError('decision must be accept or reject');
  if ((b.decision === 'accept') === (assessment.recordedVerdict === 'passed')) {
    throw new ExchangeError(`The guard already ${assessment.recordedVerdict} this run; nothing to override`);
  }
  if (overrides(entries).some((o: any) => o.guardSeq === seq)) throw new ExchangeError(`Run ${seq} has already been overridden`);
  return { ...base, type: 'override', guardSeq: seq, decision: b.decision, reason: reason(b.reason), assessment, assessmentSha256 };
}

// --- the system's voice -------------------------------------------------------
// Concerns the system raises from the record. Each is computed, cites its
// evidence, and is raised once while open (no duplicate nagging).

export interface SystemConcern {
  topic: string;
  body: string;
  evidence: Record<string, unknown>;
}

export function systemConcernsFromRecord(
  entries: readonly Entry[],
  ctx: { drift: { drifted: boolean; n: number; failureRate: number; p0: number; logE: number; threshold: number }; guard: GuardSettings | null }
): SystemConcern[] {
  const open = new Set(concerns(entries).filter((c) => c.from === 'system' && c.status !== 'answered').map((c) => c.topic));
  const out: SystemConcern[] = [];
  const guards = entries.filter((e) => e.kind === 'guard');

  const disagreements = guards.filter((e) => e.data.witnessAgreed === false);
  if (disagreements.length && !open.has('implementation-disagreement')) {
    out.push({
      topic: 'implementation-disagreement',
      body:
        `Guard Beta's two independent implementations disagreed on ${disagreements.length} run(s). One of them has a bug; ` +
        'until it is found, verdicts on similar inputs cannot be trusted. Please look at the cited runs.',
      evidence: { guardSeqs: disagreements.slice(-10).map((e) => e.seq) },
    });
  }

  if (ctx.drift.drifted && !open.has('guard-failure-drift')) {
    out.push({
      topic: 'guard-failure-drift',
      body:
        `The guard failure rate is ${(ctx.drift.failureRate * 100).toFixed(1)}% over ${ctx.drift.n} runs, credibly above ` +
        `${(ctx.drift.p0 * 100).toFixed(0)}% (log e ${ctx.drift.logE} > ${ctx.drift.threshold}). Either the syntheses got worse, ` +
        'the transcripts changed, or a setting is wrong. I cannot tell which from the record alone.',
      evidence: { drift: ctx.drift },
    });
  }

  // Grounding keeps rejecting what the model review approves: the threshold
  // may be stricter than these transcripts support. The system proposes; it
  // does not change anything.
  const recent = guards.filter((e) => e.data.llmAvailable === true).slice(-20);
  const strictRejections = recent.filter((e) => e.data.failureMode === 'SYNTHESIS_DRIFT' && e.data.modelDecision === 'APPROVED');
  if (ctx.guard && recent.length >= 8 && strictRejections.length / recent.length >= 0.5 && !open.has('grounding-threshold')) {
    const proposed = {
      ...ctx.guard,
      minWordOverlap: Math.max(0, Number((ctx.guard.minWordOverlap - 0.1).toFixed(2))),
      minBigramOverlap: Math.max(0, Number((ctx.guard.minBigramOverlap - 0.05).toFixed(2))),
    };
    const assessment = assessChange(ctx.guard, proposed, recent.map((e) => e.data));
    out.push({
      topic: 'grounding-threshold',
      body:
        `In ${strictRejections.length} of the last ${recent.length} runs the lexical grounding check failed while the model review approved. ` +
        'The thresholds may be stricter than these transcripts support, or the syntheses paraphrase too much. ' +
        `If you want to loosen them, this is what lowering them would do: ${assessment.summary} ` +
        'This is a proposal only; the guards change only by a charter you sign.',
      evidence: { guardSeqs: strictRejections.map((e) => e.seq), proposedGuard: proposed, assessment },
    });
  }
  return out;
}
