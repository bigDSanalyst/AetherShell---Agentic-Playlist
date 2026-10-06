// Grounded RCI end to end: the real server, with a fake local model (an
// OpenAI-compatible endpoint on a spare port) that answers each step with a
// scripted reply. Checks the loop the server runs, not what a real model writes.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const TRANSCRIPT = '0:00 Gravity is what fills the hole in quantum mechanics.\n0:10 Collapse happens without any observer at all.';

// Pass 1: one invented quote and one invented step.
const DRAFT = {
  summary: 'Gravity fills the hole in quantum mechanics.',
  workflowSteps: [
    { action: 'COLLAPSE', description: 'Collapse happens without any observer.' },
    { action: 'INVENT', description: 'Blockchain tokens reward validators with dividends.' },
  ],
  criticalGuardRequirements: [],
  invariants: [{ id: 'INV-01', name: 'no observer', description: 'd', transcriptEvidence: 'Consciousness causes collapse' }],
};
// The fix: the invented step removed, the quote replaced with a real one.
const FIXED = {
  ...DRAFT,
  workflowSteps: [DRAFT.workflowSteps[0]],
  invariants: [{ ...DRAFT.invariants[0], transcriptEvidence: 'Collapse happens without any observer at all' }],
};

const prompts: string[] = [];
const models: string[] = []; // the model each call asked for, in order
let fake: http.Server;
let child: ChildProcess | null = null;
let base = '';
let log = '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-rci-'));

// "strong" always fixes; the default model ignores the critique when the run's
// directives say STUBBORN (so the computed problems remain after its own fix).
function reply(prompt: string, model = 'fake'): unknown {
  if (prompt.includes('Critique the previous pass')) {
    return {
      critiques: [
        { id: 'F1', verdict: 'requote', reason: 'the quote is not in the talk', transcriptQuote: 'Collapse happens without any observer at all' },
        { id: 'F2', verdict: 'remove', reason: 'nothing about tokens is said', transcriptQuote: 'validators are paid in tokens' },
      ],
    };
  }
  if (prompt.includes('Apply exactly this critique')) return model !== 'strong' && prompt.includes('STUBBORN') ? DRAFT : FIXED;
  if (prompt.includes('Revise the previous pass')) return FIXED;
  return DRAFT;
}

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const messages = parsed.messages as { content: unknown }[];
      models.push(String(parsed.model));
      const prompt = messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
      prompts.push(prompt);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply(prompt, String(parsed.model))) } }] }));
    });
  });
  const fakePort = await freePort();
  await new Promise<void>((r) => fake.listen(fakePort, '127.0.0.1', () => r()));

  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'YOUTUBE_API_KEY', 'AETHERSHELL_ACCESS_TOKEN', 'AETHERSHELL_SIGNING_KEY', 'GEMINI_MODELS']) delete env[k];
  Object.assign(env, {
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    LOCAL_LLM_BASE_URL: `http://127.0.0.1:${fakePort}/v1`,
    AETHERSHELL_MODELS: 'local:fake,local:strong',
    AETHERSHELL_ESCALATE_TO: 'local:strong',
    AETHERSHELL_CHARTER_PATH: path.join(dir, 'charter.json'),
    AETHERSHELL_LEDGER_PATH: path.join(dir, 'ledger.jsonl'),
    AETHERSHELL_TRANSCRIPTS_PATH: path.join(dir, 'transcripts.jsonl'),
    AETHERSHELL_LEARNING_PATH: path.join(dir, 'learning.jsonl'),
    AETHERSHELL_USAGE_PATH: path.join(dir, 'usage.json'),
    AETHERSHELL_DEMO_USAGE_PATH: path.join(dir, 'demo-usage.json'),
    RATE_LIMIT_MAX: '1000',
  });
  child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout!.on('data', (d) => (log += d));
  child.stderr!.on('data', (d) => (log += d));
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/api/ledger/head`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`server did not start:\n${log}`);
});

after(() => {
  child?.kill();
  fake?.close();
});

const cycle = (body: Record<string, unknown>) =>
  fetch(`${base}/api/engine/rcl-ssi-cycle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist: { id: 'pl-rci', title: 'RCI' }, activeVideo: { youtubeId: 'aaaaaaaaaaa', rawTranscript: TRANSCRIPT }, ...body }),
  });

