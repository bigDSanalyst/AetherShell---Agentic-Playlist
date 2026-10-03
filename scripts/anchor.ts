// Priority anchoring: prove that this exact code (and, optionally, the run
// ledger's head) existed by a point in time, to anyone, without trusting the
// author, GitHub, Google or this repository. Ported from syndicate-genesis's
// tools/anchor.py so the two projects anchor the same way.
//
//   npm run anchor -- run [--ledger <ledger.jsonl>]   anchor HEAD (and the ledger head) and stamp it
//   npm run anchor -- upgrade                          ask the calendars whether stamps reached Bitcoin
//   npm run anchor -- verify                           check the chain and every stamp, offline
//
// Each run writes anchors/<id>.json, a canonical-JSON manifest: git HEAD, tree
// hash, the copyright/licence claim from package.json and, with --ledger, the
// ledger's size, last hash and Merkle root (hashes only; nothing private).
// It appends an entry to anchors/log.jsonl, a hash chain over entry cores, and
// submits the manifest to the OpenTimestamps calendars with the official `ots`
// client (pip install opentimestamps-client). A few hours later `upgrade`
// fetches the Bitcoin attestation into the .ots file.
//
// Status: unsubmitted -> (ots stamp) -> pending -> (ots upgrade + Bitcoin) -> confirmed.
//
// Exit codes (same as syndicate-genesis):
//   0  done: every anchor's state was established
//   1  needs a human: a broken chain on verify, a broken ots install, an
//      anchor unsubmitted past the stale window, or a ledger that fails verification
//   2  transient: the calendars could not be reached, so some anchors' state is
//      UNKNOWN. That is not "unconfirmed", which would be a claim about Bitcoin.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { merkleRoot, verifyEntries, GENESIS, type LedgerEntry } from '../server/runLedger';

export const ANCHOR_FORMAT = 'aethershell-anchor/v1';
export const STALE_DAYS = 14;
export const CORE_FIELDS = ['seq', 'anchor_id', 'git_head', 'git_tree', 'manifest', 'manifest_sha256', 'prev', 'created'] as const;

export interface AnchorEntry {
  seq: number;
  anchor_id: string;
  git_head: string;
  git_tree: string;
  manifest: string; // path relative to the repo root
  manifest_sha256: string;
  prev: string | null;
  status: 'unsubmitted' | 'pending' | 'confirmed';
  created: string;
  confirmed_at?: string;
  height?: number;
}

const sha256 = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const pad = (n: number) => String(n).padStart(4, '0');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// Sorted keys, no whitespace: same bytes as Python's json.dumps(sort_keys=True, separators=(",", ":"))
// for the ASCII content written here.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as any)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export function coreHash(e: AnchorEntry): string {
  const core: Record<string, unknown> = {};
  for (const k of CORE_FIELDS) core[k] = e[k];
  return sha256(canonical(core));
}

