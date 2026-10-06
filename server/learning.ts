import fs from 'fs';
import path from 'path';
import { hashLogic } from './provenance';

// AetherTwin's learning: it ingests what the guards decided about its own
// syntheses and uses that to do the next synthesis better. Three parts:
//
//   lessons   from syntheses the guards rejected: which checks failed and what
//             the model reviewer said was unsupported. Fed to the next synthesis
//             of the same material as data.
//   examples  syntheses that passed every guard that judged them. One is shown
//             to later syntheses in the same playlist as a grounding standard.
//   passes    how many RCL passes to run, chosen per playlist by a bandit over
//             the guard outcomes recorded in the ledger (only when asked: "auto").
//
// What it never does: read or change the charter, relax a guard, or count a
// model outage as a lesson. Everything it uses is checked against the run
// ledger at the moment it is used:
//   - the bandit is computed from ledger entries alone (nothing else to trust);
//   - a lesson or example counts only if the ledger shows THIS server
//     synthesized that logic (a 'synthesis' entry with the same hash) and the
//     guard verdicts on it say what the item claims. Logic someone posted to
//     the guard directly is never learned from.
//   - the owner's overrides win: an accepted failure is not a lesson, a
//     rejected pass is not an example.
// The store file holds the text the ledger only commits to by hash. Deleting
// it loses lessons and examples, not evidence; the bandit is unaffected.
//
// Per-model shells. Each writer model has its own record: its pass rate, the
// lessons from its own rejected syntheses, its own best pass count. The shared
// twin is everything the guards verified, available to every model. Every item
// names its writer and its reviewer (checked against the ledger), so a model
// is shown where each piece of knowledge came from, and one model's habits
// never pass as another's.

export const LEARNING_FORMAT = 'aethershell-learning/v1';
export const ARMS = [1, 2, 3, 4, 5] as const;
// Each extra model pass costs a call and latency; the bandit pays this per pass.
export const PASS_COST = 0.03;
// How much the pooled (all playlists) record counts before a playlist has its own.
export const PRIOR_STRENGTH = 2;
export const MAX_LESSONS = 3;

interface Entry {
  seq: number;
  at: string;
  kind: string;
  data: Record<string, any>;
}

// --- guard outcomes ------------------------------------------------------------

// The model whose output became the synthesis (the last pass's model).
export function writerOf(synth: Entry): string {
  if (typeof synth.data.writer === 'string' && synth.data.writer) return synth.data.writer;
  const used = Array.isArray(synth.data.modelsUsed) ? synth.data.modelsUsed : [];
  return used.length ? String(used[used.length - 1]) : 'unknown';
}

// A verdict says something about synthesis quality only if the model review ran
// (outages are not lessons) and the channel was intact (tampering is not the
// synthesis's fault).
export function judgesSynthesis(g: Entry): boolean {
  return g.kind === 'guard' && g.data.llmAvailable === true && g.data.failureMode !== 'CHANNEL_DRIFT';
}

// The verdict after the owner's word: an override decides.
export function effectiveVerdict(g: Entry, entries: readonly Entry[]): { passed: boolean; overridden: boolean } {
  const o = entries.find((e) => e.kind === 'exchange' && e.data.type === 'override' && e.data.guardSeq === g.seq);
  if (o) return { passed: o.data.decision === 'accept', overridden: true };
  return { passed: g.data.passed === true, overridden: false };
}

export interface SynthesisOutcome {
  seq: number;
  playlistKey: string;
  transcriptSha256: string;
  logicSha256: string;
  passes: number;
  writer: string;
  lessonsUsed: string[];
  lessonWriters: string[]; // the writer of each lesson shown, same order
  examplesUsed: string[];
  refine: 'revise' | 'rci'; // how passes after the first refined (older entries: revise)
  passesRun: number; // fewer than passes when RCI stopped early
  lengthBucket: LengthBucket | null; // null for entries from before lengths were recorded
  escalatedTo: string | null; // the stronger model the run moved up to, if it did
  problemsAtEnd: number | null; // computed problems left in the final pass (null: not recorded)
  verdicts: { seq: number; evaluator: string; reviewer: string | null; passed: boolean; overridden: boolean }[];
  // 1 = every verdict that judged it passed, 0 = at least one failed, null = not judged yet.
  reward: 0 | 1 | null;
}

