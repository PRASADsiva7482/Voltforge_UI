import { create } from 'zustand';
import type { CanvasNode, Wire, ElectronicComponent, WireBendPoint, PinPosition } from '../types';
import { rerouteAutoWires, routeWireBetweenNodes } from '../utils/wireRouting';
import { getPinsForComponent } from '../features/canvas/pinRegistry';

/**
 * Resolve a pin reference that doesn't match any pin.id on the node.
 * Tries: name match, trailing-index match, partial-ID match.
 */
function resolvePin(pins: PinPosition[], refId: string): PinPosition | null {
  const lower = refId.toLowerCase();
  // By name
  const byName = pins.find(p => p.name.toLowerCase() === lower);
  if (byName) return byName;
  // By trailing index (e.g., 'esp32_pin_3' → index 3)
  const idxMatch = refId.match(/(\d+)$/);
  if (idxMatch) {
    const idx = parseInt(idxMatch[1], 10);
    if (idx >= 0 && idx < pins.length) return pins[idx];
  }
  // By partial string inclusion
  const byPartial = pins.find(p =>
    p.id.toLowerCase().includes(lower) || lower.includes(p.id.toLowerCase())
  );
  if (byPartial) return byPartial;
  return null;
}

type RoutingMode = Wire['routingMode'];

interface CanvasState {
  nodes: CanvasNode[];
  wires: Wire[];
  selectedNodeId: string | null;
  selectedWireId: string | null;
  isWiring: boolean;
  wiringFrom: { nodeId: string; pinId: string } | null;
  wiringColor: string;
  wiringMode: RoutingMode;
  viewport: { x: number; y: number; scale: number };
  componentLibrary: ElectronicComponent[];

  // Undo/Redo History
  history: { nodes: CanvasNode[]; wires: Wire[] }[];
  historyIndex: number;

  // Actions
  addNode: (node: CanvasNode) => void;

  /**
   * updateNode — used during DRAG (geometry changes are transient).
   *
   * Performance contract:
   *  - If geometry keys (x, y, width, height, rotation, pins) changed, ONLY
   *    reroute wires that are directly connected to this node.  This is O(W_node)
   *    instead of O(W_total) and keeps 60 fps smooth on large schematics.
   *  - Full rerouteAutoWires() is intentionally deferred to updateNodeDragEnd().
   */
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;

  /**
   * updateNodeDragEnd — call this from onDragEnd / onTransformEnd only.
   *
   * Pushes to history and runs the full global rerouteAutoWires so every
   * wire (including those routed around the moved component) is recalculated
   * exactly once per user gesture.
   */
  updateNodeDragEnd: (id: string, updates: Partial<CanvasNode>) => void;

  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  addWire: (wire: Wire) => void;
  updateWire: (id: string, updates: Partial<Wire>) => void;
  removeWire: (id: string) => void;
  selectWire: (id: string | null) => void;
  startWiring: (nodeId: string, pinId: string) => void;
  finishWiring: (nodeId: string, pinId: string) => void;
  cancelWiring: () => void;
  setWiringColor: (color: string) => void;
  setWiringMode: (mode: RoutingMode) => void;
  addBendPoint: (wireId: string, index: number, point: WireBendPoint) => void;
  updateBendPoint: (wireId: string, index: number, point: WireBendPoint) => void;
  removeBendPoint: (wireId: string, index: number) => void;
  setViewport: (viewport: { x: number; y: number; scale: number }) => void;
  setComponentLibrary: (components: ElectronicComponent[]) => void;
  clearCanvas: () => void;
  loadCanvas: (nodes: CanvasNode[], wires: Wire[]) => void;

