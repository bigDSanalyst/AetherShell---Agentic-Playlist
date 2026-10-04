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
  source: 'youtube-captions' | 'model-transcription' | 'owner-provided';
  model: string | null;
  via: string;
  at: string;
  language?: string;
  transcriptSha256: string;
  rawTranscript: string;
  segments: TranscriptSegment[];
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

  // The archived transcript applied to a freshly listed video (title/channel
  // from the listing, text and source from the archive).
  restore(base: IngestedVideo, e: ArchivedTranscript): IngestedVideo {
    return {
      ...base,
      title: base.title && base.title !== base.youtubeId ? base.title : e.title,
      segments: e.segments,
      rawTranscript: e.rawTranscript,
      transcriptSource: e.source,
      transcriptMethod: { ...(e.model ? { model: e.model } : {}), via: e.via, at: e.at },
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
