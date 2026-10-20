import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Brain, Send, Sparkles, User, PanelLeft, Maximize2, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useConversationHistory } from './useConversationHistory'
import { ConversationSidebar } from './ConversationSidebar'
import { NewConversationDialog } from './NewConversationDialog'
import { conversationApi, type SavedMessage } from './conversationApi'
import './chatWorkspace.css'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useToastStore } from '../../store/useToastStore'
import type { ExecutionAttachment } from './executionContext'
import { getBoardProfile, supportsAvr8js } from '../canvas/boardCatalog'
import { useQuery } from '@tanstack/react-query'
import { aiApi, projectApi } from '../../api/services'
import { buildCircuitNetlist } from '../canvas/netlist'
import { Textarea } from '../../components/ui/Field'
import { SuggestionsList } from '../../components/ui/SuggestionsList'
import { CodeBlock } from '../../components/ui/CodeBlock'
import { sanitizeUrl } from '../../utils/security'
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
  executionAttachment?: ExecutionAttachment
  workspace?: boolean
  isOpen: boolean
  readOnly?: boolean
  onClose: () => void
  projectContext?: string
}

interface Message {
  id?: string
  clientRequestId?: string
  savedStatus?: SavedMessage['status']
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
  if (event.mode === 'neural' || event.mode === 'neural-quality-gated' || event.mode === 'deterministic-fallback' || event.mode === 'unavailable') {
    next.mode = event.mode
  }
  if (typeof event.model === 'string') next.model = event.model
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
  workspace = false,
  executionAttachment,
}: Props) {
  const { t } = useTranslation()
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
  const sendLock = useRef(false)
  const nearBottom = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const [showHistory, setShowHistory] = useState(workspace)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [includeContext, setIncludeContext] = useState(false)
  const [sendError, setSendError] = useState('')
  const [retryRequest, setRetryRequest] = useState<{ id: string; content: string }>()
  
  const { modelRevision, nodes, selectedNodeId, selectedWireId, wires } = useCanvasStore()
  const { currentProject, activeCodeFile, updateCodeFileContent } = useProjectStore()
  const addToast = useToastStore((s) => s.addToast)
  const setResultDataConsumer = useSimulationStore((s) => s.setResultDataConsumer)
  const auth = useAuth()
  const restoreMessages = useCallback((saved: SavedMessage[]) => {
    setMessages(saved.map(message => ({
      id: message.id, clientRequestId: message.clientRequestId, role: message.role, content: message.content,
      savedStatus: message.status, isStreaming: false,
      sourceMetadata: message.metadata as AiRunMetadata | undefined,
      citations: message.metadata?.citations as AiCitation[] | undefined,
      confidence: typeof message.metadata?.confidence === 'number' ? message.metadata.confidence : undefined,
      grounding: message.metadata?.grounding as AiGroundingReport | undefined,
      uncertainty: message.metadata?.uncertainty as AiUncertainty | undefined,
      ...(message.role === 'assistant' && message.status !== 'completed' ? {
        runState: 'partial' as const, runStatus: message.status === 'pending' ? 'Still generating' : 'Response incomplete',
        runDetail: message.status === 'pending' ? 'Another request may still be running. Refresh or stop it before continuing.' : 'Your message is saved. Retry this response or continue the conversation.',
      } : {}),
    })))
    setRunState('idle'); setRunMetadata({}); setRetryRequest(undefined); setSendError('')
    setProposalSelections({}); setAppliedTransaction(undefined)
  }, [])
  const history = useConversationHistory(auth.user?.id, !workspace && !readOnly ? currentProject?.id : undefined, restoreMessages, isStreaming)
  const activeConversationId = history.active?.id
  const contextAvailable = workspace ? !!history.active?.projectId : !readOnly && !!currentProject?.id && (!history.active || history.active.projectId === currentProject.id)
  const savedProjectContext = useQuery({
    queryKey: ['chat-project-context', auth.user?.id, history.active?.projectId],
    queryFn: async () => (await projectApi.getById(history.active!.projectId!)).data.data,
    enabled: workspace && includeContext && !!history.active?.projectId,
    staleTime: 0,
  })
  const relevantAttachment = executionAttachment?.projectId === currentProject?.id ? executionAttachment : undefined
  const [attachmentVisible, setAttachmentVisible] = useState(true)
  useEffect(() => {
    if (!executionAttachment) return
    setInput('Help me understand the serial output and execution diagnostics attached to this message.')
    setAttachmentVisible(true)
    setIncludeContext(false)
  }, [executionAttachment])
  const executionDiagnostic = useSimulationStore(s => s.execution.diagnostic)
  const hasSerialOutput = useSimulationStore(s => s.serialEntries.some(entry => entry.kind === 'output'))
  const pendingResponse = messages.some(message => message.savedStatus === 'pending')

  useEffect(() => { setSessionId(activeConversationId); setIncludeContext(false) }, [activeConversationId])
  useEffect(() => {
    requestSequenceRef.current += 1
    abortRef.current?.abort()
    setIsStreaming(false)
    sendLock.current = false
  }, [auth.user?.id])

  const newChat = async () => {
    if (sendLock.current || history.loading) return
    if (workspace) { setShowNewDialog(true); return }
    await history.create()
    setShowHistory(false)
  }

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
      if (response.data.data.status === 'unavailable') throw new Error('Project memory unavailable')
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
    const contextProject = workspace ? savedProjectContext.data : currentProject
    const contextNodes = workspace ? contextProject?.canvasLayout?.nodes || [] : nodes
    const contextWires = workspace ? contextProject?.canvasLayout?.wires || [] : wires
    const contextFile = workspace ? contextProject?.codeFiles?.[0] : activeCodeFile
    const simState = useSimulationStore.getState()
    const netlist = buildCircuitNetlist(contextNodes, contextWires)
    const components = contextNodes.map((n) => ({
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
    const serializedWires = contextWires.map((w) => ({
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
    const code = contextFile?.content || contextProject?.codeFiles?.[0]?.content || ''
    const simulationState = workspace ? { status: 'No live runtime in AI Workspace; saved project configuration only' } : {
      execution: simState.execution.projectId === contextProject?.id ? simState.execution : undefined,
      baudRate: simState.baudRate,
      isSimulating: simState.isSimulating,
      executionMode: simState.executionMode,
      fidelityMode: simState.fidelityMode,
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
      serialBuffer: simState.serialEntries.filter(entry => entry.kind === 'output').slice(-40),
      diagnostics: simState.serialEntries.filter(entry => entry.kind === 'diagnostic').slice(-10),
      selectedOutput: attachmentVisible ? relevantAttachment : undefined,
    }
    const richContext = JSON.stringify({
      projectName: contextProject?.name || projectContext,
      boardType: contextProject?.boardType,
      boardCapabilities: { definition: getBoardProfile(contextProject?.boardType || ''), browserFirmwareEmulation: supportsAvr8js(contextProject?.boardType || '') },
      selectedNodeId: workspace ? undefined : selectedNodeId,
      selectedWireId: workspace ? undefined : selectedWireId,
      activeFile: contextFile
        ? { filename: contextFile.filename, language: contextFile.language }
        : null,
      components,
      wires: serializedWires,
      netlist: netlistPayload,
      codeSnippet: code ? code.slice(0, 2000) : '',
      simulationState,
    }).slice(0, 48_000)
    return {
      boardType: contextProject?.boardType,
      boardCapabilities: { definition: getBoardProfile(contextProject?.boardType || ''), browserFirmwareEmulation: supportsAvr8js(contextProject?.boardType || '') },
      components,
      wires: serializedWires,
      netlist: netlistPayload,
      code,
      canvasData: { components, wires: serializedWires, netlist: netlistPayload },
      simulationState,
      sessionId,
      projectId: contextProject?.id,
      projectRevision: contextProject?.updatedAt,
      files: (contextProject?.codeFiles || []).slice(0, 5).map((file) => ({
        content: file.content.slice(0, 60_000),
        filename: file.filename,
        language: file.language,
      })),
      context: richContext,
      canvasContext: richContext,
      history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    }
  }, [nodes, wires, activeCodeFile, currentProject, workspace, savedProjectContext.data, projectContext, selectedNodeId, selectedWireId, messages, sessionId, relevantAttachment, attachmentVisible])

  const handleSendStream = async (userMessage: string, retryId?: string) => {
    if (sendLock.current || history.loading || !auth.isAuthenticated) return
    if (includeContext && workspace && (savedProjectContext.isFetching || savedProjectContext.isError || savedProjectContext.data?.id !== history.active?.projectId)) {
      setSendError('Saved project context is not available. Retry loading it or turn off sharing.'); return
    }
    sendLock.current = true
    const requestId = ++requestSequenceRef.current
    const clientRequestId = retryId || crypto.randomUUID()
    setSendError('')
    const conversation = history.active || await history.create()
    if (requestId !== requestSequenceRef.current) { sendLock.current = false; return }
    if (!conversation) { sendLock.current = false; setInput(userMessage); return }
    setRetryRequest({ id: clientRequestId, content: userMessage })
    const payload = includeContext && contextAvailable ? buildPayload() : {}
    const sourceEditorRevision = calculateEditorRevision(nodes, wires, currentProject?.codeFiles || [], modelRevision)
    let requestMetadata: AiRunMetadata = {}
    let terminalState: AiRunState | undefined
    let contentCharacters = 0
    let sawDone = false
    let accepted = false

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

    // The accepted event confirms the user message committed before rendering it.
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
        clientRequestId,
        retry: !!retryId,
        includeProjectContext: includeContext && contextAvailable,
      }, controller.signal, conversation.id)

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

            if (eventType === 'accepted') {
              accepted = true
              const saved = event.data as SavedMessage
              history.reconcile(saved)
              setInput('')
              setMessages(prev => [...prev.filter(m => m.clientRequestId !== clientRequestId),
                { id: saved.id, clientRequestId, role: 'user', content: saved.content, savedStatus: saved.status },
                { clientRequestId, role: 'assistant', content: '', isStreaming: true, runState: 'connecting' }])
            } else if (eventType === 'saved') {
              const saved = event.data as SavedMessage
              history.reconcile(saved)
              terminalState = saved.status === 'completed' ? 'complete' : 'partial'
              sawDone = true
              contentCharacters = saved.content.length
              setRunState(terminalState)
              setMessages(prev => patchLastAssistant(prev, {
                id: saved.id, content: saved.content, savedStatus: saved.status, isStreaming: false,
                runState: terminalState, runStatus: saved.status === 'completed' ? 'Saved' : 'Response incomplete',
                runDetail: saved.status === 'completed' ? 'Response saved to your conversation.' : 'Your message is saved. Retry the response to continue.',
              }))
              setRetryRequest(undefined)
              void history.refresh()
            } else if (eventType === 'start') {
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


    } catch (error) {
      if (!controller.signal.aborted && requestId === requestSequenceRef.current) {
        setSendError(error instanceof Error ? error.message : 'The response could not be confirmed. Retry with the same request ID.')
        terminalState = 'offline'
        const presentation = describeAiRun('offline', requestMetadata)
        setRunState('offline')
        if (accepted) setMessages((prev) => patchLastAssistant(prev, {
          content: prev[prev.length - 1]?.content || safeAiErrorMessage(),
          isStreaming: false,
          runDetail: presentation.detail,
          runState: 'offline',
          runStatus: presentation.label,
          sourceMetadata: requestMetadata,
        }))
      }
    } finally {
      sendLock.current = false
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
  }

  const cancelStream = () => {
    abortRef.current?.abort()
    if (activeConversationId) void conversationApi.stop(activeConversationId).then(() => history.open(activeConversationId)).catch(() => setSendError('Could not confirm stop. Refresh the conversation before retrying.'))
    setRunState('cancelled')
  }

  const closePanel = useCallback(() => {
    requestSequenceRef.current += 1
    abortRef.current?.abort()
    setIsStreaming(false)
    onClose()
  }, [onClose])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || msg.length > 6000 || isStreaming || pendingResponse || history.loading || history.error) return
    void handleSendStream(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    if (scrollRef.current && nearBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  // Cleanup abort controller on unmount
  useEffect(() => {
    const sequence = requestSequenceRef
    return () => {
      sequence.current += 1
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
        const safeUrl = sanitizeUrl(linkMatch[2])
        if (safeUrl) {
          return (
            <a key={idx} href={safeUrl} target="_blank" rel="noopener noreferrer" className="vf-ai-link">
              {linkMatch[1]}
            </a>
          )
        }
        return <span key={idx} className="vf-ai-link-disabled">{linkMatch[1]}</span>
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
    <div className={`vf-chat-workspace${workspace ? ' vf-chat-workspace--page' : ''}${showHistory ? ' has-history' : ''}`}>
      {showHistory && <ConversationSidebar history={history} busy={isStreaming} onClose={() => setShowHistory(false)} onNew={() => void newChat()} />}
      <div className="vf-ai-chat">
      {/* Header */}
      <header className="vf-ai-chat__header">
        <div className="vf-ai-chat__brand">
          <div className="vf-ai-chat__brand-icon">
            <Sparkles size={14} />
          </div>
          <div>
            {workspace ? <h1 className="vf-ai-chat__brand-name">{history.active?.title || 'AI Workspace'}</h1> : <h3 className="vf-ai-chat__brand-name">{history.active?.title || 'VoltForge AI'}</h3>}
            <span className="vf-ai-chat__brand-sub">Engineering advice · verify before applying</span>
          </div>
        </div>
        <div className="vf-ai-chat__header-actions">
          <button type="button" title="Conversation history" aria-label="Conversation history" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}><PanelLeft size={16} /></button>
          {(!workspace || !showHistory) && <button type="button" className={workspace ? 'vf-chat-new-action' : undefined} title="New chat" aria-label="New chat" disabled={isStreaming || history.loading} onClick={() => void newChat()}><Plus size={16} />{workspace && <span>New chat</span>}</button>}
          {!workspace && <Link to={activeConversationId ? `/ai-chat?conversation=${activeConversationId}` : '/ai-chat'} title="Open AI workspace" aria-label="Open AI workspace"><Maximize2 size={16} /></Link>}
          {!workspace && <button
            disabled={!currentProject}
            onClick={() => setIsMemoryOpen((value) => !value)}
            className={`vf-ai-chat__memory-toggle${isMemoryOpen ? ' is-active' : ''}`}
            type="button"
            aria-label={`${isMemoryOpen ? 'Close' : 'Inspect'} project memory${memoryState?.enabled ? ` (${memoryState.entryCount} item${memoryState.entryCount === 1 ? '' : 's'})` : ''}`}
            aria-expanded={isMemoryOpen}
          >
            <Brain size={13} />
            <span>{memoryState?.enabled ? memoryState.entryCount : 0}</span>
          </button>}
          {!workspace && <button
            onClick={closePanel}
            className="vf-ai-chat__close"
            type="button"
            aria-label="Close assistant"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>}
        </div>
      </header>
      {!auth.isAuthenticated && <p className="vf-chat-notice">Sign in to use private, saved conversations. <button type="button" onClick={() => auth.login()}>Sign in</button></p>}
      {history.active?.projectId && <Link className="vf-chat-project" to={`/editor/${history.active.projectId}?conversation=${history.active.id}`}>{!workspace && currentProject?.name ? `${currentProject.name} · Open project ↗` : savedProjectContext.data?.name ? `${savedProjectContext.data.name} · Open project ↗` : 'Open associated project ↗'}</Link>}
      {history.error && <p className="vf-chat-notice" role="alert">{history.error} <button type="button" onClick={() => setShowHistory(true)}>Open history</button></p>}
      {history.loading && <div className="vf-chat-skeleton" role="status">Loading saved conversation…</div>}
      {sendError && <p className="vf-chat-notice" role="alert">{sendError} {retryRequest && <button type="button" disabled={isStreaming} onClick={() => void handleSendStream(retryRequest.content, retryRequest.id)}>Retry send</button>}{activeConversationId && <button type="button" disabled={isStreaming || history.loading} onClick={() => void history.open(activeConversationId)}>Refresh conversation</button>}</p>}

      <div hidden={runState === 'idle'} className={`vf-ai-chat__status vf-ai-chat__status--${runState}`} role="status" aria-live="polite" aria-atomic="true">
        <span className="vf-ai-chat__status-indicator" aria-hidden="true" />
        <div className="vf-ai-chat__status-copy">
          <strong>{runPresentation.label}</strong>
          <span className="vf-ai-chat__status-detail">{runPresentation.detail}</span>
        </div>
        {isStreaming && (
          <button type="button" className="vf-ai-chat__cancel" onClick={cancelStream} aria-label={t('Cancel VoltForge AI response')}>
            {t('Stop')}
          </button>
        )}
      </div>

      {isMemoryOpen && (
        <section className="vf-ai-chat__memory" aria-labelledby="vf-ai-memory-heading">
          <div className="vf-ai-chat__memory-heading">
            <div>
              <strong id="vf-ai-memory-heading">{t('Bounded project memory')}</strong>
              <span>{memoryState?.enabled ? `${memoryState.entryCount} ${t('inspectable item(s)')}` : t('Disabled by default')}</span>
            </div>
            <button
              type="button"
              className="vf-ai-chat__memory-action"
              disabled={isMemoryBusy || !currentProject || memoryLoadState !== 'ready'}
              onClick={() => void setMemoryEnabled(!memoryState?.enabled)}
            >
              {memoryState?.enabled ? t('Disable') : t('Enable')}
            </button>
          </div>
          <p className="vf-ai-chat__memory-note">
            {t('User memory is revision-bound context, never engineering evidence or training data.')}
          </p>
          {memoryLoadState === 'loading' && <div className="vf-ai-chat__memory-status" role="status">{t('Loading project memory…')}</div>}
          {memoryLoadState === 'unavailable' && (
            <div className="vf-ai-chat__memory-status" role="status">
              {t('Project memory is unavailable. Chat remains available and no memory was changed.')}
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
                    placeholder={t('Fact to remember for this project')}
                  />
                  <button type="button" disabled={isMemoryBusy || !memoryDraft.trim()} onClick={() => void rememberFact()}>{t('Remember')}</button>
                </div>
              )}
              <div className="vf-ai-chat__memory-list">
                {memoryState.entries.map((entry) => (
                  <div key={entry.memoryId} className="vf-ai-chat__memory-entry">
                    <div className="vf-ai-chat__memory-entry-meta">
                      <span>{entry.kind}</span>
                      {entry.staleForProjectRevision && <span className="is-stale">{t('stale revision')}</span>}
                    </div>
                    {editingMemoryId === entry.memoryId ? (
                      <div className="vf-ai-chat__memory-edit">
                        <input aria-label={`Correct memory ${entry.memoryId}`} value={editingMemoryContent} maxLength={1200} onChange={(event) => setEditingMemoryContent(event.target.value)} />
                        <button type="button" disabled={isMemoryBusy} aria-label={`Save correction for memory ${entry.memoryId}`} onClick={() => void saveMemoryCorrection()}>{t('Save')}</button>
                      </div>
                    ) : <p>{entry.content}</p>}
                    <div className="vf-ai-chat__memory-entry-actions">
                      <button type="button" disabled={isMemoryBusy} aria-label={`Correct memory ${entry.memoryId}`} onClick={() => { setEditingMemoryId(entry.memoryId); setEditingMemoryContent(entry.content) }}>{t('Correct')}</button>
                      <button type="button" disabled={isMemoryBusy} aria-label={`Delete memory ${entry.memoryId}`} onClick={() => void deleteMemory(entry.memoryId)}>{t('Delete')}</button>
                    </div>
                  </div>
                ))}
                {memoryState.entries.length === 0 && <span className="vf-ai-chat__memory-empty">{t('No approved memory yet.')}</span>}
              </div>
              <div className="vf-ai-chat__memory-footer">
                <button type="button" disabled={!sessionId || isMemoryBusy} onClick={() => void clearMemory('session')}>{t('Clear session')}</button>
                <button type="button" disabled={isMemoryBusy} onClick={() => void clearMemory('project')}>{t('Clear project')}</button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="vf-ai-chat__messages" onScroll={() => { const el = scrollRef.current; if (el) { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setShowLatest(!nearBottom.current) } }}>
        {history.older && <button type="button" disabled={history.loading || isStreaming} onClick={() => { nearBottom.current = false; void history.loadOlder() }}>Load older messages</button>}
        {messages.length === 0 && (
          <div className="vf-ai-chat__welcome">
            <div className="vf-ai-chat__welcome-icon">
              <Bot size={28} />
            </div>
            <h3>{t('VoltForge AI Assistant')}</h3>
            <p>{t('Ask me about circuits, components, Arduino code, or debugging')}</p>
            <SuggestionsList
              suggestions={contextAvailable && !workspace ? [
                ...(nodes.length ? ['Explain this circuit.', 'Find possible wiring mistakes.'] : []),
                ...(activeCodeFile?.content ? ['Review my firmware.'] : []),
                ...(executionDiagnostic ? ['Explain the latest execution error.'] : []),
                ...(hasSerialOutput ? ['Help me understand the serial output.'] : []),
              ] : ['How do I select a resistor for an LED?', 'Explain pull-up and pull-down resistors.', 'Help me plan an electronics project.']}
              onSelect={(suggestion) => setInput(suggestion)}
            />
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg.id || idx}
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
                    <span>{msg.isStreaming && !msg.content ? t('Running engineering checks...') : t('Engineering checks')}</span>
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
              {msg.role === 'assistant' && idx === messages.length - 1 && ['failed', 'interrupted'].includes(msg.savedStatus || '') && <button type="button" disabled={isStreaming} onClick={() => void handleSendStream(messages[idx - 1].content, msg.clientRequestId)}>Retry response</button>}
              {msg.savedStatus === 'pending' && !isStreaming && <div className="vf-chat-notice"><button type="button" onClick={() => activeConversationId && void history.open(activeConversationId)}>Refresh response</button><button type="button" onClick={cancelStream}>Stop response</button></div>}
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
                  <span className="vf-ai-chat__sources-label">{t('Source trail')}</span>
                  {collectAiSources(msg.sourceMetadata).map((source) => (
                    <span key={source.kind} className={`vf-ai-chat__source vf-ai-chat__source--${source.kind}`} title={source.detail}>
                      {source.label}
                    </span>
                  ))}
                </div>
              )}

              {msg.role === 'assistant' && !msg.isStreaming && msg.uncertainty && (
                <div className="vf-ai-chat__uncertainty" role="status">
                  <strong>{t('Evidence uncertainty')}</strong>
                  <span>{msg.uncertainty.reasonCode || 'Some supporting evidence is incomplete.'}</span>
                  {msg.uncertainty.missingEvidence?.length ? (
                    <span>Missing: {msg.uncertainty.missingEvidence.join(', ').replaceAll('_', ' ').toLowerCase()}</span>
                  ) : null}
                </div>
              )}

              {msg.role === 'assistant' && !msg.isStreaming && msg.grounding && ['uncertain', 'conflicted'].includes(msg.grounding.status) && (
                <div className={`vf-ai-chat__grounding vf-ai-chat__grounding--${msg.grounding.status}`} role="status">
                  <strong>{msg.grounding.status === 'conflicted' ? t('Evidence conflict') : t('Evidence unavailable')}</strong>
                  <span>
                    {msg.grounding.status === 'conflicted'
                      ? t('Sources disagree, so VoltForge AI did not present the disputed claim as fact.')
                      : t('An unsupported factual claim was replaced with explicit uncertainty.')}
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
                        {citation.supportStatus === 'conflicted' && <span className="vf-ai-chat__citation-state">{t('conflicted')}</span>}
                        {citation.untrustedContent && <span className="vf-ai-chat__citation-state">{t('untrusted source')}</span>}
                        {citation.snippet && <span className="vf-ai-chat__citation-snippet">{citation.snippet}</span>}
                        {citation.locator && <span className="vf-ai-chat__citation-meta">{citation.locator}</span>}
                      </>
                    )
                    const safeCitationUrl = citation.url ? sanitizeUrl(citation.url) : null
                    return safeCitationUrl ? (
                      <a
                        key={citation.citationId || `${citation.url}-${citationIndex}`}
                        href={safeCitationUrl}
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
        {showLatest && <button type="button" onClick={() => { nearBottom.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); setShowLatest(false) }}>Scroll to latest ↓</button>}
        {relevantAttachment && attachmentVisible && <p className="vf-chat-notice">Serial snapshot: {relevantAttachment.output.length} output lines · {relevantAttachment.phase}. Enable context sharing to send it. <button type="button" onClick={() => setAttachmentVisible(false)}>Remove attachment</button></p>}
        {contextAvailable && !includeContext && <small className="vf-chat-composer-help">Project details are not shared. Enable sharing for circuit, firmware or execution questions.</small>}
        {workspace && history.active?.projectId && <small className="vf-chat-composer-help">Workspace sharing uses saved project data. Open the project to share unsaved edits or live execution output.</small>}
        {workspace && includeContext && savedProjectContext.isFetching && <p className="vf-chat-notice" role="status">Loading saved project context…</p>}
        {workspace && includeContext && savedProjectContext.isError && <p className="vf-chat-notice" role="alert">Could not load saved project context. <button onClick={() => void savedProjectContext.refetch()}>Retry context</button></p>}
        {contextAvailable && <label className="vf-chat-context"><input type="checkbox" checked={includeContext} disabled={isStreaming} onChange={e => setIncludeContext(e.target.checked)} />Share this project’s circuit, code, simulation, and approved memory with AI</label>}
        <div className="vf-ai-chat__input-row">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('Ask VoltForge AI...')}
            aria-label="Ask VoltForge AI about the current project"
            rows={1}
            maxLength={6000}
            disabled={!auth.isAuthenticated || history.loading}
            className="vf-ai-chat__textarea"
          />
          <button
            onClick={handleSend}
            disabled={(workspace && includeContext && (savedProjectContext.isFetching || savedProjectContext.isError)) || !input.trim() || isStreaming || pendingResponse || history.loading || !!history.error || !auth.isAuthenticated}
            aria-label="Send message"
            className="vf-ai-chat__send"
            type="button"
          >
            <Send size={14} />
          </button>
        </div>
        <small className="vf-chat-composer-help">{input.length}/6000 · Shift+Enter for a new line · Verify engineering advice</small>
      </div>
      </div>
      {showNewDialog && <NewConversationDialog onClose={() => setShowNewDialog(false)} onCreate={async projectId => !!(await history.create(projectId))} />}
    </div>
  )
}
export { AiChatPanel }
