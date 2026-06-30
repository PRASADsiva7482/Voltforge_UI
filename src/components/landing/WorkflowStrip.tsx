import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

export type WorkflowStep = {
  icon: LucideIcon
  label: string
}

export function WorkflowStrip({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="workflow-strip">
      {steps.map((step, index) => {
        const Icon = step.icon
        return (
          <div className="workflow-strip__item" key={step.label}>
            <span>
              <Icon size={18} />
            </span>
            <strong>{step.label}</strong>
            {index < steps.length - 1 ? <ArrowRight className="workflow-strip__arrow" size={16} /> : null}
          </div>
        )
      })}
    </div>
  )
}
