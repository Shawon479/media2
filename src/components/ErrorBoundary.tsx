import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('StreamPulse UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/70 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-neutral-400">
            The interface hit an unexpected error. Your downloads and data are unaffected.
          </p>
          {this.state.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-left text-[11px] text-neutral-500">
              {this.state.message}
            </pre>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400"
            >
              <RefreshCw className="h-4 w-4" /> Reload app
            </button>
            <button
              onClick={() => {
                window.location.hash = '#/home';
                this.setState({ hasError: false, message: '' });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-700"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
