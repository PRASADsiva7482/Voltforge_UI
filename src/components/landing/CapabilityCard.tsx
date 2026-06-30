import type { LucideIcon } from 'lucide-react'
import { Card } from '../ui'

export type CapabilityCardProps = {
  icon: LucideIcon
  label: string
  text: string
}

export function CapabilityCard({ icon: Icon, label, text }: CapabilityCardProps) {
  return (
    <Card className="capability-card">
      <span className="capability-card__icon">
        <Icon size={21} />
      </span>
      <h3>{label}</h3>
      <p>{text}</p>
    </Card>
  )
}
