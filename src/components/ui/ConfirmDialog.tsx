import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

export type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  if (!isOpen) return null

  const resolvedConfirmLabel = confirmLabel || t('Yes')
  const resolvedCancelLabel = cancelLabel || t('No')

  return (
    <div className="vf-modal-overlay" onClick={onClose}>
      <div className="vf-modal" onClick={(e) => e.stopPropagation()}>
        <header className="vf-modal__header">
          <h3>{t(title)}</h3>
          <button className="vf-modal__close-btn" onClick={onClose} aria-label={t("Close dialog")}>
            <X size={16} />
          </button>
        </header>
        <div className="vf-modal__body">
          <p>{t(message)}</p>
        </div>
        <footer className="vf-modal__footer">
          <Button onClick={onClose} variant="ghost" size="sm">
            {t(resolvedCancelLabel)}
          </Button>
          <Button onClick={onConfirm} variant="danger" size="sm">
            {t(resolvedConfirmLabel)}
          </Button>
        </footer>
      </div>
    </div>
  )
}
