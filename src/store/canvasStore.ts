import { create } from 'zustand';
import type { CanvasNode, Wire, ElectronicComponent } from '../types';

interface CanvasState {
  nodes: CanvasNode[];
  wires: Wire[];
  selectedNodeId: string | null;
  selectedWireId: string | null;
  isWiring: boolean;
  wiringFrom: { nodeId: string; pinId: string } | null;
  viewport: { x: number; y: number; scale: number };
  componentLibrary: ElectronicComponent[];
  
  // Undo/Redo History
  history: { nodes: CanvasNode[]; wires: Wire[] }[];
  historyIndex: number;

  // Actions
  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  addWire: (wire: Wire) => void;
  removeWire: (id: string) => void;
  selectWire: (id: string | null) => void;
  startWiring: (nodeId: string, pinId: string) => void;
  finishWiring: (nodeId: string, pinId: string) => void;
  cancelWiring: () => void;
  setViewport: (viewport: { x: number; y: number; scale: number }) => void;
  setComponentLibrary: (components: ElectronicComponent[]) => void;
  clearCanvas: () => void;
  loadCanvas: (nodes: CanvasNode[], wires: Wire[]) => void;
  
  // History Actions
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

let wireCounter = 0;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  wires: [],
  selectedNodeId: null,
  selectedWireId: null,
  isWiring: false,
  wiringFrom: null,
  viewport: { x: 0, y: 0, scale: 1 },
  componentLibrary: [],
  history: [],
  historyIndex: -1,

  addNode: (node) => {
    get().pushHistory();
    set((state) => ({ nodes: [...state.nodes, node] }));
  },

  updateNode: (id, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    })),

  removeNode: (id) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      wires: state.wires.filter((w) => w.fromNodeId !== id && w.toNodeId !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedWireId: null }),

  addWire: (wire) => {
    get().pushHistory();
    set((state) => ({ wires: [...state.wires, wire] }));
  },

  removeWire: (id) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.filter((w) => w.id !== id),
      selectedWireId: state.selectedWireId === id ? null : state.selectedWireId,
    }));
  },

  selectWire: (id) => set({ selectedWireId: id, selectedNodeId: null }),

  startWiring: (nodeId, pinId) => set({ isWiring: true, wiringFrom: { nodeId, pinId } }),

  finishWiring: (nodeId, pinId) => {
    const { wiringFrom } = get();
    if (wiringFrom && (wiringFrom.nodeId !== nodeId || wiringFrom.pinId !== pinId)) {
      get().pushHistory();
      const wire: Wire = {
        id: `wire_${++wireCounter}_${Date.now()}`,
        fromNodeId: wiringFrom.nodeId,
        fromPinId: wiringFrom.pinId,
        toNodeId: nodeId,
        toPinId: pinId,
        color: '#22c55e',
        points: [],
      };
      set((state) => ({
        wires: [...state.wires, wire],
        isWiring: false,
        wiringFrom: null,
      }));
    } else {
      set({ isWiring: false, wiringFrom: null });
    }
  },

  cancelWiring: () => set({ isWiring: false, wiringFrom: null }),

  setViewport: (viewport) => set({ viewport }),

  setComponentLibrary: (components) => set({ componentLibrary: components }),

  clearCanvas: () => {
    get().pushHistory();
    set({ nodes: [], wires: [], selectedNodeId: null, selectedWireId: null });
  },

  loadCanvas: (nodes, wires) => set({ nodes, wires }),

  // History Implementation
  pushHistory: () => {
    const { nodes, wires, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), wires: JSON.parse(JSON.stringify(wires)) });
    
    // Limit history size
    if (newHistory.length > 30) newHistory.shift();
    
    set({ 
      history: newHistory, 
      historyIndex: newHistory.length - 1 
    });
  },

  undo: () => {
    const { history, historyIndex, nodes, wires } = get();
    if (historyIndex < 0) return;

    // Save current state to history if we're at the end
    if (historyIndex === history.length - 1) {
       // but only if it's different from the last history item
    }

    const prevState = history[historyIndex];
    set({
      nodes: prevState.nodes,
      wires: prevState.wires,
      historyIndex: historyIndex - 1
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const nextState = history[nextIndex];
    set({
      nodes: nextState.nodes,
      wires: nextState.wires,
      historyIndex: nextIndex
    });
  }
}));
