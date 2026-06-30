import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../../components/ui'
import { Topbar } from '../../components/layout'

export type WorkspacePlaceholderProps = {
  icon: LucideIcon
  kicker: string
  text: string
  title: string
}

export function WorkspacePlaceholder({ icon: Icon, kicker, text, title }: WorkspacePlaceholderProps) {
  const navigate = useNavigate()

  return (
    <>
      <Topbar eyebrow={kicker} title={title} />
      <Card className="workspace-placeholder">
        <span className="workspace-placeholder__icon">
          <Icon size={30} />
        </span>
        <h2>{title}</h2>
        <p>{text}</p>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </Button>
      </Card>
    </>
  )
}
