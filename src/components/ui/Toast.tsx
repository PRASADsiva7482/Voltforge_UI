import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
  duration?: number
  id: string
  message: string
  onClose: (id: string) => void
  type: ToastType
}

const TYPE_CLASS: Record<ToastType, string> = {
  success: 'vf-toast--success',
  error: 'vf-toast--error',
  warning: 'vf-toast--warning',
  info: 'vf-toast--info',
}

export function Toast({ duration = 4000, id, message, onClose, type }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  return (
    <div className={`vf-toast ${TYPE_CLASS[type]}`}>
      <span className="vf-toast__message">{message}</span>
      <button className="vf-toast__close" onClick={() => onClose(id)} type="button" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}
