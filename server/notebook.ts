import crypto from 'crypto';
import type { IngestedVideo, TranscriptSegment } from './youtube';
import { resolveGitHubFile } from './github';
import { segmentsToRawText } from './transcribe';

// Jupyter / Google Colab notebooks (.ipynb) as sources, next to video
// transcripts. A notebook becomes one segment per cell: its text, its code and
// its printed output, cited as [Video N @ cell K]. Nothing in it is ever run:
// code is text here, HTML and JavaScript outputs are not rendered, and image
// outputs are left out (and counted).

export const NOTEBOOK_ID_RE = /^nb-[0-9a-f]{16}$/;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_CELLS = 3000;
const MAX_TEXT = 2_000_000;
const MAX_OUTPUT = 5000; // characters kept per output
export const MAX_NOTEBOOK_BYTES = 10 * 1024 * 1024;

// A source in the archive and in sets: a YouTube video id or a notebook id.
export function isSourceId(id: unknown): id is string {
  return typeof id === 'string' && (YOUTUBE_ID_RE.test(id) || NOTEBOOK_ID_RE.test(id));
}

const joinSource = (s: unknown) => (Array.isArray(s) ? s.map(String).join('') : typeof s === 'string' ? s : '');
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const cap = (s: string) => (s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n[output cut: ${s.length} characters]` : s);

export interface ParsedNotebook {
  title: string;
  segments: TranscriptSegment[];
  rawTranscript: string;
  cells: number;
  leftOut: { images: number; html: number }; // outputs not included as text
}

// Checks and reads a notebook. Anything that is not a notebook is rejected
// with the reason, never repaired.
export function parseNotebook(json: unknown, fallbackTitle = 'Notebook'): ParsedNotebook | { error: string } {
  const nb = json as any;
  if (!nb || typeof nb !== 'object') return { error: 'not a notebook (expected JSON with a "cells" list)' };
  if (!Array.isArray(nb.cells)) {
    return { error: Array.isArray(nb.worksheets) ? 'this is an old (version 3) notebook; open and save it in Colab or Jupyter first' : 'not a notebook (no "cells" list)' };
  }
  if (nb.cells.length > MAX_CELLS) return { error: `too many cells (${nb.cells.length}; the limit is ${MAX_CELLS})` };

  const leftOut = { images: 0, html: 0 };
  const segments: TranscriptSegment[] = [];
  nb.cells.forEach((cell: any, i: number) => {
    const n = i + 1;
    const type = cell?.cell_type === 'code' ? 'code' : cell?.cell_type === 'markdown' ? 'markdown' : 'raw';
    let text = joinSource(cell?.source).replace(/\r\n/g, '\n').trim();
    if (type === 'code' && Array.isArray(cell?.outputs)) {
      const outs: string[] = [];
      for (const o of cell.outputs) {
        if (o?.output_type === 'stream') outs.push(joinSource(o.text));
        else if (o?.output_type === 'error') outs.push(`${o.ename ?? 'Error'}: ${o.evalue ?? ''}`);
        else if (o?.data && typeof o.data === 'object') {
          if (o.data['text/plain'] !== undefined) outs.push(joinSource(o.data['text/plain']));
          if (Object.keys(o.data).some((k) => k.startsWith('image/'))) leftOut.images++;
          if (o.data['text/html'] !== undefined || o.data['application/javascript'] !== undefined) leftOut.html++;
        }
      }
      const out = stripAnsi(outs.join('\n')).trim();
      if (out) text += `\n[output]\n${cap(out)}`;
    }
    if (text) segments.push({ id: `cell-${n}`, start: `cell ${n}`, end: '', speaker: type, text });
  });
  if (!segments.length) return { error: 'the notebook has no text, code or output' };

  const rawTranscript = segmentsToRawText(segments);
  if (rawTranscript.length > MAX_TEXT) return { error: `the notebook's text is too long (${rawTranscript.length} characters; the limit is ${MAX_TEXT})` };
  const heading = segments.find((s) => s.speaker === 'markdown')?.text.match(/^#+\s+(.+)$/m)?.[1];
  const title = String(nb.metadata?.colab?.name || heading || fallbackTitle).replace(/\.ipynb$/i, '').slice(0, 200);
  return { title, segments, rawTranscript, cells: nb.cells.length, leftOut };
}

// The same notebook text always gets the same id.
export function notebookId(rawTranscript: string): string {
  return `nb-${crypto.createHash('sha256').update(rawTranscript, 'utf8').digest('hex').slice(0, 16)}`;
}

export function notebookSource(p: ParsedNotebook, origin: { via: string; url?: string }, at = new Date()): IngestedVideo {
  const id = notebookId(p.rawTranscript);
  return {
    id,
    youtubeId: id,
    title: p.title,
    channel: 'Notebook',
    duration: `${p.cells} cells`,
    url: origin.url ?? '',
    segments: p.segments,
    rawTranscript: p.rawTranscript,
    transcriptSource: 'notebook',
    transcriptMethod: { via: origin.via, at: at.toISOString() },
    kind: 'notebook',
  };
}

// Where to fetch a notebook link from. Only URLs built here are ever fetched:
// raw.githubusercontent.com for GitHub (and Colab's GitHub links), and Google
// Drive's download address for Drive (and Colab's Drive links), which works
// only for notebooks shared as "Anyone with the link".
export function resolveNotebookUrl(input: string): { fetchUrl: string; via: string; url: string } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error('Not a valid URL');
  }
  if (u.protocol !== 'https:') throw new Error('Only https links are allowed');
  const parts = u.pathname.split('/').filter(Boolean);
  const driveId = (id: string | null | undefined) => {
    if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new Error('That Google Drive link has no valid file id');
    return { fetchUrl: `https://drive.google.com/uc?export=download&id=${id}`, via: 'Google Drive (shared link)', url: u.toString() };
  };
  if (u.hostname === 'colab.research.google.com') {
    if (parts[0] === 'drive') return driveId(parts[1]);
    if (parts[0] === 'github') {
      const ref = resolveGitHubFile(`https://github.com/${parts.slice(1).join('/')}`);
      return { fetchUrl: ref.rawUrl, via: 'GitHub', url: u.toString() };
    }
    throw new Error('Unsupported Colab link: use a /drive/… or /github/… notebook link');
  }
  if (u.hostname === 'drive.google.com') {
    if (parts[0] === 'file' && parts[1] === 'd') return driveId(parts[2]);
    return driveId(u.searchParams.get('id'));
  }
  if (['github.com', 'www.github.com', 'raw.githubusercontent.com'].includes(u.hostname)) {
    const ref = resolveGitHubFile(u.toString());
    if (!/\.ipynb$/i.test(ref.path)) throw new Error('That GitHub file is not a .ipynb notebook');
    return { fetchUrl: ref.rawUrl, via: 'GitHub', url: u.toString() };
  }
  throw new Error('Only Colab, Google Drive and GitHub notebook links are supported; or upload the .ipynb file');
}

