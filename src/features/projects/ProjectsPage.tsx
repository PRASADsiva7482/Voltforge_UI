import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { EmptyState, ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { ProjectSummaryCard } from '../../components/product'
import { Button, TextInput, SelectField } from '../../components/ui'
import { useToastStore } from '../../store/useToastStore'
import { RenameProjectModal } from './RenameProjectModal'
import type { ProjectSummary } from '../../types/domain'

export function ProjectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('query') || ''
  const [query, setQuery] = useState(urlQuery)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('recent')
  const [visibility, setVisibility] = useState('all')
  const [renameProject, setRenameProject] = useState<ProjectSummary | null>(null)
  const { t } = useTranslation()

  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('vf-archived-projects')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  const persistArchived = (next: Set<string>) => {
    setArchivedIds(next)
    try {
      localStorage.setItem('vf-archived-projects', JSON.stringify(Array.from(next)))
    } catch {
      // ignore local storage errors
    }
  }

  useEffect(() => {
    setQuery(urlQuery)
  }, [urlQuery])

  const isPublicParam = visibility === 'public' ? true : visibility === 'private' ? false : undefined

  const projectsQuery = useQuery({
    queryFn: () => projectApi.getUserProjects(page, 24, {
      isPublic: isPublicParam,
      query: query.trim() || undefined,
      sort,
    }).then((res) => res.data.data),
    queryKey: ['projects', 'mine', page, query.trim(), visibility, sort],
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      useToastStore.getState().addToast(t('Project deleted'), 'success')
      if (projectsQuery.data?.content.length === 1 && page > 0) setPage(page - 1)
    },
    onError: () => useToastStore.getState().addToast(t('Could not delete the project. Please try again.'), 'error'),
  })

  const duplicateMutation = useMutation({
    mutationFn: async (project: ProjectSummary) => {
      const fullRes = await projectApi.getById(project.id)
      const full = fullRes.data.data
      const newName = `${project.name} (Copy)`
      const createRes = await projectApi.create({
        name: newName,
        boardType: full.boardType,
        description: full.description,
        canvasLayout: full.canvasLayout as Record<string, unknown> | undefined,
        componentConfig: full.componentConfig,
        codeFiles: full.codeFiles?.map(({ content, filename, language, sortOrder }) => ({
          content,
          filename,
          language,
          sortOrder,
        })),
        isPublic: false,
        tags: full.tags,
      })
      return createRes.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      useToastStore.getState().addToast(t('Project duplicated successfully'), 'success')
    },
    onError: () => useToastStore.getState().addToast(t('Failed to duplicate project. Please try again.'), 'error'),
  })

  const handleRenameSubmit = async (project: ProjectSummary, newName: string) => {
    const fullRes = await projectApi.getById(project.id)
    const full = fullRes.data.data
    await projectApi.update(project.id, {
      name: newName,
      expectedRevision: full.documentRevision,
    })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    useToastStore.getState().addToast(t('Project renamed'), 'success')
  }

  const handleExportJson = async (project: ProjectSummary) => {
    try {
      const fullRes = await projectApi.getById(project.id)
      const full = fullRes.data.data
      const exportData = {
        app: 'VoltForge',
        formatVersion: '1.0',
        exportedAt: new Date().toISOString(),
        project: full,
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const sanitizedName = project.name.replace(/[^a-zA-Z0-9_\-]/g, '_')
      a.href = url
      a.download = `${sanitizedName || 'project'}.voltforge.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      useToastStore.getState().addToast(t('Project exported as JSON'), 'success')
    } catch {
      useToastStore.getState().addToast(t('Failed to export project JSON'), 'error')
    }
  }

  const handleArchiveToggle = (project: ProjectSummary) => {
    const next = new Set(archivedIds)
    const wasArchived = next.has(project.id)
    if (wasArchived) {
      next.delete(project.id)
      useToastStore.getState().addToast(t('Project restored from archive'), 'success')
    } else {
      next.add(project.id)
      useToastStore.getState().addToast(t('Project archived'), 'info')
    }
    persistArchived(next)
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setPage(0)
    setSearchParams(value.trim() ? { query: value.trim() } : {}, { replace: true })
  }

  const handleVisibilityChange = (value: string) => {
    setVisibility(value)
    setPage(0)
  }

  const handleSortChange = (value: string) => {
    setSort(value)
    setPage(0)
  }

  const rawProjects = projectsQuery.data?.content ?? []
  const projects = rawProjects.filter((p) => {
    const isArch = archivedIds.has(p.id)
    if (visibility === 'archived') return isArch
    return !isArch
  })

  return (
    <>
      <Topbar eyebrow={t("My Projects")} title={t("Projects")} />
      <section className="page-toolbar">
        <TextInput
          aria-label={t('Search my projects')}
          leftSlot={<Search size={16} />}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={t('Search my projects')}
          value={query}
        />
        <SelectField
          aria-label={t('Project visibility')}
          value={visibility}
          onChange={(e) => handleVisibilityChange(e.target.value)}
        >
          <option value="all">{t('All active')}</option>
          <option value="private">{t('Private')}</option>
          <option value="public">{t('Public')}</option>
          <option value="archived">{t('Archived')}</option>
        </SelectField>
        <SelectField
          aria-label={t('Sort projects')}
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
        >
          <option value="recent">{t('Recently edited')}</option>
          <option value="name">{t('Name A–Z')}</option>
        </SelectField>
        <Button icon={<Plus size={16} />} onClick={() => navigate('/projects/new')} variant="primary">
          {t("New project")}
        </Button>
      </section>

      {projectsQuery.isLoading ? <LoadingState label={t("Loading projects")} /> : null}
      {projectsQuery.isError ? <ErrorState label={t("Projects API offline")} onRetry={() => void projectsQuery.refetch()} /> : null}
      {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 ? (
        <EmptyState
          action={query || visibility !== 'all' ? <Button onClick={() => { handleQueryChange(''); setVisibility('all') }}>{t('Clear filters')}</Button> : <Button onClick={() => navigate('/projects/new')} variant="primary">{t('Create project')}</Button>}
          label={visibility === 'archived' ? t("No archived projects") : t("No projects found")}
          text={visibility === 'archived' ? t("Projects you archive will appear here.") : t("Create a new circuit project or clear the search filter.")}
        />
      ) : null}
      {projectsQuery.isSuccess && (
        <div className="vf-pagination">
          <span>{projectsQuery.data.totalElements} {t('projects')} · {t('Page')} {page + 1} / {Math.max(1, projectsQuery.data.totalPages)}</span>
          <div>
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Previous')}</Button>
            <Button disabled={projectsQuery.data.last} onClick={() => setPage(page + 1)}>{t('Next')}</Button>
          </div>
        </div>
      )}
      {projects.length > 0 ? (
        <section className="project-grid">
          {projects.map((project) => (
            <ProjectSummaryCard
              key={project.id}
              onOpen={() => navigate(`/editor/${project.id}`)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onDuplicate={(p) => duplicateMutation.mutate(p)}
              onRename={(p) => setRenameProject(p)}
              onExportJson={handleExportJson}
              onArchiveToggle={handleArchiveToggle}
              isArchived={archivedIds.has(project.id)}
              project={project}
            />
          ))}
        </section>
      ) : null}

      <RenameProjectModal
        isOpen={Boolean(renameProject)}
        project={renameProject}
        onClose={() => setRenameProject(null)}
        onRename={handleRenameSubmit}
      />
    </>
  )
}

