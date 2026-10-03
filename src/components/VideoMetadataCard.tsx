import React, { useState } from 'react';
import { Calendar, CheckCircle2, Clock, ExternalLink, ImageOff, Minimize2, ShieldCheck, AlertCircle } from 'lucide-react';
import { VideoNode } from '../types';
import { formatUploadDate, youtubeThumbnailUrl } from '../utils/youtube';

interface VideoMetadataCardProps {
  video: VideoNode;
  index: number;
  isActive: boolean;
  isDemo: boolean;
  onSelect: (video: VideoNode) => void;
}

export const VideoMetadataCard: React.FC<VideoMetadataCardProps> = ({ video, index, isActive, isDemo, onSelect }) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  // Demo videos use placeholder ids, so don't request thumbnails for them.
  const thumb = isDemo ? null : youtubeThumbnailUrl(video.youtubeId);
  const uploaded = formatUploadDate(video.uploadDate);
  const segCount = video.segments?.length || 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(video)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(video);
        }
      }}
      aria-pressed={isActive}
      className={`rounded-xl border transition-all cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
        isActive
          ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/30'
          : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      <div className="flex gap-3 p-3">
        {/* Thumbnail (16:9) built from the video id */}
        <div className="relative w-32 shrink-0 aspect-video rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60">
          {thumb && !thumbFailed ? (
            <img
              src={thumb}
              alt={`Thumbnail for ${video.title}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setThumbFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[9px] font-mono gap-1">
              <ImageOff className="w-4 h-4" />
              {isDemo ? 'demo video' : 'no thumbnail'}
            </div>
          )}
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-950/85 font-mono text-[10px] text-cyan-300 font-bold">
            {String(index + 1).padStart(2, '0')}
          </span>
          {video.duration && (
            <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-slate-950/85 font-mono text-[10px] text-slate-100">
              {video.duration}
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-xs font-medium text-slate-100 line-clamp-2 leading-snug" title={video.title}>
            {video.title}
          </h4>
          <p className="text-[11px] text-slate-400 font-mono truncate">{video.channel || 'Unknown channel'}</p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 text-[10px] font-mono text-slate-400">
            <dt className="flex items-center" title="Duration">
              <Clock className="w-3 h-3 text-slate-500" />
            </dt>
            <dd>{video.duration || 'Duration unknown'}</dd>
            <dt className="flex items-center" title="Upload date">
              <Calendar className="w-3 h-3 text-slate-500" />
            </dt>
            <dd title={uploaded ? video.uploadDate : 'Set YOUTUBE_API_KEY on the server to load upload dates'}>
              {uploaded ? `Uploaded ${uploaded}` : isDemo ? 'Demo data' : 'Upload date unknown'}
            </dd>
          </dl>
        </div>
      </div>

      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 border-t border-slate-800/80 bg-slate-950/40 text-[10px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5">
          {segCount > 0 ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              {segCount} segments
            </span>
          ) : (
            <span
              className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50 flex items-center gap-1"
              title={video.transcriptError || 'No transcript'}
            >
              <AlertCircle className="w-2.5 h-2.5" />
              No captions
            </span>
          )}
          {video.watermark && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50 flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" />
              Signed
            </span>
          )}
          {video.compressedTranscript && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 flex items-center gap-1">
              <Minimize2 className="w-2.5 h-2.5" />-{video.compressedTranscript.compressionRatioPercent}%
            </span>
          )}
        </div>
        {!isDemo && (
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-slate-500 hover:text-cyan-300 flex items-center gap-1"
            title="Open on YouTube"
          >
            {video.youtubeId}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
};
