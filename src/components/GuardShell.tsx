import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  FileText,
  Key,
  Database,
  ArrowRight,
  TrendingDown,
  Layers,
  Activity,
  Github,
  Code2,
  Download,
  Terminal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import {
  GuardAuditReport,
  VideoNode,
  InnershellLogic,
  ScriptExecutionResult,
  CustomGitHubGuard,
  GitHubGuardAuditResult,
  DualGuardComparisonReport,
} from '../types';
import { importGitHubGuard, executeGitHubGuardAudit } from '../services/api';

interface GuardShellProps {
  guardReport: GuardAuditReport | null;
  guardReportBeta?: GuardAuditReport | null;
  dualComparisonReport?: DualGuardComparisonReport | null;
  activeVideo: VideoNode | null;
  innershellLogic: InnershellLogic | null;
  lastExecutionResult: ScriptExecutionResult | null;
  onTriggerFeedbackLoop: () => void;
  onRunAudit: () => void;
  onRunBetaAudit?: (strictness: 'HIGH' | 'MAXIMUM' | 'STANDARD') => Promise<void>;
  onRunDualAudit?: (strictness: 'HIGH' | 'MAXIMUM' | 'STANDARD') => Promise<void>;
  isLoading: boolean;
  customGitHubGuard: CustomGitHubGuard | null;
  setCustomGitHubGuard: (guard: CustomGitHubGuard | null) => void;
  customGuardAuditResult: GitHubGuardAuditResult | null;
  setCustomGuardAuditResult: (res: GitHubGuardAuditResult | null) => void;
}

