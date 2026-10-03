const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type ThumbnailQuality = 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault';

// YouTube serves thumbnails at a fixed URL per video id. Returns null for
// anything that is not a valid id, so callers can show a placeholder.
export function youtubeThumbnailUrl(videoId: string | undefined, quality: ThumbnailQuality = 'mqdefault'): string | null {
  return videoId && VIDEO_ID_RE.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : null;
}

export function formatUploadDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
