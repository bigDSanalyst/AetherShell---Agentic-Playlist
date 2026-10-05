import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { exportNotebook } from '../services/api';
import type { VideoNode } from '../types';

// Saves the current work as a Colab / Jupyter notebook (.ipynb): the sources,
// and the plan (with a Python check of its signature when it was signed) or a
// knowledge synthesis. Open it in Colab with File → Upload notebook.
export const ExportNotebookButton: React.FC<{
  title: string;
  sources: VideoNode[];
  logic?: unknown;
  boundVideo?: VideoNode | null;
  knowledge?: unknown;
  disabled?: boolean;
  demo?: boolean; // the sources are the synthetic demo playlist
}> = ({ title, sources, logic, boundVideo, knowledge, disabled, demo }) => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const withText = sources.filter((s) => s.rawTranscript);
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await exportNotebook({ title, sources: withText, logic, boundVideo, knowledge, demo });
      setNote(
        `Saved ${r.filename}. In Colab: File → Upload notebook.` +
          (r.signedCheck === 'verified' ? ' It includes a check of the plan\'s signature.' : r.signedCheck === 'not verified' ? ' Warning: the plan\'s signature did not verify here.' : ' The plan is not signed yet, so there is no signature check in it.')
      );
    } catch (e: any) {
      setNote(e.message || 'Could not build the notebook');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled || (!withText.length && !logic && !knowledge)}
        className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/60 text-amber-200 font-mono text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
        title="Save as a Colab / Jupyter notebook (.ipynb)"
      >
        <BookOpen className="w-3.5 h-3.5" />
        {busy ? 'Building…' : 'Export to Colab'}
      </button>
      {note && <span className="text-[10px] font-mono text-slate-400 max-w-xs">{note}</span>}
    </span>
  );
};
