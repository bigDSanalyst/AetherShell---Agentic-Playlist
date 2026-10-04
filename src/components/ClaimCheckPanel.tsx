import React, { useState } from 'react';
import type { ClaimCheck } from '../types';

// What the server's word check found in one chat answer (server/claimCheck.ts).
export const ClaimCheckPanel: React.FC<{ check: ClaimCheck }> = ({ check }) => {
  const [open, setOpen] = useState(false);
  const s = check.summary;
  const total = check.citations.length;
  const problems = s.elsewhere + s.unsupported + s.invalid + s.outsideCorpus;
  const parts = [
    total ? `${s.supported}/${total} citation(s) confirmed` : 'no citations',
    s.elsewhere ? `${s.elsewhere} said at a different time` : '',
    s.unsupported ? `${s.unsupported} not found in that video` : '',
    s.invalid ? `${s.invalid} impossible (no such video or time)` : '',
    s.outsideCorpus ? `${s.outsideCorpus} sentence(s) from outside the transcripts` : '',
  ].filter(Boolean);
  const label: Record<string, string> = {
    supported: 'confirmed',
    elsewhere: 'said elsewhere',
    unsupported: 'not found',
    'no-such-video': 'no such video',
    'bad-time': 'past the end of the video',
  };
  return (
    <div className={`mt-1 max-w-[88%] text-[10px] font-mono ${problems ? 'text-amber-300' : 'text-emerald-400'}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-left hover:underline" title={check.method}>
        Claim check: {parts.join(' · ')} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 space-y-1">
          <p className="text-slate-500">{check.method}.</p>
          {check.citations.map((c, i) => (
            <p key={i}>
              <span className={c.status === 'supported' ? 'text-emerald-400' : 'text-amber-300'}>
                [Video {c.video} @ {c.cited}] {label[c.status]}
                {c.foundAt ? ` (said at ${c.foundAt})` : ''}
              </span>{' '}
              <span className="text-slate-500">"{c.claim.slice(0, 120)}{c.claim.length > 120 ? '…' : ''}"</span>
            </p>
          ))}
          {check.uncited
            .filter((u) => u.outsideCorpus)
            .map((u, i) => (
              <p key={`u${i}`}>
                <span className="text-amber-300">not from the transcripts ({Math.round(u.inCorpus * 100)}% of its words occur in them):</span>{' '}
                <span className="text-slate-500">"{u.text.slice(0, 140)}{u.text.length > 140 ? '…' : ''}"</span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
};
