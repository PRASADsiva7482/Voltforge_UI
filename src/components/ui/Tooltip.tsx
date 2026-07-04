import { type ReactNode, useState, useRef } from 'react'

export interface TooltipProps {
  children: ReactNode
  className?: string
  content: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({
  children,
  className = '',
  content,
  position = 'top',
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = () => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(true), 200)
  }

  const hide = () => {
    clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  return (
    <div
      className={`vf-tooltip-wrapper ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div className={`vf-tooltip vf-tooltip--${position}`} role="tooltip">
          {content}
        </div>
      )}
    </div>
  )
}
