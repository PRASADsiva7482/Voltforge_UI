import { useTranslation } from 'react-i18next'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { Button, Card } from '../ui'

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <Card className="api-state">
      <LoaderCircle className="vf-spin" size={24} />
      <strong>{label ? t(label) : t('Loading')}</strong>
    </Card>
  )
}

export function ErrorState({ label, onRetry }: { label?: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="api-state">
      <AlertTriangle size={24} />
      <strong>{label ? t(label) : t('Unable to load data')}</strong>
      <p className="vf-muted">{t('Check that the VoltForge backend is running.')}</p>
      {onRetry ? <Button onClick={onRetry}>{t('Retry')}</Button> : null}
    </Card>
  )
}

export function EmptyState({ action, label, text }: { action?: React.ReactNode; label: string; text: string }) {
  const { t } = useTranslation()
  return (
    <Card className="api-state">
      <strong>{t(label)}</strong>
      <p className="vf-muted">{t(text)}</p>
      {action}
    </Card>
  )
}
