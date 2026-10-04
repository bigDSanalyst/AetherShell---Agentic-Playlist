// Where this deployment stands: `npm run doctor` (add -- --json for machine output).
// Offline and read-only: reads .env, the signing key and the ledger file; calls nothing.
// Exit: 0 ok, 2 DEGRADED, 1 BLOCK.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { hashTranscript, loadSigningKeys } from '../server/provenance';
import { RunLedger } from '../server/runLedger';
import { ledgerDrift } from '../server/eprocess';
import { diagnose, renderFindings } from '../server/doctor';
import { envFloat } from '../server/http';
import { loadCharterState, type LedgerCharterRecord } from '../server/charter';
import { concerns } from '../server/exchange';
import { LearningStore } from '../server/learning';
import { GeminiUsage } from '../server/geminiUsage';
import { modelCascade, modelStatus } from '../server/models';
import { TranscriptArchive } from '../server/transcriptArchive';

dotenv.config({ quiet: true } as any);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = process.env.AETHERSHELL_LEDGER_PATH ?? path.join(root, 'data', 'ledger.jsonl');
const learningPath = process.env.AETHERSHELL_LEARNING_PATH ?? path.join(root, 'data', 'learning.jsonl');
const keys = loadSigningKeys();
const ledger = new RunLedger(keys, ledgerPath || null);
const v = ledger.verify();
const lastCharter = [...ledger.all()].reverse().find((e) => e.kind === 'charter');
const charter = loadCharterState({
  ownerPublicKeyRaw: process.env.AETHERSHELL_OWNER_PUBLIC_KEY,
  serverKeyFingerprint: keys.fingerprint,
  charterPath: process.env.AETHERSHELL_CHARTER_PATH || path.join(root, 'data', 'charter.json'),
  lastLedgerCharter: lastCharter ? (lastCharter.data as unknown as LedgerCharterRecord) : null,
});
const result = diagnose({
  env: process.env,
  host: process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1'),
  signingKeyEphemeral: keys.ephemeral,
  ledger: { path: ledger.filePath, size: ledger.size, ok: v.ok, problems: v.problems },
  drift: ledgerDrift(ledger.all(), envFloat('DRIFT_P0', 0.15), envFloat('DRIFT_ALPHA', 0.01)),
  charter: { ok: charter.ok, problems: charter.problems, version: charter.signed?.charter.version ?? null },
  exchange: (() => {
    const cs = concerns(ledger.all() as any);
    return { awaitingOwner: cs.filter((c) => c.status === 'awaiting-owner').length, awaitingSystem: cs.filter((c) => c.status === 'awaiting-system').length };
  })(),
  transcripts: (() => {
    const p = process.env.AETHERSHELL_TRANSCRIPTS_PATH ?? path.join(root, 'data', 'transcripts.jsonl');
    const a = new TranscriptArchive(p || null, hashTranscript);
    return { path: a.path, size: a.size, loadProblems: a.loadProblems };
  })(),
  models: modelStatus(process.env, modelCascade(process.env), charter.signed?.charter.guard.reviewModels ?? null),
  geminiQuota: (() => {
    const usagePath = process.env.AETHERSHELL_USAGE_PATH ?? (ledgerPath ? path.join(path.dirname(ledgerPath), 'gemini-usage.json') : '');
    const models = modelCascade(process.env);
    return new GeminiUsage(usagePath || null).report([...new Set([...models, ...(charter.signed?.charter.guard.reviewModels ?? [])])], null);
  })(),
  learning: (() => {
    const store = new LearningStore(learningPath || null);
    return { path: store.filePath, ...store.report(ledger.all() as any) };
  })(),
});
console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : renderFindings(result));
process.exit(result.status === 'ok' ? 0 : result.status === 'BLOCK' ? 1 : 2);
