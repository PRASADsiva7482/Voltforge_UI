import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
}

export function Toggle({ className, label, ...props }: ToggleProps) {
  return (
    <label className={cn('vf-toggle', className)}>
      <input type="checkbox" {...props} />
      <span className="vf-toggle__track">
        <span className="vf-toggle__thumb" />
      </span>
      <span>{label}</span>
    </label>
  )
}
