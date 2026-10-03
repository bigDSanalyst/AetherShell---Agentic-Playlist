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
}

export interface PlaylistData {
  id: string;
  title: string;
  description: string;
  url: string;
  videos: VideoNode[];
}

export interface CuratedPlaylistSummary {
  id: string;
  title: string;
  description: string;
  videoCount: number;
  url: string;
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
  convergenceGradient: {
    loopIndex: number;
    errorDelta: number;
    status: 'CONVERGED' | 'STABILIZING';
  }[];
  runtimeAssertionCode: string;
  lyapunovStability: {
    stable: boolean;
    energyMetric: number;
    description: string;
  };
}

export interface RclConvergenceRound {
  cycle: number;
  focus: string;
  deltaReduction: number;
  lyapunovResidual: number;
}

export interface RclAnalysis {
  iterationCount: number;
  extractedInvariants: string[];
  sotaReflexiveInvariants?: SotaReflexiveInvariant[];
  convergenceRounds?: RclConvergenceRound[];
  reflexiveFixedPointReached?: boolean;
  lyapunovConvergenceScore?: number;
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
  };
  semanticAudit: {
    alignmentScore: number;
    dataDegradationIndex: number;
    boundaryDecision: 'APPROVED' | 'QUARANTINED' | 'REVISE_VIA_FEEDBACK_LOOP';
    reasoning: string;
    invariantAudit: InvariantAuditItem[];
    feedbackLoopRequired: boolean;
    correctiveRclGuidance: string;
  };
  passedPhaseBoundary: boolean;
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
}


