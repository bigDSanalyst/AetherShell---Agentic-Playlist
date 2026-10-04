import React, { useEffect, useState } from 'react';
import { Library, RefreshCw, Layers } from 'lucide-react';
import { fetchTranscriptLibrary, LibraryEntry } from '../services/api';
import { transcriptSourceLabel } from '../utils/transcriptSource';

interface Props {
  isLoading: boolean;
  currentVideoIds: string[];
  onLoadCollection: (videoIds: string[], title?: string) => void;
}

// Every transcript the server has kept. Pick any of them, from any playlist
// or single video, and combine them into one set for synthesis.
export const TranscriptLibrary: React.FC<Props> = ({ isLoading, currentVideoIds, onLoadCollection }) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');

  const load = async () => {
    setError(null);
    try {
      const r = await fetchTranscriptLibrary();
      setEntries(r.videos);
      if (r.problems.length) setError(`${r.problems.length} archive entr(ies) failed their hash check and are not shown.`);
    } catch (e: any) {
      setError(e.message || 'Could not load the library');
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const totalWords = (entries || []).filter((e) => selected.has(e.videoId)).reduce((n, e) => n + e.words, 0);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px] flex items-center gap-1.5"
      >
        <Library className="w-3.5 h-3.5 text-cyan-400" />
        Transcript Library{entries ? ` (${entries.length})` : ''}
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span>Every video this server has transcribed. Combine any of them into one set; no fetching, no quota.</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelected(new Set((entries || []).map((e) => e.videoId)))} className="text-cyan-400 hover:text-cyan-300">
                Select all
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-slate-200">
                Clear
              </button>
              <button type="button" onClick={load} title="Reload" className="text-slate-400 hover:text-slate-200">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          {entries === null ? (
            <p className="text-[11px] text-slate-500">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              The archive is empty. Ingest a video or playlist and its transcripts are kept here. (If the server restarts on a fresh disk, the archive starts empty again.)
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {entries.map((e) => {
                const label = transcriptSourceLabel({ rawTranscript: 'x', transcriptSource: e.source, transcriptMethod: { model: e.model ?? undefined, via: '', at: e.at } });
                return (
                  <li key={e.videoId}>
                    <label className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                      <input type="checkbox" checked={selected.has(e.videoId)} onChange={() => toggle(e.videoId)} className="mt-0.5 accent-cyan-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-200 truncate" title={e.title}>
                          {e.title}
                          {currentVideoIds.includes(e.videoId) && <span className="ml-1.5 text-[10px] text-cyan-400 font-mono">in current set</span>}
                        </span>
                        <span className="block text-[10px] font-mono text-slate-500">
                          <span className={label?.className}>{label?.short}</span> · {e.words.toLocaleString()} words · {e.at.slice(0, 10)} · {e.videoId}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {entries && entries.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name this set (optional)"
                className="flex-1 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                disabled={isLoading || selected.size === 0}
                onClick={() => onLoadCollection([...selected], title.trim() || undefined)}
                className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                Combine {selected.size || ''} into one set{selected.size ? ` · ${totalWords.toLocaleString()} words` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
