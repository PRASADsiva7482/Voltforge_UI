import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Save, ArrowLeft, Play, Square, Settings, Layout, Terminal, Undo, Redo, Gauge, Activity, Package, Download, Share2, Layers, GitFork, Zap, Trash2 } from 'lucide-react';
import CircuitCanvas from '../canvas/CircuitCanvas';
import ComponentPanel from '../components/ComponentPanel';
const CodeEditor = lazy(() => import('../editor/CodeEditor'));
import PropertyEditor from '../editor/PropertyEditor';
import ProjectSettingsModal from './ProjectSettingsModal';
import MultimeterPanel from './MultimeterPanel';
import OscilloscopePanel from './OscilloscopePanel';
import BomPanel from './BomPanel';
import VfSplitPane from '../../components/ui/VfSplitPane';
import VfStatusIndicator from '../../components/ui/VfStatusIndicator';
import VfActionButton from '../../components/ui/VfActionButton';
import VfLoadingSpinner from '../../components/ui/VfLoadingSpinner';
import VfContextMenu from '../../components/ui/VfContextMenu';
import { projectApi, projectExportApi, simulationApi } from '../../api/services';
import { useProjectStore, SMART_DEVICE_PRESET } from '../../store/projectStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useAuthStore } from '../../store/authStore';
import { useCollaboration } from '../../hooks/useCollaboration';
import { SimulationEngine } from '../simulator/SimulationEngine';
import { LogicRegistry } from '../simulator/logic/LogicRegistry';
import { analyzeCircuitSafety } from '../canvas/pinRegistry';
import type { CanvasNode, PinPosition, CodeFile, Project } from '../../types';

type ActivePanel = 'canvas' | 'code' | 'split';
type CanvasViewMode = 'breadboard' | 'pcb';

const normalizeRef = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveSuggestedNode(ref: string, nodes: CanvasNode[]): CanvasNode | null {
  const normalized = normalizeRef(ref || '');
  if (!normalized) return null;
  return nodes.find(node =>
    normalizeRef(node.id) === normalized ||
    normalizeRef(node.type) === normalized ||
    normalizeRef(node.name) === normalized ||
    normalizeRef(node.type).includes(normalized) ||
    normalized.includes(normalizeRef(node.type))
  ) || null;
}

function resolveSuggestedPin(ref: string, node: CanvasNode): PinPosition | null {
  const normalized = normalizeRef(ref || '');
  if (!normalized) return null;
  return node.pins.find(pin =>
    normalizeRef(pin.id) === normalized ||
    normalizeRef(pin.name) === normalized ||
    normalizeRef(pin.name).includes(normalized) ||
    normalized.includes(normalizeRef(pin.name))
  ) || null;
}

function bundleCodeFiles(activeFile: CodeFile | null, files: CodeFile[]): string {
  if (!activeFile) return '';
  let content = activeFile.content;
  const maxIterations = 10;

  for (let iter = 0; iter < maxIterations; iter++) {
    let replaced = false;
    content = content.replace(/^#include\s+"([^"]+)"/gm, (match, filename) => {
      const includedFile = files.find(f => f.filename.toLowerCase() === filename.toLowerCase());
      if (includedFile) {
        replaced = true;
        return `\n// ── Begin Include: ${includedFile.filename} ──\n` +
          includedFile.content +
          `\n// ── End Include: ${includedFile.filename} ──\n`;
      }
      return match;
    });
    if (!replaced) break;
  }
  return content;
}

