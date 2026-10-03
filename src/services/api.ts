import {
  PlaylistData,
  CuratedPlaylistSummary,
  WatermarkData,
  CompressedTranscriptData,
  InnershellLogic,
  RclAnalysis,
  GuardAuditReport,
  DualGuardComparisonReport,
} from '../types';

const TOKEN_KEY = 'aethershell_access_token';

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

// fetch wrapper: sends the optional access token, and asks for it once if the
// server requires one (AETHERSHELL_ACCESS_TOKEN).
async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    const token = readToken();
    if (token) headers.set('x-aethershell-token', token);
    return fetch(url, { ...init, headers });
  };
  let res = await send();
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.code === 'ACCESS_TOKEN_REQUIRED' && typeof window !== 'undefined') {
      const entered = window.prompt('This AetherShell server requires an access token:');
      if (entered) {
        try {
          localStorage.setItem(TOKEN_KEY, entered.trim());
        } catch {}
        res = await send();
      }
    }
  }
  return res;
}

export async function fetchCuratedPlaylists(): Promise<CuratedPlaylistSummary[]> {
  const res = await apiFetch('/api/youtube/curated');
  if (!res.ok) throw new Error('Failed to fetch curated playlists');
  const data = await res.json();
  return data.playlists || [];
}

export async function fetchPlaylistData(params: {
  playlistUrl?: string;
  curatedId?: string;
}): Promise<{ playlist: PlaylistData; source: string }> {
  const res = await apiFetch('/api/youtube/fetch-playlist', {
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

// Re-fetches a video's caption transcript from YouTube.
export async function fetchVideoCaptions(params: { youtubeId: string }): Promise<{ segments: any[]; summary: string }> {
  const res = await apiFetch('/api/youtube/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch captions');
  }
  return res.json();
}

export async function watermarkAndBindCrypto(params: {
  rawTranscript: string;
  videoId?: string;
  playlistId?: string;
  pertainedLogic?: any;
}): Promise<{
  watermark: WatermarkData;
  compressed: CompressedTranscriptData;
  auditTrail: any;
}> {
  const res = await apiFetch('/api/crypto/watermark-and-bind', {
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
  const res = await apiFetch('/api/engine/rcl-ssi-cycle', {
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
}): Promise<{ guardReport: GuardAuditReport }> {
  const res = await apiFetch('/api/engine/guard-validate', {
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

export async function validateWithGuardShellBeta(params: {
  directTranscript: string;
  watermark?: WatermarkData;
  compressedRecord?: CompressedTranscriptData;
  innershellLogic: InnershellLogic;
  executedOutput?: any;
  adversarialStrictness?: 'HIGH' | 'MAXIMUM' | 'STANDARD';
}): Promise<{ guardReport: GuardAuditReport }> {
  const res = await apiFetch('/api/engine/guard-validate-beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Guard Shell Beta validation failed');
  }
  return res.json();
}

export async function validateWithDualGuardShells(params: {
  directTranscript: string;
  watermark?: WatermarkData;
  compressedRecord?: CompressedTranscriptData;
  innershellLogic: InnershellLogic;
  executedOutput?: any;
  adversarialStrictness?: 'HIGH' | 'MAXIMUM' | 'STANDARD';
}): Promise<DualGuardComparisonReport> {
  const [alphaRes, betaRes] = await Promise.all([
    validateWithGuardShell(params),
    validateWithGuardShellBeta(params),
  ]);

  const reportAlpha = alphaRes.guardReport;
  const reportBeta = betaRes.guardReport;

  // Each guard reports its own measured distance and limit; nothing is assumed.
  const g2a = reportAlpha.multiGuardTelemetry?.guard2SemanticAuditor;
  const g2b = reportBeta.multiGuardTelemetry?.guard2SemanticAuditor;
  const deltaAlpha = g2a?.semanticDistanceDelta ?? 1;
  const deltaBeta = g2b?.semanticDistanceDelta ?? 1;
  const discrepancy = Number(Math.abs(deltaAlpha - deltaBeta).toFixed(4));
  const epsilon = g2a?.epsilonThreshold ?? 0;

  const alphaApproved = reportAlpha.passedPhaseBoundary === true;
  const betaApproved = reportBeta.passedPhaseBoundary === true;

  let consensusStatus: 'UNANIMOUS_APPROVED' | 'DIVERGENCE_DISAGREEMENT' | 'UNANIMOUS_QUARANTINED';
  let arbitrationVerdict: 'APPROVED' | 'QUARANTINED' | 'REVISE_VIA_FEEDBACK_LOOP';
  if (alphaApproved && betaApproved) {
    consensusStatus = 'UNANIMOUS_APPROVED';
    arbitrationVerdict = 'APPROVED';
  } else if (!alphaApproved && !betaApproved) {
    consensusStatus = 'UNANIMOUS_QUARANTINED';
    arbitrationVerdict = 'QUARANTINED';
  } else {
    consensusStatus = 'DIVERGENCE_DISAGREEMENT';
    arbitrationVerdict = 'QUARANTINED';
  }

  const meanScore = Math.round((reportAlpha.semanticAudit.alignmentScore + reportBeta.semanticAudit.alignmentScore) / 2);

  const observations = [
    `Guard Alpha (word overlap): δ = ${deltaAlpha}, limit ${g2a?.epsilonThreshold ?? 'n/a'} → ${alphaApproved ? 'APPROVED' : 'QUARANTINED'}`,
    `Guard Beta (word-pair overlap): δ = ${deltaBeta}, limit ${g2b?.epsilonThreshold ?? 'n/a'} → ${betaApproved ? 'APPROVED' : 'QUARANTINED'}`,
    `The two guards measure different things (words vs word pairs), so their δ values are not directly comparable.`,
    consensusStatus === 'UNANIMOUS_APPROVED'
      ? 'Both guards passed signature, grounding and LLM checks.'
      : 'At least one guard failed a check; the boundary stays closed.',
  ];

  return {
    timestamp: Date.now(),
    guardReportAlpha: reportAlpha,
    guardReportBeta: reportBeta,
    deltaAlpha,
    deltaBeta,
    divergenceDiscrepancy: discrepancy,
    epsilonThreshold: epsilon,
    consensusStatus,
    arbitrationVerdict,
    meanAlignmentScore: meanScore,
    passedConcurrentValidation: consensusStatus === 'UNANIMOUS_APPROVED',
    comparativeObservations: observations,
  };
}

export async function synthesizePlaylistKnowledge(params: {
  playlistTitle?: string;
  playlistDescription?: string;
  videos: any[];
  mode?: string;
  focusQuery?: string;
  preferredModel?: string;
}): Promise<{ knowledge: any; synthesizedAt: number }> {
  const res = await apiFetch('/api/knowledge/synthesize', {
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
  preferredModel?: string;
}): Promise<{ reply: string; timestamp: number }> {
  const res = await apiFetch('/api/knowledge/chat', {
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
  const res = await apiFetch('/api/audio/transcribe-mic', {
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
  const res = await apiFetch('/api/guard/github-import', {
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
  const res = await apiFetch('/api/guard/github-execute', {
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

// AetherTwin Parallel Shadow System API Client
export async function fetchAetherTwinTelemetry(): Promise<{ success: boolean; shadowState: any }> {
  const res = await apiFetch('/api/twin/telemetry');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch AetherTwin telemetry');
  }
  return res.json();
}

export async function absorbRunIntoTwin(params: {
  runId?: string;
  innershellLogic?: any;
  guardReport?: any;
  transcriptLength?: number;
}): Promise<{ success: boolean; shadowState: any; message: string }> {
  const res = await apiFetch('/api/twin/absorb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to absorb run into twin');
  }
  return res.json();
}

export async function simulateTwinCounterfactual(params: {
  hypothesis?: string;
  parameterChanged?: string;
  baselineValue?: string;
  counterfactualValue?: string;
}): Promise<{ success: boolean; experiment: any; shadowState: any }> {
  const res = await apiFetch('/api/twin/simulate-counterfactual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to run counterfactual simulation');
  }
  return res.json();
}

export async function syncTwinToPrimary(): Promise<{ success: boolean; message: string; shadowState: any }> {
  const res = await apiFetch('/api/twin/sync-to-primary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to sync shadow heuristics to primary');
  }
  return res.json();
}