export function synthesisOutcomes(entries: readonly Entry[]): SynthesisOutcome[] {
  const byLogic = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!judgesSynthesis(e)) continue;
    const k = String(e.data.logicSha256);
    (byLogic.get(k) ?? byLogic.set(k, []).get(k)!).push(e);
  }
  const out: SynthesisOutcome[] = [];
  for (const s of entries) {
    if (s.kind !== 'synthesis') continue;
    const verdicts = (byLogic.get(String(s.data.logicSha256)) ?? [])
      .filter((g) => g.seq > s.seq)
      .map((g) => ({
        seq: g.seq,
        evaluator: String(g.data.evaluator),
        reviewer: typeof g.data.reviewModel === 'string' ? g.data.reviewModel : null,
        ...effectiveVerdict(g, entries),
      }));
    out.push({
      seq: s.seq,
      playlistKey: String(s.data.playlistKey),
      transcriptSha256: String(s.data.transcriptSha256),
      logicSha256: String(s.data.logicSha256),
      passes: Number(s.data.passes),
      writer: writerOf(s),
      lessonsUsed: Array.isArray(s.data.lessonsUsed) ? s.data.lessonsUsed.map(String) : [],
      lessonWriters: Array.isArray(s.data.lessonWriters) ? s.data.lessonWriters.map(String) : [],
      examplesUsed: Array.isArray(s.data.examplesUsed) ? s.data.examplesUsed.map(String) : [],
      refine: s.data.refine === 'rci' ? 'rci' : 'revise',
      passesRun: Number.isFinite(s.data.passesRun) ? Number(s.data.passesRun) : Number(s.data.passes),
      lengthBucket: (LENGTH_BUCKETS as readonly unknown[]).includes(s.data.lengthBucket) ? (s.data.lengthBucket as LengthBucket) : null,
      escalatedTo: typeof s.data.escalatedTo === 'string' ? s.data.escalatedTo : null,
      problemsAtEnd: Number.isFinite(s.data.problemsAtEnd) ? Number(s.data.problemsAtEnd) : null,
      verdicts,
      reward: verdicts.length === 0 ? null : verdicts.every((v) => v.passed) ? 1 : 0,
    });
  }
  return out;
}

// --- pass-count bandit -----------------------------------------------------------

// Transcript length, in three buckets by word count (about 150 spoken words a
// minute): a 5-minute clip and a 2-hour panel need different pass counts, and
// that difference holds across playlists. Fixed numbers, not a guard setting.
export const LENGTH_BUCKETS = ['short', 'medium', 'long'] as const;
export type LengthBucket = (typeof LENGTH_BUCKETS)[number];
export const SHORT_MAX_WORDS = 2250; // about 15 minutes
export const MEDIUM_MAX_WORDS = 9000; // about 60 minutes

export function transcriptWords(transcript: string): number {
  return transcript.split(/\s+/).filter(Boolean).length;
}

export function lengthBucketOf(words: number): LengthBucket {
  return words < SHORT_MAX_WORDS ? 'short' : words <= MEDIUM_MAX_WORDS ? 'medium' : 'long';
}

export interface ArmStat {
  passes: number;
  n: number; // judged syntheses in this playlist at this pass count
  wins: number;
  pooledN: number; // across all playlists
  pooledWins: number;
  mean: number; // posterior mean pass rate (playlist data over a pooled prior)
  bonus: number; // exploration bonus: larger when this arm has few observations
  score: number; // mean + bonus - cost
}

// UCB1 over a Beta posterior whose prior is the pooled record. Deterministic:
// the same ledger always gives the same choice, so a choice can be re-derived
// and audited. Ties go to fewer passes.
//
// With a writer, the arms are that model's own record in this playlist; the
// prior borrows from every model's record here, which in turn borrows from
// everything. A model with little history leans on the others, and its own
// evidence takes over as it accumulates.
export function armStats(outcomes: readonly SynthesisOutcome[], playlistKey: string, writer?: string, bucket?: LengthBucket): ArmStat[] {
  const judged = outcomes.filter((o) => o.reward !== null);
  // With a length bucket, only runs on transcripts of that length are this cell's
  // own evidence; its prior is the same length in every playlist, which in turn
  // borrows from all runs. Older runs without a recorded length count only there.
  const sameLength = bucket ? judged.filter((o) => o.lengthBucket === bucket) : judged;
  const herePlaylist = sameLength.filter((o) => o.playlistKey === playlistKey);
  const here = writer ? herePlaylist.filter((o) => o.writer === writer) : herePlaylist;
  const total = here.length;
  return ARMS.map((passes) => {
    const mine = here.filter((o) => o.passes === passes);
    const everywhere = judged.filter((o) => o.passes === passes);
    const overallMean = (everywhere.filter((o) => o.reward === 1).length + 1) / (everywhere.length + 2);
    const all = sameLength.filter((o) => o.passes === passes);
    const wins = mine.filter((o) => o.reward === 1).length;
    const pooledWins = all.filter((o) => o.reward === 1).length;
    const globalMean = bucket ? (pooledWins + PRIOR_STRENGTH * overallMean) / (all.length + PRIOR_STRENGTH) : overallMean;
    const peers = herePlaylist.filter((o) => o.passes === passes);
    const priorMean = writer
      ? (peers.filter((o) => o.reward === 1).length + PRIOR_STRENGTH * globalMean) / (peers.length + PRIOR_STRENGTH)
      : globalMean;
    const mean = (wins + PRIOR_STRENGTH * priorMean) / (mine.length + PRIOR_STRENGTH);
    const bonus = Math.sqrt((2 * Math.log(total + 2)) / (mine.length + PRIOR_STRENGTH)) / 2;
    // Optimism is capped at a 100% pass rate: a dearer pass count is never explored
    // while a cheaper one is already as good as it can be.
    const score = Math.min(1, mean + bonus) - PASS_COST * (passes - 1);
    return { passes, n: mine.length, wins, pooledN: all.length, pooledWins, mean: r4(mean), bonus: r4(bonus), score: r4(score) };
  });
}

