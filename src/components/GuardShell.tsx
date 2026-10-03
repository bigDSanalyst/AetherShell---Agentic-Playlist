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
import { runSandboxed } from '../utils/sandbox';

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
    const sampleCode = `// Built-in sample guard (not fetched from GitHub)
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

  // Rule 2: A signed manifest with a bound logic hash must be present
  if (!ctx.watermark || !ctx.watermark.signature || !ctx.watermark.manifest || !ctx.watermark.manifest.logicSha256) {
    violations.push('Signed watermark manifest with bound logic is missing');
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

    // Plain-JS translation of sampleCode, run in the browser sandbox.
    const sampleWrapper = `function runCustomGuard(ctx) {
  var violations = [];
  if (!ctx.transcript || ctx.transcript.length < 50) violations.push('Transcript corpus length is insufficient for invariant validation');
  if (!ctx.watermark || !ctx.watermark.signature || !ctx.watermark.manifest || !ctx.watermark.manifest.logicSha256) violations.push('Signed watermark manifest with bound logic is missing');
  if (ctx.logic && ctx.logic.summary && String(ctx.logic.summary).toLowerCase().indexOf('hallucination') !== -1) violations.push('Prohibited ungrounded semantic tokens detected');
  return { passed: violations.length === 0, violations: violations, score: violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 30) };
}`;

    setCustomGitHubGuard({
      id: `sample-guard-${Date.now().toString(36)}`,
      repoUrl: 'Built-in sample',
      repoName: 'built-in sample',
      filePath: 'sample-guard.ts',
      branch: '-',
      code: sampleCode,
      name: 'Sample Transcript & Signature Guard',
      version: 'sample',
      description: 'Built-in example guard: checks transcript length, presence of a signed manifest, and a banned word.',
      ruleList: [
        'Transcript must be at least 50 characters',
        'Watermark must carry a signed manifest with a bound logic hash',
        'Logic summary must not contain the word "hallucination"',
      ],
      executableSandboxWrapper: sampleWrapper,
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
      // 1. Run the guard's JS wrapper (if any) in the isolated sandbox.
      let sandboxResult: GitHubGuardAuditResult['sandboxResult'];
      if (customGitHubGuard.executableSandboxWrapper) {
        const run = await runSandboxed(
          customGitHubGuard.executableSandboxWrapper,
          {
            transcript: activeVideo.rawTranscript,
            logic: innershellLogic,
            watermark: activeVideo.watermark ? { ...activeVideo.watermark, watermarkedText: undefined } : null,
          },
          { mode: 'guard' }
        );
        const r = run.result || {};
        sandboxResult = {
          ok: run.ok,
          passed: run.ok && r.passed === true,
          score: Number(r.score) || 0,
          violations: Array.isArray(r.violations) ? r.violations.map(String) : run.error ? [run.error] : [],
          error: run.error,
        };
      }

      // 2. LLM review against the guard's source (fails closed server-side).
      const res = await executeGitHubGuardAudit({
        guard: customGitHubGuard,
        directTranscript: activeVideo.rawTranscript,
        watermark: activeVideo.watermark,
        innershellLogic,
      });

      // Approval needs both: the sandboxed code (when present) and the review.
      const review = res.auditResult;
      const passed = review.passed === true && (sandboxResult ? sandboxResult.passed : true);
      setCustomGuardAuditResult({
        ...review,
        passed,
        decision: passed ? review.decision : review.decision === 'APPROVED' ? 'QUARANTINED' : review.decision,
        violations: [...(sandboxResult?.violations.map((v) => `[sandbox] ${v}`) || []), ...(review.violations || [])],
        auditLog: [
          ...(sandboxResult
            ? [`[SANDBOX] guard code ${sandboxResult.ok ? 'ran' : 'failed'}: passed=${sandboxResult.passed}, score=${sandboxResult.score}`]
            : ['[SANDBOX] no executable wrapper; LLM review only']),
          ...(review.auditLog || []),
        ],
        evaluationMethod: sandboxResult ? 'sandbox' : 'llm-review',
        sandboxResult,
      });
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

      {/* Dual Guard Comparison (Alpha: word overlap, Beta: word-pair overlap) — measured values only */}
      <div className="rounded-2xl border border-cyan-700/50 bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-950 text-cyan-300 border border-cyan-700/60">
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-100 font-bold flex items-center gap-2">
                Dual Guard Comparison
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  Alpha vs. Beta
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Both guards verify the Ed25519 signature and decompression, then measure lexical grounding (Alpha: words, Beta: word pairs) and ask the model for a review. Any failed check closes the boundary.
              </p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-lg font-mono font-bold text-[10px] uppercase ${
              !guardReport && !guardReportBeta
                ? 'bg-slate-900 text-slate-400 border border-slate-800'
                : guardReport?.passedPhaseBoundary && guardReportBeta?.passedPhaseBoundary
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                : 'bg-rose-950 text-rose-300 border border-rose-700/60'
            }`}
          >
            {!guardReport && !guardReportBeta
              ? 'NOT RUN'
              : guardReport?.passedPhaseBoundary && guardReportBeta?.passedPhaseBoundary
              ? 'BOTH PASSED'
              : !guardReport || !guardReportBeta
              ? 'ONE GUARD NOT RUN'
              : 'BOUNDARY CLOSED'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {([
            { label: 'Guard Alpha', unit: 'content words', report: guardReport, accent: 'cyan' },
            { label: `Guard Beta (${selectedStrictness})`, unit: 'word pairs', report: guardReportBeta, accent: 'indigo' },
          ] as const).map(({ label, unit, report }) => {
            const g2 = report?.multiGuardTelemetry?.guard2SemanticAuditor;
            return (
              <div key={label} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-slate-200 text-xs">{label}</h4>
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      !report
                        ? 'bg-slate-900 text-slate-400 border border-slate-800'
                        : report.passedPhaseBoundary
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                        : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                    }`}
                  >
                    {!report ? 'NOT RUN' : report.passedPhaseBoundary ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                {report ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block">Grounded {unit}:</span>
                        <strong className="text-cyan-400 text-xs">{g2 ? `${g2.citationCoveragePercent}%` : 'n/a'}</strong>
                        {g2 && <span className="text-slate-500 block">need ≥ {Math.round((1 - g2.epsilonThreshold) * 100)}%</span>}
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block">Model score:</span>
                        <strong className="text-emerald-400 text-xs">
                          {report.llmAvailable === false ? 'unavailable' : `${report.semanticAudit.alignmentScore}%`}
                        </strong>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block">Signature:</span>
                        <strong className={report.watermarkSignatureStatus === 'VERIFIED' ? 'text-emerald-400 text-xs' : 'text-rose-400 text-xs'}>
                          {report.watermarkSignatureStatus}
                        </strong>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">{report.semanticAudit.reasoning}</p>
                    {report.witness && (
                      <p
                        className={`text-[10px] font-mono ${report.witness.verified && report.witness.agreesWithPrimary ? 'text-emerald-300' : 'text-rose-300'}`}
                        title="A second, separately written verifier; any disagreement with the primary check is a refusal"
                      >
                        Independent witness:{' '}
                        {!report.witness.agreesWithPrimary
                          ? `DISAGREES with primary (${report.witness.disagreements.join('; ')})`
                          : report.witness.verified
                          ? 'verified, agrees with primary'
                          : 'rejects, agrees with primary'}
                      </p>
                    )}
                    {(report.provenanceFailures?.length ?? 0) > 0 && (
                      <ul className="text-[10px] text-rose-300 list-disc pl-4 space-y-0.5">
                        {report.provenanceFailures!.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500 font-sans">Run this guard to see its measurements.</p>
                )}
              </div>
            );
          })}
        </div>

        {dualComparisonReport && (
          <ul className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 text-[11px] font-mono text-slate-300 space-y-1">
            {dualComparisonReport.comparativeObservations.map((o) => (
              <li key={o}>• {o}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Check breakdown for the most recent Alpha run */}
      <div className="rounded-2xl border border-indigo-700/50 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 p-5 shadow-xl shadow-indigo-950/20 backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-900/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-700/60">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-100 font-bold">Guard Checks</h3>
              <p className="text-xs text-slate-400">
                Pass requires all three: (1) signature and hashes verify and decompression is byte-identical, (2) lexical grounding meets the threshold, (3) the model review approves. The imported guard, if any, is reported separately.
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-indigo-800/60 text-slate-300 font-mono text-xs">
            Failure mode:{' '}
            <strong className="text-cyan-400">
              {guardReport?.multiGuardTelemetry?.triiVerificationCondition?.failureModeClassification ?? 'NOT RUN'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          {[
            guardReport?.multiGuardTelemetry?.guard1ChannelSentinel,
            guardReport?.multiGuardTelemetry?.guard2SemanticAuditor,
            guardReport?.multiGuardTelemetry?.guard3FormalOracle,
          ].map((g, i) => (
            <div key={i} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300 font-bold text-[11px]">
                  {g?.name ?? ['Check 1: Signature & decompression', 'Check 2: Lexical grounding', 'Check 3: LLM review'][i]}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    !g
                      ? 'bg-slate-900 text-slate-400 border border-slate-800'
                      : g.status === 'PASS'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                      : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                  }`}
                >
                  {g?.status ?? 'NOT RUN'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 break-words">{g?.evidence ?? 'Run the Guard Shell to evaluate.'}</p>
            </div>
          ))}

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 font-bold text-[11px]">Imported guard</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  !customGuardAuditResult
                    ? 'bg-slate-900 text-slate-400 border border-slate-800'
                    : customGuardAuditResult.passed
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                }`}
              >
                {!customGitHubGuard ? 'NONE' : !customGuardAuditResult ? 'NOT RUN' : customGuardAuditResult.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {customGitHubGuard ? customGitHubGuard.name : 'Import a guard below.'}
            </p>
            <p className="text-[10px] text-slate-500">
              {customGitHubGuard ? `${customGitHubGuard.ruleList?.length || 0} rule(s) listed` : ''}
            </p>
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
                    Transcript SHA-256: <code className="text-cyan-400">{activeVideo?.watermark?.transcriptHash || 'N/A'}</code>
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
                      {guardReport.llmAvailable === false ? 'Model review unavailable' : 'Model-estimated (not measured)'}
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
