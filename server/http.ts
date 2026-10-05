import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { readVisitorKey, runWithVisitorKey } from './byok';

// A positive integer setting; 0, negative or unparsable falls back (as before:
// RATE_LIMIT_MAX=0 must not mean "refuse every request").
export function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// A setting where 0 is meaningful (DEMO_LIMIT_PER_IP=0: no AI calls for visitors).
export function envIntOrZero(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function envFloat(name: string, fallback: number): number {
  const v = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(v) ? v : fallback;
}

// Endpoints that execute AI model generation, synthesis, or heavy engine cycles
// and therefore spend the host's Gemini API quota.
export const AI_QUOTA_PREFIXES = [
  '/api/knowledge/chat',
  '/api/knowledge/synthesize',
  '/api/engine/rcl-ssi-cycle',
  '/api/engine/guard-validate',
  '/api/engine/guard-validate-beta',
  '/api/audio/transcribe-mic',
  '/api/youtube/transcribe',
  '/api/youtube/fetch-playlist', // transcribes with Gemini when YouTube refuses
  '/api/guard/github-execute',
  '/api/exchange/system-answer',
];

// POSTs a visitor without the token may make besides the AI calls above:
// they read or combine what is already there and change nothing.
export const VISITOR_POSTS = ['/api/transcripts/collection', '/api/auth/verify-token', '/api/auth/check-own-key'];

// Everything else that changes state or uses the server's signing key needs the
// owner's token when one is set: signing (watermark-and-bind), archive import,
// pasted transcripts, the charter, owner answers in the exchange, the twin, and
// GitHub guard imports. A visitor must not be able to get arbitrary text signed
// with this server's key or write to its ledger outside the demo AI calls.
export function isVisitorAllowed(method: string, reqPath: string): 'ai' | 'read' | 'owner-only' {
  const norm = reqPath.split('?')[0];
  const withApi = norm.startsWith('/api') ? norm : `/api${norm.startsWith('/') ? '' : '/'}${norm}`;
  if (isAiQuotaPath(withApi)) return 'ai';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  if (VISITOR_POSTS.includes(withApi)) return 'read';
  return 'owner-only';
}

export function isAiQuotaPath(reqPath: string): boolean {
  const norm = reqPath.split('?')[0];
  const withApi = norm.startsWith('/api') ? norm : `/api${norm.startsWith('/') ? '' : '/'}${norm}`;
  return AI_QUOTA_PREFIXES.some((p) => withApi === p || withApi.startsWith(`${p}/`));
}

export function validateAccessToken(expectedToken: string | undefined, providedToken: string | null | undefined): boolean {
  if (!expectedToken) return false;
  if (!providedToken) return false;
  try {
    const expected = Buffer.from(expectedToken.trim());
    const got = Buffer.from(providedToken.trim());
    if (got.length !== expected.length) return false;
    return crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

interface DemoEntry {
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export class DemoUsageStore {
  private memory = new Map<string, DemoEntry>();

  // file: where counts persist (null: memory only, e.g. in tests).
  constructor(private file: string | null = path.join(process.cwd(), 'data', 'demo-usage.json')) {
    this.load();
  }

  private load() {
    try {
      if (this.file && fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof (v as any).count === 'number') {
              this.memory.set(k, v as DemoEntry);
            }
          }
        }
      }
    } catch {
      // Memory fallback is fine if unreadable
    }
  }

  private save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const obj: Record<string, DemoEntry> = {};
      for (const [k, v] of this.memory) {
        obj[k] = v;
      }
      fs.writeFileSync(this.file, JSON.stringify(obj, null, 2));
    } catch {
      // Advisory persist; never fail requests
    }
  }

  get(ip: string): number {
    return this.memory.get(ip)?.count ?? 0;
  }

  record(ip: string): number {
    const now = new Date().toISOString();
    const cur = this.memory.get(ip);
    if (cur) {
      cur.count += 1;
      cur.lastSeen = now;
      this.memory.set(ip, cur);
      this.save();
      return cur.count;
    }
    const entry: DemoEntry = { count: 1, firstSeen: now, lastSeen: now };
    this.memory.set(ip, entry);
    this.save();
    return 1;
  }
}

