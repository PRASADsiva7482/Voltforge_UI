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
        <div className="vf-canvas-error">
          <div className="vf-canvas-error__body">
            <div className="vf-canvas-error__icon">
              <svg
                width="28"
                height="28"
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
            <h2>Canvas Rendering Error</h2>
            <p>Something went wrong while rendering the circuit canvas.</p>
            {this.state.error && (
              <p className="vf-canvas-error__detail">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReload}
              className="vf-button vf-button--primary"
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
