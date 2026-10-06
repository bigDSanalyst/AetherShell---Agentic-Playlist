import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { HOST, ROOT } from './server/core';
import { envInt, rateLimit, requireAccessToken } from './server/http';
import { registerAuthRoutes } from './server/routes/auth';
import { registerYoutubeRoutes } from './server/routes/youtube';
import { registerTranscriptsRoutes } from './server/routes/transcripts';
import { registerNotebooksRoutes } from './server/routes/notebooks';
import { registerEngineRoutes } from './server/routes/engine';
import { registerKnowledgeRoutes } from './server/routes/knowledge';
import { registerGithubGuardsRoutes } from './server/routes/githubGuards';
import { registerTwinRoutes } from './server/routes/twin';
import { registerGovernanceRoutes } from './server/routes/governance';
import { registerLedgerRoutes } from './server/routes/ledger';

// The HTTP server: access control and rate limit first, then the API routes
// (server/routes/), then the page (built in production, Vite in development).
async function startServer() {
  const app = express();
  const host = HOST;
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(express.json({ limit: process.env.MAX_BODY_SIZE || '15mb' }));

  app.use('/api', requireAccessToken(process.env.AETHERSHELL_ACCESS_TOKEN));
  app.use(
    '/api',
    rateLimit({ windowMs: envInt('RATE_LIMIT_WINDOW_MS', 5 * 60_000), max: envInt('RATE_LIMIT_MAX', 60) })
  );

  registerAuthRoutes(app);
  registerYoutubeRoutes(app);
  registerTranscriptsRoutes(app);
  registerNotebooksRoutes(app);
  registerEngineRoutes(app);
  registerKnowledgeRoutes(app);
  registerGithubGuardsRoutes(app);
  registerTwinRoutes(app);
  registerGovernanceRoutes(app);
  registerLedgerRoutes(app);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(ROOT, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(ROOT, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  app.listen(port, host, () => {
    console.log(`AetherShell server online at http://${host}:${port}`);
    if (host !== '127.0.0.1' && !process.env.AETHERSHELL_ACCESS_TOKEN) {
      console.warn('[security] Listening on a public interface without AETHERSHELL_ACCESS_TOKEN; anyone who can reach it can spend your Gemini quota.');
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error in server.ts:', err);
  process.exit(1);
});
