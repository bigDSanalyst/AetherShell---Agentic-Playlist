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
  charter: { ok: boolean; problems: string[]; version: number | null };
  exchange?: { awaitingOwner: number; awaitingSystem: number };
  learning?: {
    path: string | null;
    lessons: { valid: number; notAdmitted: number };
    examples: { valid: number; notAdmitted: number };
    tampered: { id: string; why: string }[];
    loadProblems: string[];
  };
  transcripts?: { path: string | null; size: number; loadProblems: string[] };
  models?: {
    configured: string[];
    cascade: { total: number; usable: string[] };
    review: { total: number; usable: string[] } | null;
  };
  geminiQuota?: { allModelsExhausted: boolean; secondsUntilReset: number; models: { model: string; dailyQuotaReached: boolean; lastRefusalAt: string | null }[] };
}

export function diagnose(i: DoctorInput): { status: Severity; findings: Finding[] } {
  const f: Finding[] = [];
  const { env } = i;

  if (i.models) {
    // Which providers are set up, and whether the models the app and the guards use can be called.
    const m = i.models;
    const c = m.cascade.usable.length;
    const r = m.review;
    f.push(
      !m.configured.length
        ? {
            check: 'models',
            severity: 'BLOCK',
            detail: 'No model provider configured: RCL synthesis and the LLM review cannot run; every guard run will fail closed',
            next: 'set GEMINI_API_KEY, or LOCAL_LLM_BASE_URL for a local open model, or OPENROUTER_API_KEY (see .env.example)',
          }
        : !c
        ? {
            check: 'models',
            severity: 'BLOCK',
            detail: `Providers set up (${m.configured.join(', ')}) but none of the ${m.cascade.total} configured models uses them: synthesis cannot run`,
            next: 'set AETHERSHELL_MODELS to models of a configured provider, e.g. local:qwen3:8b',
          }
        : {
            check: 'models',
            severity: c < m.cascade.total ? 'DEGRADED' : 'ok',
            detail: `Providers: ${m.configured.join(', ')}; ${c} of ${m.cascade.total} models callable (${m.cascade.usable.join(', ')}). Not called by doctor`,
            ...(c < m.cascade.total ? { next: 'models of unconfigured providers are skipped; set their key or drop them from AETHERSHELL_MODELS' } : {}),
          }
    );
    if (r && !r.usable.length) {
      f.push({
        check: 'guard-review',
        severity: 'BLOCK',
        detail: `None of the charter's ${r.total} review model(s) has a configured provider: every guard run will fail closed`,
        next: 'configure the provider of a charter review model, or (owner) sign a charter naming models this server can call: npm run owner -- propose',
      });
    }
  } else {
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
  }

  if (i.geminiQuota) {
    const q = i.geminiQuota;
    const out = q.models.filter((m) => m.dailyQuotaReached).map((m) => m.model);
    const resetIn = `${Math.floor(q.secondsUntilReset / 3600)}h ${Math.floor((q.secondsUntilReset % 3600) / 60)}m`;
    if (out.length) {
      f.push({
        check: 'gemini-quota',
        severity: q.allModelsExhausted ? 'BLOCK' : 'DEGRADED',
        detail: q.allModelsExhausted
          ? `Every model was refused today (daily quota used up); synthesis and guard reviews fail closed until the reset in about ${resetIn}`
          : `Daily quota reported used up for ${out.join(', ')}; the other models are still tried. Reset in about ${resetIn}`,
        next: 'wait for midnight Pacific, or enable billing on the Gemini project in AI Studio',
      });
    }
  }

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

  f.push(
    i.charter.ok
      ? { check: 'charter', severity: 'ok', detail: `Owner-signed guard charter v${i.charter.version} in force` }
      : {
          check: 'charter',
          severity: 'BLOCK',
          detail: `Guards are disabled: ${i.charter.problems.join('; ') || 'no valid charter'}`,
          next: 'npm run owner -- keygen (once, on your machine), set AETHERSHELL_OWNER_PUBLIC_KEY, then npm run owner -- init --key <your key> --reason "..."',
        }
  );

  if (i.exchange) {
    const { awaitingOwner, awaitingSystem } = i.exchange;
    f.push(
      awaitingOwner || awaitingSystem
        ? {
            check: 'exchange',
            severity: 'DEGRADED',
            detail: `Open concerns: ${awaitingOwner} awaiting your answer, ${awaitingSystem} awaiting the system's`,
            next: awaitingOwner
              ? 'npm run owner -- concerns, then npm run owner -- answer --concern <id> ...'
              : 'POST /api/exchange/system-answer/<id> once the model is available',
          }
        : { check: 'exchange', severity: 'ok', detail: 'No open concerns on either side' }
    );
  }

  if (i.learning) {
    const l = i.learning;
    const bad = [...l.loadProblems, ...l.tampered.map((t) => `${t.id}: ${t.why}`)];
    const counts = `${l.lessons.valid} lesson(s), ${l.examples.valid} example(s) verified against the ledger`;
    f.push(
      bad.length
        ? {
            check: 'learning',
            severity: 'DEGRADED',
            detail: `${counts}; ${bad.length} item(s) do not match the ledger and are ignored: ${bad.slice(0, 3).join('; ')}`,
            next: `inspect ${l.path ?? 'the learning store'}; it is a cache, so moving it aside loses lessons and examples, not evidence`,
          }
        : !l.path
        ? {
            check: 'learning',
            severity: 'DEGRADED',
            detail: `${counts}; kept in memory only, lost on restart`,
            next: 'set AETHERSHELL_LEARNING_PATH to a writable file',
          }
        : { check: 'learning', severity: 'ok', detail: `${counts} (${l.path})` }
    );
  }

  if (i.transcripts) {
    const t = i.transcripts;
    const counts = `${t.size} video transcript(s) archived; re-ingesting them costs no YouTube request or model quota`;
    f.push(
      t.loadProblems.length
        ? {
            check: 'transcripts',
            severity: 'DEGRADED',
            detail: `${counts}; ${t.loadProblems.length} entr(ies) ignored: ${t.loadProblems.slice(0, 3).join('; ')}`,
            next: `inspect ${t.path}; ignored entries are re-fetched or re-transcribed when next needed`,
          }
        : !t.path
        ? { check: 'transcripts', severity: 'DEGRADED', detail: `${counts}; kept in memory only, lost on restart`, next: 'set AETHERSHELL_TRANSCRIPTS_PATH to a writable file' }
        : { check: 'transcripts', severity: 'ok', detail: `${counts} (${t.path})` }
    );
  }

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
