import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface LazyRouteBoundaryProps {
  children: ReactNode
  label: string
}

type ChunkErrorBoundaryProps = LazyRouteBoundaryProps

interface ChunkErrorBoundaryState {
  error: Error | null
}

class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Failed to load route chunk', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
    return (
      <main className="vf-route-state" role="alert" aria-labelledby="vf-route-error-title">
        <div className="vf-route-state__card vf-route-state__card--error">
          <span className="vf-route-state__eyebrow">Unable to open {this.props.label}</span>
          <h1 id="vf-route-error-title">This part of VoltForge could not be loaded.</h1>
          <p>
            {isOffline
              ? 'You appear to be offline. Reconnect, then retry this page.'
              : 'The application may have been updated while this tab was open. Reload to use the latest files.'}
          </p>
          <div className="vf-route-state__actions">
            <button className="vf-button vf-button--md vf-button--primary" type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
            <a className="vf-button vf-button--md vf-button--secondary" href="/">
              Go to home
            </a>
          </div>
        </div>
      </main>
    )
  }
}

function RouteLoading({ label }: { label: string }) {
  return (
    <main className="vf-route-state" aria-busy="true" aria-live="polite">
      <div className="vf-route-state__card" role="status">
        <span className="vf-route-state__spinner" aria-hidden="true" />
        <span>Loading {label}…</span>
      </div>
    </main>
  )
}

export function LazyRouteBoundary({ children, label }: LazyRouteBoundaryProps) {
  const location = useLocation()
  const resetKey = `${location.pathname}${location.search}`

  return (
    <ChunkErrorBoundary key={resetKey} label={label}>
      <Suspense fallback={<RouteLoading label={label} />}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}
