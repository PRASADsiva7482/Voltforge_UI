import type { LucideIcon } from 'lucide-react'
import { Card } from '../ui'

export type CapabilityCardProps = {
  icon: LucideIcon
  label: string
  text: string
  tag?: string
  highlights?: string[]
}

export function CapabilityCard({ icon: Icon, label, text, tag, highlights }: CapabilityCardProps) {
  return (
    <Card className="capability-card">
      <div className="capability-card__header">
        <span className="capability-card__icon">
          <Icon size={22} />
        </span>
        {tag ? <span className="capability-card__tag">{tag}</span> : null}
      </div>
      <h3 className="capability-card__title">{label}</h3>
      <p className="capability-card__text">{text}</p>
      {highlights && highlights.length > 0 ? (
        <ul className="capability-card__highlights">
          {highlights.map((item) => (
            <li key={item}>
              <span className="capability-card__bullet" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
