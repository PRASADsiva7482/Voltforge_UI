import type { AiAction, AiCodeFix, AiWireSuggestion, CanvasNode, CodeFile, Wire } from '../../types/domain'
import { getPinsForComponent } from '../canvas/pinRegistry'
import { validateAiWire } from './aiWireValidation'
import type { AiProposal } from './aiProposal'

export type AiProposalSource = {
  activeCodeFile?: Pick<CodeFile, 'content' | 'id'> | null
  nodes: readonly CanvasNode[]
  wires: readonly Wire[]
}

export type AiProposalPlan = {
  beforeCode?: string
  canvasChanged: boolean
  codeChanged: boolean
  errors: string[]
  nextCode?: string
  nextNodes: CanvasNode[]
  nextWires: Wire[]
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

function proposalToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function hasWire(wires: readonly Wire[], fromNodeId: string, fromPinId: string, toNodeId: string, toPinId: string) {
  return wires.some((wire) =>
    (wire.fromNodeId === fromNodeId && wire.fromPinId === fromPinId && wire.toNodeId === toNodeId && wire.toPinId === toPinId) ||
    (wire.fromNodeId === toNodeId && wire.fromPinId === toPinId && wire.toNodeId === fromNodeId && wire.toPinId === fromPinId)
  )
}

function makeWire(suggestion: AiWireSuggestion, id: string): Wire {
  return {
    bendPoints: [],
    color: suggestion.color || '#3b82f6',
    fromNodeId: suggestion.fromComponentId,
    fromPinId: suggestion.fromPin,
    id,
    routingMode: 'auto',
    toNodeId: suggestion.toComponentId,
    toPinId: suggestion.toPin,
  }
}

function buildAdditionChanges(action: AiAction, proposalId: string, itemId: string, nodes: readonly CanvasNode[]) {
  const componentType = String(action.componentType || '').toUpperCase()
  if (!['RESISTOR', 'DIODE'].includes(componentType) || !action.between || action.between.length < 2) {
    return { error: 'This addition is incomplete or unsupported.' as const }
  }
  const first = pinRef(action.between[0])
  const second = pinRef(action.between[1])
  if (!first || !second) return { error: 'This addition has incomplete pin references.' as const }

  const firstNode = nodes.find((node) => node.id === first.nodeId)
  const secondNode = nodes.find((node) => node.id === second.nodeId)
  if (!firstNode || !secondNode) return { error: 'This addition references a component that no longer exists.' as const }
  if (!firstNode.pins.some((pin) => pin.id === first.pinId || pin.name === first.pinId)
    || !secondNode.pins.some((pin) => pin.id === second.pinId || pin.name === second.pinId)) {
    return { error: 'This addition references a pin that no longer exists.' as const }
  }

  const safeId = proposalToken(`${proposalId}_${itemId}`)
  if (nodes.some((node) => node.id === safeId)) return { error: 'This addition would reuse an existing component id.' as const }
  const isResistor = componentType === 'RESISTOR'
  const component: CanvasNode = {
    componentId: safeId,
    height: isResistor ? 24 : 28,
    id: safeId,
    name: isResistor ? `${resistanceValue(action.value)} Ohm Resistor` : 'Flyback Diode',
    pins: getPinsForComponent(componentType, undefined, isResistor ? 90 : 72, isResistor ? 24 : 28),
    properties: isResistor
      ? { resistance: resistanceValue(action.value), power: '0.25W' }
      : { partNumber: action.value || '1N4007' },
    rotation: 0,
    type: componentType,
    width: isResistor ? 90 : 72,
    x: (firstNode.x + secondNode.x) / 2,
    y: (firstNode.y + secondNode.y) / 2,
  }
  const firstWire = makeWire({
    color: isResistor ? '#f59e0b' : '#6366f1',
    description: 'Connect the first referenced terminal',
    fromComponentId: first.nodeId,
    fromPin: first.pinId,
    toComponentId: safeId,
    toPin: isResistor ? 'p1' : 'anode',
  }, `${safeId}_a`)
  const secondWire = makeWire({
    color: isResistor ? '#f59e0b' : '#6366f1',
    description: 'Connect the second referenced terminal',
    fromComponentId: safeId,
    fromPin: isResistor ? 'p2' : 'cathode',
    toComponentId: second.nodeId,
    toPin: second.pinId,
  }, `${safeId}_b`)
  return { component, wires: [firstWire, secondWire] }
}

export function cloneCanvasNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    pins: node.pins.map((pin) => ({ ...pin })),
    properties: { ...node.properties },
  }))
}

