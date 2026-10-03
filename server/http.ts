import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// Optional shared access token. When AETHERSHELL_ACCESS_TOKEN is set, every
// /api request must send it in the x-aethershell-token header.
export function requireAccessToken(token: string | undefined) {
  const expected = token ? Buffer.from(token) : null;
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) return next();
    const got = Buffer.from(String(req.header('x-aethershell-token') || ''));
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) return next();
    res.status(401).json({ error: 'Missing or invalid access token', code: 'ACCESS_TOKEN_REQUIRED' });
  };
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
    const key = req.ip || req.socket.remoteAddress || 'unknown';
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

export function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function envFloat(name: string, fallback: number): number {
  const v = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(v) ? v : fallback;
}
