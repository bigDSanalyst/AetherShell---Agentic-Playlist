import {
  PlaylistData,
  CuratedPlaylistSummary,
  WatermarkData,
  CompressedTranscriptData,
  InnershellLogic,
  RclAnalysis,
  SynthesisLearning,
  GuardAuditReport,
  DualGuardComparisonReport,
  VideoNode,
  ClaimCheck,
} from '../types';

const TOKEN_KEY = 'aethershell_access_token';

export function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {}
}

export function clearStoredAccessToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// The visitor's own Gemini API key ("bring your own key"). Kept in this
// browser only: for this tab (sessionStorage), or on this device if they ask
// (localStorage). Sent with each request as x-gemini-api-key so their AI calls
// run on their own quota; the server never stores it.
const OWN_KEY = 'aethershell_gemini_key';

export function readOwnGeminiKey(): string {
  try {
    return sessionStorage.getItem(OWN_KEY) || localStorage.getItem(OWN_KEY) || '';
  } catch {
    return '';
  }
}

export function clearOwnGeminiKey(): void {
  try {
    sessionStorage.removeItem(OWN_KEY);
  } catch {}
  try {
    localStorage.removeItem(OWN_KEY);
  } catch {}
}

// Checks the key with the server (a token count on the visitor's key), then keeps it.
export async function verifyAndSaveOwnGeminiKey(key: string, remember: boolean): Promise<{ valid: boolean; error?: string }> {
  const k = key.trim();
  const res = await fetch('/api/auth/check-own-key', { method: 'POST', headers: { 'x-gemini-api-key': k } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.valid) return { valid: false, error: body.error || 'The key was not accepted' };
  clearOwnGeminiKey();
  try {
    (remember ? localStorage : sessionStorage).setItem(OWN_KEY, k);
  } catch {}
  return { valid: true };
}

export interface DemoStatus {
  usingOwnKey?: boolean;
  isAuthorized: boolean;
  hasAccessTokenConfigured: boolean;
  ip: string;
  demoLimit: number;
  demoUsed: number;
  demoRemaining: number | null;
  demoExceeded: boolean;
}

export async function fetchDemoStatus(): Promise<DemoStatus> {
  const res = await apiFetch('/api/auth/demo-status');
  if (!res.ok) throw new Error('Failed to fetch demo status');
  return res.json();
}

export async function verifyAndSaveAccessToken(token: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch('/api/auth/verify-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.valid) {
    saveToken(token);
    return { valid: true };
  }
  return { valid: false, error: body.error || 'Invalid access token' };
}

// fetch wrapper: sends the optional access token and broadcasts auth / demo limit events
async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    const token = readToken();
    if (token) headers.set('x-aethershell-token', token);
    const ownKey = readOwnGeminiKey();
    if (ownKey) headers.set('x-gemini-api-key', ownKey);
    return fetch(url, { ...init, headers });
  };
  const res = await send();

  if (res.status === 429) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.code === 'DEMO_LIMIT_EXCEEDED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aethershell:demo-limit-exceeded', { detail: body }));
    }
  } else if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.code === 'ACCESS_TOKEN_REQUIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aethershell:access-token-required', { detail: body }));
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
  modelFallback?: boolean; // when YouTube refuses, let Gemini transcribe the video (uses quota)
}): Promise<{
  playlist: PlaylistData;
  source: string;
  metadataNote?: string | null;
  transcriptCoverage?: { withTranscript: number; total: number };
  transcriptProblems?: string | null; // why some videos have no transcript, grouped
}> {
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

// Fetches one video's transcript: "captions" asks YouTube for its caption track,
// "model" has Gemini transcribe the video itself. Returns the server's video
// exactly as it recorded it (its text is what the server will sign).
export async function fetchVideoTranscriptFor(params: {
  youtubeId: string;
  method?: 'captions' | 'model';
  title?: string;
}): Promise<{ segments: any[]; source: VideoNode['transcriptSource']; video: Partial<VideoNode> }> {
  const res = await apiFetch('/api/youtube/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch transcript');
  }
  return res.json();
}

// The Google sign-in client id for the YouTube playlist picker (null: not set up).
export async function fetchGoogleClientId(): Promise<string | null> {
  const res = await apiFetch('/api/config/google-client');
  if (!res.ok) return null;
  return (await res.json()).clientId ?? null;
}

// Videos picked from the owner's own YouTube account (only ids and titles are sent).
export async function ingestPickedVideos(params: {
  playlistId?: string;
  title: string;
  items: { videoId: string; title?: string; channel?: string }[];
  modelFallback?: boolean;
}): Promise<Awaited<ReturnType<typeof fetchPlaylistData>>> {
  const res = await apiFetch('/api/youtube/ingest-videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to ingest the picked videos');
  return data;
}

// A Jupyter / Colab notebook as a source: an uploaded .ipynb, or a Colab,
// Google Drive ("Anyone with the link") or GitHub link.
export async function importNotebook(params: { content?: string; filename?: string; url?: string }): Promise<{
  playlist: PlaylistData;
  source: string;
  leftOut?: { images: number; html: number };
}> {
  const res = await apiFetch('/api/notebooks/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to import the notebook');
  return data;
}

