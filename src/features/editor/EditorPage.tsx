import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, ArrowLeft, Play, Square, Settings, Code2, Layout, Wand2, Terminal, Sparkles, Undo, Redo, Gauge, Activity, Package, ShieldAlert, Download } from 'lucide-react';
import CircuitCanvas from '../canvas/CircuitCanvas';
import ComponentPanel from '../components/ComponentPanel';
import CodeEditor from '../editor/CodeEditor';
import PropertyEditor from '../editor/PropertyEditor';
import AiChatPanel from '../ai/AiChatPanel';
import ProjectSettingsModal from './ProjectSettingsModal';
import MultimeterPanel from './MultimeterPanel';
import OscilloscopePanel from './OscilloscopePanel';
import BomPanel from './BomPanel';
import AiValidatorPanel from './AiValidatorPanel';
import { projectApi, aiApi, projectExportApi } from '../../api/services';
import { useProjectStore } from '../../store/projectStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useCollaboration } from '../../hooks/useCollaboration';
import { SimulationEngine } from '../simulator/SimulationEngine';
import { LogicRegistry } from '../simulator/logic/LogicRegistry';

type ActivePanel = 'canvas' | 'code' | 'split';

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<ActivePanel>('split');
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 500 });
  const [isSimulating, setIsSimulating] = useState(false);
  const [showSerialMonitor, setShowSerialMonitor] = useState(false);
  const [serialLogs, setSerialLogs] = useState<string[]>([]);
  const [isAiRouting, setIsAiRouting] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMultimeter, setShowMultimeter] = useState(false);
  const [showOscilloscope, setShowOscilloscope] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [showValidator, setShowValidator] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);

  const { setCurrentProject, currentProject, isDirty, setSaving, activeCodeFile, updateCodeFileContent } = useProjectStore();
  const { nodes, wires, addWire, updateNode, selectedNodeId, undo, redo, historyIndex, history } = useCanvasStore();
  const { isConnected, broadcastCanvasSync } = useCollaboration(projectId || '');

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => { const r = await projectApi.getById(projectId!); return r.data.data; },
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

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    if (canvasContainerRef.current) observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleSave = useCallback(() => saveMutation.mutate(), [saveMutation]);

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
      onSerialOutput: (text) => setSerialLogs(prev => [...prev.slice(-99), text]),
      onPinStateChange: (cid, pid, state) => {
        const node = nodes.find(n => n.id === cid);
        if (node) LogicRegistry.dispatch(node.type, cid, pid, state);
      },
      onError: (err) => setSerialLogs(prev => [...prev.slice(-99), `[ERROR] ${err}`]),
    });
    return () => { engineRef.current?.stop(); };
  }, [nodes]);

  const toggleSimulation = async () => {
    if (!isSimulating) {
      setIsSimulating(true);
      setSerialLogs([`> Simulation started at ${new Date().toLocaleTimeString()}`]);
      setShowSerialMonitor(true);
      await engineRef.current?.start(activeCodeFile?.content || '', nodes, wires);
    } else {
      setIsSimulating(false);
      engineRef.current?.stop();
      setSerialLogs(prev => [...prev, '> Simulation stopped']);
      nodes.forEach(n => updateNode(n.id, { properties: { ...n.properties, isLit: false, isSpinning: false, isBeeping: false } }));
    }
  };

  const handleAiRouting = async () => {
    if (nodes.length < 2) return alert('Add at least 2 components');
    setIsAiRouting(true);
    try {
      const res = await aiApi.suggestWiring({ prompt: `Connect: ${nodes.map(n => n.type).join(', ')}`, boardType: currentProject?.boardType, componentTypes: nodes.map(n => n.type) });
      (res.data.data.wireSuggestions || []).forEach((s, i) => {
        const from = nodes[0], to = nodes[Math.min(i + 1, nodes.length - 1)];
        if (from && to) addWire({ id: `ai_${Date.now()}_${i}`, fromNodeId: from.id, fromPinId: from.pins[0]?.id || '', toNodeId: to.id, toPinId: to.pins[0]?.id || '', color: s.color || '#3b82f6', points: [] });
      });
    } catch (e) { console.error(e); }
    finally { setIsAiRouting(false); }
  };

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

  if (isLoading) return <div className="flex items-center justify-center h-screen bg-surface-950"><div className="w-8 h-8 border-2 border-volt-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-screen bg-surface-950 relative">
      <ProjectSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 glass z-10">
        <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-white truncate">{currentProject?.name || 'Untitled'}</h2>
          <p className="text-[9px] text-surface-500">{currentProject?.boardType?.replace(/_/g, ' ')}</p>
        </div>
        {isConnected && <span className="w-2 h-2 rounded-full bg-volt-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />}

        {/* View Modes */}
        <div className="flex items-center gap-0.5 bg-surface-900 rounded-lg p-0.5">
          {(['canvas', 'split', 'code'] as ActivePanel[]).map(p => (
            <button key={p} onClick={() => setActivePanel(p)} className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${activePanel === p ? 'bg-volt-500/20 text-volt-400' : 'text-surface-400 hover:text-white'}`}>
              {p === 'canvas' ? 'Canvas' : p === 'split' ? 'Split' : 'Code'}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* History */}
        <button onClick={undo} disabled={historyIndex < 0} className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30" title="Undo"><Undo className="w-3.5 h-3.5" /></button>
        <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30" title="Redo"><Redo className="w-3.5 h-3.5" /></button>

        <div className="h-4 w-px bg-white/10" />

        {/* Tools */}
        <button onClick={handleAiRouting} disabled={isAiRouting || isSimulating} className={`p-1.5 rounded-lg transition-colors ${isAiRouting ? 'text-purple-400 animate-pulse' : 'text-surface-400 hover:text-purple-400 hover:bg-white/5'}`} title="AI Auto-Router"><Wand2 className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowAiChat(!showAiChat)} className={`p-1.5 rounded-lg transition-colors ${showAiChat ? 'bg-purple-500/20 text-purple-400' : 'text-surface-400 hover:text-purple-400 hover:bg-white/5'}`} title="AI Assistant"><Sparkles className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowValidator(!showValidator)} className={`p-1.5 rounded-lg transition-colors ${showValidator ? 'bg-purple-500/20 text-purple-400' : 'text-surface-400 hover:text-white hover:bg-white/5'}`} title="AI Validator"><ShieldAlert className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowMultimeter(!showMultimeter)} className={`p-1.5 rounded-lg transition-colors ${showMultimeter ? 'bg-volt-500/20 text-volt-400' : 'text-surface-400 hover:text-white hover:bg-white/5'}`} title="Multimeter"><Gauge className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowOscilloscope(!showOscilloscope)} className={`p-1.5 rounded-lg transition-colors ${showOscilloscope ? 'bg-volt-500/20 text-volt-400' : 'text-surface-400 hover:text-white hover:bg-white/5'}`} title="Oscilloscope"><Activity className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowBom(!showBom)} className={`p-1.5 rounded-lg transition-colors ${showBom ? 'bg-forge-500/20 text-forge-400' : 'text-surface-400 hover:text-white hover:bg-white/5'}`} title="Bill of Materials"><Package className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowSerialMonitor(!showSerialMonitor)} className={`p-1.5 rounded-lg transition-colors ${showSerialMonitor ? 'bg-surface-800 text-white' : 'text-surface-400 hover:text-white hover:bg-white/5'}`} title="Serial Monitor"><Terminal className="w-3.5 h-3.5" /></button>
        <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white" title="Settings"><Settings className="w-3.5 h-3.5" /></button>

        <div className="h-4 w-px bg-white/10" />

        {/* Run/Stop */}
        {isSimulating ? (
          <button onClick={toggleSimulation} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"><Square className="w-3 h-3 fill-current" /> Stop</button>
        ) : (
          <button onClick={toggleSimulation} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-volt-500/10 text-volt-500 hover:bg-volt-500/20 border border-volt-500/20"><Play className="w-3 h-3 fill-current" /> Run</button>
        )}
        <button onClick={handleExportZip} disabled={!currentProject} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-800 text-surface-400 hover:text-white hover:bg-surface-700 transition-all border border-white/5"><Download className="w-3 h-3" /> Export ZIP</button>
        <button onClick={handleSave} disabled={!isDirty} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${isDirty ? 'bg-volt-500 text-white hover:bg-volt-400 shadow-[0_0_12px_rgba(34,197,94,0.3)]' : 'bg-surface-800 text-surface-500'}`}><Save className="w-3 h-3" /> Save</button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {(activePanel === 'canvas' || activePanel === 'split') && <ComponentPanel />}
        <div className="flex flex-1">
          {(activePanel === 'canvas' || activePanel === 'split') && (
            <div ref={canvasContainerRef} className={`${activePanel === 'split' ? 'w-1/2' : 'flex-1'} bg-[#0a0a14] border-r border-white/5 relative`}>
              {isSimulating && <div className="absolute top-3 right-3 z-10 glass px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-volt-500/30"><span className="w-1.5 h-1.5 rounded-full bg-volt-500 animate-pulse" /><span className="text-[10px] font-medium text-volt-400">Simulating</span></div>}
              {isAiRouting && <div className="absolute top-3 right-3 z-10 glass px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-purple-500/30"><Wand2 className="w-3 h-3 text-purple-400 animate-spin" /><span className="text-[10px] font-medium text-purple-400">AI Routing...</span></div>}
              <CircuitCanvas width={canvasSize.width} height={canvasSize.height} />
              {selectedNodeId && <PropertyEditor />}
            </div>
          )}
          {(activePanel === 'code' || activePanel === 'split') && <div className={`${activePanel === 'split' ? 'w-1/2' : 'flex-1'} relative`}><CodeEditor /></div>}
        </div>

        {/* Floating Panels */}
        <AiChatPanel isOpen={showAiChat} onClose={() => setShowAiChat(false)} onApplyCode={(c) => { if (activeCodeFile) updateCodeFileContent(activeCodeFile.id, c); }} projectContext={currentProject ? `Board: ${currentProject.boardType}, Components: ${nodes.map(n => n.type).join(', ')}` : undefined} />
        <AiValidatorPanel isOpen={showValidator} onClose={() => setShowValidator(false)} />
        <MultimeterPanel isOpen={showMultimeter} onClose={() => setShowMultimeter(false)} voltage={isSimulating ? 5 : 0} current={isSimulating ? 20 : 0} />
        <OscilloscopePanel isOpen={showOscilloscope} onClose={() => setShowOscilloscope(false)} />
        <BomPanel isOpen={showBom} onClose={() => setShowBom(false)} />
      </div>

      {/* Serial Monitor */}
      <AnimatePresence>
        {showSerialMonitor && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 200, opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/10 z-20 flex flex-col bg-[#0a0a14]">
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5 bg-surface-900/80">
              <div className="flex items-center gap-2 text-surface-300"><Terminal className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase tracking-wider">Serial Monitor</span><span className="text-[9px] bg-surface-800 px-1.5 py-0.5 rounded text-surface-400">9600 baud</span></div>
              <div className="flex items-center gap-2"><button onClick={() => setSerialLogs([])} className="text-[9px] hover:text-white text-surface-400 uppercase">Clear</button><button onClick={() => setShowSerialMonitor(false)} className="text-surface-400 hover:text-white text-xs">✕</button></div>
            </div>
            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] text-green-400 flex flex-col gap-0.5">
              {serialLogs.length === 0 && <span className="text-surface-500 italic">No output yet...</span>}
              {serialLogs.map((log, i) => <div key={i}>{log}</div>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
