import { lazy, Suspense, useEffect, useCallback, useState, useRef, type ReactNode } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Save,
  Undo2,
  Redo2,
  Play,
  Pause,
  StepForward,
  Square,
  Code2,
  Layout,
  PanelLeftClose,
  PanelRightClose,
  Zap,
  Sun,
  Moon,
  Gauge,
  Activity,
  Package,
  Sparkles,
  ShieldAlert,
  Settings,
  Share2,
  GitFork,
  Trash2,
  Wifi,
  Layers,
  ChevronDown,
  SlidersHorizontal,
  Bug,
  FileArchive,
  CircuitBoard,
} from 'lucide-react'

import { pcbManufacturingApi, projectApi, simulationApi, projectExportApi, type PcbManufacturingPayload } from '../../api/services'
import { useCanvasStore } from '../../store/canvasStore'
import { usePcbStore } from '../../store/pcbStore'
import { useProjectStore, SMART_DEVICE_PRESET } from '../../store/projectStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useThemeStore } from '../../store/themeStore'
import { useToastStore } from '../../store/useToastStore'
import { useAuth } from '../../auth/useAuth'
import { useCollaboration } from '../../hooks/useCollaboration'

import { analyzeCircuitSafety } from '../canvas/pinRegistry'
import { isBoardComponentType, supportsAvr8js } from '../canvas/boardCatalog'
import { SimulationEngineLoadCancelledError, useDeferredSimulationEngine } from '../simulator/useDeferredSimulationEngine'

import CircuitCanvas from '../canvas/CircuitCanvas'
import ComponentPanel from './ComponentPanel'
import PropertyEditor from './PropertyEditor'
import SerialMonitor from './SerialMonitor'

import { ContextMenu } from '../../components/ui/ContextMenu'
import { SplitPane } from '../../components/ui/SplitPane'
import type { Project, CodeFile } from '../../types/domain'
import {
  createMaximumComponentRegressionPreset,
  MAX_COMPONENT_REGRESSION_BOARD,
  MAX_COMPONENT_REGRESSION_FIRMWARE,
} from '../../store/maxComponentRegressionPreset'
import {
  runMaximumComponentRegression,
  type MaximumComponentRegressionTrace,
} from '../simulator/regression/maxComponentRegression'
import {
  runMaximumCanvasRenderRegression,
  type MaximumCanvasRenderTrace,
} from '../canvas/regression/canvasRenderRegression'
import {
  AVR_COMPILED_TRACE_DURATION_MS,
  AVR_COMPILED_TRACE_FIRMWARE,
  AVR_COMPILED_TRACE_ID,
  AVR_FRAME_TIME_TARGET_MS,
  AVR_INPUT_LATENCY_TARGET_MS,
  captureAvrCompiledFirmwareMode,
  createAvrCompiledFirmwareFixture,
  type AvrCompiledFirmwareTrace,
} from '../simulator/regression/avrCompiledFirmwareTrace'
import type { SimulationFidelityMode } from '../simulator/simulationModels'

const PcbCanvas = lazy(() => import('../pcb/PcbCanvas'))
const CodeEditor = lazy(() => import('./CodeEditor'))
const MultimeterPanel = lazy(() => import('./MultimeterPanel'))
const OscilloscopePanel = lazy(() => import('./OscilloscopePanel'))
const BomPanel = lazy(() => import('./BomPanel'))
const AiChatPanel = lazy(() => import('../ai/AiChatPanel'))
const AiValidatorPanel = lazy(() => import('./AiValidatorPanel'))
const IotInspectorPanel = lazy(() => import('./IotInspectorPanel'))
const ProjectSettingsModal = lazy(() => import('./ProjectSettingsModal'))
const SolverDiagnosticsPanel = lazy(() => import('./SolverDiagnosticsPanel'))

type ViewMode = 'canvas' | 'code' | 'split' | 'pcb'

function EditorFeatureBoundary({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Suspense fallback={<div className="vf-editor-feature-loading" role="status" aria-live="polite">Loading {label}…</div>}>
      {children}
    </Suspense>
  )
}

function SecondaryToolButton({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button
      className={`vf-editor__secondary-tool ${pressed ? 'is-active' : ''}`}
      onClick={onClick}
      type="button"
      aria-label={label}
      aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}
      title={label}
    >
      {icon}
    </button>
  )
}

function bundleCodeFiles(activeFile: CodeFile | null, files: CodeFile[]): string {
  if (!activeFile) return ''
  let content = activeFile.content
  const maxIterations = 10

  for (let iter = 0; iter < maxIterations; iter++) {
    let replaced = false
    content = content.replace(/^#include\s+"([^"]+)"/gm, (match, filename) => {
      const includedFile = files.find(
        (f) => f.filename.toLowerCase() === filename.toLowerCase()
      )
      if (includedFile) {
        replaced = true
        return (
          `\n// ── Begin Include: ${includedFile.filename} ──\n` +
          includedFile.content +
          `\n// ── End Include: ${includedFile.filename} ──\n`
        )
      }
      return match
    })
    if (!replaced) break
  }
  return content
}

function serializeCanvas(nodes: unknown[], wires: unknown[]) {
  return JSON.stringify({ nodes, wires })
}

function serializePcb(layout: unknown) {
  return JSON.stringify(layout)
}

