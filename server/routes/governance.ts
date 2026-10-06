// The owner-signed guard charter and the owner ⇄ system exchange.
import type { Express, Request, Response } from 'express';
import path from 'path';
import { CharterError, assessChange, charterSha256, validateCharter, verifyCharterSignature, writeCharterFile, type CharterState, type GuardSettings, type SignedCharter } from '../charter';
import { ExchangeError, assessOverride, concerns as exchangeConcerns, overrides as exchangeOverrides, ownerRecord, verifyOwnerStatement, type SignedOwnerStatement } from '../exchange';
import { CHARTER_PATH, charterState, guardRunRecords, lastLedgerCharter, recordCharter, runLedger, sendError, setCharterState, systemAnswer } from '../core';

export function registerGovernanceRoutes(app: Express) {
  // Guard charter: read it, have the system assess a proposed change, and
  // accept a new version signed by the owner. The server can never sign one.
  app.get('/api/charter', (_req: Request, res: Response) => {
    res.json({
      success: true,
      ok: charterState.ok,
      problems: charterState.problems,
      charter: charterState.signed?.charter ?? null,
      charterSha256: charterState.sha256,
      ownerKeyFingerprint: charterState.ownerKeyFingerprint,
      path: CHARTER_PATH,
    });
  });

  // The system's side of the exchange: what a proposed change would do, from
  // the record, before anyone signs it.
  app.post('/api/charter/assess', (req: Request, res: Response) => {
    if (!charterState.ok || !charterState.signed) {
      return res.status(409).json({ error: 'No valid charter to compare against', problems: charterState.problems });
    }
    const proposed = { ...charterState.signed.charter.guard, ...(req.body?.guard || {}) };
    try {
      validateCharter({ ...charterState.signed.charter, guard: proposed });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    res.json({ success: true, assessment: assessChange(charterState.signed.charter.guard, proposed, guardRunRecords()) });
  });

  app.post('/api/charter', (req: Request, res: Response) => {
    const sc = req.body as SignedCharter;
    try {
      validateCharter(sc?.charter);
    } catch (e: any) {
      return res.status(400).json({ error: e instanceof CharterError ? e.message : 'Invalid charter' });
    }
    if (!charterState.ownerKey) {
      return res.status(409).json({ error: 'No usable owner key configured', problems: charterState.problems });
    }
    if (!verifyCharterSignature(sc, charterState.ownerKey)) {
      return res.status(403).json({ error: 'Charter is not signed by the owner key' });
    }
    const last = lastLedgerCharter();
    const expectedVersion = last ? last.version + 1 : 1;
    if (sc.charter.version !== expectedVersion) {
      return res.status(409).json({ error: `Expected charter version ${expectedVersion}, got ${sc.charter.version}` });
    }
    if (last && sc.charter.prevCharterSha256 !== last.charterSha256) {
      return res.status(409).json({ error: 'Charter does not chain to the current charter (prevCharterSha256 mismatch)' });
    }
    try {
      writeCharterFile(CHARTER_PATH, sc);
      const next: CharterState = { ...charterState, ok: true, problems: [], signed: sc, sha256: charterSha256(sc.charter) };
      const entry = recordCharter(next, last ? ((last as any).guard as GuardSettings) : null);
      setCharterState(next);
      res.json({ success: true, version: sc.charter.version, charterSha256: next.sha256, ledgerSeq: entry.seq, assessment: entry.data.assessment });
    } catch (e: any) {
      sendError(res, e, 'Could not install the charter');
    }
  });

  // The exchange: concerns both ways, answers, single-verdict overrides.
  app.get('/api/exchange', (_req: Request, res: Response) => {
    const all = runLedger.all() as any;
    res.json({ success: true, concerns: exchangeConcerns(all), overrides: exchangeOverrides(all) });
  });

  // The system's assessment of overriding one verdict. The owner must sign
  // its sha256 to override, so an override cannot skip this reasoning.
  app.get('/api/exchange/override-assessment/:seq', (req: Request, res: Response) => {
    const e = runLedger.all().find((x) => x.seq === Number(req.params.seq));
    if (!e) return res.status(404).json({ error: `No ledger entry ${req.params.seq}` });
    try {
      res.json({ success: true, ...assessOverride(e as any) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/exchange/owner', async (req: Request, res: Response) => {
    if (!charterState.ownerKey || !charterState.ownerKeyFingerprint) {
      return res.status(409).json({ error: 'No usable owner key configured', problems: charterState.problems });
    }
    try {
      const sst = req.body as SignedOwnerStatement;
      const st = verifyOwnerStatement(sst, charterState.ownerKey, runLedger.all() as any);
      const record = ownerRecord(st, runLedger.all() as any, sst.ownerSignature, charterState.ownerKeyFingerprint);
      const entry = runLedger.append('exchange', record);
      // An owner concern is owed an answer: the system tries at once. If the
      // model is unavailable the concern simply stays open.
      let systemReply: unknown = null;
      if (record.type === 'concern') {
        try {
          const a = await systemAnswer(`C-${entry.seq}`);
          systemReply = { seq: a.seq, decision: a.data.decision, reason: a.data.reason };
        } catch (e: any) {
          systemReply = { pending: true, why: e?.message || 'model unavailable' };
        }
      }
      res.json({ success: true, seq: entry.seq, type: record.type, systemReply });
    } catch (err: any) {
      if (err instanceof ExchangeError) return res.status(400).json({ error: err.message });
      sendError(res, err, 'Could not record the statement');
    }
  });

  app.post('/api/exchange/system-answer/:id', async (req: Request, res: Response) => {
    try {
      const a = await systemAnswer(String(req.params.id));
      res.json({ success: true, seq: a.seq, decision: a.data.decision, reason: a.data.reason });
    } catch (err: any) {
      if (err instanceof ExchangeError) return res.status(400).json({ error: err.message });
      sendError(res, err, 'System answer failed');
    }
  });
}
