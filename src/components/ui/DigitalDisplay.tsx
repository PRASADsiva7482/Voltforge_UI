import { type ReactNode } from 'react'

export interface DigitalDisplayProps {
  className?: string
  indicator?: ReactNode
  label?: string
  unit?: string
  value: string | number
  variant?: 'green' | 'amber' | 'cyan'
}

const VARIANT_CLASS: Record<string, string> = {
  green: 'vf-digital-display--green',
  amber: 'vf-digital-display--amber',
  cyan: 'vf-digital-display--cyan',
}

export function DigitalDisplay({
  className = '',
  indicator,
  label,
  unit,
  value,
  variant = 'green',
}: DigitalDisplayProps) {
  return (
    <div className={`vf-digital-display ${VARIANT_CLASS[variant] ?? ''} ${className}`}>
      <div className="vf-digital-display__meta">
        {label && <span className="vf-digital-display__label">{label}</span>}
        {indicator && <div className="vf-digital-display__indicator">{indicator}</div>}
      </div>
      <div className="vf-digital-display__reading">
        <span className="vf-digital-display__value">{value}</span>
        {unit && <span className="vf-digital-display__unit">{unit}</span>}
      </div>
    </div>
  )
}