export function chooseArm(outcomes: readonly SynthesisOutcome[], playlistKey: string, writer?: string, bucket?: LengthBucket) {
  const stats = armStats(outcomes, playlistKey, writer, bucket);
  const best = stats.reduce((a, b) => (b.score > a.score ? b : a));
  const judgedHere = stats.reduce((s, a) => s + a.n, 0);
  const tried = stats.filter((a) => a.n > 0).map((a) => `${a.passes} pass(es) ${a.wins}/${a.n}`);
  const where = bucket ? `this playlist's ${bucket} transcripts` : 'this playlist';
  const pooled = best.pooledN ? ` (${best.pooledWins}/${best.pooledN} across all playlists${bucket ? ` on ${bucket} transcripts` : ''})` : '';
  const why =
    judgedHere === 0 && best.pooledN === 0
      ? `No judged syntheses yet${bucket ? ` on ${bucket} transcripts` : ''}; starting at ${best.passes} pass(es), the cheapest option, and learning from the guards' verdicts.`
      : best.n === 0
      ? `${best.passes} pass(es): not tried in ${where} yet${pooled}; exploring it because what has been tried here is uncertain or failing` +
        (tried.length ? ` (${tried.join(', ')} passed).` : '.')
      : `${best.passes} pass(es): ${best.wins}/${best.n} passed the guards in ${where}${pooled};` +
        ` estimated pass rate ${Math.round(best.mean * 100)}%, exploration bonus ${best.bonus}, cost ${r4(PASS_COST * (best.passes - 1))}.` +
        ` Highest score of ${stats.length} options.`;
  return { passes: best.passes, bucket: bucket ?? null, why: writer ? `${writer}: ${why}` : why, stats };
}

// --- how sure: Hoeffding confidence over k compared rates ---------------------------
//
// The bandit above chooses; this says how much the record can be trusted. It is
// the confidence half of the owner's "competing theorems" Theorem 2: telling the
// best of m options apart to within eps with probability 1 - delta takes on the
// order of (m / eps^2) log(1/delta) judged runs (the PAC best-arm bound, Even-Dar,
// Mannor & Mansour 2002). Hoeffding's inequality with a union bound over the k
// rates compared: with probability at least 1 - delta, every observed pass rate
// is within eps = sqrt(ln(2k/delta) / (2n)) of the true one. Reported, never
// used to decide: the choices stay with the bandit.

export const CONFIDENCE_DELTA = 0.05;

export function hoeffdingRadius(n: number, k: number, delta = CONFIDENCE_DELTA): number | null {
  if (n <= 0) return null;
  return r4(Math.sqrt(Math.log((2 * Math.max(1, k)) / delta) / (2 * n)));
}

// Judged runs each rate needs before its interval is +/- eps wide.
export function runsNeeded(eps: number, k: number, delta = CONFIDENCE_DELTA): number {
  return Math.ceil(Math.log((2 * Math.max(1, k)) / delta) / (2 * eps * eps));
}

export interface RateInterval {
  key: string;
  n: number;
  wins: number;
  rate: number | null; // observed pass rate; null with no judged runs
  low: number | null;
  high: number | null;
  epsilon: number | null;
}

export function rateIntervals(rows: { key: string; n: number; wins: number }[], delta = CONFIDENCE_DELTA): RateInterval[] {
  const k = rows.length;
  return rows.map(({ key, n, wins }) => {
    const eps = hoeffdingRadius(n, k, delta);
    const rate = n ? wins / n : null;
    return {
      key,
      n,
      wins,
      rate: rate === null ? null : r4(rate),
      low: rate === null || eps === null ? null : r4(Math.max(0, rate - eps)),
      high: rate === null || eps === null ? null : r4(Math.min(1, rate + eps)),
      epsilon: eps,
    };
  });
}

