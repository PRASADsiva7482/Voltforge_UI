import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary wrapping the canvas Stage so that a rendering error
 * in a single component node doesn't crash the entire application.
 */
export default class CanvasErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CanvasErrorBoundary] Render error caught:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center w-full h-full bg-surface-50 dark:bg-surface-950">
          <div className="text-center px-6 py-10 max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-surface-950 dark:text-white mb-2">
              Canvas Rendering Error
            </h2>
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-1">
              Something went wrong while rendering the circuit canvas.
            </p>
            {this.state.error && (
              <p className="text-xs text-red-500/80 font-mono mb-6 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReload}
              className="vf-btn vf-btn-primary shadow-[0_0_18px_rgba(34,197,94,0.25)]"
            >
              Reload Canvas
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
