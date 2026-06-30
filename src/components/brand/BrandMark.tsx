import { cn } from '../../lib/cn'

export type BrandMarkProps = {
  className?: string
  compact?: boolean
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div className={cn('brand-mark', className)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <img
        src="/v-logo.svg"
        alt="Voltforge logo"
        style={{
          width: compact ? '22px' : '26px',
          height: compact ? '22px' : '26px',
          display: 'block',
        }}
      />
      {!compact ? <span style={{ fontWeight: 720, fontSize: '15.5px', color: 'var(--vf-text-strong)' }}>Voltforge</span> : null}
    </div>
  )
}