// Is the best observed rate credibly above every other (intervals disjoint)?
export function credibleLeader(rows: { key: string; n: number; wins: number }[], delta = CONFIDENCE_DELTA) {
  const iv = rateIntervals(rows, delta).filter((x) => x.rate !== null);
  if (iv.length < 2) return { leader: null as string | null, separated: false, intervals: rateIntervals(rows, delta), statement: 'fewer than two options with judged runs: nothing to compare yet' };
  const best = iv.reduce((a, b) => (b.rate! > a.rate! ? b : a));
  const separated = iv.every((x) => x === best || x.high! < best.low!);
  const gap = best.rate! - Math.max(...iv.filter((x) => x !== best).map((x) => x.rate!));
  const statement = separated
    ? `${best.key} is credibly best at ${Math.round((1 - delta) * 100)}% confidence`
    : `not yet distinguishable at ${Math.round((1 - delta) * 100)}% confidence` +
      (gap > 0 ? `; separating a gap of ${Math.round(gap * 100)} points needs about ${runsNeeded(gap / 2, rows.length, delta)} judged runs each` : '');
  return { leader: separated ? best.key : null, separated, intervals: rateIntervals(rows, delta), statement };
}

// --- which model writes ------------------------------------------------------------

export interface WriterStat {
  writer: string;
  n: number; // judged syntheses it wrote in this playlist
  wins: number;
  globalN: number; // everywhere
  globalWins: number;
  mean: number;
  bonus: number;
  score: number;
}

// The same rule for choosing a writer: its pass rate in this playlist over a
// prior of its pass rate everywhere, plus an exploration bonus. Candidates are
// given in preference order (the configured cascade), which breaks ties.
export function chooseWriter(outcomes: readonly SynthesisOutcome[], playlistKey: string, candidates: string[]) {
  if (!candidates.length) return null;
  const judged = outcomes.filter((o) => o.reward !== null);
  const total = judged.filter((o) => o.playlistKey === playlistKey && candidates.includes(o.writer)).length;
  const stats: WriterStat[] = candidates.map((writer) => {
    const g = judged.filter((o) => o.writer === writer);
    const mine = g.filter((o) => o.playlistKey === playlistKey);
    const wins = mine.filter((o) => o.reward === 1).length;
    const globalWins = g.filter((o) => o.reward === 1).length;
    const prior = (globalWins + 1) / (g.length + 2);
    const mean = (wins + PRIOR_STRENGTH * prior) / (mine.length + PRIOR_STRENGTH);
    const bonus = Math.sqrt((2 * Math.log(total + 2)) / (mine.length + PRIOR_STRENGTH)) / 2;
    return { writer, n: mine.length, wins, globalN: g.length, globalWins, mean: r4(mean), bonus: r4(bonus), score: r4(mean + bonus) };
  });
  const best = stats.reduce((a, b) => (b.score > a.score ? b : a));
  const why =
    total === 0 && best.globalN === 0
      ? `No judged syntheses by these models yet; starting with ${best.writer}, the first configured.`
      : `${best.writer}: ${best.wins}/${best.n} of its syntheses passed the guards in this playlist (${best.globalWins}/${best.globalN} everywhere); ` +
        `estimated pass rate ${Math.round(best.mean * 100)}%, exploration bonus ${best.bonus}. ` +
        `Others: ${stats.filter((x) => x !== best).map((x) => `${x.writer} ${x.wins}/${x.n}`).join(', ') || 'none'}.`;
  const confidence = credibleLeader(stats.filter((x) => x.n > 0).map((x) => ({ key: x.writer, n: x.n, wins: x.wins })));
  return { writer: best.writer, why: total ? `${why} Record: ${confidence.statement}.` : why, stats, confidence };
}

// --- lessons and examples ----------------------------------------------------------

export interface Lesson {
  format: typeof LEARNING_FORMAT;
  kind: 'lesson';
  id: string; // L-<guard seq>
  guardSeq: number;
  playlistKey: string;
  transcriptSha256: string;
  logicSha256: string;
  writer: string; // the model that wrote the rejected synthesis
  reviewer: string | null; // the model that reviewed it (null: the deterministic checks alone rejected it)
  failedChecks: string[];
  // Written by the model reviewer: untrusted, shown to the next synthesis as data.
  unsupportedClaims: string[];
  reviewerGuidance: string;
  addedAt: string;
}

export interface Example {
  format: typeof LEARNING_FORMAT;
  kind: 'example';
  id: string; // E-<first 12 of logic sha256>
  playlistKey: string;
  transcriptSha256: string;
  logicSha256: string;
  writer: string; // the model that wrote it
  logic: Record<string, unknown>;
  addedAt: string;
}

export type LearningItem = Lesson | Example;

