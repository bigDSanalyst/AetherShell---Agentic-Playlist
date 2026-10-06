// The run ledger (head, verify, entries, proofs) and the deployment doctor.
import type { Express, Request, Response } from 'express';
import path from 'path';
import { modelStatus } from '../models';
import { diagnose } from '../doctor';
import { HOST, MODEL_CASCADE, charterState, dailyLimitFor, driftReport, exchangeCounts, geminiUsage, learningStore, runLedger, signingKeys, transcriptArchive, usageModels } from '../core';

export function registerLedgerRoutes(app: Express) {
  // Run ledger: signed head, chain verification, inclusion proofs.
  app.get('/api/ledger/head', (_req: Request, res: Response) => {
    res.json({ success: true, ...runLedger.head(), publicKeyPem: signingKeys.publicKeyPem });
  });
  app.get('/api/ledger/verify', (_req: Request, res: Response) => {
    res.json({ success: true, ...runLedger.verify(), path: runLedger.filePath });
  });
  app.get('/api/ledger/entries', (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json({ success: true, size: runLedger.size, entries: runLedger.all().slice(-limit) });
  });
  app.get('/api/ledger/proof/:seq', (req: Request, res: Response) => {
    const seq = Number(req.params.seq);
    if (!Number.isInteger(seq) || seq < 0 || seq >= runLedger.size) {
      return res.status(404).json({ error: `No ledger entry ${req.params.seq}` });
    }
    res.json({ success: true, ...runLedger.proof(seq) });
  });

  app.get('/api/doctor', (_req: Request, res: Response) => {
    const v = runLedger.verify();
    res.json(
      diagnose({
        env: process.env,
        host: HOST,
        signingKeyEphemeral: signingKeys.ephemeral,
        ledger: { path: runLedger.filePath, size: runLedger.size, ok: v.ok, problems: v.problems },
        drift: driftReport(),
        charter: { ok: charterState.ok, problems: charterState.problems, version: charterState.signed?.charter.version ?? null },
        exchange: exchangeCounts(),
        learning: { path: learningStore.filePath, ...learningStore.report(runLedger.all()) },
        transcripts: { path: transcriptArchive.path, size: transcriptArchive.size, loadProblems: transcriptArchive.loadProblems },
        geminiQuota: geminiUsage.report(usageModels(), dailyLimitFor),
        models: modelStatus(process.env, MODEL_CASCADE, charterState.signed?.charter.guard.reviewModels ?? null),
      })
    );
  });
}
