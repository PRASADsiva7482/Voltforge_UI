import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Modal } from './Modal'
export type ConfirmDialogProps = {
  isOpen: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string
  onConfirm: () => void; onClose: () => void
}
export function ConfirmDialog({ isOpen, title, message, confirmLabel, cancelLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return <Modal isOpen={isOpen} onClose={onClose} title={t(title)} size="sm" footer={<>
    <Button onClick={onClose} variant="secondary">{cancelLabel || t('Cancel')}</Button>
    <Button onClick={onConfirm} variant="danger">{confirmLabel || t('Confirm')}</Button>
  </>}><p>{t(message)}</p></Modal>
}
