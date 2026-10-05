import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';

export function envInt(name: string, fallback: number): number {
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
  '/api/guard/github-execute',
  '/api/exchange/system-answer',
];

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

class DemoUsageStore {
  private file: string;
  private memory = new Map<string, DemoEntry>();

  constructor() {
    this.file = path.join(process.cwd(), 'data', 'demo-usage.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.file)) {
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

function cleanIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '').trim();
}

// Access control + Per-IP demo limiter.
// - If the request presents a valid AETHERSHELL_ACCESS_TOKEN, full access is granted.
// - If no token is presented (or incorrect), non-AI requests are open so visitors can browse
//   curated playlists, inspect transcripts, and view architecture.
// - Quota-consuming AI calls (chat, synthesis, RCL/SSI) are allotted a one-time per-IP demo quota
//   (DEMO_LIMIT_PER_IP, default 3). Once exhausted, a DEMO_LIMIT_EXCEEDED response is returned
//   prompting the visitor to deploy their own free instance on Google AI Studio or provide the host token.
export function accessControlAndDemoLimit(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = req.header('x-aethershell-token');
    const isOwner = Boolean(token && validateAccessToken(token, provided));
    const ip = cleanIp(req);
    const demoLimit = envInt('DEMO_LIMIT_PER_IP', 3);
    const used = demoStore.get(ip);

    // Pass token status down for downstream handlers
    (req as any).isAuthorized = isOwner;

    // Set demo headers for client telemetry
    res.setHeader('X-Demo-Limit', String(demoLimit));
    res.setHeader('X-Demo-Used', String(used));
    res.setHeader('X-Demo-Remaining', String(Math.max(0, demoLimit - used)));

    if (isOwner) {
      res.setHeader('X-Aethershell-Auth', 'authorized');
      return next();
    }

    // Exclude read-only or telemetry routes from the demo quota
    if (!isAiQuotaPath(req.path)) {
      return next();
    }

    // AI Quota Path: Check IP allowance
    if (demoLimit > 0 && used >= demoLimit) {
      return res.status(429).json({
        error: 'Demo quota limit reached for this IP',
        code: 'DEMO_LIMIT_EXCEEDED',
        demoLimit,
        demoUsed: used,
        demoRemaining: 0,
        message:
          'You have reached the demo query limit on this shared instance. To continue with unlimited queries using your own free Gemini API key, deploy your own copy of AetherShell on Google AI Studio, or enter the host access token.',
      });
    }

    // Allowed under demo quota: record usage
    const newCount = demoStore.record(ip);
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
