import { useState } from 'react'
import { AlertTriangle, Info, Play, Plus, ShieldAlert, Trash2, Wrench, Zap } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useToastStore } from '../../store/useToastStore'
import { aiApi } from '../../api/services'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { Callout } from '../../components/ui/Callout'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { buildCircuitNetlist } from '../canvas/netlist'
import { getPinsForComponent } from '../canvas/pinRegistry'
import type { AiAction, AiCodeFix, AiValidationResponse, AiWireSuggestion, CanvasNode, Wire } from '../../types/domain'

interface Props {
  isOpen: boolean
  readOnly?: boolean
  onClose: () => void
}

function pinRef(ref?: string) {
  const [nodeId, pinId] = String(ref || '').split('/')
  return nodeId && pinId ? { nodeId, pinId } : null
}

function resistanceValue(value?: string) {
  const numeric = Number(String(value || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 220
}

function parseActionValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const text = String(value ?? '').trim()
  const numeric = Number(text.replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(numeric) && /[0-9]/.test(text) ? numeric : text
}

function hasWire(wires: Wire[], fromNodeId: string, fromPinId: string, toNodeId: string, toPinId: string) {
  return wires.some((wire) =>
    (wire.fromNodeId === fromNodeId && wire.fromPinId === fromPinId && wire.toNodeId === toNodeId && wire.toPinId === toPinId) ||
    (wire.fromNodeId === toNodeId && wire.fromPinId === toPinId && wire.toNodeId === fromNodeId && wire.toPinId === fromPinId)
  )
}

function hasValidConnection(nodes: CanvasNode[], suggestion: AiWireSuggestion) {
  const from = nodes.find((node) => node.id === suggestion.fromComponentId)
  const to = nodes.find((node) => node.id === suggestion.toComponentId)
  return Boolean(
    from?.pins.some((pin) => pin.id === suggestion.fromPin || pin.name === suggestion.fromPin) &&
    to?.pins.some((pin) => pin.id === suggestion.toPin || pin.name === suggestion.toPin) &&
    from.id !== to.id,
  )
}

function makeWire(suggestion: AiWireSuggestion): Wire {
  return {
    bendPoints: [],
    color: suggestion.color || '#3b82f6',
    fromNodeId: suggestion.fromComponentId,
    fromPinId: suggestion.fromPin,
    id: `ai_wire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    routingMode: 'auto',
    toNodeId: suggestion.toComponentId,
    toPinId: suggestion.toPin,
  }
}

export default function AiValidatorPanel({ isOpen, readOnly = false, onClose }: Props) {
  const { addNode, addWire, nodes, removeWire, commitNodeUpdate, wires } = useCanvasStore()
  const { activeCodeFile, currentProject, updateCodeFileContent } = useProjectStore()
  const addToast = useToastStore((s) => s.addToast)
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<AiValidationResponse | null>(null)

  const handleValidate = async () => {
    if (nodes.length === 0) {
      addToast('Add components to the canvas first.', 'error')
      return
    }
    setIsValidating(true)
    setValidationResult(null)
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
      setValidationResult(res.data.data)
    } catch (e) {
      console.error(e)
      addToast('Validation failed.', 'error')
    } finally {
      setIsValidating(false)
    }
  }

  const applyWireSuggestion = (suggestion: AiWireSuggestion) => {
    if (readOnly) return
    if (!hasValidConnection(nodes, suggestion)) {
      addToast('AI suggested a pin that is not present on this canvas.', 'error')
      return
    }
    if (hasWire(wires, suggestion.fromComponentId, suggestion.fromPin, suggestion.toComponentId, suggestion.toPin)) {
      addToast('Wire already exists.', 'info')
      return
    }
    addWire(makeWire(suggestion))
    addToast('AI wire suggestion applied.', 'success')
  }

  const applyRemoval = (action: AiAction) => {
    if (readOnly) return
    if (!action.wireId) {
      addToast('This removal does not reference a specific wire.', 'error')
      return
    }
    removeWire(action.wireId)
    addToast('AI removal applied.', 'success')
  }

  const applyAddition = (action: AiAction) => {
    if (readOnly) return
    if (String(action.componentType || '').toUpperCase() !== 'RESISTOR' || !action.between || action.between.length < 2) {
      addToast('This addition can be reviewed manually.', 'info')
      return
    }
    const first = pinRef(action.between[0])
    const second = pinRef(action.between[1])
    if (!first || !second) {
      addToast('AI addition has incomplete pin references.', 'error')
      return
    }

    const firstNode = nodes.find((node) => node.id === first.nodeId)
    const secondNode = nodes.find((node) => node.id === second.nodeId)
    const x = firstNode && secondNode ? (firstNode.x + secondNode.x) / 2 : 220
    const y = firstNode && secondNode ? (firstNode.y + secondNode.y) / 2 : 220
    const resistorId = `ai_resistor_${Date.now()}`
    const resistor: CanvasNode = {
      componentId: resistorId,
      height: 24,
      id: resistorId,
      name: `${resistanceValue(action.value)} Ohm Resistor`,
      pins: getPinsForComponent('RESISTOR', undefined, 90, 24),
      properties: { resistance: resistanceValue(action.value) },
      rotation: 0,
      type: 'RESISTOR',
      width: 90,
      x,
      y,
    }
    addNode(resistor)
    addWire({
      bendPoints: [],
      color: '#f59e0b',
      fromNodeId: first.nodeId,
      fromPinId: first.pinId,
      id: `ai_wire_${Date.now()}_a`,
      routingMode: 'auto',
      toNodeId: resistorId,
      toPinId: 'p1',
    })
    addWire({
      bendPoints: [],
      color: '#f59e0b',
      fromNodeId: resistorId,
      fromPinId: 'p2',
      id: `ai_wire_${Date.now()}_b`,
      routingMode: 'auto',
      toNodeId: second.nodeId,
      toPinId: second.pinId,
    })
    addToast('AI resistor addition applied.', 'success')
  }

  const applyValueChange = (action: AiAction) => {
    if (!action.componentId || !action.property) {
      addToast('This value change is missing a target property.', 'error')
      return
    }
    const node = nodes.find((item) => item.id === action.componentId)
    if (!node) {
      addToast('Could not find the target component.', 'error')
      return
    }
    if (readOnly) return
    commitNodeUpdate(action.componentId, {
      properties: {
        ...node.properties,
        [action.property]: parseActionValue(action.newValue ?? action.value),
      },
    })
    addToast('AI value change applied.', 'success')
  }

  const applyCodeFix = (fix: AiCodeFix) => {
    if (readOnly) return
    if (!activeCodeFile) {
      addToast('No active code file selected.', 'error')
      return
    }
    if (fix.type !== 'replace' || !fix.from || !fix.to) {
      addToast('This code fix can be reviewed manually.', 'info')
      return
    }
    const next = activeCodeFile.content.replace(fix.from, fix.to)
    if (next === activeCodeFile.content) {
      addToast('Could not find the target code text.', 'error')
      return
    }
    updateCodeFileContent(activeCodeFile.id, next)
    addToast('AI code fix applied.', 'success')
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

            {validationResult.removals && validationResult.removals.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Removals</h5>
                {validationResult.removals.map((action, i) => (
                  <div key={`remove-${i}`} className="vf-ai-action">
                    <span>{action.between?.join(' -> ') || action.reason || 'Remove unsafe item'}</span>
                    <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => applyRemoval(action)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {validationResult.additions && validationResult.additions.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Additions</h5>
                {validationResult.additions.map((action, i) => (
                  <div key={`add-${i}`} className="vf-ai-action">
                    <span>{action.componentType || action.type} {action.value ? `(${action.value})` : ''}</span>
                    <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => applyAddition(action)}>
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {validationResult.wireSuggestions && validationResult.wireSuggestions.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Wire Suggestions</h5>
                {validationResult.wireSuggestions.slice(0, 8).map((suggestion, i) => (
                  <div key={`wire-${i}`} className="vf-ai-action">
                    <span>{suggestion.description}</span>
                    <Button size="sm" variant="secondary" icon={<Zap size={12} />} onClick={() => applyWireSuggestion(suggestion)}>
                      Wire
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {validationResult.valueChanges && validationResult.valueChanges.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Value Changes</h5>
                {validationResult.valueChanges.map((action, i) => (
                  <div key={`value-${i}`} className="vf-ai-action">
                    <span>{action.reason || `${action.componentId}.${action.property} -> ${String(action.newValue ?? action.value ?? '')}`}</span>
                    <Button size="sm" variant="secondary" icon={<Wrench size={12} />} onClick={() => applyValueChange(action)}>
                      Change
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {validationResult.codeFixes && validationResult.codeFixes.length > 0 && (
              <div className="vf-validator__issues">
                <h5 className="vf-validator__issues-title">Code Fixes</h5>
                {validationResult.codeFixes.map((fix, i) => (
                  <div key={`code-${i}`} className="vf-ai-action">
                    <span>{fix.description || `${fix.from} -> ${fix.to}`}</span>
                    <Button size="sm" variant="secondary" icon={<Wrench size={12} />} onClick={() => applyCodeFix(fix)}>
                      Apply
                    </Button>
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
