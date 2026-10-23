import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { BrandMark } from '../brand/BrandMark'
import { useAuth } from '../../auth/useAuth'
import { getNavItems } from '../../config/navigation'
import { useTranslation } from 'react-i18next'
import { User, LogOut } from 'lucide-react'
import { IconButton } from '../ui'

export function AppLayout() {
  const auth = useAuth()
  const navItems = getNavItems(auth.user?.role)
  const { t } = useTranslation()
  const isChatWorkspace = useLocation().pathname === '/ai-chat'
  const shellRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!isChatWorkspace || !window.visualViewport) return
    const viewport = window.visualViewport
    const shell = shellRef.current
    // The visual viewport shrinks when a mobile keyboard opens; keep the composer
    // inside that space instead of allowing the keyboard to cover a 100vh shell.
    const resize = () => {
      if (window.innerWidth <= 820) shell?.style.setProperty('--vf-chat-viewport-height', `${viewport.height}px`)
      else shell?.style.removeProperty('--vf-chat-viewport-height')
    }
    resize()
    viewport.addEventListener('resize', resize)
    return () => { viewport.removeEventListener('resize', resize); shell?.style.removeProperty('--vf-chat-viewport-height') }
  }, [isChatWorkspace])

  return (
    <main ref={shellRef} className={`app-shell${isChatWorkspace ? ' app-shell--chat' : ''}`}>
      <a className="vf-skip-link" href="#workspace-content">{t('Skip to content')}</a>
      {/* Mobile-only Header */}
      <header className="app-mobile-topbar" aria-label={t("Mobile navigation header")}>
        <BrandMark />
        <div className="app-mobile-topbar__actions">
          <NavLink
            to="/profile"
            className={({ isActive }) => `app-mobile-topbar__user ${isActive ? 'is-active' : ''}`}
            title={auth.user?.displayName ?? t("View Profile")}
            aria-label={t("View Profile")}
          >
            <User size={18} />
          </NavLink>
          <IconButton
            icon={<LogOut size={16} />}
            label={t("Logout")}
            onClick={auth.logout}
            size="sm"
          />
        </div>
      </header>

      {/* Desktop/Tablet Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="app-content" id="workspace-content" tabIndex={-1}>
        <Outlet />
      </div>

      {/* Mobile-only Fixed Bottom Navigation Bar */}
      <nav className="app-mobile-nav" aria-label={t("Mobile sections navigation")}>
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-mobile-nav__item ${isActive ? 'is-active' : ''}`}
            >
              <span className="app-mobile-nav__icon-wrap">
                <Icon size={20} />
              </span>
              <span className="app-mobile-nav__label">{t(item.label)}</span>
            </NavLink>
          )
        })}
      </nav>
    </main>
  )
}
