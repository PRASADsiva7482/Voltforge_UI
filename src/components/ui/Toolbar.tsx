import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Toolbar({ children, className, ...props }: ToolbarProps) {
  return (
    <div className={cn('vf-toolbar', className)} {...props}>
      {children}
    </div>
  )
}
