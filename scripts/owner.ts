// The owner's tool. Runs on YOUR machine; the private key never goes to the server.
//
//   npm run owner -- keygen [--out ~/.aethershell/owner-key.pem]
//   npm run owner -- init   --key <private key> --reason "why" [--out data/charter.json]
//   npm run owner -- propose --charter data/charter.json --set minWordOverlap=0.6 [--server http://127.0.0.1:3000]
//   npm run owner -- sign   --key <private key> --charter data/charter.json --set minWordOverlap=0.6 --reason "why"
//                           [--next-owner <fingerprint>] [--out <file>]
//   npm run owner -- verify --charter data/charter.json [--pub <public key>]
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
    default:
      die('commands: keygen | init | propose | sign | verify (see scripts/owner.ts)');
  }
}

main().catch((e) => die(e instanceof CharterError ? e.message : e?.message || String(e)));
