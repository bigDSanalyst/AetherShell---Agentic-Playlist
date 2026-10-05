import { AsyncLocalStorage } from 'async_hooks';
import type { Request } from 'express';

// "Bring your own key": a visitor sends their own Gemini API key with each
// request (header x-gemini-api-key) and the Gemini calls for that request run
// on their key and their quota, not the host's.
//
// The key lives only for the duration of the request (AsyncLocalStorage). It is
// never written to a file, the ledger, the usage counters or a log line, and it
// is removed from any error text that is shown or logged. It does pass through
// this server, so the visitor has to trust the instance with it; the UI says so.

const store = new AsyncLocalStorage<{ key: string }>();

// Google API keys are ~39 characters of [A-Za-z0-9_-]; anything else is ignored.
const KEY_RE = /^[A-Za-z0-9_-]{20,100}$/;

export function readVisitorKey(req: Pick<Request, 'header'>): string | null {
  const raw = req.header('x-gemini-api-key');
  const key = typeof raw === 'string' ? raw.trim() : '';
  return KEY_RE.test(key) ? key : null;
}

export function runWithVisitorKey<T>(key: string, fn: () => T): T {
  return store.run({ key }, fn);
}

// The key of the request being handled, if its visitor brought one.
export function visitorKey(): string | null {
  return store.getStore()?.key ?? null;
}

// Removes the current visitor's key from text before it is shown or logged.
export function redactKey(text: string): string {
  const key = visitorKey();
  return key ? text.split(key).join('[your key]') : text;
}
