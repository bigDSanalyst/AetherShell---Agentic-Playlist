import test from 'node:test';
import assert from 'node:assert/strict';
import { googleClientId, sanitizePickedIngest } from '../server/youtubeAccount';
import { likesPlaylistId, parsePlaylistItems, parsePlaylists } from '../src/utils/youtubeAccount';
import { isVisitorAllowed } from '../server/http';

test('the sign-in client id is shown only when it looks like a Google OAuth client id', () => {
  assert.equal(googleClientId({ GOOGLE_OAUTH_CLIENT_ID: '1234567890-abc123def.apps.googleusercontent.com' } as any), '1234567890-abc123def.apps.googleusercontent.com');
  assert.equal(googleClientId({ GOOGLE_OAUTH_CLIENT_ID: 'GOCSPX-a-client-secret' } as any), null); // a secret pasted by mistake is not served
  assert.equal(googleClientId({} as any), null);
});

test('picked videos: ids checked, duplicates dropped, text capped, at most N taken', () => {
  const ok = sanitizePickedIngest(
    { playlistId: 'PLabc_123', title: '  My lectures ', items: [{ videoId: 'aaaaaaaaaaa', title: 'One', channel: 'C' }, { videoId: 'aaaaaaaaaaa' }, { videoId: 'bbbbbbbbbbb' }, { videoId: 'ccccccccccc' }] },
    2
  ) as any;
  assert.deepEqual(ok, { playlistId: 'PLabc_123', title: 'My lectures', items: [{ videoId: 'aaaaaaaaaaa', title: 'One', channel: 'C' }, { videoId: 'bbbbbbbbbbb' }] });
  assert.match((sanitizePickedIngest({ items: [{ videoId: '../../etc' }] }, 5) as any).error, /not a YouTube video id/);
  assert.match((sanitizePickedIngest({ items: [] }, 5) as any).error, /items/);
  assert.equal((sanitizePickedIngest({ playlistId: 'bad id!', items: [{ videoId: 'aaaaaaaaaaa' }] }, 5) as any).playlistId, null);
  // It may transcribe with Gemini, so a visitor's call counts against the demo allowance.
  assert.equal(isVisitorAllowed('POST', '/youtube/ingest-videos'), 'ai');
});

test('YouTube Data API responses: playlists, items (deleted/private dropped), Liked videos', () => {
  const p = parsePlaylists({
    nextPageToken: 'N2',
    items: [{ id: 'PL1', snippet: { title: 'Physics', thumbnails: { default: { url: 'https://i.ytimg.com/x.jpg' } } }, contentDetails: { itemCount: 4 }, status: { privacyStatus: 'private' } }, { nope: 1 }],
  });
  assert.deepEqual(p, { playlists: [{ id: 'PL1', title: 'Physics', count: 4, privacy: 'private', thumbnail: 'https://i.ytimg.com/x.jpg' }], next: 'N2' });
  const it = parsePlaylistItems({
    items: [
      { snippet: { title: 'Lecture', videoOwnerChannelTitle: 'Chan' }, contentDetails: { videoId: 'aaaaaaaaaaa' }, status: { privacyStatus: 'public' } },
      { snippet: { title: 'Deleted video' }, contentDetails: { videoId: 'bbbbbbbbbbb' } },
      { snippet: { title: 'Private video' }, contentDetails: { videoId: 'ccccccccccc' } },
      { snippet: { title: 'Broken' }, contentDetails: {} },
    ],
  });
  assert.deepEqual(it, { videos: [{ videoId: 'aaaaaaaaaaa', title: 'Lecture', channel: 'Chan', privacy: 'public' }], skipped: 3, next: null });
  assert.equal(likesPlaylistId({ items: [{ contentDetails: { relatedPlaylists: { likes: 'LLxyz' } } }] }), 'LLxyz');
  assert.equal(likesPlaylistId({ items: [] }), null);
});
