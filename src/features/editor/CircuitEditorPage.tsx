import { useEffect, useCallback, useState, useRef } from 'react'
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
  Download,
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
  FileText,
  Trash2,
  Wifi,
  Layers,
} from 'lucide-react'

import { projectApi, simulationApi, projectExportApi } from '../../api/services'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore, SMART_DEVICE_PRESET } from '../../store/projectStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useThemeStore } from '../../store/themeStore'
import { useToastStore } from '../../store/useToastStore'
import { useAuth } from '../../auth/useAuth'
import { useCollaboration } from '../../hooks/useCollaboration'

import { analyzeCircuitSafety } from '../canvas/pinRegistry'
import { isBoardComponentType } from '../canvas/boardCatalog'
import { SimulationEngine } from '../simulator/SimulationEngine'
import { LogicRegistry } from '../simulator/logic/LogicRegistry'

import CircuitCanvas from '../canvas/CircuitCanvas'
import PcbCanvas from '../pcb/PcbCanvas'
import ComponentPanel from './ComponentPanel'
import PropertyEditor from './PropertyEditor'
import SerialMonitor from './SerialMonitor'
import CodeEditor from './CodeEditor'

// Import feature panels
import MultimeterPanel from './MultimeterPanel'
import OscilloscopePanel from './OscilloscopePanel'
import BomPanel from './BomPanel'
import AiChatPanel from '../ai/AiChatPanel'
import AiValidatorPanel from './AiValidatorPanel'
import IotInspectorPanel from './IotInspectorPanel'
import ProjectSettingsModal from './ProjectSettingsModal'

import { ContextMenu } from '../../components/ui/ContextMenu'
import { Dropdown } from '../../components/ui/Dropdown'
import { SplitPane } from '../../components/ui/SplitPane'
import type { Project, CodeFile } from '../../types/domain'

