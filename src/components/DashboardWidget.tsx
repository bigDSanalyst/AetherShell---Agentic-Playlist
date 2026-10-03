import React, { useEffect, useState } from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import { fetchGeminiUsage, type GeminiUsageReport } from '../services/api';

// Gemini usage today, as far as this server can know it. Google does not tell
// apps how much quota is left, so the bar appears only when the owner has
// stated the limit (GEMINI_DAILY_REQUEST_LIMIT); a refusal from Google that
// says the daily quota is used up is shown as such, whatever the count says.

const fmt = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export const DashboardWidget: React.FC = () => {
  const [data, setData] = useState<{ keySet: boolean; usage: GeminiUsageReport } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetchGeminiUsage()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const u = data?.usage;
  const used = u?.models.filter((m) => m.answered || m.dailyQuotaRefusals || m.rateLimitRefusals || m.otherFailures || m.skippedAfterDailyQuota) ?? [];
  const shown = used.length ? used : u?.models.slice(0, 1) ?? [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-slate-200 font-bold uppercase tracking-wider">
          <Gauge className="w-4 h-4 text-cyan-400" />
          Gemini usage today
        </span>
        <button onClick={load} className="p-1 rounded text-slate-400 hover:text-slate-200" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && <p className="text-rose-300 font-sans">Usage not available: {error}</p>}
      {data && !data.keySet && <p className="text-rose-300 font-sans">No Gemini key on the server: model calls cannot run.</p>}

      {u && (
        <>
          {u.allModelsExhausted && (
            <p className="p-2 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-200 font-sans">
              Google says the daily quota is used up for every model. Synthesis and guard reviews fail closed until the reset in about{' '}
              {fmt(u.secondsUntilReset)}.
            </p>
          )}

          {shown.map((m) => {
            const pct = m.usedFraction === null ? null : Math.round(m.usedFraction * 100);
            return (
              <div key={m.model} className="space-y-1">
                <div className="flex justify-between gap-2 text-slate-300">
                  <span className="truncate">{m.model}</span>
                  <span className="text-slate-400 shrink-0">
                    {m.answered} answered{u.dailyLimit ? ` / ${u.dailyLimit}` : ''}
                  </span>
                </div>
                {pct !== null && (
                  <div
                    className="h-2 rounded-full bg-slate-800 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${m.model} daily quota used`}
                  >
                    <div
                      className={`h-full ${m.dailyQuotaReached || pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                <div className="text-[10px] text-slate-500 font-sans">
                  {m.dailyQuotaReached
                    ? `Google refused at ${m.lastRefusalAt ? new Date(m.lastRefusalAt).toLocaleTimeString() : '?'}: daily quota used up. Not called again until the reset${m.skippedAfterDailyQuota ? ` (${m.skippedAfterDailyQuota} call(s) skipped)` : ''}.`
                    : pct !== null
                    ? `About ${Math.max(0, (u.dailyLimit ?? 0) - m.answered)} left by your stated limit.`
                    : 'Remaining: unknown (Google does not report it).'}
                  {m.rateLimitRefusals ? ` ${m.rateLimitRefusals} per-minute refusal(s).` : ''}
                  {m.otherFailures ? ` ${m.otherFailures} other failure(s).` : ''}
                </div>
              </div>
            );
          })}

          <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
            Quota day {u.day} ({u.timeZone}); resets in about {fmt(u.secondsUntilReset)}. Counts calls made by this server only
            {u.persisted ? '' : ', since it started'}.{' '}
            {u.dailyLimit
              ? `Limit ${u.dailyLimit} requests per model per day, as you stated it; check it in AI Studio → Rate Limit.`
              : 'To see a bar, set GEMINI_DAILY_REQUEST_LIMIT to the requests-per-day limit shown in AI Studio → Rate Limit.'}
          </p>
        </>
      )}
    </div>
  );
};
