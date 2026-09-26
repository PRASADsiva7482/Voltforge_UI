import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { Button, Card } from '../ui'

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Card className="api-state">
      <LoaderCircle className="vf-spin" size={24} />
      <strong>{label}</strong>
    </Card>
  )
}

export function ErrorState({ label = 'Unable to load data', onRetry }: { label?: string; onRetry?: () => void }) {
  return (
    <Card className="api-state">
      <AlertTriangle size={24} />
      <strong>{label}</strong>
      <p className="vf-muted">Check that the VoltForge backend is running.</p>
      {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
    </Card>
  )
}

export function EmptyState({ action, label, text }: { action?: React.ReactNode; label: string; text: string }) {
  return (
    <Card className="api-state">
      <strong>{label}</strong>
      <p className="vf-muted">{text}</p>
      {action}
    </Card>
  )
}
