import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  dot?: boolean
  tone?: BadgeTone
}

export function Badge({ children, className, dot = false, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span className={cn('vf-badge', `vf-badge--${tone}`, className)} {...props}>
      {dot ? <span className="vf-badge__dot" /> : null}
      {children}
    </span>
  )
}
