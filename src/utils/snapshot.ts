import type { InnershellLogic, PersistentSessionMemory, PlaylistData, RclAnalysis, VideoNode } from '../types';

// A snapshot of the working state, to download and restore later: session
// memory, the playlist (transcripts, signed watermarks, compressed records, the
// logic bound to each), the active video, and the latest synthesis.
//
// Not included: guard verdicts. The server's run ledger is the record of what
// the guards decided; a verdict read back from a file would be a claim, not a
// verdict. After a restore, run the guards again. Signed watermarks in a
// snapshot are re-verified by the guards like any other input, so editing the
// file cannot make tampered content pass.

export const SNAPSHOT_FORMAT = 'aethershell-snapshot/v1';
export const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

export interface WorkSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  savedAt: string;
  note: string;
  sessionMemory: PersistentSessionMemory;
  playlist: PlaylistData | null;
  activeVideoId: string | null;
  activeVideo: VideoNode | null; // kept when it is not part of the playlist
  innershellLogic: InnershellLogic | null;
  rclAnalysis: RclAnalysis | null;
}

export function buildSnapshot(s: {
  sessionMemory: PersistentSessionMemory;
  playlist: PlaylistData | null;
  activeVideo: VideoNode | null;
  innershellLogic: InnershellLogic | null;
  rclAnalysis: RclAnalysis | null;
}): WorkSnapshot {
  const inPlaylist = !!(s.activeVideo && s.playlist?.videos.some((v) => v.id === s.activeVideo!.id));
  return {
    format: SNAPSHOT_FORMAT,
    savedAt: new Date().toISOString(),
    note: 'Working state only. Guard verdicts are not included: the server ledger is their record; re-run the guards after restoring.',
    sessionMemory: { ...s.sessionMemory, historyRuns: [] },
    playlist: s.playlist,
    activeVideoId: s.activeVideo?.id ?? null,
    activeVideo: inPlaylist ? null : s.activeVideo,
    innershellLogic: s.innershellLogic,
    rclAnalysis: s.rclAnalysis,
  };
}

export type ParsedSnapshot =
  | { ok: true; kind: 'snapshot'; snapshot: WorkSnapshot; activeVideo: VideoNode | null; summary: string }
  | { ok: true; kind: 'memory-only'; memoryLattice: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);

export function parseSnapshot(text: string): ParsedSnapshot {
  if (text.length > MAX_SNAPSHOT_BYTES) return { ok: false, error: 'File is larger than 50 MB.' };
  let x: any;
  try {
    x = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a JSON file.' };
  }
  if (!isObj(x)) return { ok: false, error: 'Not a snapshot: expected a JSON object.' };

  // Earlier exports held the session memory only.
  if (x.format === undefined) {
    if (!isObj(x.memoryLattice)) return { ok: false, error: 'Not a snapshot: no "format" and no memoryLattice.' };
    return { ok: true, kind: 'memory-only', memoryLattice: x.memoryLattice, summary: `memory only (${Object.keys(x.memoryLattice).length} keys)` };
  }
  if (x.format !== SNAPSHOT_FORMAT) return { ok: false, error: `Unknown snapshot format "${String(x.format).slice(0, 60)}".` };

  const m = x.sessionMemory;
  if (!isObj(m) || typeof m.sessionId !== 'string' || !isObj(m.memoryLattice)) {
    return { ok: false, error: 'Snapshot has no valid sessionMemory.' };
  }
  const p = x.playlist;
  if (p !== null && (!isObj(p) || typeof p.id !== 'string' || !Array.isArray(p.videos) || !p.videos.every((v: unknown) => isObj(v) && typeof (v as any).id === 'string'))) {
    return { ok: false, error: 'Snapshot playlist is malformed.' };
  }
  for (const k of ['innershellLogic', 'rclAnalysis', 'activeVideo'] as const) {
    if (x[k] !== null && x[k] !== undefined && !isObj(x[k])) return { ok: false, error: `Snapshot ${k} is malformed.` };
  }

  const snapshot: WorkSnapshot = {
    format: SNAPSHOT_FORMAT,
    savedAt: String(x.savedAt ?? ''),
    note: String(x.note ?? ''),
    sessionMemory: {
      sessionId: m.sessionId,
      sessionName: String(m.sessionName ?? 'Restored session'),
      createdAt: Number(m.createdAt) || Date.now(),
      lastActive: Date.now(),
      memoryLattice: m.memoryLattice,
      historyRuns: [], // verdict history is not restored from a file
    },
    playlist: p ?? null,
    activeVideoId: typeof x.activeVideoId === 'string' ? x.activeVideoId : null,
    activeVideo: x.activeVideo ?? null,
    innershellLogic: x.innershellLogic ?? null,
    rclAnalysis: x.rclAnalysis ?? null,
  };
  const activeVideo = snapshot.playlist?.videos.find((v) => v.id === snapshot.activeVideoId) ?? snapshot.activeVideo;
  const parts = [
    `${Object.keys(snapshot.sessionMemory.memoryLattice).length} memory keys`,
    snapshot.playlist ? `playlist "${String(snapshot.playlist.title).slice(0, 60)}" (${snapshot.playlist.videos.length} videos)` : 'no playlist',
    snapshot.innershellLogic ? 'synthesized logic' : 'no logic',
  ];
  return { ok: true, kind: 'snapshot', snapshot, activeVideo, summary: parts.join(', ') + (snapshot.savedAt ? `, saved ${snapshot.savedAt}` : '') };
}
