import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Layers,
  ArrowRight,
  RotateCcw,
  Zap,
  Activity,
  Lock,
  Unlock,
} from 'lucide-react';
import { GuardAuditReport } from '../types';

interface PhaseBoundaryProps {
  boundaryStatus: 'LOCKED' | 'AUDITING' | 'PASSED' | 'FEEDBACK_LOOP';
  guardReport: GuardAuditReport | null;
  onInitiateMerge: () => void;
  onTriggerFeedbackLoop: () => void;
  isLoading: boolean;
  canMerge: boolean;
}

export const PhaseBoundary: React.FC<PhaseBoundaryProps> = ({
  boundaryStatus,
  guardReport,
  onInitiateMerge,
  onTriggerFeedbackLoop,
  isLoading,
  canMerge,
}) => {
  return (
    <div className="rounded-2xl border border-cyan-800/40 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-sm relative overflow-hidden">
      {/* Background Energy Field Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div
          className={`w-full h-full bg-gradient-to-r ${
            boundaryStatus === 'PASSED'
              ? 'from-emerald-500/20 via-cyan-500/30 to-emerald-500/20'
              : boundaryStatus === 'FEEDBACK_LOOP'
              ? 'from-rose-500/30 via-amber-500/30 to-rose-500/30'
              : 'from-cyan-500/10 via-indigo-500/20 to-cyan-500/10'
          } animate-pulse`}
        ></div>
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        {/* Left: Phase Boundary Status */}
        <div className="flex items-center gap-3.5">
          <div
            className={`p-3 rounded-2xl border transition-all ${
              boundaryStatus === 'PASSED'
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-400 shadow-lg shadow-emerald-500/20'
                : boundaryStatus === 'FEEDBACK_LOOP'
                ? 'bg-rose-950/80 border-rose-500/60 text-rose-400 shadow-lg shadow-rose-500/20 animate-bounce'
                : boundaryStatus === 'AUDITING'
                ? 'bg-amber-950/80 border-amber-500/60 text-amber-400 animate-pulse'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            {boundaryStatus === 'PASSED' ? (
              <Unlock className="w-6 h-6 text-emerald-400" />
            ) : boundaryStatus === 'FEEDBACK_LOOP' ? (
              <ShieldAlert className="w-6 h-6 text-rose-400" />
            ) : (
              <Lock className="w-6 h-6 text-cyan-400" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                Phase Boundary Gate
              </span>
              <span
                className={`text-xs font-mono font-bold ${
                  boundaryStatus === 'PASSED'
                    ? 'text-emerald-400'
                    : boundaryStatus === 'FEEDBACK_LOOP'
                    ? 'text-rose-400'
                    : boundaryStatus === 'AUDITING'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                STATUS: {boundaryStatus}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-100 mt-0.5">
              Inner Shell → Guard Shell Membrane
            </h3>
            <p className="text-xs text-slate-400">
              Isolates the creative innershell from invariant enforcement. Output merges only upon cryptographic and direct transcript proof.
            </p>
          </div>
        </div>

        {/* Center: Real-Time Telemetry Gauges */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Guard Result:</span>
            <span
              className={`text-sm font-bold ${
                !guardReport ? 'text-slate-400' : guardReport.passedPhaseBoundary ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {!guardReport ? 'NOT RUN' : guardReport.passedPhaseBoundary ? 'ALL CHECKS PASSED' : 'FAILED'}
            </span>
          </div>

          <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Checks Passed:</span>
            <span className="text-sm font-bold text-cyan-400">
              {guardReport?.multiGuardTelemetry?.consensusSummary
                ? `${guardReport.multiGuardTelemetry.consensusSummary.passCount} / ${guardReport.multiGuardTelemetry.consensusSummary.totalActiveGuards}`
                : '—'}
            </span>
          </div>

          <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Grounded Words:</span>
            <span className="text-sm font-bold text-slate-300">
              {guardReport?.multiGuardTelemetry?.guard2SemanticAuditor
                ? `${guardReport.multiGuardTelemetry.guard2SemanticAuditor.citationCoveragePercent}%`
                : '—'}
            </span>
          </div>
        </div>

        {/* Right: Phase Transition & Feedback Loop Controls */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button
            onClick={onInitiateMerge}
            disabled={isLoading || !canMerge}
            className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold font-mono text-xs shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {isLoading ? (
              <>
                <Activity className="w-4 h-4 animate-spin" />
                <span>Auditing Boundary...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Merge Across Phase Boundary</span>
              </>
            )}
          </button>

          {guardReport && (
            <button
              onClick={onTriggerFeedbackLoop}
              disabled={isLoading}
              className="px-3 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
              title="Force Critical RCL Feedback Loop back to Innershell"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Feedback Loop</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
