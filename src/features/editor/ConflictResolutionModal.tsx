import { useState } from 'react'
import { AlertTriangle, Copy, RefreshCw, UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Modal, Button } from '../../components/ui'

export interface ConflictResolutionModalProps {
  isOpen: boolean
  projectName: string
  remoteRevision?: string
  onClose: () => void
  onSaveAsCopy: () => Promise<void> | void
  onOverwrite: () => Promise<void> | void
  onReload: () => Promise<void> | void
}

export function ConflictResolutionModal({
  isOpen,
  projectName,
  remoteRevision,
  onClose,
  onSaveAsCopy,
  onOverwrite,
  onReload,
}: ConflictResolutionModalProps) {
  const { t } = useTranslation()
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const handleAction = async (actionKey: string, handler: () => Promise<void> | void) => {
    try {
      setBusyAction(actionKey)
      await handler()
      onClose()
    } catch {
      // Handlers manage their own toast errors
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle color="#f59e0b" size={20} />
          <span>{t('Multi-Tab Editing Conflict Detected')}</span>
        </div>
      }
      size="md"
      footer={
        <Button disabled={Boolean(busyAction)} onClick={onClose} variant="ghost">
          {t('Keep Editing (Dismiss)')}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0, fontWeight: 500, color: 'var(--vf-text)' }}>
            {t('Project "{{name}}" was modified and saved in another browser tab or session.', { name: projectName })}
          </p>
          <p style={{ margin: '6px 0 0', color: 'var(--vf-text-secondary)', fontSize: '0.8rem' }}>
            {t('Remote Revision')}: {remoteRevision || t('Newer version on server')}
          </p>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--vf-text-secondary)', margin: 0 }}>
          {t('Choose how you would like to resolve this conflict to prevent data loss:')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Option 1: Save as Copy */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--vf-border)',
              background: 'var(--vf-surface)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Copy size={16} color="var(--vf-primary)" />
                <span>{t('Save as New Copy (Recommended)')}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--vf-text-secondary)' }}>
                {t('Saves all your local changes to a new project copy without losing any work.')}
              </p>
            </div>
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void handleAction('copy', onSaveAsCopy)}
              size="sm"
              variant="primary"
            >
              {busyAction === 'copy' ? t('Saving…') : t('Save Copy')}
            </Button>
          </div>

          {/* Option 2: Overwrite Remote */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--vf-border)',
              background: 'var(--vf-surface)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <UploadCloud size={16} color="var(--vf-error)" />
                <span>{t('Force Overwrite Remote')}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--vf-text-secondary)' }}>
                {t('Overwrites the remote version with your current local tab state.')}
              </p>
            </div>
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void handleAction('overwrite', onOverwrite)}
              size="sm"
              variant="danger"
            >
              {busyAction === 'overwrite' ? t('Overwriting…') : t('Overwrite')}
            </Button>
          </div>

          {/* Option 3: Discard & Reload */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--vf-border)',
              background: 'var(--vf-surface)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={16} color="var(--vf-text-secondary)" />
                <span>{t('Reload from Server (Discard Edits)')}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--vf-text-secondary)' }}>
                {t('Discards your unsaved local changes and reloads the latest remote state.')}
              </p>
            </div>
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void handleAction('reload', onReload)}
              size="sm"
              variant="secondary"
            >
              {busyAction === 'reload' ? t('Reloading…') : t('Reload')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
