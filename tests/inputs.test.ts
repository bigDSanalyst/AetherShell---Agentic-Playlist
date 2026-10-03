import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGitHubFile } from '../server/github';
import { formatTimestamp, groupCaptionCues, parseYouTubeUrl } from '../server/youtube';
import { bigramOverlap, wordOverlap } from '../server/grounding';

test('GitHub: blob, raw and repo URLs resolve to raw.githubusercontent.com', () => {
  assert.equal(
    resolveGitHubFile('https://github.com/acme/guards/blob/main/src/guard.ts').rawUrl,
    'https://raw.githubusercontent.com/acme/guards/main/src/guard.ts'
  );
  assert.equal(
    resolveGitHubFile('https://raw.githubusercontent.com/acme/guards/v1.2/guard.js').rawUrl,
    'https://raw.githubusercontent.com/acme/guards/v1.2/guard.js'
  );
  assert.equal(
    resolveGitHubFile('https://github.com/acme/guards.git', { branch: 'dev', filePath: 'g/x.ts' }).rawUrl,
    'https://raw.githubusercontent.com/acme/guards/dev/g/x.ts'
  );
});

test('GitHub: other hosts and tricks are refused', () => {
  const bad = [
    'http://169.254.169.254/latest/meta-data?raw.githubusercontent.com/',
    'https://evil.example/raw.githubusercontent.com/a/b/c/d',
    'https://raw.githubusercontent.com.evil.example/a/b/c/d',
    'http://github.com/a/b',
    'https://user:pw@github.com/a/b',
    'https://github.com:8443/a/b',
    'https://github.com/a/b/blob/main/../../etc/passwd',
    'https://github.com/a/b', // default filePath with traversal below
  ];
  for (const url of bad.slice(0, -1)) {
    assert.throws(() => resolveGitHubFile(url), Error, url);
  }
  assert.throws(() => resolveGitHubFile(bad[bad.length - 1], { filePath: '../secret' }));
  assert.throws(() => resolveGitHubFile('https://github.com/a/b', { branch: 'main/../x' }));
});

test('YouTube URL parsing', () => {
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890'), { kind: 'video', videoId: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=3'), { kind: 'video', videoId: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseYouTubeUrl('https://youtube.com/shorts/dQw4w9WgXcQ'), { kind: 'video', videoId: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLabcdefghij'), { kind: 'playlist', playlistId: 'PLabcdefghij' });
  assert.deepEqual(parseYouTubeUrl('dQw4w9WgXcQ'), { kind: 'video', videoId: 'dQw4w9WgXcQ' });
  assert.throws(() => parseYouTubeUrl('https://evil.example/watch?v=dQw4w9WgXcQ'));
  assert.throws(() => parseYouTubeUrl('https://www.youtube.com/watch?v=bad'));
});

test('caption cues are grouped into ~30s segments with real timestamps', () => {
  const cues = Array.from({ length: 20 }, (_, i) => ({ text: `word${i} &amp; more`, offset: i * 4, duration: 4, lang: 'en' }));
  const segs = groupCaptionCues(cues, 30);
  assert.equal(segs[0].start, '00:00');
  assert.ok(segs.length >= 2);
  assert.ok(segs[0].text.includes('word0 & more'));
  assert.equal(formatTimestamp(3725), '1:02:05');
});

test('grounding overlap measures shared vocabulary', () => {
  const t = 'The agent verifies every claim against the transcript before acting.';
  assert.equal(wordOverlap('agent verifies claim transcript', t).ratio, 1);
  assert.equal(wordOverlap('quantum lyapunov hamiltonian', t).ratio, 0);
  assert.equal(bigramOverlap('agent verifies every claim', t).ratio, 1);
  assert.equal(wordOverlap('', t).total, 0);
});