// The checks a failed verdict did not meet, from the ledger entry alone.
export function failedChecksOf(g: Entry): string[] {
  const d = g.data;
  const out: string[] = [];
  if (typeof d.wordDelta === 'number' && typeof d.epsilon === 'number' && d.wordDelta > d.epsilon) {
    out.push(
      `${d.evaluator === 'beta' ? 'word-pair' : 'word'} grounding: ${Math.round((1 - d.wordDelta) * 100)}% of the wording was found in the transcript; at least ${Math.round((1 - d.epsilon) * 100)}% is required`
    );
  }
  if (d.modelDecision && d.modelDecision !== 'APPROVED') out.push(`the model reviewer decided ${d.modelDecision}`);
  return out;
}

export type ItemCheck = { ok: true } | { ok: false; why: string; tampered: boolean };

// Is this item what it claims, according to the ledger right now?
export function checkItem(item: LearningItem, entries: readonly Entry[]): ItemCheck {
  const synth = entries.find((e) => e.kind === 'synthesis' && e.data.logicSha256 === item.logicSha256);
  if (!synth) return { ok: false, why: 'no synthesis by this server has that logic hash', tampered: true };
  if (synth.data.playlistKey !== item.playlistKey || synth.data.transcriptSha256 !== item.transcriptSha256) {
    return { ok: false, why: 'playlist or transcript does not match the synthesis record', tampered: true };
  }
  if (item.writer !== undefined && item.writer !== writerOf(synth)) {
    return { ok: false, why: `claims writer ${item.writer}, the ledger says ${writerOf(synth)}`, tampered: true };
  }
  const verdicts = entries.filter((e) => judgesSynthesis(e) && e.data.logicSha256 === item.logicSha256 && e.seq > synth.seq);
  if (item.kind === 'example') {
    if (hashLogic(item.logic) !== item.logicSha256) return { ok: false, why: 'logic does not hash to its recorded hash (edited)', tampered: true };
    if (!verdicts.length) return { ok: false, why: 'no guard verdict on it', tampered: true };
    const failed = verdicts.find((g) => !effectiveVerdict(g, entries).passed);
    if (failed) return { ok: false, why: `guard verdict ${failed.seq} did not pass it`, tampered: false };
    return { ok: true };
  }
  const g = verdicts.find((e) => e.seq === item.guardSeq);
  if (!g) return { ok: false, why: `ledger entry ${item.guardSeq} is not a guard verdict on this logic`, tampered: true };
  if (item.reviewer !== undefined && item.reviewer !== (g.data.reviewModel ?? null)) {
    return { ok: false, why: `claims reviewer ${item.reviewer}, the ledger says ${g.data.reviewModel ?? 'none'}`, tampered: true };
  }
  const v = effectiveVerdict(g, entries);
  if (v.passed) return { ok: false, why: v.overridden ? 'the owner accepted this run' : 'the guard passed this run', tampered: !v.overridden };
  return { ok: true };
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export class LearningStore {
  private items: LearningItem[] = [];
  readonly loadProblems: string[] = [];

  constructor(readonly filePath: string | null) {
    if (filePath && fs.existsSync(filePath)) {
      fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .forEach((l, i) => {
          try {
            const x = JSON.parse(l);
            if (x?.format !== LEARNING_FORMAT || (x.kind !== 'lesson' && x.kind !== 'example')) throw new Error('unknown item');
            this.items.push(x);
          } catch {
            this.loadProblems.push(`line ${i + 1} is not a learning item`);
          }
        });
    }
  }

  all(): readonly LearningItem[] {
    return this.items;
  }

  private add(item: LearningItem) {
    if (this.items.some((x) => x.id === item.id)) return null;
    if (this.filePath) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(item) + '\n');
    }
    this.items.push(item);
    return item;
  }

  // Called after a guard verdict was appended to the ledger. Learns only from
  // logic this server synthesized; returns what it added, if anything.
  observe(guard: Entry, entries: readonly Entry[], logic: unknown, review: { unsupportedClaims?: unknown; correctiveRclGuidance?: unknown }) {
    if (!judgesSynthesis(guard)) return null;
    const synth = entries.find((e) => e.kind === 'synthesis' && e.data.logicSha256 === guard.data.logicSha256 && e.seq < guard.seq);
    if (!synth) return null;
    const base = {
      format: LEARNING_FORMAT,
      playlistKey: String(synth.data.playlistKey),
      transcriptSha256: String(synth.data.transcriptSha256),
      logicSha256: String(guard.data.logicSha256),
      writer: writerOf(synth),
      addedAt: new Date().toISOString(),
    } as const;
    if (guard.data.passed === true) {
      if (hashLogic(logic) !== base.logicSha256) return null;
      return this.add({ ...base, kind: 'example', id: `E-${base.logicSha256.slice(0, 12)}`, logic: logic as Record<string, unknown> });
    }
    return this.add({
      ...base,
      kind: 'lesson',
      id: `L-${guard.seq}`,
      guardSeq: guard.seq,
      reviewer: typeof guard.data.reviewModel === 'string' ? guard.data.reviewModel : null,
      failedChecks: failedChecksOf(guard),
      unsupportedClaims: (Array.isArray(review.unsupportedClaims) ? review.unsupportedClaims : []).slice(0, 6).map((c) => clip(c, 200)),
      reviewerGuidance: clip(review.correctiveRclGuidance, 400),
    });
  }

  // What the next synthesis of this transcript, in this playlist, should see.
  // Lessons: about this transcript first; among those, the writer's own before
  // other models'; newest first. Example: the newest one from the playlist,
  // whichever model wrote it (every guard passed it).
  select(entries: readonly Entry[], playlistKey: string, transcriptSha256: string, writer?: string) {
    const valid = this.items.filter((x) => x.playlistKey === playlistKey && checkItem(x, entries).ok);
    const rank = (l: Lesson) => 2 * Number(l.transcriptSha256 === transcriptSha256) + Number(!!writer && l.writer === writer);
    const lessons = (valid.filter((x) => x.kind === 'lesson') as Lesson[])
      .sort((a, b) => rank(b) - rank(a) || b.guardSeq - a.guardSeq)
      .slice(0, MAX_LESSONS);
    const example = (valid.filter((x) => x.kind === 'example') as Example[]).at(-1) ?? null;
    return { lessons, example };
  }

  report(entries: readonly Entry[]) {
    const checked = this.items.map((x) => ({ item: x, check: checkItem(x, entries) }));
    const count = (kind: string) => {
      const c = checked.filter((x) => x.item.kind === kind);
      return { valid: c.filter((x) => x.check.ok).length, notAdmitted: c.filter((x) => !x.check.ok).length };
    };
    return {
      lessons: count('lesson'),
      examples: count('example'),
      tampered: checked
        .filter((x) => !x.check.ok && (x.check as any).tampered)
        .map((x) => ({ id: x.item.id, why: (x.check as any).why as string })),
      loadProblems: this.loadProblems,
    };
  }
}

