import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Compass, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { projectApi } from '../../api/services'
import { Topbar } from '../../components/layout'
import { ActionCard } from '../../components/dashboard'
import { ProjectSummaryCard } from '../../components/product'
import { Button, MetricCard } from '../../components/ui'

export function DashboardPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  // Fetch real projects from the backend API
  const projectsQuery = useQuery({
    queryFn: () => projectApi.getUserProjects(0, 8).then((res) => res.data.data),
    queryKey: ['projects', 'mine', 'recent'],
  })

  const projects = projectsQuery.data?.content ?? []
  const totalCount = projectsQuery.data?.totalElements ?? projects.length

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <>
      <Topbar eyebrow={t("Dashboard")} title={`${t("Welcome back")}, ${auth.user?.displayName ?? t("Builder")}`} />

      {/* Real Project Metrics */}
      <section className="metrics-grid" id="overview">
        <MetricCard label={t("Your Projects")} value={String(totalCount)} />
        <MetricCard label={t("Active Workspace")} value="V2 Rebuild" />
        <MetricCard label={t("System Status")} value={t("Online")} />
      </section>

      {/* Quick Action Links */}
      <section className="quick-actions">
        <ActionCard
          icon={Plus}
          label={t("New project")}
          onClick={() => navigate('/projects/new')}
          text={t("Create a new schematic and code editor workspace.")}
        />
        <ActionCard
          icon={Compass}
          label={t("Explore templates")}
          onClick={() => navigate('/explore')}
          text={t("Browse and fork community schematics.")}
        />
      </section>

      {/* Real Projects List */}
      <section className="content-band" style={{ marginTop: '2rem' }}>
        <div className="section-heading" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="vf-eyebrow">{t("Workspace")}</p>
            <h2>{t("Recent projects")}</h2>
          </div>
          {projects.length > 0 && (
            <Button onClick={() => navigate('/projects')} variant="ghost">
              {t("View all")} ({totalCount})
            </Button>
          )}
        </div>

        {projectsQuery.isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '2rem 0', color: 'var(--vf-text-muted)' }}>
            <Loader2 size={20} className="vf-spin" />
            <span>{t("Loading projects...")}</span>
          </div>
        ) : projectsQuery.isError ? (
          <div style={{ padding: '2rem', background: 'var(--vf-surface-raised)', borderRadius: '8px', border: '1px solid var(--vf-border)' }}>
            <p style={{ color: 'var(--vf-red)', fontWeight: 500, margin: 0 }}>{t("Projects API is offline")}</p>
            <p style={{ color: 'var(--vf-text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: '12px' }}>
              {t("Check your backend Voltforge services and try again.")}
            </p>
            <Button size="sm" onClick={() => void projectsQuery.refetch()}>{t("Retry")}</Button>
          </div>
        ) : projects.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--vf-surface)', borderRadius: '8px', border: '1px dashed var(--vf-border)' }}>
            <p style={{ fontWeight: 500, margin: 0 }}>{t("No projects found")}</p>
            <p style={{ color: 'var(--vf-text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: '1.5rem' }}>
              {t("You haven't created any circuit projects yet. Let's build something new!")}
            </p>
            <Button icon={<Plus size={16} />} onClick={() => navigate('/projects/new')} variant="primary">
              {t("Create your first project")}
            </Button>
          </div>
        ) : (
          <div className="project-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {projects.map((project) => (
              <ProjectSummaryCard
                key={project.id}
                onOpen={() => navigate(`/editor/${project.id}`)}
                onDelete={(id) => deleteMutation.mutate(id)}
                project={project}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
