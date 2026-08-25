import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { EmptyState, ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { ProjectSummaryCard } from '../../components/product'
import { TextInput } from '../../components/ui'

export function ExplorePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('query') || '')
  const { t } = useTranslation()

  const publicProjects = useQuery({
    queryFn: () => {
      const term = query.trim()
      return (term ? projectApi.searchPublic(term, 0, 24) : projectApi.getPublic(0, 24)).then((res) => res.data.data)
    },
    queryKey: ['projects', 'public', query.trim()],
  })

  const templates = useQuery({
    queryFn: () => projectApi.getTemplates(0, 8).then((res) => res.data.data),
    queryKey: ['projects', 'templates'],
  })

  const projects = publicProjects.data?.content ?? []
  const templateProjects = templates.data?.content ?? []

  return (
    <>
      <Topbar eyebrow={t("Explore")} title={t("Explore circuits")} />
      <section className="page-toolbar">
        <TextInput leftSlot={<Search size={16} />} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search public circuits")} value={query} />
      </section>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <p className="vf-eyebrow">{t("Templates")}</p>
            <h2>{t("Start faster")}</h2>
          </div>
        </div>
        {templates.isLoading ? <LoadingState label={t("Loading templates")} /> : null}
        {templateProjects.length > 0 ? (
          <div className="project-grid">
            {templateProjects.map((project) => (
              <ProjectSummaryCard key={project.id} onOpen={() => navigate(`/editor/${project.id}`)} project={project} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <p className="vf-eyebrow">{t("Community")}</p>
            <h2>{t("Public projects")}</h2>
          </div>
        </div>
        {publicProjects.isLoading ? <LoadingState label={t("Loading public projects")} /> : null}
        {publicProjects.isError ? <ErrorState label={t("Explore API offline")} onRetry={() => void publicProjects.refetch()} /> : null}
        {!publicProjects.isLoading && !publicProjects.isError && projects.length === 0 ? <EmptyState label={t("Nothing here yet")} text={t("No public projects matched this search.")} /> : null}
        {projects.length > 0 ? (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectSummaryCard key={project.id} onOpen={() => navigate(`/editor/${project.id}`)} project={project} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  )
}
