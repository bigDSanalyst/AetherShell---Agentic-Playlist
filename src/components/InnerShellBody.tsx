import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Terminal,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  Clock,
  Sparkles,
  Database,
  ArrowRight,
  Code2,
  ShieldCheck,
  AlertCircle,
  Binary,
  Zap,
  Activity,
  Award,
  Copy,
  Download,
} from 'lucide-react';
import {
  InnershellLogic,
  RclAnalysis,
  ScriptExecutionResult,
  PersistentSessionMemory,
  VideoNode,
  SotaReflexiveInvariant,
} from '../types';
import { executeInnershellScript } from '../utils/crypto';

interface InnerShellBodyProps {
  innershellLogic: InnershellLogic | null;
  rclAnalysis: RclAnalysis | null;
  activeVideo: VideoNode | null;
  sessionMemory: PersistentSessionMemory;
  onUpdateSessionMemory: (newMemory: Record<string, any>) => void;
  onRunRclSsi: (iterations: number, directives: string) => void;
  isLoading: boolean;
  onProceedToCrypto: () => void;
  lastExecutionResult: ScriptExecutionResult | null;
  setLastExecutionResult: (result: ScriptExecutionResult | null) => void;
}

export const InnerShellBody: React.FC<InnerShellBodyProps> = ({
  innershellLogic,
  rclAnalysis,
  activeVideo,
  sessionMemory,
  onUpdateSessionMemory,
  onRunRclSsi,
  isLoading,
  onProceedToCrypto,
  lastExecutionResult,
  setLastExecutionResult,
}) => {
  const [rclIterations, setRclIterations] = useState(3);
  const [userDirectives, setUserDirectives] = useState('');
  const [isExecutingScript, setIsExecutingScript] = useState(false);
  const [customScriptCode, setCustomScriptCode] = useState<string>('');
  const [testedInvariants, setTestedInvariants] = useState<Record<string, 'PASS' | 'FAIL' | 'N/A'>>({});

  // Sync rclIterations if optimal count applied from AetherTwin
  React.useEffect(() => {
    if (sessionMemory.memoryLattice?.optimalRclIterations) {
      setRclIterations(sessionMemory.memoryLattice.optimalRclIterations);
    }
  }, [sessionMemory.memoryLattice?.optimalRclIterations]);

  // Invariants map to built-in deterministic checks; model-written code is never run here.
  const handleTestInvariant = (inv: SotaReflexiveInvariant) => {
    let outcome: 'PASS' | 'FAIL' | 'N/A';
    switch (inv.checkId) {
      case 'transcript-present':
        outcome = activeVideo?.rawTranscript?.trim() ? 'PASS' : 'FAIL';
        break;
      case 'memory-is-object':
        outcome = sessionMemory.memoryLattice && typeof sessionMemory.memoryLattice === 'object' ? 'PASS' : 'FAIL';
        break;
      case 'logic-signed':
        // Presence only; the Guard Shell verifies the signature and hashes.
        outcome = activeVideo?.watermark?.manifest?.logicSha256 && activeVideo?.watermark?.signature ? 'PASS' : 'FAIL';
        break;
      case 'grounding-threshold': {
        const limit = 1 - (rclAnalysis?.ssiInjectedState?.invariantTolerances?.driftThreshold ?? 0.5);
        outcome = typeof rclAnalysis?.groundingScore === 'number' && rclAnalysis.groundingScore >= limit ? 'PASS' : 'FAIL';
        break;
      }
      default:
        outcome = 'N/A';
    }
    setTestedInvariants((prev) => ({ ...prev, [inv.id]: outcome }));
  };

  // Sync script when new logic is synthesized
  React.useEffect(() => {
    if (innershellLogic?.executableScript) {
      setCustomScriptCode(innershellLogic.executableScript);
    }
  }, [innershellLogic?.executableScript]);

  const handleRunScript = () => {
    const codeToRun = customScriptCode || innershellLogic?.executableScript;
    if (!codeToRun) return;

    setIsExecutingScript(true);
    void (async () => {
      const res = await executeInnershellScript(codeToRun, {
        memory: sessionMemory.memoryLattice,
        ssiState: rclAnalysis?.ssiInjectedState || {},
        transcriptHash: activeVideo?.watermark?.transcriptHash || 'PENDING_WATERMARK',
        videoTitle: activeVideo?.title || 'Active Video Node',
      });

      setLastExecutionResult({
        status: res.status,
        executedAt: Date.now(),
        executionTimeMs: res.executionTimeMs,
        output: res.output,
        logs: res.logs,
        stateMutationsApplied: res.mutatedMemory,
      });

      if (res.status === 'SUCCESS' && res.mutatedMemory) {
        onUpdateSessionMemory(res.mutatedMemory);
      }
      setIsExecutingScript(false);
    })();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Innershell Overview */}
      <div className="rounded-2xl border border-cyan-800/40 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-300">
              <Cpu className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Agentic Innershell Body • RCL & SSI Engine
              </h2>
              <p className="text-xs text-slate-400">
                Executes Recursive Cognitive Loops (RCL) and Structured State Induction (SSI) to synthesize context-aware execution logic with persistent session memory.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
              Active Session: <strong className="text-cyan-400">{sessionMemory.sessionId.slice(0, 12)}</strong>
            </span>
          </div>
        </div>

        {/* Synthesis Configuration & Trigger */}
        <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-mono text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                RCL Iteration Loops:
              </span>
              <span className="flex items-center gap-1.5">
                {sessionMemory.memoryLattice?.optimalRclIterations === rclIterations && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-bold uppercase animate-pulse">
                    Twin Optimal N*
                  </span>
                )}
                <span className="text-cyan-400 font-bold">{rclIterations}x</span>
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              value={rclIterations}
              onChange={(e) => setRclIterations(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div className="md:col-span-6 space-y-1">
            <label className="text-xs font-mono text-slate-400">
              Optional Task Directives / State Constraints:
            </label>
            <input
              type="text"
              value={userDirectives}
              onChange={(e) => setUserDirectives(e.target.value)}
              placeholder="e.g., Assert invariant threshold >= 95%, bind stateDelta for sessionStep..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="md:col-span-3">
            <button
              onClick={() => onRunRclSsi(rclIterations, userDirectives)}
              disabled={isLoading || !activeVideo?.rawTranscript}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs font-mono transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing RCL/SSI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run RCL & SSI Synthesis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column (RCL & SSI State) + Right Column (Script Runner & Memory Lattice) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: RCL Feedback & SSI Invariants (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* RCL Invariant Breakdown - Cutting-Edge SOTA Reflexive Invariant Matrix */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold flex items-center gap-1.5">
                  SOTA Reflexive Invariants Matrix
                  <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[9px]">
                    Orders 0–4
                  </span>
                </h3>
              </div>
              {rclAnalysis && (
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    Grounded: {typeof rclAnalysis.groundingScore === 'number' ? `${(rclAnalysis.groundingScore * 100).toFixed(0)}%` : 'n/a'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                    {rclAnalysis.iterationCount}x Cycles
                  </span>
                </div>
              )}
            </div>

            {rclAnalysis ? (
              <div className="space-y-4">
                {/* Reflexive Convergence Rounds Progress */}
                {rclAnalysis.convergenceRounds && rclAnalysis.convergenceRounds.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Measured per pass (content-word overlap):</span>
                      <span className={rclAnalysis.reflexiveFixedPointReached ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {rclAnalysis.reflexiveFixedPointReached ? 'Stable (≤10% change)' : rclAnalysis.iterationCount > 1 ? 'Still changing' : 'Single pass'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      {rclAnalysis.convergenceRounds.map((rnd) => (
                        <div key={rnd.cycle} className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <span className="text-cyan-400 font-semibold block">Pass {rnd.cycle}</span>
                          <span className="text-slate-400 text-[9px] block truncate">{rnd.focus}</span>
                          <span className="text-emerald-400 font-bold text-[10px] block">
                            {(rnd.groundingRatio * 100).toFixed(0)}% grounded
                          </span>
                          {rnd.cycle > 1 && (
                            <span className="text-slate-400 text-[9px] block">{(rnd.changeFromPrevious * 100).toFixed(0)}% changed</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SOTA Formal Reflexive Invariants List */}
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {(rclAnalysis.sotaReflexiveInvariants || []).map((inv) => {
                    const isTested = testedInvariants[inv.id];
                    return (
                      <div
                        key={inv.id}
                        className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-2 font-mono text-xs transition-all hover:border-cyan-800/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50 font-bold text-[10px]">
                              Order ℛ^{inv.reflexiveOrder}
                            </span>
                            <span className="font-semibold text-slate-200 text-xs">{inv.name}</span>
                          </div>
                          <button
                            onClick={() => handleTestInvariant(inv)}
                            title={inv.checkId === 'none' ? 'No built-in check maps to this invariant' : `Built-in check: ${inv.checkId}`}
                            className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all ${
                              isTested === 'PASS'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                : isTested === 'FAIL'
                                ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                                : 'bg-slate-900 hover:bg-cyan-950 text-slate-400 hover:text-cyan-300 border border-slate-800'
                            }`}
                          >
                            {isTested === 'PASS' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>CHECK PASSED</span>
                              </>
                            ) : isTested === 'FAIL' ? (
                              <span>CHECK FAILED</span>
                            ) : isTested === 'N/A' ? (
                              <span>NOT CHECKABLE</span>
                            ) : (
                              <>
                                <Zap className="w-3 h-3 text-cyan-400" />
                                <span>Run Check</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Formal Predicate */}
                        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[10px] text-cyan-300 overflow-x-auto">
                          <code className="text-[10px] font-mono block whitespace-nowrap">
                            Predicate: {inv.formalPredicate}
                          </code>
                        </div>

                        {/* Description & Hoare Triple */}
                        <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                          {inv.description}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                          <span>
                            Hoare: <code className="text-slate-400">{`{${inv.hoareTriple.preCondition}} → {${inv.hoareTriple.postCondition}}`}</code>
                          </span>
                          <span className={inv.evidenceFoundInTranscript ? 'text-emerald-400' : 'text-amber-400'}>
                            {inv.evidenceFoundInTranscript ? 'Quote found in transcript' : 'Quote not found in transcript'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Fallback to simple extracted invariants if SOTA list empty */}
                  {(!rclAnalysis.sotaReflexiveInvariants || rclAnalysis.sotaReflexiveInvariants.length === 0) && (
                    <div className="space-y-1.5">
                      {rclAnalysis.extractedInvariants.map((inv, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 text-xs text-slate-300 flex items-start gap-2"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{inv}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reflexive Feedback Notes */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-mono text-cyan-400">
                    Pass notes (model) and measurements:
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {rclAnalysis.reflexiveFeedbackNotes}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                <Layers className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">No RCL Analysis Generated Yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Run the RCL/SSI synthesis above to extract recursive invariants from transcripts.
                </p>
              </div>
            )}
          </div>

          {/* SSI (Structured State Induction) Vectors */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              SSI Operational Context Vectors
            </h3>

            {rclAnalysis?.ssiInjectedState ? (
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 font-mono text-xs text-slate-300 space-y-2 overflow-x-auto">
                <div className="flex items-center justify-between text-[11px] border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Active Context Window:</span>
                  <span className="text-cyan-400 font-semibold">
                    {rclAnalysis.ssiInjectedState.activeContextWindow?.toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Environment Sandbox Boundary:</span>
                  <span className="text-emerald-400">
                    {rclAnalysis.ssiInjectedState.environmentBoundary}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Drift Tolerance Limit:</span>
                  <span className="text-amber-400">
                    {rclAnalysis.ssiInjectedState.invariantTolerances?.driftThreshold ?? '0.05'}
                  </span>
                </div>
                <div className="text-[11px] pt-1">
                  <span className="text-slate-400 block mb-1">State Induction Payload:</span>
                  <pre className="p-2 rounded bg-slate-900 text-slate-300 text-[10px] overflow-x-auto max-h-32">
                    {JSON.stringify(rclAnalysis.ssiInjectedState, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                <p className="text-xs text-slate-500">SSI vectors will populate upon synthesis.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Context-Aware Script Sandbox & Execution Console (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Context-Aware Script Execution Sandbox
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {customScriptCode && (
                  <>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(customScriptCode);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1 transition-colors"
                      title="Copy synthesized script to clipboard"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Copy</span>
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([customScriptCode], { type: 'text/javascript' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `innershell-script-${Date.now().toString(36)}.js`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1 transition-colors"
                      title="Download script as .js file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  </>
                )}
                <button
                  onClick={handleRunScript}
                  disabled={isExecutingScript || !customScriptCode}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Execute Script</span>
                </button>
              </div>
            </div>

            {/* Script Code View/Edit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Innershell Execution Script (JavaScript Sandbox):</span>
                <span className="text-cyan-400">Context: ctx.memory, ctx.ssiState</span>
              </div>
              <textarea
                value={customScriptCode}
                onChange={(e) => setCustomScriptCode(e.target.value)}
                placeholder="// Innershell script will appear here after RCL/SSI cycle..."
                rows={8}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 leading-relaxed"
                spellCheck={false}
              />
            </div>

            {/* Execution Console Output */}
            {lastExecutionResult && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        lastExecutionResult.status === 'SUCCESS' ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    ></span>
                    <span className="text-slate-300 font-bold">
                      Execution Status: {lastExecutionResult.status}
                    </span>
                  </div>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {lastExecutionResult.executionTimeMs} ms
                  </span>
                </div>

                {/* Execution Logs */}
                <div className="space-y-1 text-[11px]">
                  <span className="text-slate-500">stdout:</span>
                  <div className="p-2 rounded bg-slate-900/90 text-slate-300 max-h-24 overflow-y-auto space-y-0.5">
                    {lastExecutionResult.logs.map((log, i) => (
                      <div key={i} className="leading-snug">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>

                {/* State Mutations Delta */}
                <div className="space-y-1 text-[11px] pt-1">
                  <span className="text-emerald-400">State Delta Applied to Persistent Memory:</span>
                  <pre className="p-2 rounded bg-slate-900/90 text-emerald-300 text-[10px] overflow-x-auto max-h-24">
                    {JSON.stringify(lastExecutionResult.stateMutationsApplied, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Innershell Workflow Plan */}
            {innershellLogic && (
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400">
                  Synthesized Workflow Plan ({innershellLogic.workflowSteps.length} steps):
                </span>
                <div className="space-y-1.5">
                  {innershellLogic.workflowSteps.map((ws) => (
                    <div
                      key={ws.step}
                      className="flex items-center gap-2 text-xs font-mono text-slate-300 p-1.5 rounded bg-slate-900/80 border border-slate-800/80"
                    >
                      <span className="w-5 h-5 rounded bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px]">
                        {ws.step}
                      </span>
                      <span className="text-cyan-300 font-semibold">{ws.action}:</span>
                      <span className="text-slate-400 truncate">{ws.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar: Advance to Watermark & Binding */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                <span className="text-slate-300 font-medium">Ready for Cryptographic Binding:</span>
                <p className="text-[11px] text-slate-500">
                  Bind this logic signature to transcript watermark prior to compression.
                </p>
              </div>
              <button
                onClick={onProceedToCrypto}
                disabled={!innershellLogic}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
              >
                <span>Watermark & Bind Logic</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
