import { BatteryCharging, CircuitBoard, Zap } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'

export type BoardCardProps = {
  analogPins: number
  clock: string
  digitalPins: number
  name: string
  voltage: string
}

export function BoardCard({ analogPins, clock, digitalPins, name, voltage }: BoardCardProps) {
  return (
    <Card className="vf-board-card">
      <div className="vf-board-card__chip">
        <CircuitBoard size={34} />
      </div>
      <div>
        <h3>{name}</h3>
        <p className="vf-muted">{clock}</p>
      </div>
      <div className="vf-board-card__stats">
        <Badge tone="info">
          <Zap size={13} />
          {digitalPins} digital
        </Badge>
        <Badge tone="success">
          <BatteryCharging size={13} />
          {voltage}
        </Badge>
        <Badge tone="neutral">{analogPins} analog</Badge>
      </div>
    </Card>
  )
}
