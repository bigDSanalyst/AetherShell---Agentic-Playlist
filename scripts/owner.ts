// The owner's tool. Runs on YOUR machine; the private key never goes to the server.
//
//   npm run owner -- keygen [--out ~/.aethershell/owner-key.pem]
//   npm run owner -- init   --key <private key> --reason "why" [--out data/charter.json]
//   npm run owner -- propose --charter data/charter.json --set minWordOverlap=0.6 [--server http://127.0.0.1:3000]
//   npm run owner -- sign   --key <private key> --charter data/charter.json --set minWordOverlap=0.6 --reason "why"
//                           [--next-owner <fingerprint>] [--out <file>]
//   npm run owner -- verify --charter data/charter.json [--pub <public key>]
//
// The exchange (concerns both ways, answers, single-verdict overrides):
//   npm run owner -- concerns                                   list open and answered concerns
//   npm run owner -- raise    --key <k> --topic "..." --body "..."   raise a concern the system must answer
//   npm run owner -- answer   --key <k> --concern C-12 --decision accepted|declined|noted --reason "..."
//   npm run owner -- override --seq 34                          step 1: read the system's assessment
//   npm run owner -- override --key <k> --seq 34 --ack <sha256> --decision accept|reject --reason "..."
//                                                               step 2: sign, acknowledging that assessment
// All take [--server http://127.0.0.1:3000]; AETHERSHELL_ACCESS_TOKEN is sent if set.
//
// `propose` asks the server for its assessment (which recorded verdicts would
// flip) before you sign. `sign` writes the next charter version; install it by
// restarting the server or with: curl -X POST <server>/api/charter -H 'Content-Type: application/json' -d @<file>
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CharterError,
  DEFAULT_GUARD,
  firstCharter,
  keyFingerprint,
  nextCharter,
  parsePublicKey,
  signCharter,
  validateCharter,
  verifyCharterSignature,
  writeCharterFile,
  type GuardSettings,
  type SignedCharter,
} from '../server/charter';
import { newOwnerStatement, signOwnerStatement } from '../server/exchange';

const [cmd, ...rest] = process.argv.slice(2);
const args: Record<string, string[]> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) (args[rest[i].slice(2)] ??= []).push(rest[i + 1] ?? '');
  if (rest[i].startsWith('--')) i++;
}
const arg = (k: string) => args[k]?.[0];
const die = (m: string): never => {
  console.error(`owner: ${m}`);
  process.exit(1);
};
const expand = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

function loadPrivate(p: string | undefined) {
  if (!p) die('--key <private key file> is required');
  const key = crypto.createPrivateKey(fs.readFileSync(expand(p!), 'utf8'));
  if (key.asymmetricKeyType !== 'ed25519') die('the owner key must be Ed25519');
  return key;
}

function parseSets(): Partial<GuardSettings> {
  const out: Record<string, unknown> = {};
  for (const kv of args.set ?? []) {
    const i = kv.indexOf('=');
    if (i < 1) die(`--set expects name=value, got ${kv}`);
    const k = kv.slice(0, i);
    const v = kv.slice(i + 1);
    if (!(k in DEFAULT_GUARD)) die(`unknown guard setting ${k} (known: ${Object.keys(DEFAULT_GUARD).join(', ')})`);
    out[k] = k === 'reviewModels' ? v.split(',').map((m) => m.trim()).filter(Boolean) : v === 'true' ? true : v === 'false' ? false : Number(v);
  }
  return out as Partial<GuardSettings>;
}

function readCharter(p: string | undefined): SignedCharter {
  if (!p) die('--charter <file> is required');
  return JSON.parse(fs.readFileSync(p!, 'utf8'));
}

