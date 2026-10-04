import type { IngestedVideo, TranscriptSegment } from './youtube';

// Transcripts that do not come from YouTube's caption track.
//
//   model-transcription  Gemini watches the public video by its URL and writes
//                        down what is said. Google fetches the video itself, so
//                        YouTube's refusal of this server does not apply. It is a
//                        machine transcription: labelled with model, method and
//                        time everywhere it goes, never presented as captions.
//   owner-provided       text the owner pasted (e.g. from YouTube's "Show
//                        transcript" panel), labelled as such.
//
// Neither is invented: both come from the video. But a model can mishear or
// insert words, and the guards check syntheses against the transcript, not the
// transcript against the video, so the source must stay visible and signed.
// Which source produced a transcript is recorded by the server in its ledger
// ("ingest" entries) and looked up there when signing; the browser cannot set it.

export type TranscriptSource = 'youtube-captions' | 'model-transcription' | 'owner-provided';

export const TRANSCRIBE_PROMPT = `Transcribe the spoken words of this video.

Rules:
- Write only what is actually said, in the language it is spoken. Do not summarise, paraphrase, translate, explain or add anything.
- If a passage cannot be made out, write [inaudible]. Mark non-speech only briefly, e.g. [music].
- If nobody speaks, return an empty list.
- One segment per sentence or about every 10 seconds; "start" is the time from the beginning of the video.

Return JSON only: { "segments": [ { "start": "mm:ss", "text": "..." } ] }`;

export const MAX_PROVIDED_CHARS = 300_000;

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export function parseTimestamp(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v !== 'string') return null;
  const parts = v.trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

// Checks what the model returned before it is used as a transcript. Anything
// malformed is rejected (the call then fails closed), not repaired.
export function parseTranscription(data: any, durationSeconds?: number): { segments: TranscriptSegment[] } | { error: string } {
  const raw = Array.isArray(data?.segments) ? data.segments : null;
  if (!raw) return { error: 'no "segments" list in the model output' };
  if (!raw.length) return { error: 'the model heard no speech in this video' };
  const out: TranscriptSegment[] = [];
  let last = -1;
  for (const [i, s] of raw.entries()) {
    const start = parseTimestamp(s?.start);
    const text = typeof s?.text === 'string' ? s.text.replace(/\s+/g, ' ').trim() : '';
    if (start === null) return { error: `segment ${i + 1} has no valid start time` };
    if (!text) continue;
    if (start + 1 < last) return { error: `segment ${i + 1} goes back in time (${fmt(start)} after ${fmt(last)})` };
    // Model timestamps drift; only a start well past the end (not a few seconds) is rejected.
    if (durationSeconds && start > durationSeconds + Math.max(30, durationSeconds * 0.05)) return { error: `segment ${i + 1} starts at ${fmt(start)}, after the video ends (${fmt(durationSeconds)})` };
    last = Math.max(last, start);
    out.push({ id: `seg-${i + 1}`, start: fmt(start), end: '', speaker: 'Speaker', text });
  }
  for (let i = 0; i < out.length; i++) {
    const last = durationSeconds ? fmt(Math.max(durationSeconds, parseTimestamp(out[i].start)!)) : '';
    out[i].end = out[i + 1]?.start ?? last;
  }
  if (out.reduce((n, s) => n + s.text.length, 0) < 20) return { error: 'the transcription is too short to be the video' };
  return { segments: out };
}

export function segmentsToRawText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${s.start}${s.end ? ` - ${s.end}` : ''}] ${s.speaker}: ${s.text}`).join('\n\n');
}

export function modelTranscribedVideo(base: IngestedVideo, segments: TranscriptSegment[], model: string, at = new Date()): IngestedVideo {
  return {
    ...base,
    segments,
    rawTranscript: segmentsToRawText(segments),
    transcriptSource: 'model-transcription',
    transcriptMethod: { model, via: 'gemini-youtube-url', at: at.toISOString() },
    transcriptError: undefined,
  };
}

// Owner-pasted text: kept as written, split into paragraphs, no timestamps
// (none were given, so none are shown).
export function ownerProvidedVideo(base: IngestedVideo, text: string, at = new Date()): IngestedVideo | { error: string } {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length < 20) return { error: 'The pasted transcript is too short.' };
  if (clean.length > MAX_PROVIDED_CHARS) return { error: `The pasted transcript is longer than ${MAX_PROVIDED_CHARS.toLocaleString()} characters.` };
  const paragraphs = clean.split(/\n{2,}|\n(?=\d{1,2}:\d{2})/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const segments: TranscriptSegment[] = paragraphs.map((p, i) => {
    const m = p.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/); // YouTube's panel puts the time before each line
    return { id: `seg-${i + 1}`, start: m ? m[1] : '', end: '', speaker: 'Speaker', text: m ? m[2] : p };
  });
  return {
    ...base,
    segments,
    rawTranscript: segmentsToRawText(segments),
    transcriptSource: 'owner-provided',
    transcriptMethod: { via: 'pasted by the owner', at: at.toISOString() },
    transcriptError: undefined,
  };
}

interface Entry {
  kind: string;
  data: Record<string, any>;
}

// Where a transcript came from, as this server recorded it when it produced it.
// "imported": the source was stated by an archive file the owner restored, not
// observed by this server when it produced the transcript.
export function transcriptSourceFromLedger(
  entries: readonly Entry[],
  transcriptSha256: string
): { source: TranscriptSource | 'unrecorded'; model: string | null; imported: boolean } {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind === 'ingest' && e.data.transcriptSha256 === transcriptSha256) return { source: e.data.source, model: e.data.model ?? null, imported: !!e.data.imported };
  }
  return { source: 'unrecorded', model: null, imported: false };
}

// The source as signed into a manifest: "source[:model][ (imported)]".
export function signedSourceLabel(o: { source: string; model: string | null; imported: boolean }): string {
  return `${o.source}${o.model ? `:${o.model}` : ''}${o.imported ? ' (imported)' : ''}`;
}
