// Anytime-valid drift monitor for the guard's failure rate, ported from
// Dharmapala's eprocess.py (betting e-process with a predictable plug-in bet).
//
// Null hypothesis: each guard run fails with probability at most p0. The
// e-process is a nonnegative supermartingale under the null, so by Ville's
// inequality P(log e ever exceeds log(1/alpha)) <= alpha. The result can be
// read after every run without a multiple-testing penalty: "drifted" means
// the failure rate is credibly above p0, not that one run was unlucky.

export interface EProcessReport {
  n: number;
  failures: number;
  failureRate: number;
  p0: number;
  alpha: number;
  logE: number;
  threshold: number;
  drifted: boolean;
  direction: 'rising' | 'falling' | 'flat';
}

export class EProcessDrift {
  private logE = 0;
  private S = 0; // running sum of (x - p0)
  private t = 0;
  private failures = 0;
  readonly threshold: number;

  constructor(readonly p0 = 0.15, readonly c = 0.5, readonly alpha = 0.01) {
    if (!(p0 > 0 && p0 < 1)) throw new RangeError('p0 must be in (0, 1)');
    if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha must be in (0, 1)');
    // Bets are clipped to [-c, c]; 1 + lam*(x - p0) must stay positive for x in {0,1}.
    if (!(c > 0 && c < 1 / Math.max(p0, 1 - p0))) throw new RangeError('c too large for p0');
    this.threshold = Math.log(1 / alpha);
  }

  update(failed: boolean): boolean {
    const x = failed ? 1 : 0;
    // The bet uses only past data (predictable), which is what keeps this a supermartingale.
    const lam = Math.max(-this.c, Math.min(this.c, this.S / (this.t + 1)));
    this.logE += Math.log(1 + lam * (x - this.p0));
    this.S += x - this.p0;
    this.t += 1;
    this.failures += x;
    return this.logE > this.threshold;
  }

  report(): EProcessReport {
    return {
      n: this.t,
      failures: this.failures,
      failureRate: this.t ? this.failures / this.t : 0,
      p0: this.p0,
      alpha: this.alpha,
      logE: Number(this.logE.toFixed(4)),
      threshold: Number(this.threshold.toFixed(4)),
      drifted: this.logE > this.threshold,
      direction: this.S > 0 ? 'rising' : this.S < 0 ? 'falling' : 'flat',
    };
  }
}

export function analyzeOutcomes(failed: boolean[], p0 = 0.15, alpha = 0.01): EProcessReport {
  const ep = new EProcessDrift(p0, 0.5, alpha);
  for (const f of failed) ep.update(f);
  return ep.report();
}

// Drift over guard verdicts recorded in the run ledger. Runs where the model
// was unavailable are left out: an outage is not drift in the logic.
export function ledgerDrift(entries: readonly { kind: string; data: Record<string, unknown> }[], p0 = 0.15, alpha = 0.01): EProcessReport {
  const outcomes = entries
    .filter((e) => e.kind === 'guard' && e.data.llmAvailable !== false)
    .map((e) => e.data.passed !== true);
  return analyzeOutcomes(outcomes, p0, alpha);
}