const FETCH_HOSTS = new Set(['raw.githubusercontent.com', 'drive.google.com', 'drive.usercontent.google.com']);

// Fetches a resolved notebook URL, following redirects only between the hosts
// above, and reading at most MAX_NOTEBOOK_BYTES.
export async function fetchNotebook(fetchUrl: string, doFetch: typeof fetch = fetch): Promise<unknown> {
  let url = fetchUrl;
  for (let hop = 0; hop < 5; hop++) {
    const host = new URL(url).hostname;
    if (!FETCH_HOSTS.has(host)) throw new Error(`refused to follow a redirect to ${host}`);
    const res = await doFetch(url, { redirect: 'manual', headers: { Accept: 'application/json' } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) throw new Error('redirect without a location');
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(res.status === 404 ? 'not found (is the link right, and the notebook public?)' : `the server answered ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_NOTEBOOK_BYTES) throw new Error('the notebook is larger than 10 MB');
    const text = await res.text();
    if (text.length > MAX_NOTEBOOK_BYTES) throw new Error('the notebook is larger than 10 MB');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        /<html/i.test(text.slice(0, 500))
          ? 'Google returned a web page instead of the file: the notebook is probably not shared as "Anyone with the link" (or is too large for direct download). Download it as .ipynb and upload it instead.'
          : 'the file is not JSON, so not a notebook'
      );
    }
  }
  throw new Error('too many redirects');
}
