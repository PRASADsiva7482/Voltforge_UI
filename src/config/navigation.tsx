import {
  Compass,
  FolderOpen,
  LayoutDashboard,
  Settings,
  ShieldCheck,
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
  { icon: Settings, label: 'Settings', path: '/settings' },
  { adminOnly: true, icon: ShieldCheck, label: 'Admin', path: '/admin' },
]

export function getNavItems(role: UserRole = 'USER') {
  return legacyNavItems.filter((item) => !item.adminOnly || role === 'ADMIN')
}
