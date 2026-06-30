import React, { useState } from 'react'
import { Cpu, Eye, GitFork, Lock, MoreHorizontal, Trash2, Unlock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, IconButton, ConfirmDialog } from '../ui'
import type { ProjectSummary } from '../../types/domain'

export type ProjectSummaryCardProps = {
  onOpen?: (project: ProjectSummary) => void
  onDelete?: (id: string) => void
  project: ProjectSummary
}

function boardLabel(boardType: string) {
  return boardType.replaceAll('_', ' ')
}

export function ProjectSummaryCard({ onOpen, onDelete, project }: ProjectSummaryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { t } = useTranslation()

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(!menuOpen)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    setConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    setConfirmOpen(false)
    onDelete?.(project.id)
  }

  return (
    <>
      <Card
        actions={
          onDelete ? (
            <div className="vf-project-card__actions-wrapper" onClick={(e) => e.stopPropagation()}>
              <IconButton
                icon={<MoreHorizontal size={17} />}
                label={t("Actions for project")}
                onClick={handleActionClick}
                size="sm"
              />
              {menuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="vf-project-card__dropdown">
                    <button
                      className="vf-project-card__dropdown-btn"
                      onClick={handleDeleteClick}
                      type="button"
                    >
                      <Trash2 size={14} />
                      {t("Delete project")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : undefined
        }
        className="vf-project-card"
        title={project.name}
      >
        <p className="vf-muted">{project.description || t('No description yet')}</p>
        <div className="vf-project-card__meta">
          <span>
            <Cpu size={15} />
            {boardLabel(project.boardType)}
          </span>
          <span>
            <GitFork size={15} />
            {project.forkCount}
          </span>
          <span>
            <Eye size={15} />
            {project.viewCount}
          </span>
        </div>
        <div className="vf-project-card__footer">
          <Badge dot tone={project.isPublic ? 'success' : 'neutral'}>
            {project.isPublic ? <Unlock size={13} /> : <Lock size={13} />}
            {project.isPublic ? t('Public') : t('Private')}
          </Badge>
          <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
        <Button onClick={() => onOpen?.(project)} size="sm" variant="ghost">
          {t("Open project")}
        </Button>
      </Card>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t("Delete Project")}
        message={t("Are you sure you want to delete this project? This action cannot be undone.")}
        confirmLabel={t("Yes, Delete")}
        cancelLabel={t("No, Keep It")}
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}
