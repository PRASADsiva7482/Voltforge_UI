import {
  Compass,
  FolderOpen,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '../types/auth'

export type NavItem = {
  adminOnly?: boolean
  icon: LucideIcon
  label: string
  path: string
}

export const legacyNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: FolderOpen, label: 'My Projects', path: '/projects' },
  { icon: Compass, label: 'Explore', path: '/explore' },
  { icon: FlaskConical, label: 'Challenge Labs', path: '/labs' },
  { icon: Settings, label: 'Settings', path: '/settings' },
  { adminOnly: true, icon: ShieldCheck, label: 'Admin', path: '/admin' },
]

/**
 * Admin navigation menu flag.
 * Temporarily disabled per requirement; will be re-enabled later with granular function control.
 */
export const ENABLE_ADMIN_NAV_MENU = false

export function getNavItems(role: UserRole = 'USER') {
  return legacyNavItems.filter((item) => {
    if (item.adminOnly) {
      if (!ENABLE_ADMIN_NAV_MENU) return false
      return role === 'ADMIN'
    }
    return true
  })
}