export const demoStore = new DemoUsageStore();

export function cleanIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '').trim();
}

// Access control and the per-IP demo allowance.
// - No AETHERSHELL_ACCESS_TOKEN set: the server is the owner's own; everything is
//   open and nothing is counted (as before; doctor warns if it is exposed).
// - Token set and sent: full access.
// - Token set, not sent (a visitor):
//     reads (GET) and VISITOR_POSTS are open, so visitors can browse;
//     AI calls (AI_QUOTA_PREFIXES) are allowed DEMO_LIMIT_PER_IP times per IP
//       (default 3; 0 means none), then DEMO_LIMIT_EXCEEDED;
//     everything else (signing, imports, charter, owner answers) needs the
//       token: ACCESS_TOKEN_REQUIRED.
// - A request carrying the visitor's own Gemini key (x-gemini-api-key, see
//   server/byok.ts) runs its Gemini calls on that key: its AI calls are not
//   counted against the demo allowance. Owner-only actions still need the token.
export function accessControlAndDemoLimit(token: string | undefined, opts: { store?: DemoUsageStore; limit?: () => number } = {}) {
  const store = opts.store ?? demoStore;
  const limitOf = opts.limit ?? (() => envIntOrZero('DEMO_LIMIT_PER_IP', 3));
  const check = accessCheck(token, store, limitOf);
  return (req: Request, res: Response, next: NextFunction) => {
    const key = readVisitorKey(req);
    (req as any).usingOwnKey = !!key;
    if (!key) return check(req, res, next);
    runWithVisitorKey(key, () => check(req, res, next));
  };
}

function accessCheck(token: string | undefined, store: DemoUsageStore, limitOf: () => number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!token) {
      (req as any).isAuthorized = true;
      return next();
    }
    const isOwner = validateAccessToken(token, req.header('x-aethershell-token'));
    (req as any).isAuthorized = isOwner;
    if (isOwner) {
      res.setHeader('X-Aethershell-Auth', 'authorized');
      return next();
    }

    const kind = isVisitorAllowed(req.method, req.path);
    if (kind === 'read') return next();
    if (kind === 'owner-only') {
      return res.status(401).json({
        error: 'This action needs the host access token',
        code: 'ACCESS_TOKEN_REQUIRED',
        message: 'Signing, importing and changing settings are for the owner of this instance. Enter the host access token, or deploy your own copy.',
      });
    }

    // The visitor pays for this call with their own key.
    if ((req as any).usingOwnKey) return next();

    const ip = cleanIp(req);
    const demoLimit = limitOf();
    const used = store.get(ip);
    res.setHeader('X-Demo-Limit', String(demoLimit));
    if (used >= demoLimit) {
      res.setHeader('X-Demo-Remaining', '0');
      return res.status(429).json({
        error: demoLimit === 0 ? 'Demo queries are turned off on this instance' : 'Demo quota limit reached for this IP',
        code: 'DEMO_LIMIT_EXCEEDED',
        demoLimit,
        demoUsed: used,
        demoRemaining: 0,
        message:
          'You have reached the demo query limit on this shared instance. To continue, use your own free Gemini API key here, deploy your own copy of AetherShell on Google AI Studio, or enter the host access token.',
      });
    }
    const newCount = store.record(ip);
    res.setHeader('X-Demo-Used', String(newCount));
    res.setHeader('X-Demo-Remaining', String(Math.max(0, demoLimit - newCount)));
    next();
  };
}

// Backward-compatible alias
export function requireAccessToken(token: string | undefined) {
  return accessControlAndDemoLimit(token);
}

// Fixed-window, in-memory, per-IP limiter. Enough to stop one client from
// draining the Gemini quota; use a shared store if you run several instances.
export function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, opts.windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = cleanIp(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - entry.count)));
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests; try again later' });
    }
    next();
  };
}
