import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button, Card } from '../ui'
import { Skeleton } from '../ui/Skeleton'

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <Card className="api-state">
      <strong role="status">{label ? t(label) : t('Loading')}</strong>
      <Skeleton height={16} width="65%" />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="45%" />
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
