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

interface PlaylistIngestionProps {
  playlist: PlaylistData | null;
  curatedPlaylists: CuratedPlaylistSummary[];
  activeVideo: VideoNode | null;
  setActiveVideo: (video: VideoNode) => void;
  onLoadCurated: (id: string) => void;
  onIngestUrl: (url: string) => void;
  onDeepTranscribe: (video?: VideoNode) => void;
  transcribeProgress?: {
    current: number;
    total: number;
    currentTitle: string;
    percent: number;
  } | null;
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
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeVideo.rawTranscript);
      } else {
        const ta = document.createElement('textarea');
        ta.value = activeVideo.rawTranscript;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = activeVideo.rawTranscript;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopiedTranscript(true);
        setTimeout(() => setCopiedTranscript(false), 2000);
      } catch (err) {
        console.warn('Clipboard copy prevented:', err);
      }
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
                  YouTube Playlist Ingestion & Audio Transcription Engine
                </h2>
                <p className="text-xs text-slate-400">
                  Transcribe multi-video YouTube playlists, extract grounded dialogue transcripts, and prepare for RCL/SSI synthesis.
                </p>
              </div>
            </div>
          </div>

          {/* Curated Quick-Load Presets */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <span className="text-xs font-mono text-cyan-400 font-medium">Curated Presets:</span>
            {(curatedPlaylists || []).map((cp) => (
              <button
                key={cp.id}
                onClick={() => onLoadCurated(cp.id)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/60 text-cyan-300 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {cp.title.slice(0, 24)}...
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
              placeholder="Paste YouTube Playlist URL (e.g., https://www.youtube.com/playlist?list=PLHLzviV6Lxzc...)"
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
                <span>Transcribing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Ingest & Transcribe Playlist</span>
              </>
            )}
          </button>
        </form>

        {/* Quick URL shortcut helper */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="font-mono text-slate-500">Target Playlist:</span>
          <button
            type="button"
            onClick={() => {
              const url = 'https://youtube.com/playlist?list=PLHLzviV6Lxzc&si=IKm_ynM7XY889KVU';
              setInputUrl(url);
              onIngestUrl(url);
            }}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/40 text-cyan-300 transition-all font-mono hover:underline disabled:opacity-50"
          >
            <Youtube className="w-3.5 h-3.5 text-red-400" />
            <span>Load PLHLzviV6Lxzc (AetherShell: IMO AI & Entropy)</span>
          </button>
        </div>

        {playlist && (
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-200">{playlist.title}</span>
              <span className="text-slate-500">•</span>
              <span>{playlist.videos.length} Videos Loaded</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onDeepTranscribe()}
                disabled={isLoading}
                className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Bulk Transcribe All Videos</span>
              </button>
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

        {/* Bulk Processing Progress Indicator */}
        {transcribeProgress && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-cyan-950/90 via-slate-900/90 to-blue-950/90 border border-cyan-500/40 shadow-xl shadow-cyan-950/30 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-cyan-300">
                <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></span>
                <span className="font-semibold uppercase tracking-wider">
                  Bulk Ingesting & Transcribing Playlist
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-900/70 border border-cyan-700/60 text-cyan-200 font-bold">
                  {transcribeProgress.current} / {transcribeProgress.total} Videos
                </span>
                <span className="text-cyan-400 font-bold">{transcribeProgress.percent}%</span>
              </div>
            </div>

            {/* Visual Animated Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${Math.max(4, transcribeProgress.percent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="truncate max-w-[85%] text-slate-300">
                Active Video: <span className="text-cyan-300 font-medium">{transcribeProgress.currentTitle}</span>
              </span>
              <span className="text-cyan-400 font-semibold">{transcribeProgress.percent}% Complete</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Video Playlist List + Active Video Transcript Inspector */}
      {playlist && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Playlist Video Nodes (4 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Nodes ({filteredVideos.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => onDeepTranscribe()}
                  disabled={isLoading}
                  className="px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 text-[10px] font-mono flex items-center gap-1 transition-all disabled:opacity-50"
                  title="Bulk transcribe all videos in playlist"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>Bulk All</span>
                </button>
              </div>
              <div className="relative w-36 sm:w-44">
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
              {filteredVideos.map((video, idx) => {
                const isActive = activeVideo?.id === video.id;
                const hasSegments = (video.segments?.length || 0) > 0;
                const isWatermarked = !!video.watermark;
                const isCompressed = !!video.compressedTranscript;

                return (
                  <div
                    key={video.id}
                    onClick={() => setActiveVideo(video)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/30'
                        : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-800 font-mono text-[11px] text-cyan-400 font-bold">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <h4 className="text-xs font-medium text-slate-200 line-clamp-1">
                          {video.title}
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {video.duration}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate max-w-[160px] text-slate-400 font-mono">
                        {video.channel}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        {hasSegments ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {video.segments?.length} Segs
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                            No Segs
                          </span>
                        )}

                        {isWatermarked && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50 flex items-center gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            WM
                          </span>
                        )}

                        {isCompressed && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 flex items-center gap-1">
                            <Minimize2 className="w-2.5 h-2.5" />
                            -{video.compressedTranscript?.compressionRatioPercent}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                      disabled={isLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-950 to-blue-950 hover:from-cyan-900 hover:to-blue-900 border border-cyan-600/60 text-cyan-300 text-xs font-mono flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-sm"
                      title="Bulk transcribe all videos in playlist with Gemini"
                    >
                      {transcribeProgress ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                          <span>Processing ({transcribeProgress.current}/{transcribeProgress.total})...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Bulk Transcribe Playlist</span>
                        </>
                      )}
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
                    <p className="text-xs text-slate-300 font-medium">No segments generated yet</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Click "Transcribe with Gemini" to extract structured speech segments and timestamps.
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
