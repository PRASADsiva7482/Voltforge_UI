import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BoxTone = 'plain' | 'raised' | 'inset' | 'accent'

export type BoxProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  tone?: BoxTone
}

export function Box({ children, className, tone = 'plain', ...props }: BoxProps) {
  return (
    <div className={cn('vf-box', `vf-box--${tone}`, className)} {...props}>
      {children}
    </div>
  )
}
