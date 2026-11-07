// ==========================================
// FILE: frontend/src/components/ErrorBoundary.tsx
// PURPOSE: Shows a friendly screen instead of a white page when something in the app crashes.
// ==========================================
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { reportError } from "../lib/reportError";

interface State {
  failed: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError("render", error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    // Plain elements only: if the router or the theme is what broke, this screen must still work.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl font-extrabold text-fg">Something went wrong</h1>
        <p className="mt-3 max-w-md text-sm text-muted">
          The page hit an unexpected problem. We have been told about it. Reloading usually fixes it, and your account and tickets are safe.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-lg bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Reload the page
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-lg border border-line px-6 text-sm font-semibold text-fg transition-colors hover:border-gold hover:text-gold"
          >
            Go to the home page
          </a>
        </div>
      </div>
    );
  }
}
// ==========================================
// END OF FILE: frontend/src/components/ErrorBoundary.tsx
// ==========================================