import { fetchTranscript, type FetchParams, type TranscriptSegment as YtSegment } from 'youtube-transcript-plus';

// Real YouTube ingestion: transcripts come from the video's caption track, and
// playlist contents come from the YouTube Data API. Nothing here generates text.

export interface TranscriptSegment {
  id: string;
  start: string;
  end: string;
  speaker: string;
  text: string;
}

export interface IngestedVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  duration: string;
  url: string;
  segments: TranscriptSegment[];
  rawTranscript: string;
  // How the transcript was obtained (server/transcribe.ts). Never 'youtube-captions' unless it was.
  transcriptSource: 'youtube-captions' | 'model-transcription' | 'owner-provided' | 'unavailable';
  transcriptMethod?: { model?: string; via: string; at: string };
  transcriptLanguage?: string;
  transcriptError?: string;
  transcriptRefusal?: YouTubeRefusalKind; // set when YouTube refused the server rather than the video lacking captions
  uploadDate?: string; // ISO 8601, only when the YouTube Data API provided it
}

export type ParsedYouTubeUrl = { kind: 'video'; videoId: string } | { kind: 'playlist'; playlistId: string };

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl {
  const trimmed = input.trim();
  if (VIDEO_ID_RE.test(trimmed)) return { kind: 'video', videoId: trimmed };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Not a valid YouTube URL');
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') {
    throw new Error('Only youtube.com and youtu.be URLs are supported');
  }

  let videoId: string | null = null;
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || null;
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v');
  } else {
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/);
    if (m) videoId = m[1];
  }
  if (videoId) {
    if (!VIDEO_ID_RE.test(videoId)) throw new Error('Invalid YouTube video id');
    return { kind: 'video', videoId };
  }

  const list = url.searchParams.get('list');
  if (list) {
    if (!PLAYLIST_ID_RE.test(list)) throw new Error('Invalid YouTube playlist id');
    return { kind: 'playlist', playlistId: list };
  }
  throw new Error('Could not find a video or playlist id in the URL');
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

const ENTITY_MAP: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITY_MAP[m] ?? m);
}

// Caption cues are a few seconds long; group them into ~30s segments for reading.
export function groupCaptionCues(cues: YtSegment[], windowSeconds = 30): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let buf: string[] = [];
  let start = 0;
  let end = 0;
  const flush = () => {
    if (buf.length === 0) return;
    out.push({
      id: `seg-${out.length + 1}`,
      start: formatTimestamp(start),
      end: formatTimestamp(end),
      speaker: 'Captions',
      text: buf.join(' ').replace(/\s+/g, ' ').trim(),
    });
    buf = [];
  };
  for (const cue of cues) {
    const text = decodeEntities(cue.text || '').trim();
    if (!text) continue;
    if (buf.length === 0) start = cue.offset;
    buf.push(text);
    end = cue.offset + cue.duration;
    if (end - start >= windowSeconds) flush();
  }
  flush();
  return out;
}

export function segmentsToRaw(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${s.start} - ${s.end}] ${s.speaker}: ${s.text}`).join('\n\n');
}

// --- What YouTube actually said --------------------------------------------------
//
// From cloud servers (AI Studio, Colab, Cloud Run) YouTube often answers
// "Sign in to confirm you're not a bot" instead of the video. The caption
// library reports that as "no transcripts are available ... the video does not
// have captions", which sends people looking for a captions problem that is
// not there. These hooks read YouTube's own answer and report it as it is.

export type YouTubeRefusalKind = 'bot-check' | 'consent' | 'rate-limit' | 'restricted' | 'unavailable';

export class YouTubeRefusalError extends Error {
  constructor(readonly kind: YouTubeRefusalKind, readonly reason: string) {
    super(
      kind === 'bot-check'
        ? `YouTube refused this server ("${reason}"). YouTube does this to many cloud servers (AI Studio, Colab, Cloud Run); the video's captions were never seen. To ingest it, run the server from a home or mobile connection instead of a cloud server.`
        : kind === 'consent'
        ? 'YouTube answered with its cookie-consent page instead of the video (common for servers in the EU); the captions were never seen.'
        : kind === 'rate-limit'
        ? 'YouTube is rate-limiting this server (too many requests); try again later.'
        : `YouTube: ${reason}`
    );
  }
}

