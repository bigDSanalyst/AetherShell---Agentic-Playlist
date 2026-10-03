export interface TranscriptSegment {
  id: string;
  start: string;
  end: string;
  speaker: string;
  text: string;
}

export interface WatermarkData {
  watermarkId: string;
  transcriptHash: string;
  steganographicToken: string;
  signatureAlgorithm: string;
  signedLogicHash: string | null;
  watermarkedAt: number;
  watermarkedText: string;
  // Signed provenance manifest (Ed25519). The signature covers the transcript
  // and logic SHA-256 hashes and is created before compression.
  manifest?: {
    v: 1;
    watermarkId: string;
    transcriptSha256: string;
    logicSha256: string | null;
    videoId: string | null;
    playlistId: string | null;
    createdAt: number;
  };
  signature?: string;
  logicHash?: string | null;
  publicKeyFingerprint?: string;
}

export interface CompressedTranscriptData {
  rawSizeTokens: number;
  rawSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatioPercent: number;
  compressedBase64: string;
  algorithm: string;
  compressedAt: number;
  decompressionVerified: boolean;
}

export interface VideoNode {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  duration: string;
  url: string;
  rawTranscript?: string;
  segments?: TranscriptSegment[];
  watermark?: WatermarkData;
  compressedTranscript?: CompressedTranscriptData;
  transcriptSource?: 'youtube-captions' | 'unavailable';
  transcriptLanguage?: string;
  transcriptError?: string;
  uploadDate?: string; // ISO 8601 from the YouTube Data API; absent when unknown
  // The exact logic object that was signed together with this transcript.
  boundLogic?: InnershellLogic;
}

export interface PlaylistData {
  id: string;
  title: string;
  description: string;
  url: string;
  videos: VideoNode[];
  isDemo?: boolean;
}

export interface CuratedPlaylistSummary {
  id: string;
  title: string;
  description: string;
  videoCount: number;
  url: string;
  isDemo?: boolean;
}

export interface SotaReflexiveInvariant {
  id: string;
  name: string;
  reflexiveOrder: number;
  formalPredicate: string;
  hoareTriple: {
    preCondition: string;
    action: string;
    postCondition: string;
  };
  description: string;
  // Which built-in deterministic check (if any) this invariant maps to.
  checkId: InvariantCheckId;
  transcriptEvidence: string;
  evidenceFoundInTranscript: boolean;
}

export type InvariantCheckId = 'transcript-present' | 'memory-is-object' | 'logic-signed' | 'grounding-threshold' | 'none';

// Measured per RCL pass by the server.
export interface RclConvergenceRound {
  cycle: number;
  focus: string;
  changeFromPrevious: number; // 1 - Jaccard similarity of content words vs the previous pass
  groundingRatio: number; // share of the pass's content words that appear in the transcript
  modelUsed: string;
}

export interface RclAnalysis {
  iterationCount: number;
  extractedInvariants: string[];
  sotaReflexiveInvariants?: SotaReflexiveInvariant[];
  convergenceRounds?: RclConvergenceRound[];
  reflexiveFixedPointReached?: boolean;
  groundingScore?: number;
  reflexiveFeedbackNotes: string;
  ssiInjectedState: {
    activeContextWindow: number;
    environmentBoundary: string;
    memoryLatticeNodes: number;
    invariantTolerances: {
      driftThreshold: number;
      provenanceEnforced: boolean;
    };
    [key: string]: any;
  };
}

export interface WorkflowStep {
  step: number;
  action: string;
  description: string;
}

export interface InnershellLogic {
  logicId: string;
  summary: string;
  workflowSteps: WorkflowStep[];
  executableScript: string;
  expectedOutputs: {
    verifiedInvariantsCount: number;
    stateMutations: Record<string, any>;
  };
  criticalGuardRequirements: string[];
}

export interface ScriptExecutionResult {
  status: 'SUCCESS' | 'ERROR';
  executedAt: number;
  executionTimeMs: number;
  output: any;
  logs: string[];
  stateMutationsApplied: Record<string, any>;
}

export interface InvariantAuditItem {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  evidence: string;
}

