import { NavLink } from 'react-router-dom'
import { LogIn, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '../brand/BrandMark'
import { Badge, Box, IconButton } from '../ui'
import { getNavItems } from '../../config/navigation'
import { useAuth } from '../../auth/useAuth'

export function Sidebar() {
  const auth = useAuth()
  const navItems = getNavItems(auth.user?.role)
  const { t } = useTranslation()

  return (
    <aside className="app-sidebar" aria-label={t("Voltforge sections")}>
      <BrandMark />
      <p className="vf-eyebrow app-sidebar__label">{t('Workspace')}</p>
      <nav aria-label={t('Main navigation')}>
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink className={({ isActive }) => (isActive ? 'is-active' : undefined)} key={item.path} to={item.path}>
              <Icon size={17} />
              {t(item.label)}
            </NavLink>
          )
        })}
      </nav>
      <Box className="app-sidebar__account" tone="raised">
        <p className="vf-eyebrow">{t("Session")}</p>
        <NavLink
          to={auth.isAuthenticated ? "/profile" : "#"}
          onClick={(e) => {
            if (!auth.isAuthenticated) {
              e.preventDefault()
              auth.login()
            }
          }}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: '8px' }}
          title={auth.isAuthenticated ? t("View Profile") : t("Sign In")}
        >
          <strong>{auth.user?.displayName ?? (auth.isAuthenticated ? t("Voltforge user") : t("Guest Engineer"))}</strong>
          <span className="app-sidebar__note" style={{ display: 'block' }}>
            {auth.user?.email ?? auth.user?.username ?? t("Browse Mode")}
          </span>
        </NavLink>
        <div className="app-sidebar__session">
          <Badge dot tone={auth.isAuthenticated ? "success" : "neutral"}>
            {auth.isAuthenticated ? t("Active") : t("Guest")}
          </Badge>
          {auth.isAuthenticated ? (
            <IconButton icon={<LogOut size={16} />} label={t("Logout")} onClick={auth.logout} size="sm" />
          ) : (
            <IconButton icon={<LogIn size={16} />} label={t("Sign In")} onClick={auth.login} size="sm" />
          )}
        </div>
      </Box>
    </aside>
  )
}