type ViewMode = 'canvas' | 'code' | 'split' | 'pcb'

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
  const activeCodeFile = useProjectStore((s) => s.activeCodeFile)
  const updateCodeFileContent = useProjectStore((s) => s.updateCodeFileContent)

  // Canvas state
  const loadCanvas = useCanvasStore((s) => s.loadCanvas)
  const nodes = useCanvasStore((s) => s.nodes)
  const wires = useCanvasStore((s) => s.wires)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const clearCanvas = useCanvasStore((s) => s.clearCanvas || (() => loadCanvas([], [])))

  // Visual/Panel toggles
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isSimulationPaused, setIsSimulationPaused] = useState(false)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const engineRef = useRef<SimulationEngine | null>(null)

  // Migrated features panel open state
  const [showMultimeter, setShowMultimeter] = useState(false)
  const [showBom, setShowBom] = useState(false)
  const [showAiChat, setShowAiChat] = useState(false)
  const [showAiValidator, setShowAiValidator] = useState(false)
  const [showIotInspector, setShowIotInspector] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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
  const toggleMeterProbe = useSimulationStore((s) => s.toggleMeterProbe)
  const oscilloscopePanelOpen = useSimulationStore((s) => s.oscilloscopePanelOpen)
  const setOscilloscopePanelOpen = useSimulationStore((s) => s.setOscilloscopePanelOpen)
  const { theme, toggleTheme } = useThemeStore()
  const updateNode = useCanvasStore((s) => s.updateNode)

  const isPreset = projectId === 'preset-smart-device'
  const isOwner = Boolean(
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
    useCollaboration(projectId || '')

  // ── Load project ──
  const { data: fetchedProject, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const r = await projectApi.getById(projectId!)
      return r.data.data
    },
    enabled: !!projectId,
  })

  // Set project layout and codes
  useEffect(() => {
    const project = fetchedProject || (isPreset ? SMART_DEVICE_PRESET : null)
    if (project) {
      setCurrentProject(project as Project)
      if (project.canvasLayout) {
        loadCanvas(project.canvasLayout.nodes || [], project.canvasLayout.wires || [])
      }
    }
  }, [fetchedProject, isPreset, setCurrentProject, loadCanvas])

  // Parse share parameters if available
  useEffect(() => {
    const stateParam = searchParams.get('state')
    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(stateParam))
        if (decoded.nodes && decoded.wires) {
          loadCanvas(decoded.nodes, decoded.wires)
        }
        if (decoded.code && activeCodeFile) {
          updateCodeFileContent(activeCodeFile.id, decoded.code)
        }
        addToast('Loaded shared project state (read-only)', 'info')
      } catch (e) {
        console.error('Failed to parse shared state', e)
        addToast('Invalid shared state link', 'error')
      }
    }
  }, [searchParams, loadCanvas, activeCodeFile, updateCodeFileContent, addToast])

  // Broadcast layout changes during collaboration
  useEffect(() => {
    if (isLiveSyncConnected) {
      broadcastCanvasSync(nodes, wires)
    }
  }, [broadcastCanvasSync, nodes, wires, isLiveSyncConnected])

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
      await projectApi.update(currentProject.id, {
        canvasLayout: {
          nodes,
          wires,
          viewport: useCanvasStore.getState().viewport,
        } as any,
        codeFiles,
      })
    },
    onSuccess: () => {
      setDirty(false)
      setSaving(false)
      addToast('Project saved successfully', 'success')
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: () => {
      setSaving(false)
      addToast('Failed to save project', 'error')
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
  const handleShare = () => {
    try {
      const state = {
        nodes,
        wires,
        code: activeCodeFile?.content || '',
        boardType: currentProject?.boardType || 'ARDUINO_UNO',
      }
      const encoded = btoa(JSON.stringify(state))
      const shareUrl = `${window.location.origin}/editor/share?state=${encoded}`
      navigator.clipboard.writeText(shareUrl)
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
      const res = await projectExportApi.exportGerber(currentProject.id)
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
          undo()
        }
        if (e.key === 'z' && e.shiftKey) {
          e.preventDefault()
          redo()
        }
        if (e.key === 'y') {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo])

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

  // ── Setup simulation engine ──
  useEffect(() => {
    engineRef.current = new SimulationEngine({
      onSerialOutput: (text, options) => writeSerial(text, options),
      onBaudRateChange: setBaudRate,
      onPinStateChange: (cid, pid, state, value) => {
        const node = useCanvasStore.getState().nodes.find((n) => n.id === cid)
        if (node) LogicRegistry.dispatch(node.type, cid, pid, state, value)
      },
      onDebugSnapshot: setDebugSnapshot,
      onError: (err) => writeSerial(`[ERROR] ${err}`),
    })
    return () => {
      engineRef.current?.stop()
    }
  }, [setBaudRate, setDebugSnapshot, writeSerial])

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
    [nodes, wires, isSimulating, updateNode]
  )

  // ── Simulation toggle ──
  const toggleSimulation = async () => {
    if (!isSimulating) {
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
      const customHex = useSimulationStore.getState().customHex;
      let compiledHex: string | undefined = customHex || undefined

      if (customHex) {
        writeSerial(`> Running custom Intel HEX on AVR8js ATmega328P emulator (${customHex.length} chars)`);
        useSimulationStore.getState().setExecutionMode('avr8js');
      } else {
        try {
          const compile = await simulationApi.compileFirmware({
            source: bundledCode,
            boardType: currentProject?.boardType,
            sketchName: currentProject?.name || 'VoltForgeSketch',
          })
          const result = compile.data.data
          compiledHex = result.success ? result.hex : undefined
          if (compiledHex) {
            useSimulationStore.getState().setExecutionMode('avr8js');
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

      await engineRef.current?.start(bundledCode, nodes, wires, compiledHex)
    } else {
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
    { label: 'Export ZIP Archive', icon: <FileText size={12} />, onClick: handleExportZip },
    { label: 'Export Gerber PCB', icon: <Package size={12} />, onClick: handleExportGerber },
  ]

  const contextMenuItems = !isOwner
    ? []
    : [
        { label: 'Undo', icon: <Undo2 size={12} />, onClick: undo },
        { label: 'Redo', icon: <Redo2 size={12} />, onClick: redo },
        { label: 'Clear Workspace', icon: <Trash2 size={12} style={{ color: '#be3b3b' }} />, destructive: true, onClick: clearCanvas },
      ]

  return (
    <div className="vf-editor">
      {/* ── Toolbar ── */}
      <header className="vf-editor__toolbar">
        <div className="vf-editor__toolbar-left">
          <button
            className="vf-editor__back"
            onClick={() => navigate('/projects')}
            title="Back to projects"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="vf-editor__project-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="vf-editor__project-name">{projectName}</h1>
              {isDirty && <span className="vf-editor__dirty-dot" />}
              {isLiveSyncConnected && (
                <span className="vf-status-badge">
                  <span className="vf-status-badge__dot" />
                  <span>Live Sync</span>
                </span>
              )}
            </div>
            {currentProject?.forkedFromId && currentProject?.forkedFromName && (
              <span className="vf-editor__forked-from" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', lineHeight: '1' }}>
                forked from{' '}
                <a
                  href={`/editor/${currentProject.forkedFromId}`}
                  style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 500 }}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/editor/${currentProject.forkedFromId}`);
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
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
            >
              <Layout size={14} />
            </button>
            <button
              className={`vf-editor__view-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split view"
            >
              <Code2 size={14} />
              <Layout size={14} />
            </button>
            <button
              className={`vf-editor__view-btn ${viewMode === 'code' ? 'is-active' : ''}`}
              onClick={() => setViewMode('code')}
              title="Code view"
            >
              <Code2 size={14} />
            </button>
            <button
              className={`vf-editor__view-btn ${viewMode === 'pcb' ? 'is-active' : ''}`}
              onClick={() => setViewMode('pcb')}
              title="2-Layer PCB Layout view"
            >
              <Layers size={14} />
            </button>
          </div>

          <span className="vf-editor__divider" />

          {/* Instruments / Validators Overlay toggles */}
          <button
            className={`vf-editor__tool-btn ${showMultimeter ? 'is-active' : ''}`}
            onClick={() => setShowMultimeter(!showMultimeter)}
            title="Digital Multimeter"
          >
            <Gauge size={15} />
          </button>
          <button
            className={`vf-editor__tool-btn ${oscilloscopePanelOpen ? 'is-active' : ''}`}
            onClick={() => setOscilloscopePanelOpen(!oscilloscopePanelOpen)}
            title="Oscilloscope Trace"
          >
            <Activity size={15} />
          </button>
          <button
            className={`vf-editor__tool-btn ${showBom ? 'is-active' : ''}`}
            onClick={() => setShowBom(!showBom)}
            title="Bill of Materials"
          >
            <Package size={15} />
          </button>
          <button
            className={`vf-editor__tool-btn ${showAiChat ? 'is-active' : ''}`}
            onClick={() => setShowAiChat(!showAiChat)}
            title="VoltForge AI Assistant"
          >
            <Sparkles size={15} />
          </button>
          <button
            className={`vf-editor__tool-btn ${showAiValidator ? 'is-active' : ''}`}
            onClick={() => setShowAiValidator(!showAiValidator)}
            title="AI Circuit Validator"
          >
            <ShieldAlert size={15} />
          </button>
          <button
            className={`vf-editor__tool-btn ${showIotInspector ? 'is-active' : ''}`}
            onClick={() => setShowIotInspector(!showIotInspector)}
            title="IoT & Cloud Telemetry Inspector (WiFi / MQTT)"
          >
            <Wifi size={15} />
          </button>

          <span className="vf-editor__divider" />

          <button className="vf-editor__tool-btn" onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 size={15} />
          </button>
          <button className="vf-editor__tool-btn" onClick={redo} title="Redo (Ctrl+Y)">
            <Redo2 size={15} />
          </button>

          <span className="vf-editor__divider" />

          <button
            className={`vf-editor__sim-btn ${isSimulating ? 'is-running' : ''}`}
            onClick={toggleSimulation}
          >
            {isSimulating ? <Square size={14} /> : <Play size={14} />}
            {isSimulating ? 'Stop' : 'Simulate'}
          </button>
          {isSimulating && (
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
            className="vf-editor__tool-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            className="vf-editor__tool-btn"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            title="Toggle component panel"
          >
            <PanelLeftClose size={15} />
          </button>
          <button
            className="vf-editor__tool-btn"
            onClick={() => setViewMode(viewMode === 'canvas' ? 'split' : 'canvas')}
            title={viewMode === 'canvas' ? 'Show code editor' : 'Hide code editor'}
          >
            <PanelRightClose size={15} />
          </button>

          <button
            className="vf-editor__tool-btn"
            onClick={handleShare}
            title="Copy shareable state URL"
          >
            <Share2 size={15} />
          </button>

          <Dropdown
            trigger={
              <button className="vf-editor__tool-btn" title="Export project">
                <Download size={15} />
              </button>
            }
            items={exportDropdownItems}
          />

          {isOwner && (
            <button
              className="vf-editor__tool-btn"
              onClick={() => setShowSettings(true)}
              title="Project settings"
            >
              <Settings size={15} />
            </button>
          )}

          <span className="vf-editor__divider" />

          {/* Fork button if editing non-owned project, save button if owner */}
          {isOwner ? (
            <button
              className="vf-editor__save-btn"
              onClick={handleSave}
              disabled={isSaving || isPreset}
            >
              <Save size={14} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          ) : currentProject?.userForkId ? (
            <button
              className="vf-editor__save-btn"
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                borderColor: '#10b981',
              }}
              onClick={() => navigate(`/editor/${currentProject.userForkId}`)}
            >
              <GitFork size={14} />
              Go to your Fork
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
            >
              <GitFork size={14} />
              {forkMutation.isPending ? 'Forking...' : 'Fork to Edit'}
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="vf-editor__body">
        {/* Left panel — Component library */}
        {leftPanelOpen && viewMode !== 'code' && (
          <aside className="vf-editor__left-panel">
            <ComponentPanel readOnly={!isOwner} />
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
                      readOnly={!isOwner}
                    />
                  </div>
                }
                right={
                  <div className="vf-editor__code-area is-split">
                    <CodeEditor readOnly={!isOwner} />
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
                      readOnly={!isOwner}
                    />
                  </div>
                )}
                {viewMode === 'code' && (
                  <div className="vf-editor__code-area">
                    <CodeEditor readOnly={!isOwner} />
                  </div>
                )}
                {viewMode === 'pcb' && (
                  <div ref={canvasContainerRef} className="vf-editor__canvas-area">
                    <PcbCanvas
                      width={canvasSize.width}
                      height={canvasSize.height}
                      projectName={projectName}
                    />
                  </div>
                )}
              </>
            )}

            {/* Instrument floating overlays */}
            <MultimeterPanel
              isOpen={showMultimeter}
              onClose={() => setShowMultimeter(false)}
            />
            <BomPanel isOpen={showBom} onClose={() => setShowBom(false)} />
            <AiChatPanel
              isOpen={showAiChat}
              onClose={() => setShowAiChat(false)}
              projectContext={projectName}
              onApplyCode={!isOwner ? undefined : (code) => {
                if (activeCodeFile) {
                  updateCodeFileContent(activeCodeFile.id, code)
                  addToast('Generated code applied to editor!', 'success')
                } else {
                  addToast('No active code file selected', 'error')
                }
              }}
            />
            <AiValidatorPanel isOpen={showAiValidator} onClose={() => setShowAiValidator(false)} />
            <IotInspectorPanel isOpen={showIotInspector} onClose={() => setShowIotInspector(false)} />
            <PropertyEditor readOnly={!isOwner} />
          </div>

          {/* Serial monitor / Oscilloscope Trace splits */}
          <div className="vf-editor-bottom-pane">
            <SerialMonitor />
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
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <ProjectSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

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
