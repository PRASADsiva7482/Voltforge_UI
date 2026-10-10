import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

export type WorkflowStep = {
  icon: LucideIcon
  label: string
  stepNumber?: string
  description?: string
}

export function WorkflowStrip({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="workflow-strip">
      {steps.map((step, index) => {
        const Icon = step.icon
        const stepNum = step.stepNumber || `0${index + 1}`
        return (
          <div className="workflow-strip__item" key={step.label}>
            <div className="workflow-strip__header">
              <span className="workflow-strip__step-num">{stepNum}</span>
              <span className="workflow-strip__icon">
                <Icon size={18} />
              </span>
            </div>
            <strong className="workflow-strip__label">{step.label}</strong>
            {step.description ? (
              <p className="workflow-strip__desc">{step.description}</p>
            ) : null}
            {index < steps.length - 1 ? (
              <div className="workflow-strip__connector" aria-hidden="true">
                <ArrowRight size={15} />
              </div>
            ) : (
              <div className="workflow-strip__complete-tag" aria-hidden="true">
                <CheckCircle2 size={13} className="text-teal" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
