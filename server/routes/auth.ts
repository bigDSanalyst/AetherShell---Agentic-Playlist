// Access: the signing public key, demo status, token and own-key checks.
import type { Express, Request, Response } from 'express';
import { redactKey, visitorKey } from '../byok';
import { cleanIp, envIntOrZero, demoStore, validateAccessToken } from '../http';
import { geminiClient, signingKeys } from '../core';

export function registerAuthRoutes(app: Express) {
  app.get('/api/crypto/public-key', (_req, res) => {
    res.json({
      algorithm: 'Ed25519',
      publicKeyPem: signingKeys.publicKeyPem,
      fingerprint: signingKeys.fingerprint,
      ephemeral: signingKeys.ephemeral,
    });
  });

  // Auth and demo limit status for public visitors vs token holders
  app.get('/api/auth/demo-status', (req: Request, res: Response) => {
    const ip = cleanIp(req);
    const isOwner = Boolean((req as any).isAuthorized);
    const demoLimit = envIntOrZero('DEMO_LIMIT_PER_IP', 3);
    const used = demoStore.get(ip);
    res.json({
      isAuthorized: isOwner,
      hasAccessTokenConfigured: Boolean(process.env.AETHERSHELL_ACCESS_TOKEN),
      ip,
      demoLimit,
      demoUsed: used,
      demoRemaining: isOwner ? null : Math.max(0, demoLimit - used),
      demoExceeded: !isOwner && used >= demoLimit,
      usingOwnKey: Boolean((req as any).usingOwnKey),
    });
  });

  app.post('/api/auth/verify-token', (req: Request, res: Response) => {
    const { token } = req.body || {};
    const configured = process.env.AETHERSHELL_ACCESS_TOKEN;
    if (!configured) {
      return res.json({ valid: true, note: 'No access token configured on host; access is open' });
    }
    const valid = validateAccessToken(configured, token);
    if (!valid) {
      return res.status(401).json({ valid: false, error: 'Invalid access token' });
    }
    res.json({ valid: true, note: 'Access token verified' });
  });

  // Checks a visitor's own Gemini key with a token count (no generation, no
  // quota of the host's). The key is never stored or logged.
  app.post('/api/auth/check-own-key', async (req: Request, res: Response) => {
    if (!visitorKey()) return res.status(400).json({ valid: false, error: 'No key sent, or it does not look like a Google API key.' });
    try {
      await geminiClient().models.countTokens({ model: 'gemini-flash-latest', contents: 'ping' });
      res.json({ valid: true });
    } catch (err: any) {
      const msg = String(err?.message || '');
      const why = /API_KEY_INVALID|API key not valid/i.test(msg)
        ? 'Google says this API key is not valid. Copy it again from aistudio.google.com/app/apikey.'
        : /PERMISSION_DENIED|SERVICE_DISABLED/i.test(msg)
        ? 'Google refused this key (the Gemini API may not be enabled for its project).'
        : redactKey(msg || 'The key was refused').slice(0, 300);
      res.status(400).json({ valid: false, error: why });
    }
  });
}
