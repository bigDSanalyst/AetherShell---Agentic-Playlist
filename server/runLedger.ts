import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { canonicalJson, sha256Hex, type SigningKeys } from './provenance';

// Append-only, hash-chained record of what the server itself did: every
// signing (bind) and every guard verdict it produced. Ported in spirit from
// Dharmapala's runs.py / ledger.py and the syndicate-genesis anchor log.
//
// - Each entry names the previous entry's hash, so an edit, a drop from the
//   middle, or a reorder breaks the chain.
// - Entries hold digests, not transcripts or logic, so the file leaks nothing
//   the signed manifests do not already commit to.
// - The head (entry count + Merkle root over entry hashes) is signed with the
//   server's Ed25519 key; an inclusion proof shows one entry is in that head.
//
// What it does not do: stop someone with write access to the file from
// truncating its tail and re-signing (they would need the signing key). Pin
// heads you have seen, or anchor them externally (OpenTimestamps), for that.

export const LEDGER_FORMAT = 'aethershell-ledger/v1';
export const GENESIS = '0'.repeat(64);

export type LedgerEntryKind = 'bind' | 'guard';

export interface LedgerEntry {
  format: typeof LEDGER_FORMAT;
  seq: number;
  at: string; // ISO time the server wrote it
  kind: LedgerEntryKind;
  data: Record<string, unknown>;
  prev: string;
  hash: string;
}

export function entryHash(e: Omit<LedgerEntry, 'hash'> | LedgerEntry): string {
  const { hash: _omit, ...rest } = e as LedgerEntry;
  return sha256Hex(canonicalJson(rest));
}

// RFC 6962 style: leaves and interior nodes are hashed under different
// prefixes, an odd node is carried up unchanged (same shape as Dharmapala's merkle.py).
export const EMPTY_ROOT = '0'.repeat(64);
const leafHash = (h: string) => crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0]), Buffer.from(h, 'hex')])).digest('hex');
const nodeHash = (l: string, r: string) =>
  crypto.createHash('sha256').update(Buffer.concat([Buffer.from([1]), Buffer.from(l, 'hex'), Buffer.from(r, 'hex')])).digest('hex');

function levels(hashes: string[]): string[][] {
  let layer = hashes.map(leafHash);
  const out = [layer];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i + 1 < layer.length; i += 2) next.push(nodeHash(layer[i], layer[i + 1]));
    if (layer.length % 2) next.push(layer[layer.length - 1]);
    layer = next;
    out.push(layer);
  }
  return out;
}

export function merkleRoot(hashes: string[]): string {
  return hashes.length ? levels(hashes).at(-1)![0] : EMPTY_ROOT;
}

export type ProofStep = [sibling: string, side: 'L' | 'R'];

export function merkleProof(hashes: string[], index: number): ProofStep[] {
  if (index < 0 || index >= hashes.length) throw new RangeError(`leaf ${index} not in tree of ${hashes.length}`);
  const proof: ProofStep[] = [];
  for (const layer of levels(hashes).slice(0, -1)) {
    const sib = index ^ 1;
    if (sib < layer.length) proof.push([layer[sib], sib < index ? 'L' : 'R']);
    index = Math.floor(index / 2);
  }
  return proof;
}

// The L/R pattern a proof for `index` in a tree of `size` must have; checking
// it pins the position proved, not only membership.
function expectedSides(size: number, index: number): ('L' | 'R')[] {
  const out: ('L' | 'R')[] = [];
  while (size > 1) {
    const sib = index ^ 1;
    if (sib < size) out.push(sib < index ? 'L' : 'R');
    index = Math.floor(index / 2);
    size = Math.floor(size / 2) + (size % 2);
  }
  return out;
}

export function verifyMerkleProof(entryHashHex: string, proof: ProofStep[], root: string, size: number, index: number): boolean {
  if (index < 0 || index >= size) return false;
  const sides = expectedSides(size, index);
  if (sides.length !== proof.length || proof.some(([, s], i) => s !== sides[i])) return false;
  let h = leafHash(entryHashHex);
  for (const [sib, side] of proof) h = side === 'L' ? nodeHash(sib, h) : nodeHash(h, sib);
  return h === root;
}

export interface LedgerHead {
  format: typeof LEDGER_FORMAT;
  size: number;
  lastHash: string;
  merkleRoot: string;
  signedAt: string;
}

export interface LedgerVerifyResult {
  ok: boolean;
  size: number;
  problems: string[];
}

export function verifyEntries(entries: LedgerEntry[]): LedgerVerifyResult {
  const problems: string[] = [];
  let prev = GENESIS;
  entries.forEach((e, i) => {
    if (e.format !== LEDGER_FORMAT) problems.push(`entry ${i}: unknown format ${String(e.format)}`);
    if (e.seq !== i) problems.push(`entry ${i}: seq is ${e.seq} (dropped or reordered entry)`);
    if (e.prev !== prev) problems.push(`entry ${i}: prev does not match the hash of entry ${i - 1}`);
    if (entryHash(e) !== e.hash) problems.push(`entry ${i}: contents do not hash to its recorded hash (edited)`);
    prev = e.hash;
  });
  return { ok: problems.length === 0, size: entries.length, problems };
}

export class RunLedger {
  private entries: LedgerEntry[] = [];
  readonly loadProblems: string[] = [];

  constructor(private readonly keys: SigningKeys, readonly filePath: string | null) {
    if (filePath && fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim());
      lines.forEach((l, i) => {
        try {
          this.entries.push(JSON.parse(l));
        } catch {
          this.loadProblems.push(`line ${i + 1} is not valid JSON`);
        }
      });
      const v = verifyEntries(this.entries);
      this.loadProblems.push(...v.problems);
    }
  }

  get size() {
    return this.entries.length;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  append(kind: LedgerEntryKind, data: Record<string, unknown>): LedgerEntry {
    if (this.loadProblems.length) {
      // Appending to a broken chain would bless it. Refuse until a human looks.
      throw new Error(`Ledger at ${this.filePath} failed verification on load; not appending (${this.loadProblems[0]})`);
    }
    const body = {
      format: LEDGER_FORMAT,
      seq: this.entries.length,
      at: new Date().toISOString(),
      kind,
      data: JSON.parse(JSON.stringify(data)), // what is read back is what is hashed
      prev: this.entries.at(-1)?.hash ?? GENESIS,
    } as Omit<LedgerEntry, 'hash'>;
    const entry: LedgerEntry = { ...body, hash: entryHash(body) };
    if (this.filePath) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
    }
    this.entries.push(entry);
    return entry;
  }

  verify(): LedgerVerifyResult {
    const v = verifyEntries(this.entries);
    return { ...v, ok: v.ok && this.loadProblems.length === 0, problems: [...new Set([...this.loadProblems, ...v.problems])] };
  }

  head(): { head: LedgerHead; signature: string; publicKeyFingerprint: string } {
    const head: LedgerHead = {
      format: LEDGER_FORMAT,
      size: this.entries.length,
      lastHash: this.entries.at(-1)?.hash ?? GENESIS,
      merkleRoot: merkleRoot(this.entries.map((e) => e.hash)),
      signedAt: new Date().toISOString(),
    };
    const signature = crypto.sign(null, Buffer.from(canonicalJson(head)), this.keys.privateKey).toString('base64');
    return { head, signature, publicKeyFingerprint: this.keys.fingerprint };
  }

  proof(seq: number) {
    const hashes = this.entries.map((e) => e.hash);
    return { entry: this.entries[seq], proof: merkleProof(hashes, seq), size: hashes.length, merkleRoot: merkleRoot(hashes) };
  }
}
