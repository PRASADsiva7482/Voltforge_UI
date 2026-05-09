import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, ArrowLeft, Play, Square, Share2, Settings, Code2, Layout, Wand2, Terminal, Sparkles, Undo, Redo, FileCode2, Plus, X } from 'lucide-react';
import CircuitCanvas from '../canvas/CircuitCanvas';
import ComponentPanel from '../components/ComponentPanel';
import CodeEditor from '../editor/CodeEditor';
import PropertyEditor from '../editor/PropertyEditor';
import AiChatPanel from '../ai/AiChatPanel';
import ProjectSettingsModal from './ProjectSettingsModal';
import { projectApi, aiApi } from '../../api/services';
import { useProjectStore } from '../../store/projectStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useCollaboration } from '../../hooks/useCollaboration';
import { SimulationEngine, PinState } from '../simulator/SimulationEngine';
import { LogicRegistry } from '../simulator/logic/LogicRegistry';
import type { Wire } from '../../types';

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
      for (const entry of entries) { setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }); }
    });
    if (canvasContainerRef.current) observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleSave = useCallback(() => { saveMutation.mutate(); }, [saveMutation]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, undo, redo]);

  // --- Simulation Engine Setup ---
  useEffect(() => {
    engineRef.current = new SimulationEngine({
      onSerialOutput: (text) => {
        setSerialLogs(prev => [...prev.slice(-99), text]);
      },
      onPinStateChange: (componentId, pinId, state) => {
        const node = nodes.find(n => n.id === componentId);
        if (node) {
          LogicRegistry.dispatch(node.type, componentId, pinId, state);
        }
      },
      onError: (err) => {
        setSerialLogs(prev => [...prev.slice(-99), `[ERROR] ${err}`]);
      }
    });

    return () => {
      engineRef.current?.stop();
    };
  }, [nodes]);

  const toggleSimulation = async () => {
    if (!isSimulating) {
      setIsSimulating(true);
      setSerialLogs([`> Starting Simulation at ${new Date().toLocaleTimeString()}`]);
      setShowSerialMonitor(true);
      
      const code = activeCodeFile?.content || '';
      await engineRef.current?.start(code, nodes, wires);
    } else {
      setIsSimulating(false);
      engineRef.current?.stop();
      setSerialLogs(prev => [...prev, `> Simulation stopped`]);
      nodes.forEach(n => updateNode(n.id, { properties: { ...n.properties, isLit: false, isSpinning: false, isBeeping: false } }));
    }
  };

  const handleAiRouting = async () => {
    if (nodes.length < 2) return alert("Add at least 2 components to use AI auto-routing");
    setIsAiRouting(true);
    try {
      const componentList = nodes.map(n => n.type).join(", ");
      const res = await aiApi.suggestWiring({
        prompt: `Connect these components: ${componentList}`,
        boardType: currentProject?.boardType,
        componentTypes: nodes.map(n => n.type)
      });
      
      const suggestions = res.data.data.wireSuggestions || [];
      suggestions.forEach((sugg, i) => {
        const fromNode = nodes.find(n => n.type.includes(sugg.fromComponentId.split('_')[0].toUpperCase())) || nodes[0];
        const toNode = nodes.find(n => n.type.includes(sugg.toComponentId.split('_')[0].toUpperCase())) || nodes[1];
        if (fromNode && toNode) {
          addWire({
            id: `ai_wire_${Date.now()}_${i}`,
            fromNodeId: fromNode.id, fromPinId: fromNode.pins[0]?.id || 'pin1',
            toNodeId: toNode.id, toPinId: toNode.pins[0]?.id || 'pin2',
            color: sugg.color || '#3b82f6', points: []
          });
        }
      });
    } catch (err) { console.error("AI Routing failed", err); }
    finally { setIsAiRouting(false); }
  };

  const handleApplyAiCode = (code: string) => {
    if (activeCodeFile) updateCodeFileContent(activeCodeFile.id, code);
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen bg-surface-950"><div className="w-8 h-8 border-2 border-volt-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-screen bg-surface-950 relative">
      <ProjectSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 glass z-10">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white truncate">{currentProject?.name || 'Untitled'}</h2>
            {isConnected && <span className="w-2 h-2 rounded-full bg-volt-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Connected to Sync Server"></span>}
          </div>
          <p className="text-[10px] text-surface-500">{currentProject?.boardType?.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex items-center gap-1 bg-surface-900 rounded-lg p-0.5">
          {([['canvas', Layout], ['split', Code2], ['code', Code2]] as [ActivePanel, any][]).map(([panel, Icon]) => (
            <button key={panel} onClick={() => setActivePanel(panel)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activePanel === panel ? 'bg-volt-500/20 text-volt-400' : 'text-surface-400 hover:text-white'}`}>{panel.charAt(0).toUpperCase() + panel.slice(1)}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 border-l border-white/5 pl-4 ml-2">
          <button onClick={undo} disabled={historyIndex < 0} className="p-2 rounded-lg transition-colors text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed" title="Undo (Ctrl+Z)"><Undo className="w-4 h-4" /></button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 rounded-lg transition-colors text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed" title="Redo (Ctrl+Y)"><Redo className="w-4 h-4" /></button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <button onClick={handleAiRouting} disabled={isAiRouting || isSimulating} className={`p-2 rounded-lg transition-colors ${isAiRouting ? 'text-purple-400 animate-pulse' : 'text-surface-400 hover:text-purple-400 hover:bg-white/5'}`} title="AI Auto-Router"><Wand2 className="w-4 h-4" /></button>
          <button onClick={() => setShowAiChat(!showAiChat)} className={`p-2 rounded-lg transition-colors ${showAiChat ? 'bg-purple-500/20 text-purple-400' : 'text-surface-400 hover:text-purple-400 hover:bg-white/5'}`} title="AI Assistant"><Sparkles className="w-4 h-4" /></button>
          <button onClick={() => setShowSerialMonitor(!showSerialMonitor)} className={`p-2 rounded-lg transition-colors ${showSerialMonitor ? 'bg-surface-800 text-white' : 'hover:bg-white/5 text-surface-400 hover:text-white'}`} title="Serial Monitor"><Terminal className="w-4 h-4" /></button>
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white transition-colors" title="Project Settings"><Settings className="w-4 h-4" /></button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          {isSimulating ? (
            <button onClick={toggleSimulation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all border border-red-500/20"><Square className="w-3.5 h-3.5 fill-current" /> Stop</button>
          ) : (
            <button onClick={toggleSimulation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-volt-500/10 text-volt-500 hover:bg-volt-500/20 transition-all border border-volt-500/20"><Play className="w-3.5 h-3.5 fill-current" /> Run</button>
          )}
          <button onClick={handleSave} disabled={!isDirty} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDirty ? 'bg-volt-500 text-white hover:bg-volt-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-surface-800 text-surface-500'}`}><Save className="w-3.5 h-3.5" /> Save</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {(activePanel === 'canvas' || activePanel === 'split') && <ComponentPanel />}
        <div className="flex flex-1">
          {(activePanel === 'canvas' || activePanel === 'split') && (
            <div ref={canvasContainerRef} className={`${activePanel === 'split' ? 'w-1/2' : 'flex-1'} canvas-grid border-r border-white/5 relative`}>
              {isSimulating && <div className="absolute top-4 right-4 z-10 glass px-3 py-1.5 rounded-full flex items-center gap-2 border border-volt-500/30"><span className="w-2 h-2 rounded-full bg-volt-500 animate-pulse"></span><span className="text-xs font-medium text-volt-400">Simulation Active</span></div>}
              {isAiRouting && <div className="absolute top-4 right-4 z-10 glass px-3 py-1.5 rounded-full flex items-center gap-2 border border-purple-500/30"><Wand2 className="w-3 h-3 text-purple-400 animate-spin" /><span className="text-xs font-medium text-purple-400">AI Routing...</span></div>}
              <CircuitCanvas width={canvasSize.width} height={canvasSize.height} />
              {selectedNodeId && <PropertyEditor />}
            </div>
          )}
          {(activePanel === 'code' || activePanel === 'split') && <div className={`${activePanel === 'split' ? 'w-1/2' : 'flex-1'} relative`}><CodeEditor /></div>}
        </div>
        <AiChatPanel isOpen={showAiChat} onClose={() => setShowAiChat(false)} onApplyCode={handleApplyAiCode} projectContext={currentProject ? `Board: ${currentProject.boardType}, Components on canvas: ${nodes.map(n => n.type).join(', ')}` : undefined} />
      </div>
      
      <AnimatePresence>
        {showSerialMonitor && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 250, opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="absolute bottom-0 left-0 right-0 glass border-t border-white/10 z-20 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-surface-900/80">
              <div className="flex items-center gap-2 text-surface-300"><Terminal className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wider">Serial Monitor</span><span className="text-[10px] bg-surface-800 px-2 py-0.5 rounded text-surface-400 ml-2">9600 baud</span></div>
              <div className="flex items-center gap-2"><button onClick={() => setSerialLogs([])} className="text-[10px] hover:text-white text-surface-400 uppercase tracking-wider">Clear</button><button onClick={() => setShowSerialMonitor(false)} className="text-surface-400 hover:text-white p-1">✕</button></div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-green-400 flex flex-col gap-1">{serialLogs.length === 0 && <span className="text-surface-500 italic">No output yet...</span>}{serialLogs.map((log, i) => <div key={i}>{log}</div>)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
