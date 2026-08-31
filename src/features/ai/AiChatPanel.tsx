import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, Brain, Send, Sparkles, User } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useToastStore } from '../../store/useToastStore'
import { aiApi } from '../../api/services'
import { buildCircuitNetlist } from '../canvas/netlist'
import { Textarea } from '../../components/ui/Field'
import { SuggestionsList } from '../../components/ui/SuggestionsList'
import { CodeBlock } from '../../components/ui/CodeBlock'
import type { AiAction, AiArtifactIdentity, AiCitation, AiCodeFix, AiEngineeringAuthority, AiGroundingReport, AiInternetRetrievalStatus, AiLocalRetrievalStatus, AiMemoryState, AiWireSuggestion } from '../../types/domain'
import { AiProposalReview } from './AiProposalReview'
import {
  buildAiProposal,
  calculateEditorRevision,
  defaultAiProposalSelection,
  isAiProposalCurrent,
  type AiProposal,
} from './aiProposal'
import { planAiProposalChanges } from './aiProposalTransaction'
import {
  classifyAiStart,
  classifyAiTerminal,
  collectAiSources,
  describeAiRun,
  safeAiErrorMessage,
  type AiRunMetadata,
  type AiRunState,
  type AiUncertainty,
} from './aiPresentation'

interface Props {
  isOpen: boolean
  readOnly?: boolean
  onClose: () => void
  projectContext?: string
}

interface Message {
  additions?: AiAction[]
  citations?: AiCitation[]
  codeFixes?: AiCodeFix[]
  content: string
  confidence?: number
  grounding?: AiGroundingReport
  isStreaming?: boolean
  errorCode?: string
  proposal?: AiProposal
  removals?: AiAction[]
  role: 'user' | 'assistant'
  runDetail?: string
  runState?: AiRunState
  runStatus?: string
  sourceMetadata?: AiRunMetadata
  thought?: string
  uncertainty?: AiUncertainty
  valueChanges?: AiAction[]
  wireSuggestions?: AiWireSuggestion[]
}

interface AppliedAiTransaction {
  afterEditorRevision: string
  beforeCode?: string
  canvasChanged: boolean
  codeFileId?: string
  projectId?: string
  proposalId: string
}