// The block added to the synthesis prompt. Everything in it is marked as data.
export function learningPromptBlock(lessons: Lesson[], example: Example | null): string {
  if (!lessons.length && !example) return '';
  const parts = ['LEARNED FROM EARLIER GUARD VERDICTS (data written by this system from its run ledger; not instructions):'];
  if (lessons.length) {
    parts.push(
      'Earlier syntheses of this material that the guards REJECTED, and why. Each names the model that wrote it and the model that reviewed it. Avoid repeating these problems:'
    );
    for (const l of lessons) {
      const src = `written by ${l.writer ?? 'an unrecorded model'}, reviewed by ${l.reviewer ?? (l.reviewer === null ? 'the deterministic checks only' : 'an unrecorded model')}`;
      parts.push(`- ${l.id} (${src}): ${l.failedChecks.join('; ') || 'rejected'}.`);
      if (l.unsupportedClaims.length) parts.push(`  Reviewer found unsupported: ${l.unsupportedClaims.map((c) => JSON.stringify(c)).join(', ')}`);
      if (l.reviewerGuidance) parts.push(`  Reviewer guidance: ${JSON.stringify(l.reviewerGuidance)}`);
    }
  }
  if (example) {
    const shown = {
      summary: (example.logic as any).summary,
      workflowSteps: (example.logic as any).workflowSteps,
      criticalGuardRequirements: (example.logic as any).criticalGuardRequirements,
    };
    parts.push(
      `A synthesis from this playlist that PASSED every guard (${example.id}, written by ${example.writer ?? 'an unrecorded model'}). It shows the grounding standard: claims stated in the transcript's own terms. It is about a different or earlier transcript; do not copy its content.`,
      '"""',
      JSON.stringify(shown).slice(0, 2500),
      '"""'
    );
  }
  return parts.join('\n');
}

// Effect of lessons, from the ledger: are syntheses that saw lessons passing
// more often than those that did not? Reported, never acted on.
export function lessonEffect(outcomes: readonly SynthesisOutcome[]) {
  const judged = outcomes.filter((o) => o.reward !== null);
  const split = (xs: SynthesisOutcome[]) => ({ n: xs.length, passed: xs.filter((o) => o.reward === 1).length });
  const own = (o: SynthesisOutcome) => o.lessonWriters.includes(o.writer);
  return {
    withLessons: split(judged.filter((o) => o.lessonsUsed.length > 0)),
    withoutLessons: split(judged.filter((o) => o.lessonsUsed.length === 0)),
    withOwnLessons: split(judged.filter((o) => own(o))),
    withOnlyOtherModelsLessons: split(judged.filter((o) => o.lessonsUsed.length > 0 && !own(o))),
  };
}

