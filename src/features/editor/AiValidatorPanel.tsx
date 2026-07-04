import { useState } from 'react'
import { AlertTriangle, Info, Play, ShieldAlert } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { aiApi } from '../../api/services'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { Callout } from '../../components/ui/Callout'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function AiValidatorPanel({ isOpen, onClose }: Props) {
  const { nodes, wires } = useCanvasStore()
  const { currentProject } = useProjectStore()
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<any>(null)

  const handleValidate = async () => {
    if (nodes.length === 0) {
      alert('Add components to the canvas first.')
      return
    }
    setIsValidating(true)
    setValidationResult(null)
    try {
      const res = await aiApi.validateCircuit({
        boardType: currentProject?.boardType,
        components: nodes.map((n) => ({ id: n.id, type: n.type, name: n.name })),
        wires: wires.map((w) => ({
          fromComponent: w.fromNodeId,
          fromPin: w.fromPinId,
          toComponent: w.toNodeId,
          toPin: w.toPinId,
        })),
      })
      setValidationResult(res.data.data)
    } catch (e) {
      console.error(e)
      alert('Validation failed.')
    } finally {
      setIsValidating(false)
    }
  }

  const getScoreColorClass = (score: number) => {
    if (score >= 80) return 'is-good'
    if (score >= 50) return 'is-medium'
    return 'is-bad'
  }

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="AI Circuit Validator"
      icon={<ShieldAlert size={14} />}
      width="320px"
    >
      <div className="vf-validator-content">
        {!validationResult && !isValidating && (
          <div className="vf-validator-empty-state">
            <ShieldAlert size={40} className="vf-validator-empty-icon" />
            <p className="vf-validator-empty-text">
              Validate your circuit wiring, power distribution, and component logic for potential safety or functional issues.
            </p>
            <Button
              onClick={handleValidate}
              icon={<Play size={12} />}
              variant="primary"
              className="vf-validator-btn"
            >
              Start Validation
            </Button>
          </div>
        )}

        {isValidating && (
          <div className="vf-validator-loading-state">
            <LoadingSpinner size="md" className="vf-validator-spinner" />
            <p className="vf-validator-loading-text">
              AI is analyzing circuit topology...
            </p>
          </div>
        )}

        {validationResult && !isValidating && (
          <div className="vf-validator-results">
            <Callout
              type={validationResult.isValid ? 'success' : 'error'}
              title={validationResult.isValid ? 'Circuit looks safe!' : 'Circuit validation failed'}
              className="vf-validator-callout"
            >
              {validationResult.generalFeedback}
            </Callout>

            <div className="vf-validator__score">
              <span className="vf-validator__score-label">Safety Score</span>
              <span className={`vf-validator__score-value ${getScoreColorClass(validationResult.safetyScore)}`}>
                {validationResult.safetyScore}/100
              </span>
            </div>

            {validationResult.issues && validationResult.issues.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Detected Issues</h5>
                {validationResult.issues.map((issue: any, i: number) => (
                  <div key={i} className="vf-alert-card vf-alert-card--warning">
                    <div className="vf-alert-card__header">
                      {issue.severity === 'CRITICAL' ? (
                        <AlertTriangle size={14} style={{ color: '#dc2626' }} />
                      ) : issue.severity === 'WARNING' ? (
                        <AlertTriangle size={14} style={{ color: '#d97706' }} />
                      ) : (
                        <Info size={14} style={{ color: '#2563eb' }} />
                      )}
                      <span className="vf-alert-card__message">{issue.message}</span>
                    </div>
                    {issue.suggestedFix && (
                      <p className="vf-alert-card__fix">
                        Fix: {issue.suggestedFix}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleValidate}
              variant="secondary"
              className="vf-validator-btn vf-validator-btn--retry"
            >
              Re-Validate Circuit
            </Button>
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}
export { AiValidatorPanel }
