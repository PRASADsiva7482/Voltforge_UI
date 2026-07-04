import { type ReactNode } from 'react'

export interface EmptyStateProps {
  action?: ReactNode
  className?: string
  description?: string
  icon?: ReactNode
  title: string
}

export function EmptyState({ action, className = '', description, icon, title }: EmptyStateProps) {
  return (
    <div className={`vf-empty-state ${className}`}>
      {icon && <div className="vf-empty-state__icon">{icon}</div>}
      <h3 className="vf-empty-state__title">{title}</h3>
      {description && <p className="vf-empty-state__desc">{description}</p>}
      {action && <div className="vf-empty-state__action">{action}</div>}
    </div>
  )
}
