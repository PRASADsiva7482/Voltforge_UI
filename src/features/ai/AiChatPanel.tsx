import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square, PanelLeft, Maximize2, Plus, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useConversationHistory } from './useConversationHistory'
import { ConversationSidebar } from './ConversationSidebar'
import { MessageCopyAction } from './MessageCopyAction'
import { UserMemoryDialog } from './UserMemoryDialog'
import { DocumentDialog } from './DocumentDialog'
import { ResearchOptions } from './ResearchOptions'
import { ResearchSources } from './ResearchSources'
import type { ResearchRequest } from './research'
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
import type { AiAction, AiArtifactIdentity, AiCitation, AiCodeFix, AiEngineeringAuthority, AiGroundingReport, AiInternetRetrievalStatus, AiLocalRetrievalStatus, AiWireSuggestion } from '../../types/domain'
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
  describeAiRun,
  describeSavedAiResponse,
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
  research?: ResearchRequest
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
  const [, setRunState] = useState<AiRunState>('idle')
  const [, setRunMetadata] = useState<AiRunMetadata>({})
  const [sessionId, setSessionId] = useState<string>()
  const [isMemoryOpen, setIsMemoryOpen] = useState(false)
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const [proposalSelections, setProposalSelections] = useState<Record<string, string[]>>({})
  const [appliedTransaction, setAppliedTransaction] = useState<AppliedAiTransaction>()
  const [isApplyingProposal, setIsApplyingProposal] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyToggleRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) optionsRef.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  const historyRequestedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const previousProjectIdRef = useRef<string | undefined>(undefined)
  const requestSequenceRef = useRef(0)
  const sendLock = useRef(false)
  const nearBottom = useRef(true)
  const olderScroll = useRef<{ height: number; top: number } | undefined>(undefined)
  const [showLatest, setShowLatest] = useState(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const [showHistory, setShowHistory] = useState(() => workspace && !window.matchMedia('(max-width: 820px)').matches)
  const historyDrawer = compact || !workspace
  const closeHistory = useCallback(() => {
    setShowHistory(false)
    requestAnimationFrame(() => historyToggleRef.current?.focus())
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)')
    const update = () => { setCompact(media.matches); if (media.matches) setShowHistory(false) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || !isOpen) return
    const resize = () => {
      input.style.height = '0px'
      const maxHeight = Math.min(160, (window.visualViewport?.height ?? window.innerHeight) * .25)
      input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`
      input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }
    resize()
    let width = input.parentElement?.clientWidth
    let frame = 0
    const scheduleResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize) }
    // Observe width only. Growing the textarea also changes the parent's height;
    // reacting to that height in the observer would create a resize feedback loop.
    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect.width
      if (nextWidth !== width) { width = nextWidth; scheduleResize() }
    })
    if (input.parentElement) observer.observe(input.parentElement)
    window.visualViewport?.addEventListener('resize', scheduleResize)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.visualViewport?.removeEventListener('resize', scheduleResize) }
  }, [input, isOpen])
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [includeContext, setIncludeContext] = useState(false)
  const [sendError, setSendError] = useState('')
  const [retryRequest, setRetryRequest] = useState<{ id: string; content: string }>()
  
  const { modelRevision, nodes, selectedNodeId, selectedWireId, wires } = useCanvasStore()
  const { currentProject, activeCodeFile, updateCodeFileContent } = useProjectStore()
  const addToast = useToastStore((s) => s.addToast)
  const setResultDataConsumer = useSimulationStore((s) => s.setResultDataConsumer)
  const auth = useAuth()
  const [researchMode, setResearchMode] = useState<'off' | 'on'>('off')
  const [publicQuery, setPublicQuery] = useState('')
  const [researchConsent, setResearchConsent] = useState(false)
  const [researchStage, setResearchStage] = useState('')
  useEffect(() => {
    try { setResearchMode(localStorage.getItem(`vf-research-mode:${auth.user?.id}`) === 'on' ? 'on' : 'off') } catch { setResearchMode('off') }
    setPublicQuery(''); setResearchConsent(false)
  }, [auth.user?.id])
  const openResearch = () => {
    if (optionsRef.current) {
      optionsRef.current.open = true
      const detail = optionsRef.current.querySelector<HTMLDetailsElement>('.vf-research-options')
      if (detail) detail.open = true
    }
  }
  const restoreMessages = useCallback((saved: SavedMessage[]) => {
    setMessages(saved.map(message => ({
      id: message.id, clientRequestId: message.clientRequestId, role: message.role, content: message.content,
      savedStatus: message.status, isStreaming: false,
      sourceMetadata: message.metadata as AiRunMetadata | undefined,
      citations: message.metadata?.citations as AiCitation[] | undefined,
      research: message.metadata?.research as ResearchRequest | undefined,
      confidence: typeof message.metadata?.confidence === 'number' ? message.metadata.confidence : undefined,
      grounding: message.metadata?.grounding as AiGroundingReport | undefined,
      uncertainty: message.metadata?.uncertainty as AiUncertainty | undefined,
      ...(message.role === 'assistant' ? describeSavedAiResponse(message.status, message.content,
        typeof message.metadata?.errorCode === 'string' ? message.metadata.errorCode : undefined) : {}),
    })))
    setRunState('idle'); setRunMetadata({}); setRetryRequest(undefined); setSendError('')
    setProposalSelections({}); setAppliedTransaction(undefined)
  }, [])
  const history = useConversationHistory(auth.user?.id, !workspace && !readOnly ? currentProject?.id : undefined, restoreMessages, isStreaming)
  const activeConversationId = history.active?.id
  useEffect(() => { setResearchConsent(false); setPublicQuery(''); setSelectedDocuments([]) }, [activeConversationId, auth.user?.id])
  const contextAvailable = workspace ? !!history.active?.projectId : !readOnly && !!currentProject?.id && (!history.active || history.active.projectId === currentProject.id)
  const savedProjectContext = useQuery({
    queryKey: ['chat-project-context', auth.user?.id, history.active?.projectId],
    queryFn: async () => (await projectApi.getById(history.active!.projectId!)).data.data,
    enabled: workspace && includeContext && !!history.active?.projectId,
    staleTime: 0,
  })
  const relevantAttachment = !workspace && executionAttachment?.projectId === currentProject?.id ? executionAttachment : undefined
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

  useEffect(() => { setSessionId(activeConversationId); setIncludeContext(false); setIsMemoryOpen(false); olderScroll.current = undefined; nearBottom.current = true }, [activeConversationId])
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
    if (workspace) return
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
      setProposalSelections({})
      setAppliedTransaction(undefined)
    }
    previousProjectIdRef.current = projectId
  }, [currentProject?.id, workspace])

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
    const originalResearch = retryId ? messages.find(m => m.role === 'user' && m.clientRequestId === retryId)?.research : undefined
    if (retryId && JSON.stringify(originalResearch?.documentIds || []) !== JSON.stringify(selectedDocuments)) {
      setSelectedDocuments(originalResearch?.documentIds || []); setIsDocumentsOpen(true)
      setSendError('Review the original document selection, then retry. New documents require a new message.'); return
    }
    if (originalResearch?.mode === 'on' && (researchMode !== 'on' || publicQuery.trim() !== originalResearch.publicQuery)) {
      setResearchMode('on'); setPublicQuery(originalResearch.publicQuery || ''); setResearchConsent(false); openResearch()
      setSendError('Review and approve the original public query before retrying this response.'); return
    }
    if (researchMode === 'on' && (!researchConsent || !publicQuery.trim() || publicQuery.trim().split(/\s+/).length > 75)) {
      openResearch(); setSendError('Review a public query (up to 75 words) and approve sending it before web research.'); return
    }
    const research: ResearchRequest = researchMode === 'on'
      ? { mode: 'on', publicQuery: publicQuery.trim(), consentToExternalQuery: true, documentIds: selectedDocuments }
      : { mode: 'off', consentToExternalQuery: false, documentIds: selectedDocuments }
    setResearchStage('')
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
        research,
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
              setResearchConsent(false)
              setMessages(prev => [...prev.filter(m => m.clientRequestId !== clientRequestId),
                { id: saved.id, clientRequestId, role: 'user', content: saved.content, savedStatus: saved.status, research },
                { clientRequestId, role: 'assistant', content: '', isStreaming: true, runState: 'connecting' }])
            } else if (eventType === 'saved') {
              const saved = event.data as SavedMessage
              history.reconcile(saved)
              const savedPresentation = describeSavedAiResponse(saved.status, saved.content,
                typeof saved.metadata?.errorCode === 'string' ? saved.metadata.errorCode : undefined)
              terminalState = savedPresentation.runState
              sawDone = true
              contentCharacters = saved.content.length
              setRunState(terminalState)
              setMessages(prev => patchLastAssistant(prev, {
                id: saved.id, content: saved.content, savedStatus: saved.status, isStreaming: false,
                citations: saved.metadata?.citations as AiCitation[] | undefined,
                ...savedPresentation,
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
            } else if (eventType === 'sources') {
              setMessages(prev => patchLastAssistant(prev, { citations: Array.isArray(event.citations) ? event.citations.slice(0, 5) : [] }))
            } else if (eventType === 'status' && ['searching', 'generating'].includes(event.stage)) {
              setResearchStage(event.stage === 'searching' ? 'Searching public sources…' : 'Writing from retrieved sources…')
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
                  content: last?.content || '',
                  errorCode: code,
                  isStreaming: false,
                  runDetail: errorMessage,
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

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (olderScroll.current && el && !history.loading) {
      el.scrollTop = olderScroll.current.top + el.scrollHeight - olderScroll.current.height
      olderScroll.current = undefined
    }
  }, [messages, history.loading])

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


  if (!isOpen) return null

  return (
    <div className={`vf-chat-workspace${workspace ? ' vf-chat-workspace--page' : ''}${showHistory ? ' has-history' : ''}`}>
      {showHistory && historyDrawer && <div className="vf-chat-history-backdrop" aria-hidden="true" onClick={closeHistory} />}
      {showHistory && <ConversationSidebar history={history} drawer={historyDrawer} focusOnMount={historyDrawer || historyRequestedRef.current} busy={isStreaming} onClose={closeHistory} onNew={() => { if (historyDrawer) setShowHistory(false); void newChat() }} />}
      <div className="vf-ai-chat" inert={showHistory && historyDrawer ? true : undefined}>
      {/* Header */}
      <header className="vf-ai-chat__header">
        <div className="vf-ai-chat__brand">
          {!showHistory && <button ref={historyToggleRef} className="vf-chat-history-toggle" type="button" title="Open conversation history" aria-label="Conversation history" aria-expanded={false} onClick={() => { historyRequestedRef.current = true; setShowHistory(true) }}><PanelLeft size={18} /></button>}
          <div>
            {workspace ? <h1 className="vf-ai-chat__brand-name">{history.active?.title || 'AI Workspace'}</h1> : <h3 className="vf-ai-chat__brand-name">{history.active?.title || 'VoltForge AI'}</h3>}
            {history.active?.projectId && <Link className="vf-chat-project" to={`/editor/${history.active.projectId}?conversation=${history.active.id}`}>{!workspace && currentProject?.name ? `${currentProject.name} · Open project ↗` : savedProjectContext.data?.name ? `${savedProjectContext.data.name} · Open project ↗` : 'Open associated project ↗'}</Link>}
          </div>
        </div>
        <div className="vf-ai-chat__header-actions">
          {!showHistory && <button type="button" className="vf-chat-new-action" title="New chat" aria-label="New chat" disabled={isStreaming || history.loading} onClick={() => void newChat()}><Plus size={16} /><span>New chat</span></button>}
          {!workspace && <Link to={activeConversationId ? `/ai-chat?conversation=${activeConversationId}` : '/ai-chat'} title="Open AI workspace" aria-label="Open AI workspace"><Maximize2 size={16} /></Link>}
          <details ref={optionsRef} className="vf-chat-options" onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
          }}>
            <summary aria-label="Chat options" title="Chat options"><MoreHorizontal size={18} /></summary>
            <div className="vf-chat-options__panel">
              <ResearchOptions enabled={auth.isAuthenticated} mode={researchMode} onMode={mode => {
                setResearchMode(mode); setResearchConsent(false)
                try { localStorage.setItem(`vf-research-mode:${auth.user?.id}`, mode) } catch { /* preference persistence unavailable */ }
              }} query={publicQuery} onQuery={value => { setPublicQuery(value); setResearchConsent(false) }} consent={researchConsent} onConsent={setResearchConsent} busy={isStreaming} />
              <button type="button" aria-label="Preference memory" onClick={() => {
                if (optionsRef.current) { optionsRef.current.open = false; optionsRef.current.querySelector('summary')?.focus() }
                setIsMemoryOpen(true)
              }}>Manage memory</button>
              <button type="button" disabled={isStreaming} onClick={() => { if (optionsRef.current) optionsRef.current.open = false; setIsDocumentsOpen(true) }}>Reference documents{selectedDocuments.length ? ` (${selectedDocuments.length})` : ''}</button>
              <details><summary>Context and privacy</summary><p>{contextAvailable
                ? workspace ? 'Project sharing sends the linked project’s saved board, components, wiring and firmware. Open the Playground to share unsaved changes or live execution output.' : 'Project sharing sends the current board, components, wiring, firmware and available execution diagnostics and serial output.'
                : 'This is a general chat with no linked project. Only your messages, recent chat history and preferences you explicitly saved in Memory are used.'} Sharing turns off when switching conversations. Turning it off stops new project snapshots; information already written in this chat remains in its history. Memory is managed separately.</p></details>
            </div>
          </details>
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
      {history.error && <p className="vf-chat-notice" role="alert">{history.error} <button type="button" onClick={() => setShowHistory(true)}>Open history</button></p>}
      {history.loading && <div className="vf-chat-skeleton" role="status">Loading saved conversation…</div>}
      {sendError && <p className="vf-chat-notice" role="alert">{sendError} {retryRequest && <button type="button" disabled={isStreaming} onClick={() => void handleSendStream(retryRequest.content, retryRequest.id)}>Retry send</button>}{activeConversationId && <button type="button" disabled={isStreaming || history.loading} onClick={() => void history.open(activeConversationId)}>Refresh conversation</button>}</p>}

      {/* Messages */}
      <div ref={scrollRef} className="vf-ai-chat__messages" onScroll={() => { const el = scrollRef.current; if (el) { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setShowLatest(!nearBottom.current) } }}>
        {history.older && <button type="button" disabled={history.loading || isStreaming} onClick={() => { nearBottom.current = false; const el = scrollRef.current; if (el) olderScroll.current = { height: el.scrollHeight, top: el.scrollTop }; void history.loadOlder() }}>Load older messages</button>}
        {messages.length === 0 && (
          <div className="vf-ai-chat__welcome">
            <h3>What are you working on?</h3>
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
            <div className="vf-ai-chat__msg-column">
            <div className="vf-ai-chat__msg-body">
              {/* Main response content */}
              {msg.isStreaming && !msg.content && (
                <div className="vf-ai-chat__typing" role="status" aria-label="Generating response">
                  {researchStage && <span>{researchStage}</span>}
                  <span className="vf-ai-chat__typing-dot" />
                  <span className="vf-ai-chat__typing-dot" />
                  <span className="vf-ai-chat__typing-dot" />
                </div>
              )}
              {msg.content && renderMessageContent(msg.content)}
              {msg.role === 'assistant' && <ResearchSources citations={msg.citations} />}
              {msg.savedStatus === 'pending' && !isStreaming && <div className="vf-chat-notice"><button type="button" onClick={() => activeConversationId && void history.open(activeConversationId)}>Refresh response</button><button type="button" onClick={cancelStream}>Stop response</button></div>}
              {msg.isStreaming && msg.content && <span className="vf-ai-chat__cursor" aria-hidden="true">|</span>}

              {/* Action buttons */}
              {renderMessageActions(msg)}

              {msg.role === 'assistant' && msg.runState && ['partial', 'cancelled', 'offline', 'error'].includes(msg.runState) && (
                <div className={`vf-ai-chat__message-status vf-ai-chat__message-status--${msg.runState}`} role="status">
                  <strong>{msg.runStatus}</strong>
                  <span>{msg.runDetail}</span>
                </div>
              )}
            </div>
            {!msg.isStreaming && (msg.content || msg.savedStatus === 'failed' || msg.savedStatus === 'interrupted') && <div className="vf-chat-message-actions">
              {msg.content && <MessageCopyAction content={msg.content} role={msg.role} />}
              {msg.role === 'assistant' && idx === messages.length - 1 && ['failed', 'interrupted'].includes(msg.savedStatus || '') && <button type="button" disabled={isStreaming} onClick={() => void handleSendStream(messages[idx - 1].content, msg.clientRequestId)}>Retry response</button>}
            </div>}
            </div>
          </div>
        ))}

      </div>

      {/* Input */}
      <div className="vf-ai-chat__input-area">
        {researchMode === 'on' && <button type="button" onClick={openResearch}>Web research · {researchConsent ? 'Query approved' : 'Review query'}</button>}
        {selectedDocuments.length > 0 && <button type="button" disabled={isStreaming} onClick={() => setIsDocumentsOpen(true)}>Documents · {selectedDocuments.length} selected</button>}
        {showLatest && <button type="button" onClick={() => { nearBottom.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); setShowLatest(false) }}>Scroll to latest ↓</button>}
        {relevantAttachment && attachmentVisible && <p className="vf-chat-notice">Serial snapshot: {relevantAttachment.output.length} output lines · {relevantAttachment.phase}. Enable context sharing to send it. <button type="button" onClick={() => setAttachmentVisible(false)}>Remove attachment</button></p>}
        {contextAvailable && <div className="vf-chat-context-toolbar">
          <label className="vf-chat-context"><input type="checkbox" checked={includeContext} disabled={isStreaming || history.loading} onChange={e => setIncludeContext(e.target.checked)} aria-label="Share this project context" />{includeContext ? 'Project sharing on' : 'Project sharing off'}</label>
        </div>}
        {workspace && includeContext && savedProjectContext.isFetching && <p className="vf-chat-notice" role="status">Loading saved project context…</p>}
        {workspace && includeContext && savedProjectContext.isError && <p className="vf-chat-notice" role="alert">Could not load saved project context. <button onClick={() => void savedProjectContext.refetch()}>Retry context</button></p>}
        <div className="vf-ai-chat__input-row">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('Ask VoltForge AI...')}
            aria-label="Ask VoltForge AI"
            rows={1}
            maxLength={6000}
            disabled={!auth.isAuthenticated || history.loading}
            className="vf-ai-chat__textarea"
          />
          {isStreaming ? <button key="stop" type="button" className="vf-ai-chat__send vf-ai-chat__stop" title="Stop generation" aria-label="Stop response" onClick={cancelStream}><Square size={16} fill="currentColor" /></button> : <button
            key="send"
            onClick={handleSend}
            disabled={(workspace && includeContext && (savedProjectContext.isFetching || savedProjectContext.isError)) || !input.trim() || isStreaming || pendingResponse || history.loading || !!history.error || !auth.isAuthenticated}
            aria-label="Send message"
            title="Send message"
            className="vf-ai-chat__send"
            type="button"
          >
            <Send size={18} />
          </button>}
        </div>
        <small className={`vf-chat-composer-help${input ? ' has-draft' : ''}`}>{input.length}/6000 · Shift+Enter for a new line</small>
      </div>
      </div>
      {isMemoryOpen && <UserMemoryDialog onClose={() => setIsMemoryOpen(false)} />}
      {isDocumentsOpen && <DocumentDialog projectId={history.active?.projectId} selected={selectedDocuments} onSelect={setSelectedDocuments} onClose={() => setIsDocumentsOpen(false)} />}
      {showNewDialog && <NewConversationDialog onClose={() => setShowNewDialog(false)} onCreate={async projectId => !!(await history.create(projectId))} />}
    </div>
  )
}
export { AiChatPanel }
