// Where this deployment actually stands, computed rather than narrated
// (the syndicate-genesis doctor pattern). Each finding says what was checked
// and, when something is wrong, the command or setting that fixes it.
//
//   ok        the layer is running as designed
//   DEGRADED  it runs, but weaker than designed (say so in any report)
//   BLOCK     a layer that should run cannot; results that depend on it are not real
//
// Read-only and offline: it inspects configuration and local state, it does
// not call Gemini or YouTube.

export type Severity = 'ok' | 'DEGRADED' | 'BLOCK';

export interface Finding {
  check: string;
  severity: Severity;
  detail: string;
  next?: string;
}

export interface DoctorInput {
  env: NodeJS.ProcessEnv;
  host: string;
  signingKeyEphemeral: boolean;
  ledger: { path: string | null; size: number; ok: boolean; problems: string[] };
  drift: { n: number; drifted: boolean; failureRate: number; p0: number; logE: number; threshold: number };
}

export function diagnose(i: DoctorInput): { status: Severity; findings: Finding[] } {
  const f: Finding[] = [];
  const { env } = i;

  f.push(
    env.GEMINI_API_KEY
      ? { check: 'gemini', severity: 'ok', detail: 'GEMINI_API_KEY is set (not called by doctor)' }
      : {
          check: 'gemini',
          severity: 'BLOCK',
          detail: 'No GEMINI_API_KEY: RCL synthesis and the LLM review cannot run; every guard run will fail closed',
          next: 'set GEMINI_API_KEY in .env',
        }
  );

  f.push(
    i.signingKeyEphemeral
      ? {
          check: 'signing-key',
          severity: 'DEGRADED',
          detail: 'Signing key is random per process: signatures and ledger heads stop verifying after a restart',
          next: 'set AETHERSHELL_SIGNING_KEY (see .env.example for the generate command)',
        }
      : { check: 'signing-key', severity: 'ok', detail: 'Persistent Ed25519 signing key loaded' }
  );

  const publicHost = i.host !== '127.0.0.1' && i.host !== 'localhost' && i.host !== '::1';
  if (publicHost && !env.AETHERSHELL_ACCESS_TOKEN) {
    f.push({
      check: 'access',
      severity: 'BLOCK',
      detail: `Listening on ${i.host} with no access token: anyone who can reach it can spend the Gemini quota`,
      next: 'set AETHERSHELL_ACCESS_TOKEN',
    });
  } else {
    f.push({ check: 'access', severity: 'ok', detail: publicHost ? 'Public interface, access token required' : `Loopback only (${i.host})` });
  }

  f.push(
    env.YOUTUBE_API_KEY
      ? { check: 'youtube-data-api', severity: 'ok', detail: 'YOUTUBE_API_KEY set: playlist listing and upload dates use the Data API' }
      : {
          check: 'youtube-data-api',
          severity: 'DEGRADED',
          detail: 'No YOUTUBE_API_KEY: playlists are read from the page (best effort) and upload dates are unknown',
          next: 'set YOUTUBE_API_KEY',
        }
  );

  if (!i.ledger.path) {
    f.push({
      check: 'ledger',
      severity: 'DEGRADED',
      detail: `Run ledger is in memory only (${i.ledger.size} entries); it is lost on restart`,
      next: 'set AETHERSHELL_LEDGER_PATH to a writable file',
    });
  } else if (!i.ledger.ok) {
    f.push({
      check: 'ledger',
      severity: 'BLOCK',
      detail: `Run ledger ${i.ledger.path} failed verification: ${i.ledger.problems.slice(0, 3).join('; ')}`,
      next: 'inspect the file; do not edit entries to make it pass. Move it aside to start a new chain.',
    });
  } else {
    f.push({ check: 'ledger', severity: 'ok', detail: `Run ledger ${i.ledger.path}: ${i.ledger.size} entries, chain intact` });
  }

  const d = i.drift;
  if (d.n === 0) {
    f.push({ check: 'drift', severity: 'ok', detail: 'No guard runs yet; nothing to monitor' });
  } else if (d.drifted) {
    f.push({
      check: 'drift',
      severity: 'DEGRADED',
      detail: `Guard failure rate ${(d.failureRate * 100).toFixed(1)}% over ${d.n} runs is credibly above ${d.p0 * 100}% (log e ${d.logE} > ${d.threshold})`,
      next: 'look at recent guard failures in the ledger before trusting new syntheses',
    });
  } else {
    f.push({
      check: 'drift',
      severity: 'ok',
      detail: `Guard failure rate ${(d.failureRate * 100).toFixed(1)}% over ${d.n} runs; no evidence above ${d.p0 * 100}% (log e ${d.logE} / ${d.threshold})`,
    });
  }

  const status: Severity = f.some((x) => x.severity === 'BLOCK') ? 'BLOCK' : f.some((x) => x.severity === 'DEGRADED') ? 'DEGRADED' : 'ok';
  return { status, findings: f };
}

export function renderFindings(r: { status: Severity; findings: Finding[] }): string {
  const lines = r.findings.map(
    (x) => `  ${x.severity.padEnd(8)} ${x.check.padEnd(17)} ${x.detail}${x.next ? `\n  ${''.padEnd(8)} ${''.padEnd(17)} next: ${x.next}` : ''}`
  );
  return [...lines, '', `status: ${r.status}`].join('\n');
}
