import { type ReactNode, useEffect, useRef } from 'react'

/* ── Size presets ─────────────────────────────────────────────────────── */
const SIZE_CLASS: Record<string, string> = {
  sm: 'vf-modal--sm',
  md: 'vf-modal--md',
  lg: 'vf-modal--lg',
  xl: 'vf-modal--xl',
  full: 'vf-modal--full',
}

export interface ModalProps {
  children: ReactNode
  footer?: ReactNode
  icon?: ReactNode
  isOpen: boolean
  onClose: () => void
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  title: ReactNode
}

export function Modal({
  children,
  footer,
  icon,
  isOpen,
  onClose,
  size = 'md',
  title,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="vf-modal-overlay">
      {/* Backdrop */}
      <div className="vf-modal-backdrop" onClick={onClose} />

      {/* Panel */}
      <div ref={panelRef} className={`vf-modal ${SIZE_CLASS[size] ?? ''}`}>
        {/* Header */}
        <header className="vf-modal__header">
          <div className="vf-modal__title-group">
            {icon && <span className="vf-modal__icon">{icon}</span>}
            <h2 className="vf-modal__title">{title}</h2>
          </div>
          <button className="vf-modal__close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        {/* Body */}
        <div className="vf-modal__body">{children}</div>

        {/* Footer */}
        {footer && <footer className="vf-modal__footer">{footer}</footer>}
      </div>
    </div>
  )
}
