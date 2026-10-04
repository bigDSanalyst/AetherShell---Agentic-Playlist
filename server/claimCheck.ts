import { contentTokens } from './grounding';
import { parseTimestamp } from './transcribe';

// Checks a chat answer against the transcripts it claims to come from.
//
// For each citation "[Video N @ mm:ss]" it looks at what was said around that
// time and asks whether the cited sentence shares enough words with it. If not,
// it searches the rest of that video and, if the words are said elsewhere,
// reports where. Sentences without a citation are checked against the whole
// corpus; a sentence whose words mostly do not occur in any transcript is
// marked as coming from outside the corpus.
//
// This is a word check, not a meaning check (like the guards' lexical
// grounding): a faithful paraphrase in other words can fail it, and a sentence
// that reuses the transcript's words to say something else can pass it. It is
// shown as such.

export type CitationStatus = 'supported' | 'elsewhere' | 'unsupported' | 'no-such-video' | 'bad-time';

export interface CitationCheck {
  video: number;
  cited: string; // the time as cited
  status: CitationStatus;
  foundAt?: string; // for "elsewhere": where in that video the words are said
  overlap: number; // share of the claim's words found at the cited time (0..1)
  claim: string; // the sentence the citation is attached to (trimmed)
}

export interface UncitedSentence {
  text: string;
  inCorpus: number; // share of its words that occur anywhere in the transcripts (0..1)
  outsideCorpus: boolean;
}

export interface ClaimCheck {
  citations: CitationCheck[];
  uncited: UncitedSentence[];
  summary: { supported: number; elsewhere: number; unsupported: number; invalid: number; uncited: number; outsideCorpus: number };
  method: string;
}

interface Seg {
  start: number;
  end: number;
  text: string;
}

const WINDOW = 45; // seconds either side of a cited time
const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

// Crude stemming so "collapse", "collapsed" and "collapsing" match.
const stem = (w: string) => (w.length > 6 ? w.slice(0, 6) : w);
const stems = (text: string) => contentTokens(text).map(stem);

function segmentsOf(v: any): Seg[] {
  const raw = (Array.isArray(v?.segments) ? v.segments : [])
    .map((s: any) => ({ start: parseTimestamp(s?.start), end: s?.end ? parseTimestamp(s.end) : null, text: String(s?.text || '') }))
    .filter((s: any) => s.start !== null && s.text);
  // A segment lasts until its end time, else until the next starts (at most 30s).
  return raw.map((s: any, i: number) => ({
    start: s.start,
    end: s.end ?? Math.min(raw[i + 1]?.start ?? s.start + 30, s.start + 30),
    text: s.text,
  }));
}

function windowStems(segs: Seg[], t: number): Set<string> {
  const out = new Set<string>();
  for (const s of segs) if (s.end >= t - WINDOW && s.start <= t + WINDOW) stems(s.text).forEach((w) => out.add(w));
  return out;
}

function overlap(claim: string[], window: Set<string>): number {
  if (!claim.length) return 0;
  return claim.filter((w) => window.has(w)).length / claim.length;
}

const SUPPORTED = 0.3; // share of the claim's words said near the cited time

// Citation groups: "[Video 1 @ 01:09; 04:36]", "[Video 1 @ 51:59; Video 2 @ 34:53]".
const GROUP_RE = /\[\s*Video\s+\d+\s*@[^\]]*\]/gi;

// The sentence a citation belongs to: text from the previous sentence end (or
// previous citation) up to the citation.
function claimBefore(text: string, at: number): string {
  const before = text.slice(0, at);
  const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('\n'), before.lastIndexOf(']'), before.lastIndexOf('? '), before.lastIndexOf('! '));
  return before
    .slice(cut + 1)
    .replace(/[*_#>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkChatAnswer(answer: string, videos: any[]): ClaimCheck {
  const vids = Array.isArray(videos) ? videos : [];
  const segsByVideo = vids.map(segmentsOf);
  const corpus = new Set<string>();
  segsByVideo.forEach((segs) => segs.forEach((s) => stems(s.text).forEach((w) => corpus.add(w))));

  const citations: CitationCheck[] = [];
  for (const m of answer.matchAll(GROUP_RE)) {
    const claimText = claimBefore(answer, m.index ?? 0);
    const claim = stems(claimText);
    let video = 0;
    for (const part of m[0].slice(1, -1).split(';')) {
      const vm = part.match(/Video\s+(\d+)/i);
      if (vm) video = Number(vm[1]);
      const tm = part.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (!tm || !video) continue;
      const base = { video, cited: tm[1], claim: claimText.slice(0, 300) };
      const segs = segsByVideo[video - 1];
      if (!segs) {
        citations.push({ ...base, status: 'no-such-video', overlap: 0 });
        continue;
      }
      const t = parseTimestamp(tm[1])!;
      const last = segs.length ? segs[segs.length - 1].end + 60 : 0;
      if (!segs.length || t > last) {
        citations.push({ ...base, status: 'bad-time', overlap: 0 });
        continue;
      }
      const here = overlap(claim, windowStems(segs, t));
      if (here >= SUPPORTED) {
        citations.push({ ...base, status: 'supported', overlap: round2(here) });
        continue;
      }
      // Said somewhere else in this video?
      let best = { at: -1, score: 0 };
      for (const s of segs) {
        const sc = overlap(claim, windowStems(segs, s.start));
        if (sc > best.score) best = { at: s.start, score: sc };
      }
      citations.push(
        best.score >= SUPPORTED
          ? { ...base, status: 'elsewhere', foundAt: fmt(best.at), overlap: round2(here) }
          : { ...base, status: 'unsupported', overlap: round2(here) }
      );
    }
  }

  // Sentences with no citation: are their words in the transcripts at all?
  const uncited: UncitedSentence[] = [];
  const withoutCitations = answer.replace(GROUP_RE, '\u0000');
  for (const raw of withoutCitations.split(/(?<=[.!?])\s+|\n+/)) {
    if (raw.includes('\u0000')) continue; // cited
    const text = raw.replace(/[*_#>`|]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = stems(text);
    if (text.length < 40 || words.length < 5) continue; // headings, connectives
    const inCorpus = words.filter((w) => corpus.has(w)).length / words.length;
    const hasMaths = /\$[^$]+\$|\\[a-z]+\{|[∫∑∇∂≥≤∝]/.test(raw);
    uncited.push({ text: text.slice(0, 300), inCorpus: round2(inCorpus), outsideCorpus: inCorpus < 0.5 || hasMaths });
  }

  const count = (s: CitationStatus) => citations.filter((c) => c.status === s).length;
  return {
    citations,
    uncited,
    summary: {
      supported: count('supported'),
      elsewhere: count('elsewhere'),
      unsupported: count('unsupported'),
      invalid: count('no-such-video') + count('bad-time'),
      uncited: uncited.length,
      outsideCorpus: uncited.filter((u) => u.outsideCorpus).length,
    },
    method: `word check: a citation is confirmed when ${Math.round(SUPPORTED * 100)}% of its sentence's words are said within ${WINDOW}s of the cited time; not a check of meaning`,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
