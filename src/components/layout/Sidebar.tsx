import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
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
      <nav>
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
      <Box tone="accent">
        <p className="vf-eyebrow">{t("Session")}</p>
        <strong>{auth.user?.displayName ?? t("Voltforge user")}</strong>
        <span className="app-sidebar__note">{auth.user?.email ?? auth.user?.username}</span>
        <div className="app-sidebar__session">
          <Badge dot tone="success">
            {t("Active")}
          </Badge>
          <IconButton icon={<LogOut size={16} />} label={t("Logout")} onClick={auth.logout} size="sm" />
        </div>
      </Box>
    </aside>
  )
}