const server = () => arg('server') ?? 'http://127.0.0.1:3000';
async function api(method: string, p: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.AETHERSHELL_ACCESS_TOKEN) headers['x-aethershell-token'] = process.env.AETHERSHELL_ACCESS_TOKEN;
  const res = await fetch(`${server()}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) die(`server said (${res.status}): ${json.error || 'error'}`);
  return json;
}

async function main() {
  switch (cmd) {
    case 'keygen': {
      const out = expand(arg('out') ?? '~/.aethershell/owner-key.pem');
      if (fs.existsSync(out)) die(`${out} already exists; refusing to overwrite a key`);
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
      const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      console.log(`Private key written to ${out} (keep it off the server; back it up).`);
      console.log(`Fingerprint: ${keyFingerprint(publicKey)}`);
      console.log('\nPut this in the server environment (.env):');
      console.log(`AETHERSHELL_OWNER_PUBLIC_KEY=${Buffer.from(pubPem).toString('base64')}`);
      return;
    }
    case 'init': {
      const key = loadPrivate(arg('key'));
      const reason = arg('reason') ?? die('--reason "..." is required');
      const sc = signCharter(firstCharter(reason as string, { ...DEFAULT_GUARD, ...parseSets() }), key);
      const out = arg('out') ?? 'data/charter.json';
      if (fs.existsSync(out)) die(`${out} exists; use "sign" to issue the next version`);
      writeCharterFile(out, sc);
      console.log(`Charter v1 signed and written to ${out}`);
      console.log(JSON.stringify(sc.charter.guard, null, 2));
      return;
    }
    case 'propose': {
      const current = readCharter(arg('charter'));
      const server = arg('server') ?? 'http://127.0.0.1:3000';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.AETHERSHELL_ACCESS_TOKEN) headers['x-aethershell-token'] = process.env.AETHERSHELL_ACCESS_TOKEN;
      const res = await fetch(`${server}/api/charter/assess`, { method: 'POST', headers, body: JSON.stringify({ guard: parseSets() }) });
      const body: any = await res.json();
      if (!res.ok) die(`server said: ${body.error}`);
      console.log(`Current charter v${current.charter.version}. The system's assessment of this change:\n`);
      console.log(body.assessment.summary);
      return;
    }
    case 'sign': {
      const key = loadPrivate(arg('key'));
      const current = readCharter(arg('charter'));
      const reason = arg('reason') ?? die('--reason "..." is required');
      const next = nextCharter(current.charter, parseSets(), reason as string, { nextOwnerKeyFingerprint: arg('next-owner') ?? null });
      const sc = signCharter(next, key);
      const out = arg('out') ?? `data/charter.v${next.version}.json`;
      writeCharterFile(out, sc);
      console.log(`Charter v${next.version} signed and written to ${out}`);
      console.log('Install it: restart the server with AETHERSHELL_CHARTER_PATH pointing at it, or');
      console.log(`  curl -X POST http://127.0.0.1:3000/api/charter -H 'Content-Type: application/json' -d @${out}`);
      return;
    }
    case 'verify': {
      const sc = readCharter(arg('charter'));
      validateCharter(sc.charter);
      const raw = arg('pub') ? fs.readFileSync(expand(arg('pub')!), 'utf8') : process.env.AETHERSHELL_OWNER_PUBLIC_KEY;
      if (!raw) die('--pub <public key file> or AETHERSHELL_OWNER_PUBLIC_KEY is required');
      const ok = verifyCharterSignature(sc, parsePublicKey(raw!));
      console.log(ok ? `Charter v${sc.charter.version}: signature verifies` : 'Signature does NOT verify');
      process.exit(ok ? 0 : 1);
    }
    case 'concerns': {
      const { concerns, overrides } = await api('GET', '/api/exchange');
      if (!concerns.length) console.log('No concerns on either side.');
      for (const c of concerns) {
        console.log(`\n${c.id}  [${c.status}]  from ${c.from}  ${c.at}\n  topic: ${c.topic}\n  ${String(c.body).replace(/\n/g, '\n  ')}`);
        for (const a of c.answers) console.log(`  -> ${a.from} ${a.decision}: ${a.reason}`);
      }
      if (overrides.length) console.log(`\n${overrides.length} verdict override(s) recorded.`);
      return;
    }
    case 'raise': {
      const key = loadPrivate(arg('key'));
      const st = newOwnerStatement('concern', { topic: arg('topic') ?? die('--topic is required'), body: arg('body') ?? die('--body is required') });
      const out = await api('POST', '/api/exchange/owner', signOwnerStatement(st, key));
      console.log(`Concern recorded as C-${out.seq}.`);
      if (out.systemReply?.pending) console.log(`The system has not answered yet: ${out.systemReply.why}`);
      else if (out.systemReply) console.log(`System (${out.systemReply.decision}): ${out.systemReply.reason}`);
      return;
    }
    case 'answer': {
      const key = loadPrivate(arg('key'));
      const st = newOwnerStatement('answer', {
        concernId: arg('concern') ?? die('--concern C-<n> is required'),
        decision: arg('decision') ?? die('--decision accepted|declined|noted is required'),
        reason: arg('reason') ?? die('--reason "..." is required'),
      });
      const out = await api('POST', '/api/exchange/owner', signOwnerStatement(st, key));
      console.log(`Answer recorded (ledger entry ${out.seq}).`);
      return;
    }
    case 'override': {
      const seq = arg('seq') ?? die('--seq <guard ledger entry> is required');
      const a = await api('GET', `/api/exchange/override-assessment/${seq}`);
      if (!arg('ack')) {
        console.log(`The system's assessment of overriding run ${seq} (${a.assessment.evaluator}, recorded ${a.assessment.recordedVerdict}):\n`);
        console.log(`  ${a.assessment.summary}`);
        for (const f of a.assessment.failedChecks) console.log(`   - ${f}`);
        console.log(`\nTo override, sign this assessment: --ack ${a.assessmentSha256} --key <k> --decision accept|reject --reason "..."`);
        return;
      }
      const key = loadPrivate(arg('key'));
      const st = newOwnerStatement('override', {
        guardSeq: Number(seq),
        acknowledgedAssessmentSha256: arg('ack'),
        decision: arg('decision') ?? die('--decision accept|reject is required'),
        reason: arg('reason') ?? die('--reason "..." is required'),
      });
      const out = await api('POST', '/api/exchange/owner', signOwnerStatement(st, key));
      console.log(`Override recorded (ledger entry ${out.seq}).`);
      return;
    }
    default:
      die('commands: keygen | init | propose | sign | verify | concerns | raise | answer | override (see scripts/owner.ts)');
  }
}

main().catch((e) => die(e instanceof CharterError ? e.message : e?.message || String(e)));
