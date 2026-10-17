import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { EmptyState, ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { ProjectSummaryCard } from '../../components/product'
import { Button, TextInput } from '../../components/ui'

export function ExplorePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('query') || '')
  const [term, setTerm] = useState(query)
  const [page, setPage] = useState(0)
  useEffect(() => { setQuery(searchParams.get('query') || ''); setPage(0) }, [searchParams])
  useEffect(() => { const timer = setTimeout(() => { setTerm(query.trim()); setPage(0) }, 250); return () => clearTimeout(timer) }, [query])
  const { t } = useTranslation()

  const publicProjects = useQuery({
    queryFn: () => {
      return (term ? projectApi.searchPublic(term, page, 24) : projectApi.getPublic(page, 24)).then((res) => res.data.data)
    },
    queryKey: ['projects', 'public', term, page],
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
        <TextInput aria-label={t('Search public circuits')} leftSlot={<Search size={16} />} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search public circuits")} value={query} />
        {query && <Button onClick={() => setQuery('')}>{t('Clear search')}</Button>}
      </section>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <p className="vf-eyebrow">{t("Templates")}</p>
            <h2>{t("Start faster")}</h2>
          </div>
        </div>
        {templates.isLoading ? <LoadingState label={t("Loading templates")} /> : null}
        {templates.isError && <ErrorState label={t('Could not load templates')} onRetry={() => void templates.refetch()} />}
        {templates.isSuccess && !templateProjects.length && <EmptyState label={t('No published templates yet')} text={t('Try a guided lab or start with your own circuit.')} action={<Button onClick={() => navigate('/labs')}>{t('Browse labs')}</Button>} />}
        {templateProjects.length > 0 ? (
          <div className="project-grid">
            {templateProjects.map((project) => (
              <ProjectSummaryCard key={project.id} onOpen={() => navigate(`/public-project/${project.id}`)} project={project} />
            ))}
          </div>
        ) : null}
      </section>
      {publicProjects.isSuccess && <div className="vf-pagination"><span>{publicProjects.data.totalElements} {t('results')} · {t('Page')} {page + 1}</span><div><Button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Previous')}</Button><Button disabled={publicProjects.data.last} onClick={() => setPage(page + 1)}>{t('Next')}</Button></div></div>}

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
              <ProjectSummaryCard key={project.id} onOpen={() => navigate(`/public-project/${project.id}`)} project={project} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  )
}
