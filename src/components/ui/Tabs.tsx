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
            tabIndex={value === item.id ? 0 : -1}
            className="vf-tabs__tab"
            key={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={event => {
              const index = items.findIndex(tab => tab.id === item.id)
              const next = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1
              if (next < 0) return
              event.preventDefault()
              onChange(items[next].id)
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
            }}
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
