import { type ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

export interface BreadcrumbsProps {
  icon?: ReactNode
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ icon, items }: BreadcrumbsProps) {
  return (
    <nav className="vf-breadcrumbs">
      {icon && <span className="vf-breadcrumbs__icon">{icon}</span>}
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <div key={item.label} className="vf-breadcrumbs__segment">
            {index > 0 && (
              <svg className="vf-breadcrumbs__separator" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            )}
            {isLast ? (
              <span className="vf-breadcrumbs__current">{item.label}</span>
            ) : (
              <button type="button" className="vf-breadcrumbs__link" onClick={item.onClick}>
                {item.label}
              </button>
            )}
          </div>
        )
      })}
    </nav>
  )
}