export default function EditorPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<ActivePanel>('split');
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 500 });
  const [isSimulating, setIsSimulating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMultimeter, setShowMultimeter] = useState(false);
  const [showOscilloscope, setShowOscilloscope] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [isProbeMode, setIsProbeMode] = useState(false);
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>('breadboard');
  const engineRef = useRef<SimulationEngine | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    // Check if right-clicking on canvas or workspace
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
  };

  const { setCurrentProject, currentProject, isDirty, isSaving, setSaving, activeCodeFile, updateCodeFileContent } = useProjectStore();
  const { nodes, wires, addWire, updateNode, selectedNodeId, undo, redo, historyIndex, history } = useCanvasStore();
  const { writeSerial, clearSerial, serialPanelOpen, setSerialPanelOpen, setBaudRate, setDebugSnapshot, debugSnapshot } = useSimulationStore();
  const { isConnected, activeUsers, broadcastCanvasSync, broadcastCursorMove } = useCollaboration(projectId || '');
  const { user } = useAuthStore();

  // Ownership check — non-owners get a read-only view
  const isOwner = !currentProject || currentProject.id === 'share' || currentProject.owner.id === user?.id;

  // Fork mutation — duplicates the project to the current user's account
  const forkMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject) return;

      if (currentProject.id === 'preset-smart-device') {
        const response = await projectApi.create({
          name: `${currentProject.name} (Forked)`,
          description: currentProject.description,
          boardType: currentProject.boardType,
          canvasLayout: { nodes, wires } as any,
          tags: currentProject.tags,
          isPublic: false,
          codeFiles: currentProject.codeFiles.map(f => ({
            filename: f.filename,
            content: f.content,
            language: f.language,
            sortOrder: f.sortOrder
          })),
        });
        return response.data.data;
      }

      try {
        const response = await projectApi.fork(currentProject.id);
        return response.data.data;
      } catch (err) {
        console.warn('Fork endpoint failed, falling back to projectApi.create', err);
        const response = await projectApi.create({
          name: `${currentProject.name} (Copy)`,
          description: currentProject.description,
          boardType: currentProject.boardType,
          canvasLayout: { nodes, wires } as any,
          tags: currentProject.tags,
          isPublic: false,
          codeFiles: currentProject.codeFiles.map(f => ({
            filename: f.filename,
            content: f.content,
            language: f.language,
            sortOrder: f.sortOrder
          })),
        });
        return response.data.data;
      }
    },
    onSuccess: (forkedProject) => {
      if (forkedProject) {
        navigate('/editor/' + forkedProject.id);
      }
    },
  });

  const handleFork = useCallback(() => forkMutation.mutate(), [forkMutation]);

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (projectId === 'preset-smart-device') {
        return SMART_DEVICE_PRESET;
      }
      if (projectId === 'share') {
        const params = new URLSearchParams(window.location.search);
        const encoded = params.get('state');
        if (encoded) {
          try {
            const decoded = decodeURIComponent(escape(atob(encoded)));
            const shareState = JSON.parse(decoded);
            const mockProject: Project = {
              id: 'share',
              name: shareState.name || t('Shared Project'),
              description: t('Shared via portable link'),
              boardType: shareState.boardType || 'ARDUINO_UNO',
              isPublic: false,
              forkCount: 0,
              viewCount: 0,
              owner: {
                id: 'shared-user',
                keycloakId: 'shared-user',
                username: 'shared-user',
                email: 'shared@voltforge.in',
                displayName: 'Shared User',
                role: 'USER',
                accountStatus: 'ACTIVE',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              codeFiles: (shareState.codeFiles || []).map((f: any, idx: number) => ({
                id: `shared-file-${idx}`,
                filename: f.filename,
                content: f.content,
                language: f.language || 'cpp',
                sortOrder: idx,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })),
              canvasLayout: {
                viewport: shareState.canvasLayout?.viewport || { x: 0, y: 0, scale: 1 },
                nodes: shareState.canvasLayout?.nodes || [],
                wires: shareState.canvasLayout?.wires || [],
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            return mockProject;
          } catch (err) {
            console.error('Failed to parse shared project state', err);
          }
        }
      }
      const r = await projectApi.getById(projectId!);
      return r.data.data;
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    if (projectData) {
      setCurrentProject(projectData);
      if (projectData.canvasLayout) {
        useCanvasStore.getState().loadCanvas(projectData.canvasLayout.nodes || [], projectData.canvasLayout.wires || []);
      }
    }
  }, [projectData, setCurrentProject]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject || !projectId) return;
      setSaving(true);
      if (projectId === 'share') {
        const response = await projectApi.create({
          name: currentProject.name,
          description: currentProject.description,
          boardType: currentProject.boardType,
          canvasLayout: { nodes, wires } as any,
          codeFiles: currentProject.codeFiles.map(f => ({
            filename: f.filename,
            content: f.content,
            language: f.language,
          })),
        });
        const created = response.data.data;
        setCurrentProject(created);
        navigate(`/editor/${created.id}`);
        return;
      }
      await projectApi.update(projectId, {
        name: currentProject.name, description: currentProject.description,
        canvasLayout: { nodes, wires } as any,
        codeFiles: currentProject.codeFiles.map(f => ({ filename: f.filename, content: f.content, language: f.language, sortOrder: f.sortOrder })),
      });
      broadcastCanvasSync(nodes, wires);
    },
    onSuccess: () => { useProjectStore.getState().setDirty(false); setSaving(false); },
    onError: () => { setSaving(false); },
  });

  const observerRef = useRef<ResizeObserver | null>(null);

  const canvasContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    if (node) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  const handleSave = useCallback(() => saveMutation.mutate(), [saveMutation]);

  // Track canvas changes as dirty
  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state, prev) => {
      if (state.nodes !== prev.nodes || state.wires !== prev.wires) {
        useProjectStore.getState().setDirty(true);
      }
    });
    return unsub;
  }, []);

  // Auto-save every 10 seconds if dirty
  useEffect(() => {
    const interval = setInterval(() => {
      const { isDirty, isSaving } = useProjectStore.getState();
      if (isDirty && !isSaving && projectId) {
        handleSave();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [handleSave, projectId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleSave, undo, redo]);

  useEffect(() => {
    engineRef.current = new SimulationEngine({
      onSerialOutput: (text, options) => writeSerial(text, options),
      onBaudRateChange: setBaudRate,
      onPinStateChange: (cid, pid, state, value) => {
        const node = useCanvasStore.getState().nodes.find(n => n.id === cid);
        if (node) LogicRegistry.dispatch(node.type, cid, pid, state, value);
      },
      onDebugSnapshot: setDebugSnapshot,
      onError: (err) => writeSerial(`[ERROR] ${err}`),
    });
    return () => { engineRef.current?.stop(); };
  }, [setBaudRate, setDebugSnapshot, writeSerial]);

  useEffect(() => {
    const handler = (event: Event) => {
      engineRef.current?.setBreakpoints((event as CustomEvent<number[]>).detail || []);
    };
    window.addEventListener('voltforge:breakpoints', handler);
    return () => window.removeEventListener('voltforge:breakpoints', handler);
  }, []);

  useEffect(() => {
    engineRef.current?.setBreakpoints(debugSnapshot.breakpoints);
  }, [debugSnapshot.breakpoints]);

  const toggleSimulation = async () => {
    if (!isSimulating) {
      setIsSimulating(true);
      clearSerial();
      setSerialPanelOpen(true);
      writeSerial(`> Simulation started at ${new Date().toLocaleTimeString()}`);

      const safety = analyzeCircuitSafety(nodes, wires);
      Object.entries(safety.nodeStates).forEach(([nodeId, properties]) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) updateNode(nodeId, { properties: { ...node.properties, ...properties } });
      });
      if (safety.issues.length > 0) {
        safety.issues.forEach(issue => writeSerial(`[${issue.severity}] ${issue.message} ${issue.suggestedFix}`));
      }

      const bundledCode = bundleCodeFiles(activeCodeFile, currentProject?.codeFiles || []);
      try {
        const compile = await simulationApi.compileFirmware({
          source: bundledCode,
          boardType: currentProject?.boardType,
          sketchName: currentProject?.name || 'VoltForgeSketch',
        });
        const result = compile.data.data;
        var compiledHex = result.success ? result.hex : undefined;
        writeSerial(result.success
          ? `> Firmware compiled by ${result.compiler} (${result.hex?.length || 0} HEX chars)`
          : `> Firmware compile failed: ${result.stderr || result.diagnostics?.[0] || 'unknown compiler error'}`
        );
      } catch (err: any) {
        writeSerial(`> Firmware compiler unavailable: ${err?.message || 'request failed'}`);
      }

      await engineRef.current?.start(bundledCode, nodes, wires, compiledHex);
    } else {
      setIsSimulating(false);
      engineRef.current?.stop();
      writeSerial('> Simulation stopped');
      nodes.forEach(n => updateNode(n.id, { properties: { ...n.properties, isLit: false, isSpinning: false, isBeeping: false, isActive: false, escThrottle: 0, escRpm: 0, bldcRpm: 0, bldcRotation: 0 } }));
      // Clean up global BLDC animation state
      if ((globalThis as any).__voltforgeBldcState) delete (globalThis as any).__voltforgeBldcState;
    }
  };

  const handleComponentInteraction = useCallback((nodeId: string, event: 'press' | 'release') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 1. Visually depress/release the button in the Canvas store
    const isPressed = event === 'press';
    updateNode(nodeId, {
      properties: {
        ...node.properties,
        isPressed
      }
    });

    if (!engineRef.current || !isSimulating) return;

    // 2. Simulate sending high/low for buttons connected to MCU
    const nodePinIds = node.pins?.map(p => p.id) || [];
    const connectedWires = wires.filter(w =>
      (w.fromNodeId === nodeId && nodePinIds.includes(w.fromPinId)) ||
      (w.toNodeId === nodeId && nodePinIds.includes(w.toPinId))
    );

    connectedWires.forEach(wire => {
      const isFromNode = wire.fromNodeId === nodeId;
      const targetNodeId = isFromNode ? wire.toNodeId : wire.fromNodeId;
      const targetPinId = isFromNode ? wire.toPinId : wire.fromPinId;

      const targetNode = nodes.find(n => n.id === targetNodeId);
      if (targetNode && (targetNode.type.startsWith('ARDUINO') || targetNode.type.startsWith('ESP'))) {
        const mcuPin = targetNode.pins?.find(p => p.id === targetPinId);
        if (mcuPin) {
          // Extract pin number from name (e.g., "D2" -> "2", "2" -> "2")
          const pinNum = mcuPin.name.replace(/[^0-9]/g, '');
          engineRef.current?.setExternalPinState(pinNum, isPressed ? 'HIGH' : 'LOW');
        }
      }
    });
  }, [nodes, wires, isSimulating, updateNode]);



  const handleExportZip = async () => {
    if (!currentProject) return;
    try {
      const response = await projectExportApi.exportZip(currentProject.id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${currentProject.name.replace(/[^a-zA-Z0-9.-]/g, '_')}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e) {
      console.error('Failed to export ZIP', e);
      alert('Failed to export project');
    }
  };

  const handleExportGerber = async () => {
    if (!currentProject) return;
    try {
      const response = await projectExportApi.exportGerber(currentProject.id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${currentProject.name.replace(/[^a-zA-Z0-9.-]/g, '_')}_gerber.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e) {
      console.error('Failed to export Gerber', e);
      alert('Failed to export Gerber files');
    }
  };

  const handleShareLiveSession = async () => {
    if (!currentProject) return;
    try {
      const shareState = {
        name: currentProject.name,
        boardType: currentProject.boardType,
        canvasLayout: {
          nodes: nodes.map(n => ({
            id: n.id, componentId: n.componentId, type: n.type, name: n.name,
            x: n.x, y: n.y, width: n.width, height: n.height, rotation: n.rotation,
            properties: n.properties, pins: n.pins
          })),
          wires: wires.map(w => ({
            id: w.id, fromNodeId: w.fromNodeId, fromPinId: w.fromPinId,
            toNodeId: w.toNodeId, toPinId: w.toPinId, color: w.color,
            bendPoints: w.bendPoints, routingMode: w.routingMode
          }))
        },
        codeFiles: currentProject.codeFiles.map(f => ({
          filename: f.filename, content: f.content, language: f.language
        })),
      };
      const jsonString = JSON.stringify(shareState);
      const encoded = btoa(unescape(encodeURIComponent(jsonString)));
      const url = `${window.location.origin}/editor/share?state=${encoded}`;
      await navigator.clipboard?.writeText(url);
      writeSerial(`> Portable Share Link copied: ${url}`);
    } catch (err: any) {
      console.error(err);
      writeSerial(`> Failed to generate share link: ${err.message}`);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen bg-surface-50 dark:bg-surface-955"><VfLoadingSpinner size="lg" /></div>;

  return (
    <div className="flex flex-col h-screen bg-surface-50 text-surface-900 relative dark:bg-surface-950 dark:text-surface-100">
      <ProjectSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-surface-200/70 glass z-10 dark:border-white/5">
        {/* ── Navigation & Project Info ── */}
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 transition-all dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white" title={t("Back to Dashboard")}><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0 ml-1">
          <h2 className="text-xs font-semibold text-surface-950 truncate dark:text-white">{currentProject?.name || t('Untitled')}</h2>
          <p className="text-[9px] text-surface-500">{currentProject?.boardType?.replace(/_/g, ' ')}</p>
        </div>
        {isConnected && <VfStatusIndicator status="running" label={t("Live Sync")} />}

        {/* ── View Mode Switcher ── */}
        <div className="flex items-center gap-0.5 bg-surface-100 rounded-lg p-0.5 dark:bg-surface-900/80">
          {(['canvas', 'split', 'code'] as ActivePanel[]).map(p => (
            <button key={p} onClick={() => setActivePanel(p)} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${activePanel === p ? 'bg-volt-500/20 text-volt-500 dark:text-volt-400' : 'text-surface-500 hover:text-surface-950 hover:bg-white dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`}>
              {p === 'canvas' ? t('Canvas') : p === 'split' ? t('Split') : t('Code')}
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        {/* ── Canvas Operations (Undo / Redo) ── */}
        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={!isOwner || historyIndex < 0} className="p-2 rounded-lg text-surface-500 hover:text-surface-950 hover:bg-surface-100 disabled:opacity-30 transition-all dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5" title={t("Undo (Ctrl+Z)")}><Undo className="w-3.5 h-3.5" /></button>
          <button onClick={redo} disabled={!isOwner || historyIndex >= history.length - 1} className="p-2 rounded-lg text-surface-500 hover:text-surface-950 hover:bg-surface-100 disabled:opacity-30 transition-all dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5" title={t("Redo (Ctrl+Y)")}><Redo className="w-3.5 h-3.5" /></button>
        </div>

        <div className="toolbar-divider" />

        {/* ── Instrument Tools ── */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowMultimeter(!showMultimeter)} className={`p-2 rounded-lg transition-all ${showMultimeter ? 'bg-volt-500/20 text-volt-500 dark:text-volt-400' : 'text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`} title={t("Multimeter")}><Gauge className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowOscilloscope(!showOscilloscope)} className={`p-2 rounded-lg transition-all ${showOscilloscope ? 'bg-volt-500/20 text-volt-500 dark:text-volt-400' : 'text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`} title={t("Oscilloscope")}><Activity className="w-3.5 h-3.5" /></button>
          <button onClick={() => setIsProbeMode(!isProbeMode)} className={`p-2 rounded-lg transition-all ${isProbeMode ? 'bg-purple-500/20 text-purple-500 dark:text-purple-400' : 'text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`} title={t("Diagnostic Probe Mode")}><Zap className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowBom(!showBom)} className={`p-2 rounded-lg transition-all ${showBom ? 'bg-forge-500/20 text-forge-500 dark:text-forge-400' : 'text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`} title={t("Bill of Materials")}><Package className="w-3.5 h-3.5" /></button>
          <button onClick={() => setCanvasViewMode(canvasViewMode === 'breadboard' ? 'pcb' : 'breadboard')} className={`p-2 rounded-lg transition-all ${canvasViewMode === 'pcb' ? 'bg-forge-500/20 text-forge-500 dark:text-forge-400' : 'text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`} title={t("Breadboard / PCB View")}><Layers className="w-3.5 h-3.5" /></button>
          <button onClick={() => setSerialPanelOpen(!serialPanelOpen)} className={`p-2 rounded-lg transition-all ${serialPanelOpen ? 'bg-surface-100 text-surface-950 dark:bg-surface-800 dark:text-white' : 'text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5'}`} title={t("Serial Monitor")}><Terminal className="w-3.5 h-3.5" /></button>
          <button onClick={handleShareLiveSession} className="p-2 rounded-lg transition-all text-surface-500 hover:text-surface-950 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5" title={t("Copy Share Link")}><Share2 className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowSettings(true)} disabled={!isOwner} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 transition-all disabled:opacity-30 dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white" title={t("Settings")}><Settings className="w-3.5 h-3.5" /></button>
        </div>

        <div className="toolbar-divider" />

        {/* ── Project Actions (Run / Export / Save) ── */}
        <div className="flex items-center gap-1.5 pl-1">
          {isSimulating ? (
            <VfActionButton
              onClick={toggleSimulation}
              icon={<Square className="w-3 h-3 fill-current" />}
              variant="danger"
              className="py-1 px-2.5 h-[26px]"
            >
              {t('Stop')}
            </VfActionButton>
          ) : (
            <VfActionButton
              onClick={toggleSimulation}
              icon={<Play className="w-3 h-3 fill-current" />}
              variant="primary"
              className="py-1 px-2.5 h-[26px]"
            >
              {t('Run')}
            </VfActionButton>
          )}
          <VfActionButton
            onClick={handleExportZip}
            disabled={!currentProject}
            icon={<Download className="w-3.5 h-3.5" />}
            variant="secondary"
            className="py-1 px-3 h-[26px]"
          >
            {t('Export')}
          </VfActionButton>
          <VfActionButton
            onClick={handleExportGerber}
            disabled={!currentProject}
            icon={<Layout className="w-3.5 h-3.5" />}
            variant="secondary"
            className="py-1 px-3 h-[26px]"
          >
            {t('Gerber')}
          </VfActionButton>
          {isOwner ? (
            <VfActionButton
              onClick={handleSave}
              icon={<Save className="w-3.5 h-3.5" />}
              disabled={saveMutation.isPending}
              loading={saveMutation.isPending}
              className="py-1 px-3 h-[26px]"
            >
              {saveMutation.isPending ? t('Saving...') : t('Save')}
            </VfActionButton>
          ) : (
            <VfActionButton
              onClick={() => forkMutation.mutate()}
              disabled={forkMutation.isPending}
              loading={forkMutation.isPending}
              icon={<GitFork className="w-3.5 h-3.5" />}
              variant="primary"
              className="py-1 px-3 h-[26px]"
            >
              {forkMutation.isPending ? t('Forking...') : t('Fork to Edit')}
            </VfActionButton>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {isOwner && (activePanel === 'canvas' || activePanel === 'split') && <ComponentPanel />}
        <div className="flex flex-1">
          {activePanel === 'canvas' ? (
            <div className="bg-surface-100 relative flex flex-col dark:bg-[#0a0a14] w-full">
              {isSimulating && (
                <div className="absolute top-3 right-3 z-10 glass px-3 py-1.5 rounded-full border border-volt-500/30">
                  <VfStatusIndicator status="running" label={t("Simulating")} />
                </div>
              )}
              <div
                ref={canvasContainerCallbackRef}
                className="flex-1 relative min-h-0 min-w-0 p-0 m-0 border-0"
                onContextMenu={handleContextMenu}
              >
                <CircuitCanvas
                  width={canvasSize.width}
                  height={canvasSize.height}
                  viewMode={canvasViewMode}
                  collaborators={activeUsers}
                  onCursorMove={broadcastCursorMove}
                  onComponentInteraction={handleComponentInteraction}
                  readOnly={!isOwner}
                  isProbeMode={isProbeMode}
                  isSimulating={isSimulating}
                />
              </div>
            </div>
          ) : activePanel === 'code' ? (
            <div className="relative min-w-0 w-full">
              <Suspense fallback={<div className="p-4 text-xs text-surface-400 font-mono">{t("Loading Code Editor...")}</div>}>
                <CodeEditor readOnly={!isOwner} />
              </Suspense>
            </div>
          ) : (
            <VfSplitPane
              initialRatio={50}
              left={
                <div className="bg-surface-100 relative flex flex-col dark:bg-[#0a0a14] h-full w-full">
                  {isSimulating && (
                    <div className="absolute top-3 right-3 z-10 glass px-3 py-1.5 rounded-full border border-volt-500/30">
                      <VfStatusIndicator status="running" label={t("Simulating")} />
                    </div>
                  )}
                  <div
                    ref={canvasContainerCallbackRef}
                    className="flex-1 relative min-h-0 min-w-0 p-0 m-0 border-0"
                    onContextMenu={handleContextMenu}
                  >
                    <CircuitCanvas
                      width={canvasSize.width}
                      height={canvasSize.height}
                      viewMode={canvasViewMode}
                      collaborators={activeUsers}
                      onCursorMove={broadcastCursorMove}
                      onComponentInteraction={handleComponentInteraction}
                      readOnly={!isOwner}
                      isProbeMode={isProbeMode}
                      isSimulating={isSimulating}
                    />
                  </div>
                </div>
              }
              right={
                <div className="relative min-w-0 h-full w-full">
                  <Suspense fallback={<div className="p-4 text-xs text-surface-400 font-mono">{t("Loading Code Editor...")}</div>}>
                    <CodeEditor readOnly={!isOwner} />
                  </Suspense>
                </div>
              }
            />
          )}
        </div>

        {/* Right Panel for Property Editor */}
        {isOwner && (selectedNodeId || useCanvasStore.getState().selectedWireId) && (activePanel === 'canvas' || activePanel === 'split') && (
          <div className="absolute right-0 top-0 h-full border-l border-surface-200 shadow-[-10px_0_20px_rgba(15,23,42,0.12)] z-20 bg-white/70 backdrop-blur-md dark:border-white/5 dark:bg-surface-950/50 dark:shadow-[-10px_0_20px_rgba(0,0,0,0.5)]">
            <PropertyEditor />
          </div>
        )}

        {/* Floating Panels */}

        <MultimeterPanel isOpen={showMultimeter} onClose={() => setShowMultimeter(false)} voltage={isSimulating ? 5 : 0} current={isSimulating ? 20 : 0} />
        <OscilloscopePanel isOpen={showOscilloscope} onClose={() => setShowOscilloscope(false)} />
        <BomPanel isOpen={showBom} onClose={() => setShowBom(false)} />

        <VfContextMenu
          isOpen={!!contextMenu}
          onClose={() => setContextMenu(null)}
          x={contextMenu?.x || 0}
          y={contextMenu?.y || 0}
          items={[
            {
              label: t('Undo Action'),
              icon: <Undo className="w-3.5 h-3.5" />,
              onClick: undo
            },
            {
              label: t('Redo Action'),
              icon: <Redo className="w-3.5 h-3.5" />,
              onClick: redo
            },
            {
              label: t('Reset Workspace'),
              icon: <Trash2 className="w-3.5 h-3.5 text-red-500" />,
              destructive: true,
              onClick: () => {
                if (confirm(t('Are you sure you want to clear the entire canvas? This action cannot be undone.'))) {
                  useCanvasStore.getState().clearCanvas();
                }
              }
            }
          ]}
        />
      </div>

    </div>
  );
}