export interface GuardAuditReport {
  guardShellTimestamp: number;
  watermarkSignatureStatus: 'VERIFIED' | 'MISMATCH' | 'MISSING';
  decompressionStatus: boolean;
  cryptographicDetails: {
    expectedTranscriptHash: string;
    computedTranscriptHash: string;
    signedLogicHashProvided: string | null;
    computedLogicSig: string;
    signedBeforeCompression: boolean;
    signatureValid?: boolean;
    transcriptHashMatch?: boolean;
    logicHashMatch?: boolean;
    expectedLogicHash?: string | null;
    computedLogicHash?: string;
    signerKeyFingerprint?: string;
  };
  provenanceFailures?: string[];
  llmAvailable?: boolean;
  evaluatorId?: string;
  semanticAudit: {
    alignmentScore: number;
    dataDegradationIndex: number;
    boundaryDecision: 'APPROVED' | 'QUARANTINED' | 'REVISE_VIA_FEEDBACK_LOOP';
    reasoning: string;
    invariantAudit: InvariantAuditItem[];
    feedbackLoopRequired: boolean;
    correctiveRclGuidance: string;
    unsupportedClaims?: string[];
  };
  passedPhaseBoundary: boolean;
  // Multi-Guard Shell Defense Array Telemetry
  multiGuardTelemetry?: {
    guard1ChannelSentinel: {
      name: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      compressionIntegrityLemmaVerified: boolean;
      channelDriftDetected: boolean;
      preCompressionHashMatch: boolean;
      evidence: string;
    };
    guard2SemanticAuditor: {
      name: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      semanticDistanceDelta: number; // δ(Ls, T)
      epsilonThreshold: number; // ε tolerance (e.g. 0.05)
      synthesisDriftDetected: boolean;
      citationCoveragePercent: number;
      evidence: string;
    };
    guard3FormalOracle: {
      name: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      hoareTriplesVerifiedCount: number;
      lyapunovResidual: number;
      stateContinuityEnforced: boolean;
      evidence: string;
    };
    guard4CustomGitHub?: {
      name: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      customRulesEvaluated: number;
      evidence: string;
    };
    triiVerificationCondition: {
      cryptographicParityMet: boolean; // H(A) = H(Ls)
      semanticDistanceMet: boolean; // δ(A, T) <= ε
      isAlignmentValid: boolean; // Both must hold
      failureModeClassification: 'NONE' | 'CHANNEL_DRIFT' | 'SYNTHESIS_DRIFT' | 'FORMAL_INVARIANT_VIOLATION';
    };
    consensusSummary: {
      unanimousVote: boolean;
      passCount: number;
      totalActiveGuards: number;
      quarantineTriggeredBy: string[];
    };
  };
}

export interface DualGuardComparisonReport {
  timestamp: number;
  guardReportAlpha: GuardAuditReport;
  guardReportBeta: GuardAuditReport;
  deltaAlpha: number; // δ_alpha
  deltaBeta: number; // δ_beta
  divergenceDiscrepancy: number; // |δ_alpha - δ_beta|
  epsilonThreshold: number; // ε
  consensusStatus: 'UNANIMOUS_APPROVED' | 'DIVERGENCE_DISAGREEMENT' | 'UNANIMOUS_QUARANTINED';
  arbitrationVerdict: 'APPROVED' | 'QUARANTINED' | 'REVISE_VIA_FEEDBACK_LOOP';
  meanAlignmentScore: number;
  passedConcurrentValidation: boolean;
  comparativeObservations: string[];
}

export interface LearnedMetaTheorem {
  id: string;
  name: string;
  formalStatement: string;
  derivedFromRunId: string;
  discoveredAt: number;
  confidenceScore: number;
  category: 'INVARIANT_HEURISTIC' | 'DRIFT_PREVENTION' | 'CHANNEL_INTEGRITY' | 'SPEAKER_TOPOLOGY';
  status: 'ACTIVE_SHADOW' | 'APPLIED_TO_PRIMARY' | 'CANDIDATE';
  description: string;
}

export interface CounterfactualExperiment {
  id: string;
  hypothesis: string;
  parameterChanged: string;
  baselineValue: string;
  counterfactualValue: string;
  baselineScore: number;
  simulatedScore: number;
  deltaImprovement: number;
  status: 'COMPLETED' | 'SIMULATING';
  ranAt: number;
  verdict: 'SUPERIOR' | 'INFERIOR' | 'EQUIVALENT';
  note?: string;
}