const BOT_RE = /confirm (that )?you('|’)?re not a bot|sign in to confirm/i;

export function classifyPlayability(ps: any): YouTubeRefusalError | null {
  const status = String(ps?.status ?? '');
  if (!status || status === 'OK') return null;
  const reason = String(ps?.reason || ps?.messages?.[0] || ps?.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText || status);
  if (BOT_RE.test(reason) || (status === 'LOGIN_REQUIRED' && !/private|age/i.test(reason))) return new YouTubeRefusalError('bot-check', reason);
  if (status === 'LOGIN_REQUIRED' || status === 'AGE_CHECK_REQUIRED' || status === 'CONTENT_CHECK_REQUIRED') return new YouTubeRefusalError('restricted', reason);
  return new YouTubeRefusalError('unavailable', reason);
}

export function classifyWatchPage(finalUrl: string, html: string): YouTubeRefusalError | null {
  if (/consent\.youtube\.com|consent\.google\./.test(finalUrl) || html.includes('action="https://consent.youtube.com')) return new YouTubeRefusalError('consent', 'consent page');
  if (html.includes('class="g-recaptcha"') || /\/sorry\/index/.test(finalUrl)) return new YouTubeRefusalError('rate-limit', 'captcha');
  if (BOT_RE.test(html) && !html.includes('INNERTUBE_API_KEY')) return new YouTubeRefusalError('bot-check', "Sign in to confirm you're not a bot");
  return null;
}

function plainFetch(p: FetchParams) {
  return fetch(p.url, {
    method: p.method ?? 'GET',
    headers: {
      'User-Agent':
        p.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(p.lang ? { 'Accept-Language': p.lang } : {}),
      ...(p.headers ?? {}),
    },
    body: p.body,
    signal: p.signal,
  });
}

// Hooks for the caption library: same requests, but YouTube's refusals are named.
export function inspectingFetchers(doFetch: (p: FetchParams) => Promise<Response> = plainFetch) {
  return {
    videoFetch: async (p: FetchParams) => {
      const res = await doFetch(p);
      if (res.status === 429) throw new YouTubeRefusalError('rate-limit', 'HTTP 429');
      const refusal = classifyWatchPage(res.url || p.url, await res.clone().text());
      if (refusal) throw refusal;
      return res;
    },
    playerFetch: async (p: FetchParams) => {
      const res = await doFetch(p);
      if (res.status === 429) throw new YouTubeRefusalError('rate-limit', 'HTTP 429');
      const json = await res.clone().json().catch(() => null);
      const refusal = classifyPlayability(json?.playabilityStatus);
      if (refusal) throw refusal;
      return res;
    },
    transcriptFetch: (p: FetchParams) => doFetch(p),
  };
}

// Why videos came back without transcripts, grouped, worst first. A refusal of
// the server (bot check, consent page, rate limit) is named as such, because the
// fix is where the server runs, not the videos.
export function summarizeTranscriptFailures(videos: IngestedVideo[]): string | null {
  const failed = videos.filter((v) => v.transcriptSource !== 'youtube-captions');
  if (!failed.length) return null;
  const refused = failed.filter((v) => v.transcriptRefusal && v.transcriptRefusal !== 'restricted' && v.transcriptRefusal !== 'unavailable');
  const groups = new Map<string, number>();
  for (const v of failed) {
    const key = v.transcriptError || 'Transcript unavailable';
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const lines = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([msg, n]) => `${n} of ${videos.length}: ${msg}`);
  const head =
    refused.length === failed.length
      ? `YouTube refused this server for all ${failed.length} video(s) without a transcript; the videos were not checked for captions.`
      : `${failed.length} of ${videos.length} video(s) have no transcript.`;
  return [head, ...lines.slice(0, 4)].join(' ');
}

export async function fetchVideoTranscript(
  videoId: string,
  meta: { title?: string; channel?: string } = {},
  lang = process.env.YOUTUBE_TRANSCRIPT_LANG || undefined,
  doFetch?: (p: FetchParams) => Promise<Response> // tests inject YouTube's answers here
): Promise<IngestedVideo> {
  const base: IngestedVideo = {
    id: `yt-${videoId}`,
    youtubeId: videoId,
    title: meta.title || videoId,
    channel: meta.channel || '',
    duration: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    segments: [],
    rawTranscript: '',
    transcriptSource: 'unavailable',
  };
  try {
    const result = await fetchTranscript(videoId, { videoDetails: true, lang, retries: 1, ...inspectingFetchers(doFetch) });
    const segments = groupCaptionCues(result.segments);
    if (segments.length === 0) throw new Error('Caption track is empty');
    return {
      ...base,
      title: result.videoDetails.title || base.title,
      channel: result.videoDetails.author || base.channel,
      duration: result.videoDetails.lengthSeconds ? formatTimestamp(result.videoDetails.lengthSeconds) : '',
      segments,
      rawTranscript: segmentsToRaw(segments),
      transcriptSource: 'youtube-captions',
      transcriptLanguage: result.segments[0]?.lang,
    };
  } catch (err: any) {
    return {
      ...base,
      transcriptError: err?.message || 'Transcript unavailable',
      ...(err instanceof YouTubeRefusalError ? { transcriptRefusal: err.kind } : {}),
    };
  }
}

export interface PlaylistListing {
  title: string;
  description: string;
  items: { videoId: string; title: string; channel: string; uploadDate?: string; duration?: string }[];
  source: 'youtube-data-api' | 'youtube-page';
}

export async function fetchPlaylistListing(playlistId: string, maxVideos: number, apiKey: string): Promise<PlaylistListing> {
  const api = 'https://www.googleapis.com/youtube/v3';
  const metaRes = await fetch(`${api}/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`);
  if (!metaRes.ok) throw new Error(`YouTube Data API returned HTTP ${metaRes.status} for playlist metadata`);
  const meta: any = await metaRes.json();
  const snippet = meta.items?.[0]?.snippet;
  if (!snippet) throw new Error('Playlist not found or is private');

  const items: PlaylistListing['items'] = [];
  let pageToken = '';
  while (items.length < maxVideos) {
    const pageSize = Math.min(50, maxVideos - items.length);
    const res = await fetch(
      `${api}/playlistItems?part=snippet,contentDetails&maxResults=${pageSize}&playlistId=${encodeURIComponent(playlistId)}` +
        `&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    );
    if (!res.ok) throw new Error(`YouTube Data API returned HTTP ${res.status} for playlist items`);
    const page: any = await res.json();
    for (const it of page.items || []) {
      const vid = it.snippet?.resourceId?.videoId;
      if (vid && VIDEO_ID_RE.test(vid)) {
        items.push({
          videoId: vid,
          title: it.snippet.title || vid,
          channel: it.snippet.videoOwnerChannelTitle || '',
          uploadDate: it.contentDetails?.videoPublishedAt || undefined,
        });
      }
    }
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return { title: snippet.title || playlistId, description: snippet.description || '', items, source: 'youtube-data-api' };
}

// ISO 8601 duration (PT1H2M3S) -> seconds.
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

// Upload date and duration for up to 50 ids per request (YouTube Data API).
export async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string
): Promise<Record<string, { uploadDate?: string; duration?: string; title?: string; channel?: string }>> {
  const out: Record<string, { uploadDate?: string; duration?: string; title?: string; channel?: string }> = {};
  const ids = videoIds.filter((id) => VIDEO_ID_RE.test(id));
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch.join(',')}&key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) throw new Error(`YouTube Data API returned HTTP ${res.status} for video details`);
    const data: any = await res.json();
    for (const it of data.items || []) {
      const secs = parseIsoDuration(it.contentDetails?.duration);
      out[it.id] = {
        uploadDate: it.snippet?.publishedAt || undefined,
        duration: secs !== null ? formatTimestamp(secs) : undefined,
        title: it.snippet?.title,
        channel: it.snippet?.channelTitle,
      };
    }
  }
  return out;
}

// Fallback when no YOUTUBE_API_KEY is set: read the playlist page's embedded
// ytInitialData for video ids and titles. Lists real videos only; transcripts
// still come from caption tracks. YouTube can change this markup at any time.
export async function scrapePlaylistListing(playlistId: string, maxVideos: number): Promise<PlaylistListing> {
  const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new YouTubeRefusalError('rate-limit', 'HTTP 429');
  if (!res.ok) throw new Error(`YouTube returned HTTP ${res.status} for the playlist page`);
  const html = await res.text();
  const refusal = classifyWatchPage(res.url, html);
  if (refusal && !html.includes('var ytInitialData = ')) throw refusal;
  return parsePlaylistPage(html, maxVideos, playlistId);
}

export function parsePlaylistPage(html: string, maxVideos: number, playlistId = ''): PlaylistListing {
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('Playlist page did not contain playlist data (private, removed, or markup changed)');
  const end = html.indexOf(';</script>', start);
  if (end === -1) throw new Error('Playlist page data was truncated');
  const data = JSON.parse(html.slice(start + marker.length, end));

  const items: PlaylistListing['items'] = [];
  const seen = new Set<string>();
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || items.length >= maxVideos) return;
    const v = node.playlistVideoRenderer;
    if (v?.videoId && VIDEO_ID_RE.test(v.videoId) && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      const secs = Number(v.lengthSeconds);
      items.push({
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text || v.title?.simpleText || v.videoId,
        channel: v.shortBylineText?.runs?.[0]?.text || '',
        duration: v.lengthText?.simpleText || (Number.isFinite(secs) && secs > 0 ? formatTimestamp(secs) : undefined),
      });
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  if (items.length === 0) throw new Error('No videos found on the playlist page');

  const meta = data.metadata?.playlistMetadataRenderer;
  return {
    title: meta?.title || data.header?.playlistHeaderRenderer?.title?.simpleText || playlistId,
    description: meta?.description || '',
    items,
    source: 'youtube-page',
  };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
