import type { AiAction, AiCodeFix, AiWireSuggestion, CanvasNode, CodeFile, Wire } from '../../types/domain'
import { SIMULATION_RUNTIME_PROPERTY_KEYS } from '../simulator/runtimeDelta'

export type AiProposalKind = 'wire' | 'addition' | 'value-change' | 'removal' | 'code-fix'

type AiProposalItemBase = {
  detail: string
  id: string
  summary: string
}

export type AiProposalItem =
  | (AiProposalItemBase & { action: AiWireSuggestion; kind: 'wire' })
  | (AiProposalItemBase & { action: AiAction; kind: 'addition' | 'value-change' | 'removal' })
  | (AiProposalItemBase & { action: AiCodeFix; kind: 'code-fix' })

export type AiProposal = {
  id: string
  items: AiProposalItem[]
  projectId?: string
  sourceEditorRevision: string
  sourceProjectRevision?: string
}

export type EditorRevisionContext = {
  editorRevision: string
  projectId?: string
  projectRevision?: string
}

function fnv1a(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `editor-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function calculateEditorRevision(
  nodes: readonly CanvasNode[],
  wires: readonly Wire[],
  codeFiles: readonly Pick<CodeFile, 'content' | 'filename' | 'language' | 'sortOrder'>[],
  modelRevision = 0,
): string {
  return fnv1a(JSON.stringify({
    codeFiles: codeFiles.map((file) => ({
      content: file.content,
      filename: file.filename,
      language: file.language,
      sortOrder: file.sortOrder,
    })),
    // Simulation feedback is intentionally excluded. The canvas model
    // revision still changes for explicit editor property commits, so a
    // running simulation cannot make a review stale on every solver tick.
    modelRevision,
    nodes: nodes.map((node) => ({
      ...node,
      properties: Object.fromEntries(
        Object.entries(node.properties || {})
          .filter(([key]) => !SIMULATION_RUNTIME_PROPERTY_KEYS.has(key))
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    })),
    wires,
  }))
}

function additionSummary(action: AiAction): string {
  return action.reason || `${action.componentType || action.type}${action.value ? ` (${action.value})` : ''}`
}

export function buildAiProposal({
  additions = [],
  codeFixes = [],
  id,
  projectId,
  removals = [],
  sourceEditorRevision,
  sourceProjectRevision,
  valueChanges = [],
  wireSuggestions = [],
}: {
  additions?: readonly AiAction[]
  codeFixes?: readonly AiCodeFix[]
  id: string
  projectId?: string
  removals?: readonly AiAction[]
  sourceEditorRevision: string
  sourceProjectRevision?: string
  valueChanges?: readonly AiAction[]
  wireSuggestions?: readonly AiWireSuggestion[]
}): AiProposal | undefined {
  const items: AiProposalItem[] = [
    ...wireSuggestions.map((action, index) => ({
      action,
      detail: `${action.fromComponentId}/${action.fromPin} → ${action.toComponentId}/${action.toPin}`,
      id: `wire-${index}`,
      kind: 'wire' as const,
      summary: action.description || 'Connect the suggested terminals',
    })),
    ...additions.map((action, index) => ({
      action,
      detail: action.between?.join(' → ') || 'Review the referenced terminals before adding',
      id: `addition-${index}`,
      kind: 'addition' as const,
      summary: additionSummary(action),
    })),
    ...valueChanges.map((action, index) => ({
      action,
      detail: `${action.componentId || 'component'}.${action.property || 'property'} → ${String(action.newValue ?? action.value ?? '')}`,
      id: `value-change-${index}`,
      kind: 'value-change' as const,
      summary: action.reason || 'Update a component property',
    })),
    ...removals.map((action, index) => ({
      action,
      detail: action.between?.join(' → ') || action.wireId || 'Review the referenced wire before removing',
      id: `removal-${index}`,
      kind: 'removal' as const,
      summary: action.reason || 'Remove the suggested unsafe item',
    })),
    ...codeFixes.map((action, index) => ({
      action,
      detail: action.line ? `Line ${action.line}: ${action.from || ''} → ${action.to || ''}` : `${action.from || ''} → ${action.to || ''}`,
      id: `code-fix-${index}`,
      kind: 'code-fix' as const,
      summary: action.description || 'Update the active firmware file',
    })),
  ]

  if (items.length === 0) return undefined
  return { id, items, projectId, sourceEditorRevision, sourceProjectRevision }
}

export function isAiProposalCurrent(proposal: AiProposal, current: EditorRevisionContext): boolean {
  return proposal.projectId === current.projectId
    && proposal.sourceEditorRevision === current.editorRevision
    && proposal.sourceProjectRevision === current.projectRevision
}

export function defaultAiProposalSelection(proposal: AiProposal): string[] {
  return proposal.items.map((item) => item.id)
}