function encodeShareState(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeShareState(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export default function CircuitEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const addToast = useToastStore((s) => s.addToast)

  // Project state
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const currentProject = useProjectStore((s) => s.currentProject)
  const isDirty = useProjectStore((s) => s.isDirty)
  const setDirty = useProjectStore((s) => s.setDirty)
  const isSaving = useProjectStore((s) => s.isSaving)
  const setSaving = useProjectStore((s) => s.setSaving)
  const setProjectUpdatedAt = useProjectStore((s) => s.setProjectUpdatedAt)
  const activeCodeFile = useProjectStore((s) => s.activeCodeFile)
  const updateCodeFileContent = useProjectStore((s) => s.updateCodeFileContent)

  // Canvas state
  const loadCanvas = useCanvasStore((s) => s.loadCanvas)
  const resetCanvas = useCanvasStore((s) => s.resetCanvas)
  const nodes = useCanvasStore((s) => s.nodes)
  const wires = useCanvasStore((s) => s.wires)
  const viewport = useCanvasStore((s) => s.viewport)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const clearCanvas = useCanvasStore((s) => s.clearCanvas || (() => loadCanvas([], [])))
  const resetPcb = usePcbStore((s) => s.resetPcb)
  const loadPcb = usePcbStore((s) => s.loadPcb)
  const pcbSnapshot = usePcbStore((s) => serializePcb(s.getLayout()))

  // Visual/Panel toggles
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isSimulationPaused, setIsSimulationPaused] = useState(false)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const canvasSnapshotRef = useRef<string | null>(null)
  const pcbSnapshotRef = useRef<string | null>(null)
  const skipCanvasDirtyRef = useRef(false)
  const sharedCanvasStateRef = useRef<string | null>(null)
  const sharedCodeStateRef = useRef<string | null>(null)
  const simulationRequestRef = useRef(0)
  const regressionTokenRef = useRef(0)
  const canvasRenderRegressionTokenRef = useRef(0)
  const avrCompiledTraceTokenRef = useRef(0)
  const secondaryToolsButtonRef = useRef<HTMLButtonElement>(null)
  const secondaryToolsTrayRef = useRef<HTMLDivElement>(null)

  // Migrated features panel open state
  const [showMultimeter, setShowMultimeter] = useState(false)
  const [showBom, setShowBom] = useState(false)
  const [showAiChat, setShowAiChat] = useState(false)
  const [showAiValidator, setShowAiValidator] = useState(false)
  const [showIotInspector, setShowIotInspector] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false)
  const [regressionMode, setRegressionMode] = useState<SimulationFidelityMode | 'both' | null>(null)
  const [regressionRuns, setRegressionRuns] = useState<MaximumComponentRegressionTrace[]>([])
  const [canvasRenderTraceRunning, setCanvasRenderTraceRunning] = useState(false)
  const [canvasRenderTrace, setCanvasRenderTrace] = useState<MaximumCanvasRenderTrace | null>(null)
  const [avrCompiledTraceRunning, setAvrCompiledTraceRunning] = useState(false)
  const [avrCompiledTrace, setAvrCompiledTrace] = useState<AvrCompiledFirmwareTrace | null>(null)

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    x: number
    y: number
  }>({ isOpen: false, x: 0, y: 0 })

  // Simulation store triggers (individual atomic selectors to prevent 60fps re-render thrashing)
  const writeSerial = useSimulationStore((s) => s.writeSerial)
  const clearSerial = useSimulationStore((s) => s.clearSerial)
  const setBaudRate = useSimulationStore((s) => s.setBaudRate)
  const setDebugSnapshot = useSimulationStore((s) => s.setDebugSnapshot)
  const setSerialPanelOpen = useSimulationStore((s) => s.setSerialPanelOpen)
  const setSimulating = useSimulationStore((s) => s.setSimulating)
  const fidelityMode = useSimulationStore((s) => s.fidelityMode)
  const setFidelityMode = useSimulationStore((s) => s.setFidelityMode)
  const simulationTime = useSimulationStore((s) => s.simulationTime)
  const executionMode = useSimulationStore((s) => s.executionMode)
  const avrWorkload = useSimulationStore((s) => s.avrWorkload)
  const solverDiagnosticsOpen = useSimulationStore((s) => s.solverDiagnosticsOpen)
  const solverDiagnostics = useSimulationStore((s) => s.solverDiagnostics)
  const setSolverDiagnosticsOpen = useSimulationStore((s) => s.setSolverDiagnosticsOpen)
  const clearSolverDiagnostics = useSimulationStore((s) => s.clearSolverDiagnostics)
  const toggleMeterProbe = useSimulationStore((s) => s.toggleMeterProbe)
  const oscilloscopePanelOpen = useSimulationStore((s) => s.oscilloscopePanelOpen)
  const setOscilloscopePanelOpen = useSimulationStore((s) => s.setOscilloscopePanelOpen)
  const { theme, toggleTheme } = useThemeStore()
  const updateNode = useCanvasStore((s) => s.updateNode)
  const { engineRef, getSimulationEngine, stopSimulationEngine } = useDeferredSimulationEngine({
    onSerialOutput: (text, options) => writeSerial(text, options),
    onBaudRateChange: setBaudRate,
    onDebugSnapshot: setDebugSnapshot,
    onError: (error) => writeSerial(`[ERROR] ${error}`),
  })

  useEffect(() => {
    if (!secondaryToolsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSecondaryToolsOpen(false)
        secondaryToolsButtonRef.current?.focus()
      }
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        secondaryToolsButtonRef.current?.contains(target)
        || secondaryToolsTrayRef.current?.contains(target)
      ) return
      setSecondaryToolsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [secondaryToolsOpen])

  const isPreset = projectId === 'preset-smart-device'
  const isSharedView = !projectId
  const isOwner = isPreset || Boolean(
    projectId &&
    currentProject &&
    user &&
    currentProject.owner?.keycloakId === user.keycloakId
  )

  // Collaboration integration
  const {
    activeUsers,
    isConnected: isLiveSyncConnected,
    broadcastCanvasSync,
    broadcastCursorMove,
  } =
    // The smart-device preset exists only in the frontend and has no backend
    // project record. Do not open a WebSocket for it, otherwise the server
    // rejects the subscription and the reconnect loop makes the badge blink.
    useCollaboration(isPreset || !user ? '' : projectId || '')

  // Reset route-owned state before a new project query resolves. Zustand is a
  // singleton, so without this a project with no layout could display the
  // previous project's components and PCB footprints.
  useEffect(() => {
    resetCanvas()
    resetPcb()
    setCurrentProject(null)
    canvasSnapshotRef.current = null
    pcbSnapshotRef.current = null
    sharedCanvasStateRef.current = null
    sharedCodeStateRef.current = null
    setDirty(false)
  }, [projectId, resetCanvas, resetPcb, setCurrentProject, setDirty])

  // ── Load project ──
  const { data: fetchedProject, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const r = await projectApi.getById(projectId!)
      return r.data.data
    },
    enabled: !!projectId && !isPreset,
  })

  // Set project layout and codes
  useEffect(() => {
    const project = projectId === 'preset-smart-device'
      ? SMART_DEVICE_PRESET
      : fetchedProject?.id === projectId
        ? fetchedProject
        : null
    if (project) {
      setCurrentProject(project as Project)
      const layout = project.canvasLayout
      loadCanvas(layout?.nodes || [], layout?.wires || [], layout?.viewport)
      const storedPcb = (project.componentConfig as { pcbLayout?: unknown } | undefined)?.pcbLayout
      loadPcb(storedPcb && typeof storedPcb === 'object' ? storedPcb as any : undefined)
      canvasSnapshotRef.current = serializeCanvas(
        useCanvasStore.getState().nodes,
        useCanvasStore.getState().wires,
      )
      pcbSnapshotRef.current = serializePcb(usePcbStore.getState().getLayout())
      skipCanvasDirtyRef.current = true
      setDirty(false)
    }
  }, [fetchedProject, projectId, isPreset, setCurrentProject, loadCanvas, loadPcb, setDirty])

  // Parse share parameters if available
  useEffect(() => {
    const stateParam = searchParams.get('state')
    if (stateParam && sharedCanvasStateRef.current !== stateParam) {
      try {
        const decoded = decodeShareState(stateParam)
        if (decoded.nodes && decoded.wires) {
          loadCanvas(decoded.nodes, decoded.wires, decoded.viewport)
          canvasSnapshotRef.current = serializeCanvas(
            useCanvasStore.getState().nodes,
            useCanvasStore.getState().wires,
          )
          skipCanvasDirtyRef.current = true
          sharedCanvasStateRef.current = stateParam
        }
        if (isSharedView) {
          const sharedPcb = (decoded.componentConfig as { pcbLayout?: unknown } | undefined)?.pcbLayout
          loadPcb(sharedPcb && typeof sharedPcb === 'object' ? sharedPcb as any : undefined)
          const sharedCodeFiles = Array.isArray(decoded.codeFiles)
            ? decoded.codeFiles
            : decoded.code
              ? [{
                  id: `shared-code-${stateParam.slice(0, 12)}`,
                  filename: 'main.ino',
                  content: decoded.code,
                  language: 'cpp',
                  sortOrder: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }]
              : []
          setCurrentProject({
            id: `shared-${stateParam.slice(0, 12)}`,
            name: decoded.name || 'Shared Circuit',
            description: 'Read-only shared circuit',
            boardType: decoded.boardType || 'ARDUINO_UNO',
            canvasLayout: {
              nodes: decoded.nodes || [],
              wires: decoded.wires || [],
              viewport: decoded.viewport || { x: 0, y: 0, scale: 1 },
            },
            codeFiles: sharedCodeFiles,
            componentConfig: decoded.componentConfig,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            forkCount: 0,
            isPublic: true,
            owner: {} as Project['owner'],
            viewCount: 0,
          })
        }
        if (decoded.code && activeCodeFile && sharedCodeStateRef.current !== stateParam) {
          updateCodeFileContent(activeCodeFile.id, decoded.code)
          sharedCodeStateRef.current = stateParam
        }
        addToast('Loaded shared project state (read-only)', 'info')
      } catch (e) {
        console.error('Failed to parse shared state', e)
        addToast('Invalid shared state link', 'error')
      }
    } else if (stateParam && activeCodeFile && sharedCodeStateRef.current !== stateParam) {
      // The canvas may already have been applied while the project query was
      // loading; apply the code once the first code file becomes available.
      try {
        const decoded = decodeShareState(stateParam)
        if (decoded.code) {
          updateCodeFileContent(activeCodeFile.id, decoded.code)
          sharedCodeStateRef.current = stateParam
        }
      } catch {
        // The first branch reports malformed links to the user.
      }
    }
  }, [searchParams, loadCanvas, loadPcb, activeCodeFile, updateCodeFileContent, addToast, isSharedView, setCurrentProject])

  // Canvas and PCB mutations do not pass through the project store, so track
  // both against the last loaded/saved snapshots for autosave and the dirty marker.
  useEffect(() => {
    if (skipCanvasDirtyRef.current) {
      skipCanvasDirtyRef.current = false
      return
    }
    const canvasChanged = canvasSnapshotRef.current !== null
      && serializeCanvas(nodes, wires) !== canvasSnapshotRef.current
    const pcbChanged = pcbSnapshotRef.current !== null
      && pcbSnapshot !== pcbSnapshotRef.current
    if (isOwner && (canvasChanged || pcbChanged)) {
      setDirty(true)
    }
  }, [isOwner, nodes, pcbSnapshot, setDirty, wires])

  // Broadcast layout changes during collaboration
  useEffect(() => {
    // Public/shared projects may be subscribed to for presence and remote
    // updates, but only owners/editors may publish canvas changes. Sending a
    // canvas update from a read-only project makes the backend reject the
    // STOMP frame, which used to trigger a reconnect loop and re-render this
    // toolbar on every connection attempt.
    if (isLiveSyncConnected && isOwner && !isPreset && regressionMode === null && !canvasRenderTraceRunning && !avrCompiledTraceRunning) {
      broadcastCanvasSync(nodes, wires, viewport, usePcbStore.getState().getLayout())
    }
  }, [avrCompiledTraceRunning, broadcastCanvasSync, canvasRenderTraceRunning, isLiveSyncConnected, isOwner, isPreset, nodes, pcbSnapshot, regressionMode, viewport, wires])

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject || isPreset || !isOwner) return
      setSaving(true)
      const codeFiles = currentProject.codeFiles.map((f) => ({
        content: f.content,
        filename: f.filename,
        language: f.language,
        sortOrder: f.sortOrder,
      }))
      const response = await projectApi.update(currentProject.id, {
        canvasLayout: {
          nodes,
          wires,
          viewport: useCanvasStore.getState().viewport,
        },
        componentConfig: {
          ...(currentProject.componentConfig || {}),
          pcbLayout: usePcbStore.getState().getLayout(),
        },
        codeFiles,
        expectedRevision: currentProject.updatedAt,
      })
      return response.data.data
    },
    onSuccess: (project) => {
      if (!project) return
      canvasSnapshotRef.current = serializeCanvas(
        useCanvasStore.getState().nodes,
        useCanvasStore.getState().wires,
      )
      pcbSnapshotRef.current = serializePcb(usePcbStore.getState().getLayout())
      setDirty(false)
      setSaving(false)
      setProjectUpdatedAt(project.updatedAt)
      addToast('Project saved successfully', 'success')
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: (error) => {
      setSaving(false)
      const errorCode = (error as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode
      addToast(errorCode === 'PROJECT_REVISION_STALE'
        ? 'Project changed elsewhere. Reload before saving your local changes.'
        : 'Failed to save project', 'error')
    },
  })

  const handleSave = useCallback(() => {
    if (!isPreset && isOwner) saveMutation.mutate()
  }, [isPreset, isOwner, saveMutation])

  // ── Auto-save logic (every 10s when dirty) ──
  useEffect(() => {
    if (!isDirty || isPreset || !isOwner) return
    const timer = setInterval(() => {
      handleSave()
    }, 10000)
    return () => clearInterval(timer)
  }, [isDirty, isPreset, isOwner, handleSave])

  // ── Fork mutation ──
  const forkMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject) return
      setSaving(true)
      const res = await projectApi.fork(currentProject.id)
      return res.data.data
    },
    onSuccess: (forked) => {
      setSaving(false)
      addToast('Project forked successfully!', 'success')
      if (forked) {
        navigate(`/editor/${forked.id}`)
      }
    },
    onError: () => {
      setSaving(false)
      addToast('Failed to fork project', 'error')
    },
  })

  // ── Share project ──
  const handleShare = async () => {
    try {
      const state = {
        nodes,
        wires,
        code: activeCodeFile?.content || '',
        codeFiles: currentProject?.codeFiles || (activeCodeFile ? [activeCodeFile] : []),
        componentConfig: {
          ...(currentProject?.componentConfig || {}),
          pcbLayout: usePcbStore.getState().getLayout(),
        },
        viewport,
        name: currentProject?.name || 'Shared Circuit',
        boardType: currentProject?.boardType || 'ARDUINO_UNO',
      }
      const encoded = encodeShareState(state)
      const shareUrl = `${window.location.origin}/editor/share?state=${encodeURIComponent(encoded)}`
      await navigator.clipboard.writeText(shareUrl)
      addToast('Share link copied to clipboard!', 'success')
    } catch {
      addToast('Failed to generate share link', 'error')
    }
  }

  // ── Export handlers ──
  const handleExportZip = async () => {
    if (!currentProject) return
    try {
      const res = await projectExportApi.exportZip(currentProject.id)
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentProject.name || 'voltforge'}_sources.zip`
      a.click()
      URL.revokeObjectURL(url)
      addToast('Exported project ZIP archive', 'success')
    } catch {
      addToast('ZIP export failed', 'error')
    }
  }

  const handleExportGerber = async () => {
    if (!currentProject) return
    try {
      // Keep the toolbar export on the same DRC-gated manufacturing pipeline
      // as the PCB screen. The former project endpoint could export persisted
      // layout without checking the current design first.
      const layout = usePcbStore.getState().getLayout()
      const payload: PcbManufacturingPayload = {
        boardWidth_mm: layout.boardWidth_mm,
        boardHeight_mm: layout.boardHeight_mm,
        footprints: layout.footprints,
        projectName: currentProject.name || 'VoltForge_PCB',
        traces: layout.traces,
        vias: layout.vias,
        wires,
      }
      const drc = await pcbManufacturingApi.runDrc(payload)
      const violations = drc.data.data.violations || []
      const errors = violations.filter((violation) => violation.severity === 'ERROR')
      if (errors.length > 0) {
        addToast(`Gerber export blocked by ${errors.length} DRC error${errors.length === 1 ? '' : 's'}`, 'error')
        return
      }

      const res = await pcbManufacturingApi.exportGerber(payload)
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentProject.name || 'voltforge'}_gerber.zip`
      a.click()
      URL.revokeObjectURL(url)
      addToast('Exported PCB Gerber files', 'success')
    } catch {
      addToast('Gerber export failed', 'error')
    }
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault()
          handleSave()
        }
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          if (isOwner) undo()
        }
        if (e.key === 'z' && e.shiftKey) {
          e.preventDefault()
          if (isOwner) redo()
        }
        if (e.key === 'y') {
          e.preventDefault()
          if (isOwner) redo()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo, isOwner])

  // ── Canvas resize observer ──
  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [leftPanelOpen, viewMode])

  // ── Component Interaction (button press, relay activation, etc.) ──
  const handleComponentInteraction = useCallback(
    (nodeId: string, event: 'press' | 'release') => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return

      const isPressed = event === 'press'
      updateNode(nodeId, {
        properties: {
          ...node.properties,
          isPressed,
        },
      })

      if (!engineRef.current || !isSimulating) return

      const nodePinIds = node.pins?.map((p) => p.id) || []
      const connectedWires = wires.filter(
        (w) =>
          (w.fromNodeId === nodeId && nodePinIds.includes(w.fromPinId)) ||
          (w.toNodeId === nodeId && nodePinIds.includes(w.toPinId))
      )

      connectedWires.forEach((wire) => {
        const isFromNode = wire.fromNodeId === nodeId
        const targetNodeId = isFromNode ? wire.toNodeId : wire.fromNodeId
        const targetPinId = isFromNode ? wire.toPinId : wire.fromPinId

        const targetNode = nodes.find((n) => n.id === targetNodeId)
        if (
          targetNode &&
          isBoardComponentType(targetNode.type)
        ) {
          const mcuPin = targetNode.pins?.find((p) => p.id === targetPinId)
          if (mcuPin) {
            const pinNum = mcuPin.name.replace(/[^0-9]/g, '')
            engineRef.current?.setExternalPinState(pinNum, isPressed ? 'HIGH' : 'LOW')
          }
        }
      })
    },
    [engineRef, nodes, wires, isSimulating, updateNode]
  )

  // ── Simulation toggle ──
  const toggleSimulation = async () => {
    if (!isSimulating) {
      const requestId = ++simulationRequestRef.current
      setIsSimulating(true)
      setIsSimulationPaused(false)
      setSimulating(true)
      clearSerial()
      setSerialPanelOpen(true)
      writeSerial(`> Simulation started at ${new Date().toLocaleTimeString()}`)

      const safety = analyzeCircuitSafety(nodes, wires)
      Object.entries(safety.nodeStates).forEach(([nodeId, properties]) => {
        const node = nodes.find((n) => n.id === nodeId)
        if (node) updateNode(nodeId, { properties: { ...node.properties, ...properties } })
      })
      if (safety.issues.length > 0) {
        safety.issues.forEach((issue) =>
          writeSerial(`[${issue.severity}] ${issue.message} ${issue.suggestedFix}`)
        )
      }

      const bundledCode = bundleCodeFiles(activeCodeFile, currentProject?.codeFiles || [])
      const selectedBoardType = currentProject?.boardType || 'ARDUINO_UNO'
      const customHex = useSimulationStore.getState().customHex;
      let compiledHex: string | undefined = customHex && supportsAvr8js(selectedBoardType)
        ? customHex
        : undefined

      if (customHex) {
        if (supportsAvr8js(selectedBoardType)) {
          writeSerial(`> Running custom Intel HEX on AVR8js ATmega328P emulator (${customHex.length} chars)`);
          useSimulationStore.getState().setExecutionMode('avr8js');
        } else {
          writeSerial(`> HEX execution is unavailable for ${selectedBoardType}; using the source compatibility interpreter instead`);
          useSimulationStore.getState().setExecutionMode('interpreter');
        }
      } else {
        try {
          const compile = await simulationApi.compileFirmware({
            source: bundledCode,
            boardType: selectedBoardType,
            sketchName: currentProject?.name || 'VoltForgeSketch',
          })
          const result = compile.data.data
          const resultBoardType = result.boardType || selectedBoardType
          const canRunCompiledHex = Boolean(result.success && result.hex && supportsAvr8js(resultBoardType))
          compiledHex = canRunCompiledHex ? result.hex : undefined
          if (canRunCompiledHex) {
            useSimulationStore.getState().setExecutionMode('avr8js');
          } else if (result.success && result.hex) {
            useSimulationStore.getState().setExecutionMode('interpreter');
            writeSerial(`> Firmware compiled for ${resultBoardType}, but browser execution supports only ATmega328P-compatible boards; using the source compatibility interpreter`)
          } else {
            useSimulationStore.getState().setExecutionMode('interpreter');
          }
          writeSerial(
            result.success
              ? `> Firmware compiled by ${result.compiler} (${result.hex?.length || 0} HEX chars)`
              : `> Firmware compile failed: ${result.stderr || result.diagnostics?.[0] || 'unknown compiler error'}`
          )
        } catch (err: any) {
          useSimulationStore.getState().setExecutionMode('interpreter');
          writeSerial(`> Firmware compiler unavailable: ${err?.message || 'request failed'}`)
        }
      }

      // Stop can be clicked while a remote compiler request is pending. Do not
      // start a worker after that stop has already invalidated this request.
      if (requestId !== simulationRequestRef.current) return
      try {
        const engine = await getSimulationEngine()
        if (requestId !== simulationRequestRef.current) return
        await engine.start(bundledCode, nodes, wires, compiledHex, selectedBoardType)
      } catch (error) {
        if (error instanceof SimulationEngineLoadCancelledError || requestId !== simulationRequestRef.current) return
        setIsSimulating(false)
        setIsSimulationPaused(false)
        setSimulating(false)
        writeSerial(`[ERROR] Unable to start simulation: ${error instanceof Error ? error.message : 'engine load failed'}`)
      }
    } else {
      simulationRequestRef.current += 1
      if (regressionMode !== null) regressionTokenRef.current += 1
      setIsSimulating(false)
      setIsSimulationPaused(false)
      setSimulating(false)
      engineRef.current?.stop()
      writeSerial('> Simulation stopped')
      nodes.forEach((n) =>
        updateNode(n.id, {
          properties: {
            ...n.properties,
            isLit: false,
            isSpinning: false,
            isBeeping: false,
            isActive: false,
            escThrottle: 0,
            escRpm: 0,
            bldcRpm: 0,
            bldcRotation: 0,
          },
        })
      )
      if ((globalThis as any).__voltforgeBldcState) delete (globalThis as any).__voltforgeBldcState
    }
  }

  const stopRegression = useCallback(() => {
    if (regressionMode === null) return
    regressionTokenRef.current += 1
    stopSimulationEngine()
    setIsSimulating(false)
    setIsSimulationPaused(false)
    setSimulating(false)
  }, [regressionMode, setSimulating, stopSimulationEngine])

  const runRegression = useCallback(async () => {
    if (regressionMode !== null || canvasRenderTraceRunning || avrCompiledTraceRunning) return
    if (isSimulating) {
      addToast('Stop the active simulation before running the regression trace', 'info')
      return
    }
    let engine
    try {
      engine = await getSimulationEngine()
    } catch (error) {
      if (!(error instanceof SimulationEngineLoadCancelledError)) {
        addToast(`Simulation engine failed to load: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
      }
      return
    }

    const originalNodes = useCanvasStore.getState().nodes
    const originalWires = useCanvasStore.getState().wires
    const originalViewport = useCanvasStore.getState().viewport
    const originalFidelity = useSimulationStore.getState().fidelityMode
    const originalDirty = useProjectStore.getState().isDirty
    const preset = createMaximumComponentRegressionPreset()
    const token = ++regressionTokenRef.current

    const runtime = {
      setFidelityMode: (mode: SimulationFidelityMode) => setFidelityMode(mode),
      start: async () => {
        setIsSimulating(true)
        setIsSimulationPaused(false)
        setSimulating(true)
        await engine.start(
          MAX_COMPONENT_REGRESSION_FIRMWARE,
          preset.nodes,
          preset.wires,
          undefined,
          MAX_COMPONENT_REGRESSION_BOARD,
        )
      },
      stop: () => engine.stop(),
      subscribe: (listener: () => void) => {
        let previous = useSimulationStore.getState().solverDiagnostics
        return useSimulationStore.subscribe((state) => {
          if (state.solverDiagnostics === previous) return
          previous = state.solverDiagnostics
          listener()
        })
      },
      getDiagnostics: () => useSimulationStore.getState().solverDiagnostics,
      getNodes: () => useCanvasStore.getState().nodes,
    }

    setRegressionMode('both')
    setSolverDiagnosticsOpen(true)
    clearSolverDiagnostics()
    setRegressionRuns([])

    try {
      for (const mode of ['adaptive', 'full-fidelity'] as const) {
        if (regressionTokenRef.current !== token) break
        loadCanvas(preset.nodes, preset.wires, { x: -240, y: -120, scale: 0.72 })
        skipCanvasDirtyRef.current = true
        clearSolverDiagnostics()
        const trace = await runMaximumComponentRegression(preset, mode, runtime, {
          shouldStop: () => regressionTokenRef.current !== token,
        })
        if (regressionTokenRef.current !== token) break
        setRegressionRuns((previous) => [...previous, trace])
      }
    } catch (error) {
      addToast(`Regression trace failed: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
    } finally {
      engine.stop()
      setIsSimulating(false)
      setIsSimulationPaused(false)
      setSimulating(false)
      loadCanvas(originalNodes, originalWires, originalViewport)
      skipCanvasDirtyRef.current = true
      setDirty(originalDirty)
      setFidelityMode(originalFidelity)
      setRegressionMode(null)
    }
  }, [
    addToast,
    avrCompiledTraceRunning,
    canvasRenderTraceRunning,
    clearSolverDiagnostics,
    getSimulationEngine,
    isSimulating,
    loadCanvas,
    regressionMode,
    setDirty,
    setFidelityMode,
    setIsSimulating,
    setIsSimulationPaused,
    setSolverDiagnosticsOpen,
    setSimulating,
  ])

  const stopCanvasRenderRegression = useCallback(() => {
    if (!canvasRenderTraceRunning) return
    canvasRenderRegressionTokenRef.current += 1
  }, [canvasRenderTraceRunning])

  const runCanvasRenderRegression = useCallback(async () => {
    if (canvasRenderTraceRunning || regressionMode !== null || avrCompiledTraceRunning) return
    if (isSimulating) {
      addToast('Stop the active simulation before running the canvas trace', 'info')
      return
    }

    const originalCanvas = useCanvasStore.getState()
    const originalSimulation = useSimulationStore.getState()
    const originalNodes = originalCanvas.nodes
    const originalWires = originalCanvas.wires
    const originalViewport = originalCanvas.viewport
    const originalViewMode = viewMode
    const originalDirty = useProjectStore.getState().isDirty
    const preset = createMaximumComponentRegressionPreset()
    const token = ++canvasRenderRegressionTokenRef.current
    const measurementConsumerSignature = () => {
      const state = useSimulationStore.getState()
      return JSON.stringify({
        meterMode: state.meterMode,
        meterProbes: state.meterProbes.map((probe) => [probe.id, probe.nodeId, probe.pinId]),
        resultDataConsumers: state.resultDataConsumers,
        thermalHeatmapEnabled: state.thermalHeatmapEnabled,
        oscilloscopePanelOpen: state.oscilloscopePanelOpen,
      })
    }

    setCanvasRenderTraceRunning(true)
    setCanvasRenderTrace(null)
    setSolverDiagnosticsOpen(true)
    setViewMode('canvas')
    loadCanvas(preset.nodes, preset.wires, { x: -80, y: -40, scale: 1 })
    skipCanvasDirtyRef.current = true
    useSimulationStore.getState().setCircuitState({}, {}, {}, {}, true)
    setIsSimulating(true)
    setSimulating(true)

    try {
      const trace = await runMaximumCanvasRenderRegression(preset, {
        viewportWidth: Math.max(1, canvasSize.width),
        viewportHeight: Math.max(1, canvasSize.height),
        setScenario: (showCurrentFlow, qualityMode) => {
          const state = useSimulationStore.getState()
          state.setShowCurrentFlow(showCurrentFlow)
          state.setCurrentFlowQualityMode(qualityMode)
        },
        setViewport: (nextViewport) => useCanvasStore.getState().setViewport(nextViewport),
        publishWireCurrents: (wireCurrents) => {
          const state = useSimulationStore.getState()
          state.setCircuitState(
            state.nodeVoltages,
            wireCurrents,
            state.branchCurrents,
            state.componentPower,
            state.solverConverged,
          )
        },
        getWireCurrents: () => useSimulationStore.getState().wireCurrents,
        getMeasurementConsumerSignature: measurementConsumerSignature,
        now: () => performance.now(),
        requestFrame: (callback) => window.requestAnimationFrame(callback),
      }, {
        shouldStop: () => canvasRenderRegressionTokenRef.current !== token,
      })
      setCanvasRenderTrace(trace)
      if (trace.completed) addToast('Canvas rendering trace completed', 'success')
    } catch (error) {
      addToast(`Canvas trace failed: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
    } finally {
      setIsSimulating(false)
      loadCanvas(originalNodes, originalWires, originalViewport)
      skipCanvasDirtyRef.current = true
      const state = useSimulationStore.getState()
      state.setCircuitState(
        originalSimulation.nodeVoltages,
        originalSimulation.wireCurrents,
        originalSimulation.branchCurrents,
        originalSimulation.componentPower,
        originalSimulation.solverConverged,
      )
      state.setShowCurrentFlow(originalSimulation.showCurrentFlow)
      state.setCurrentFlowQualityMode(originalSimulation.currentFlowQualityMode)
      state.setSimulating(originalSimulation.isSimulating)
      setDirty(originalDirty)
      setViewMode(originalViewMode)
      setCanvasRenderTraceRunning(false)
    }
  }, [
    addToast,
    avrCompiledTraceRunning,
    canvasRenderTraceRunning,
    canvasSize.height,
    canvasSize.width,
    isSimulating,
    loadCanvas,
    regressionMode,
    setDirty,
    setIsSimulating,
    setSimulating,
    setSolverDiagnosticsOpen,
    viewMode,
  ])

  const stopAvrCompiledFirmwareTrace = useCallback(() => {
    if (!avrCompiledTraceRunning) return
    avrCompiledTraceTokenRef.current += 1
    engineRef.current?.stopAvrRuntimeTrace()
    stopSimulationEngine()
    setIsSimulating(false)
    setIsSimulationPaused(false)
    setSimulating(false)
  }, [avrCompiledTraceRunning, engineRef, setSimulating, stopSimulationEngine])

  const runAvrCompiledFirmwareTrace = useCallback(async () => {
    if (avrCompiledTraceRunning || canvasRenderTraceRunning || regressionMode !== null) return
    if (isSimulating) {
      addToast('Stop the active simulation before running the compiled AVR trace', 'info')
      return
    }

    const originalCanvas = useCanvasStore.getState()
    const originalSimulation = useSimulationStore.getState()
    const originalNodes = originalCanvas.nodes
    const originalWires = originalCanvas.wires
    const originalViewport = originalCanvas.viewport
    const originalViewMode = viewMode
    const originalDirty = useProjectStore.getState().isDirty
    const fixture = createAvrCompiledFirmwareFixture()
    const token = ++avrCompiledTraceTokenRef.current
    const inputProbeTarget = document.createElement('button')

    setAvrCompiledTraceRunning(true)
    setAvrCompiledTrace(null)
    setSolverDiagnosticsOpen(true)
    setViewMode('canvas')
    loadCanvas(fixture.nodes, fixture.wires, { x: 40, y: 20, scale: 0.9 })
    skipCanvasDirtyRef.current = true

    try {
      const compile = await simulationApi.compileFirmware({
        source: AVR_COMPILED_TRACE_FIRMWARE,
        boardType: 'ARDUINO_UNO',
        sketchName: 'VoltForgeAvrResponsiveness',
      })
      const result = compile.data.data
      if (!result.success || !result.hex?.trim()) {
        throw new Error(result.stderr || result.diagnostics?.[0] || 'compiler returned no Intel HEX')
      }
      if (avrCompiledTraceTokenRef.current !== token) return

      const engine = await getSimulationEngine()
      if (avrCompiledTraceTokenRef.current !== token) return
      const modes: AvrCompiledFirmwareTrace['modes'] = []

      for (const mode of ['adaptive', 'full-fidelity'] as const) {
        if (avrCompiledTraceTokenRef.current !== token) break
        setFidelityMode(mode)
        useSimulationStore.getState().setExecutionMode('avr8js')
        setIsSimulating(true)
        setIsSimulationPaused(false)
        setSimulating(true)
        engine.startAvrRuntimeTrace()
        await engine.start(
          AVR_COMPILED_TRACE_FIRMWARE,
          fixture.nodes,
          fixture.wires,
          result.hex,
          'ARDUINO_UNO',
        )

        const modeTrace = await captureAvrCompiledFirmwareMode(mode, {
          now: () => performance.now(),
          requestFrame: (callback) => window.requestAnimationFrame(callback),
          scheduleInputProbe: (callback) => {
            window.setTimeout(() => {
              inputProbeTarget.addEventListener('click', callback, { once: true })
              inputProbeTarget.click()
            }, 0)
          },
          getWorkload: () => useSimulationStore.getState().avrWorkload,
          getPeripheralSnapshot: () => engine.getAvrRuntimeTraceSnapshot(),
          shouldStop: () => avrCompiledTraceTokenRef.current !== token,
        }, AVR_COMPILED_TRACE_DURATION_MS)
        engine.stopAvrRuntimeTrace()
        engine.stop()
        setIsSimulating(false)
        setIsSimulationPaused(false)
        setSimulating(false)
        modes.push(modeTrace)
        if (!modeTrace.completed) break
      }

      if (modes.length > 0) {
        const trace: AvrCompiledFirmwareTrace = {
          fixtureId: AVR_COMPILED_TRACE_ID,
          capturedAt: new Date().toISOString(),
          compiler: result.compiler,
          targetBoard: 'ARDUINO_UNO',
          source: AVR_COMPILED_TRACE_FIRMWARE,
          durationPerModeMs: AVR_COMPILED_TRACE_DURATION_MS,
          inputLatencyTargetMs: AVR_INPUT_LATENCY_TARGET_MS,
          frameTimeTargetMs: AVR_FRAME_TIME_TARGET_MS,
          completed: modes.length === 2 && modes.every((mode) => mode.completed),
          modes,
        }
        setAvrCompiledTrace(trace)
        if (trace.completed && trace.modes.every((mode) => mode.responsive)) {
          addToast('Compiled AVR responsiveness trace passed in both fidelity modes', 'success')
        } else if (trace.completed) {
          addToast('Compiled AVR trace completed with one or more failed targets', 'info')
        }
      }
    } catch (error) {
      if (avrCompiledTraceTokenRef.current === token) {
        addToast(`Compiled AVR trace failed: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
      }
    } finally {
      engineRef.current?.stopAvrRuntimeTrace()
      stopSimulationEngine()
      setIsSimulating(false)
      setIsSimulationPaused(false)
      setSimulating(false)
      loadCanvas(originalNodes, originalWires, originalViewport)
      skipCanvasDirtyRef.current = true
      const state = useSimulationStore.getState()
      state.resetSimulationTime()
      state.setCircuitState(
        originalSimulation.nodeVoltages,
        originalSimulation.wireCurrents,
        originalSimulation.branchCurrents,
        originalSimulation.componentPower,
        originalSimulation.solverConverged,
        originalSimulation.simulationTime,
      )
      state.setShowCurrentFlow(originalSimulation.showCurrentFlow)
      state.setCurrentFlowQualityMode(originalSimulation.currentFlowQualityMode)
      state.setExecutionMode(originalSimulation.executionMode)
      state.setFidelityMode(originalSimulation.fidelityMode)
      state.setSimulating(originalSimulation.isSimulating)
      setDirty(originalDirty)
      setViewMode(originalViewMode)
      setAvrCompiledTraceRunning(false)
    }
  }, [
    addToast,
    avrCompiledTraceRunning,
    canvasRenderTraceRunning,
    engineRef,
    getSimulationEngine,
    isSimulating,
    loadCanvas,
    regressionMode,
    setDirty,
    setFidelityMode,
    setIsSimulating,
    setIsSimulationPaused,
    setSimulating,
    setSolverDiagnosticsOpen,
    stopSimulationEngine,
    viewMode,
  ])

  // Right click context menu handler
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    })
  }

  if (isLoading && !isPreset) {
    return (
      <div className="vf-editor-loading">
        <Zap size={32} className="vf-spin" />
        <span>Loading project...</span>
      </div>
    )
  }

  const projectName = currentProject?.name || 'Untitled Project'

  const exportDropdownItems = [
    { label: 'Export ZIP archive', icon: <FileArchive size={15} />, onClick: handleExportZip },
    { label: 'Export Gerber PCB', icon: <CircuitBoard size={15} />, onClick: handleExportGerber },
  ]

  const activeSecondaryToolCount = [
    showMultimeter,
    oscilloscopePanelOpen,
    showBom,
    showAiChat,
    showAiValidator,
    showIotInspector,
    solverDiagnosticsOpen,
    showSettings,
  ].filter(Boolean).length

  const contextMenuItems = !isOwner
    ? []
    : [
        { label: 'Undo', icon: <Undo2 size={12} />, onClick: undo },
        { label: 'Redo', icon: <Redo2 size={12} />, onClick: redo },
        { label: 'Clear Workspace', icon: <Trash2 size={12} style={{ color: '#be3b3b' }} />, destructive: true, onClick: clearCanvas },
      ]

  return (
    <div className="vf-editor">
      {/* ── Prioritized command ribbon ── */}
      <header className={`vf-editor__ribbon ${secondaryToolsOpen ? 'is-expanded' : ''}`}>
        <div className="vf-editor__toolbar">
          <div className="vf-editor__toolbar-left">
          <button
            className="vf-editor__back"
            onClick={() => navigate('/projects')}
            title="Back to projects"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="vf-editor__project-info">
            <div className="vf-editor__project-primary">
              <h1 className="vf-editor__project-name">{projectName}</h1>
              {isDirty && <span className="vf-editor__dirty-dot" />}
              {!isPreset && (
                <span className="vf-status-badge" aria-hidden={!isLiveSyncConnected}>
                  <span className="vf-status-badge__dot" />
                  <span>Live Sync</span>
                </span>
              )}
            </div>
            {currentProject?.forkedFromId && currentProject?.forkedFromName && (
              <span className="vf-editor__forked-from">
                forked from{' '}
                <a
                  href={`/editor/${currentProject.forkedFromId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/editor/${currentProject.forkedFromId}`);
                  }}
                >
                  {currentProject.forkedFromName}
                </a>
              </span>
            )}
          </div>
        </div>

        <div className="vf-editor__toolbar-center">
          <div className="vf-editor__view-switcher">
            <button
              className={`vf-editor__view-btn ${viewMode === 'canvas' ? 'is-active' : ''}`}
              onClick={() => setViewMode('canvas')}
              title="Canvas view"
              type="button"
              aria-pressed={viewMode === 'canvas'}
            >
              <Layout size={14} />
            </button>
            <button
              className={`vf-editor__view-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split view"
              type="button"
              aria-pressed={viewMode === 'split'}
            >
              <Code2 size={14} />
              <Layout size={14} />
            </button>
            <button
              className={`vf-editor__view-btn ${viewMode === 'code' ? 'is-active' : ''}`}
              onClick={() => setViewMode('code')}
              title="Code view"
              type="button"
              aria-pressed={viewMode === 'code'}
            >
              <Code2 size={14} />
            </button>
            <button
              className={`vf-editor__view-btn ${viewMode === 'pcb' ? 'is-active' : ''}`}
              onClick={() => setViewMode('pcb')}
              title="2-Layer PCB Layout view"
              type="button"
              aria-pressed={viewMode === 'pcb'}
            >
              <Layers size={14} />
            </button>
          </div>

          <span className="vf-editor__divider" />

          <button className="vf-editor__tool-btn" onClick={undo} disabled={!isOwner} title="Undo (Ctrl+Z)">
            <Undo2 size={15} />
          </button>
          <button className="vf-editor__tool-btn" onClick={redo} disabled={!isOwner} title="Redo (Ctrl+Y)">
            <Redo2 size={15} />
          </button>

          <span className="vf-editor__divider" />

          <label
            className="vf-editor__solver-control"
            title={isSimulating
              ? 'Stop the simulation before changing solver and AVR fidelity'
              : 'Adaptive widens expensive solver timesteps and gives AVR execution a 4 ms frame slice; Full fidelity keeps the solver timestep and gives AVR an 8 ms slice'}
          >
            <span>Fidelity</span>
            <select
              value={fidelityMode}
              disabled={isSimulating}
              onChange={(event) => setFidelityMode(
                event.target.value === 'full-fidelity' ? 'full-fidelity' : 'adaptive',
              )}
              aria-label="Solver fidelity"
            >
              <option value="adaptive">Adaptive</option>
              <option value="full-fidelity">Full fidelity</option>
            </select>
          </label>
          {isSimulating && !canvasRenderTraceRunning && !avrCompiledTraceRunning && (
            <span className="vf-editor__simulation-time" title="Monotonic physical simulation time">
              t={simulationTime.toFixed(3)}s
            </span>
          )}
          {isSimulating && !canvasRenderTraceRunning && !avrCompiledTraceRunning && executionMode === 'avr8js' && avrWorkload.active && (
            <span
              className={`vf-editor__avr-workload ${avrWorkload.budgetLimited ? 'is-limited' : ''}`}
              title={[
                `${avrWorkload.fidelityMode === 'full-fidelity' ? 'Full fidelity' : 'Adaptive'} AVR execution`,
                `${avrWorkload.averageSliceMs.toFixed(2)} ms average of ${avrWorkload.sliceBudgetMs.toFixed(0)} ms slice budget`,
                `${Math.round(avrWorkload.instructionsPerSecond).toLocaleString()} instructions/s`,
                `${avrWorkload.pendingCycleLagMs.toFixed(1)} ms retained cycle debt`,
                'Firmware instructions and peripheral ticks are never skipped',
              ].join(' · ')}
            >
              {avrWorkload.budgetLimited ? 'AVR capped' : 'AVR'} · {(avrWorkload.emulatedClockHz / 1_000_000).toFixed(2)} MHz · {avrWorkload.mainThreadUtilizationPercent.toFixed(0)}%
            </span>
          )}

          <button
            className={`vf-editor__sim-btn ${isSimulating ? 'is-running' : ''}`}
            onClick={toggleSimulation}
            disabled={regressionMode !== null || canvasRenderTraceRunning || avrCompiledTraceRunning}
            type="button"
            aria-label={canvasRenderTraceRunning ? 'Canvas trace running' : avrCompiledTraceRunning ? 'AVR trace running' : isSimulating ? 'Stop simulation' : 'Start simulation'}
          >
            {canvasRenderTraceRunning || avrCompiledTraceRunning ? <Gauge size={14} /> : isSimulating ? <Square size={14} /> : <Play size={14} />}
            <span className="vf-editor__action-label">
              {canvasRenderTraceRunning ? 'Canvas trace' : avrCompiledTraceRunning ? 'AVR trace' : isSimulating ? 'Stop' : 'Simulate'}
            </span>
          </button>
          {isSimulating && !canvasRenderTraceRunning && !avrCompiledTraceRunning && (
            <>
              <button
                className="vf-editor__tool-btn"
                onClick={() => {
                  if (isSimulationPaused) {
                    engineRef.current?.resume()
                    setIsSimulationPaused(false)
                  } else {
                    engineRef.current?.pause()
                    setIsSimulationPaused(true)
                  }
                }}
                title={isSimulationPaused ? 'Resume simulation' : 'Pause simulation'}
              >
                {isSimulationPaused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button
                className="vf-editor__tool-btn"
                onClick={() => engineRef.current?.step()}
                disabled={!isSimulationPaused}
                title="Advance one simulation step"
              >
                <StepForward size={14} />
              </button>
            </>
          )}
        </div>

        <div className="vf-editor__toolbar-right">
          <button
            ref={secondaryToolsButtonRef}
            className={`vf-editor__tools-toggle ${secondaryToolsOpen || activeSecondaryToolCount > 0 ? 'is-active' : ''}`}
            onClick={() => setSecondaryToolsOpen((open) => !open)}
            type="button"
            aria-expanded={secondaryToolsOpen}
            aria-controls="vf-editor-secondary-tools"
            aria-label={`${secondaryToolsOpen ? 'Hide' : 'Show'} secondary editor tools${activeSecondaryToolCount > 0 ? `, ${activeSecondaryToolCount} active` : ''}`}
            title={secondaryToolsOpen ? 'Hide secondary editor tools' : 'Show secondary editor tools'}
          >
            <SlidersHorizontal size={14} />
            <span className="vf-editor__action-label">Tools</span>
            {activeSecondaryToolCount > 0 && (
              <span className="vf-editor__tools-count" aria-label={`${activeSecondaryToolCount} active tools`}>
                {activeSecondaryToolCount}
              </span>
            )}
            <ChevronDown className="vf-editor__tools-chevron" size={13} />
          </button>

          <span className="vf-editor__divider" />

          {/* Fork button if editing non-owned project, save button if owner */}
          {isOwner ? (
            <button
              className="vf-editor__save-btn"
              onClick={handleSave}
              disabled={isSaving || isPreset}
              type="button"
              aria-label={isSaving ? 'Saving project' : 'Save project'}
            >
              <Save size={14} />
              <span className="vf-editor__action-label">{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          ) : currentProject?.userForkId ? (
            <button
              className="vf-editor__save-btn"
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                borderColor: '#10b981',
              }}
              onClick={() => navigate(`/editor/${currentProject.userForkId}`)}
              type="button"
              aria-label="Go to your fork"
            >
              <GitFork size={14} />
              <span className="vf-editor__action-label">Go to your Fork</span>
            </button>
          ) : (
            <button
              className="vf-editor__save-btn"
              style={{
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                borderColor: '#a855f7',
              }}
              onClick={() => forkMutation.mutate()}
              disabled={forkMutation.isPending}
              type="button"
              aria-label={forkMutation.isPending ? 'Forking project' : 'Fork project to edit'}
            >
              <GitFork size={14} />
              <span className="vf-editor__action-label">{forkMutation.isPending ? 'Forking...' : 'Fork to Edit'}</span>
            </button>
          )}
        </div>
        </div>

        {secondaryToolsOpen && (
          <div
            ref={secondaryToolsTrayRef}
            id="vf-editor-secondary-tools"
            className="vf-editor__secondary-ribbon"
            role="toolbar"
            aria-label="Secondary editor tools"
            aria-orientation="horizontal"
          >
            <div className="vf-editor__secondary-group">
              <span className="vf-editor__secondary-label">Inspect</span>
              <SecondaryToolButton
                icon={<Gauge size={15} />}
                label="Multimeter"
                onClick={() => setShowMultimeter(!showMultimeter)}
                pressed={showMultimeter}
              />
              <SecondaryToolButton
                icon={<Activity size={15} />}
                label="Oscilloscope"
                onClick={() => setOscilloscopePanelOpen(!oscilloscopePanelOpen)}
                pressed={oscilloscopePanelOpen}
              />
              <SecondaryToolButton
                icon={<Package size={15} />}
                label="Bill of materials"
                onClick={() => setShowBom(!showBom)}
                pressed={showBom}
              />
            </div>

            <span className="vf-editor__secondary-divider" />

            <div className="vf-editor__secondary-group">
              <span className="vf-editor__secondary-label">Assist</span>
              <SecondaryToolButton
                icon={<Sparkles size={15} />}
                label="AI assistant"
                onClick={() => setShowAiChat(!showAiChat)}
                pressed={showAiChat}
              />
              <SecondaryToolButton
                icon={<ShieldAlert size={15} />}
                label="AI validator"
                onClick={() => setShowAiValidator(!showAiValidator)}
                pressed={showAiValidator}
              />
              <SecondaryToolButton
                icon={<Wifi size={15} />}
                label="IoT inspector"
                onClick={() => setShowIotInspector(!showIotInspector)}
                pressed={showIotInspector}
              />
              <SecondaryToolButton
                icon={<Bug size={15} />}
                label="Solver and performance diagnostics"
                onClick={() => setSolverDiagnosticsOpen(!solverDiagnosticsOpen)}
                pressed={solverDiagnosticsOpen}
              />
            </div>

            <span className="vf-editor__secondary-divider" />

            <div className="vf-editor__secondary-group">
              <span className="vf-editor__secondary-label">Workspace</span>
              <SecondaryToolButton
                icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={toggleTheme}
              />
              <SecondaryToolButton
                icon={<PanelLeftClose size={15} />}
                label="Toggle component panel"
                onClick={() => setLeftPanelOpen(!leftPanelOpen)}
                pressed={leftPanelOpen}
              />
              <SecondaryToolButton
                icon={<PanelRightClose size={15} />}
                label={viewMode === 'split' ? 'Close split workspace' : 'Open split workspace'}
                onClick={() => setViewMode(viewMode === 'split' ? 'canvas' : 'split')}
                pressed={viewMode === 'split'}
              />
            </div>

            <span className="vf-editor__secondary-divider" />

            <div className="vf-editor__secondary-group">
              <span className="vf-editor__secondary-label">Project</span>
              <SecondaryToolButton
                icon={<Share2 size={15} />}
                label="Copy share link"
                onClick={handleShare}
              />
              {exportDropdownItems.map((item) => (
                <SecondaryToolButton
                  icon={item.icon}
                  key={item.label}
                  label={item.label}
                  onClick={item.onClick}
                />
              ))}
              {isOwner && (
                <SecondaryToolButton
                  icon={<Settings size={15} />}
                  label="Project settings"
                  onClick={() => setShowSettings(true)}
                  pressed={showSettings}
                />
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <div className="vf-editor__body">
        {/* Left panel — Component library */}
        {leftPanelOpen && viewMode !== 'code' && (
          <aside className="vf-editor__left-panel">
            <ComponentPanel readOnly={!isOwner || canvasRenderTraceRunning || avrCompiledTraceRunning} />
          </aside>
        )}

        {/* Center Workspace (uses resizable SplitPane in split view) */}
        <div className="vf-editor__center">
          <div className="vf-editor__workspace" onContextMenu={handleContextMenu}>
            {viewMode === 'split' ? (
              <SplitPane
                left={
                  <div ref={canvasContainerRef} className="vf-editor__canvas-area is-split">
                    <CircuitCanvas
                      width={canvasSize.width}
                      height={canvasSize.height}
                      isSimulating={isSimulating}
                      isProbeMode={showMultimeter}
                      onProbeToggle={toggleMeterProbe}
                      collaborators={activeUsers}
                      onComponentInteraction={handleComponentInteraction}
                      onCursorMove={broadcastCursorMove}
                      readOnly={!isOwner || canvasRenderTraceRunning || avrCompiledTraceRunning}
                    />
                  </div>
                }
                right={
                  <div className="vf-editor__code-area is-split">
                    <EditorFeatureBoundary label="code editor">
                      <CodeEditor readOnly={!isOwner} />
                    </EditorFeatureBoundary>
                  </div>
                }
              />
            ) : (
              <>
                {viewMode === 'canvas' && (
                  <div ref={canvasContainerRef} className="vf-editor__canvas-area">
                    <CircuitCanvas
                      width={canvasSize.width}
                      height={canvasSize.height}
                      isSimulating={isSimulating}
                      isProbeMode={showMultimeter}
                      onProbeToggle={toggleMeterProbe}
                      collaborators={activeUsers}
                      onComponentInteraction={handleComponentInteraction}
                      onCursorMove={broadcastCursorMove}
                      readOnly={!isOwner || canvasRenderTraceRunning || avrCompiledTraceRunning}
                    />
                  </div>
                )}
                {viewMode === 'code' && (
                  <div className="vf-editor__code-area">
                    <EditorFeatureBoundary label="code editor">
                      <CodeEditor readOnly={!isOwner} />
                    </EditorFeatureBoundary>
                  </div>
                )}
                {viewMode === 'pcb' && (
                  <div ref={canvasContainerRef} className="vf-editor__canvas-area">
                    <EditorFeatureBoundary label="PCB workspace">
                      <PcbCanvas
                        width={canvasSize.width}
                        height={canvasSize.height}
                        projectName={projectName}
                        readOnly={!isOwner}
                      />
                    </EditorFeatureBoundary>
                  </div>
                )}
              </>
            )}

            {/* Instrument floating overlays */}
            {showMultimeter && (
              <EditorFeatureBoundary label="multimeter">
                <MultimeterPanel isOpen onClose={() => setShowMultimeter(false)} />
              </EditorFeatureBoundary>
            )}
            {showBom && (
              <EditorFeatureBoundary label="bill of materials">
                <BomPanel isOpen onClose={() => setShowBom(false)} />
              </EditorFeatureBoundary>
            )}
            {showAiChat && (
              <EditorFeatureBoundary label="AI assistant">
                <AiChatPanel
                  isOpen
                  onClose={() => setShowAiChat(false)}
                  projectContext={projectName}
                  readOnly={!isOwner}
                />
              </EditorFeatureBoundary>
            )}
            {showAiValidator && (
              <EditorFeatureBoundary label="AI validator">
                <AiValidatorPanel isOpen readOnly={!isOwner} onClose={() => setShowAiValidator(false)} />
              </EditorFeatureBoundary>
            )}
            {showIotInspector && (
              <EditorFeatureBoundary label="IoT inspector">
                <IotInspectorPanel isOpen onClose={() => setShowIotInspector(false)} />
              </EditorFeatureBoundary>
            )}
            {solverDiagnosticsOpen && (
              <EditorFeatureBoundary label="solver diagnostics">
                <SolverDiagnosticsPanel
                  isOpen
                  onClose={() => {
                    if (regressionMode !== null) stopRegression()
                    if (canvasRenderTraceRunning) stopCanvasRenderRegression()
                    if (avrCompiledTraceRunning) stopAvrCompiledFirmwareTrace()
                    setSolverDiagnosticsOpen(false)
                  }}
                  diagnostics={solverDiagnostics}
                  regressionMode={regressionMode}
                  regressionRuns={regressionRuns}
                  onRunRegression={runRegression}
                  onStopRegression={stopRegression}
                  canvasRenderTraceRunning={canvasRenderTraceRunning}
                  canvasRenderTrace={canvasRenderTrace}
                  onRunCanvasRenderTrace={runCanvasRenderRegression}
                  onStopCanvasRenderTrace={stopCanvasRenderRegression}
                  avrCompiledTraceRunning={avrCompiledTraceRunning}
                  avrCompiledTrace={avrCompiledTrace}
                  onRunAvrCompiledTrace={runAvrCompiledFirmwareTrace}
                  onStopAvrCompiledTrace={stopAvrCompiledFirmwareTrace}
                />
              </EditorFeatureBoundary>
            )}
            <PropertyEditor readOnly={!isOwner || canvasRenderTraceRunning || avrCompiledTraceRunning} />
          </div>

          {/* Serial monitor / Oscilloscope Trace splits */}
          <div className="vf-editor-bottom-pane">
            <SerialMonitor />
            {oscilloscopePanelOpen && (
              <EditorFeatureBoundary label="oscilloscope">
                <OscilloscopePanel
                  simulationPaused={isSimulationPaused}
                  onPause={() => {
                    engineRef.current?.pause()
                    setIsSimulationPaused(true)
                  }}
                  onResume={() => {
                    engineRef.current?.resume()
                    setIsSimulationPaused(false)
                  }}
                  onStep={() => engineRef.current?.step()}
                />
              </EditorFeatureBoundary>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <EditorFeatureBoundary label="project settings">
          <ProjectSettingsModal isOpen onClose={() => setShowSettings(false)} />
        </EditorFeatureBoundary>
      )}

      {/* Canvas right-click context menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={() => setContextMenu({ ...contextMenu, isOpen: false })}
      />
    </div>
  )
}
