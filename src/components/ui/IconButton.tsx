import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type IconButtonTone = 'neutral' | 'primary' | 'danger'
type IconButtonSize = 'sm' | 'md' | 'lg'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: ReactNode
  label: string
  size?: IconButtonSize
  tone?: IconButtonTone
}

export function IconButton({
  className,
  icon,
  label,
  size = 'md',
  tone = 'neutral',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn('vf-icon-button', `vf-icon-button--${tone}`, `vf-icon-button--${size}`, className)}
      title={label}
      type={type}
      {...props}
    >
      {icon}
    </button>
  )
}