export interface TwinLogicStateRecord {
  id: string;
  timestamp: number;
  videoTitle: string;
  logicId: string;
  summary: string;
  classification: 'SUCCESSFUL' | 'DRIFTED_SYNTHESIS' | 'DRIFTED_CHANNEL' | 'DRIFTED_HOARE';
  rclIterationCount: number;
  semanticDistanceDelta: number; // δ(Ls, T)
  epsilonThreshold: number; // ε tolerance
  alignmentScore: number;
  lyapunovResidual: number;
  channelParityPassed: boolean;
  quarantineReasons?: string[];
  remediationAction?: string;
}

export interface IterationPerformanceStat {
  iterationCount: number;
  totalRuns: number;
  successCount: number;
  driftCount: number;
  successRatePercent: number;
  meanSemanticDelta: number;
  meanLyapunovResidual: number;
  utilityScore: number;
}

export interface RclIterationRecommendation {
  optimalCount: number;
  confidenceScore: number; // 0.0 - 1.0
  expectedSuccessRatePercent: number;
  projectedDriftDelta: number;
  projectedLyapunovResidual: number;
  reasoning: string;
  iterationStats: IterationPerformanceStat[];
}

export interface ParallelShadowState {
  twinId: string;
  twinName: string;
  status: 'SYNCHRONIZED' | 'OBSERVING' | 'SIMULATING';
  lastObservedRunId: string | null;
  learningVelocity: number; // dG/dt (epistemic growth velocity 0.0 - 1.0)
  totalRunsAnalyzed: number;
  accumulatedTheoremsCount: number;
  synthesisDriftPreventionRate: number;
  channelDriftDetectionRate: number;
  discoveredTheorems: LearnedMetaTheorem[];
  counterfactuals: CounterfactualExperiment[];
  shadowLatticeNodes: {
    id: string;
    label: string;
    type: 'meta_axiom' | 'learned_heuristic' | 'rejection_boundary' | 'drift_detector';
    weight: number;
  }[];
  lastSyncTimestamp: number;
  appliedToPrimaryCount: number;
  // From the server's run ledger (anytime-valid e-process over guard failures).
  ledgerSize?: number;
  drift?: {
    n: number;
    failures: number;
    failureRate: number;
    p0: number;
    alpha: number;
    logE: number;
    threshold: number;
    drifted: boolean;
    direction: 'rising' | 'falling' | 'flat';
  };
}

export interface PersistentSessionMemory {
  sessionId: string;
  sessionName: string;
  createdAt: number;
  lastActive: number;
  memoryLattice: Record<string, any>;
  historyRuns: {
    id: string;
    timestamp: number;
    videoTitle: string;
    alignmentScore: number;
    boundaryDecision: string;
  }[];
}

export interface EmergentConcept {
  name: string;
  definition: string;
  citations: string[];
}

export interface OntologyNode {
  id: string;
  label: string;
  type: string;
}

export interface OntologyEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface GroundingCitation {
  videoTitle: string;
  timestamp: string;
  verbatimQuote: string;
  synthesizedInsight: string;
  quoteVerified?: boolean;
}

export interface SynthesizedKnowledge {
  title: string;
  mode: string;
  coreThesis: string;
  subjugatedAxioms: string[];
  emergentConcepts: EmergentConcept[];
  ontologyGraph: {
    nodes: OntologyNode[];
    edges: OntologyEdge[];
  };
  actionableDirectives: string[];
  dialecticsAndContradictions: string[];
  groundingCitations: GroundingCitation[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  audioTranscriptUsed?: boolean;
}

export interface CustomGitHubGuard {
  id: string;
  repoUrl: string;
  repoName: string;
  filePath: string;
  branch: string;
  code: string;
  name: string;
  version: string;
  description: string;
  ruleList: string[];
  executableSandboxWrapper?: string;
  importedAt: number;
}

export interface GitHubGuardAuditResult {
  passed: boolean;
  score: number;
  decision: 'APPROVED' | 'QUARANTINED' | 'CRITICAL_FEEDBACK';
  violations: string[];
  passedRules: string[];
  auditLog: string[];
  reasoning: string;
  guardId: string;
  guardName: string;
  executedAt: number;
  evaluationMethod?: 'llm-review' | 'sandbox';
  sandboxResult?: { ok: boolean; passed: boolean; score: number; violations: string[]; error?: string };
}


