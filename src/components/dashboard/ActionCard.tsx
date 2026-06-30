import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Card } from '../ui'

export type ActionCardProps = {
  icon: LucideIcon
  label: string
  onClick?: () => void
  text: string
}

export function ActionCard({ icon: Icon, label, onClick, text }: ActionCardProps) {
  return (
    <button className="action-card" onClick={onClick} type="button">
      <Card>
        <span className="action-card__icon">
          <Icon size={22} />
        </span>
        <strong>{label}</strong>
        <p>{text}</p>
        <ArrowRight size={17} />
      </Card>
    </button>
  )
}
