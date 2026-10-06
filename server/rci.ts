import { contentTokens, normalizeForQuote, wordOverlap } from './grounding';

// Grounded RCI (Recursive Criticism and Improvement) for RCL refinement passes.
//
// Plain revision asks the model to find and fix its own problems in one step.
// A model criticising itself with nothing to go on often misses real problems
// or "fixes" correct ones. Here the criticism starts from problems this server
// computes against the transcript, so every item names something checkable:
//
//   quote-not-found   an invariant's transcriptEvidence is not in the transcript
//   no-quote          an invariant gives no transcriptEvidence at all
//   weakly-grounded   a claim (summary, step, requirement) whose content words
//                     are mostly not in the transcript; the missing words are listed
//
// One refinement pass is then two model calls: CRITIQUE (for each computed
// problem: remove, rewrite, requote, or keep, with a reason and the transcript
// words that support the fix) and IMPROVE (apply exactly that critique). When
// nothing computed is wrong, refinement stops: an uncomputed self-critique is
// what this avoids.
//
// This is a writing aid, not a guard. CLAIM_FLOOR is not a guard setting and
// is not the charter's threshold: the guards judge the result on their own,
// unchanged, and the model is never told the guards' thresholds. "keep" is a
// valid answer, so a faithful paraphrase is not deleted just to raise a number.

export const CLAIM_FLOOR = 0.5;
export const MAX_FINDINGS = 12;
const MISSING_WORDS_SHOWN = 8;

export type FindingKind = 'quote-not-found' | 'no-quote' | 'weakly-grounded';

export interface Finding {
  id: string; // F1, F2, ...
  kind: FindingKind;
  where: string; // e.g. "summary", "step 3", "invariant INV-01"
  text: string; // the claim or quote as written (clipped)
  detail: string; // what was computed
}

export type CritiqueVerdict = 'remove' | 'rewrite' | 'requote' | 'keep';

export interface CritiqueItem extends Finding {
  verdict: CritiqueVerdict;
  reason: string;
  transcriptQuote: string; // words from the transcript the model cites for its fix
  quoteFound: boolean; // computed: is transcriptQuote really in the transcript?
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// The claims a draft makes, where each one is.
function claimsOf(raw: any): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  if (typeof raw?.summary === 'string' && raw.summary.trim()) out.push({ where: 'summary', text: raw.summary });
  (Array.isArray(raw?.workflowSteps) ? raw.workflowSteps : []).slice(0, 12).forEach((s: any, i: number) => {
    if (typeof s?.description === 'string' && s.description.trim()) out.push({ where: `step ${i + 1}`, text: s.description });
  });
  (Array.isArray(raw?.criticalGuardRequirements) ? raw.criticalGuardRequirements : []).slice(0, 12).forEach((r: any, i: number) => {
    if (typeof r === 'string' && r.trim()) out.push({ where: `requirement ${i + 1}`, text: r });
  });
  return out;
}

// Problems in a draft (the model's JSON), computed against the transcript.
export function findProblems(raw: any, transcript: string): Finding[] {
  const found: Omit<Finding, 'id'>[] = [];
  const normTranscript = normalizeForQuote(transcript);
  const vocab = new Set(contentTokens(transcript));

  (Array.isArray(raw?.invariants) ? raw.invariants : []).slice(0, 8).forEach((inv: any, i: number) => {
    const name = clip(inv?.id || `#${i + 1}`, 40);
    const quote = typeof inv?.transcriptEvidence === 'string' ? inv.transcriptEvidence.trim() : '';
    if (!quote) {
      found.push({ kind: 'no-quote', where: `invariant ${name}`, text: clip(inv?.name || inv?.description, 200), detail: 'no transcriptEvidence given' });
    } else if (!normTranscript.includes(normalizeForQuote(quote))) {
      found.push({ kind: 'quote-not-found', where: `invariant ${name}`, text: clip(quote, 200), detail: 'this quote is not in the transcript' });
    }
  });

  for (const c of claimsOf(raw)) {
    const ov = wordOverlap(c.text, transcript);
    if (ov.total === 0 || ov.ratio >= CLAIM_FLOOR) continue;
    const missing = [...new Set(contentTokens(c.text).filter((w) => !vocab.has(w)))].slice(0, MISSING_WORDS_SHOWN);
    found.push({
      kind: 'weakly-grounded',
      where: c.where,
      text: clip(c.text, 200),
      detail: `${Math.round(ov.ratio * 100)}% of its content words are in the transcript; not found: ${missing.join(', ')}`,
    });
  }
  return found.slice(0, MAX_FINDINGS).map((f, i) => ({ id: `F${i + 1}`, ...f }));
}

