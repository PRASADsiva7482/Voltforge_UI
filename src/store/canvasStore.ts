import { create } from 'zustand';
import type { CanvasNode, Wire, ElectronicComponent, WireBendPoint, PinPosition } from '../types/domain';
import { rerouteAutoWires, routeWireBetweenNodes, getWireAutoColor } from '../utils/wireRouting';
import { hydrateCanvasNode, type CanvasNodeSeed } from '../features/canvas/componentFactory';


/** Compatibility aliases for pin IDs used by older saved diagrams. These are
 * electrical names, not positional guesses; a wire must never be moved to a
 * different terminal merely because its ID ends in a number. */
const PIN_ID_ALIASES: Record<string, Record<string, string>> = {
  RELAY_SINGLE: {
    coil1: 'in',
    coil2: 'gnd',
  },
  MOTOR_DC: {
    positive: 'm1',
    pos: 'm1',
    plus: 'm1',
    negative: 'm2',
    neg: 'm2',
    minus: 'm2',
  },
  RESISTOR: {
    pin1: 'p1',
    pin2: 'p2',
  },
};

/** Resolve a pin reference that doesn't match any pin.id on the node. */
function resolvePin(pins: PinPosition[], refId: string, componentType: string): PinPosition | null {
  const lower = refId.toLowerCase();
  // By name
  const byName = pins.find(p => p.name.toLowerCase() === lower);
  if (byName) return byName;

  const alias = PIN_ID_ALIASES[componentType]?.[lower];
  if (alias) {
    const aliasedPin = pins.find((pin) => pin.id.toLowerCase() === alias);
    if (aliasedPin) return aliasedPin;
  }

  // Only accept an explicit terminal-number convention as a last resort.
  // IDs such as coil1 are deliberately excluded: their suffix is part of the
  // electrical name and must not be interpreted as an array position.
  const terminalMatch = refId.match(/^(?:terminal|pin)[_-]?(\d+)$/i);
  if (terminalMatch) {
    const idx = Number(terminalMatch[1]) - 1;
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

/** Keys that indicate geometry (position/size) changed — requires wire rerouting. */
const GEOMETRY_KEYS = new Set(['x', 'y', 'width', 'height', 'rotation', 'pins']);

interface CanvasState {
  nodes: CanvasNode[];
  /** O(1) lookup map — kept in sync with `nodes` array on every mutation. */
  nodesById: Map<string, CanvasNode>;
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
  /** Snapshots captured while walking forward through previously undone edits. */
  redoHistory: { nodes: CanvasNode[]; wires: Wire[] }[];

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
   *  - If ONLY non-geometry keys changed (e.g. properties), the wires array
   *    reference is preserved entirely — no rerouting, no downstream re-renders.
   */
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  /** Apply a user-authored property/geometry edit as one undoable operation. */
  commitNodeUpdate: (id: string, updates: Partial<CanvasNode>) => void;

  /**
   * updateNodeDragEnd — call this from onDragEnd / onTransformEnd only.
   *
   * Pushes to history and runs the full global rerouteAutoWires so every
   * wire (including those routed around the moved component) is recalculated
   * exactly once per user gesture.
   */
  updateNodeDragEnd: (id: string, updates: Partial<CanvasNode>) => void;

  /**
   * batchUpdateNodes — batches multiple node property updates into a single
   * store mutation.  Used by SimulationEngine to avoid N separate re-renders
   * per simulation tick.
   */
  batchUpdateNodes: (updates: Array<{ id: string; changes: Partial<CanvasNode> }>) => void;

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
  resetCanvas: () => void;
  loadCanvas: (nodes: CanvasNodeSeed[], wires: Wire[], viewport?: { x: number; y: number; scale: number }) => void;
  autoArrangeLayout: () => void;

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

/** Helper: build nodesById map from array. */
function buildNodesMap(nodes: CanvasNode[]): Map<string, CanvasNode> {
  const map = new Map<string, CanvasNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  nodesById: new Map(),
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
  redoHistory: [],

  addNode: (node) => {
    get().pushHistory();
    set((state) => {
      const nodes = [...state.nodes, node];
      const nodesById = new Map(state.nodesById);
      nodesById.set(node.id, node);
      return { nodes, nodesById };
    });
  },

  // ── Fast drag-time update: only reroute wires connected to this node ──────
  updateNode: (id, updates) =>
    set((state) => {
      const geometryChanged = Object.keys(updates).some((k) => GEOMETRY_KEYS.has(k));
      const nodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      const updatedNode = nodes.find((n) => n.id === id);
      const nodesById = new Map(state.nodesById);
      if (updatedNode) nodesById.set(id, updatedNode);
      return {
        nodes,
        nodesById,
        // PERF: When only properties changed (simulation updates), skip wire
        // rerouting entirely and preserve the wires array reference.  This
        // prevents thousands of downstream re-renders per simulation tick.
        wires: geometryChanged
          ? rerouteConnectedWires(id, nodes, state.wires)
          : state.wires,
      };
    }),

  commitNodeUpdate: (id, updates) => {
    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      const updatedNode = nodes.find((n) => n.id === id);
      return {
        nodes,
        nodesById: updatedNode
          ? new Map(state.nodesById).set(id, updatedNode)
          : state.nodesById,
        wires: Object.keys(updates).some((key) => GEOMETRY_KEYS.has(key))
          ? rerouteAutoWires(nodes, state.wires)
          : state.wires,
      };
    });
  },

  // ── DragEnd commit: push history + full global reroute ───────────────────
  updateNodeDragEnd: (id, updates) => {
    set((state) => {
      const nodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      return {
        nodes,
        nodesById: buildNodesMap(nodes),
        wires: rerouteAutoWires(nodes, state.wires),
      };
    });
  },

  // ── Batch update: merge N simulation updates into 1 store mutation ────────
  batchUpdateNodes: (updates) =>
    set((state) => {
      const nodesById = new Map(state.nodesById);
      const nodes = state.nodes.map((n) => {
        const entry = updates.find((u) => u.id === n.id);
        if (!entry) return n;
        const merged = { ...n, ...entry.changes };
        nodesById.set(n.id, merged);
        return merged;
      });
      // Batch updates are property-only (simulation), so wires are preserved.
      return { nodes, nodesById };
    }),

  removeNode: (id) => {
    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.filter((n) => n.id !== id);
      const nodesById = new Map(state.nodesById);
      nodesById.delete(id);
      return {
        nodes,
        nodesById,
        wires: state.wires.filter((w) => w.fromNodeId !== id && w.toNodeId !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
    });
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

  updateWire: (id, updates) => {
    get().pushHistory();
    set((state) => ({
      wires: state.wires.map((w) => {
        if (w.id !== id) return w;
        const next = { ...w, ...updates };
        return next.routingMode === 'auto'
          ? { ...next, bendPoints: routeWireBetweenNodes(next, state.nodes) }
          : next;
      }),
    }));
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
      const autoColor = getWireAutoColor(wiringFrom.pinId, pinId);
      const chosenColor = (wiringColor === '#22c55e' || !wiringColor) ? autoColor : wiringColor;
      const wire: Wire = {
        id: `wire_${++wireCounter}_${Date.now()}`,
        fromNodeId: wiringFrom.nodeId,
        fromPinId: wiringFrom.pinId,
        toNodeId: nodeId,
        toPinId: pinId,
        color: chosenColor,
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
    set({ nodes: [], nodesById: new Map(), wires: [], selectedNodeId: null, selectedWireId: null });
  },

  resetCanvas: () => set({
    nodes: [],
    nodesById: new Map(),
    wires: [],
    selectedNodeId: null,
    selectedWireId: null,
    isWiring: false,
    wiringFrom: null,
    viewport: { x: 0, y: 0, scale: 1 },
    history: [],
    historyIndex: -1,
    redoHistory: [],
  }),

  loadCanvas: (nodes, wires, viewport = { x: 0, y: 0, scale: 1 }) => {
    const componentLibrary = get().componentLibrary;
    const populatedNodes = nodes.map((node) => hydrateCanvasNode(node, componentLibrary));

    // ── Pin-ID reconciliation: patch wire pinIds to match node pin IDs ──
    const nodeMap = new Map(populatedNodes.map(n => [n.id, n]));
    const reconciledWires = wires.map(w => {
      const patched = { ...w };
      // Fix fromPinId
      const fromNode = nodeMap.get(w.fromNodeId);
      if (fromNode && fromNode.pins?.length && !fromNode.pins.some(p => p.id === w.fromPinId)) {
        const resolved = resolvePin(fromNode.pins, w.fromPinId, fromNode.type);
        if (resolved) patched.fromPinId = resolved.id;
      }
      // Fix toPinId
      const toNode = nodeMap.get(w.toNodeId);
      if (toNode && toNode.pins?.length && !toNode.pins.some(p => p.id === w.toPinId)) {
        const resolved = resolvePin(toNode.pins, w.toPinId, toNode.type);
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
    const finalNodes = populatedNodes;
    set({
      nodes: finalNodes,
      nodesById: buildNodesMap(finalNodes),
      wires: rerouteAutoWires(finalNodes, migratedWires),
      selectedNodeId: null,
      selectedWireId: null,
      isWiring: false,
      wiringFrom: null,
      viewport: {
        x: Number.isFinite(viewport.x) ? viewport.x : 0,
        y: Number.isFinite(viewport.y) ? viewport.y : 0,
        scale: Math.max(0.2, Math.min(3, Number.isFinite(viewport.scale) ? viewport.scale : 1)),
      },
      history: [],
      historyIndex: -1,
      redoHistory: [],
    });
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
      historyIndex: newHistory.length - 1,
      redoHistory: [],
    });
  },

  autoArrangeLayout: () => {
    const { nodes, wires, pushHistory } = get();
    if (!nodes || nodes.length === 0) return;
    pushHistory();

    const mcuNodes: CanvasNode[] = [];
    const powerNodes: CanvasNode[] = [];
    const sensorNodes: CanvasNode[] = [];
    const outputNodes: CanvasNode[] = [];
    const passiveNodes: CanvasNode[] = [];

    for (const n of nodes) {
      const t = (n.type || '').toUpperCase();
      if (t.includes('ARDUINO') || t.includes('ESP32') || t.includes('PICO') || t.includes('STM32') || t.includes('MCU')) {
        mcuNodes.push(n);
      } else if (t.includes('BATTERY') || t.includes('POWER') || t.includes('REGULATOR') || t.includes('7805') || t.includes('VCC') || t.includes('GND')) {
        powerNodes.push(n);
      } else if (t.includes('SENSOR') || t.includes('DHT') || t.includes('BME') || t.includes('MPU') || t.includes('LDR') || t.includes('BUTTON') || t.includes('POT') || t.includes('ENCODER') || t.includes('ULTRASONIC') || t.includes('HC_SR04')) {
        sensorNodes.push(n);
      } else if (t.includes('DISPLAY') || t.includes('OLED') || t.includes('LCD') || t.includes('SERVO') || t.includes('RELAY') || t.includes('MOTOR') || t.includes('LED') || t.includes('BUZZER') || t.includes('MATRIX')) {
        outputNodes.push(n);
      } else {
        passiveNodes.push(n);
      }
    }

    const arranged: CanvasNode[] = [];

    // Place MCU
    mcuNodes.forEach((n, idx) => {
      arranged.push({ ...n, x: 440 + idx * 300, y: 260 });
    });

    // Place Power top-left
    powerNodes.forEach((n, idx) => {
      arranged.push({ ...n, x: 120 + idx * 160, y: 120 });
    });

    // Place Sensors left column
    sensorNodes.forEach((n, idx) => {
      arranged.push({ ...n, x: 120, y: 260 + idx * 150 });
    });

    // Place Outputs right column
    outputNodes.forEach((n, idx) => {
      arranged.push({ ...n, x: 840, y: 180 + idx * 150 });
    });

    // Place Passives bottom
    passiveNodes.forEach((n, idx) => {
      arranged.push({ ...n, x: 380 + (idx % 3) * 160, y: 560 + Math.floor(idx / 3) * 100 });
    });

    // Snap to 20px grid
    const finalNodes = arranged.map(n => ({
      ...n,
      x: Math.round(n.x / 20) * 20,
      y: Math.round(n.y / 20) * 20,
    }));

    const finalWires = rerouteAutoWires(finalNodes, wires);
    set({
      nodes: finalNodes,
      nodesById: buildNodesMap(finalNodes),
      wires: finalWires,
    });
  },

  undo: () => {

    const { history, historyIndex, nodes, wires, redoHistory } = get();
    if (historyIndex < 0) return;
    const prevState = history[historyIndex];
    set({
      nodes: prevState.nodes,
      nodesById: buildNodesMap(prevState.nodes),
      wires: prevState.wires,
      historyIndex: historyIndex - 1,
      redoHistory: [...redoHistory, { nodes: JSON.parse(JSON.stringify(nodes)), wires: JSON.parse(JSON.stringify(wires)) }],
    });
  },

  redo: () => {
    const { history, historyIndex, redoHistory } = get();
    if (redoHistory.length === 0) return;
    const nextState = redoHistory[redoHistory.length - 1];
    set({
      nodes: nextState.nodes,
      nodesById: buildNodesMap(nextState.nodes),
      wires: nextState.wires,
      historyIndex: Math.min(history.length - 1, historyIndex + 1),
      redoHistory: redoHistory.slice(0, -1),
    });
  }
}));

export { WIRE_COLORS };

