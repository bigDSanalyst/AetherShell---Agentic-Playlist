import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  ExternalLink,
  KeyRound,
  CheckCircle2,
  X,
  Lock,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import {
  DemoStatus,
  verifyAndSaveAccessToken,
  clearStoredAccessToken,
  readToken,
} from '../services/api';
import { OwnKeyPanel } from './OwnKeyPanel';

interface DemoLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoStatus: DemoStatus | null;
  onStatusUpdated: () => void;
  reason?: string | null;
}

export const DemoLimitModal: React.FC<DemoLimitModalProps> = ({
  isOpen,
  onClose,
  demoStatus,
  onStatusUpdated,
  reason,
}) => {
  const [tokenInput, setTokenInput] = useState(readToken());
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setIsVerifying(true);
    setVerifyMessage(null);
    try {
      const res = await verifyAndSaveAccessToken(tokenInput.trim());
      if (res.valid) {
        setVerifyMessage({ type: 'success', text: 'Access token verified. Host quota unlocked!' });
        onStatusUpdated();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setVerifyMessage({ type: 'error', text: res.error || 'Invalid access token' });
      }
    } catch (err: any) {
      setVerifyMessage({ type: 'error', text: err.message || 'Verification failed' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearToken = () => {
    clearStoredAccessToken();
    setTokenInput('');
    setVerifyMessage({ type: 'success', text: 'Stored token cleared. Resumed demo mode.' });
    onStatusUpdated();
  };

  const isExceeded = demoStatus?.demoExceeded;
  const isAuthorized = demoStatus?.isAuthorized;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isExceeded
                  ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                  : isAuthorized
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                  : 'bg-cyan-950/80 border-cyan-700 text-cyan-300'
              }`}
            >
              {isExceeded ? (
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              ) : (
                <Cpu className="w-5 h-5 text-cyan-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                {isExceeded
                  ? 'Demo Quota Limit Reached'
                  : isAuthorized
                  ? 'Host Access Authorized'
                  : 'Instance Quota & Demo Protection'}
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                    isExceeded
                      ? 'bg-rose-950 text-rose-300 border-rose-800'
                      : isAuthorized
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                  }`}
                >
                  {isAuthorized
                    ? 'Authorized'
                    : isExceeded
                    ? 'Demo Limit Reached'
                    : `Demo: ${demoStatus?.demoUsed ?? 0}/${demoStatus?.demoLimit ?? 3} Used`}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {demoStatus?.ip ? `Client IP: ${demoStatus.ip} · ` : ''}
                Free Tier Gemini API Quota Protection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {reason && (
            <div className="p-3 rounded-xl border border-rose-800/60 bg-rose-950/30 text-rose-200 text-xs font-mono">
              {reason}
            </div>
          )}

          <div className="text-xs text-slate-300 leading-relaxed">
            This shared deployment runs on the app creator&apos;s personal Google AI Studio free tier quota.
            To prevent unexpected quota exhaustion from public visitors, each IP address receives a
            one-time demo allowance for AI synthesis and chat calls.
          </div>

          {/* Quickest: the visitor's own Gemini key, on this page */}
          <OwnKeyPanel onChanged={onStatusUpdated} />

          {/* Option A: Deploy your own on AI Studio */}
          <div className="p-5 rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-indigo-950/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Option 1 · 100% Free Forever · No Credit Card Required
                </span>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 mt-0.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Get Your Free Gemini API Key & Deploy on AI Studio
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
                >
                  <span>Get Free API Key</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Google provides every Google account with a <strong>free Gemini API quota</strong> (up to <strong>1,500 free requests per day</strong> for Flash models with no credit card required). You can deploy your own private copy of AetherShell on Google AI Studio in under a minute.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>1,500 free requests/day (Flash)</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Zero cost & no credit card needed</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Private run ledger & sessions</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Direct 1-click Google sign-in</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-cyan-900/30 text-[11px] text-slate-400">
              <span>Direct Link: <code className="text-cyan-300">aistudio.google.com/app/apikey</code></span>
              <a
                href="https://aistudio.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline"
              >
                <span>Google AI Studio Home</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Option B: Enter Host Access Token */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Option 2 · Host Access Token
              </span>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 mt-0.5">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                Unlock with Host Access Token
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                If you are the instance host or received an access token (<code>AETHERSHELL_ACCESS_TOKEN</code>),
                enter it here to bypass demo limits.
              </p>
            </div>

            <form onSubmit={handleSaveToken} className="space-y-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Enter host access token..."
                  className="w-full pl-9 pr-24 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
                <button
                  type="submit"
                  disabled={isVerifying || !tokenInput.trim()}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Unlock</span>
                  )}
                </button>
              </div>

              {verifyMessage && (
                <div
                  className={`text-xs font-mono p-2.5 rounded-lg border flex items-center gap-2 ${
                    verifyMessage.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-700/60 text-rose-300'
                  }`}
                >
                  {verifyMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{verifyMessage.text}</span>
                </div>
              )}

              {isAuthorized && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Authorized for unrestricted queries on this host
                  </span>
                  <button
                    type="button"
                    onClick={handleClearToken}
                    className="text-[11px] font-mono text-slate-400 hover:text-rose-400 underline transition-colors"
                  >
                    Clear Token
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Read-only playlists, transcripts & proofs remain freely accessible.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
