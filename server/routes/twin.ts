// AetherTwin telemetry, model and Gemini usage, learning report.
import type { Express, Request, Response } from 'express';
import { parseModelRef } from '../models';
import { MODEL_CASCADE, PROVIDER_CONFIG, charterState, dailyLimitFor, geminiUsage, guardEntries, latency, learningReport, refreshTwinStats, shadowState, usageModels } from '../core';

export function registerTwinRoutes(app: Express) {
  // AetherTwin: observed guard outcomes only.
  app.get('/api/twin/telemetry', (_req: Request, res: Response) => {
    refreshTwinStats();
    res.json({ success: true, shadowState });
  });

  // Kept for client compatibility. The twin no longer accepts reports from
  // the browser: it reads the guard runs this server recorded in its ledger.
  app.post('/api/twin/absorb', (_req: Request, res: Response) => {
    refreshTwinStats();
    res.json({ success: true, shadowState, message: `${shadowState.totalRunsAnalyzed} guard run(s) in the server ledger.` });
  });

  // Counterfactual: re-score the runs already observed with a different
  // grounding threshold. Only that parameter can be replayed from stored data.
  app.post('/api/twin/simulate-counterfactual', (req: Request, res: Response) => {
    const { hypothesis, parameterChanged, baselineValue, counterfactualValue } = req.body || {};
    if (parameterChanged !== 'epsilonThreshold') {
      return res.status(400).json({ error: 'Only "epsilonThreshold" can be replayed against observed runs' });
    }
    const base = Number(baselineValue);
    const cf = Number(counterfactualValue);
    if (!Number.isFinite(base) || !Number.isFinite(cf)) {
      return res.status(400).json({ error: 'baselineValue and counterfactualValue must be numbers' });
    }
    // Alpha runs only: Alpha (words) and Beta (word pairs) use different scales.
    const usable = guardEntries()
      .filter((e) => e.data.evaluator === 'alpha' && typeof e.data.wordDelta === 'number')
      .map((e) => ({ wordDelta: e.data.wordDelta as number }));
    if (usable.length === 0) {
      return res.status(409).json({ error: 'No observed guard runs to replay yet. Run the guard shell first.' });
    }
    const passRate = (eps: number) => Math.round((usable.filter((r) => (r.wordDelta as number) <= eps).length / usable.length) * 100);
    const baselineScore = passRate(base);
    const simulatedScore = passRate(cf);
    const delta = simulatedScore - baselineScore;
    const exp = {
      id: `EXP-CF-${Date.now().toString(36).toUpperCase()}`,
      hypothesis: String(hypothesis || `Grounding limit ${base} → ${cf}`).slice(0, 300),
      parameterChanged,
      baselineValue: String(base),
      counterfactualValue: String(cf),
      baselineScore,
      simulatedScore,
      deltaImprovement: delta,
      status: 'COMPLETED',
      ranAt: Date.now(),
      verdict: delta === 0 ? 'EQUIVALENT' : delta > 0 ? 'SUPERIOR' : 'INFERIOR',
      note: `Grounding-check pass rate over ${usable.length} observed Guard Alpha run(s) from the ledger. A higher pass rate means a looser check, not better logic.`,
    };
    shadowState.counterfactuals.unshift(exp);
    shadowState.counterfactuals = shadowState.counterfactuals.slice(0, 50);
    res.json({ success: true, experiment: exp, shadowState });
  });

  // Gemini usage this quota day, as far as this server can know it.
  app.get('/api/gemini/usage', (_req: Request, res: Response) => {
    res.json({ success: true, providers: Object.keys(PROVIDER_CONFIG), usage: geminiUsage.report(usageModels(), dailyLimitFor), latency: latency.report() });
  });

  // The models this server may call, in cascade order, and whether each one's provider is set up.
  app.get('/api/models', (_req: Request, res: Response) => {
    res.json({
      success: true,
      models: MODEL_CASCADE.map((ref) => {
        const m = parseModelRef(ref);
        return { ref, provider: m.provider, model: m.model, available: !!PROVIDER_CONFIG[m.provider] };
      }),
      guardReviewModels: charterState.signed?.charter.guard.reviewModels ?? null,
    });
  });

  // What AetherTwin has learned, and the pass count it would choose next.
  app.get('/api/learning', (req: Request, res: Response) => {
    const key = typeof req.query.playlistKey === 'string' ? req.query.playlistKey.slice(0, 200) : undefined;
    res.json({ success: true, learning: learningReport(key) });
  });

  app.post('/api/twin/sync-to-primary', (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Nothing to sync: AetherTwin only records observed runs; it does not change guard settings.',
      shadowState,
    });
  });
}