// Links that are notebooks rather than YouTube videos or playlists.
export function isNotebookLink(url: string): boolean {
  return /colab\.research\.google\.com\/|drive\.google\.com\/|\.ipynb(\?|#|$)/i.test(url.trim());
}

// Builds a .ipynb from work done here and saves it (open it in Colab with
// File → Upload notebook).
export async function exportNotebook(params: {
  title: string;
  sources: VideoNode[];
  logic?: unknown;
  boundVideo?: VideoNode | null;
  knowledge?: unknown;
  demo?: boolean;
}): Promise<{ filename: string; signedCheck: string }> {
  const res = await apiFetch('/api/notebooks/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      sources: params.sources.map((v) => ({
        title: v.title,
        url: v.url,
        kind: v.kind,
        transcriptSource: v.transcriptSource,
        transcriptMethod: v.transcriptMethod,
        rawTranscript: v.rawTranscript || '',
        isDemo: !!params.demo,
      })),
      logic: params.logic,
      boundVideo: params.boundVideo ? { rawTranscript: params.boundVideo.rawTranscript, watermark: params.boundVideo.watermark } : undefined,
      knowledge: params.knowledge,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to build the notebook');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data.notebook, null, 1)], { type: 'application/x-ipynb+json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = data.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { filename: data.filename, signedCheck: data.signedCheck };
}

export interface LibraryEntry {
  videoId: string;
  title: string;
  source: 'youtube-captions' | 'model-transcription' | 'owner-provided';
  model: string | null;
  at: string;
  words: number;
  segments: number;
  imported?: boolean;
}

// The whole transcript archive as a file (to keep outside the server).
export async function exportTranscriptArchive(): Promise<{ text: string; filename: string; count: number }> {
  const res = await apiFetch('/api/transcripts/export');
  if (!res.ok) throw new Error('Failed to export the transcript archive');
  const text = await res.text();
  const m = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
  return { text, filename: m ? m[1] : 'aethershell-transcripts.json', count: JSON.parse(text).count ?? 0 };
}

export interface ArchiveImportResult {
  added: { videoId: string; title: string }[];
  alreadyHere: number;
  keptLocal: { videoId: string; title: string }[];
  rejected: { entry: number; videoId: string | null; why: string }[];
}

// Restores a transcript archive file into the server's archive.
export async function importTranscriptArchive(fileText: string): Promise<ArchiveImportResult> {
  let body: unknown;
  try {
    body = JSON.parse(fileText);
  } catch {
    throw new Error('That file is not JSON; choose a file saved with "Save archive to a file".');
  }
  const res = await apiFetch('/api/transcripts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.rejected) throw new Error(data.error || 'Failed to restore the archive');
  return data;
}

// Every transcript the server has kept (its archive).
export async function fetchTranscriptLibrary(): Promise<{ videos: LibraryEntry[]; path: string | null; problems: string[] }> {
  const res = await apiFetch('/api/transcripts/library');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load the transcript library');
  }
  return res.json();
}

// Archived videos combined into one set.
export async function buildCollection(videoIds: string[], title?: string): Promise<{ playlist: PlaylistData; missing: string[] }> {
  const res = await apiFetch('/api/transcripts/collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoIds, title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to combine the videos');
  }
  return res.json();
}

// A transcript the owner pasted; recorded as owner-provided.
export async function submitProvidedTranscript(params: {
  youtubeId: string;
  text: string;
  title?: string;
}): Promise<{ segments: any[]; source: VideoNode['transcriptSource']; video: Partial<VideoNode> }> {
  const res = await apiFetch('/api/youtube/provided-transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save the pasted transcript');
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
  rclIterations?: number | 'auto';
  userDirectives?: string;
  writer?: string; // a model ref, 'auto' (AetherTwin chooses), or omitted (first configured)
}): Promise<{
  rclResult: RclAnalysis;
  innershellLogic: InnershellLogic;
  learning: SynthesisLearning;
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

// How much of each video the server actually sent the model (server/corpus.ts).
export interface CorpusCoverage {
  video: number;
  title: string;
  includedChars: number;
  totalChars: number;
  complete: boolean;
  fromArchive?: boolean; // the server used its archived (recorded, signable) text, not the browser's copy
}

export async function synthesizePlaylistKnowledge(params: {
  playlistTitle?: string;
  playlistDescription?: string;
  videos: any[];
  mode?: string;
  focusQuery?: string;
  preferredModel?: string;
}): Promise<{ knowledge: any; synthesizedAt: number; corpusCoverage?: CorpusCoverage[]; sourceCheck?: { fromArchive: number; total: number } }> {
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
}): Promise<{ reply: string; timestamp: number; corpusCoverage?: CorpusCoverage[] }> {
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

// The chat answer as it is written: onDelta gets each new piece. Resolves when
// the answer is complete; rejects on an error (partial text stays with the caller).
export async function streamSubjugatedChatMessage(
  params: { messages: { role: string; content: string }[]; playlistTitle?: string; videos: any[]; preferredModel?: string },
  onDelta: (text: string) => void
): Promise<{ modelUsed: string | null; degraded?: boolean; corpusCoverage?: CorpusCoverage[]; claimCheck?: ClaimCheck; timestamp: number }> {
  const res = await apiFetch('/api/knowledge/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, stream: true }),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Chat request failed');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!line.startsWith('data:')) continue;
      const ev = JSON.parse(line.slice(5));
      if (typeof ev.delta === 'string') onDelta(ev.delta);
      else if (ev.error) throw new Error(ev.partial ? `${ev.error} (the answer above is incomplete)` : ev.error);
      else if (ev.done) return ev;
    }
  }
  throw new Error('The answer stopped before it was complete.');
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



