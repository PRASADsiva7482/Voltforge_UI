import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type CardProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode
  children: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  footer?: ReactNode
  title?: ReactNode
}

export function Card({
  actions,
  children,
  className,
  description,
  eyebrow,
  footer,
  title,
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || description || eyebrow || actions)

  return (
    <section className={cn('vf-card', className)} {...props}>
      {hasHeader ? (
        <div className="vf-card__header">
          <div>
            {eyebrow ? <p className="vf-eyebrow">{eyebrow}</p> : null}
            {title ? <h3>{title}</h3> : null}
            {description ? <p className="vf-muted">{description}</p> : null}
          </div>
          {actions ? <div className="vf-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="vf-card__body">{children}</div>
      {footer ? <div className="vf-card__footer">{footer}</div> : null}
    </section>
  )
}
