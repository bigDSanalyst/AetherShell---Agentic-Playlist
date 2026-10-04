import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IngestedVideo, TranscriptSegment } from './youtube';

// Every transcript this server has produced, kept so a video is transcribed
// once. Re-ingesting a playlist reads it from here: no YouTube request, no model
// quota. Append-only JSON lines; the newest entry for a video wins. Each entry
// carries the transcript's hash and is checked against it when loaded, so an
// edited entry is ignored (and reported), not served. The ledger's "ingest"
// entries, not this file, are the evidence of where a transcript came from.

export interface ArchivedTranscript {
  videoId: string;
  title: string;
  channel?: string;
  duration?: string;
  source: 'youtube-captions' | 'model-transcription' | 'owner-provided';
  model: string | null;
  via: string;
  at: string;
  language?: string;
  transcriptSha256: string;
  rawTranscript: string;
  segments: TranscriptSegment[];
  importedAt?: string; // set when the entry came from an archive file, not from this server
}

export const ARCHIVE_FILE_FORMAT = 'aethershell-transcripts/v1';
const SOURCES = ['youtube-captions', 'model-transcription', 'owner-provided'];
const MAX_TRANSCRIPT_CHARS = 2_000_000;

export interface ImportResult {
  added: ArchivedTranscript[];
  alreadyHere: number;
  keptLocal: { videoId: string; title: string }[]; // a different transcript of this video was already here; it was kept
  rejected: { entry: number; videoId: string | null; why: string }[];
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export class TranscriptArchive {
  private byVideo = new Map<string, ArchivedTranscript>();
  readonly loadProblems: string[] = [];

  // hashOf must be the server's transcript hash (provenance.hashTranscript) so
  // archive entries match the ledger's ingest entries.
  constructor(readonly path: string | null, private hashOf: (text: string) => string = sha256) {
    if (!path || !fs.existsSync(path)) return;
    const lines = fs.readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const e = JSON.parse(line) as ArchivedTranscript;
        if (typeof e.rawTranscript !== 'string' || this.hashOf(e.rawTranscript) !== e.transcriptSha256) {
          this.loadProblems.push(`line ${i + 1} (${e.videoId ?? '?'}): text does not match its hash; ignored`);
          return;
        }
        this.byVideo.set(e.videoId, e);
      } catch {
        this.loadProblems.push(`line ${i + 1}: not JSON; ignored`);
      }
    });
  }

  get size() {
    return this.byVideo.size;
  }

  // One line per archived video, newest first (no transcript text).
  list(): { videoId: string; title: string; source: ArchivedTranscript['source']; model: string | null; at: string; words: number; segments: number; imported: boolean }[] {
    return [...this.byVideo.values()]
      .map((e) => ({
        videoId: e.videoId,
        title: e.title,
        source: e.source,
        model: e.model,
        at: e.at,
        words: e.rawTranscript.split(/\s+/).filter(Boolean).length,
        segments: e.segments.length,
        imported: !!e.importedAt,
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  get(videoId: string): ArchivedTranscript | null {
    return this.byVideo.get(videoId) ?? null;
  }

  // Keeps a transcript. Returns false if nothing new was stored.
  put(v: IngestedVideo, at = new Date()): boolean {
    if (!v.rawTranscript || v.transcriptSource === 'unavailable') return false;
    const transcriptSha256 = this.hashOf(v.rawTranscript);
    const prev = this.byVideo.get(v.youtubeId);
    if (prev && prev.transcriptSha256 === transcriptSha256 && prev.source === v.transcriptSource) return false;
    const e: ArchivedTranscript = {
      videoId: v.youtubeId,
      title: v.title,
      ...(v.channel ? { channel: v.channel } : {}),
      ...(v.duration ? { duration: v.duration } : {}),
      source: v.transcriptSource,
      model: v.transcriptMethod?.model ?? null,
      via: v.transcriptMethod?.via ?? 'youtube caption track',
      at: v.transcriptMethod?.at ?? at.toISOString(),
      ...(v.transcriptLanguage ? { language: v.transcriptLanguage } : {}),
      transcriptSha256,
      rawTranscript: v.rawTranscript,
      segments: v.segments,
    };
    if (this.path) {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.appendFileSync(this.path, JSON.stringify(e) + '\n');
    }
    this.byVideo.set(e.videoId, e);
    return true;
  }

  // Everything in the archive, as one file the owner can keep (a phone's
  // Downloads, Google Drive) and restore later.
  exportFile(now = new Date()) {
    const entries = [...this.byVideo.values()].sort((a, b) => a.at.localeCompare(b.at));
    return { format: ARCHIVE_FILE_FORMAT, exportedAt: now.toISOString(), count: entries.length, entries };
  }

  // Restores entries from an archive file. Each entry must be well formed and
  // its text must match its hash; anything else is rejected with the reason,
  // never repaired. If this archive already holds a different transcript of the
  // same video, the one here is kept and that is reported.
  importFile(file: unknown, now = new Date()): ImportResult {
    const out: ImportResult = { added: [], alreadyHere: 0, keptLocal: [], rejected: [] };
    const f = file as any;
    if (!f || typeof f !== 'object' || f.format !== ARCHIVE_FILE_FORMAT || !Array.isArray(f.entries)) {
      out.rejected.push({ entry: 0, videoId: null, why: `not an AetherShell transcript archive (expected format "${ARCHIVE_FILE_FORMAT}")` });
      return out;
    }
    f.entries.forEach((e: any, i: number) => {
      const n = i + 1;
      const videoId = typeof e?.videoId === 'string' ? e.videoId : null;
      const why =
        !videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)
          ? 'no valid 11-character video id'
          : !SOURCES.includes(e.source)
          ? `unknown source "${String(e.source)}"`
          : typeof e.rawTranscript !== 'string' || !e.rawTranscript || e.rawTranscript.length > MAX_TRANSCRIPT_CHARS
          ? 'no transcript text, or too long'
          : !Array.isArray(e.segments)
          ? 'no segments list'
          : this.hashOf(e.rawTranscript) !== e.transcriptSha256
          ? 'the text does not match its hash (edited or damaged)'
          : null;
      if (why) {
        out.rejected.push({ entry: n, videoId, why });
        return;
      }
      const here = this.byVideo.get(videoId!);
      if (here?.transcriptSha256 === e.transcriptSha256) {
        out.alreadyHere++;
        return;
      }
      if (here) {
        out.keptLocal.push({ videoId: videoId!, title: here.title });
        return;
      }
      const entry: ArchivedTranscript = {
        videoId: videoId!,
        title: typeof e.title === 'string' && e.title ? e.title.slice(0, 300) : videoId!,
        ...(typeof e.channel === 'string' && e.channel ? { channel: e.channel.slice(0, 200) } : {}),
        ...(typeof e.duration === 'string' && e.duration ? { duration: e.duration.slice(0, 16) } : {}),
        source: e.source,
        model: typeof e.model === 'string' ? e.model.slice(0, 200) : null,
        via: typeof e.via === 'string' ? e.via.slice(0, 200) : 'unknown',
        at: typeof e.at === 'string' ? e.at.slice(0, 40) : now.toISOString(),
        ...(typeof e.language === 'string' ? { language: e.language.slice(0, 20) } : {}),
        transcriptSha256: e.transcriptSha256,
        rawTranscript: e.rawTranscript,
        segments: e.segments
          .filter((s: any) => s && typeof s === 'object')
          .map((s: any, j: number) => ({
            id: String(s.id ?? `seg-${j + 1}`),
            start: String(s.start ?? ''),
            end: String(s.end ?? ''),
            speaker: String(s.speaker ?? 'Speaker'),
            text: String(s.text ?? ''),
          })),
        importedAt: now.toISOString(),
      };
      if (this.path) {
        fs.mkdirSync(path.dirname(this.path), { recursive: true });
        fs.appendFileSync(this.path, JSON.stringify(entry) + '\n');
      }
      this.byVideo.set(entry.videoId, entry);
      out.added.push(entry);
    });
    return out;
  }

  // The archived transcript applied to a freshly listed video (title/channel
  // from the listing, text and source from the archive).
  restore(base: IngestedVideo, e: ArchivedTranscript): IngestedVideo {
    return {
      ...base,
      title: base.title && base.title !== base.youtubeId ? base.title : e.title,
      channel: base.channel || e.channel || '',
      duration: base.duration || e.duration || '',
      segments: e.segments,
      rawTranscript: e.rawTranscript,
      transcriptSource: e.source,
      transcriptMethod: { ...(e.model ? { model: e.model } : {}), via: e.importedAt ? `${e.via} (restored from an archive file)` : e.via, at: e.at },
      ...(e.language ? { transcriptLanguage: e.language } : {}),
      transcriptError: undefined,
      transcriptRefusal: undefined,
      fromArchive: true,
    };
  }
}

// How long to wait before retrying after a per-minute rate limit: what the
// provider asked for ("retry in 33s" / "retryDelay":"33s"), capped; else 30s.
export function retryDelaySeconds(err: unknown, cap = 60): number {
  const text = String((err as any)?.message ?? err);
  const m = text.match(/retry(?:Delay)?["':\s]*(?:in\s*)?["']?(\d+(?:\.\d+)?)\s*s/i);
  const s = m ? Math.ceil(Number(m[1])) : 30;
  return Math.min(cap, Math.max(1, s));
}
