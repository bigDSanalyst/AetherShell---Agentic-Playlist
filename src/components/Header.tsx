import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Database,
  Layers,
  Sparkles,
  RotateCcw,
  Download,
  Terminal,
  Brain,
  GitBranch,
} from 'lucide-react';
import { PersistentSessionMemory } from '../types';

interface HeaderProps {
  activeTab: 'pipeline' | 'knowledge' | 'innershell' | 'crypto' | 'guard' | 'twin' | 'memory';
  setActiveTab: (tab: 'pipeline' | 'knowledge' | 'innershell' | 'crypto' | 'guard' | 'twin' | 'memory') => void;
  sessionMemory: PersistentSessionMemory;
  boundaryStatus: 'LOCKED' | 'AUDITING' | 'PASSED' | 'FEEDBACK_LOOP';
  onResetSession: () => void;
  onOpenMemoryModal: () => void;
  onOpenOutputHub: () => void;
  hasWatermarkAndLogic: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  sessionMemory,
  boundaryStatus,
  onResetSession,
  onOpenMemoryModal,
  onOpenOutputHub,
  hasWatermarkAndLogic,
}) => {
  const memoryKeyCount = Object.keys(sessionMemory.memoryLattice || {}).length;

  return (
    <header className="border-b border-cyan-900/40 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/40">
            <Cpu className="w-5 h-5 text-slate-950" />
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-100 flex items-center gap-2">
                AetherShell
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                  RCL • SSI • Guard
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              YouTube Playlist Transcripts • Watermark Signature Binding • Dual-Shell Boundary
            </p>
          </div>
        </div>

        {/* Phase Boundary & Memory Status Pill */}
        <div className="hidden md:flex items-center gap-2">
          {/* Phase Boundary Indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
              boundaryStatus === 'PASSED'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/10'
                : boundaryStatus === 'AUDITING'
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 animate-pulse'
                : boundaryStatus === 'FEEDBACK_LOOP'
                ? 'bg-rose-950/60 border-rose-500/40 text-rose-300 animate-pulse'
                : 'bg-slate-900/80 border-slate-800 text-slate-400'
            }`}
          >
            {boundaryStatus === 'PASSED' ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : boundaryStatus === 'FEEDBACK_LOOP' ? (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            ) : (
              <Layers className="w-4 h-4 text-cyan-400" />
            )}
            <span>Phase Boundary: {boundaryStatus}</span>
          </div>

          {/* Persistent Memory Pill */}
          <button
            onClick={onOpenMemoryModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-800/40 bg-slate-900/80 text-cyan-300 hover:bg-cyan-950/60 transition-all text-xs font-mono"
            title="View Persistent Multi-Session Memory Lattice"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Memory Lattice: {memoryKeyCount} keys</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'pipeline'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>1. Ingestion</span>
          </button>

          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'knowledge'
                ? 'bg-indigo-500 text-white font-semibold shadow-sm shadow-indigo-500/30'
                : 'text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/40'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>2. Synthesized Knowledge Brain</span>
          </button>

          <button
            onClick={() => setActiveTab('innershell')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'innershell'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>3. RCL/SSI Innershell</span>
          </button>

          <button
            onClick={() => setActiveTab('crypto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 relative ${
              activeTab === 'crypto'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>4. Watermark & Bind</span>
            {hasWatermarkAndLogic && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-1 right-1"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('guard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'guard'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>5. Phase Guard</span>
          </button>

          <button
            onClick={() => setActiveTab('twin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'twin'
                ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
                : 'text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/40'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>6. AetherTwin (Parallel)</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>
        </nav>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          {/* AetherShell Output Tool Button with Icon */}
          <button
            onClick={onOpenOutputHub}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-semibold shadow-sm shadow-cyan-500/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="AetherShell Output Tool: Copy, Paste, or Download Output"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Output Tool</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 uppercase">
              Export / Import
            </span>
          </button>

          <button
            onClick={onResetSession}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Reset active working session"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