  // History Actions
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

const WIRE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#f97316'];

let wireCounter = 0;

/** Re-route only the wires that touch a specific node — O(W_node) not O(W_total). */
function rerouteConnectedWires(nodeId: string, nodes: CanvasNode[], wires: Wire[]): Wire[] {
  return wires.map(w => {
    const touches = w.fromNodeId === nodeId || w.toNodeId === nodeId;
    if (!touches || w.routingMode !== 'auto') return w;
    return { ...w, bendPoints: routeWireBetweenNodes(w, nodes) };
  });
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  wires: [],
  selectedNodeId: null,
  selectedWireId: null,
  isWiring: false,
  wiringFrom: null,
  wiringColor: WIRE_COLORS[0],
  wiringMode: 'auto',
  viewport: { x: 0, y: 0, scale: 1 },
  componentLibrary: [],
  history: [],
  historyIndex: -1,

  addNode: (node) => {
    get().pushHistory();
    set((state) => ({ nodes: [...state.nodes, node] }));
  },

  // ── Fast drag-time update: only reroute wires connected to this node ──────
  updateNode: (id, updates) =>
    set((state) => {
      const nodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      const geometryChanged = ['x', 'y', 'width', 'height', 'rotation', 'pins'].some(
        (key) => key in updates
      );
      return {
        nodes,
        wires: geometryChanged
          ? rerouteConnectedWires(id, nodes, state.wires)
          : state.wires,
      };
    }),

  // ── DragEnd commit: push history + full global reroute ───────────────────
  updateNodeDragEnd: (id, updates) => {
    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      return {
        nodes,
        wires: rerouteAutoWires(nodes, state.wires),
      };
    });
  },

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
    set((state) => {
      const routedWire = wire.routingMode === 'auto'
        ? { ...wire, bendPoints: routeWireBetweenNodes(wire, state.nodes) }
        : wire;
      return { wires: [...state.wires, routedWire] };
    });
  },

  updateWire: (id, updates) =>
    set((state) => ({
      wires: state.wires.map((w) => {
        if (w.id !== id) return w;
        const next = { ...w, ...updates };
        return next.routingMode === 'auto'
          ? { ...next, bendPoints: routeWireBetweenNodes(next, state.nodes) }
          : next;
      }),
    })),

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
    const { wiringFrom, wiringColor, wiringMode } = get();
    if (wiringFrom && (wiringFrom.nodeId !== nodeId || wiringFrom.pinId !== pinId)) {
      // Prevent duplicate wires between same pins
      const existing = get().wires.find(w =>
        (w.fromNodeId === wiringFrom.nodeId && w.fromPinId === wiringFrom.pinId && w.toNodeId === nodeId && w.toPinId === pinId) ||
        (w.fromNodeId === nodeId && w.fromPinId === pinId && w.toNodeId === wiringFrom.nodeId && w.toPinId === wiringFrom.pinId)
      );
      if (existing) {
        set({ isWiring: false, wiringFrom: null });
        return;
      }
      get().pushHistory();
      const wire: Wire = {
        id: `wire_${++wireCounter}_${Date.now()}`,
        fromNodeId: wiringFrom.nodeId,
        fromPinId: wiringFrom.pinId,
        toNodeId: nodeId,
        toPinId: pinId,
        color: wiringColor,
        bendPoints: [],
        routingMode: wiringMode,
      };
      if (wire.routingMode === 'auto') {
        wire.bendPoints = routeWireBetweenNodes(wire, get().nodes);
      }
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

  setWiringColor: (color) => set({ wiringColor: color }),

  setWiringMode: (mode) => set({ wiringMode: mode }),

  addBendPoint: (wireId, index, point) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.map((w) => {
        if (w.id !== wireId) return w;
        const bp = [...w.bendPoints];
        bp.splice(index, 0, point);
        return { ...w, bendPoints: bp };
      }),
    }));
  },

  updateBendPoint: (wireId, index, point) =>
    set((state) => ({
      wires: state.wires.map((w) => {
        if (w.id !== wireId) return w;
        const bp = [...w.bendPoints];
        bp[index] = point;
        return { ...w, bendPoints: bp };
      }),
    })),

  removeBendPoint: (wireId, index) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.map((w) => {
        if (w.id !== wireId) return w;
        const bp = [...w.bendPoints];
        bp.splice(index, 1);
        return { ...w, bendPoints: bp };
      }),
    }));
  },

  setViewport: (viewport) => set({ viewport }),

  setComponentLibrary: (components) => set({ componentLibrary: components }),

  clearCanvas: () => {
    get().pushHistory();
    set({ nodes: [], wires: [], selectedNodeId: null, selectedWireId: null });
  },

  loadCanvas: (nodes, wires) => {
    // Populate missing or empty pin arrays for nodes
    const populatedNodes = nodes.map(n => {
      if (!n.pins || n.pins.length === 0) {
        return {
          ...n,
          pins: getPinsForComponent(n.type, undefined, n.width, n.height)
        };
      }
      return n;
    });

    // ── Pin-ID reconciliation: patch wire pinIds to match node pin IDs ──
    const nodeMap = new Map(populatedNodes.map(n => [n.id, n]));
    const reconciledWires = wires.map(w => {
      const patched = { ...w };
      // Fix fromPinId
      const fromNode = nodeMap.get(w.fromNodeId);
      if (fromNode && fromNode.pins?.length && !fromNode.pins.some(p => p.id === w.fromPinId)) {
        const resolved = resolvePin(fromNode.pins, w.fromPinId);
        if (resolved) patched.fromPinId = resolved.id;
      }
      // Fix toPinId
      const toNode = nodeMap.get(w.toNodeId);
      if (toNode && toNode.pins?.length && !toNode.pins.some(p => p.id === w.toPinId)) {
        const resolved = resolvePin(toNode.pins, w.toPinId);
        if (resolved) patched.toPinId = resolved.id;
      }
      return patched;
    });

    // Migrate wire format and upgrade straight wires to auto-routing
    const migratedWires = reconciledWires.map(w => {
      const mode = (['straight', 'orthogonal', 'curved', 'auto'].includes(w.routingMode) ? w.routingMode : 'auto') as RoutingMode;
      // Upgrade straight wires with no user bend points to auto-route around components
      const shouldUpgrade = mode === 'straight' && (!w.bendPoints || w.bendPoints.length === 0);
      return {
        ...w,
        bendPoints: shouldUpgrade || mode === 'auto' ? [] : w.bendPoints || [],
        routingMode: shouldUpgrade ? 'auto' as RoutingMode : mode,
      };
    });
    set({ nodes: populatedNodes, wires: rerouteAutoWires(populatedNodes, migratedWires) });
  },

  // History Implementation
  pushHistory: () => {
    const { nodes, wires, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), wires: JSON.parse(JSON.stringify(wires)) });

    // Limit history size
    if (newHistory.length > 50) newHistory.shift();

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < 0) return;
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

export { WIRE_COLORS };
