import React, { useEffect, useState } from 'react';
import { fetchExchange, requestSystemAnswer, type ExchangeConcern } from '../services/api';

// Concerns both ways, answers and overrides, read from the server's ledger.
// The owner acts through `npm run owner` (signing needs the owner key, which
// the browser never has); this panel shows the command to run.
export const ExchangePanel: React.FC<{ refreshKey?: unknown }> = ({ refreshKey }) => {
  const [items, setItems] = useState<ExchangeConcern[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetchExchange()
      .then((r) => {
        setItems(r.concerns);
        setOverrides(r.overrides);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [refreshKey]);

  const askSystem = async (id: string) => {
    setBusy(id);
    try {
      await requestSystemAnswer(id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
      load();
    }
  };

  const open = items.filter((c) => c.status !== 'answered');
  const statusStyle = (s: ExchangeConcern['status']) =>
    s === 'answered' ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-amber-950 text-amber-300 border-amber-800/60';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3 font-mono text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <h3 className="uppercase tracking-wider text-slate-200 font-semibold">Exchange: owner ⇄ system</h3>
          <p className="text-[11px] text-slate-400 font-sans">
            Either side can raise a concern; the other owes it a reasoned answer. Neither changes the guards alone. Everything here is in the
            signed ledger.
          </p>
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">
          {open.length} open · {overrides.length} override(s)
        </span>
      </div>

      {error && <p className="text-rose-300">{error}</p>}
      {items.length === 0 && !error && <p className="text-slate-500 font-sans">No concerns on either side yet.</p>}

      <ul className="space-y-2">
        {[...items].reverse().map((c) => (
          <li key={c.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-200">
                {c.id} · from <strong>{c.from}</strong> · {c.topic}
              </span>
              <span className={`px-2 py-0.5 rounded border text-[10px] uppercase ${statusStyle(c.status)}`}>{c.status.replace('-', ' ')}</span>
            </div>
            <p className="text-slate-300 font-sans whitespace-pre-wrap">{c.body}</p>
            {c.answers.map((a) => (
              <p key={a.seq} className="text-[11px] text-slate-400 font-sans whitespace-pre-wrap">
                ↳ <strong className="text-slate-300">{a.from}</strong> {a.decision}: {a.reason}
              </p>
            ))}
            {c.status === 'awaiting-owner' && (
              <p className="text-[11px] text-amber-300">
                Your answer: npm run owner -- answer --key &lt;your key&gt; --concern {c.id} --decision accepted|declined|noted --reason "…"
              </p>
            )}
            {c.status === 'awaiting-system' && (
              <button
                onClick={() => askSystem(c.id)}
                disabled={busy === c.id}
                className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-800/60 text-cyan-300 disabled:opacity-50"
              >
                {busy === c.id ? 'Asking…' : 'Ask the system to answer'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {overrides.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-1">
          <span className="text-slate-400">Owner overrides of single verdicts</span>
          {overrides.map((o) => (
            <p key={o.seq} className="text-[11px] text-slate-300 font-sans">
              Run {o.guardSeq}: {o.decision} — “{o.reason}” (system had assessed: {o.assessment?.summary})
            </p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-500 font-sans">
        Raise a concern: npm run owner -- raise --key &lt;your key&gt; --topic "…" --body "…" · Override one verdict: npm run owner -- override --seq
        &lt;ledger entry&gt; (shows the system's assessment first)
      </p>
    </div>
  );
};
