import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Button, TextInput } from '../../components/ui'
import type { ProjectSummary } from '../../types/domain'

export interface RenameProjectModalProps {
  isOpen: boolean
  project: ProjectSummary | null
  onClose: () => void
  onRename: (project: ProjectSummary, newName: string) => Promise<void> | void
}

export function RenameProjectModal({ isOpen, project, onClose, onRename }: RenameProjectModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (project) {
      setName(project.name)
      setError(null)
    }
  }, [project, isOpen])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!project) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('Project name cannot be empty'))
      return
    }
    if (trimmed === project.name) {
      onClose()
      return
    }
    try {
      setSubmitting(true)
      await onRename(project, trimmed)
      onClose()
    } catch {
      setError(t('Failed to rename project. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Rename Project')}
      size="sm"
      footer={
        <>
          <Button disabled={submitting} onClick={onClose} variant="secondary">
            {t('Cancel')}
          </Button>
          <Button
            disabled={submitting || !name.trim() || name.trim() === project?.name}
            onClick={() => void handleSubmit()}
            variant="primary"
          >
            {submitting ? t('Renaming…') : t('Save')}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <p className="vf-muted" style={{ marginBottom: 12, fontSize: '0.875rem' }}>
          {t('Enter a new name for this project.')}
        </p>
        <TextInput
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
          placeholder={t('Project name')}
          aria-label={t('Project name')}
        />
        {error && (
          <p style={{ color: 'var(--vf-error)', fontSize: '0.8rem', marginTop: 6 }}>
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
