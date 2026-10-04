import React, { useEffect, useState } from 'react';
import { Library, RefreshCw, Layers, Download, Upload } from 'lucide-react';
import { exportTranscriptArchive, fetchTranscriptLibrary, importTranscriptArchive, LibraryEntry } from '../services/api';
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
  const [note, setNote] = useState<string | null>(null);

  // Save the archive to a file the owner keeps (Downloads, Google Drive):
  // a fresh server starts with an empty archive, and this brings it back.
  const saveFile = async () => {
    setNote(null);
    try {
      const { text, filename, count } = await exportTranscriptArchive();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote(`Saved ${count} transcript(s) to ${filename}. Keep it somewhere safe (e.g. Google Drive); "Restore from a file" brings them back.`);
    } catch (e: any) {
      setNote(e.message || 'Could not save the archive');
    }
  };

  const restoreFile = async (file: File | undefined) => {
    if (!file) return;
    setNote(null);
    try {
      const r = await importTranscriptArchive(await file.text());
      setNote(
        [
          `Restored ${r.added.length} transcript(s)`,
          r.alreadyHere ? `${r.alreadyHere} were already here` : '',
          r.keptLocal.length ? `${r.keptLocal.length} kept as they are here (a different transcript of the same video): ${r.keptLocal.map((k) => k.title).join(', ')}` : '',
          r.rejected.length ? `${r.rejected.length} rejected: ${r.rejected.map((x) => `#${x.entry}${x.videoId ? ` ${x.videoId}` : ''} ${x.why}`).join('; ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      );
      load();
    } catch (e: any) {
      setNote(e.message || 'Could not restore the archive');
    }
  };

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
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <button type="button" onClick={saveFile} disabled={!entries?.length} className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white flex items-center gap-1 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Save archive to a file
            </button>
            <label className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Restore from a file
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { restoreFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {note && <p className="text-[11px] text-cyan-300" role="status">{note}</p>}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          {entries === null ? (
            <p className="text-[11px] text-slate-500">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              The archive is empty. Ingest a video or playlist and its transcripts are kept here. If you saved an archive file before (this server may have restarted on a fresh disk), use "Restore from a file".
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
                          <span className={label?.className}>{label?.short}</span>
                          {e.imported ? ' · restored from file' : ''} · {e.words.toLocaleString()} words · {e.at.slice(0, 10)} · {e.videoId}
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