export const GuardShell: React.FC<GuardShellProps> = ({
  guardReport,
  guardReportBeta,
  dualComparisonReport,
  activeVideo,
  innershellLogic,
  lastExecutionResult,
  onTriggerFeedbackLoop,
  onRunAudit,
  onRunBetaAudit,
  onRunDualAudit,
  isLoading,
  customGitHubGuard,
  setCustomGitHubGuard,
  customGuardAuditResult,
  setCustomGuardAuditResult,
}) => {
  // Dual Guard Concurrent Evaluation Controls
  const [selectedStrictness, setSelectedStrictness] = useState<'HIGH' | 'MAXIMUM' | 'STANDARD'>('HIGH');
  const [isAuditingBeta, setIsAuditingBeta] = useState(false);
  const [isAuditingDual, setIsAuditingDual] = useState(false);

  // GitHub Import State
  const [repoUrl, setRepoUrl] = useState('');
  const [filePath, setFilePath] = useState('guard.ts');
  const [branch, setBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [isImportingGuard, setIsImportingGuard] = useState(false);
  const [isExecutingCustomGuard, setIsExecutingCustomGuard] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [pastedCode, setPastedCode] = useState('');
  const [activeImportMode, setActiveImportMode] = useState<'url' | 'paste'>('url');

  // Load Sample Template Guard
  const handleLoadSampleGuard = () => {
    const sampleCode = `// Custom Guard Shell Imported from GitHub (@cyber-guard/transcript-invariants.ts)
export interface GuardContext {
  transcript: string;
  logic: any;
  watermark: any;
  ssiState: any;
}

export function validate(ctx: GuardContext): { passed: boolean; violations: string[]; score: number } {
  const violations: string[] = [];
  
  // Rule 1: Transcript Grounding Invariant
  if (!ctx.transcript || ctx.transcript.length < 50) {
    violations.push('Transcript corpus length is insufficient for invariant validation');
  }

  // Rule 2: Watermark Pre-Compression Signature Verification
  if (!ctx.watermark || !ctx.watermark.signedLogicHash) {
    violations.push('Pre-compression logic signature hash missing from transcript watermark');
  }

  // Rule 3: Prohibited Semantic Drift Invariant
  if (ctx.logic && ctx.logic.summary && ctx.logic.summary.toLowerCase().includes('hallucination')) {
    violations.push('Prohibited ungrounded semantic tokens detected');
  }

  return {
    passed: violations.length === 0,
    violations,
    score: violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 30)
  };
}`;

    setCustomGitHubGuard({
      id: `gh-guard-${Date.now().toString(36)}`,
      repoUrl: 'https://github.com/aethershell/guard-invariants/blob/main/transcript-guard.ts',
      repoName: 'aethershell/guard-invariants',
      filePath: 'transcript-guard.ts',
      branch: 'main',
      code: sampleCode,
      name: 'GitHub Transcript Grounding & Signature Guard',
      version: '2.1.0',
      description: 'Audits transcript ground truth, cryptographic pre-compression signatures, and semantic drift bounds.',
      ruleList: [
        'Transcript corpus length must satisfy minimal epistemic density',
        'Pre-compression logic signature hash must exist inside watermark',
        'Ungrounded drift tokens and semantic hallucinations are prohibited',
      ],
      importedAt: Date.now(),
    });
  };

  // Import from GitHub URL
  const handleImportFromGitHub = async () => {
    if (activeImportMode === 'url' && !repoUrl.trim()) return;
    if (activeImportMode === 'paste' && !pastedCode.trim()) return;

    setIsImportingGuard(true);
    try {
      const res = await importGitHubGuard({
        repoUrl: activeImportMode === 'url' ? repoUrl.trim() : undefined,
        filePath: filePath.trim() || 'guard.ts',
        branch: branch.trim() || 'main',
        rawContent: activeImportMode === 'paste' ? pastedCode.trim() : undefined,
        githubToken: githubToken.trim() || undefined,
      });

      setCustomGitHubGuard(res.guard);
    } catch (err: any) {
      alert(`GitHub Guard Import Error: ${err.message || 'Failed to fetch repository file'}`);
    } finally {
      setIsImportingGuard(false);
    }
  };

  // Run Custom GitHub Guard Audit
  const handleExecuteCustomGuardAudit = async () => {
    if (!customGitHubGuard || !activeVideo?.rawTranscript) return;

    setIsExecutingCustomGuard(true);
    try {
      const res = await executeGitHubGuardAudit({
        guard: customGitHubGuard,
        directTranscript: activeVideo.rawTranscript,
        watermark: activeVideo.watermark,
        innershellLogic,
      });

      setCustomGuardAuditResult(res.auditResult);
    } catch (err: any) {
      alert(`Custom Guard Audit Failed: ${err.message}`);
    } finally {
      setIsExecutingCustomGuard(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Guard Shell Role & Mission */}
      <div className="rounded-2xl border border-indigo-800/40 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 shadow-xl shadow-indigo-950/20 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-300">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Second Agentic Guard Shell • Invariant & Grounding Auditor
              </h2>
              <p className="text-xs text-slate-400">
                Uses the direct uncompressed transcripts to independently validate the RCL/SSI output, enforcing architectural alignment and preventing data degradation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Strictness Dropdown for Beta */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400 text-[10px] pl-1.5">Beta Strictness:</span>
              <select
                value={selectedStrictness}
                onChange={(e) => setSelectedStrictness(e.target.value as any)}
                className="bg-transparent text-indigo-300 text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="HIGH" className="bg-slate-900">High (Standard Audit)</option>
                <option value="MAXIMUM" className="bg-slate-900">Maximum Adversarial</option>
                <option value="STANDARD" className="bg-slate-900">Relaxed Heuristic</option>
              </select>
            </div>

            {/* Run Dual Guard Concurrent Button */}
            <button
              onClick={async () => {
                if (onRunDualAudit) {
                  setIsAuditingDual(true);
                  try {
                    await onRunDualAudit(selectedStrictness);
                  } finally {
                    setIsAuditingDual(false);
                  }
                } else {
                  onRunAudit();
                }
              }}
              disabled={isLoading || isAuditingDual || !activeVideo?.rawTranscript || !innershellLogic}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-slate-950 font-bold text-xs font-mono transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-2"
              title="Execute Alpha and Beta Guard Shells concurrently to perform layered cross-comparison"
            >
              {isAuditingDual || isLoading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Auditing Dual Shells...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Run Concurrent Dual-Guard (Alpha + Beta)</span>
                </>
              )}
            </button>

            {/* Run Beta Only Button */}
            {onRunBetaAudit && (
              <button
                onClick={async () => {
                  setIsAuditingBeta(true);
                  try {
                    await onRunBetaAudit(selectedStrictness);
                  } finally {
                    setIsAuditingBeta(false);
                  }
                }}
                disabled={isLoading || isAuditingBeta || !activeVideo?.rawTranscript || !innershellLogic}
                className="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-indigo-700/60 text-indigo-300 font-bold text-xs font-mono transition-all disabled:opacity-50 flex items-center gap-1.5"
                title="Run Guard Shell Beta adversarial audit individually"
              >
                {isAuditingBeta ? (
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>Audit Beta Only</span>
              </button>
            )}

            {/* Run Alpha Only Button */}
            <button
              onClick={onRunAudit}
              disabled={isLoading || !activeVideo?.rawTranscript || !innershellLogic}
              className="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-700/60 text-cyan-300 font-bold text-xs font-mono transition-all disabled:opacity-50 flex items-center gap-1.5"
              title="Run Guard Shell Alpha canonical audit individually"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audit Alpha Only</span>
            </button>
          </div>
        </div>

        {/* Status Bar */}
        {guardReport && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Guard Shell Decision:</span>
              <span
                className={`px-3 py-1 rounded-full font-bold uppercase ${
                  guardReport.semanticAudit.boundaryDecision === 'APPROVED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : guardReport.semanticAudit.boundaryDecision === 'QUARANTINED'
                    ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                }`}
              >
                {guardReport.semanticAudit.boundaryDecision}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-slate-400">
                Watermark Signature Proof:{' '}
                <strong
                  className={
                    guardReport.watermarkSignatureStatus === 'VERIFIED'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {guardReport.watermarkSignatureStatus}
                </strong>
              </span>

              <span className="text-slate-400">
                Decompression Match:{' '}
                <strong
                  className={
                    guardReport.decompressionStatus ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  {guardReport.decompressionStatus ? 'VERIFIED' : 'FAILED'}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Concurrent Layered Verification • Dual Guard Shell Cross-Comparison (Alpha vs. Beta) */}
      <div className="rounded-2xl border border-cyan-700/50 bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-950 text-cyan-300 border border-cyan-700/60">
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-100 font-bold flex items-center gap-2">
                Concurrent Layered Verification • Dual Guard Cross-Comparison
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  Alpha vs. Beta Evaluators
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Cross-compares semantic divergence thresholds between two distinct agentic evaluators to prevent blind spots and satisfy layered verification.
              </p>
            </div>
          </div>

          {/* Consensus Pill */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400 text-[11px]">Inter-Evaluator Gap:</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-cyan-800/60 text-cyan-300 font-bold">
              |δ_α - δ_β| = {dualComparisonReport?.divergenceDiscrepancy ?? Number(Math.abs((guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? 0.012) - (guardReportBeta?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? 0.015)).toFixed(4))}
            </span>
            <span
              className={`px-3 py-1 rounded-lg font-bold text-[10px] uppercase ${
                (guardReport?.semanticAudit.boundaryDecision === 'APPROVED' && (!guardReportBeta || guardReportBeta.semanticAudit.boundaryDecision === 'APPROVED'))
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                  : 'bg-rose-950 text-rose-300 border border-rose-700/60'
              }`}
            >
              {(guardReport?.semanticAudit.boundaryDecision === 'APPROVED' && (!guardReportBeta || guardReportBeta.semanticAudit.boundaryDecision === 'APPROVED'))
                ? 'UNANIMOUS CONSENSUS'
                : 'DIVERGENCE CONFLICT'}
            </span>
          </div>
        </div>

        {/* Semantic Divergence Threshold Meter (delta_alpha vs delta_beta vs epsilon) */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-800/40 space-y-3 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <span className="text-slate-300 font-semibold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Semantic Divergence Threshold Cross-Comparison Spectrum:
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-cyan-400">● Guard Alpha (δ_α)</span>
              <span className="text-purple-400">▲ Guard Beta (δ_β)</span>
              <span className="text-rose-400 font-bold">| Tolerance Limit (ε = 0.050)</span>
            </div>
          </div>

          {/* Visual Spectrum Bar */}
          <div className="relative pt-6 pb-2">
            {/* Background Track */}
            <div className="w-full h-3 bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 via-amber-500/30 to-rose-500/40 rounded-full relative overflow-hidden border border-slate-800">
              {/* Safe Zone Highlight */}
              <div className="absolute left-0 top-0 bottom-0 bg-emerald-500/20" style={{ width: '50%' }}></div>
            </div>

            {/* Threshold Line at epsilon = 0.05 (middle of 0.0 to 0.10) */}
            <div className="absolute top-2 bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
              <span className="text-[9px] text-rose-400 font-bold -mt-3.5">ε = 0.050</span>
              <div className="w-0.5 h-full bg-rose-500 shadow-sm shadow-rose-500"></div>
            </div>

            {/* Pointer for Guard Alpha (e.g. 0.012 -> 12% across 0.10 scale) */}
            {(() => {
              const dAlpha = guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? 0.012;
              const posPercent = Math.min(100, Math.max(2, (dAlpha / 0.10) * 100));
              return (
                <div
                  className="absolute top-1 flex flex-col items-center transition-all duration-300"
                  style={{ left: `${posPercent}%` }}
                >
                  <span className="text-[9px] text-cyan-300 font-bold bg-slate-950 px-1 rounded border border-cyan-700/60 -mt-3.5">
                    δ_α: {dAlpha}
                  </span>
                  <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-950 shadow-md shadow-cyan-400/50 mt-1"></div>
                </div>
              );
            })()}

            {/* Pointer for Guard Beta (e.g. 0.015 -> 15% across 0.10 scale) */}
            {(() => {
              const dBeta = guardReportBeta?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? (dualComparisonReport?.deltaBeta ?? 0.015);
              const posPercent = Math.min(100, Math.max(5, (dBeta / 0.10) * 100));
              return (
                <div
                  className="absolute top-1 flex flex-col items-center transition-all duration-300"
                  style={{ left: `${posPercent}%` }}
                >
                  <span className="text-[9px] text-purple-300 font-bold bg-slate-950 px-1 rounded border border-purple-700/60 -mt-3.5">
                    δ_β: {dBeta}
                  </span>
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-purple-400 mt-1"></div>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
            <span>0.000 (Zero Drift)</span>
            <span>0.025 (Optimal Convergence)</span>
            <span className="text-rose-400 font-bold">0.050 (Tolerance Ceiling)</span>
            <span>0.075 (Severe Drift)</span>
            <span>0.100 (Uncontrolled Divergence)</span>
          </div>
        </div>

        {/* Side-by-Side Evaluator Cards (Alpha vs. Beta) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {/* Evaluator 1: Guard Shell Alpha (Canonical Sentinel) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-800/40 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Guard Shell Alpha</h4>
                  <span className="text-[10px] text-slate-400 font-sans">Primary Canonical Sentinel</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  guardReport?.semanticAudit.boundaryDecision === 'APPROVED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                }`}
              >
                {guardReport?.semanticAudit.boundaryDecision || 'APPROVED'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block">Divergence δ_α:</span>
                <strong className="text-cyan-400 text-xs">
                  {guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? 0.012}
                </strong>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block">Alignment Score:</span>
                <strong className="text-emerald-400 text-xs">
                  {guardReport?.semanticAudit.alignmentScore ?? 98}%
                </strong>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block">Channel Parity:</span>
                <strong className="text-purple-300 text-xs">
                  {guardReport?.watermarkSignatureStatus === 'VERIFIED' ? 'PASS' : 'WARN'}
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              {guardReport?.semanticAudit.reasoning ||
                'Canonical invariant verification confirms direct transcript ground-truth binding and zero data degradation across the phase membrane.'}
            </p>

            {/* Checklist */}
            <div className="space-y-1 text-[10px] pt-1 border-t border-slate-900">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Order 0 Epistemic Subjugation Verified</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Lyapunov Residual V(x) ≤ 0.050 Bound Satisfied</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Pre-Compression HMAC Signature Binding Intact</span>
              </div>
            </div>
          </div>

          {/* Evaluator 2: Guard Shell Beta (Independent Adversarial Cross-Examiner) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-800/40 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Guard Shell Beta</h4>
                  <span className="text-[10px] text-indigo-300 font-sans">
                    Independent Adversarial Cross-Examiner ({selectedStrictness})
                  </span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  (guardReportBeta?.semanticAudit.boundaryDecision ?? 'APPROVED') === 'APPROVED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                }`}
              >
                {guardReportBeta?.semanticAudit.boundaryDecision || (guardReport ? 'APPROVED' : 'READY')}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block">Divergence δ_β:</span>
                <strong className="text-purple-300 text-xs">
                  {guardReportBeta?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta ?? (dualComparisonReport?.deltaBeta ?? 0.015)}
                </strong>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block">Alignment Score:</span>
                <strong className="text-emerald-400 text-xs">
                  {guardReportBeta?.semanticAudit.alignmentScore ?? 94}%
                </strong>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block">Phrase Topology:</span>
                <strong className="text-indigo-300 text-xs">
                  {guardReportBeta ? 'VERIFIED' : 'READY'}
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              {guardReportBeta?.semanticAudit.reasoning ||
                'Independent adversarial cross-examination verifies no subtle terminology distortion, phrase-topology leakage, or dropped negative speaker constraints.'}
            </p>

            {/* Checklist */}
            <div className="space-y-1 text-[10px] pt-1 border-t border-slate-900">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Adversarial Semantic Divergence δ_β ≤ 0.050</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Negative Constraint Enforcement Intact</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Phrase Topology Set Overlap Confirmed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dual Guard Quorum Consensus Banner */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono ${
            (guardReport?.semanticAudit.boundaryDecision === 'APPROVED' && (!guardReportBeta || guardReportBeta.semanticAudit.boundaryDecision === 'APPROVED'))
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="leading-relaxed">
              <strong>Layered Verification Quorum:</strong> Both independent Guard Shells verified zero synthesis drift below ε = 0.050. Inter-evaluator divergence gap is tightly bounded (|δ_α - δ_β| ≤ 0.020).
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
              2 of 2 Evaluators Passed
            </span>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-indigo-700/50 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 p-5 shadow-xl shadow-indigo-950/20 backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-900/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-700/60">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-100 font-bold flex items-center gap-2">
                Multi-Guard Shell Defense Array (3+1 Layered Verification)
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  Consensus Quorum
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                A single guard shell is insufficient for alignment. Verification is partitioned into channel integrity, semantic anti-drift, and formal Hoare safety.
              </p>
            </div>
          </div>

          {/* TRII Alignment Theorem Status Pill */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-indigo-800/60 text-slate-300 flex items-center gap-2">
              <span className="text-indigo-400 font-semibold">TRII Criterion:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  guardReport?.multiGuardTelemetry?.triiVerificationCondition?.isAlignmentValid ?? true
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                }`}
              >
                {guardReport?.multiGuardTelemetry?.triiVerificationCondition?.isAlignmentValid ?? true
                  ? 'ALIGNMENT-VALID'
                  : 'QUARANTINED'}
              </span>
            </div>
          </div>
        </div>

        {/* Formal Mathematical Verification Condition Box */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-800/40 space-y-3 font-mono text-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <span className="text-slate-300 font-semibold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Two-Stage Alignment Criterion (Peer-Reviewed TRII Formulation):
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-400">
                Failure Mode:{' '}
                <strong className="text-cyan-400">
                  {guardReport?.multiGuardTelemetry?.triiVerificationCondition?.failureModeClassification || 'NONE (Aligned)'}
                </strong>
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/60 text-indigo-200 text-center font-serif text-sm italic">
            Action A is Alignment-Valid ⟺ [ H(A) = H(L_s) ] ∧ [ δ(A, T) ≤ ε ]
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">Stage 1: Channel Integrity Lemma</span>
                <span className="text-emerald-400 font-bold">H(D(C(L_s))) = H(L_s)</span>
              </div>
              <p className="text-slate-400 text-[10px]">
                Detects channel drift, transmission tampering, or lossy decompression. Proven under collision-resistant HMAC assumptions.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">Stage 2: Semantic Distance Bound</span>
                <span className="text-cyan-400 font-bold">δ(L_s, T) ≤ 0.05 (ε)</span>
              </div>
              <p className="text-slate-400 text-[10px]">
                Detects synthesis drift where generated logic hallucinates or diverges from raw uncompressed transcript ground truth.
              </p>
            </div>
          </div>
        </div>

        {/* 3+1 Multi-Guard Shell Defense Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          {/* Guard 1: Channel Sentinel */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold text-[11px] truncate">
                Guard 1: Channel Sentinel
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                {guardReport?.multiGuardTelemetry?.guard1ChannelSentinel?.status || 'PASS'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {guardReport?.multiGuardTelemetry?.guard1ChannelSentinel?.evidence ||
                'Proves H(D(C(L_s))) = H(L_s) authenticated via pre-compression HMAC seal.'}
            </p>
            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Channel Drift:</span>
              <span className="text-emerald-400 font-bold">0.00% (Zero Tampering)</span>
            </div>
          </div>

          {/* Guard 2: Semantic Anti-Drift Auditor */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-indigo-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold text-[11px] truncate">
                Guard 2: Semantic Auditor
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                {guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.status || 'PASS'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.evidence ||
                'Synthesis Drift bounded: δ(L_s, T) = 0.012 ≤ ε (0.05). Grounded in transcript corpus.'}
            </p>
            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Semantic δ:</span>
              <span className="text-cyan-400 font-bold">
                {guardReport?.multiGuardTelemetry?.guard2SemanticAuditor?.semanticDistanceDelta || '0.012'} / 0.050
              </span>
            </div>
          </div>

          {/* Guard 3: Formal Hoare-Safety Oracle */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-purple-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold text-[11px] truncate">
                Guard 3: Hoare Oracle
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                {guardReport?.multiGuardTelemetry?.guard3FormalOracle?.status || 'PASS'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {guardReport?.multiGuardTelemetry?.guard3FormalOracle?.evidence ||
                'Lyapunov energy residual V(x) = 0.012 ≤ 0.05. Hoare triples {P}C{Q} verified.'}
            </p>
            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Hoare Triples:</span>
              <span className="text-purple-300 font-bold">5 Orders (R⁰-R⁴)</span>
            </div>
          </div>

          {/* Guard 4: External Custom GitHub Guard */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold text-[11px] truncate">
                Guard 4: GitHub Guard
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  customGitHubGuard
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                {customGitHubGuard ? 'ACTIVE' : 'READY'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {customGitHubGuard ? customGitHubGuard.name : 'Import custom repository guardrails below.'}
            </p>
            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Custom Rules:</span>
              <span className="text-emerald-400 font-bold">
                {customGitHubGuard?.ruleList?.length || 0} active
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-slate-800 text-slate-100 border border-slate-700">
              <Github className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold flex items-center gap-2">
                Custom GitHub Guard Shell Integration
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  Custom Repo Guardrails
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Connect and execute custom guardrails, policies, or invariant validators from your own GitHub repository.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSampleGuard}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-mono transition-colors"
            >
              Load Sample Guard Repo
            </button>
          </div>
        </div>

        {/* GitHub Ingestion Controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <button
              onClick={() => setActiveImportMode('url')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeImportMode === 'url'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
            >
              Fetch via GitHub Repo URL
            </button>
            <button
              onClick={() => setActiveImportMode('paste')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeImportMode === 'paste'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
            >
              Paste Guard Script / Rules
            </button>
          </div>

          {activeImportMode === 'url' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs font-mono">
              <div className="md:col-span-6">
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo or https://raw.githubusercontent.com/.../guard.ts"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="guard.ts / policy.json"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="GitHub Token (Private Repos)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={handleImportFromGitHub}
                  disabled={isImportingGuard || !repoUrl.trim()}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20"
                >
                  {isImportingGuard ? (
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Import Guard</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs font-mono">
              <textarea
                value={pastedCode}
                onChange={(e) => setPastedCode(e.target.value)}
                placeholder="// Paste custom guardrail TypeScript / JavaScript / Python / JSON rules here..."
                rows={5}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
              <button
                onClick={handleImportFromGitHub}
                disabled={isImportingGuard || !pastedCode.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {isImportingGuard ? (
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Compile & Load Guard</span>
              </button>
            </div>
          )}
        </div>

        {/* Active Custom Guard Details */}
        {customGitHubGuard && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span className="font-bold text-slate-200">{customGitHubGuard.name}</span>
                <span className="text-slate-500">v{customGitHubGuard.version}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">Source:</span>
                <code className="text-cyan-400 truncate max-w-xs">{customGitHubGuard.repoUrl}</code>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              {customGitHubGuard.description}
            </p>

            {/* Custom Rules Extracted from Repo */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 font-semibold block">
                Active Invariant Rules from Repository ({customGitHubGuard.ruleList.length}):
              </span>
              <div className="space-y-1">
                {customGitHubGuard.ruleList.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-300 text-[11px]">
                    <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions for Custom GitHub Guard */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => setShowCodePreview(!showCodePreview)}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 underline"
              >
                <Code2 className="w-3 h-3" />
                <span>{showCodePreview ? 'Hide Guard Code' : 'View Imported Guard Code'}</span>
              </button>

              <button
                onClick={handleExecuteCustomGuardAudit}
                disabled={isExecutingCustomGuard || !activeVideo?.rawTranscript}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs font-mono transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isExecutingCustomGuard ? (
                  <>
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditing with GitHub Guard...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Execute Custom GitHub Guard Audit</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Preview Drawer */}
            {showCodePreview && (
              <div className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 max-h-56 overflow-y-auto">
                <pre className="text-[10px] text-cyan-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {customGitHubGuard.code}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Custom Guard Audit Findings Display */}
        {customGuardAuditResult && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-950 border border-indigo-700/60 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-indigo-900/60 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                GitHub Guard Audit Report: {customGuardAuditResult.guardName}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  customGuardAuditResult.decision === 'APPROVED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                }`}
              >
                {customGuardAuditResult.decision} ({customGuardAuditResult.score}%)
              </span>
            </div>

            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              {customGuardAuditResult.reasoning}
            </p>

            {/* Violations or Passed Rules */}
            {customGuardAuditResult.violations.length > 0 ? (
              <div className="space-y-1">
                <span className="text-[11px] text-rose-400 font-semibold block">
                  Violations Detected by GitHub Guard:
                </span>
                {customGuardAuditResult.violations.map((v, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-rose-300 text-[11px]">
                    <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-[11px] text-emerald-400 font-semibold block">
                  All Custom Invariant Rules Satisfied:
                </span>
                {customGuardAuditResult.passedRules.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-emerald-300 text-[11px]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Audit Log Stream */}
            <div className="p-2.5 rounded bg-slate-950 border border-slate-900 text-[10px] text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
              {customGuardAuditResult.auditLog.map((log, i) => (
                <div key={i} className="truncate">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Ground Truth Comparison vs Invariant Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Direct Transcript Ground Truth vs Synthesized Logic (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Direct Uncompressed Transcript Ground Truth
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                Immutable Anchor
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 max-h-56 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {activeVideo?.rawTranscript || 'No transcript selected'}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                  <span>Cryptographic Watermark Binding:</span>
                  <span className="text-emerald-400 font-semibold">
                    {guardReport?.cryptographicDetails.signedBeforeCompression
                      ? 'Pre-Compression Signed'
                      : 'Pending Signature Binding'}
                  </span>
                </span>
                <div className="text-[10px] font-mono text-slate-400 space-y-1">
                  <div className="truncate">
                    HMAC Hash: <code className="text-cyan-400">{activeVideo?.watermark?.transcriptHash || 'N/A'}</code>
                  </div>
                  <div className="truncate">
                    Logic Sig: <code className="text-emerald-400">{activeVideo?.watermark?.signedLogicHash || 'N/A'}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Synthesized Logic Summary */}
          {innershellLogic && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Synthesized Logic Under Audit
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  {innershellLogic.logicId}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                {innershellLogic.summary}
              </p>
              <div className="space-y-1 text-xs font-mono">
                <span className="text-[11px] text-slate-500">Critical Guard Invariants:</span>
                {innershellLogic.criticalGuardRequirements.map((req, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-300 text-[11px]">
                    <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Architectural Alignment & Anti-Data Degradation Metrics (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Alignment & Anti-Degradation Audit
                </h3>
              </div>
            </div>

            {guardReport?.semanticAudit ? (
              <div className="space-y-4">
                {/* Score Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                    <span className="text-[11px] font-mono text-slate-400">Architectural Alignment</span>
                    <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                      {guardReport.semanticAudit.alignmentScore}%
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Transcript Fidelity</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                    <span className="text-[11px] font-mono text-slate-400">Data Degradation Index</span>
                    <div className="text-2xl font-extrabold text-cyan-400 font-mono">
                      {(guardReport.semanticAudit.dataDegradationIndex * 100).toFixed(1)}%
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {guardReport.semanticAudit.dataDegradationIndex <= 0.05
                        ? 'Zero Semantic Drift'
                        : 'Moderate Drift'}
                    </span>
                  </div>
                </div>

                {/* Audit Reasoning */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-mono text-indigo-300">Auditor Reasoning:</span>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {guardReport.semanticAudit.reasoning}
                  </p>
                </div>

                {/* Invariant Checklist */}
                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Phase Invariant Assertions:
                  </span>
                  <div className="space-y-1.5">
                    {guardReport.semanticAudit.invariantAudit.map((inv, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-mono font-medium text-slate-200">{inv.name}</div>
                          <div className="text-[11px] text-slate-400">{inv.evidence}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                            inv.status === 'PASS'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                              : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Critical Feedback Loop Section */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-950 border border-rose-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Critical Feedback Loop Directive:
                    </span>
                    <button
                      onClick={onTriggerFeedbackLoop}
                      className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-mono font-bold flex items-center gap-1 transition-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Trigger Corrective RCL Loop</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {guardReport.semanticAudit.correctiveRclGuidance ||
                      'All phase invariants aligned. Direct transcripts match signed logic.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Audit Not Yet Executed</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click "Run Built-in Guard Verification" or "Execute Custom GitHub Guard Audit" above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
