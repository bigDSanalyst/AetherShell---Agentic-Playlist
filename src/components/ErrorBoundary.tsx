import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, Terminal, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AetherShell ErrorBoundary Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Component Execution Fault Intercepted';
      const errorMessage = this.state.error?.message || 'An unexpected runtime error occurred.';
      const componentStack = this.state.errorInfo?.componentStack;

      return (
        <div className="p-6 my-4 rounded-2xl border border-rose-800/80 bg-gradient-to-br from-slate-950 via-rose-950/20 to-slate-950 text-slate-200 shadow-2xl shadow-rose-950/30 font-sans">
          <div className="flex items-start gap-4">
            <span className="p-3 rounded-2xl bg-rose-950 border border-rose-700/80 text-rose-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </span>

            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-2 font-mono text-xs text-rose-400 font-bold uppercase">
                  <span>Phase Membrane Quarantine</span>
                  <span className="text-slate-600">•</span>
                  <span>Safety Guard Activated</span>
                </div>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">{title}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  The phase boundary successfully isolated this error to protect the session state and prevented system-wide crash.
                </p>
              </div>

              {/* Error Message Box */}
              <div className="p-3 rounded-xl bg-slate-950 border border-rose-900/60 font-mono text-xs text-rose-300">
                <span className="text-slate-500 font-bold block mb-1">Exception Details:</span>
                {errorMessage}
              </div>

              {/* Component Stack Trace (Collapsible) */}
              {componentStack && (
                <details className="text-xs font-mono text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-200 transition-colors py-1 flex items-center gap-1.5 select-none">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>View Isolated Component Stack</span>
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                    {componentStack}
                  </pre>
                </details>
              )}

              {/* Recovery Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={this.handleReset}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition-all flex items-center gap-2 shadow-md shadow-rose-600/20 active:scale-98"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Recover & Re-render View</span>
                </button>

                <button
                  onClick={this.handleReload}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Session</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
