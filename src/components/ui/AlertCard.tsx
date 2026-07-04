import { type ReactNode } from 'react'

export interface AlertCardProps {
  children?: ReactNode
  className?: string
  icon?: ReactNode
  message: string
  severity: 'critical' | 'warning' | 'info'
  suggestedFix?: string
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: 'vf-alert-card--critical',
  warning: 'vf-alert-card--warning',
  info: 'vf-alert-card--info',
}

export function AlertCard({
  children,
  className = '',
  icon,
  message,
  severity,
  suggestedFix,
}: AlertCardProps) {
  return (
    <div className={`vf-alert-card ${SEVERITY_CLASS[severity] ?? ''} ${className}`}>
      <div className="vf-alert-card__header">
        {icon && <span className="vf-alert-card__icon">{icon}</span>}
        <span className="vf-alert-card__message">{message}</span>
      </div>
      {suggestedFix && (
        <p className="vf-alert-card__fix">Fix: {suggestedFix}</p>
      )}
      {children}
    </div>
  )
}
