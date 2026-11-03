import React, { useEffect, useRef, useState } from 'react'
import { Archive, Copy, Cpu, Download, Edit2, Eye, GitFork, Lock, MoreHorizontal, Trash2, Unlock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, IconButton, ConfirmDialog } from '../ui'
import type { ProjectSummary } from '../../types/domain'
import { getBoardProfile } from '../../features/canvas/boardCatalog'

export type ProjectSummaryCardProps = {
  onOpen?: (project: ProjectSummary) => void
  onDelete?: (id: string) => void
  onDuplicate?: (project: ProjectSummary) => void
  onRename?: (project: ProjectSummary) => void
  onExportJson?: (project: ProjectSummary) => void
  onArchiveToggle?: (project: ProjectSummary) => void
  isArchived?: boolean
  project: ProjectSummary
}

function boardLabel(boardType: string) {
  return getBoardProfile(boardType)?.name ?? boardType?.replaceAll('_', ' ') ?? 'Board not specified'
}

export function ProjectSummaryCard({
  onOpen,
  onDelete,
  onDuplicate,
  onRename,
  onExportJson,
  onArchiveToggle,
  isArchived,
  project,
}: ProjectSummaryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { t } = useTranslation()
  const actionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (menuOpen) actionsRef.current?.querySelector<HTMLButtonElement>('.vf-project-card__dropdown-btn')?.focus()
  }, [menuOpen])

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
  const closeConfirmation = () => {
    setConfirmOpen(false)
    requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
  }

  const hasActions = Boolean(onDelete || onDuplicate || onRename || onExportJson || onArchiveToggle)

  return (
    <>
      <Card
        actions={
          hasActions ? (
            <div ref={actionsRef} className="vf-project-card__actions-wrapper" onClick={(e) => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') { setMenuOpen(false); actionsRef.current?.querySelector('button')?.focus() } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false) }}>
              <IconButton
                icon={<MoreHorizontal size={17} />}
                label={t("Actions for project")}
                onClick={handleActionClick}
                aria-expanded={menuOpen}
                size="sm"
              />
              {menuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="vf-project-card__dropdown">
                    {onDuplicate && (
                      <button
                        className="vf-project-card__dropdown-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                          onDuplicate(project)
                        }}
                        type="button"
                      >
                        <Copy size={14} />
                        {t("Duplicate project")}
                      </button>
                    )}
                    {onRename && (
                      <button
                        className="vf-project-card__dropdown-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                          onRename(project)
                        }}
                        type="button"
                      >
                        <Edit2 size={14} />
                        {t("Rename project")}
                      </button>
                    )}
                    {onExportJson && (
                      <button
                        className="vf-project-card__dropdown-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                          onExportJson(project)
                        }}
                        type="button"
                      >
                        <Download size={14} />
                        {t("Export JSON")}
                      </button>
                    )}
                    {onArchiveToggle && (
                      <button
                        className="vf-project-card__dropdown-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                          onArchiveToggle(project)
                        }}
                        type="button"
                      >
                        <Archive size={14} />
                        {isArchived ? t("Restore project") : t("Archive project")}
                      </button>
                    )}
                    {onDelete && (
                      <>
                        <div className="vf-project-card__dropdown-divider" />
                        <button
                          className="vf-project-card__dropdown-btn vf-project-card__dropdown-btn--danger"
                          onClick={handleDeleteClick}
                          type="button"
                        >
                          <Trash2 size={14} />
                          {t("Delete project")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : undefined
        }
        className={`vf-project-card${isArchived ? ' vf-project-card--archived' : ''}`}
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
          {isArchived && (
            <Badge tone="warning">
              <Archive size={13} />
              {t('Archived')}
            </Badge>
          )}
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
        onClose={closeConfirmation}
      />
    </>
  )
}

