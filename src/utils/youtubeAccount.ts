// "Sign in with Google" to pick playlists from your own YouTube account.
//
// Google Identity Services gives this browser a read-only YouTube token
// (scope youtube.readonly, about an hour). The browser lists playlists with it
// directly from the YouTube Data API; the token is kept in memory only and is
// never sent to the AetherShell server. Only the chosen video ids are.

export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';

export interface MyPlaylist {
  id: string;
  title: string;
  count: number | null;
  privacy: string; // public | unlisted | private | likes
  thumbnail: string | null;
}

export interface PickedVideo {
  videoId: string;
  title: string;
  channel: string;
  privacy: string; // public | unlisted | private | unknown
}

// --- pure parsing (tested) -------------------------------------------------

export function parsePlaylists(json: any): { playlists: MyPlaylist[]; next: string | null } {
  const items = Array.isArray(json?.items) ? json.items : [];
  return {
    playlists: items
      .filter((p: any) => typeof p?.id === 'string')
      .map((p: any) => ({
        id: p.id,
        title: String(p.snippet?.title || 'Untitled playlist'),
        count: Number.isFinite(p.contentDetails?.itemCount) ? p.contentDetails.itemCount : null,
        privacy: String(p.status?.privacyStatus || 'unknown'),
        thumbnail: p.snippet?.thumbnails?.default?.url ?? null,
      })),
    next: typeof json?.nextPageToken === 'string' ? json.nextPageToken : null,
  };
}

// Deleted and private videos (that the account cannot see) come back as
// placeholders without a usable id or title; they are dropped and counted.
export function parsePlaylistItems(json: any): { videos: PickedVideo[]; skipped: number; next: string | null } {
  const items = Array.isArray(json?.items) ? json.items : [];
  let skipped = 0;
  const videos: PickedVideo[] = [];
  for (const it of items) {
    const id = it?.contentDetails?.videoId ?? it?.snippet?.resourceId?.videoId;
    const title = String(it?.snippet?.title || '');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id) || title === 'Deleted video' || title === 'Private video') {
      skipped++;
      continue;
    }
    videos.push({ videoId: id, title, channel: String(it?.snippet?.videoOwnerChannelTitle || ''), privacy: String(it?.status?.privacyStatus || 'unknown') });
  }
  return { videos, skipped, next: typeof json?.nextPageToken === 'string' ? json.nextPageToken : null };
}

export function likesPlaylistId(channelsJson: any): string | null {
  const id = channelsJson?.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  return typeof id === 'string' && id ? id : null;
}

// --- browser side ------------------------------------------------------------

declare global {
  interface Window {
    google?: any;
  }
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error('Could not load Google sign-in (blocked by the browser or the network?)'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

// Opens Google's consent popup; resolves with an access token held in memory.
export async function signInToYouTube(clientId: string): Promise<{ token: string; expiresAt: number }> {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: YT_SCOPE,
      callback: (r: any) => {
        if (r?.error || !r?.access_token) return reject(new Error(r?.error_description || r?.error || 'Sign-in was cancelled'));
        resolve({ token: r.access_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
      },
      error_callback: (e: any) => reject(new Error(e?.message || e?.type || 'Sign-in failed or the popup was blocked')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function signOutOfYouTube(token: string): void {
  try {
    window.google?.accounts?.oauth2?.revoke(token, () => {});
  } catch {}
}

async function yt(path: string, token: string): Promise<any> {
  const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || res.status;
    throw new Error(
      res.status === 401 ? 'Your Google sign-in has expired; sign in again.' : reason === 'accessNotConfigured' ? 'The YouTube Data API is not enabled for this sign-in client\'s Google Cloud project.' : `YouTube refused: ${body?.error?.message || reason}`
    );
  }
  return body;
}

// Your playlists (all pages, up to 200), with "Liked videos" first.
export async function listMyPlaylists(token: string): Promise<MyPlaylist[]> {
  const out: MyPlaylist[] = [];
  const likes = likesPlaylistId(await yt('channels?part=contentDetails&mine=true', token));
  if (likes) out.push({ id: likes, title: 'Liked videos', count: null, privacy: 'likes', thumbnail: null });
  let page: string | null = null;
  do {
    const r = parsePlaylists(await yt(`playlists?part=snippet,contentDetails,status&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`, token));
    out.push(...r.playlists);
    page = r.next;
  } while (page && out.length < 200);
  return out;
}

export async function listPlaylistVideos(token: string, playlistId: string, max: number): Promise<{ videos: PickedVideo[]; skipped: number }> {
  const videos: PickedVideo[] = [];
  let skipped = 0;
  let page: string | null = null;
  do {
    const r = parsePlaylistItems(
      await yt(`playlistItems?part=snippet,contentDetails,status&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${page ? `&pageToken=${page}` : ''}`, token)
    );
    videos.push(...r.videos);
    skipped += r.skipped;
    page = r.next;
  } while (page && videos.length < max);
  return { videos: videos.slice(0, max), skipped };
}
