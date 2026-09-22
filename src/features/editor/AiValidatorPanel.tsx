import { useState } from 'react'
import { AlertTriangle, Info, Play, ShieldAlert } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useToastStore } from '../../store/useToastStore'
import { aiApi } from '../../api/services'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { Callout } from '../../components/ui/Callout'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { buildCircuitNetlist } from '../canvas/netlist'
import { AiProposalReview } from '../ai/AiProposalReview'
import {
  buildAiProposal,
  calculateEditorRevision,
  defaultAiProposalSelection,
  isAiProposalCurrent,
  type AiProposal,
} from '../ai/aiProposal'
import { planAiProposalChanges } from '../ai/aiProposalTransaction'
import type { AiValidationResponse } from '../../types/domain'

interface Props {
  isOpen: boolean
  readOnly?: boolean
  onClose: () => void
}

interface AppliedAiTransaction {
  afterEditorRevision: string
  beforeCode?: string
  canvasChanged: boolean
  codeFileId?: string
  projectId?: string
  proposalId: string
}

export default function AiValidatorPanel({ isOpen, readOnly = false, onClose }: Props) {
  const { modelRevision, nodes, wires } = useCanvasStore()
  const { activeCodeFile, currentProject, updateCodeFileContent } = useProjectStore()
  const addToast = useToastStore((s) => s.addToast)
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<AiValidationResponse | null>(null)
  const [proposal, setProposal] = useState<AiProposal>()
  const [proposalSelections, setProposalSelections] = useState<string[]>([])
  const [appliedTransaction, setAppliedTransaction] = useState<AppliedAiTransaction>()
  const [isApplyingProposal, setIsApplyingProposal] = useState(false)

  const handleValidate = async () => {
    if (nodes.length === 0) {
      addToast('Add components to the canvas first.', 'error')
      return
    }
    setIsValidating(true)
    setValidationResult(null)
    setProposal(undefined)
    setProposalSelections([])
    setAppliedTransaction(undefined)
    const sourceEditorRevision = calculateEditorRevision(nodes, wires, currentProject?.codeFiles || [], modelRevision)
    const sourceProjectRevision = currentProject?.updatedAt
    try {
      const netlist = buildCircuitNetlist(nodes, wires)
      const res = await aiApi.validateCircuit({
        boardType: currentProject?.boardType,
        code: activeCodeFile?.content || currentProject?.codeFiles?.[0]?.content || '',
        components: nodes.map((n) => ({
          height: n.height,
          id: n.id,
          name: n.name,
          pins: n.pins,
          properties: n.properties,
          rotation: n.rotation,
          type: n.type,
          width: n.width,
          x: n.x,
          y: n.y,
        })),
        context: JSON.stringify({
          netlist: netlist.nodes.map((net) => ({
            id: net.id,
            pins: net.pins.map((pin) => `${pin.nodeId}/${pin.pinId}`),
          })),
        }),
        wires: wires.map((w) => ({
          color: w.color,
          id: w.id,
          fromComponent: w.fromNodeId,
          fromPin: w.fromPinId,
          toComponent: w.toNodeId,
          toPin: w.toPinId,
        })),
      })
      const result = res.data.data
      setValidationResult(result)
      const nextProposal = buildAiProposal({
        additions: result.additions,
        codeFixes: result.codeFixes,
        id: `validator-${Date.now()}`,
        projectId: currentProject?.id,
        removals: result.removals,
        sourceEditorRevision,
        sourceProjectRevision,
        valueChanges: result.valueChanges,
        wireSuggestions: result.wireSuggestions,
      })
      setProposal(nextProposal)
      if (nextProposal) setProposalSelections(defaultAiProposalSelection(nextProposal))
    } catch (e) {
      console.error(e)
      addToast('Validation failed.', 'error')
    } finally {
      setIsValidating(false)
    }
  }

  const toggleProposalItem = (itemId: string) => {
    if (!proposal) return
    setProposalSelections((selected) => selected.includes(itemId)
      ? selected.filter((id) => id !== itemId)
      : [...selected, itemId])
  }

  const applyProposal = () => {
    if (readOnly || isApplyingProposal || !proposal || !currentProject?.id) return
    const projectState = useProjectStore.getState()
    const canvasState = useCanvasStore.getState()
    const currentEditorRevision = calculateEditorRevision(
      canvasState.nodes,
      canvasState.wires,
      projectState.currentProject?.codeFiles || [],
      canvasState.modelRevision,
    )
    if (!isAiProposalCurrent(proposal, {
      editorRevision: currentEditorRevision,
      projectId: projectState.currentProject?.id,
      projectRevision: projectState.currentProject?.updatedAt,
    })) {
      addToast('This validation proposal is stale. Re-validate the current project.', 'error')
      return
    }
    if (proposalSelections.length === 0) {
      addToast('Select at least one proposed change to apply.', 'info')
      return
    }

    setIsApplyingProposal(true)
    const plan = planAiProposalChanges(proposal, proposalSelections, {
      activeCodeFile: projectState.activeCodeFile,
      nodes: canvasState.nodes,
      wires: canvasState.wires,
    })
    if (plan.errors.length > 0) {
      setIsApplyingProposal(false)
      addToast(`Proposal rejected: ${plan.errors[0]}`, 'error')
      return
    }
    if (!plan.canvasChanged && !plan.codeChanged) {
      setIsApplyingProposal(false)
      addToast('The selected proposal does not change the current project.', 'info')
      return
    }

    if (plan.canvasChanged) useCanvasStore.getState().commitCanvasSnapshot(plan.nextNodes, plan.nextWires)
    if (plan.codeChanged && projectState.activeCodeFile && typeof plan.nextCode === 'string') {
      updateCodeFileContent(projectState.activeCodeFile.id, plan.nextCode)
    }
    const afterProject = useProjectStore.getState()
    const afterCanvas = useCanvasStore.getState()
    setAppliedTransaction({
      afterEditorRevision: calculateEditorRevision(afterCanvas.nodes, afterCanvas.wires, afterProject.currentProject?.codeFiles || [], afterCanvas.modelRevision),
      beforeCode: plan.codeChanged ? plan.beforeCode : undefined,
      canvasChanged: plan.canvasChanged,
      codeFileId: plan.codeChanged ? projectState.activeCodeFile?.id : undefined,
      projectId: projectState.currentProject?.id,
      proposalId: proposal.id,
    })
    setIsApplyingProposal(false)
    addToast(`${proposalSelections.length} AI change${proposalSelections.length === 1 ? '' : 's'} applied as one reviewable transaction.`, 'success')
  }

  const undoAppliedProposal = () => {
    if (!proposal || !appliedTransaction || appliedTransaction.proposalId !== proposal.id) return
    const projectState = useProjectStore.getState()
    const canvasState = useCanvasStore.getState()
    const currentEditorRevision = calculateEditorRevision(canvasState.nodes, canvasState.wires, projectState.currentProject?.codeFiles || [], canvasState.modelRevision)
    if (currentEditorRevision !== appliedTransaction.afterEditorRevision
      || projectState.currentProject?.id !== appliedTransaction.projectId) {
      addToast('The editor changed after this AI transaction. Use normal editor history to review it.', 'error')
      return
    }
    if (appliedTransaction.canvasChanged) useCanvasStore.getState().undo()
    if (appliedTransaction.codeFileId && typeof appliedTransaction.beforeCode === 'string') {
      updateCodeFileContent(appliedTransaction.codeFileId, appliedTransaction.beforeCode)
    }
    setAppliedTransaction(undefined)
    addToast('AI transaction undone.', 'success')
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
      width="380px"
    >
      <div className="vf-validator-content">
        {!validationResult && !isValidating && (
          <div className="vf-validator-empty-state">
            <ShieldAlert size={40} className="vf-validator-empty-icon" />
            <p className="vf-validator-empty-text">
              Validate wiring, power paths, pin usage, and firmware alignment.
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
            {(() => {
              const isCircuitValid = Boolean(
                validationResult.isValid ??
                (validationResult as Record<string, unknown>).valid ??
                (validationResult.safetyScore >= 75 && !validationResult.issues?.some((i) => i.severity === 'CRITICAL'))
              )
              return (
                <Callout
                  type={isCircuitValid ? 'success' : 'error'}
                  title={isCircuitValid ? 'Circuit looks safe!' : 'Circuit validation failed'}
                  className="vf-validator-callout"
                >
                  {validationResult.generalFeedback}
                </Callout>
              )
            })()}

            <div className="vf-validator__score">
              <span className="vf-validator__score-label">Safety Score</span>
              <span className={`vf-validator__score-value ${getScoreColorClass(validationResult.safetyScore)}`}>
                {validationResult.safetyScore}/100
              </span>
            </div>



            {typeof validationResult.confidence === 'number' && (
              <div className="vf-validator__confidence">
                Confidence {Math.round(validationResult.confidence * 100)}%
              </div>
            )}

            {validationResult.issues && validationResult.issues.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Detected Issues</h5>
                {validationResult.issues.map((issue, i) => (
                  <div
                    key={`${issue.componentId}-${i}`}
                    className={`vf-alert-card ${
                      issue.severity === 'CRITICAL'
                        ? 'vf-alert-card--critical'
                        : issue.severity === 'WARNING'
                          ? 'vf-alert-card--warning'
                          : 'vf-alert-card--info'
                    }`}
                  >
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

            {proposal && (
              <AiProposalReview
                isStale={!isAiProposalCurrent(proposal, {
                  editorRevision: calculateEditorRevision(nodes, wires, currentProject?.codeFiles || [], modelRevision),
                  projectId: currentProject?.id,
                  projectRevision: currentProject?.updatedAt,
                })}
                isWorking={isApplyingProposal}
                onApply={applyProposal}
                onToggle={toggleProposalItem}
                onUndo={undoAppliedProposal}
                proposal={proposal}
                selectedIds={proposalSelections}
                undoAvailable={Boolean(
                  appliedTransaction?.proposalId === proposal.id
                  && appliedTransaction.afterEditorRevision === calculateEditorRevision(nodes, wires, currentProject?.codeFiles || [], modelRevision),
                )}
              />
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