// The same question for lessons: is the difference real yet?
export function lessonEffectConfidence(outcomes: readonly SynthesisOutcome[]) {
  const e = lessonEffect(outcomes);
  return credibleLeader([
    { key: 'with lessons', n: e.withLessons.n, wins: e.withLessons.passed },
    { key: 'without lessons', n: e.withoutLessons.n, wins: e.withoutLessons.passed },
  ]);
}

// Grounded critique (RCI) against plain revision, among judged syntheses that
// were allowed more than one pass (with one pass the two are the same). Reported,
// never acted on: the owner chooses the refinement mode.
export function refineEffect(outcomes: readonly SynthesisOutcome[]) {
  const judged = outcomes.filter((o) => o.reward !== null && o.passes > 1);
  const split = (xs: SynthesisOutcome[]) => ({ n: xs.length, passed: xs.filter((o) => o.reward === 1).length });
  const rci = judged.filter((o) => o.refine === 'rci');
  const revise = judged.filter((o) => o.refine === 'revise');
  const a = split(rci);
  const b = split(revise);
  const rciRuns = rci.length ? rci.reduce((s, o) => s + o.passesRun, 0) / rci.length : null;
  return {
    rci: a,
    revise: b,
    rciAveragePassesRun: rciRuns === null ? null : r4(rciRuns),
    confidence: credibleLeader([
      { key: 'grounded critique (RCI)', n: a.n, wins: a.passed },
      { key: 'plain revision', n: b.n, wins: b.passed },
    ]).statement,
  };
}

// --- per-model known habits -------------------------------------------------------
//
// What each writer model tends to get wrong in its FIRST draft, across every
// playlist, counted from the ledger. Each synthesis entry records the problems
// the server computed in the draft (server/rci.ts kinds) and which model wrote
// it. A habit is "known" only when the record says so with confidence: at
// least HABIT_MIN_DRAFTS drafts, and the 95% Wilson lower bound of the rate at
// or above HABIT_MIN_RATE (2 of 5 drafts is not enough; 3 of 5 is). Shown to
// the same model as counts (data), never as advice to pad its wording, and never
// as a guard threshold. A model that stops doing it sees the habit drop away.

export const HABIT_KINDS = ['quote-not-found', 'no-quote', 'weakly-grounded'] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];
export const HABIT_MIN_DRAFTS = 5;
export const HABIT_MIN_RATE = 0.2;

const HABIT_TEXT: Record<HabitKind, string> = {
  'quote-not-found': 'gave an invariant a transcriptEvidence quote that is not in the transcript',
  'no-quote': 'gave an invariant no transcriptEvidence quote',
  'weakly-grounded': 'stated a claim mostly in words the transcript does not use',
};

// 95% Wilson score lower bound for k successes in n trials.
export function wilsonLower(k: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (c - m) / d);
}

export interface Habit {
  kind: HabitKind;
  drafts: number; // drafts by this model with at least one such problem
  of: number; // drafts by this model with recorded problems
  rate: number;
  low: number; // Wilson lower bound
  known: boolean;
  text: string;
  // Did showing the habit help? The same count among drafts that were shown
  // this habit, and among those that were not. Reported, never acted on.
  whenShown: { drafts: number; of: number };
  whenNotShown: { drafts: number; of: number };
}

// Per writer: its first drafts with recorded problems, and each habit's record.
export function modelHabits(entries: readonly Entry[]): { writer: string; drafts: number; habits: Habit[] }[] {
  type Draft = { problems: Record<string, unknown>; shown: string[] };
  const byWriter = new Map<string, Draft[]>();
  for (const e of entries) {
    if (e.kind !== 'synthesis' || typeof e.data.draftWriter !== 'string') continue;
    const dp = e.data.draftProblems;
    if (!dp || typeof dp !== 'object') continue;
    const d = { problems: dp as Record<string, unknown>, shown: Array.isArray(e.data.habitsShown) ? e.data.habitsShown.map(String) : [] };
    (byWriter.get(e.data.draftWriter) ?? byWriter.set(e.data.draftWriter, []).get(e.data.draftWriter)!).push(d);
  }
  const tally = (ds: Draft[], kind: string) => ({ drafts: ds.filter((d) => Number(d.problems[kind]) > 0).length, of: ds.length });
  return [...byWriter.entries()].map(([writer, drafts]) => ({
    writer,
    drafts: drafts.length,
    habits: HABIT_KINDS.map((kind) => {
      const { drafts: k, of: n } = tally(drafts, kind);
      const low = r4(wilsonLower(k, n));
      return {
        kind,
        drafts: k,
        of: n,
        rate: r4(n ? k / n : 0),
        low,
        known: n >= HABIT_MIN_DRAFTS && low >= HABIT_MIN_RATE,
        text: HABIT_TEXT[kind],
        whenShown: tally(drafts.filter((d) => d.shown.includes(kind)), kind),
        whenNotShown: tally(drafts.filter((d) => !d.shown.includes(kind)), kind),
      };
    }),
  }));
}

