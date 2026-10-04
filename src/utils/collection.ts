import type { PlaylistData, VideoNode } from '../types';

// Same id as the server's collectionId (server/corpus.ts): the same videos
// always make the same collection, so its learning history carries over.
export async function collectionId(videoIds: string[]): Promise<string> {
  const key = [...new Set(videoIds)].sort().join(',');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `collection-${hex.slice(0, 16)}`;
}

// Adds newly ingested videos to the current set. Videos already in it keep
// their state (signatures, bound logic); new copies of them are ignored.
export async function mergeIntoSet(current: PlaylistData, incoming: PlaylistData): Promise<PlaylistData> {
  const have = new Set(current.videos.map((v) => v.youtubeId));
  const added: VideoNode[] = incoming.videos.filter((v) => !have.has(v.youtubeId));
  const videos = [...current.videos, ...added];
  return {
    id: await collectionId(videos.map((v) => v.youtubeId)),
    title: current.id.startsWith('collection-') ? current.title : `Collection: ${current.title} + more`,
    description: `Combined set: ${videos.map((v) => v.title).join(' · ').slice(0, 1000)}`,
    url: '',
    videos,
  };
}
