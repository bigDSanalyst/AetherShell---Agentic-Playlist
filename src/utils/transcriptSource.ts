import type { VideoNode } from '../types';

// How a transcript's origin is shown. A machine transcription or a pasted
// transcript is never shown as YouTube captions.
export function transcriptSourceLabel(
  v: Pick<VideoNode, 'rawTranscript' | 'transcriptSource' | 'transcriptMethod' | 'fromArchive'>,
  isDemo = false
): { text: string; short: string; detail: string; className: string } | null {
  const label = baseLabel(v, isDemo);
  if (!label || !v.fromArchive) return label;
  return { ...label, text: `${label.text} · archived`, detail: `${label.detail}. Read from this server's transcript archive.` };
}

function baseLabel(
  v: Pick<VideoNode, 'rawTranscript' | 'transcriptSource' | 'transcriptMethod'>,
  isDemo: boolean
): { text: string; short: string; detail: string; className: string } | null {
  if (!v.rawTranscript) return null;
  if (isDemo) return { text: 'Demo (synthetic)', short: 'demo', detail: 'Synthetic demo text, not a real video', className: 'text-amber-300' };
  const at = v.transcriptMethod?.at ? ` on ${v.transcriptMethod.at.slice(0, 10)}` : '';
  switch (v.transcriptSource) {
    case 'youtube-captions':
      return { text: 'YouTube captions', short: 'captions', detail: "From the video's YouTube caption track", className: 'text-emerald-300' };
    case 'model-transcription': {
      const model = v.transcriptMethod?.model || 'unknown model';
      return {
        text: `Machine transcription · ${model}`,
        short: 'machine',
        detail: `Transcribed from the video by ${model}${at}. A model can mishear words; this is not YouTube's captions.`,
        className: 'text-violet-300',
      };
    }
    case 'notebook':
      return { text: `Notebook · ${v.transcriptMethod?.via ?? 'imported'}`, short: 'notebook', detail: `A Jupyter / Colab notebook (${v.transcriptMethod?.via ?? 'imported'})${at}: its text, code and printed outputs, one segment per cell. Nothing in it was run.`, className: 'text-sky-300' };
    case 'owner-provided':
      return { text: 'Owner-provided (pasted)', short: 'pasted', detail: `Pasted by the owner${at}`, className: 'text-amber-300' };
    default:
      return { text: 'Source unknown', short: 'unknown', detail: 'Where this transcript came from was not recorded', className: 'text-slate-400' };
  }
}
