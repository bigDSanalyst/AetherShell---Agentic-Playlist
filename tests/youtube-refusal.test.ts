import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YouTubeRefusalError,
  classifyPlayability,
  classifyWatchPage,
  fetchVideoTranscript,
  summarizeTranscriptFailures,
  type IngestedVideo,
} from '../server/youtube';

const ID = 'aircAruvnKk';
const WATCH = `<html><script>ytcfg.set({"INNERTUBE_API_KEY":"k"})</script></html>`;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

// A stand-in for youtube.com: answers the three requests the caption library makes.
function youtube(player: unknown, transcript = '<text start="0" dur="2">hello there</text><text start="2" dur="2">general kenobi</text>') {
  return async (p: { url: string }) => {
    if (p.url.includes('/watch')) return new Response(WATCH, { status: 200 });
    if (p.url.includes('/youtubei/v1/player')) return json(player);
    return new Response(transcript, { status: 200 });
  };
}

test('YouTube\'s refusals are named as refusals, not as "no captions"', () => {
  const bot = classifyPlayability({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' })!;
  assert.equal(bot.kind, 'bot-check');
  assert.match(bot.message, /YouTube refused this server .*cloud servers/);
  assert.equal(classifyPlayability({ status: 'LOGIN_REQUIRED', reason: 'This video is private' })!.kind, 'restricted');
  assert.equal(classifyPlayability({ status: 'UNPLAYABLE', reason: 'Video unavailable' })!.kind, 'unavailable');
  assert.equal(classifyPlayability({ status: 'OK' }), null);
  assert.equal(classifyWatchPage('https://consent.youtube.com/m?continue=x', '')!.kind, 'consent');
  assert.equal(classifyWatchPage('https://www.youtube.com/watch?v=x', '<div class="g-recaptcha"></div>')!.kind, 'rate-limit');
  assert.equal(classifyWatchPage('https://www.youtube.com/watch?v=x', WATCH), null);
});

test('through the real caption library: a bot check is reported as one; real captions still come through', async () => {
  const blocked = await fetchVideoTranscript(ID, {}, undefined, youtube({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' } }));
  assert.equal(blocked.transcriptSource, 'unavailable');
  assert.equal(blocked.transcriptRefusal, 'bot-check');
  assert.match(blocked.transcriptError!, /YouTube refused this server/);
  assert.doesNotMatch(blocked.transcriptError!, /does not have captions/);
  assert.equal(blocked.rawTranscript, ''); // nothing invented

  const ok = await fetchVideoTranscript(
    ID,
    {},
    undefined,
    youtube({
      playabilityStatus: { status: 'OK' },
      videoDetails: { title: 'But what is a neural network?', author: '3Blue1Brown', lengthSeconds: '1140' },
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=x', languageCode: 'en' }] } },
    })
  );
  assert.equal(ok.transcriptSource, 'youtube-captions');
  assert.equal(ok.title, 'But what is a neural network?');
  assert.match(ok.rawTranscript!, /hello there/);

  // A video that really has no captions keeps the library's own message.
  const none = await fetchVideoTranscript(ID, {}, undefined, youtube({ playabilityStatus: { status: 'OK' } }));
  assert.equal(none.transcriptRefusal, undefined);
  assert.match(none.transcriptError!, /disabled|No transcripts/);

  const rateLimited = await fetchVideoTranscript(ID, {}, undefined, async () => new Response('', { status: 429 }));
  assert.equal(rateLimited.transcriptRefusal, 'rate-limit');
});

test('the playlist message says why, grouped, and names a server refusal plainly', () => {
  const v = (err?: string, refusal?: IngestedVideo['transcriptRefusal']): IngestedVideo =>
    ({ id: 'x', youtubeId: 'x', title: 't', channel: '', duration: '', url: '', transcriptSource: err ? 'unavailable' : 'youtube-captions', transcriptError: err, transcriptRefusal: refusal }) as IngestedVideo;
  const bot = new YouTubeRefusalError('bot-check', 'Sign in to confirm you’re not a bot').message;
  const all = summarizeTranscriptFailures([v(bot, 'bot-check'), v(bot, 'bot-check'), v(bot, 'bot-check')])!;
  assert.match(all, /^YouTube refused this server for all 3 video\(s\)/);
  assert.match(all, /3 of 3: YouTube refused this server/);
  const mixed = summarizeTranscriptFailures([v(), v('Transcripts are disabled for the video'), v(bot, 'bot-check')])!;
  assert.match(mixed, /^2 of 3 video\(s\) have no transcript\./);
  assert.equal(summarizeTranscriptFailures([v()]), null);
});
