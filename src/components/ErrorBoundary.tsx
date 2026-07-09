// Version: 1.0.0 | 2026-07-09
// ErrorBoundary — top-level React error boundary with a polished fallback.
//
// Catches render-time errors anywhere in its child subtree and shows a
// centered recovery UI. The optional `onReset` callback lets the host app
// perform its own cleanup (e.g. resetting global state) before the boundary
// re-renders its children; we also clear our internal error state so the
// subtree gets a fresh mount rather than re-throwing the same error.

import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  /** Notified when the user clicks Reload, before children are re-mounted. */
  onReset?: () => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Verbose logging per project guidelines: ISO 8601 timestamp + error +
    // component stack, so post-mortem debugging doesn't require a repro.
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.error(
      `[Plotline][${ts}] Uncaught render error in <ErrorBoundary>:`,
      error,
      "\nComponent stack:",
      info.componentStack
    );
  }

  private handleReset = (): void => {
    // Host cleanup first (may reset upstream state the children depend on),
    // then clear the boundary so the subtree re-mounts fresh.
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const message =
      this.state.error?.message ?? "No error message was provided.";

    return (
      <div className={styles.wrapper}>
        <div className={styles.card} role="alert">
          <div className={styles.glyph} aria-hidden="true">
            ⚠
          </div>
          <h1 className={styles.heading}>Something went wrong</h1>
          <pre className={styles.message}>{message}</pre>
          <button
            className={styles.reload}
            onClick={this.handleReset}
            type="button"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
