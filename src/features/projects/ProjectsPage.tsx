import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { EmptyState, ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { ProjectSummaryCard } from '../../components/product'
import { Button, TextInput, SelectField } from '../../components/ui'
import { useToastStore } from '../../store/useToastStore'

export function ProjectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('recent')
  const [visibility, setVisibility] = useState('all')
  const { t } = useTranslation()

  const projectsQuery = useQuery({
    queryFn: () => projectApi.getUserProjects(page, 24).then((res) => res.data.data),
    queryKey: ['projects', 'mine', page],
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

  const projects = projectsQuery.data?.content
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const projectList = projects ?? []
    return projectList.filter(project => visibility === 'all' || project.isPublic === (visibility === 'public'))
      .filter(project => !term || [project.name, project.description, project.boardType, project.tags].filter(Boolean).join(' ').toLowerCase().includes(term))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }, [projects, query, visibility, sort])

  return (
    <>
      <Topbar eyebrow={t("My Projects")} title={t("Projects")} />
      <section className="page-toolbar">
        <TextInput aria-label={t('Filter projects on this page')} leftSlot={<Search size={16} />} onChange={(event) => setQuery(event.target.value)} placeholder={t('Filter projects on this page')} value={query} />
        <SelectField aria-label={t('Project visibility')} value={visibility} onChange={e => setVisibility(e.target.value)}><option value="all">{t('All visibility')}</option><option value="private">{t('Private')}</option><option value="public">{t('Public')}</option></SelectField>
        <SelectField aria-label={t('Sort current page')} value={sort} onChange={e => setSort(e.target.value)}><option value="recent">{t('Recently edited')}</option><option value="name">{t('Name A–Z')}</option></SelectField>
        <Button icon={<Plus size={16} />} onClick={() => navigate('/projects/new')} variant="primary">
          {t("New project")}
        </Button>
      </section>

      {projectsQuery.isLoading ? <LoadingState label={t("Loading projects")} /> : null}
      {projectsQuery.isError ? <ErrorState label={t("Projects API offline")} onRetry={() => void projectsQuery.refetch()} /> : null}
      {!projectsQuery.isLoading && !projectsQuery.isError && filtered.length === 0 ? (
        <EmptyState
          action={query || visibility !== 'all' ? <Button onClick={() => { setQuery(''); setVisibility('all') }}>{t('Clear filters')}</Button> : <Button onClick={() => navigate('/projects/new')} variant="primary">{t('Create project')}</Button>}
          label={t("No projects found")}
          text={t("Create a new circuit project or clear the search filter.")}
        />
      ) : null}
      {projectsQuery.isSuccess && <div className="vf-pagination"><span>{projectsQuery.data.totalElements} {t('projects')} · {t('Page')} {page + 1} / {Math.max(1, projectsQuery.data.totalPages)}</span><div><Button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Previous')}</Button><Button disabled={projectsQuery.data.last} onClick={() => setPage(page + 1)}>{t('Next')}</Button></div></div>}
      {filtered.length > 0 ? (
        <section className="project-grid">
          {filtered.map((project) => (
            <ProjectSummaryCard
              key={project.id}
              onOpen={() => navigate(`/editor/${project.id}`)}
              onDelete={(id) => deleteMutation.mutate(id)}
              project={project}
            />
          ))}
        </section>
      ) : null}
    </>
  )
}
