import crypto from 'crypto';

// The text the knowledge engine reads: every video's transcript, one after the
// other. When the whole set is longer than the budget, every video gets a fair
// share (short ones whole, the rest cut equally) instead of the first video
// filling the budget and the later ones vanishing. A cut is marked in the text
// and reported in `coverage`, so it is never silent.

export interface CorpusCoverage {
  video: number; // 1-based, as cited ("Video N")
  title: string;
  includedChars: number;
  totalChars: number;
  complete: boolean;
}

function videoBody(v: any): string {
  const segs = (Array.isArray(v?.segments) ? v.segments : [])
    .map((s: any) => `  [${s.start}${s.end ? ` - ${s.end}` : ''}] ${s.speaker}: ${s.text}`)
    .join('\n');
  return segs || String(v?.rawTranscript || '');
}

// Cut at a line break at or before `limit`, so no line is split mid-sentence.
function cutAt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const nl = text.lastIndexOf('\n', limit);
  return text.slice(0, nl > 0 ? nl : limit);
}

export function buildCorpus(videos: any[], maxChars: number): { text: string; coverage: CorpusCoverage[] } {
  const list = (Array.isArray(videos) ? videos : []).map((v, i) => ({ v, i, body: videoBody(v) }));
  // Water-filling: shortest first; each takes what it needs up to an equal share of what is left.
  const share = new Map<number, number>();
  let left = Math.max(0, maxChars);
  const byLength = [...list].sort((a, b) => a.body.length - b.body.length);
  byLength.forEach((x, k) => {
    const fair = Math.floor(left / (byLength.length - k));
    const take = Math.min(x.body.length, fair);
    share.set(x.i, take);
    left -= take;
  });
  const coverage: CorpusCoverage[] = [];
  const parts = list.map(({ v, i, body }) => {
    const kept = cutAt(body, share.get(i) ?? 0);
    const complete = kept.length === body.length;
    coverage.push({ video: i + 1, title: String(v?.title || ''), includedChars: kept.length, totalChars: body.length, complete });
    const note = complete ? '' : `\n  [transcript cut here for length: ${kept.length} of ${body.length} characters included]`;
    return `### VIDEO ${i + 1}: "${v?.title}" (${v?.channel || 'Channel'}, ${v?.duration || 'N/A'})\n${kept}${note}`;
  });
  return { text: parts.filter((_, i) => list[i].body).join('\n\n====================\n\n'), coverage };
}

// A combined set of videos gets an id from its members, so the same set always
// has the same id (and the learning store's playlist key stays stable).
export function collectionId(videoIds: string[]): string {
  const key = [...new Set(videoIds)].sort().join(',');
  return `collection-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}
