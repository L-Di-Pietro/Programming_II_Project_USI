import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Unhandled render error:", error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="px-10 py-12">
        <div className="card border-accent-red max-w-[640px]">
          <div className="font-mono text-[10px] uppercase tracking-widest text-accent-red mb-2">
            Something went wrong
          </div>
          <h2 className="text-ink-primary mb-3">The page hit an unexpected error</h2>
          <p className="text-ink-muted text-sm mb-3 break-words">
            {error.message || "Unknown error"}
          </p>
          <p className="text-[12px] text-ink-muted mb-5">
            This is usually a UI glitch, not a problem with your data. You can retry
            this page or head back to the Dashboard.
          </p>
          <div className="flex gap-2">
            <button onClick={this.reset} className="btn-secondary text-xs">
              Try again
            </button>
            <Link to="/" onClick={this.reset} className="btn-primary text-xs">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