export function cloneWires(wires: readonly Wire[]): Wire[] {
  return wires.map((wire) => ({
    ...wire,
    bendPoints: wire.bendPoints.map((point) => ({ ...point })),
  }))
}

/**
 * Plans every selected item against one immutable source snapshot. Any
 * invalid item rejects the whole plan before a Zustand store is touched.
 */
export function planAiProposalChanges(
  proposal: AiProposal,
  selectedIds: readonly string[],
  source: AiProposalSource,
): AiProposalPlan {
  const nextNodes = cloneCanvasNodes(source.nodes)
  const nextWires = cloneWires(source.wires)
  const beforeCode = source.activeCodeFile?.content
  let nextCode = beforeCode
  const errors: string[] = []

  for (const item of proposal.items.filter((candidate) => selectedIds.includes(candidate.id))) {
    if (item.kind === 'wire') {
      const suggestion = item.action
      const validationError = validateAiWire(nextNodes, suggestion)
      if (validationError) {
        errors.push(validationError)
        continue
      }
      if (hasWire(nextWires, suggestion.fromComponentId, suggestion.fromPin, suggestion.toComponentId, suggestion.toPin)) {
        errors.push('A selected wire already exists in the current project.')
        continue
      }
      nextWires.push(makeWire(suggestion, `${proposalToken(proposal.id)}_${item.id}`))
    } else if (item.kind === 'addition') {
      const result = buildAdditionChanges(item.action, proposal.id, item.id, nextNodes)
      if ('error' in result) {
        errors.push(result.error || 'This addition could not be planned.')
        continue
      }
      if (result.wires.some((wire) => hasWire(nextWires, wire.fromNodeId, wire.fromPinId, wire.toNodeId, wire.toPinId))) {
        errors.push('A selected addition would duplicate an existing connection.')
        continue
      }
      nextNodes.push(result.component)
      nextWires.push(...result.wires)
    } else if (item.kind === 'value-change') {
      const action = item.action
      if (!action.componentId || !action.property) {
        errors.push('A selected value change is missing its target property.')
        continue
      }
      const nodeIndex = nextNodes.findIndex((node) => node.id === action.componentId)
      if (nodeIndex < 0) {
        errors.push(`Component ${action.componentId} no longer exists.`)
        continue
      }
      nextNodes[nodeIndex] = {
        ...nextNodes[nodeIndex],
        properties: {
          ...nextNodes[nodeIndex].properties,
          [action.property]: parseActionValue(action.newValue ?? action.value),
        },
      }
    } else if (item.kind === 'removal') {
      const wireId = item.action.wireId
      const wireIndex = wireId ? nextWires.findIndex((wire) => wire.id === wireId) : -1
      if (wireIndex < 0) {
        errors.push('A selected removal references a wire that no longer exists.')
        continue
      }
      nextWires.splice(wireIndex, 1)
    } else if (item.kind === 'code-fix') {
      const fix: AiCodeFix = item.action
      if (!source.activeCodeFile) {
        errors.push('No active firmware file is selected.')
        continue
      }
      if (fix.type !== 'replace' || !fix.from || !fix.to) {
        errors.push('A selected firmware change is incomplete.')
        continue
      }
      if (typeof nextCode !== 'string' || !nextCode.includes(fix.from)) {
        errors.push('A selected firmware change no longer matches the active file.')
        continue
      }
      nextCode = nextCode.replace(fix.from, fix.to)
    }
  }

  return {
    beforeCode,
    canvasChanged: JSON.stringify(source.nodes) !== JSON.stringify(nextNodes)
      || JSON.stringify(source.wires) !== JSON.stringify(nextWires),
    codeChanged: typeof nextCode === 'string' && nextCode !== beforeCode,
    errors,
    nextCode,
    nextNodes,
    nextWires,
  }
}