export interface GeminiUsageReport {
  day: string;
  timeZone: string;
  secondsUntilReset: number;
  dailyLimit: number | null;
  limitSource: string | null;
  allModelsExhausted: boolean;
  persisted: string | null;
  models: {
    model: string;
    answered: number;
    dailyQuotaRefusals: number;
    rateLimitRefusals: number;
    otherFailures: number;
    skippedAfterDailyQuota: number;
    lastRefusalAt: string | null;
    lastRefusal: string | null;
    dailyQuotaReached: boolean;
    dailyLimit: number | null;
    usedFraction: number | null;
  }[];
}

export interface ModelInfo {
  ref: string; // "provider:model", as the server names it
  provider: string;
  model: string;
  available: boolean; // the provider is set up on the server
}

export async function fetchModels(): Promise<{ models: ModelInfo[]; guardReviewModels: string[] | null }> {
  const res = await apiFetch('/api/models');
  if (!res.ok) throw new Error(`server answered ${res.status}`);
  return res.json();
}

// Measured model-call times per task since the server started (server/latency.ts).
export interface TaskLatency {
  task: string;
  calls: number;
  medianMs: number;
  p90Ms: number;
  lastMs: number;
  lastModel: string;
  firstTokenMedianMs: number | null;
}

export async function fetchGeminiUsage(): Promise<{ providers: string[]; usage: GeminiUsageReport; latency?: TaskLatency[] }> {
  const res = await apiFetch('/api/gemini/usage');
  if (!res.ok) throw new Error(`server answered ${res.status}`);
  return res.json();
}

export async function fetchLearning(playlistKey?: string): Promise<any> {
  const q = playlistKey ? `?playlistKey=${encodeURIComponent(playlistKey)}` : '';
  const res = await apiFetch(`/api/learning${q}`);
  if (!res.ok) throw new Error('Could not load what AetherTwin has learned');
  return (await res.json()).learning;
}

export async function fetchSignerPublicKey(): Promise<{ algorithm: string; publicKeyPem: string; fingerprint: string; ephemeral: boolean }> {
  const res = await apiFetch('/api/crypto/public-key');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch signer public key');
  }
  return res.json();
}

export interface CharterStatus {
  ok: boolean;
  problems: string[];
  charter: null | {
    version: number;
    issuedAt: string;
    reason: string;
    guard: { minWordOverlap: number; minBigramOverlap: number; requireLlmApproval: boolean; requireWitness: boolean; reviewModels: string[] };
  };
  charterSha256: string | null;
  ownerKeyFingerprint: string | null;
}

// Installs a charter the owner signed on their own machine (npm run owner -- init
// or sign). The server checks the signature against AETHERSHELL_OWNER_PUBLIC_KEY
// and that it chains to the current one; it cannot sign one itself.
export async function installSignedCharter(fileText: string): Promise<{ version: number }> {
  let body: any;
  try {
    body = JSON.parse(fileText);
  } catch {
    throw new Error('That file is not JSON; choose the charter file written by npm run owner (e.g. data/charter.json).');
  }
  const res = await apiFetch('/api/charter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([data.error || 'The server did not accept the charter', ...(data.problems || [])].join(': '));
  return { version: body?.charter?.version ?? data?.charter?.version };
}

export async function fetchCharterStatus(): Promise<CharterStatus> {
  const res = await apiFetch('/api/charter');
  if (!res.ok) throw new Error('Failed to read the guard charter');
  return res.json();
}

export interface ExchangeConcern {
  id: string;
  seq: number;
  at: string;
  from: 'owner' | 'system';
  topic: string;
  body: string;
  evidence: unknown;
  answers: { seq: number; at: string; from: 'owner' | 'system'; decision: string; reason: string }[];
  status: 'awaiting-owner' | 'awaiting-system' | 'answered';
}

export async function fetchExchange(): Promise<{ concerns: ExchangeConcern[]; overrides: any[] }> {
  const res = await apiFetch('/api/exchange');
  if (!res.ok) throw new Error('Failed to read the exchange');
  return res.json();
}

export async function requestSystemAnswer(id: string): Promise<{ decision: string; reason: string }> {
  const res = await apiFetch(`/api/exchange/system-answer/${encodeURIComponent(id)}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'The system could not answer');
  return body;
}
