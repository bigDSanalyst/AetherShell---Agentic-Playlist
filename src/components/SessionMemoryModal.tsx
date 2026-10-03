import React, { useState } from 'react';
import {
  Database,
  X,
  Plus,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  Clock,
  Key,
} from 'lucide-react';
import { PersistentSessionMemory } from '../types';
import { MAX_SNAPSHOT_BYTES, parseSnapshot, type ParsedSnapshot, type WorkSnapshot } from '../utils/snapshot';

interface SessionMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionMemory: PersistentSessionMemory;
  onUpdateMemory: (newMemory: Record<string, any>) => void;
  onResetSession: () => void;
  buildSnapshot: () => WorkSnapshot;
  onRestoreSnapshot: (parsed: Exclude<ParsedSnapshot, { ok: false }>) => void;
}

export const SessionMemoryModal: React.FC<SessionMemoryModalProps> = ({
  isOpen,
  onClose,
  sessionMemory,
  onUpdateMemory,
  onResetSession,
  buildSnapshot,
  onRestoreSnapshot,
}) => {
  // Hooks run on every render, open or closed (an early return before them breaks React).
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Exclude<ParsedSnapshot, { ok: false }> | null>(null);

  if (!isOpen) return null;

  const lattice = sessionMemory?.memoryLattice || {};

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    let parsedVal: any = newValue;
    try {
      parsedVal = JSON.parse(newValue);
    } catch {
      parsedVal = newValue;
    }
    const updated = { ...lattice, [newKey.trim()]: parsedVal };
    onUpdateMemory(updated);
    setNewKey('');
    setNewValue('');
  };

  const handleDeleteKey = (k: string) => {
    const updated = { ...lattice };
    delete updated[k];
    onUpdateMemory(updated);
  };

  // Whole working state (memory, playlist, transcripts, signed watermarks, logic).
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(buildSnapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `aethershell-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    setImportError(null);
    if (file.size > MAX_SNAPSHOT_BYTES) {
      setImportError('File is larger than 50 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const parsed = parseSnapshot(String(event.target?.result ?? ''));
      if (!parsed.ok) setImportError(parsed.error);
      else setPendingRestore(parsed); // confirm first: a restore replaces the current work
    };
    reader.onerror = () => setImportError('Could not read the file.');
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-2xl border border-cyan-800/60 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-300">
              <Database className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Persistent Multi-Session Memory Lattice
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Persisted in browser storage across sessions • Injected into SSI runtime
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Session Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500">Session ID</span>
            <div className="text-cyan-300 truncate font-semibold">
              {sessionMemory.sessionId}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500">Lattice Nodes</span>
            <div className="text-slate-200 font-bold">
              {Object.keys(lattice).length} Variables
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500">Last Synced</span>
            <div className="text-emerald-400">
              {new Date(sessionMemory.lastActive).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {pendingRestore && (
          <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-700/60 text-xs font-mono text-cyan-100 space-y-2">
            <p>
              Restore {pendingRestore.summary}?{' '}
              {pendingRestore.kind === 'snapshot'
                ? 'This replaces the current playlist, logic and memory. Guard verdicts are not restored; run the guards again.'
                : 'This replaces the memory keys only.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onRestoreSnapshot(pendingRestore);
                  setPendingRestore(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
              >
                Restore
              </button>
              <button onClick={() => setPendingRestore(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
                Cancel
              </button>
            </div>
          </div>
        )}

        {importError && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700/60 text-xs font-mono text-rose-300 flex items-center justify-between">
            <span>{importError}</span>
            <button onClick={() => setImportError(null)} className="text-slate-400 hover:text-slate-200 px-1">✕</button>
          </div>
        )}

        {/* Memory Keys Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Active Memory Lattice Variables</span>
            <span className="text-cyan-400">Survives page reloads</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {Object.keys(lattice).length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-500 font-mono">
                Memory lattice empty. Run an innershell script or add custom keys below.
              </div>
            ) : (
              Object.entries(lattice).map(([k, v]) => (
                <div
                  key={k}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3 text-xs font-mono"
                >
                  <div className="space-y-1 overflow-hidden">
                    <span className="text-cyan-300 font-semibold">{k}:</span>
                    <pre className="text-slate-400 text-[11px] truncate max-w-md">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </pre>
                  </div>
                  <button
                    onClick={() => handleDeleteKey(k)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors shrink-0"
                    title="Delete key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add Key Form */}
        <form onSubmit={handleAddKey} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <span className="text-xs font-mono font-medium text-slate-300 block">
            Inject Key-Value into Persistent Memory Lattice:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Key (e.g. taskQueue, lastRunStep)"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder='Value (string or JSON e.g. {"step": 2})'
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="submit"
            disabled={!newKey.trim()}
            className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold font-mono text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Inject Into Memory Lattice</span>
          </button>
        </form>

        {/* Export / Import & Reset Actions */}
        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Snapshot</span>
            </button>

            <label className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Restore Snapshot</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </div>

          {showResetConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-rose-400 font-mono">Reset lattice?</span>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetSession();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition-colors"
              >
                Yes, Reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-2 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 font-mono text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Session</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
