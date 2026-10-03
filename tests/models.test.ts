import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../server/doctor';
import { classifyGeminiError } from '../server/geminiUsage';
import {
  ProviderError,
  configuredProviders,
  modelCascade,
  modelStatus,
  openAICompatibleGenerate,
  parseModelRef,
  stripThinking,
  toChatMessages,
} from '../server/models';

test('model names: provider prefix, colons inside model names, bare names stay Gemini', () => {
  assert.deepEqual(parseModelRef('local:qwen3:8b'), { ref: 'local:qwen3:8b', provider: 'local', model: 'qwen3:8b' });
  assert.deepEqual(parseModelRef('openrouter:qwen/qwen3-8b:free'), { ref: 'openrouter:qwen/qwen3-8b:free', provider: 'openrouter', model: 'qwen/qwen3-8b:free' });
  assert.deepEqual(parseModelRef('gemini-flash-latest'), { ref: 'gemini-flash-latest', provider: 'gemini', model: 'gemini-flash-latest' });
  assert.equal(parseModelRef('gemini:gemini-flash-latest').model, 'gemini-flash-latest');
  // An unknown prefix is part of a Gemini model name, not a provider.
  assert.equal(parseModelRef('qwen3:8b').provider, 'gemini');
});

test('providers come from the environment; the cascade prefers AETHERSHELL_MODELS', () => {
  assert.deepEqual(configuredProviders({}), {});
  const p = configuredProviders({ GEMINI_API_KEY: 'g', LOCAL_LLM_BASE_URL: 'http://127.0.0.1:11434/v1/', OPENROUTER_API_KEY: 'o' });
  assert.deepEqual(Object.keys(p).sort(), ['gemini', 'local', 'openrouter']);
  assert.deepEqual(p.local, { kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: null });
  assert.deepEqual(modelCascade({ AETHERSHELL_MODELS: 'local:a, local:b', GEMINI_MODELS: 'x' }), ['local:a', 'local:b']);
  assert.deepEqual(modelCascade({ GEMINI_MODELS: 'x,y' }), ['x', 'y']);
  assert.equal(modelCascade({}).length, 4);
});

test('Gemini request shapes become chat messages', () => {
  assert.deepEqual(toChatMessages('hello'), [{ role: 'user', content: 'hello' }]);
  assert.deepEqual(
    toChatMessages(
      [
        { role: 'user', parts: [{ text: 'q1' }] },
        { role: 'model', parts: [{ text: 'a1' }] },
      ],
      'be brief'
    ),
    [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ]
  );
  assert.deepEqual(toChatMessages({ parts: [{ inlineData: {} }, { text: 'x' }] }), [{ role: 'user', content: 'x' }]);
  assert.equal(stripThinking('<think>hmm\nok</think>\n{"a":1}'), '{"a":1}');
});

const cfg = { kind: 'openai-compatible' as const, baseUrl: 'http://x/v1', apiKey: 'k' };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('OpenAI-compatible calls: request shape, answers, and errors that classify like Gemini\'s', async () => {
  let seen: any = null;
  const ok = (async (url: string, init: any) => {
    seen = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: '<think>x</think>{"ok":true}' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const text = await openAICompatibleGenerate(cfg, 'qwen3:8b', { messages: [{ role: 'user', content: 'hi' }], json: true }, { fetchImpl: ok });
  assert.equal(text, '{"ok":true}');
  assert.equal(seen.url, 'http://x/v1/chat/completions');
  assert.equal(seen.headers.Authorization, 'Bearer k');
  assert.deepEqual(seen.body.response_format, { type: 'json_object' });
  assert.equal(seen.body.model, 'qwen3:8b');

  await assert.rejects(
    openAICompatibleGenerate(cfg, 'm', { messages: [], json: false }, { fetchImpl: reply(200, { choices: [{ message: { content: '' } }] }) }),
    /empty response/
  );
  const daily = await openAICompatibleGenerate(cfg, 'm', { messages: [], json: false }, {
    fetchImpl: reply(429, { error: { message: 'Rate limit exceeded: free-models-per-day' } }),
  }).catch((e) => e);
  assert.ok(daily instanceof ProviderError && daily.status === 429);
  assert.equal(classifyGeminiError(daily), 'daily-quota');
  const minute = await openAICompatibleGenerate(cfg, 'm', { messages: [], json: false }, { fetchImpl: reply(429, { error: { message: 'Rate limit exceeded' } }) }).catch((e) => e);
  assert.equal(classifyGeminiError(minute), 'rate-limit');

  const never = (async (_u: string, init: any) =>
    new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
  await assert.rejects(openAICompatibleGenerate(cfg, 'slow', { messages: [], json: false }, { fetchImpl: never, timeoutMs: 20 }), /did not answer within the time limit/);
});

test('doctor: which models can actually be called, and whether the guards can review', () => {
  const base = {
    env: {},
    host: '127.0.0.1',
    signingKeyEphemeral: false,
    ledger: { path: '/x', size: 0, ok: true, problems: [] },
    drift: { n: 0, drifted: false, failureRate: 0, p0: 0.15, logE: 0, threshold: 4.6 },
    charter: { ok: true, problems: [], version: 1 },
  };
  const find = (env: NodeJS.ProcessEnv, cascade: string[], review: string[] | null) =>
    diagnose({ ...base, env, models: modelStatus(env, cascade, review) }).findings.filter((f) => f.check === 'models' || f.check === 'guard-review');

  assert.equal(find({}, ['gemini-flash-latest'], null)[0].severity, 'BLOCK');
  // A local model only: synthesis works, but the charter's Gemini reviewers cannot run, so guards fail closed.
  const localOnly = find({ LOCAL_LLM_BASE_URL: 'http://l/v1' }, ['local:qwen3:8b'], ['gemini-flash-latest']);
  assert.equal(localOnly[0].severity, 'ok');
  assert.equal(localOnly[1].check, 'guard-review');
  assert.equal(localOnly[1].severity, 'BLOCK');
  assert.match(localOnly[1].next!, /owner/);
  // Mixed: one model of an unconfigured provider is skipped.
  const mixed = find({ LOCAL_LLM_BASE_URL: 'http://l/v1' }, ['local:a', 'gemini-flash-latest'], ['local:b']);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].severity, 'DEGRADED');
  assert.match(mixed[0].detail, /1 of 2 models callable/);
});