const evidenceKindLabels: Record<NonNullable<AiCitation['evidenceKind']>, string> = {
  deterministic: 'Deterministic check',
  internet: 'Internet source',
  local: 'Local knowledge',
  project: 'Project evidence',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeAiRunMetadata(event: Record<string, unknown>, previous: AiRunMetadata = {}): AiRunMetadata {
  const next = { ...previous }
  if (event.mode === 'neural-quality-gated' || event.mode === 'deterministic-fallback' || event.mode === 'unavailable') {
    next.mode = event.mode
  }
  if (event.model === 'voltforge-local-engine-v1') next.model = event.model
  if (typeof event.projectRevision === 'string') next.projectRevision = event.projectRevision
  if (typeof event.fallbackReasonCode === 'string') next.fallbackReasonCode = event.fallbackReasonCode
  if (typeof event.fallbackUsed === 'boolean') next.fallbackUsed = event.fallbackUsed
  if (isRecord(event.artifact)) next.artifact = event.artifact as AiArtifactIdentity
  if (isRecord(event.engineeringAuthority)) next.engineeringAuthority = event.engineeringAuthority as AiEngineeringAuthority
  if (isRecord(event.internetRetrieval)) next.internetRetrieval = event.internetRetrieval as AiInternetRetrievalStatus
  if (isRecord(event.localRetrieval)) next.localRetrieval = event.localRetrieval as AiLocalRetrievalStatus
  return next
}

function parseAiUncertainty(event: Record<string, unknown>): AiUncertainty | undefined {
  const candidate = isRecord(event.uncertainty) ? event.uncertainty : event
  const missingEvidence = Array.isArray(candidate.missingEvidence)
    ? candidate.missingEvidence.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : undefined
  const level = typeof candidate.level === 'string' ? candidate.level : undefined
  const reasonCode = typeof candidate.reasonCode === 'string' ? candidate.reasonCode : undefined
  if (!level && !reasonCode && !missingEvidence?.length) return undefined
  return { level, missingEvidence, reasonCode }
}

function patchLastAssistant(messages: Message[], patch: Partial<Message>): Message[] {
  const updated = [...messages]
  const last = updated[updated.length - 1]
  if (last?.role === 'assistant') updated[updated.length - 1] = { ...last, ...patch }
  return updated
}

export default function AiChatPanel({
  isOpen,
  readOnly = false,
  onClose,
  projectContext,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [runState, setRunState] = useState<AiRunState>('idle')
  const [runMetadata, setRunMetadata] = useState<AiRunMetadata>({})
  const [sessionId, setSessionId] = useState<string>()
  const [isMemoryOpen, setIsMemoryOpen] = useState(false)
  const [memoryState, setMemoryState] = useState<AiMemoryState>()
  const [memoryLoadState, setMemoryLoadState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [editingMemoryId, setEditingMemoryId] = useState<string>()
  const [editingMemoryContent, setEditingMemoryContent] = useState('')
  const [isMemoryBusy, setIsMemoryBusy] = useState(false)
  const [proposalSelections, setProposalSelections] = useState<Record<string, string[]>>({})
  const [appliedTransaction, setAppliedTransaction] = useState<AppliedAiTransaction>()
  const [isApplyingProposal, setIsApplyingProposal] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const previousProjectIdRef = useRef<string | undefined>(undefined)
  const requestSequenceRef = useRef(0)
  
  const { modelRevision, nodes, selectedNodeId, selectedWireId, viewport, wires } = useCanvasStore()
  const { currentProject, activeCodeFile, updateCodeFileContent } = useProjectStore()
  const addToast = useToastStore((s) => s.addToast)
  const setResultDataConsumer = useSimulationStore((s) => s.setResultDataConsumer)

  useEffect(() => {
    setResultDataConsumer('ai', isOpen)
    return () => setResultDataConsumer('ai', false)
  }, [isOpen, setResultDataConsumer])

  useEffect(() => {
    const projectId = currentProject?.id
    const previousProjectId = previousProjectIdRef.current
    if (previousProjectId !== undefined && previousProjectId !== projectId) {
      requestSequenceRef.current += 1
      abortRef.current?.abort()
      setMessages([])
      setSessionId(undefined)
      setIsStreaming(false)
      setRunState('idle')
      setRunMetadata({})
      setMemoryState(undefined)
      setMemoryLoadState('idle')
      setMemoryDraft('')
      setEditingMemoryId(undefined)
      setEditingMemoryContent('')
      setProposalSelections({})
      setAppliedTransaction(undefined)
    }
    previousProjectIdRef.current = projectId
  }, [currentProject?.id])

  const refreshMemory = useCallback(async () => {
    if (!currentProject?.id) {
      setMemoryState(undefined)
      setMemoryLoadState('unavailable')
      return
    }
    setMemoryLoadState('loading')
    try {
      const response = await aiApi.inspectMemory(currentProject.id, sessionId, currentProject.updatedAt)
      setMemoryState(response.data.data)
      setMemoryLoadState('ready')
    } catch {
      // Memory may be unavailable until private gateway authentication is configured.
      setMemoryState(undefined)
      setMemoryLoadState('unavailable')
    }
  }, [currentProject?.id, currentProject?.updatedAt, sessionId])

  useEffect(() => {
    if (isOpen && isMemoryOpen) void refreshMemory()
  }, [isOpen, isMemoryOpen, refreshMemory])

  const setMemoryEnabled = useCallback(async (enabled: boolean) => {
    if (!currentProject?.id) return
    setIsMemoryBusy(true)
    try {
      const response = await aiApi.setMemoryPreference(currentProject.id, enabled, sessionId)
      setMemoryState(response.data.data)
      addToast(enabled ? 'Project memory enabled.' : 'Project memory disabled.', 'success')
    } catch {
      addToast('Could not update project memory.', 'error')
    } finally {
      setIsMemoryBusy(false)
    }
  }, [addToast, currentProject?.id, sessionId])

  const rememberFact = useCallback(async () => {
    const content = memoryDraft.trim()
    if (!currentProject?.id || !content) return
    setIsMemoryBusy(true)
    try {
      const response = await aiApi.createMemoryEntry(currentProject.id, {
        approved: true,
        content,
        kind: 'fact',
        projectRevision: currentProject.updatedAt,
        scope: 'project',
      }, sessionId)
      setMemoryState(response.data.data.memory)
      setMemoryDraft('')
      addToast('Approved project fact remembered.', 'success')
    } catch {
      addToast('This memory could not be stored. Check for secrets or instruction-like text.', 'error')
    } finally {
      setIsMemoryBusy(false)
    }
  }, [addToast, currentProject?.id, currentProject?.updatedAt, memoryDraft, sessionId])

  const saveMemoryCorrection = useCallback(async () => {
    const entry = memoryState?.entries.find((item) => item.memoryId === editingMemoryId)
    const content = editingMemoryContent.trim()
    if (!currentProject?.id || !entry || !content) return
    setIsMemoryBusy(true)
    try {
      await aiApi.correctMemoryEntry(currentProject.id, entry.memoryId, {
        approved: true,
        content,
        expectedVersion: entry.version,
        projectRevision: currentProject.updatedAt,
      }, sessionId)
      setEditingMemoryId(undefined)
      setEditingMemoryContent('')
      await refreshMemory()
      addToast('Memory corrected and rebound to the current project revision.', 'success')
    } catch {
      addToast('Memory changed or the correction was rejected. Inspect it again.', 'error')
    } finally {
      setIsMemoryBusy(false)
    }
  }, [addToast, currentProject?.id, currentProject?.updatedAt, editingMemoryContent, editingMemoryId, memoryState?.entries, refreshMemory, sessionId])

  const deleteMemory = useCallback(async (memoryId: string) => {
    if (!currentProject?.id) return
    setIsMemoryBusy(true)
    try {
      await aiApi.deleteMemoryEntry(currentProject.id, memoryId, sessionId)
      await refreshMemory()
      addToast('Memory deleted.', 'success')
    } catch {
      addToast('Could not delete memory.', 'error')
    } finally {
      setIsMemoryBusy(false)
    }
  }, [addToast, currentProject?.id, refreshMemory, sessionId])

  const clearMemory = useCallback(async (scope: 'project' | 'session') => {
    if (!currentProject?.id) return
    const label = scope === 'project' ? 'all project memory' : 'this session memory'
    if (!window.confirm(`Clear ${label}? This cannot be undone.`)) return
    setIsMemoryBusy(true)
    try {
      await aiApi.clearMemory(currentProject.id, scope, sessionId)
      await refreshMemory()
      addToast(`${scope === 'project' ? 'Project' : 'Session'} memory cleared.`, 'success')
    } catch {
      addToast('Could not clear memory.', 'error')
    } finally {
      setIsMemoryBusy(false)
    }
  }, [addToast, currentProject?.id, refreshMemory, sessionId])

  const buildPayload = useCallback(() => {
    const simState = useSimulationStore.getState()
    const netlist = buildCircuitNetlist(nodes, wires)
    const components = nodes.map((n) => ({
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
    }))
    const serializedWires = wires.map((w) => ({
      color: w.color,
      id: w.id,
      fromComponent: w.fromNodeId,
      fromPin: w.fromPinId,
      toComponent: w.toNodeId,
      toPin: w.toPinId,
    }))
    const netlistPayload = {
      components: netlist.components,
      nets: netlist.nodes.map((net) => ({
        id: net.id,
        pins: net.pins.map((pin) => `${pin.nodeId}/${pin.pinId}`),
      })),
      pinToNet: netlist.pinToNet,
    }
    const code = activeCodeFile?.content || currentProject?.codeFiles?.[0]?.content || ''
    const simulationState = {
      isSimulating: simState.isSimulating,
      solverConverged: simState.solverConverged,
      pinStates: simState.debugSnapshot.pins,
      debugSnapshot: simState.debugSnapshot,
      nodeVoltages: simState.nodeVoltages,
      branchCurrents: simState.branchCurrents,
      componentPower: simState.componentPower,
      oscilloscope: Object.fromEntries(
        Object.entries(simState.oscilloscopeData).map(([nodeId, samples]) => [
          nodeId,
          { latest: samples[samples.length - 1] ?? null, samples: samples.slice(-32) },
        ])
      ),
      serialBuffer: simState.serialLogs.slice(-10),
    }
    const richContext = JSON.stringify({
      projectName: currentProject?.name || projectContext,
      boardType: currentProject?.boardType || 'ARDUINO_UNO',
      selectedNodeId,
      selectedWireId,
      viewport,
      activeFile: activeCodeFile
        ? { filename: activeCodeFile.filename, language: activeCodeFile.language }
        : null,
      components,
      wires: serializedWires,
      netlist: netlistPayload,
      code,
      simulationState,
    })
    return {
      boardType: currentProject?.boardType || 'ARDUINO_UNO',
      components,
      wires: serializedWires,
      netlist: netlistPayload,
      code,
      canvasData: { components, wires: serializedWires, netlist: netlistPayload },
      simulationState,
      sessionId,
      projectId: currentProject?.id,
      projectRevision: currentProject?.updatedAt,
      files: (currentProject?.codeFiles || []).slice(0, 5).map((file) => ({
        content: file.content.slice(0, 60_000),
        filename: file.filename,
        language: file.language,
      })),
      context: richContext,
      canvasContext: richContext,
      history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    }
  }, [nodes, wires, activeCodeFile, currentProject, projectContext, selectedNodeId, selectedWireId, viewport, messages, sessionId])

  const handleSendStream = useCallback(async (userMessage: string) => {
    const payload = buildPayload()
    const sourceEditorRevision = calculateEditorRevision(nodes, wires, currentProject?.codeFiles || [], modelRevision)
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    let requestMetadata: AiRunMetadata = {}
    let terminalState: AiRunState | undefined
    let contentCharacters = 0
    let sawDone = false

    const updateMetadata = (event: Record<string, unknown>) => {
      if (requestId !== requestSequenceRef.current) return requestMetadata
      requestMetadata = mergeAiRunMetadata(event, requestMetadata)
      setRunMetadata(requestMetadata)
      return requestMetadata
    }

    const setAssistantStatus = (state: AiRunState, patch: Partial<Message> = {}) => {
      if (requestId !== requestSequenceRef.current) return
      const presentation = describeAiRun(state, requestMetadata)
      setRunState(state)
      setMessages((prev) => patchLastAssistant(prev, {
        ...patch,
        runDetail: presentation.detail,
        runState: state,
        runStatus: presentation.label,
        sourceMetadata: requestMetadata,
      }))
    }

    // Add user message and empty assistant placeholder
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '', isStreaming: true, runState: 'connecting', runStatus: 'Connecting' },
    ])
    setRunState('connecting')
    setRunMetadata({})
    setAppliedTransaction(undefined)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await aiApi.chatStream({
        message: userMessage,
        ...payload,
      }, controller.signal)

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEventType = ''

      while (true) {

        const { done, value } = await reader.read()
        if (done) break
        if (controller.signal.aborted || requestId !== requestSequenceRef.current) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Retain only incomplete trailing chunk

        for (const line of lines) {
          if (requestId !== requestSequenceRef.current) break
          let trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event:')) {
            currentEventType = trimmed.replace(/^event:\s*/, '').trim()
            continue
          }

          if (trimmed.startsWith('data:')) {
            trimmed = trimmed.replace(/^data:\s*/, '').trim()
          }

          if (trimmed === '[DONE]') {
            sawDone = true
            setIsStreaming(false)
            continue
          }

          try {
            const envelope = JSON.parse(trimmed)
            const canonicalPayload = envelope.payload && typeof envelope.payload === 'object'
              ? envelope.payload
              : {}
            // VFAI-026 reads the canonical typed payload while retaining
            // compatibility with pre-contract flat SSE events.
            const event = { ...envelope, ...canonicalPayload }
            const eventType = currentEventType || event.type || ''

            if (eventType === 'start') {
              const metadata = updateMetadata(event)
              if (event.sessionId) setSessionId(event.sessionId)
              const state = classifyAiStart(metadata.mode)
              const presentation = describeAiRun(state, metadata)
              setRunState(state)
              setMessages((prev) => patchLastAssistant(prev, {
                runDetail: presentation.detail,
                runState: state,
                runStatus: presentation.label,
                sourceMetadata: metadata,
                thought: `${presentation.detail}\n`,
              }))
            } else if (eventType === 'thought' || eventType === 'tool' || eventType === 'status') {
              const thoughtValue = event.summary || event.step || event.content
              const thoughtText = typeof thoughtValue === 'string' ? thoughtValue : ''
              if (thoughtText) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1]
                  if (last?.role !== 'assistant') return prev
                  const existingThought = last.thought || ''
                  if (existingThought.includes(thoughtText)) return prev
                  return patchLastAssistant(prev, {
                    thought: existingThought + thoughtText + '\n',
                    runDetail: describeAiRun('checking', requestMetadata).detail,
                    runState: 'checking',
                    runStatus: describeAiRun('checking', requestMetadata).label,
                    sourceMetadata: requestMetadata,
                  })
                })
                setRunState('checking')
              }
            } else if (eventType === 'uncertainty') {
              const uncertainty = parseAiUncertainty(event)
              if (uncertainty) {
                const missing = uncertainty.missingEvidence?.length
                  ? ` Missing: ${uncertainty.missingEvidence.join(', ').replaceAll('_', ' ').toLowerCase()}.`
                  : ''
                setAssistantStatus('checking', {
                  thought: `Evidence review: ${uncertainty.reasonCode || 'additional support is required'}.${missing}\n`,
                  uncertainty,
                })
              }
            } else if (eventType === 'citation') {
              if (event.title || event.citationId) {
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    const citation = event as AiCitation
                    const citations = [...(last.citations || [])]
                    const existingIndex = citations.findIndex((item) =>
                      item.citationId && item.citationId === citation.citationId
                    )
                    if (existingIndex >= 0) citations[existingIndex] = citation
                    else citations.push(citation)
                    updated[updated.length - 1] = { ...last, citations: citations.slice(0, 25) }
                  }
                  return updated
                })
              }
            } else if (eventType === 'token' || eventType === 'delta') {
              const tokenValue = event.delta ?? event.token ?? event.content
              const tokenText = typeof tokenValue === 'string' ? tokenValue : ''
              if (tokenText) {
                contentCharacters += tokenText.length
                setRunState('streaming')
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: (last.content || '') + tokenText,
                      runDetail: describeAiRun('streaming', requestMetadata).detail,
                      runState: 'streaming',
                      runStatus: describeAiRun('streaming', requestMetadata).label,
                      sourceMetadata: requestMetadata,
                    }
                  }
                  return updated
                })
              }
            } else if (eventType === 'proposal') {
              const proposal = buildAiProposal({
                additions: Array.isArray(event.additions) ? event.additions as AiAction[] : [],
                codeFixes: Array.isArray(event.codeFixes) ? event.codeFixes as AiCodeFix[] : [],
                id: typeof event.eventId === 'string' ? event.eventId : `ai-${requestId}-proposal`,
                projectId: currentProject?.id,
                removals: Array.isArray(event.removals) ? event.removals as AiAction[] : [],
                sourceEditorRevision,
                sourceProjectRevision: requestMetadata.projectRevision || currentProject?.updatedAt,
                valueChanges: Array.isArray(event.valueChanges) ? event.valueChanges as AiAction[] : [],
                wireSuggestions: Array.isArray(event.wireSuggestions) ? event.wireSuggestions as AiWireSuggestion[] : [],
              })
              setAssistantStatus('checking', {
                additions: event.additions || undefined,
                removals: event.removals || undefined,
                valueChanges: event.valueChanges || undefined,
                wireSuggestions: event.wireSuggestions || undefined,
                codeFixes: event.codeFixes || undefined,
                proposal,
              })
            } else if (eventType === 'error') {
              const code = typeof event.code === 'string' ? event.code : undefined
              const state = classifyAiTerminal('error', code, contentCharacters)
              const errorMessage = safeAiErrorMessage(code)
              terminalState = state
              setIsStreaming(false)
              const presentation = describeAiRun(state, requestMetadata)
              setRunState(state)
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                return patchLastAssistant(prev, {
                  content: last?.content ? `${last.content}\n\n${errorMessage}` : errorMessage,
                  errorCode: code,
                  isStreaming: false,
                  runDetail: presentation.detail,
                  runState: state,
                  runStatus: presentation.label,
                  sourceMetadata: requestMetadata,
                })
              })
            } else if (eventType === 'metadata') {
              updateMetadata(event)
            } else if (eventType === 'done' || eventType === 'complete' || event.reply) {
              const metadata = updateMetadata(event)
              if (event.sessionId) setSessionId(event.sessionId)
              terminalState = classifyAiTerminal('complete', undefined, contentCharacters)
              setIsStreaming(false)
              const completeContent = typeof event.reply === 'string' ? event.reply : ''
              if (completeContent) contentCharacters = Math.max(contentCharacters, completeContent.length)
              const presentation = describeAiRun('complete', metadata)
              const proposalFromEvent = buildAiProposal({
                additions: Array.isArray(event.additions) ? event.additions as AiAction[] : [],
                codeFixes: Array.isArray(event.codeFixes) ? event.codeFixes as AiCodeFix[] : [],
                id: typeof event.eventId === 'string' ? event.eventId : `ai-${requestId}-complete`,
                projectId: currentProject?.id,
                removals: Array.isArray(event.removals) ? event.removals as AiAction[] : [],
                sourceEditorRevision,
                sourceProjectRevision: metadata.projectRevision || currentProject?.updatedAt,
                valueChanges: Array.isArray(event.valueChanges) ? event.valueChanges as AiAction[] : [],
                wireSuggestions: Array.isArray(event.wireSuggestions) ? event.wireSuggestions as AiWireSuggestion[] : [],
              })
              setRunState('complete')
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                return patchLastAssistant(prev, {
                  additions: event.additions || undefined,
                  citations: event.citations || undefined,
                  codeFixes: event.codeFixes || undefined,
                  confidence: typeof event.confidence === 'number' ? event.confidence : last?.confidence,
                  content: completeContent || last?.content || '',
                  grounding: event.grounding || undefined,
                  isStreaming: false,
                  proposal: proposalFromEvent || last?.proposal,
                  removals: event.removals || undefined,
                  runDetail: presentation.detail,
                  runState: 'complete',
                  runStatus: presentation.label,
                  sourceMetadata: metadata,
                  valueChanges: event.valueChanges || undefined,
                  wireSuggestions: event.wireSuggestions || undefined,
                })
              })
            }
            currentEventType = ''
          } catch {
            // Non-JSON line or partial chunk — ignore
          }
        }
      }


    } catch {
      if (!controller.signal.aborted && requestId === requestSequenceRef.current) {
        terminalState = 'offline'
        const presentation = describeAiRun('offline', requestMetadata)
        setRunState('offline')
        setMessages((prev) => patchLastAssistant(prev, {
          content: prev[prev.length - 1]?.content || safeAiErrorMessage(),
          isStreaming: false,
          runDetail: presentation.detail,
          runState: 'offline',
          runStatus: presentation.label,
          sourceMetadata: requestMetadata,
        }))
      }
    } finally {
      if (requestId === requestSequenceRef.current) {
        const finalState: AiRunState = controller.signal.aborted
          ? (contentCharacters > 0 ? 'partial' : 'cancelled')
          : terminalState || (sawDone ? 'complete' : 'error')
        const presentation = describeAiRun(finalState, requestMetadata)
        setRunState(finalState)
        setIsStreaming(false)
        abortRef.current = null
        if (isMemoryOpen) void refreshMemory()
        setMessages((prev) =>
          prev.map((m) => (m.isStreaming ? {
            ...m,
            content: m.content || (finalState === 'partial'
              ? 'The response stopped before completion. Review it before using it.'
              : finalState === 'cancelled'
                ? 'The response was canceled. No project changes were made.'
                : finalState === 'error'
                  ? safeAiErrorMessage()
                  : finalState === 'complete' ? 'No response was returned.' : m.content),
            isStreaming: false,
            runDetail: presentation.detail,
            runState: finalState,
            runStatus: presentation.label,
            sourceMetadata: requestMetadata,
          } : m))
        )
      }
    }
  }, [buildPayload, currentProject?.codeFiles, currentProject?.id, currentProject?.updatedAt, isMemoryOpen, modelRevision, nodes, refreshMemory, wires])

  const cancelStream = useCallback(() => {
    if (!abortRef.current) return
    abortRef.current.abort()
    setRunState('cancelled')
  }, [])

  const closePanel = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    onClose()
  }, [onClose])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    handleSendStream(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const toggleProposalItem = (proposal: AiProposal, itemId: string) => {
    setProposalSelections((previous) => {
      const selected = previous[proposal.id] || defaultAiProposalSelection(proposal)
      return {
        ...previous,
        [proposal.id]: selected.includes(itemId)
          ? selected.filter((id) => id !== itemId)
          : [...selected, itemId],
      }
    })
  }

  const applyProposal = (proposal: AiProposal, selectedIds: string[]) => {
    if (readOnly || isApplyingProposal) return
    if (!currentProject?.id) {
      addToast('No project is loaded for this proposal.', 'error')
      return
    }

    const currentProjectState = useProjectStore.getState()
    const currentCanvasState = useCanvasStore.getState()
    const currentEditorRevision = calculateEditorRevision(
      currentCanvasState.nodes,
      currentCanvasState.wires,
      currentProjectState.currentProject?.codeFiles || [],
      currentCanvasState.modelRevision,
    )
    if (!isAiProposalCurrent(proposal, {
      editorRevision: currentEditorRevision,
      projectId: currentProjectState.currentProject?.id,
      projectRevision: currentProjectState.currentProject?.updatedAt,
    })) {
      addToast('This AI proposal is stale. Regenerate it against the current project revision.', 'error')
      return
    }

    const selected = proposal.items.filter((item) => selectedIds.includes(item.id))
    if (selected.length === 0) {
      addToast('Select at least one proposed change to apply.', 'info')
      return
    }

    setIsApplyingProposal(true)
    const plan = planAiProposalChanges(proposal, selectedIds, {
      activeCodeFile: currentProjectState.activeCodeFile,
      nodes: currentCanvasState.nodes,
      wires: currentCanvasState.wires,
    })

    if (plan.errors.length > 0) {
      setIsApplyingProposal(false)
      addToast(`Proposal rejected: ${plan.errors[0]}`, 'error')
      return
    }

    const { beforeCode, canvasChanged, codeChanged, nextCode, nextNodes, nextWires } = plan
    if (!canvasChanged && !codeChanged) {
      setIsApplyingProposal(false)
      addToast('The selected proposal does not change the current project.', 'info')
      return
    }

    if (canvasChanged) useCanvasStore.getState().commitCanvasSnapshot(nextNodes, nextWires)
    if (codeChanged && currentProjectState.activeCodeFile && typeof nextCode === 'string') {
      updateCodeFileContent(currentProjectState.activeCodeFile.id, nextCode)
    }

    const afterProjectState = useProjectStore.getState()
    const afterCanvasState = useCanvasStore.getState()
    const afterEditorRevision = calculateEditorRevision(
      afterCanvasState.nodes,
      afterCanvasState.wires,
      afterProjectState.currentProject?.codeFiles || [],
      afterCanvasState.modelRevision,
    )
    setAppliedTransaction({
      afterEditorRevision,
      beforeCode: codeChanged ? beforeCode : undefined,
      canvasChanged,
      codeFileId: codeChanged ? currentProjectState.activeCodeFile?.id : undefined,
      projectId: currentProjectState.currentProject?.id,
      proposalId: proposal.id,
    })
    setIsApplyingProposal(false)
    addToast(`${selected.length} AI change${selected.length === 1 ? '' : 's'} applied as one reviewable transaction.`, 'success')
  }

  const undoAppliedProposal = (proposal: AiProposal) => {
    if (!appliedTransaction || appliedTransaction.proposalId !== proposal.id) return
    const projectState = useProjectStore.getState()
    const canvasState = useCanvasStore.getState()
    const currentEditorRevision = calculateEditorRevision(
      canvasState.nodes,
      canvasState.wires,
      projectState.currentProject?.codeFiles || [],
      canvasState.modelRevision,
    )
    if (currentEditorRevision !== appliedTransaction.afterEditorRevision
      || projectState.currentProject?.id !== appliedTransaction.projectId) {
      addToast('The editor changed after this AI transaction. Use the normal editor history to review it.', 'error')
      return
    }
    if (appliedTransaction.canvasChanged) useCanvasStore.getState().undo()
    if (appliedTransaction.codeFileId && typeof appliedTransaction.beforeCode === 'string') {
      updateCodeFileContent(appliedTransaction.codeFileId, appliedTransaction.beforeCode)
    }
    setAppliedTransaction(undefined)
    addToast('AI transaction undone.', 'success')
  }

  // Inline Markdown parser (bold, italic, code, links)
  const renderInline = (text: string): React.ReactNode[] => {
    if (!text) return []
    const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
    return tokens.map((token, idx) => {
      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return <code key={idx} className="vf-ai-inline-code">{token.slice(1, -1)}</code>
      }
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return <strong key={idx} className="vf-ai-bold">{token.slice(2, -2)}</strong>
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return <em key={idx} className="vf-ai-italic">{token.slice(1, -1)}</em>
      }
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        return (
          <a key={idx} href={linkMatch[2]} target="_blank" rel="noreferrer" className="vf-ai-link">
            {linkMatch[1]}
          </a>
        )
      }
      return token
    })
  }

  // Block-level Markdown parser (headers, bullet lists, numbered lists, tables, paragraphs)
  const renderMarkdownBlock = (blockText: string, blockKey: string | number) => {
    const lines = blockText.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        i++
        continue
      }

      // 1. Table Detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && lines[i + 1]?.trim().startsWith('|')) {
        const tableLines: string[] = []
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim())
          i++
        }
        if (tableLines.length >= 2) {
          const headerCells = tableLines[0].split('|').slice(1, -1).map(c => c.trim())
          const rowLines = tableLines.slice(tableLines[1]?.includes('---') ? 2 : 1)
          elements.push(
            <div key={`tbl-${blockKey}-${i}`} className="vf-ai-table-wrap">
              <table className="vf-ai-table">
                <thead>
                  <tr>
                    {headerCells.map((h, hi) => (
                      <th key={hi}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowLines.map((row, ri) => {
                    const cells = row.split('|').slice(1, -1).map(c => c.trim())
                    return (
                      <tr key={ri}>
                        {cells.map((cell, ci) => (
                          <td key={ci}>{renderInline(cell)}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
          continue
        }
      }

      // 2. Headers
      const headerMatch = trimmed.match(/^(#{1,4})\s+(.*)$/)
      if (headerMatch) {
        const level = headerMatch[1].length
        const text = headerMatch[2]
        elements.push(
          <div key={`h-${blockKey}-${i}`} className={`vf-ai-h vf-ai-h${level}`}>
            {renderInline(text)}
          </div>
        )
        i++
        continue
      }

      // 3. Unordered Lists (- or * or •)
      if (/^[-*•]\s+/.test(trimmed)) {
        const listItems: string[] = []
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^[-*•]\s+/, ''))
          i++
        }
        elements.push(
          <ul key={`ul-${blockKey}-${i}`} className="vf-ai-ul">
            {listItems.map((item, liIdx) => (
              <li key={liIdx} className="vf-ai-li">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        )
        continue
      }

      // 4. Ordered Lists (1. 2. etc)
      if (/^\d+\.\s+/.test(trimmed)) {
        const listItems: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
          i++
        }
        elements.push(
          <ol key={`ol-${blockKey}-${i}`} className="vf-ai-ol">
            {listItems.map((item, liIdx) => (
              <li key={liIdx} className="vf-ai-li">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        )
        continue
      }

      // 5. Standard Paragraph
      elements.push(
        <p key={`p-${blockKey}-${i}`} className="vf-ai-p">
          {renderInline(trimmed)}
        </p>
      )
      i++
    }

    return elements
  }

  // Extract code blocks from message and render
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const codeMatch = part.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/)
        const code = codeMatch ? codeMatch[1].trim() : part.replace(/```/g, '').trim()
        return (
          <div key={i} className="vf-ai-chat__code-wrap">
            <CodeBlock code={code} language="cpp" />
          </div>
        )
      }
      return (
        <div key={i} className="vf-ai-chat__markdown-block">
          {renderMarkdownBlock(part, i)}
        </div>
      )
    })
  }


  const renderMessageActions = (msg: Message) => {
    if (msg.role !== 'assistant' || msg.isStreaming || !msg.proposal) return null
    const selectedIds = proposalSelections[msg.proposal.id] || defaultAiProposalSelection(msg.proposal)
    const currentRevision = calculateEditorRevision(nodes, wires, currentProject?.codeFiles || [], modelRevision)
    const isStale = !isAiProposalCurrent(msg.proposal, {
      editorRevision: currentRevision,
      projectId: currentProject?.id,
      projectRevision: currentProject?.updatedAt,
    })
    const undoAvailable = Boolean(
      appliedTransaction?.proposalId === msg.proposal.id
      && appliedTransaction.afterEditorRevision === currentRevision,
    )
    return (
      <AiProposalReview
        isStale={isStale}
        isWorking={isApplyingProposal}
        onApply={() => applyProposal(msg.proposal!, selectedIds)}
        onToggle={(itemId) => toggleProposalItem(msg.proposal!, itemId)}
        onUndo={() => undoAppliedProposal(msg.proposal!)}
        proposal={msg.proposal}
        selectedIds={selectedIds}
        undoAvailable={undoAvailable}
      />
    )
  }

  const runPresentation = describeAiRun(runState, runMetadata)

  if (!isOpen) return null

  return (
    <div className="vf-ai-chat">
      {/* Header */}
      <header className="vf-ai-chat__header">
        <div className="vf-ai-chat__brand">
          <div className="vf-ai-chat__brand-icon">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="vf-ai-chat__brand-name">VoltForge AI</h3>
            <span className="vf-ai-chat__brand-sub">Local project engineering assistant</span>
          </div>
        </div>
        <div className="vf-ai-chat__header-actions">
          <button
            onClick={() => setIsMemoryOpen((value) => !value)}
            className={`vf-ai-chat__memory-toggle${isMemoryOpen ? ' is-active' : ''}`}
            type="button"
            aria-label={`${isMemoryOpen ? 'Close' : 'Inspect'} project memory${memoryState?.enabled ? ` (${memoryState.entryCount} item${memoryState.entryCount === 1 ? '' : 's'})` : ''}`}
            aria-expanded={isMemoryOpen}
          >
            <Brain size={13} />
            <span>{memoryState?.enabled ? memoryState.entryCount : 0}</span>
          </button>
          <button
            onClick={closePanel}
            className="vf-ai-chat__close"
            type="button"
            aria-label="Close assistant"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </header>

      <div className={`vf-ai-chat__status vf-ai-chat__status--${runState}`} role="status" aria-live="polite" aria-atomic="true">
        <span className="vf-ai-chat__status-indicator" aria-hidden="true" />
        <div className="vf-ai-chat__status-copy">
          <strong>{runPresentation.label}</strong>
          <span className="vf-ai-chat__status-detail">{runPresentation.detail}</span>
        </div>
        {sessionId && <span className="vf-ai-chat__status-session">Session active</span>}
        {isStreaming && (
          <button type="button" className="vf-ai-chat__cancel" onClick={cancelStream} aria-label="Cancel VoltForge AI response">
            Stop
          </button>
        )}
      </div>

      {isMemoryOpen && (
        <section className="vf-ai-chat__memory" aria-labelledby="vf-ai-memory-heading">
          <div className="vf-ai-chat__memory-heading">
            <div>
              <strong id="vf-ai-memory-heading">Bounded project memory</strong>
              <span>{memoryState?.enabled ? `${memoryState.entryCount} inspectable item(s)` : 'Disabled by default'}</span>
            </div>
            <button
              type="button"
              className="vf-ai-chat__memory-action"
              disabled={isMemoryBusy || !currentProject}
              onClick={() => void setMemoryEnabled(!memoryState?.enabled)}
            >
              {memoryState?.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          <p className="vf-ai-chat__memory-note">
            User memory is revision-bound context, never engineering evidence or training data.
          </p>
          {memoryLoadState === 'loading' && <div className="vf-ai-chat__memory-status" role="status">Loading project memory…</div>}
          {memoryLoadState === 'unavailable' && (
            <div className="vf-ai-chat__memory-status" role="status">
              Project memory is unavailable. Chat remains available and no memory was changed.
            </div>
          )}
          {memoryState && (
            <>
              {memoryState.enabled && (
                <div className="vf-ai-chat__memory-compose">
                  <input
                    aria-label="Fact to remember for this project"
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                    maxLength={1200}
                    placeholder="Fact to remember for this project"
                  />
                  <button type="button" disabled={isMemoryBusy || !memoryDraft.trim()} onClick={() => void rememberFact()}>Remember</button>
                </div>
              )}
              <div className="vf-ai-chat__memory-list">
                {memoryState.entries.map((entry) => (
                  <div key={entry.memoryId} className="vf-ai-chat__memory-entry">
                    <div className="vf-ai-chat__memory-entry-meta">
                      <span>{entry.kind}</span>
                      {entry.staleForProjectRevision && <span className="is-stale">stale revision</span>}
                    </div>
                    {editingMemoryId === entry.memoryId ? (
                      <div className="vf-ai-chat__memory-edit">
                        <input aria-label={`Correct memory ${entry.memoryId}`} value={editingMemoryContent} maxLength={1200} onChange={(event) => setEditingMemoryContent(event.target.value)} />
                        <button type="button" disabled={isMemoryBusy} aria-label={`Save correction for memory ${entry.memoryId}`} onClick={() => void saveMemoryCorrection()}>Save</button>
                      </div>
                    ) : <p>{entry.content}</p>}
                    <div className="vf-ai-chat__memory-entry-actions">
                      <button type="button" disabled={isMemoryBusy} aria-label={`Correct memory ${entry.memoryId}`} onClick={() => { setEditingMemoryId(entry.memoryId); setEditingMemoryContent(entry.content) }}>Correct</button>
                      <button type="button" disabled={isMemoryBusy} aria-label={`Delete memory ${entry.memoryId}`} onClick={() => void deleteMemory(entry.memoryId)}>Delete</button>
                    </div>
                  </div>
                ))}
                {memoryState.entries.length === 0 && <span className="vf-ai-chat__memory-empty">No approved memory yet.</span>}
              </div>
              <div className="vf-ai-chat__memory-footer">
                <button type="button" disabled={!sessionId || isMemoryBusy} onClick={() => void clearMemory('session')}>Clear session</button>
                <button type="button" disabled={isMemoryBusy} onClick={() => void clearMemory('project')}>Clear project</button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="vf-ai-chat__messages">
        {messages.length === 0 && (
          <div className="vf-ai-chat__welcome">
            <div className="vf-ai-chat__welcome-icon">
              <Bot size={28} />
            </div>
            <h3>VoltForge AI Assistant</h3>
            <p>Ask me about circuits, components, Arduino code, or debugging</p>
            <SuggestionsList
              suggestions={[
                'How do I connect an LED to Arduino?',
                'Generate code for a temperature sensor',
                'What resistor do I need for a 5V LED?',
              ]}
              onSelect={(suggestion) => setInput(suggestion)}
            />
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`vf-ai-chat__msg ${
              msg.role === 'user' ? 'vf-ai-chat__msg--user' : 'vf-ai-chat__msg--assistant'
            }`}
          >
            <div className="vf-ai-chat__msg-avatar">
              {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
            </div>
            <div className="vf-ai-chat__msg-body">
              {/* User-visible engineering status; hidden model reasoning is never displayed. */}
              {msg.role === 'assistant' && msg.thought && (
                <details className="vf-ai-chat__thinking" open={msg.isStreaming && !msg.content}>
                  <summary className="vf-ai-chat__thinking-summary">
                    <Brain size={12} />
                    <span>{msg.isStreaming && !msg.content ? 'Running engineering checks...' : 'Engineering checks'}</span>
                  </summary>
                  <div className="vf-ai-chat__thinking-content">
                    {msg.thought.split('\n').filter(Boolean).map((step, si) => (
                      <div key={si} className="vf-ai-chat__thinking-step">{step}</div>
                    ))}
                  </div>
                </details>
              )}

              {/* Main response content */}
              {msg.content && renderMessageContent(msg.content)}
              {msg.isStreaming && <span className="vf-ai-chat__cursor">|</span>}

              {/* Action buttons */}
              {renderMessageActions(msg)}

              {msg.role === 'assistant' && msg.runState && ['partial', 'cancelled', 'offline', 'error'].includes(msg.runState) && (
                <div className={`vf-ai-chat__message-status vf-ai-chat__message-status--${msg.runState}`} role="status">
                  <strong>{msg.runStatus}</strong>
                  <span>{msg.runDetail}</span>
                </div>
              )}

              {msg.role === 'assistant' && msg.sourceMetadata && collectAiSources(msg.sourceMetadata).length > 0 && (
                <div className="vf-ai-chat__sources" aria-label="Response source trail">
                  <span className="vf-ai-chat__sources-label">Source trail</span>
                  {collectAiSources(msg.sourceMetadata).map((source) => (
                    <span key={source.kind} className={`vf-ai-chat__source vf-ai-chat__source--${source.kind}`} title={source.detail}>
                      {source.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Confidence badge */}
              {msg.role === 'assistant' && !msg.isStreaming && typeof msg.confidence === 'number' && (
                <div className="vf-ai-chat__meta">
                  Confidence {Math.round(msg.confidence * 100)}%
                  {msg.confidence < 0.65 && <span className="vf-ai-chat__low-confidence">Low confidence — verify before use.</span>}
                </div>
              )}

              {msg.role === 'assistant' && !msg.isStreaming && msg.uncertainty && (
                <div className="vf-ai-chat__uncertainty" role="status">
                  <strong>Evidence uncertainty</strong>
                  <span>{msg.uncertainty.reasonCode || 'Some supporting evidence is incomplete.'}</span>
                  {msg.uncertainty.missingEvidence?.length ? (
                    <span>Missing: {msg.uncertainty.missingEvidence.join(', ').replaceAll('_', ' ').toLowerCase()}</span>
                  ) : null}
                </div>
              )}

              {msg.role === 'assistant' && !msg.isStreaming && msg.grounding && ['uncertain', 'conflicted'].includes(msg.grounding.status) && (
                <div className={`vf-ai-chat__grounding vf-ai-chat__grounding--${msg.grounding.status}`} role="status">
                  <strong>{msg.grounding.status === 'conflicted' ? 'Evidence conflict' : 'Evidence unavailable'}</strong>
                  <span>
                    {msg.grounding.status === 'conflicted'
                      ? 'Sources disagree, so VoltForge AI did not present the disputed claim as fact.'
                      : 'An unsupported factual claim was replaced with explicit uncertainty.'}
                  </span>
                  {msg.grounding.uncertainty.missingEvidence.length > 0 && (
                    <span>{msg.grounding.uncertainty.missingEvidence.join(', ').replaceAll('_', ' ').toLowerCase()}</span>
                  )}
                </div>
              )}

              {/* Exact bounded evidence, visibly separated by authority/source class. */}
              {msg.role === 'assistant' && !msg.isStreaming && msg.citations && msg.citations.length > 0 && (
                <div className="vf-ai-chat__citations" aria-label="Evidence and citations">
                  {msg.citations.slice(0, 8).map((citation, citationIndex) => {
                    const kind = citation.evidenceKind
                    const content = (
                      <>
                        <span className={`vf-ai-chat__citation-kind vf-ai-chat__citation-kind--${kind || 'generic'}`}>
                          {kind ? evidenceKindLabels[kind] : 'Evidence'}
                        </span>
                        <span>{citation.title || citation.citationId || 'Evidence item'}</span>
                        {citation.supportStatus === 'conflicted' && <span className="vf-ai-chat__citation-state">conflicted</span>}
                        {citation.untrustedContent && <span className="vf-ai-chat__citation-state">untrusted source</span>}
                        {citation.snippet && <span className="vf-ai-chat__citation-snippet">{citation.snippet}</span>}
                        {citation.locator && <span className="vf-ai-chat__citation-meta">{citation.locator}</span>}
                      </>
                    )
                    return citation.url ? (
                      <a
                        key={citation.citationId || `${citation.url}-${citationIndex}`}
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="vf-ai-chat__citation"
                      >
                        {content}
                      </a>
                    ) : (
                      <div key={citation.citationId || `${citation.title}-${citationIndex}`} className="vf-ai-chat__citation">
                        {content}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.thought && !messages[messages.length - 1]?.content && (
          <div className="vf-ai-chat__msg vf-ai-chat__msg--assistant">
            <div className="vf-ai-chat__msg-avatar">
              <Bot size={12} />
            </div>
            <div className="vf-ai-chat__msg-body">
              <div className="vf-ai-chat__typing">
                <span className="vf-ai-chat__typing-dot" />
                <span className="vf-ai-chat__typing-dot" />
                <span className="vf-ai-chat__typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="vf-ai-chat__input-area">
        <div className="vf-ai-chat__input-row">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask VoltForge AI..."
            aria-label="Ask VoltForge AI about the current project"
            rows={1}
            className="vf-ai-chat__textarea"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="vf-ai-chat__send"
            type="button"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
export { AiChatPanel }
