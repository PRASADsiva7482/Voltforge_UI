import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import i18n from '../../i18n'

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
          <span className="vf-route-state__eyebrow">{i18n.t('Unable to open')} {this.props.label}</span>
          <h1 id="vf-route-error-title">{i18n.t('This part of VoltForge could not be loaded.')}</h1>
          <p>
            {isOffline
              ? i18n.t('You appear to be offline. Reconnect, then retry this page.')
              : i18n.t('The application may have been updated while this tab was open. Reload to use the latest files.')}
          </p>
          <div className="vf-route-state__actions">
            <button className="vf-button vf-button--md vf-button--primary" type="button" onClick={() => window.location.reload()}>
              {i18n.t('Retry')}
            </button>
            <a className="vf-button vf-button--md vf-button--secondary" href="/">
              {i18n.t('Go to home')}
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
        <span>{i18n.t('Loading {{label}}…', { label, defaultValue: `Loading ${label}…` })}</span>
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
