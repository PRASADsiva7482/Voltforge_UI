import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '../ui'

export type CapabilityCardProps = {
  icon: LucideIcon
  label: string
  text: string
  tag?: string
  highlights?: string[]
}

export function CapabilityCard({ icon: Icon, label, text, tag, highlights }: CapabilityCardProps) {
  const { t } = useTranslation()
  return (
    <Card className="capability-card">
      <div className="capability-card__header">
        <span className="capability-card__icon">
          <Icon size={22} />
        </span>
        {tag ? <span className="capability-card__tag">{t(tag)}</span> : null}
      </div>
      <h3 className="capability-card__title">{t(label)}</h3>
      <p className="capability-card__text">{t(text)}</p>
      {highlights && highlights.length > 0 ? (
        <ul className="capability-card__highlights">
          {highlights.map((item) => (
            <li key={item}>
              <span className="capability-card__bullet" />
              <span>{t(item)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
