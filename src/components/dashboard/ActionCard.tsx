import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

export type ActionCardProps = {
  icon: LucideIcon
  label: string
  onClick?: () => void
  text: string
}

export function ActionCard({ icon: Icon, label, onClick, text }: ActionCardProps) {
  return (
    <button className="action-card" onClick={onClick} type="button">
      <div className="action-card__inner">
        <span className="action-card__icon">
          <Icon size={20} />
        </span>
        <div className="action-card__body">
          <strong>{label}</strong>
          <p>{text}</p>
        </div>
        <ArrowRight className="action-card__arrow" size={17} />
      </div>
    </button>
  )
}