export function loadLog(logPath: string): AnchorEntry[] {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function writeLog(logPath: string, entries: AnchorEntry[]) {
  fs.writeFileSync(logPath, entries.map((e) => canonical(e) + '\n').join(''));
}

function git(repo: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

// The run ledger's head, from the file alone. A ledger that fails verification
// is refused: anchoring it would timestamp a broken record as if it were sound.
export function ledgerHead(ledgerPath: string) {
  const entries: LedgerEntry[] = fs
    .readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const v = verifyEntries(entries);
  if (!v.ok) throw new Error(`ledger ${ledgerPath} fails verification, not anchoring it: ${v.problems.slice(0, 3).join('; ')}`);
  return { size: entries.length, lastHash: entries.at(-1)?.hash ?? GENESIS, merkleRoot: merkleRoot(entries.map((e) => e.hash)) };
}

function claim(repo: string) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  return { name: pkg.name ?? null, author: pkg.author ?? null, license: pkg.license ?? null };
}

export function makeAnchor(repo: string, anchorsDir: string, logPath: string, ledgerPath?: string): AnchorEntry | null {
  const entries = loadLog(logPath);
  const head = git(repo, 'rev-parse', 'HEAD');
  const tree = git(repo, 'rev-parse', 'HEAD^{tree}');
  const ledger = ledgerPath ? ledgerHead(ledgerPath) : null;
  // Same HEAD and nothing new to say about the ledger: nothing to anchor.
  const already = entries.filter((e) => e.git_head === head);
  if (already.length && !ledger) {
    console.log(`skip: HEAD ${head.slice(0, 12)} already anchored #${pad(already.at(-1)!.seq)}`);
    return null;
  }
  if (already.length && ledger) {
    const m = JSON.parse(fs.readFileSync(path.join(repo, already.at(-1)!.manifest), 'utf8'));
    if (m.ledger && m.ledger.lastHash === ledger.lastHash) {
      console.log(`skip: HEAD and ledger head already anchored #${pad(already.at(-1)!.seq)}`);
      return null;
    }
  }
  const prev = entries.at(-1) ?? null;
  const seq = prev ? prev.seq + 1 : 1;
  const anchorId = `${pad(seq)}-${new Date().toISOString().slice(0, 10)}`;
  const manifest = { format: ANCHOR_FORMAT, anchor_id: anchorId, git_head: head, git_tree: tree, claim: claim(repo), ledger };
  const manifestPath = path.join(anchorsDir, `${anchorId}.json`);
  fs.writeFileSync(manifestPath, canonical(manifest));
  const entry: AnchorEntry = {
    seq,
    anchor_id: anchorId,
    git_head: head,
    git_tree: tree,
    manifest: path.relative(repo, manifestPath).split(path.sep).join('/'),
    manifest_sha256: sha256(fs.readFileSync(manifestPath)),
    prev: prev ? coreHash(prev) : null,
    status: 'unsubmitted',
    created: nowIso(),
  };
  fs.appendFileSync(logPath, canonical(entry) + '\n');
  console.log(`anchor #${pad(seq)} ${anchorId}: head ${head.slice(0, 12)}${ledger ? `, ledger ${ledger.size} entries` : ''}`);
  return entry;
}

// --- the ots client ------------------------------------------------------------

export const BROKEN_INSTALL = 'ots-broken-install';
type Run = Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'>;

function otsAvailable(): boolean {
  const r = spawnSync('ots', ['--version'], { encoding: 'utf8' });
  if (r.error) {
    console.log('ots client not found (pip install opentimestamps-client); entries recorded, stamps deferred');
    return false;
  }
  return true;
}

function runOts(...args: string[]): Run {
  const r = spawnSync('ots', args, { encoding: 'utf8', timeout: 300_000 });
  if ((r.error as any)?.code === 'ETIMEDOUT') return { status: 1, stdout: '', stderr: 'ots timed out' };
  if (r.error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${BROKEN_INSTALL}: ots will not execute (${(r.error as any).code ?? r.error.message}). Reinstall it: pip install --force-reinstall opentimestamps-client. This is not a network problem.`,
    };
  }
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// A calendar we could not talk to is not a calendar that said "not yet".
// Allowlist of known-good statuses: anything else counts as "could not look".
const CALENDAR_LINE = /^Calendar\s+(\S+):\s*(.+)$/gm;
const CALENDAR_OK = ['pending', 'attestation', 'complete', 'success'];

export function calendarsAnswered(r: Run | null): [boolean, string] {
  if (!r) return [false, 'ots was never run'];
  const text = `${r.stderr || ''}\n${r.stdout || ''}`;
  const lines = [...text.matchAll(CALENDAR_LINE)].map((m) => [m[1], m[2].trim()] as const);
  const problems = lines.filter(([, t]) => !CALENDAR_OK.some((k) => t.toLowerCase().includes(k)));
  if (problems.length) return [false, `${problems[0][0]}: ${problems[0][1]}`];
  if (r.status !== 0 && !lines.length) {
    const tail = text.trim().split('\n').filter((l) => l.trim());
    return [false, tail.at(-1) ?? `ots exited ${r.status} with no output`];
  }
  return [true, ''];
}

export function parseInfo(text: string | null) {
  const out = { digest: null as string | null, confirmed: false, height: null as number | null };
  if (!text) return out;
  const m = text.match(/File sha256 hash:\s*([0-9a-f]+)/);
  if (m) out.digest = m[1];
  const heights = [...text.matchAll(/BitcoinBlockHeaderAttestation\((\d+)\)/g)].map((x) => Number(x[1]));
  if (heights.length) {
    out.confirmed = true;
    out.height = Math.min(...heights); // the earliest attesting block is the strongest claim
  }
  return out;
}

function infoFor(otsPath: string): string | null {
  const r = runOts('info', otsPath);
  return r.status === 0 ? r.stdout + r.stderr : null;
}

// Returns how many anchors' state could not be established (-1: broken install).
export function ensureStamps(repo: string, logPath: string): number {
  const entries = loadLog(logPath);
  if (!otsAvailable()) return entries.filter((e) => e.status !== 'confirmed').length;
  let changed = false;
  let unchecked = 0;
  const broken: string[] = [];
  for (const e of entries) {
    const manifest = path.join(repo, e.manifest);
    const ots = manifest + '.ots';
    if (!fs.existsSync(manifest)) {
      console.log(`error #${pad(e.seq)}: manifest file missing`);
      continue;
    }
    if (!fs.existsSync(ots)) {
      const r = runOts('stamp', manifest);
      if (fs.existsSync(ots)) {
        e.status = 'pending';
        changed = true;
        console.log(`submitted #${pad(e.seq)} (digest ${(parseInfo(infoFor(ots)).digest ?? '?').slice(0, 12)})`);
      } else if (r.stderr.includes(BROKEN_INSTALL)) broken.push(pad(e.seq));
      else {
        let [answered, problem] = calendarsAnswered(r);
        if (answered) problem = (r.stderr || r.stdout).trim().split('\n').at(-1) || 'ots stamp failed with no output';
        unchecked++;
        console.log(`unsubmitted #${pad(e.seq)} - could not reach the calendars to submit it (${problem})`);
      }
    } else if (e.status !== 'confirmed') {
      const r = runOts('upgrade', ots);
      const [answered, problem] = calendarsAnswered(r);
      const info = parseInfo(infoFor(ots));
      if (e.status === 'unsubmitted') {
        e.status = 'pending';
        changed = true;
      }
      if (info.digest && info.digest !== e.manifest_sha256) console.log(`error #${pad(e.seq)}: .ots covers different bytes than the log claims`);
      if (info.confirmed) {
        e.status = 'confirmed';
        e.confirmed_at = nowIso();
        if (info.height) e.height = info.height;
        changed = true;
        console.log(`confirmed #${pad(e.seq)} in Bitcoin (block ${info.height ?? '?'})`);
      } else if (r.stderr.includes(BROKEN_INSTALL)) broken.push(pad(e.seq));
      else if (!answered) {
        unchecked++;
        console.log(`unknown #${pad(e.seq)} - could not reach the calendars, so nothing was checked (${problem}). This is NOT "not yet confirmed".`);
      } else console.log(`pending #${pad(e.seq)} - not yet in a Bitcoin block (usually a few hours)`);
    }
  }
  if (changed) writeLog(logPath, entries);
  if (broken.length) {
    console.log(`ots is installed but will not run, so anchors ${broken.join(', ')} were not checked. Reinstall opentimestamps-client.`);
    return -1;
  }
  return unchecked;
}

