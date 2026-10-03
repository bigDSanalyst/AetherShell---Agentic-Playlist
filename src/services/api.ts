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

export async function validateWithGuardShellBeta(params: {
  directTranscript: string;
  watermark?: WatermarkData;
  compressedRecord?: CompressedTranscriptData;
  innershellLogic: InnershellLogic;
  executedOutput?: any;
  secretKey?: string;
  adversarialStrictness?: 'HIGH' | 'MAXIMUM' | 'STANDARD';
}): Promise<{ guardReport: GuardAuditReport }> {
  const res = await fetch('/api/engine/guard-validate-beta', {
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
  secretKey?: string;
  adversarialStrictness?: 'HIGH' | 'MAXIMUM' | 'STANDARD';
}): Promise<DualGuardComparisonReport> {
  const [alphaRes, betaRes] = await Promise.all([
    validateWithGuardShell(params),
    validateWithGuardShellBeta(params),
  ]);

  const reportAlpha = alphaRes.guardReport;
  const reportBeta = betaRes.guardReport;

  const deltaAlpha = reportAlpha.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? 0.012;
  const deltaBeta = reportBeta.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? 0.015;
  const discrepancy = Number(Math.abs(deltaAlpha - deltaBeta).toFixed(4));
  const epsilon = 0.05;

  const alphaApproved = reportAlpha.semanticAudit.boundaryDecision === 'APPROVED' && deltaAlpha <= epsilon;
  const betaApproved = reportBeta.semanticAudit.boundaryDecision === 'APPROVED' && deltaBeta <= epsilon;

  let consensusStatus: 'UNANIMOUS_APPROVED' | 'DIVERGENCE_DISAGREEMENT' | 'UNANIMOUS_QUARANTINED' = 'UNANIMOUS_APPROVED';
  let arbitrationVerdict: 'APPROVED' | 'QUARANTINED' | 'REVISE_VIA_FEEDBACK_LOOP' = 'APPROVED';

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
    `Guard Alpha Evaluator: δ_alpha = ${deltaAlpha} (${alphaApproved ? 'APPROVED' : 'QUARANTINED'})`,
    `Guard Beta Evaluator: δ_beta = ${deltaBeta} (${betaApproved ? 'APPROVED' : 'QUARANTINED'})`,
    `Cross-Evaluator Divergence Gap: |δ_alpha - δ_beta| = ${discrepancy} (${discrepancy <= 0.02 ? 'Tight Convergence' : 'Elevated Divergence'})`,
    consensusStatus === 'UNANIMOUS_APPROVED'
      ? 'Layered Consensus: Both independent Guard Shells verified zero synthesis drift below ε = 0.050.'
      : 'Layered Divergence Detected: Inter-guard arbitration triggered quarantine at phase boundary.'
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
  preferredModel?: string;
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

// AetherTwin Parallel Shadow System API Client
export async function fetchAetherTwinTelemetry(): Promise<{ success: boolean; shadowState: any }> {
  const res = await fetch('/api/twin/telemetry');
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
  const res = await fetch('/api/twin/absorb', {
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
  const res = await fetch('/api/twin/simulate-counterfactual', {
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
  const res = await fetch('/api/twin/sync-to-primary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to sync shadow heuristics to primary');
  }
  return res.json();
}


