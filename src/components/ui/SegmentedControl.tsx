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
          className="vf-segmented__item"
          key={option.id}
          onClick={() => onChange(option.id)}
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
