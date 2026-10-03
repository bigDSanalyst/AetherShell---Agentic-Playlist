import {
  PlaylistData,
  CuratedPlaylistSummary,
  WatermarkData,
  CompressedTranscriptData,
  InnershellLogic,
  RclAnalysis,
  GuardAuditReport,
} from '../types';

export async function fetchCuratedPlaylists(): Promise<CuratedPlaylistSummary[]> {
  const res = await fetch('/api/youtube/curated');
  if (!res.ok) throw new Error('Failed to fetch curated playlists');
  const data = await res.json();
  return data.playlists || [];
}

export async function fetchPlaylistData(params: {
  playlistUrl?: string;
  curatedId?: string;
}): Promise<{ playlist: PlaylistData; source: string }> {
  const res = await fetch('/api/youtube/fetch-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch playlist');
  }
  return res.json();
}

export async function transcribeAudioSegment(params: {
  videoTitle: string;
  audioNotes?: string;
  existingSegments?: any[];
}): Promise<{ segments: any[]; summary: string }> {
  const res = await fetch('/api/youtube/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to transcribe');
  }
  return res.json();
}

export async function watermarkAndBindCrypto(params: {
  rawTranscript: string;
  videoId?: string;
  playlistId?: string;
  pertainedLogic?: any;
  secretKey?: string;
}): Promise<{
  watermark: WatermarkData;
  compressed: CompressedTranscriptData;
  auditTrail: any;
}> {
  const res = await fetch('/api/crypto/watermark-and-bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to watermark and compress');
  }
  return res.json();
}

export async function runRclSsiCycle(params: {
  playlist?: PlaylistData;
  activeVideo?: any;
  sessionMemory?: any;
  rclIterations?: number;
  userDirectives?: string;
}): Promise<{
  rclResult: RclAnalysis;
  innershellLogic: InnershellLogic;
  cycleTimestamp: number;
}> {
  const res = await fetch('/api/engine/rcl-ssi-cycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to run RCL/SSI cycle');
  }
  return res.json();
}

export async function validateWithGuardShell(params: {
  directTranscript: string;
  watermark?: WatermarkData;
  compressedRecord?: CompressedTranscriptData;
  innershellLogic: InnershellLogic;
  executedOutput?: any;
  secretKey?: string;
}): Promise<{ guardReport: GuardAuditReport }> {
  const res = await fetch('/api/engine/guard-validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Guard Shell validation failed');
  }
  return res.json();
}

export async function synthesizePlaylistKnowledge(params: {
  playlistTitle?: string;
  playlistDescription?: string;
  videos: any[];
  mode?: string;
  focusQuery?: string;
}): Promise<{ knowledge: any; synthesizedAt: number }> {
  const res = await fetch('/api/knowledge/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to synthesize playlist knowledge');
  }
  return res.json();
}

export async function sendSubjugatedChatMessage(params: {
  messages: { role: string; content: string }[];
  playlistTitle?: string;
  videos: any[];
  subjugationStrictness?: number;
}): Promise<{ reply: string; timestamp: number }> {
  const res = await fetch('/api/knowledge/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Chat request failed');
  }
  return res.json();
}

export async function transcribeMicrophoneAudio(params: {
  audioBase64: string;
  mimeType?: string;
}): Promise<{ transcription: string }> {
  const res = await fetch('/api/audio/transcribe-mic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to transcribe microphone audio');
  }
  return res.json();
}

export async function importGitHubGuard(params: {
  repoUrl?: string;
  filePath?: string;
  branch?: string;
  rawContent?: string;
  githubToken?: string;
}): Promise<{ guard: any }> {
  const res = await fetch('/api/guard/github-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import GitHub guard');
  }
  return res.json();
}

export async function executeGitHubGuardAudit(params: {
  guard: any;
  directTranscript: string;
  watermark?: any;
  innershellLogic?: any;
  sessionMemory?: any;
}): Promise<{ auditResult: any }> {
  const res = await fetch('/api/guard/github-execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to execute GitHub guard audit');
  }
  return res.json();
}


