import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, ListVideo } from 'lucide-react';
import { fetchGoogleClientId } from '../services/api';
import { listMyPlaylists, listPlaylistVideos, signInToYouTube, signOutOfYouTube, type MyPlaylist } from '../utils/youtubeAccount';

// Pick playlists from your own YouTube account (including private ones and
// Liked videos). The Google token stays in this browser, in memory; only the
// chosen video ids are sent to the server.
export const YouTubeAccountPicker: React.FC<{
  isLoading: boolean;
  maxVideos?: number;
  onPick: (p: { playlistId: string; title: string; items: { videoId: string; title: string; channel: string }[]; skipped: number; nonPublic: number }) => void;
}> = ({ isLoading, maxVideos = 25, onPick }) => {
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  const [playlists, setPlaylists] = useState<MyPlaylist[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGoogleClientId().then(setClientId).catch(() => setClientId(null));
  }, []);

  if (clientId === undefined) return null;
  if (clientId === null) {
    return (
      <p className="mt-1 text-[10px] font-mono text-slate-500">
        To pick from your own YouTube playlists (including private ones), the owner sets GOOGLE_OAUTH_CLIENT_ID (see the README).
      </p>
    );
  }

  const live = session && session.expiresAt > Date.now() + 30_000 ? session : null;

  const signIn = async () => {
    setError(null);
    setBusy('Signing in…');
    try {
      const s = await signInToYouTube(clientId);
      setSession(s);
      setBusy('Loading your playlists…');
      setPlaylists(await listMyPlaylists(s.token));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const signOut = () => {
    if (session) signOutOfYouTube(session.token);
    setSession(null);
    setPlaylists(null);
  };

  const pick = async (p: MyPlaylist) => {
    if (!live) return signIn();
    setError(null);
    setBusy(`Reading "${p.title}"…`);
    try {
      const { videos, skipped } = await listPlaylistVideos(live.token, p.id, maxVideos);
      if (!videos.length) throw new Error(`"${p.title}" has no videos this account can see.`);
      onPick({
        playlistId: p.id,
        title: p.title,
        items: videos.map((v) => ({ videoId: v.videoId, title: v.title, channel: v.channel })),
        skipped,
        nonPublic: videos.filter((v) => v.privacy !== 'public').length,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          <button type="button" onClick={signOut} className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-[11px] font-mono flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" /> Sign out of YouTube
          </button>
        ) : (
          <button
            type="button"
            onClick={signIn}
            disabled={!!busy || isLoading}
            className="px-2.5 py-1 rounded-lg border border-red-800/60 bg-red-950/40 text-red-200 text-[11px] font-mono flex items-center gap-1.5 disabled:opacity-50"
            title="Read-only access to your YouTube playlists; the sign-in stays in this browser"
          >
            <LogIn className="w-3.5 h-3.5" /> Sign in with Google to pick your playlists
          </button>
        )}
        {busy && <span className="text-[11px] font-mono text-slate-400">{busy}</span>}
      </div>
      {error && <p className="text-[11px] font-mono text-rose-300">{error}</p>}
      {live && playlists && (
        <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1 max-h-56 overflow-y-auto">
          <p className="text-[10px] font-mono text-slate-500 px-1">
            Pick one to ingest (up to {maxVideos} videos). Private and unlisted videos are listed, but Gemini can only transcribe public ones; for others use captions or paste.
          </p>
          {playlists.length === 0 && <p className="text-[11px] text-slate-400 px-1">This account has no playlists.</p>}
          {playlists.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!!busy || isLoading}
              onClick={() => pick(p)}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900 flex items-center gap-2 disabled:opacity-50"
            >
              <ListVideo className="w-3.5 h-3.5 text-red-300 shrink-0" />
              <span className="text-xs text-slate-200 truncate flex-1">{p.title}</span>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                {p.count !== null ? `${p.count} videos · ` : ''}
                {p.privacy}
              </span>
            </button>
          ))}
        </div>
      )}
      {live && <p className="text-[10px] font-mono text-slate-500">Signed in read-only; the sign-in stays in this browser and ends in about an hour.</p>}
    </div>
  );
};
