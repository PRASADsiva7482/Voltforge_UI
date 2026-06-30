import { Cpu, GitBranch, MoreHorizontal } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'

export type ProjectCardProps = {
  board: string
  collaborators: number
  lastOpened: string
  name: string
  status: 'Draft' | 'Simulating' | 'Ready'
}

const statusTone: Record<ProjectCardProps['status'], 'neutral' | 'info' | 'success'> = {
  Draft: 'neutral',
  Ready: 'success',
  Simulating: 'info',
}

export function ProjectCard({ board, collaborators, lastOpened, name, status }: ProjectCardProps) {
  return (
    <Card
      actions={<IconButton icon={<MoreHorizontal size={17} />} label={`More actions for ${name}`} size="sm" />}
      className="vf-project-card"
      title={name}
    >
      <div className="vf-project-card__meta">
        <span>
          <Cpu size={15} />
          {board}
        </span>
        <span>
          <GitBranch size={15} />
          {collaborators} collaborators
        </span>
      </div>
      <div className="vf-project-card__footer">
        <Badge dot tone={statusTone[status]}>
          {status}
        </Badge>
        <span>{lastOpened}</span>
      </div>
      <Button size="sm" variant="ghost">
        Open project
      </Button>
    </Card>
  )
}
