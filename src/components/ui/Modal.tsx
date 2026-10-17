import { type ReactNode, useEffect, useRef, useId } from 'react'
const modalStack: string[] = []

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
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return
    modalStack.push(titleId)
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length)
    ;(focusable()[0] ?? panel)?.focus()
    const handler = (e: KeyboardEvent) => {
      if (modalStack.at(-1) !== titleId) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab') {
        const items = focusable()
        const first = items[0], last = items[items.length - 1]
        if (!first) { e.preventDefault(); panel?.focus() }
        else if (e.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => { modalStack.splice(modalStack.indexOf(titleId), 1); document.removeEventListener('keydown', handler, true); document.body.style.overflow = overflow; previous?.focus() }
  }, [isOpen, titleId])

  if (!isOpen) return null

  return (
    <div className="vf-modal-overlay">
      {/* Backdrop */}
      <div className="vf-modal-backdrop" onClick={onClose} />

      {/* Panel */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`vf-modal ${SIZE_CLASS[size] ?? ''}`}>
        {/* Header */}
        <header className="vf-modal__header">
          <div className="vf-modal__title-group">
            {icon && <span className="vf-modal__icon">{icon}</span>}
            <h2 id={titleId} className="vf-modal__title">{title}</h2>
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
