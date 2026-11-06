import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Global ErrorBoundary — a render crash never blank-screens the app.
 * Every async call in the app is separately wrapped; this is the last line.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, count: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-900">
          <div className="mb-4 rounded-2xl bg-rose-100 p-4 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
            <AlertTriangle size={32} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Something broke — nothing lost.</h1>
          <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Your tokens, queues and settings are safe in local storage. Reload to continue.
          </p>
          <pre className="mt-4 max-w-lg overflow-auto rounded-xl bg-slate-100 p-3 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => {
              this.setState((s) => ({ count: s.count + 1, error: null }));
              window.location.reload();
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reload Q-Mate
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
