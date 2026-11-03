import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircuitBoard, Cpu, KeyRound, Settings, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { projectApi, userApi } from '../../api/services'
import { useAuth } from '../../auth/useAuth'
import { ErrorState, LoadingState } from '../../components/data'
import { Topbar } from '../../components/layout'
import { Badge, Button } from '../../components/ui'
import './ProfilePage.css'

export function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>()
  const auth = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const isOwnProfile = !userId || userId === auth.user?.id || userId === auth.user?.keycloakId

  // Fetch profile details
  const profileQuery = useQuery({
    queryKey: ['user', userId || 'me'],
    queryFn: () => {
      if (isOwnProfile) {
        return userApi.getProfile().then((res) => res.data.data)
      }
      return userApi.getUserById(userId!).then((res) => res.data.data)
    },
  })

  const user = profileQuery.data || (isOwnProfile ? auth.user : null)
  const initial = user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'V'

  // Fetch user projects (own private/public, or peer's public projects)
  const projectsQuery = useQuery({
    queryKey: ['user-projects', isOwnProfile ? (auth.user?.id || 'me') : userId, user?.username],
    queryFn: async () => {
      if (isOwnProfile) {
        return projectApi.getUserProjects(0, 50).then((res) => res.data.data)
      }
      // For peer profiles, retrieve public projects and filter by target user
      const publicProjects = await projectApi.getPublic(0, 100).then((res) => res.data.data)
      const targetUserId = userId || user?.id || user?.keycloakId
      const targetUsername = user?.username
      const peerContent = (publicProjects?.content || []).filter((p) => {
        const owner = p.owner
        if (!owner) return false
        if (targetUserId && (owner.id === targetUserId || owner.keycloakId === targetUserId)) return true
        if (targetUsername && owner.username?.toLowerCase() === targetUsername.toLowerCase()) return true
        return false
      })
      return {
        content: peerContent,
        empty: peerContent.length === 0,
        first: true,
        last: true,
        number: 0,
        numberOfElements: peerContent.length,
        size: 50,
        totalElements: peerContent.length,
        totalPages: Math.ceil(peerContent.length / 50) || 1,
      }
    },
    enabled: isOwnProfile || Boolean(userId || user?.username),
  })

  return (
    <>
      <Topbar eyebrow={t("User Profile")} title={user?.displayName || t("Engineer Profile")} />

      {profileQuery.isLoading && <LoadingState label={t("Loading profile...")} />}
      {profileQuery.isError && (
        <ErrorState label={t("Could not load user profile")} onRetry={() => void profileQuery.refetch()} />
      )}

      {user && (
        <div className="vf-profile-page">
          {/* Hero Banner */}
          <div className="vf-profile-hero">
            <div className="vf-profile-banner" />
            <div className="vf-profile-body">
              <div className="vf-profile-avatar-row">
                <div className="vf-profile-avatar-wrapper">
                  <div className="vf-profile-avatar">
                    {initial}
                  </div>
                </div>

                {isOwnProfile && (
                  <div className="vf-profile-actions">
                    <Button
                      icon={<KeyRound size={15} />}
                      onClick={() => navigate('/settings?tab=security')}
                      variant="secondary"
                    >
                      {t("Change Password")}
                    </Button>
                    <Button
                      icon={<Settings size={15} />}
                      onClick={() => navigate('/settings?tab=profile')}
                      variant="primary"
                    >
                      {t("Edit Profile")}
                    </Button>
                  </div>
                )}
              </div>

              <div className="vf-profile-info">
                <h1 className="vf-profile-name">{user.displayName || user.username}</h1>
                <div className="vf-profile-handle">
                  <span>@{user.username || 'volt-user'}</span>
                  {user.email && <span>· {user.email}</span>}
                  <Badge dot tone="success">
                    {user.role || 'ENGINEER'}
                  </Badge>
                </div>
                {user.bio ? (
                  <p className="vf-profile-bio">
                    {user.bio.replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s{2,}/g, ' ')}
                  </p>
                ) : (
                  <p className="vf-profile-bio" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                    {t("No bio added yet.")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="vf-profile-stats">
            <div className="vf-profile-stat-card">
              <div className="vf-profile-stat-num">
                {projectsQuery.data?.totalElements ?? 0}
              </div>
              <div className="vf-profile-stat-label">
                {isOwnProfile ? t("Circuits Designed") : t("Public Circuits")}
              </div>
            </div>
            <div className="vf-profile-stat-card">
              <div className="vf-profile-stat-num">
                {projectsQuery.data?.content?.filter((p) => p.isPublic).length ?? 0}
              </div>
              <div className="vf-profile-stat-label">
                {isOwnProfile ? t("Public Circuits") : t("Verified Public")}
              </div>
            </div>
            <div className="vf-profile-stat-card">
              <div className="vf-profile-stat-num" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={20} className="text-teal" />
                <span>Keycloak SSO</span>
              </div>
              <div className="vf-profile-stat-label">{t("Identity Provider")}</div>
            </div>
          </div>

          {/* Projects Portfolio */}
          <div className="vf-profile-projects">
            <h2 className="vf-profile-section-title">
              {isOwnProfile ? t("Designed Circuits") : t("Public Portfolio")}
            </h2>
            {projectsQuery.isLoading && <LoadingState label={t("Loading circuits...")} />}
            {projectsQuery.data && projectsQuery.data.content.length === 0 ? (
              <div className="vf-profile-stat-card" style={{ textAlign: 'center', padding: 32 }}>
                <CircuitBoard size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <p className="vf-muted">
                  {isOwnProfile
                    ? t("No circuits created yet. Start designing on the canvas!")
                    : t("No public circuits published by this engineer yet.")}
                </p>
                {isOwnProfile && (
                  <Button
                    onClick={() => navigate('/projects/new')}
                    style={{ marginTop: 12 }}
                    variant="primary"
                  >
                    {t("Create Circuit")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="vf-profile-projects-grid">
                {projectsQuery.data?.content.map((project) => (
                  <div
                    className="vf-profile-project-card"
                    key={project.id}
                    onClick={() => navigate(isOwnProfile ? `/editor/${project.id}` : `/public-project/${project.id}`)}
                  >
                    <div>
                      <h3 className="vf-project-card__title">{project.name}</h3>
                      <p className="vf-project-card__desc">
                        {project.description || t("No description provided.")}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <Badge tone={project.isPublic ? 'success' : 'neutral'}>
                        {project.isPublic ? t("Public") : t("Private")}
                      </Badge>
                      <span style={{ fontSize: 12, color: 'var(--vf-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isOwnProfile ? t("Open") : t("View Circuit")} <ArrowRight size={13} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default ProfilePage
