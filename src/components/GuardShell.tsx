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
} from 'lucide-react';
import {
  GuardAuditReport,
  VideoNode,
  InnershellLogic,
  ScriptExecutionResult,
  CustomGitHubGuard,
  GitHubGuardAuditResult,
} from '../types';
import { importGitHubGuard, executeGitHubGuardAudit } from '../services/api';

interface GuardShellProps {
  guardReport: GuardAuditReport | null;
  activeVideo: VideoNode | null;
  innershellLogic: InnershellLogic | null;
  lastExecutionResult: ScriptExecutionResult | null;
  onTriggerFeedbackLoop: () => void;
  onRunAudit: () => void;
  isLoading: boolean;
  customGitHubGuard: CustomGitHubGuard | null;
  setCustomGitHubGuard: (guard: CustomGitHubGuard | null) => void;
  customGuardAuditResult: GitHubGuardAuditResult | null;
  setCustomGuardAuditResult: (res: GitHubGuardAuditResult | null) => void;
}

export const GuardShell: React.FC<GuardShellProps> = ({
  guardReport,
  activeVideo,
  innershellLogic,
  lastExecutionResult,
  onTriggerFeedbackLoop,
  onRunAudit,
  isLoading,
  customGitHubGuard,
  setCustomGitHubGuard,
  customGuardAuditResult,
  setCustomGuardAuditResult,
}) => {
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

          <div className="flex items-center gap-2">
            <button
              onClick={onRunAudit}
              disabled={isLoading || !activeVideo?.rawTranscript || !innershellLogic}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Auditing Invariants...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Run Built-in Guard Verification</span>
                </>
              )}
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

      {/* GitHub Custom Guard Shell Integration Section */}
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
