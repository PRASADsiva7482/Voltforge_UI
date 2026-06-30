import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Badge } from './Badge'
import { Card } from './Card'

export type MetricCardProps = {
  label: string
  trend?: 'up' | 'down' | 'flat'
  value: string
}

export function MetricCard({ label, trend = 'flat', value }: MetricCardProps) {
  const trendMeta: Record<NonNullable<MetricCardProps['trend']>, { icon: ReactNode; label: string; tone: 'success' | 'warning' | 'neutral' }> = {
    down: { icon: <ArrowDownRight size={14} />, label: 'Needs review', tone: 'warning' },
    flat: { icon: null, label: 'Stable', tone: 'neutral' },
    up: { icon: <ArrowUpRight size={14} />, label: 'Healthy', tone: 'success' },
  }
  const meta = trendMeta[trend]

  return (
    <Card className="vf-metric-card">
      <p className="vf-muted">{label}</p>
      <strong>{value}</strong>
      <Badge tone={meta.tone}>
        {meta.icon}
        {meta.label}
      </Badge>
    </Card>
  )
}
