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

interface SessionMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionMemory: PersistentSessionMemory;
  onUpdateMemory: (newMemory: Record<string, any>) => void;
  onResetSession: () => void;
}

export const SessionMemoryModal: React.FC<SessionMemoryModalProps> = ({
  isOpen,
  onClose,
  sessionMemory,
  onUpdateMemory,
  onResetSession,
}) => {
  if (!isOpen) return null;

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const lattice = sessionMemory.memoryLattice || {};

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

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sessionMemory, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aethershell-memory-${sessionMemory.sessionId.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.memoryLattice) {
          onUpdateMemory(parsed.memoryLattice);
        }
      } catch (err) {
        alert('Invalid session memory JSON file.');
      }
    };
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
              <span>Export Snapshot JSON</span>
            </button>

            <label className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </div>

          <button
            onClick={() => {
              if (confirm('Reset entire session memory lattice?')) {
                onResetSession();
              }
            }}
            className="px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
