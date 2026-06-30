import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../../api/services'
import { useAuth } from '../../auth/useAuth'
import { ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { Box, MetricCard } from '../../components/ui'

export function AdminPage() {
  const auth = useAuth()
  const { t } = useTranslation()
  const stats = useQuery({
    enabled: auth.user?.role === 'ADMIN',
    queryFn: () => adminApi.getDashboardStats().then((res) => res.data.data),
    queryKey: ['admin', 'stats'],
  })

  if (auth.user?.role !== 'ADMIN') {
    return (
      <>
        <Topbar eyebrow={t("Admin")} title={t("Admin")} />
        <Box className="access-panel" tone="raised">
          <ShieldAlert size={32} />
          <h2>{t("Admin access required")}</h2>
          <p className="vf-muted">{t("Your account roles do not include administrator privileges.")}</p>
        </Box>
      </>
    )
  }

  return (
    <>
      <Topbar eyebrow={t("Admin")} title={t("Admin dashboard")} />
      {stats.isLoading ? <LoadingState label={t("Loading admin stats")} /> : null}
      {stats.isError ? <ErrorState label={t("Admin API offline")} onRetry={() => void stats.refetch()} /> : null}
      {stats.data ? (
        <>
          <section className="metrics-grid">
            <MetricCard label={t("Total users")} trend="up" value={String(stats.data.totalUsers)} />
            <MetricCard label={t("Active users")} trend="up" value={String(stats.data.activeUsers)} />
            <MetricCard label={t("Total projects")} value={String(stats.data.totalProjects)} />
            <MetricCard label={t("Public projects")} trend="up" value={String(stats.data.publicProjects)} />
          </section>
          <Box tone="raised">
            <div className="section-heading">
              <div>
                <p className="vf-eyebrow">{t("Roles")}</p>
                <h2>{t("Role breakdown")}</h2>
              </div>
              <Users size={24} />
            </div>
            <div className="role-grid">
              {Object.entries(stats.data.roleBreakdown).map(([role, count]) => (
                <span key={role}>
                  <strong>{role}</strong>
                  {count}
                </span>
              ))}
            </div>
          </Box>
        </>
      ) : null}
    </>
  )
}
