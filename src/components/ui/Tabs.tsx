import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type TabItem = {
  count?: number
  id: string
  label: string
}

export type TabsProps = {
  actions?: ReactNode
  className?: string
  items: TabItem[]
  onChange: (id: string) => void
  value: string
}

export function Tabs({ actions, className, items, onChange, value }: TabsProps) {
  return (
    <div className={cn('vf-tabs', className)}>
      <div className="vf-tabs__list" role="tablist">
        {items.map((item) => (
          <button
            aria-selected={value === item.id}
            className="vf-tabs__tab"
            key={item.id}
            onClick={() => onChange(item.id)}
            role="tab"
            type="button"
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' ? <span className="vf-tabs__count">{item.count}</span> : null}
          </button>
        ))}
      </div>
      {actions ? <div className="vf-tabs__actions">{actions}</div> : null}
    </div>
  )
}
