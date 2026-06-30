import { useEffect, useCallback, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Undo2, Redo2, Play, Square, Code2,
  Layout, PanelLeftClose, PanelRightClose, Download, Zap, Sun, Moon,
} from 'lucide-react';
import { projectApi, simulationApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { useProjectStore, SMART_DEVICE_PRESET } from '../../store/projectStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useThemeStore } from '../../store/themeStore';
import { analyzeCircuitSafety } from '../canvas/pinRegistry';
import { SimulationEngine } from '../simulator/SimulationEngine';
import { LogicRegistry } from '../simulator/logic/LogicRegistry';
import CircuitCanvas from '../canvas/CircuitCanvas';
import ComponentPanel from './ComponentPanel';
import PropertyEditor from './PropertyEditor';
import SerialMonitor from './SerialMonitor';
import CodeEditor from './CodeEditor';
import type { Project, CodeFile } from '../../types/domain';

type ViewMode = 'canvas' | 'code' | 'split';

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

export default function CircuitEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
  const currentProject = useProjectStore((s) => s.currentProject);
  const isDirty = useProjectStore((s) => s.isDirty);
  const setDirty = useProjectStore((s) => s.setDirty);
  const isSaving = useProjectStore((s) => s.isSaving);
  const setSaving = useProjectStore((s) => s.setSaving);

  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  const nodes = useCanvasStore((s) => s.nodes);
  const wires = useCanvasStore((s) => s.wires);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);

  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const engineRef = useRef<SimulationEngine | null>(null);

  const { writeSerial, clearSerial, setBaudRate, setDebugSnapshot, debugSnapshot, setSerialPanelOpen } = useSimulationStore();
  const { theme, toggleTheme } = useThemeStore();
  const updateNode = useCanvasStore((s) => s.updateNode);
  const activeCodeFile = useProjectStore((s) => s.activeCodeFile);

  // ── Load project ──
  const isPreset = projectId === 'preset-smart-device';

  const { data: fetchedProject, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const r = await projectApi.getById(projectId!);
      return r.data.data;
    },
    enabled: !!projectId && !isPreset,
  });

  useEffect(() => {
    const project = isPreset ? SMART_DEVICE_PRESET : fetchedProject;
    if (project) {
      setCurrentProject(project as Project);
      if (project.canvasLayout) {
        loadCanvas(
          project.canvasLayout.nodes || [],
          project.canvasLayout.wires || []
        );
      }
    }
  }, [fetchedProject, isPreset, setCurrentProject, loadCanvas]);

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject || isPreset) return;
      setSaving(true);
      const activeFile = useProjectStore.getState().activeCodeFile;
      const codeFiles = currentProject.codeFiles.map(f => ({
        content: f.content,
        filename: f.filename,
        language: f.language,
        sortOrder: f.sortOrder,
      }));
      await projectApi.update(currentProject.id, {
        canvasLayout: {
          nodes,
          wires,
          viewport: useCanvasStore.getState().viewport,
        } as any,
        codeFiles,
      });
    },
    onSuccess: () => {
      setDirty(false);
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: () => {
      setSaving(false);
    }
  });

  const handleSave = useCallback(() => {
    if (!isPreset) saveMutation.mutate();
  }, [isPreset, saveMutation]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); handleSave(); }
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, undo, redo]);

  // ── Canvas resize observer ──
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [leftPanelOpen, rightPanelOpen, viewMode]);

  // ── Setup simulation engine ──
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
    return () => {
      engineRef.current?.stop();
    };
  }, [setBaudRate, setDebugSnapshot, writeSerial]);

  // ── Component Interaction (button press, relay activation, etc.) ──
  const handleComponentInteraction = useCallback((nodeId: string, event: 'press' | 'release') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const isPressed = event === 'press';
    updateNode(nodeId, {
      properties: {
        ...node.properties,
        isPressed
      }
    });

    if (!engineRef.current || !isSimulating) return;

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
          const pinNum = mcuPin.name.replace(/[^0-9]/g, '');
          engineRef.current?.setExternalPinState(pinNum, isPressed ? 'HIGH' : 'LOW');
        }
      }
    });
  }, [nodes, wires, isSimulating, updateNode]);

  // ── Simulation toggle ──
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
      let compiledHex: string | undefined = undefined;

      try {
        const compile = await simulationApi.compileFirmware({
          source: bundledCode,
          boardType: currentProject?.boardType,
          sketchName: currentProject?.name || 'VoltForgeSketch',
        });
        const result = compile.data.data;
        compiledHex = result.success ? result.hex : undefined;
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
      if ((globalThis as any).__voltforgeBldcState) delete (globalThis as any).__voltforgeBldcState;
    }
  };

  if (isLoading && !isPreset) {
    return (
      <div className="vf-editor-loading">
        <Zap size={32} className="vf-spin" />
        <span>Loading project...</span>
      </div>
    );
  }

  const projectName = currentProject?.name || 'Untitled Project';

  return (
    <div className="vf-editor">
      {/* ── Toolbar ── */}
      <header className="vf-editor__toolbar">
        <div className="vf-editor__toolbar-left">
          <button className="vf-editor__back" onClick={() => navigate('/projects')} title="Back to projects">
            <ArrowLeft size={16} />
          </button>
          <div className="vf-editor__project-info">
            <h1 className="vf-editor__project-name">{projectName}</h1>
            {isDirty && <span className="vf-editor__dirty-dot" />}
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
          </div>

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
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title="Toggle property panel"
          >
            <PanelRightClose size={15} />
          </button>

          <span className="vf-editor__divider" />

          <button
            className="vf-editor__save-btn"
            onClick={handleSave}
            disabled={isSaving || isPreset}
          >
            <Save size={14} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="vf-editor__body">
        {/* Left panel — Component library */}
        {leftPanelOpen && viewMode !== 'code' && (
          <aside className="vf-editor__left-panel">
            <ComponentPanel />
          </aside>
        )}

        {/* Center — Canvas + Code */}
        <div className="vf-editor__center">
          <div className="vf-editor__workspace">
            {(viewMode === 'canvas' || viewMode === 'split') && (
              <div
                ref={canvasContainerRef}
                className={`vf-editor__canvas-area ${viewMode === 'split' ? 'is-split' : ''}`}
              >
                <CircuitCanvas
                  width={canvasSize.width}
                  height={canvasSize.height}
                  isSimulating={isSimulating}
                  onComponentInteraction={handleComponentInteraction}
                />
              </div>
            )}
            {(viewMode === 'code' || viewMode === 'split') && (
              <div className={`vf-editor__code-area ${viewMode === 'split' ? 'is-split' : ''}`}>
                <CodeEditor />
              </div>
            )}
          </div>

          {/* Serial monitor */}
          <SerialMonitor />
        </div>

        {/* Right panel — Property editor */}
        {rightPanelOpen && viewMode !== 'code' && (
          <aside className="vf-editor__right-panel">
            <PropertyEditor />
          </aside>
        )}
      </div>
    </div>
  );
}
