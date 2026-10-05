// "Sign in with Google" playlist picker, server side.
//
// The sign-in happens in the browser (Google Identity Services, scope
// youtube.readonly); the browser lists the owner's playlists with that token and
// sends only the chosen video ids here. The Google token never reaches this
// server. GOOGLE_OAUTH_CLIENT_ID is public by design (it identifies the app, it
// is not a secret); without it the picker is hidden.

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

export function googleClientId(env: NodeJS.ProcessEnv): string | null {
  const id = (env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}

export interface PickedIngest {
  playlistId: string | null;
  title: string;
  items: { videoId: string; title?: string; channel?: string }[];
}

// Checks what the browser sends: ids are checked, text is trimmed and capped,
// duplicates are dropped, at most `max` videos are taken. Rejected, not repaired.
export function sanitizePickedIngest(body: unknown, max: number): PickedIngest | { error: string } {
  const b = body as any;
  const raw = Array.isArray(b?.items) ? b.items : null;
  if (!raw || !raw.length) return { error: 'items: a list of { videoId, title?, channel? } is required' };
  const seen = new Set<string>();
  const items: PickedIngest['items'] = [];
  for (const it of raw) {
    const id = typeof it?.videoId === 'string' ? it.videoId : '';
    if (!VIDEO_ID_RE.test(id)) return { error: `not a YouTube video id: ${JSON.stringify(String(it?.videoId ?? '')).slice(0, 40)}` };
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      videoId: id,
      ...(typeof it.title === 'string' && it.title.trim() ? { title: it.title.trim().slice(0, 300) } : {}),
      ...(typeof it.channel === 'string' && it.channel.trim() ? { channel: it.channel.trim().slice(0, 200) } : {}),
    });
    if (items.length >= max) break;
  }
  const playlistId = typeof b.playlistId === 'string' && PLAYLIST_ID_RE.test(b.playlistId) ? b.playlistId : null;
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 200) : 'My YouTube selection';
  return { playlistId, title, items };
}