test('RCI: draft, critique of the computed problems, fix, then stop when nothing computed is left', async () => {
  prompts.length = 0;
  const res = await cycle({ rclIterations: 3, refine: 'rci' });
  assert.equal(res.status, 200, log);
  const out = await res.json();
  const r = out.rclResult;
  assert.equal(r.refine, 'rci');
  assert.equal(r.passesPlanned, 3);
  assert.equal(r.iterationCount, 2);
  assert.equal(r.stoppedEarly, 'Stopped after pass 2: no computed problems left to criticise.');
  assert.equal(r.reflexiveFixedPointReached, true);

  const [p1, p2] = r.convergenceRounds;
  assert.equal(p1.problems, 2);
  assert.equal(p1.problemSummary, '1 quote-not-found, 1 weakly-grounded');
  assert.equal(p2.focus, 'Grounded critique, then fix');
  assert.equal(p2.problems, 0);
  assert.deepEqual(
    p2.critique.map((c: any) => [c.id, c.kind, c.verdict, c.quoteFound]),
    [
      ['F1', 'quote-not-found', 'requote', true],
      ['F2', 'weakly-grounded', 'remove', false],
    ]
  );

  // Three model calls: draft, critique, fix. The fix never sees the quote the model made up.
  assert.equal(prompts.length, 3);
  assert.match(prompts[1], /COMPUTED PROBLEMS \(data/);
  assert.match(prompts[2], /CRITIQUE TO APPLY \(data\)/);
  assert.doesNotMatch(prompts[2], /validators are paid in tokens/);
  assert.equal(out.innershellLogic.workflowSteps.length, 1);
  assert.equal(r.sotaReflexiveInvariants[0].evidenceFoundInTranscript, true);

  const entries = (await (await fetch(`${base}/api/ledger/entries`)).json()).entries;
  const synth = entries.filter((e: any) => e.kind === 'synthesis').at(-1);
  assert.equal(synth.data.refine, 'rci');
  assert.equal(synth.data.passes, 3);
  assert.equal(synth.data.passesRun, 2);
});

test('plain revision is unchanged: one call per pass, no critique', async () => {
  prompts.length = 0;
  const r = (await (await cycle({ rclIterations: 2 })).json()).rclResult;
  assert.equal(r.refine, 'revise');
  assert.equal(r.iterationCount, 2);
  assert.equal(r.stoppedEarly, null);
  assert.equal(r.convergenceRounds[1].focus, 'Revision against transcript');
  assert.equal(r.convergenceRounds[1].critique, undefined);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Revise the previous pass/);
});

test('the twin reports RCI against plain revision, and the ledger still verifies', async () => {
  const learning = (await (await fetch(`${base}/api/learning`)).json()).learning;
  assert.deepEqual(learning.refineEffect.rci, { n: 0, passed: 0 }); // not judged by the guards yet
  assert.equal(learning.syntheses, 2);
  assert.equal((await (await fetch(`${base}/api/ledger/verify`)).json()).ok, true);
});

test('known habits: after 5 first drafts with an invented quote, the 6th draft is shown that habit', async () => {
  // Two drafts so far (the tests above), both by local:fake with an invented quote.
  for (let i = 0; i < 2; i++) assert.equal((await cycle({ rclIterations: 1 })).status, 200);
  prompts.length = 0;
  const before = await (await cycle({ rclIterations: 1 })).json(); // the 5th draft: habit not yet known
  assert.deepEqual(before.learning.habitsShown, []);
  assert.doesNotMatch(prompts[0], /KNOWN HABITS/);

  prompts.length = 0;
  const out = await (await cycle({ rclIterations: 1 })).json();
  assert.deepEqual(
    out.learning.habitsShown.map((h: any) => [h.kind, h.drafts, h.of]),
    [
      ['quote-not-found', 5, 5],
      ['weakly-grounded', 5, 5],
    ]
  );
  assert.match(prompts[0], /KNOWN HABITS OF THE WRITING MODEL \(local:fake\)/);
  assert.match(prompts[0], /In 5 of its last 5 first drafts it gave an invariant a transcriptEvidence quote that is not in the transcript\./);

  const entries = (await (await fetch(`${base}/api/ledger/entries`)).json()).entries;
  const last = entries.filter((e: any) => e.kind === 'synthesis').at(-1);
  assert.equal(last.data.draftWriter, 'local:fake');
  assert.deepEqual(last.data.draftProblems, { 'quote-not-found': 1, 'no-quote': 0, 'weakly-grounded': 1 });
  assert.deepEqual(last.data.habitsShown, ['quote-not-found', 'weakly-grounded']);

  const shell = (await (await fetch(`${base}/api/learning`)).json()).learning.shells.asWriter.find((m: any) => m.model === 'local:fake');
  const q = shell.habits.habits.find((h: any) => h.kind === 'quote-not-found');
  assert.deepEqual([q.drafts, q.of, q.known, q.whenShown, q.whenNotShown], [6, 6, true, { drafts: 1, of: 1 }, { drafts: 5, of: 5 }]);
});

