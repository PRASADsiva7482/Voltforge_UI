import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Badge } from './Badge'
import { Card } from './Card'

export type MetricCardProps = {
  icon?: ReactNode
  label: string
  trend?: 'up' | 'down' | 'flat'
  trendLabel?: string
  trendTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  value: string
}

export function MetricCard({ icon, label, trend = 'flat', trendLabel, trendTone, value }: MetricCardProps) {
  const trendMeta: Record<NonNullable<MetricCardProps['trend']>, { icon: ReactNode; label: string; tone: 'success' | 'warning' | 'neutral' }> = {
    down: { icon: <ArrowDownRight size={14} />, label: 'Needs review', tone: 'warning' },
    flat: { icon: null, label: 'Stable', tone: 'neutral' },
    up: { icon: <ArrowUpRight size={14} />, label: 'Healthy', tone: 'success' },
  }
  const meta = trendMeta[trend]
  const badgeTone = trendTone ?? meta.tone
  const badgeLabel = trendLabel ?? meta.label
  const badgeIcon = icon !== undefined ? icon : meta.icon

  return (
    <Card className="vf-metric-card">
      <p className="vf-muted">{label}</p>
      <strong>{value}</strong>
      <Badge tone={badgeTone}>
        {badgeIcon}
        {badgeLabel}
      </Badge>
    </Card>
  )
}
