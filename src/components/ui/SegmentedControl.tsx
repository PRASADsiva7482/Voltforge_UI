import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type SegmentedOption = {
  icon?: ReactNode
  id: string
  label: string
}

export type SegmentedControlProps = {
  className?: string
  onChange: (id: string) => void
  options: SegmentedOption[]
  value: string
}

export function SegmentedControl({ className, onChange, options, value }: SegmentedControlProps) {
  return (
    <div className={cn('vf-segmented', className)} role="tablist">
      {options.map((option) => (
        <button
          aria-selected={value === option.id}
          tabIndex={value === option.id ? 0 : -1}
          className="vf-segmented__item"
          key={option.id}
          onClick={() => onChange(option.id)}
          onKeyDown={event => {
            const index = options.findIndex(item => item.id === option.id)
            const next = event.key === 'ArrowRight' ? (index + 1) % options.length : event.key === 'ArrowLeft' ? (index + options.length - 1) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1
            if (next < 0) return
            event.preventDefault()
            onChange(options[next].id)
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
          }}
          role="tab"
          type="button"
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}
