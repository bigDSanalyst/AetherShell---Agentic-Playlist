// Model providers. Every model the app may call is named "provider:model":
//
//   gemini:gemini-flash-latest        Google Gemini (GEMINI_API_KEY)
//   local:qwen3:8b                    any OpenAI-compatible server you run: Ollama,
//                                     llama.cpp, vLLM, LM Studio (LOCAL_LLM_BASE_URL)
//   openrouter:qwen/qwen3-8b:free     OpenRouter, many hosted open models (OPENROUTER_API_KEY)
//   openai:gpt-4.1-mini               OpenAI or a compatible endpoint (OPENAI_API_KEY, OPENAI_BASE_URL)
//
// A name without a known provider prefix is a Gemini model, so existing
// settings and owner-signed charters keep meaning what they meant.
//
// Which models REVIEW guard verdicts is not chosen here: it is the charter's
// `reviewModels`, signed by the owner. This module only knows how to call them.

export const PROVIDERS = ['gemini', 'local', 'openrouter', 'openai'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export type ProviderConfig =
  | { kind: 'gemini' }
  | { kind: 'openai-compatible'; baseUrl: string; apiKey: string | null };

export interface ModelRef {
  ref: string; // as written in settings, e.g. "local:qwen3:8b"
  provider: ProviderName;
  model: string; // as the provider names it, e.g. "qwen3:8b"
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function parseModelRef(ref: string): ModelRef {
  const i = ref.indexOf(':');
  const prefix = i > 0 ? ref.slice(0, i) : '';
  if ((PROVIDERS as readonly string[]).includes(prefix)) {
    return { ref, provider: prefix as ProviderName, model: ref.slice(i + 1) };
  }
  return { ref, provider: 'gemini', model: ref };
}

const trimSlash = (u: string) => u.replace(/\/+$/, '');

export function configuredProviders(env: NodeJS.ProcessEnv): Partial<Record<ProviderName, ProviderConfig>> {
  const out: Partial<Record<ProviderName, ProviderConfig>> = {};
  if (env.GEMINI_API_KEY) out.gemini = { kind: 'gemini' };
  if (env.LOCAL_LLM_BASE_URL) {
    out.local = { kind: 'openai-compatible', baseUrl: trimSlash(env.LOCAL_LLM_BASE_URL), apiKey: env.LOCAL_LLM_API_KEY || null };
  }
  if (env.OPENROUTER_API_KEY) {
    out.openrouter = { kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', apiKey: env.OPENROUTER_API_KEY };
  }
  if (env.OPENAI_API_KEY) {
    out.openai = { kind: 'openai-compatible', baseUrl: trimSlash(env.OPENAI_BASE_URL || 'https://api.openai.com/v1'), apiKey: env.OPENAI_API_KEY };
  }
  return out;
}

export const DEFAULT_MODELS = 'gemini-3.1-flash-lite,gemini-flash-latest,gemini-3.8-flash,gemini-3.1-pro-preview';

// The ordered list of models the app tries (the charter's reviewModels replace
// it for guard reviews). AETHERSHELL_MODELS wins; GEMINI_MODELS is the older name.
export function modelCascade(env: NodeJS.ProcessEnv): string[] {
  return (env.AETHERSHELL_MODELS || env.GEMINI_MODELS || DEFAULT_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

// What doctor needs to know: can the configured models actually be called?
export function modelStatus(env: NodeJS.ProcessEnv, cascade: string[], reviewModels: string[] | null) {
  const providers = configuredProviders(env);
  const usable = (refs: string[]) => refs.filter((r) => providers[parseModelRef(r).provider]);
  return {
    configured: Object.keys(providers) as ProviderName[],
    cascade: { total: cascade.length, usable: usable(cascade) },
    review: reviewModels ? { total: reviewModels.length, usable: usable(reviewModels) } : null,
  };
}

// The Gemini SDK's request shapes, turned into chat messages for other providers.
export function toChatMessages(contents: unknown, systemInstruction?: unknown): ChatMessage[] {
  const text = (parts: unknown) =>
    (Array.isArray(parts) ? parts : [])
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n');
  const out: ChatMessage[] = [];
  if (typeof systemInstruction === 'string' && systemInstruction) out.push({ role: 'system', content: systemInstruction });
  if (typeof contents === 'string') out.push({ role: 'user', content: contents });
  else if (Array.isArray(contents)) {
    for (const c of contents as any[]) {
      if (typeof c === 'string') out.push({ role: 'user', content: c });
      else out.push({ role: c?.role === 'model' || c?.role === 'assistant' ? 'assistant' : 'user', content: text(c?.parts) });
    }
  } else if (contents && typeof contents === 'object') {
    out.push({ role: 'user', content: text((contents as any).parts) });
  }
  return out;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

// Some open models (Qwen3, DeepSeek-R1) write their reasoning in <think> tags
// before the answer. The answer is what follows.
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export async function openAICompatibleGenerate(
  cfg: Extract<ProviderConfig, { kind: 'openai-compatible' }>,
  model: string,
  req: { messages: ChatMessage[]; json: boolean },
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  // Local models on a small GPU are slow; a synthesis pass can take minutes.
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 300_000);
  try {
    const res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model,
        messages: req.messages,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: ctl.signal,
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.error?.message || body?.error || body?.message || res.statusText;
      throw new ProviderError(`${res.status} ${String(msg).slice(0, 300)}`, res.status);
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new ProviderError(`empty response from ${model}`, res.status);
    return stripThinking(content);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ProviderError(`${model} did not answer within the time limit`, null);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
