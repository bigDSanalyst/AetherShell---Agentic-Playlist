// Lexical grounding metrics between generated logic and the source transcript.
//
// These are simple, reproducible measurements (word and bigram overlap), not a
// semantic model. They catch output that uses vocabulary absent from the
// transcript; they cannot prove that a paraphrase is faithful.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our',
  'out', 'has', 'have', 'from', 'this', 'that', 'with', 'they', 'them', 'then', 'than', 'there', 'their',
  'what', 'when', 'where', 'which', 'while', 'who', 'will', 'would', 'should', 'could', 'into', 'onto',
  'each', 'every', 'must', 'also', 'such', 'only', 'very', 'just', 'more', 'most', 'some', 'these', 'those',
  'been', 'being', 'were', 'about', 'over', 'under', 'after', 'before', 'between', 'through', 'does', 'did',
]);

export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i] + ' ' + tokens[i + 1]);
  return out;
}

// Text of the logic that makes claims (not ids or code).
export function logicClaimText(logic: any): string {
  if (!logic || typeof logic !== 'object') return typeof logic === 'string' ? logic : '';
  const parts: string[] = [];
  if (typeof logic.summary === 'string') parts.push(logic.summary);
  for (const s of Array.isArray(logic.workflowSteps) ? logic.workflowSteps : []) {
    if (typeof s?.description === 'string') parts.push(s.description);
  }
  for (const r of Array.isArray(logic.criticalGuardRequirements) ? logic.criticalGuardRequirements : []) {
    if (typeof r === 'string') parts.push(r);
  }
  return parts.join(' ');
}

export interface OverlapResult {
  ratio: number; // fraction of claim units found in the transcript, 0..1
  matched: number;
  total: number;
  unmatchedSample: string[];
}

function overlap(claimUnits: string[], sourceUnits: Set<string>): OverlapResult {
  let matched = 0;
  const unmatched: string[] = [];
  for (const u of claimUnits) {
    if (sourceUnits.has(u)) matched++;
    else if (unmatched.length < 12 && !unmatched.includes(u)) unmatched.push(u);
  }
  return {
    ratio: claimUnits.length ? matched / claimUnits.length : 0,
    matched,
    total: claimUnits.length,
    unmatchedSample: unmatched,
  };
}

export function wordOverlap(claimText: string, transcript: string): OverlapResult {
  return overlap(contentTokens(claimText), new Set(contentTokens(transcript)));
}

export function bigramOverlap(claimText: string, transcript: string): OverlapResult {
  return overlap(bigrams(contentTokens(claimText)), new Set(bigrams(contentTokens(transcript))));
}

// 1 - Jaccard similarity of content-word sets: how much one text changed vs another.
export function changeBetween(a: string, b: string): number {
  const sa = new Set(contentTokens(a));
  const sb = new Set(contentTokens(b));
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return 1 - inter / (sa.size + sb.size - inter);
}

export function round4(n: number): number {
  return Number(n.toFixed(4));
}

// Lowercase, punctuation to spaces: a quote counts as found when this form of it
// appears in this form of the source.
export function normalizeForQuote(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
