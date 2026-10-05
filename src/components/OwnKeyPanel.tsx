import React, { useState } from 'react';
import { KeyRound, CheckCircle2, ExternalLink } from 'lucide-react';
import { clearOwnGeminiKey, readOwnGeminiKey, verifyAndSaveOwnGeminiKey } from '../services/api';

// "Bring your own key": the visitor's AI calls run on their own free Gemini key.
export const OwnKeyPanel: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(!!readOwnGeminiKey());

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await verifyAndSaveOwnGeminiKey(key, remember);
      if (r.valid) {
        setKey('');
        setSaved(true);
        setMsg({ ok: true, text: 'Key accepted. Your AI calls now run on your own Gemini quota, with no demo limit.' });
        onChanged();
      } else setMsg({ ok: false, text: r.error || 'The key was not accepted' });
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Could not check the key' });
    } finally {
      setBusy(false);
    }
  };

  const forget = () => {
    clearOwnGeminiKey();
    setSaved(false);
    setMsg({ ok: true, text: 'Your key is removed from this browser.' });
    onChanged();
  };

  return (
    <div className="p-5 rounded-2xl border border-emerald-600/40 bg-emerald-950/20 space-y-3">
      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">Quickest · keep using this page</span>
      <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
        <KeyRound className="w-4 h-4 text-emerald-400" />
        Use your own Gemini API key
      </h3>
      <p className="text-xs text-slate-300 leading-relaxed">
        Get a free key at{' '}
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">
          aistudio.google.com/app/apikey <ExternalLink className="w-3 h-3" />
        </a>{' '}
        and paste it here. Your AI calls then run on your own quota, with no demo limit.
      </p>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Your key is kept in this browser only and sent with each of your requests. This server uses it for that request and never stores or logs it, but it
        does pass through this server: only use it on an instance you trust, or deploy your own copy. With your key, only Gemini models run.
      </p>
      {saved ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Using your own key in this browser
          </span>
          <button type="button" onClick={forget} className="px-3 py-1 rounded-lg border border-slate-700 text-slate-300 hover:text-white font-mono">
            Forget my key
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button type="submit" disabled={busy || !key.trim()} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-semibold disabled:opacity-50">
              {busy ? 'Checking…' : 'Use my key'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-emerald-500" />
            Remember on this device (otherwise only for this tab)
          </label>
        </form>
      )}
      {msg && <p className={`text-[11px] ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>}
    </div>
  );
};
