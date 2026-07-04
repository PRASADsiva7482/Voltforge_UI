import { type ReactNode } from 'react'

export interface CalloutProps {
  children?: ReactNode
  className?: string
  title?: string
  type: 'success' | 'error' | 'warning' | 'info'
}

const TYPE_CLASS: Record<string, string> = {
  success: 'vf-callout--success',
  error: 'vf-callout--error',
  warning: 'vf-callout--warning',
  info: 'vf-callout--info',
}

export function Callout({ children, className = '', title, type }: CalloutProps) {
  return (
    <div className={`vf-callout ${TYPE_CLASS[type] ?? ''} ${className}`}>
      {title && <strong className="vf-callout__title">{title}</strong>}
      {children && <div className="vf-callout__body">{children}</div>}
    </div>
  )
}
