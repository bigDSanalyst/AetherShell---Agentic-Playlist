// YouTube: curated playlists, playlist/video ingest, model transcription, picked videos, pasted transcripts.
import type { Express, Request, Response } from 'express';
import { DEMO_PLAYLISTS, LIVE_PRESETS } from '../demoPlaylists';
import { fetchPlaylistListing, fetchVideoTranscript, scrapePlaylistListing, parseYouTubeUrl, summarizeTranscriptFailures } from '../youtube';
import { ownerProvidedVideo } from '../transcribe';
import { collectionId } from '../corpus';
import { googleClientId, sanitizePickedIngest } from '../youtubeAccount';
import { envInt } from '../http';
import { bareVideo, ingestVideos, recordIngest, sendError, transcribeWithModel } from '../core';

export function registerYoutubeRoutes(app: Express) {
  // Demo playlists (synthetic sample transcripts, clearly labelled).
  app.get('/api/youtube/curated', (_req: Request, res: Response) => {
    res.json({
      playlists: [
        ...Object.values(LIVE_PRESETS).map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          videoCount: p.videos.length,
          url: p.url,
          isDemo: false,
        })),
        ...Object.values(DEMO_PLAYLISTS).map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          videoCount: p.videos.length,
          url: p.url,
          isDemo: true,
        })),
      ],
    });
  });

  // Captions for each listed video, plus upload date / duration from the Data
  // API when a key is configured. Nothing here is generated.
  // Ingest a real YouTube video or playlist. Transcripts come from caption
  // tracks; a video without captions is returned with transcriptError set,
  // never with generated text.
  app.post('/api/youtube/fetch-playlist', async (req: Request, res: Response) => {
    try {
      const { playlistUrl, curatedId } = req.body || {};
      // On unless the request turns it off: transcribe a video when YouTube will not give its captions.
      const modelFallback = req.body?.modelFallback !== false;

      if (curatedId) {
        const preset = LIVE_PRESETS[curatedId];
        if (preset) {
          const { videos, metadataNote } = await ingestVideos(preset.videos, { modelFallback });
          const withText = videos.filter((v) => v.rawTranscript).length;
          return res.json({
            success: true,
            source: 'youtube-captions',
            transcriptCoverage: { withTranscript: withText, total: videos.length },
            transcriptProblems: summarizeTranscriptFailures(videos),
            metadataNote,
            playlist: { id: preset.id, title: preset.title, description: preset.description, url: preset.url, videos },
          });
        }
        const demo = DEMO_PLAYLISTS[curatedId];
        if (!demo) return res.status(404).json({ error: 'Unknown preset' });
        return res.json({ success: true, playlist: { ...demo, isDemo: true }, source: 'demo' });
      }
      if (!playlistUrl || typeof playlistUrl !== 'string') {
        return res.status(400).json({ error: 'playlistUrl or curatedId is required' });
      }

      let parsed;
      try {
        parsed = parseYouTubeUrl(playlistUrl);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }

      if (parsed.kind === 'video') {
        const { videos, metadataNote } = await ingestVideos([{ videoId: parsed.videoId }], { modelFallback });
        const video = videos[0];
        if (video.transcriptSource === 'unavailable') {
          return res.status(422).json({
            error: `No transcript for ${parsed.videoId}: ${video.transcriptError}`,
            refusal: video.transcriptRefusal ?? null,
          });
        }
        return res.json({
          success: true,
          source: video.transcriptSource,
          metadataNote,
          playlist: { id: `video-${parsed.videoId}`, title: video.title, description: `Captions from ${video.url}`, url: video.url, videos: [video] },
        });
      }

      const maxVideos = envInt('YOUTUBE_MAX_PLAYLIST_VIDEOS', 25);
      const apiKey = process.env.YOUTUBE_API_KEY;
      const listing = apiKey
        ? await fetchPlaylistListing(parsed.playlistId, maxVideos, apiKey)
        : await scrapePlaylistListing(parsed.playlistId, maxVideos).catch((e: any) => {
            throw Object.assign(
              new Error(`Could not list the playlist without YOUTUBE_API_KEY: ${e.message} Setting YOUTUBE_API_KEY lists playlists through the Data API instead.`),
              { status: 502 }
            );
          });
      const { videos, metadataNote } = await ingestVideos(listing.items, { modelFallback });
      const withText = videos.filter((v) => v.rawTranscript).length;
      if (withText === 0) {
        return res.status(422).json({
          error: summarizeTranscriptFailures(videos) ?? 'None of the playlist videos have an available transcript',
          refusal: videos.every((v) => v.transcriptRefusal === 'bot-check') ? 'bot-check' : null,
        });
      }
      return res.json({
        success: true,
        source: 'youtube-captions',
        listingSource: listing.source,
        transcriptCoverage: { withTranscript: withText, total: videos.length },
        transcriptProblems: summarizeTranscriptFailures(videos),
        metadataNote,
        playlist: {
          id: `playlist-${parsed.playlistId}`,
          title: listing.title,
          description: listing.description,
          url: `https://www.youtube.com/playlist?list=${parsed.playlistId}`,
          videos,
        },
      });
    } catch (err: any) {
      if (err?.status === 502) return res.status(502).json({ error: err.message });
      sendError(res, err, 'Failed to fetch playlist');
    }
  });

  // Re-fetch the caption transcript for one video.
  app.post('/api/youtube/transcribe', async (req: Request, res: Response) => {
    try {
      const { youtubeId, method = 'captions' } = req.body || {};
      if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(String(youtubeId))) {
        return res.status(400).json({ error: 'A valid 11-character youtubeId is required (demo videos have no real captions).' });
      }
      // method "captions": YouTube's caption track. "model": Gemini transcribes the
      // video itself (YouTube is not asked, so its refusal of this server does not matter).
      const video = await (method === 'model'
        ? transcribeWithModel(bareVideo(String(youtubeId), req.body?.title))
        : fetchVideoTranscript(String(youtubeId)));
      if (video.transcriptSource === 'unavailable') {
        return res.status(422).json({ error: `No transcript: ${video.transcriptError}`, refusal: video.transcriptRefusal ?? null });
      }
      recordIngest(video);
      res.json({ success: true, segments: video.segments, summary: '', source: video.transcriptSource, video });
    } catch (err: any) {
      sendError(res, err, 'Failed to fetch transcript');
    }
  });

  // The Google sign-in client id for the playlist picker (public, not a secret);
  // null hides the picker.
  app.get('/api/config/google-client', (_req: Request, res: Response) => {
    res.json({ clientId: googleClientId(process.env) });
  });

  // Videos the owner picked from their own YouTube account in the browser (the
  // Google token stays in the browser; only video ids come here). Ingested like
  // a playlist: archive, captions, then Gemini from the URL when YouTube refuses.
  app.post('/api/youtube/ingest-videos', async (req: Request, res: Response) => {
    try {
      const picked = sanitizePickedIngest(req.body, envInt('YOUTUBE_MAX_PLAYLIST_VIDEOS', 25));
      if ('error' in picked) return res.status(400).json({ error: picked.error });
      const modelFallback = req.body?.modelFallback !== false;
      const { videos, metadataNote } = await ingestVideos(picked.items, { modelFallback });
      const withText = videos.filter((v) => v.rawTranscript).length;
      res.json({
        success: true,
        source: 'youtube-account',
        transcriptCoverage: { withTranscript: withText, total: videos.length },
        transcriptProblems: summarizeTranscriptFailures(videos),
        metadataNote,
        playlist: {
          id: picked.playlistId ? `playlist-${picked.playlistId}` : collectionId(videos.map((v) => v.youtubeId)),
          title: picked.title,
          description: `Picked from your YouTube account (${videos.length} video(s))`,
          url: picked.playlistId ? `https://www.youtube.com/playlist?list=${picked.playlistId}` : '',
          videos,
        },
      });
    } catch (err: any) {
      sendError(res, err, 'Failed to ingest the picked videos');
    }
  });

  // A transcript the owner pasted (for example from YouTube's "Show transcript"
  // panel). Recorded as owner-provided; never presented as fetched captions.
  app.post('/api/youtube/provided-transcript', async (req: Request, res: Response) => {
    try {
      const { youtubeId, text, title } = req.body || {};
      if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(String(youtubeId))) return res.status(400).json({ error: 'A valid 11-character youtubeId is required.' });
      if (typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
      const out = ownerProvidedVideo(bareVideo(String(youtubeId), title), text);
      if ('error' in out) return res.status(400).json({ error: out.error });
      recordIngest(out);
      res.json({ success: true, segments: out.segments, source: out.transcriptSource, video: out });
    } catch (err: any) {
      sendError(res, err, 'Failed to save the pasted transcript');
    }
  });
}
