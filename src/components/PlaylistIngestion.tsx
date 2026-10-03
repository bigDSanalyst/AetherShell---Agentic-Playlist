import React, { useState } from 'react';
import {
  Youtube,
  Play,
  FileText,
  Clock,
  User,
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  Minimize2,
  Plus,
  Radio,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Brain,
} from 'lucide-react';
import { PlaylistData, VideoNode, CuratedPlaylistSummary } from '../types';
import { VideoMetadataCard } from './VideoMetadataCard';
import { copyText } from '../utils/clipboard';

interface PlaylistIngestionProps {
  playlist: PlaylistData | null;
  curatedPlaylists: CuratedPlaylistSummary[];
  activeVideo: VideoNode | null;
  setActiveVideo: (video: VideoNode) => void;
  onLoadCurated: (id: string) => void;
  onIngestUrl: (url: string) => void;
  onDeepTranscribe: (video?: VideoNode) => void;
  transcribeProgress?: { current: number; total: number; currentTitle: string; percent: number } | null;
  isLoading: boolean;
  onProceedToInnershell: () => void;
  onProceedToKnowledge: () => void;
}

export const PlaylistIngestion: React.FC<PlaylistIngestionProps> = ({
  playlist,
  curatedPlaylists,
  activeVideo,
  setActiveVideo,
  onLoadCurated,
  onIngestUrl,
  onDeepTranscribe,
  transcribeProgress,
  isLoading,
  onProceedToInnershell,
  onProceedToKnowledge,
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    onIngestUrl(inputUrl.trim());
  };

  const handleCopyTranscript = async () => {
    if (!activeVideo?.rawTranscript) return;
    if (await copyText(activeVideo.rawTranscript)) {
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    }
  };

  const filteredVideos = (playlist?.videos || []).filter(
    (v) =>
      (v?.title || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
      (v?.channel || '').toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Ingestion Control Card */}
      <div className="rounded-2xl border border-cyan-900/40 bg-gradient-to-br from-slate-900/90 via-slate-950/90 to-slate-900/80 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-red-600/10 border border-red-500/30 text-red-400">
                <Youtube className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  YouTube Playlist Ingestion (Caption Transcripts)
                </h2>
                <p className="text-xs text-slate-400">
                  Pull caption transcripts from YouTube videos and playlists (no captions, no transcript; nothing is generated), then prepare them for RCL/SSI synthesis.
                </p>
              </div>
            </div>
          </div>

          {/* Curated Quick-Load Presets */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <span className="text-xs font-mono text-slate-400 font-medium">Presets:</span>
            {(curatedPlaylists || []).map((cp) => (
              <button
                key={cp.id}
                onClick={() => onLoadCurated(cp.id)}
                disabled={isLoading}
                title={cp.isDemo ? `${cp.title} (synthetic sample text)` : `${cp.title} (fetches real captions from YouTube)`}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${
                  cp.isDemo
                    ? 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-800/60 text-amber-300'
                    : 'bg-cyan-950/60 hover:bg-cyan-900/80 border-cyan-800/60 text-cyan-300'
                }`}
              >
                {cp.title.length > 28 ? `${cp.title.slice(0, 28)}…` : cp.title}
              </button>
            ))}
          </div>
        </div>

        {/* URL Input Form */}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Youtube className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste YouTube Playlist URL (e.g., https://www.youtube.com/playlist?list=...) or Video link"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !inputUrl.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                <span>Fetching captions...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Ingest Captions</span>
              </>
            )}
          </button>
        </form>

        {playlist && (
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-200">{playlist.title}</span>
              <span className="text-slate-500">•</span>
              <span>{playlist.videos.length} Videos Loaded</span>
              {playlist.isDemo && (
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-mono text-[10px]">
                  DEMO · synthetic transcripts
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!playlist.isDemo && (
                <button
                  type="button"
                  onClick={() => onDeepTranscribe()}
                  disabled={isLoading}
                  className="px-3 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-300 font-mono text-[11px] flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Fetch YouTube captions again for every video in this playlist"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Re-fetch All Captions</span>
                </button>
              )}
              <a
                href={playlist.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-mono text-[11px]"
              >
                <span>Source URL</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {transcribeProgress && (
          <div className="mt-4 p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-700/40 space-y-2" role="status" aria-live="polite">
            <div className="flex items-center justify-between text-xs font-mono text-cyan-300">
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Fetching captions
              </span>
              <span>
                {transcribeProgress.current} / {transcribeProgress.total} · {transcribeProgress.percent}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                style={{ width: `${Math.max(4, transcribeProgress.percent)}%` }}
              />
            </div>
            <p className="text-[11px] font-mono text-slate-400 truncate">Current: {transcribeProgress.currentTitle}</p>
          </div>
        )}
      </div>

      {/* Main Grid: Video Playlist List + Active Video Transcript Inspector */}
      {playlist && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Playlist Video Nodes (4 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
                <Play className="w-3.5 h-3.5 text-cyan-400" />
                Playlist Nodes ({filteredVideos.length})
              </h3>
              <div className="relative w-44">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter nodes..."
                  className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredVideos.map((video) => (
                <VideoMetadataCard
                  key={video.id}
                  video={video}
                  index={(playlist?.videos || []).indexOf(video)}
                  isActive={activeVideo?.id === video.id}
                  isDemo={!!playlist?.isDemo}
                  onSelect={setActiveVideo}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Direct Transcript Viewer & Transcription Inspector (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {activeVideo ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
                {/* Header of Active Video */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                      Active Ingestion Target
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100 mt-1">
                      {activeVideo.title}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Channel: {activeVideo.channel} • Duration: {activeVideo.duration}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDeepTranscribe(activeVideo)}
                      disabled={isLoading || !!playlist?.isDemo}
                      className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title={playlist?.isDemo ? 'Demo videos are not real YouTube videos' : 'Fetch this video\'s caption track from YouTube again'}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Re-fetch Captions</span>
                    </button>

                    <button
                      onClick={handleCopyTranscript}
                      className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition-colors"
                      title="Copy full raw transcript"
                    >
                      {copiedTranscript ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Segments View */}
                {activeVideo.segments && activeVideo.segments.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>Timestamped Speech Segments ({activeVideo.segments.length})</span>
                      <span className="text-cyan-400">
                        Total Words: {activeVideo.rawTranscript?.split(/\s+/).length || 0}
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-2">
                      {activeVideo.segments.map((seg) => (
                        <div
                          key={seg.id}
                          className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
                              <User className="w-3 h-3 text-cyan-400" />
                              {seg.speaker}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              {seg.start} - {seg.end}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed font-sans">
                            {seg.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-xl bg-slate-950/60 border border-dashed border-slate-800">
                    <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-300 font-medium">No transcript for this video</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {activeVideo.transcriptError
                        ? `YouTube returned no captions: ${activeVideo.transcriptError}`
                        : 'Click "Re-fetch Captions" to try the YouTube caption track again.'}
                    </p>
                  </div>
                )}

                {/* Action Card: Advance to Knowledge Synthesis or Innershell */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 via-indigo-950/40 to-slate-950 border border-cyan-800/40 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    <p className="font-semibold text-cyan-300">Playlist Transcript Corpus Ready</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Synthesize new emergent knowledge strictly subjugated to this playlist, or run the RCL/SSI innershell.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={onProceedToKnowledge}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs font-mono flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all shrink-0"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Synthesize Knowledge</span>
                      <span>→</span>
                    </button>
                    <button
                      onClick={onProceedToInnershell}
                      className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-semibold text-xs font-mono flex items-center justify-center gap-1 transition-all shrink-0"
                    >
                      <span>Innershell</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40">
                <FileText className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-medium text-slate-300">No Video Node Selected</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Select a video node from the left column to view direct transcripts and timestamps.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
