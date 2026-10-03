// Where this deployment stands: `npm run doctor` (add -- --json for machine output).
// Offline and read-only: reads .env, the signing key and the ledger file; calls nothing.
// Exit: 0 ok, 2 DEGRADED, 1 BLOCK.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadSigningKeys } from '../server/provenance';
import { RunLedger } from '../server/runLedger';
import { ledgerDrift } from '../server/eprocess';
import { diagnose, renderFindings } from '../server/doctor';
import { envFloat } from '../server/http';

dotenv.config({ quiet: true } as any);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = process.env.AETHERSHELL_LEDGER_PATH ?? path.join(root, 'data', 'ledger.jsonl');
const keys = loadSigningKeys();
const ledger = new RunLedger(keys, ledgerPath || null);
const v = ledger.verify();
const result = diagnose({
  env: process.env,
  host: process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1'),
  signingKeyEphemeral: keys.ephemeral,
  ledger: { path: ledger.filePath, size: ledger.size, ok: v.ok, problems: v.problems },
  drift: ledgerDrift(ledger.all(), envFloat('DRIFT_P0', 0.15), envFloat('DRIFT_ALPHA', 0.01)),
});
console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : renderFindings(result));
process.exit(result.status === 'ok' ? 0 : result.status === 'BLOCK' ? 1 : 2);
