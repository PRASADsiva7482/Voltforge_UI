import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { EmptyState, ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { ProjectSummaryCard } from '../../components/product'
import { Button, TextInput } from '../../components/ui'

export function ProjectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const { t } = useTranslation()

  const projectsQuery = useQuery({
    queryFn: () => projectApi.getUserProjects(0, 24).then((res) => res.data.data),
    queryKey: ['projects', 'mine'],
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const projects = projectsQuery.data?.content ?? []
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return projects
    return projects.filter((project) => [project.name, project.description, project.boardType, project.tags].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [projects, query])

  return (
    <>
      <Topbar eyebrow={t("My Projects")} title={t("Projects")} />
      <section className="page-toolbar">
        <TextInput leftSlot={<Search size={16} />} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search your projects")} value={query} />
        <Button icon={<Plus size={16} />} onClick={() => navigate('/projects/new')} variant="primary">
          {t("New project")}
        </Button>
      </section>

      {projectsQuery.isLoading ? <LoadingState label={t("Loading projects")} /> : null}
      {projectsQuery.isError ? <ErrorState label={t("Projects API offline")} onRetry={() => void projectsQuery.refetch()} /> : null}
      {!projectsQuery.isLoading && !projectsQuery.isError && filtered.length === 0 ? (
        <EmptyState
          action={<Button onClick={() => navigate('/projects/new')} variant="primary">{t("Create project")}</Button>}
          label={t("No projects found")}
          text={t("Create a new circuit project or clear the search filter.")}
        />
      ) : null}
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
