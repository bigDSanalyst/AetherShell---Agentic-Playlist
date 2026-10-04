import fs from 'fs';
import path from 'path';

// What this server knows about its own model usage (any provider), per model, for the
// current quota day (Google resets free-tier daily quotas at midnight Pacific).
//
// What it can know: how many calls it made, which Google answered, and which
// Google refused (and whether the refusal said the DAILY quota is used up).
// What it cannot know: the quota Google has left. The Gemini API does not report
// it. A limit is shown only if the owner states it (GEMINI_DAILY_REQUEST_LIMIT,
// read off AI Studio's Rate Limit page); otherwise it is "unknown".
//
// Counts cover calls made by this server since the file was started. Calls made
// elsewhere with the same key (AI Studio, another notebook) are not seen.

export const USAGE_FORMAT = 'aethershell-gemini-usage/v1';
const TZ = 'America/Los_Angeles';

export type CallOutcome = 'ok' | 'daily-quota' | 'rate-limit' | 'failed';

export interface ModelUsage {
  answered: number; // Google returned a response
  dailyQuotaRefusals: number;
  rateLimitRefusals: number; // per-minute limits; clear by themselves
  otherFailures: number;
  skippedAfterDailyQuota: number; // calls not sent because Google already said the day's quota is used
  lastRefusalAt: string | null;
  lastRefusal: string | null; // Google's message, trimmed
  dailyQuotaReached: boolean;
}

interface UsageFile {
  format: typeof USAGE_FORMAT;
  day: string; // YYYY-MM-DD, Pacific
  models: Record<string, ModelUsage>;
}

function pacificParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: `${get('year')}-${get('month')}-${get('day')}`, secondsIntoDay: +get('hour') * 3600 + +get('minute') * 60 + +get('second') };
}

export function pacificDay(d: Date): string {
  return pacificParts(d).day;
}

// Seconds until midnight Pacific. Off by up to an hour on the two DST-change days.
export function secondsUntilReset(d: Date): number {
  return 86400 - pacificParts(d).secondsIntoDay;
}

export function classifyGeminiError(err: unknown): Exclude<CallOutcome, 'ok'> {
  const e = err as any;
  const text = `${e?.status ?? ''} ${e?.code ?? ''} ${e?.message ?? String(err)}`;
  if (!/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) return 'failed';
  return /per[ -]?day|PerDay|daily/i.test(text) ? 'daily-quota' : 'rate-limit';
}

const blank = (): ModelUsage => ({
  answered: 0,
  dailyQuotaRefusals: 0,
  rateLimitRefusals: 0,
  otherFailures: 0,
  skippedAfterDailyQuota: 0,
  lastRefusalAt: null,
  lastRefusal: null,
  dailyQuotaReached: false,
});

export class GeminiUsage {
  private state: UsageFile;

  constructor(readonly filePath: string | null, private readonly now: () => Date = () => new Date()) {
    this.state = { format: USAGE_FORMAT, day: pacificDay(this.now()), models: {} };
    if (filePath && fs.existsSync(filePath)) {
      try {
        const s = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (s?.format === USAGE_FORMAT && typeof s.day === 'string' && s.models && typeof s.models === 'object') this.state = s;
      } catch {
        // An unreadable usage file only means today's earlier counts are unknown.
      }
    }
    this.rollover();
  }

  // A new Pacific day starts fresh: Google's daily quotas have reset.
  private rollover() {
    const today = pacificDay(this.now());
    if (this.state.day !== today) this.state = { format: USAGE_FORMAT, day: today, models: {} };
  }

  private save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state));
    } catch {
      // Counting is advisory; never fail a model call over it.
    }
  }

  private model(m: string) {
    this.rollover();
    return (this.state.models[m] ??= blank());
  }

  // True when Google has said today's quota for this model is used up.
  dailyQuotaReached(model: string): boolean {
    return this.model(model).dailyQuotaReached;
  }

  record(model: string, outcome: CallOutcome | 'skipped', err?: unknown) {
    const u = this.model(model);
    if (outcome === 'ok') u.answered++;
    else if (outcome === 'skipped') u.skippedAfterDailyQuota++;
    else {
      if (outcome === 'daily-quota') {
        u.dailyQuotaRefusals++;
        u.dailyQuotaReached = true;
      } else if (outcome === 'rate-limit') u.rateLimitRefusals++;
      else u.otherFailures++;
      if (outcome !== 'failed') {
        u.lastRefusalAt = this.now().toISOString();
        u.lastRefusal = String((err as any)?.message ?? err ?? '').replace(/\s+/g, ' ').slice(0, 300);
      }
    }
    this.save();
  }

  // dailyLimit: one stated limit for every model, or a per-model lookup (null = unknown).
  report(models: string[], dailyLimitArg: number | null | ((model: string) => number | null)) {
    this.rollover();
    const now = this.now();
    const limitOf = typeof dailyLimitArg === 'function' ? dailyLimitArg : () => dailyLimitArg;
    const rows = models.map((m) => {
      const u = this.state.models[m] ?? blank();
      const dailyLimit = limitOf(m);
      return {
        model: m,
        ...u,
        dailyLimit,
        // Answered calls against the owner-stated limit. Google's own refusal overrides it.
        usedFraction: u.dailyQuotaReached ? 1 : dailyLimit ? Math.min(1, u.answered / dailyLimit) : null,
      };
    });
    const dailyLimit = rows.find((r) => r.dailyLimit !== null)?.dailyLimit ?? null;
    return {
      day: this.state.day,
      timeZone: TZ,
      secondsUntilReset: secondsUntilReset(now),
      dailyLimit,
      limitSource: dailyLimit ? 'GEMINI_DAILY_REQUEST_LIMIT (stated by the owner from AI Studio)' : null,
      allModelsExhausted: rows.length > 0 && rows.every((r) => r.dailyQuotaReached),
      persisted: this.filePath,
      models: rows,
    };
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