export function staleUnsubmitted(entries: AnchorEntry[], now = new Date()): number[] {
  return entries
    .filter((e) => e.status === 'unsubmitted' && (now.getTime() - Date.parse(e.created)) / 86_400_000 > STALE_DAYS)
    .map((e) => e.seq);
}

// Chain, manifests and stamps, offline (`ots info` reads the file; no network).
export function verifyChain(repo: string, logPath: string, checkOts = true): boolean {
  const entries = loadLog(logPath);
  if (!entries.length) {
    console.log('no anchors yet');
    return true;
  }
  let ok = true;
  let prev: string | null = null;
  const cli = checkOts && otsAvailable();
  for (const e of entries) {
    if (e.prev !== prev) {
      console.log(`error #${pad(e.seq)}: chain broken (prev mismatch)`);
      ok = false;
    }
    prev = coreHash(e);
    const m = path.join(repo, e.manifest);
    if (!fs.existsSync(m)) {
      console.log(`error #${pad(e.seq)}: manifest missing`);
      ok = false;
      continue;
    }
    if (sha256(fs.readFileSync(m)) !== e.manifest_sha256) {
      console.log(`error #${pad(e.seq)}: manifest digest mismatch - tampered?`);
      ok = false;
    }
    const ots = m + '.ots';
    if (e.status !== 'unsubmitted' && !fs.existsSync(ots)) {
      console.log(`error #${pad(e.seq)}: status ${e.status} but no .ots file`);
      ok = false;
    }
    if (fs.existsSync(ots)) {
      if (cli) {
        const info = parseInfo(infoFor(ots));
        if (info.digest && info.digest !== e.manifest_sha256) {
          console.log(`error #${pad(e.seq)}: .ots covers different bytes than the log claims`);
          ok = false;
        }
        if (info.confirmed) console.log(`  #${pad(e.seq)} attested at Bitcoin block ${info.height ?? '?'}`);
      } else console.log(`  #${pad(e.seq)}: .ots present (ots client absent - digest check skipped)`);
    }
  }
  const conf = entries.filter((e) => e.status === 'confirmed').length;
  console.log(`${entries.length} anchor(s), ${conf} Bitcoin-confirmed - ${ok ? 'OK' : 'FAILURES PRESENT'}`);
  return ok;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const opt = (k: string) => {
    const i = rest.indexOf(`--${k}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const repo = path.resolve(opt('repo') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const anchorsDir = path.join(repo, 'anchors');
  fs.mkdirSync(anchorsDir, { recursive: true });
  const logPath = path.join(anchorsDir, 'log.jsonl');

  // `run` is asked to RECORD an anchor; stamping is best-effort (an entry with
  // no ots client is still recorded, and goes stale-red after STALE_DAYS).
  // `upgrade` is asked to FIND OUT, so not being able to look is a failure.
  let unchecked = 0;
  try {
    if (cmd === 'run') {
      makeAnchor(repo, anchorsDir, logPath, opt('ledger'));
      ensureStamps(repo, logPath);
    } else if (cmd === 'upgrade') unchecked = ensureStamps(repo, logPath);
    else if (cmd === 'verify') return verifyChain(repo, logPath) ? 0 : 1;
    else {
      console.error('usage: npm run anchor -- run [--ledger <ledger.jsonl>] | upgrade | verify');
      return 1;
    }
  } catch (e: any) {
    console.error(`anchor: ${e.message}`);
    return 1;
  }
  const stale = staleUnsubmitted(loadLog(logPath));
  if (stale.length) {
    console.log(`error: anchors ${stale.join(', ')} unsubmitted for more than ${STALE_DAYS} days`);
    return 1;
  }
  if (unchecked < 0) return 1;
  if (unchecked) {
    console.log(`${unchecked} anchor(s) could not be checked at all. Run again when the network is back; nothing is wrong with the chain.`);
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