// Everything the critique step sees is data; the transcript block comes first
// (shared with the other passes, so it can be cached).
export function critiquePrompt(header: string, previous: unknown, findings: Finding[]): string {
  return `${header}
PREVIOUS PASS (JSON, data):
${JSON.stringify(previous).slice(0, 40000)}

COMPUTED PROBLEMS (data, measured by this server against the transcript above):
${JSON.stringify(findings.map(({ id, kind, where, text, detail }) => ({ id, kind, where, text, detail })))}

Critique the previous pass. For EACH computed problem, decide one verdict:
- "remove": the claim is not supported by the transcript;
- "rewrite": the claim is supported but stated in words the transcript does not use;
- "requote": the invariant is supported, but its quote is wrong or missing;
- "keep": the computed problem is a false alarm; say why.
For rewrite and requote, give transcriptQuote: words copied exactly from the transcript that support the fix. Do not rewrite the plan here.
Return JSON: {"critiques":[{"id":"F1","verdict":"remove|rewrite|requote|keep","reason":"string","transcriptQuote":"string"}]}`;
}

// The model's critique, checked: only the computed problems, a known verdict,
// and whether each cited quote is really in the transcript. A problem the model
// skipped is listed with verdict "keep" and says so.
export function sanitizeCritique(raw: any, findings: Finding[], transcript: string): CritiqueItem[] {
  const got = new Map<string, any>();
  for (const c of Array.isArray(raw?.critiques) ? raw.critiques : []) {
    if (typeof c?.id === 'string' && !got.has(c.id)) got.set(c.id, c);
  }
  const normTranscript = normalizeForQuote(transcript);
  return findings.map((f) => {
    const c = got.get(f.id);
    const verdict: CritiqueVerdict = ['remove', 'rewrite', 'requote', 'keep'].includes(c?.verdict) ? c.verdict : 'keep';
    const transcriptQuote = clip(c?.transcriptQuote, 300);
    return {
      ...f,
      verdict,
      reason: c ? clip(c.reason, 300) : 'the critique did not address this problem',
      transcriptQuote,
      quoteFound: !!transcriptQuote && normTranscript.includes(normalizeForQuote(transcriptQuote)),
    };
  });
}

export function improvePrompt(header: string, previous: unknown, critique: CritiqueItem[], schema: string): string {
  const items = critique.map(({ id, where, text, verdict, reason, transcriptQuote, quoteFound }) => ({
    id,
    where,
    text,
    verdict,
    reason,
    transcriptQuote: quoteFound ? transcriptQuote : '',
  }));
  return `${header}
PREVIOUS PASS (JSON, data):
${JSON.stringify(previous).slice(0, 40000)}

CRITIQUE TO APPLY (data):
${JSON.stringify(items)}

Apply exactly this critique to the previous pass: remove what is marked "remove"; for "rewrite", restate the claim in the transcript's own words (transcriptQuote, when given, is verified); for "requote", set transcriptEvidence to words copied exactly from the transcript; leave "keep" items and everything not listed unchanged. Do not add new claims, steps or invariants.
Return JSON matching:
${schema}`;
}

export const findingsSummary = (fs: Finding[]) =>
  fs.length
    ? Object.entries(fs.reduce<Record<string, number>>((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {}))
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
    : 'none';