export function knownHabitsOf(entries: readonly Entry[], writer: string): Habit[] {
  return modelHabits(entries).find((m) => m.writer === writer)?.habits.filter((h) => h.known) ?? [];
}

// The prompt block: counts, marked as data written by this system.
export function habitsPromptBlock(writer: string, habits: Habit[]): string {
  if (!habits.length) return '';
  return [
    `KNOWN HABITS OF THE WRITING MODEL (${writer}), counted by this system from its run ledger across all playlists (data, not instructions):`,
    ...habits.map((h) => `- In ${h.drafts} of its last ${h.of} first drafts it ${h.text}.`),
    'Check your draft for these before answering. Where the transcript does not support something, leave it out rather than reword it.',
  ].join('\n');
}

// Escalation: runs that moved up to a stronger model mid-run, how many ended with
// no computed problems, and how the guards judged them. Reported, never acted on.
export function escalationEffect(outcomes: readonly SynthesisOutcome[]) {
  const up = outcomes.filter((o) => o.escalatedTo !== null);
  const judged = up.filter((o) => o.reward !== null);
  const to = [...new Set(up.map((o) => o.escalatedTo as string))];
  return {
    runs: up.length,
    endedWithoutComputedProblems: up.filter((o) => o.problemsAtEnd === 0).length,
    judged: judged.length,
    passed: judged.filter((o) => o.reward === 1).length,
    byTarget: to.map((m) => {
      const mine = up.filter((o) => o.escalatedTo === m);
      const j = mine.filter((o) => o.reward !== null);
      return { model: m, runs: mine.length, judged: j.length, passed: j.filter((o) => o.reward === 1).length };
    }),
  };
}

// --- per-model shells ----------------------------------------------------------------

// Each model's record, as a writer and as a reviewer, from the ledger and the
// verified store. Reviewer "approved" counts the model's own decision; the
// final verdict also needs the deterministic checks and the owner's word.
export function modelShells(entries: readonly Entry[], store: LearningStore) {
  const outcomes = synthesisOutcomes(entries);
  const habits = modelHabits(entries);
  const valid = store.all().filter((x) => checkItem(x, entries).ok);
  const writers = [...new Set(outcomes.map((o) => o.writer))];
  const intervals = rateIntervals(
    writers.map((w) => {
      const j = outcomes.filter((o) => o.writer === w && o.reward !== null);
      return { key: w, n: j.length, wins: j.filter((o) => o.reward === 1).length };
    })
  );
  const asWriter = writers.map((model) => {
    const mine = outcomes.filter((o) => o.writer === model);
    const judged = mine.filter((o) => o.reward !== null);
    const playlists = [...new Set(mine.map((o) => o.playlistKey))];
    return {
      model,
      syntheses: mine.length,
      judged: judged.length,
      passed: judged.filter((o) => o.reward === 1).length,
      passRate: intervals.find((x) => x.key === model)!, // with its Hoeffding interval across all writers
      lessons: valid.filter((x) => x.kind === 'lesson' && x.writer === model).length,
      examples: valid.filter((x) => x.kind === 'example' && x.writer === model).length,
      habits: habits.find((h) => h.writer === model) ?? null,
      playlists: playlists.map((k) => ({
        playlistKey: k,
        arms: armStats(outcomes, k, model).filter((a) => a.n > 0),
        next: chooseArm(outcomes, k, model),
      })),
    };
  });
  const reviews = entries.filter((e) => judgesSynthesis(e) && typeof e.data.reviewModel === 'string');
  const reviewers = [...new Set(reviews.map((e) => String(e.data.reviewModel)))].map((model) => {
    const mine = reviews.filter((e) => e.data.reviewModel === model);
    return {
      model,
      verdicts: mine.length,
      approved: mine.filter((e) => e.data.modelDecision === 'APPROVED').length,
      // How often it approved logic that it also wrote: worth watching.
      reviewedOwnWriting: mine.filter((e) => outcomes.some((o) => o.logicSha256 === e.data.logicSha256 && o.writer === model)).length,
    };
  });
  return { asWriter, reviewers, writersCompared: credibleLeader(intervals.map(({ key, n, wins }) => ({ key, n, wins }))).statement };
}

export function playlistKeyOf(playlist: any, activeVideo: any): string {
  const id = String(playlist?.id || '').slice(0, 120);
  if (id) return playlist?.isDemo ? `demo:${id}` : `playlist:${id}`;
  return `video:${String(activeVideo?.youtubeId || activeVideo?.id || 'unknown').slice(0, 64)}`;
}