test('each synthesis records its transcript length, and "auto" passes are chosen within that length', async () => {
  const out = await (await cycle({ rclIterations: 'auto' })).json();
  assert.equal(out.learning.lengthBucket, 'short');
  assert.equal(out.learning.transcriptWords, 18);
  assert.match(out.learning.why, /short transcripts/);
  const entries = (await (await fetch(`${base}/api/ledger/entries`)).json()).entries;
  const last = entries.filter((e: any) => e.kind === 'synthesis').at(-1);
  assert.deepEqual([last.data.lengthBucket, last.data.transcriptWords, last.data.chosenBy], ['short', 18, 'learned']);
  const p = (await (await fetch(`${base}/api/learning`)).json()).learning.playlists.find((x: any) => x.playlistKey === 'playlist:pl-rci');
  assert.deepEqual(p.byLength.map((b: any) => b.bucket), ['short', 'medium', 'long']);
});

test('escalation: when problems remain after the writer\'s own fix, the remaining passes go to the stronger model', async () => {
  prompts.length = 0;
  models.length = 0;
  const out = await (await cycle({ rclIterations: 4, refine: 'rci', escalate: true, userDirectives: 'STUBBORN' })).json();
  const r = out.rclResult;
  assert.deepEqual(
    r.convergenceRounds.map((x: any) => [x.cycle, x.modelUsed, x.problems]),
    [
      [1, 'local:fake', 2],
      [2, 'local:fake', 2], // its own fix left both problems
      [3, 'local:strong', 0],
    ]
  );
  assert.equal(r.stoppedEarly, 'Stopped after pass 3: no computed problems left to criticise.');
  assert.deepEqual(
    { ...r.escalation, note: undefined },
    { from: 'local:fake', to: 'local:strong', atPass: 3, problemsBefore: 2, problemsAfter: 0, note: undefined }
  );
  assert.match(r.escalation.note, /^Moved from local:fake to local:strong at pass 3/);
  // draft, critique, fix by the writer; critique and fix by the stronger model.
  assert.deepEqual(models, ['fake', 'fake', 'fake', 'strong', 'strong']);

  const entries = (await (await fetch(`${base}/api/ledger/entries`)).json()).entries;
  const last = entries.filter((e: any) => e.kind === 'synthesis').at(-1);
  assert.deepEqual(
    [last.data.draftWriter, last.data.writer, last.data.escalatedFrom, last.data.escalatedTo, last.data.escalatedAtPass, last.data.problemsAtEnd],
    ['local:fake', 'local:strong', 'local:fake', 'local:strong', 3, 0]
  );
});

test('escalation: no move when the writer fixes its own problems, or with too few passes', async () => {
  models.length = 0;
  const fixed = (await (await cycle({ rclIterations: 3, refine: 'rci', escalate: true })).json()).rclResult;
  assert.equal(fixed.escalation, null);
  assert.equal(fixed.iterationCount, 2);
  assert.ok(models.every((m) => m === 'fake'));

  models.length = 0;
  const two = (await (await cycle({ rclIterations: 2, refine: 'rci', escalate: true, userDirectives: 'STUBBORN' })).json()).rclResult;
  assert.equal(two.escalation, null); // pass 3 never comes
  assert.ok(models.every((m) => m === 'fake'));

  const models_ = await (await fetch(`${base}/api/models`)).json();
  assert.deepEqual(models_.escalateTo, ['local:strong']);
  const e = (await (await fetch(`${base}/api/learning`)).json()).learning.escalationEffect;
  assert.deepEqual([e.runs, e.endedWithoutComputedProblems, e.byTarget[0].model], [1, 1, 'local:strong']);
});
