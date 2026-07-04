import { type ReactNode } from 'react'

export interface FloatingPanelProps {
  children: ReactNode
  footer?: ReactNode
  icon?: ReactNode
  isOpen: boolean
  onClose: () => void
  title: string
  width?: string
}

export function FloatingPanel({
  children,
  footer,
  icon,
  isOpen,
  onClose,
  title,
  width,
}: FloatingPanelProps) {
  if (!isOpen) return null

  return (
    <div className="vf-floating-panel" style={width ? { width } : undefined}>
      {/* Header */}
      <header className="vf-floating-panel__header">
        <div className="vf-floating-panel__title-row">
          {icon && <span className="vf-floating-panel__icon">{icon}</span>}
          <span className="vf-floating-panel__title">{title}</span>
        </div>
        <button className="vf-floating-panel__close" onClick={onClose} type="button" aria-label="Close panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </header>

      {/* Body */}
      <div className="vf-floating-panel__body">{children}</div>

      {/* Footer */}
      {footer && <div className="vf-floating-panel__footer">{footer}</div>}
    </div>
  )
}
