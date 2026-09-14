import { create } from 'zustand';
import { shallowDocumentEqual } from './documentMutation';
import type { CanvasNode, Wire } from '../types/domain';
import { PcbSchematicSync } from '../features/pcb/pcbSchematicSync';

export type PcbLayer = 'F.Cu' | 'B.Cu' | 'F.Silk' | 'B.Silk' | 'Edge.Cuts';

export interface PcbPad {
  id: string;
  name: string;
  netId?: string;
  x: number; // offset from footprint center in mm
  y: number; // offset from footprint center in mm
  width: number; // mm
  height: number; // mm
  shape: 'rect' | 'circle' | 'oval';
  drillDiameter?: number; // mm for THT pads
}

export interface PcbFootprint {
  id: string;
  componentId: string;
  name: string;
  componentType: string;
  packageType: string;
  x: number; // mm on board
  y: number; // mm on board
  rotation: number; // degrees
  width: number;
  height: number;
  pads: PcbPad[];
}

export interface PcbTrace {
  id: string;
  netId: string;
  layer: 'F.Cu' | 'B.Cu';
  points: { x: number; y: number }[]; // mm
  width_mm: number;
}

export interface PcbVia {
  id: string;
  netId?: string;
  x: number; // mm
  y: number; // mm
  drill_mm: number;
  pad_mm: number;
}

export interface Ratline {
  id: string;
  netId: string;
  from: { x: number; y: number; padId: string; componentId: string };
  to: { x: number; y: number; padId: string; componentId: string };
}

export interface DrcViolation {
  id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  rule: string;
  message: string;
  x?: number;
  y?: number;
}

export interface PcbLayout {
  boardWidth_mm: number;
  boardHeight_mm: number;
  activeLayer: PcbLayer;
  traceWidth_mil: number;
  gridSnap_mm: number;
  visibleLayers: Record<PcbLayer, boolean>;
  viewport: { x: number; y: number; scale: number };
  footprints: PcbFootprint[];
  traces: PcbTrace[];
  vias: PcbVia[];
}

interface PcbState {
  connectSchematic: (read: () => { nodes: CanvasNode[]; wires: Wire[] }) => () => void;
  requestSchematicSync: () => void;
  documentRevision: number;
  localDocumentRevision: number;
  boardWidth_mm: number;
  boardHeight_mm: number;
  activeLayer: PcbLayer;
  traceWidth_mil: number;
  gridSnap_mm: number;
  visibleLayers: Record<PcbLayer, boolean>;
  viewport: { x: number; y: number; scale: number };

  footprints: PcbFootprint[];
  traces: PcbTrace[];
  vias: PcbVia[];
  ratlines: Ratline[];
  drcViolations: DrcViolation[];

  selectedFootprintId: string | null;
  selectedTraceId: string | null;
  isRoutingTrace: boolean;
  activeRoute: {
    startPad: { componentId: string; padId: string; x: number; y: number; netId?: string } | null;
    currentPoints: { x: number; y: number }[];
  } | null;

  setBoardDimensions: (width_mm: number, height_mm: number) => void;
  setActiveLayer: (layer: PcbLayer) => void;
  setTraceWidth: (mil: number) => void;
  setGridSnap: (mm: number) => void;
  setViewport: (viewport: { x: number; y: number; scale: number }) => void;
  toggleLayerVisibility: (layer: PcbLayer) => void;

  setFootprints: (footprints: PcbFootprint[], source?: 'local' | 'derived') => void;
  updateFootprintPosition: (id: string, x: number, y: number, rotation?: number) => void;
  addTrace: (trace: PcbTrace) => void;
  removeTrace: (id: string) => void;
  addVia: (via: PcbVia) => void;
  updateViaPosition: (id: string, x: number, y: number) => void;
  removeVia: (id: string) => void;
  setRatlines: (ratlines: Ratline[]) => void;
  setDrcViolations: (violations: DrcViolation[]) => void;
  resetPcb: () => void;
  loadPcb: (layout?: Partial<PcbLayout>) => void;
  getLayout: () => PcbLayout;

  selectFootprint: (id: string | null) => void;
  selectTrace: (id: string | null) => void;
  startRouting: (startPad: { componentId: string; padId: string; x: number; y: number; netId?: string }) => void;
  updateActiveRoute: (point: { x: number; y: number }) => void;
  finishRouting: (endPad?: { componentId: string; padId: string; x: number; y: number; netId?: string }, routedPoints?: { x: number; y: number }[]) => void;
  cancelRouting: () => void;
}

const DOCUMENT_KEYS = ['boardWidth_mm', 'boardHeight_mm', 'activeLayer', 'traceWidth_mil', 'gridSnap_mm', 'visibleLayers', 'viewport', 'footprints', 'traces', 'vias'] as const;

export const usePcbStore = create<PcbState>((baseSet, get) => {
  let sync = new PcbSchematicSync();
  let readSchematic: (() => { nodes: CanvasNode[]; wires: Wire[] }) | undefined;
  let pending = false;
  let generation = 0;
  let syncing = false;
  const flushSchematicSync = () => {
    if (!readSchematic || syncing) return;
    pending = false;
    generation++;
    syncing = true;
    try {
      const source = readSchematic();
      const state = get();
      const result = sync.reconcile(source.nodes, source.wires, state.footprints, state.traces);
      if (result.footprints !== state.footprints || result.ratlines !== state.ratlines) setLoaded(result);
    } finally { syncing = false; }
  };
  const requestSchematicSync = () => {
    if (!readSchematic || syncing || pending) return;
    pending = true;
    const requested = ++generation;
    queueMicrotask(() => { if (pending && requested === generation) flushSchematicSync(); });
  };
  const resetSchematicSync = () => {
    sync = new PcbSchematicSync();
    pending = false;
    generation++;
  };
  type Update = Partial<PcbState> | ((state: PcbState) => Partial<PcbState>);
  const apply = (update: Update, local: boolean) => {
    const before = get();
    baseSet((state) => {
    const patch = typeof update === 'function' ? update(state) : update;
    const changed = DOCUMENT_KEYS.some(key => key in patch && !shallowDocumentEqual(patch[key], state[key]));
    return { ...patch,
      documentRevision: state.documentRevision + Number(changed),
      localDocumentRevision: state.localDocumentRevision + Number(changed && local),
    };
    });
    if (before.footprints !== get().footprints || before.traces !== get().traces) requestSchematicSync();
  };
  const set = (update: Update) => apply(update, true);
  const setLoaded = (update: Update) => apply(update, false);
  return ({
  connectSchematic: (read) => {
    readSchematic = read;
    requestSchematicSync();
    return () => {
      if (readSchematic !== read) return;
      // Finish the final source edit before detaching; old queued callbacks must
      // never mutate a different scene/document (including StrictMode remounts).
      flushSchematicSync();
      readSchematic = undefined;
      pending = false;
      generation++;
    };
  },
  requestSchematicSync,
  documentRevision: 0,
  localDocumentRevision: 0,
  boardWidth_mm: 100,
  boardHeight_mm: 80,
  activeLayer: 'F.Cu',
  traceWidth_mil: 10,
  gridSnap_mm: 0.635, // 25 mil
  visibleLayers: {
    'F.Cu': true,
    'B.Cu': true,
    'F.Silk': true,
    'B.Silk': true,
    'Edge.Cuts': true,
  },
  viewport: { x: 0, y: 0, scale: 1 },

  footprints: [],
  traces: [],
  vias: [],
  ratlines: [],
  drcViolations: [],

  selectedFootprintId: null,
  selectedTraceId: null,
  isRoutingTrace: false,
  activeRoute: null,

  setBoardDimensions: (boardWidth_mm, boardHeight_mm) => set({ boardWidth_mm, boardHeight_mm }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setTraceWidth: (traceWidth_mil) => set({ traceWidth_mil }),
  setGridSnap: (gridSnap_mm) => set({ gridSnap_mm }),
  setViewport: (viewport) => set({ viewport }),

  toggleLayerVisibility: (layer) => set((state) => ({
    visibleLayers: { ...state.visibleLayers, [layer]: !state.visibleLayers[layer] }
  })),

  setFootprints: (footprints, source = 'local') => apply({ footprints }, source === 'local'),
  updateFootprintPosition: (id, x, y, rotation) => {
    const footprint = get().footprints.find(f => f.id === id);
    if (!footprint || (footprint.x === x && footprint.y === y && (rotation === undefined || footprint.rotation === rotation))) return;
    set((state) => ({
    footprints: state.footprints.map((f) =>
      f.id === id ? { ...f, x, y, rotation: rotation !== undefined ? rotation : f.rotation } : f
    ),
    }));
  },

  addTrace: (trace) => set((state) => ({ traces: [...state.traces, trace] })),
  removeTrace: (id) => set((state) => ({
    traces: state.traces.filter((t) => t.id !== id),
    selectedTraceId: state.selectedTraceId === id ? null : state.selectedTraceId,
  })),

  addVia: (via) => set((state) => ({ vias: [...state.vias, via] })),
  updateViaPosition: (id, x, y) => set((state) => ({
    vias: state.vias.map((via) => (via.id === id ? { ...via, x, y } : via)),
  })),
  removeVia: (id) => set((state) => ({ vias: state.vias.filter((v) => v.id !== id) })),

  setRatlines: (ratlines) => set({ ratlines }),
  setDrcViolations: (drcViolations) => set({ drcViolations }),

  selectFootprint: (id) => set({ selectedFootprintId: id, selectedTraceId: null }),
  selectTrace: (id) => set({ selectedTraceId: id, selectedFootprintId: null }),

  startRouting: (startPad) => set({
    isRoutingTrace: true,
    activeRoute: {
      startPad,
      currentPoints: [{ x: startPad.x, y: startPad.y }],
    }
  }),

  updateActiveRoute: (point) => set((state) => {
    if (!state.activeRoute) return {};
    const pts = [...state.activeRoute.currentPoints];
    if (pts.length > 1) {
      pts[pts.length - 1] = point;
    } else {
      pts.push(point);
    }
    return {
      activeRoute: {
        ...state.activeRoute,
        currentPoints: pts,
      }
    };
  }),

  finishRouting: (endPad, routedPoints) => {
    const { activeRoute, activeLayer, traceWidth_mil } = get();
    if (!activeRoute) {
      set({ isRoutingTrace: false, activeRoute: null });
      return;
    }

    const endPoint = endPad ? { x: endPad.x, y: endPad.y } : activeRoute.currentPoints[activeRoute.currentPoints.length - 1];
    const points = routedPoints && routedPoints.length >= 2
      ? routedPoints
      : activeRoute.currentPoints.length >= 2
        ? [...activeRoute.currentPoints.slice(0, -1), endPoint]
        : [activeRoute.startPad ? { x: activeRoute.startPad.x, y: activeRoute.startPad.y } : endPoint, endPoint];
    if (points.length < 2 || points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) {
      set({ isRoutingTrace: false, activeRoute: null });
      return;
    }
    const newTrace: PcbTrace = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      netId: activeRoute.startPad?.netId || endPad?.netId || `net_${activeRoute.startPad?.componentId || 'unconnected'}_${activeRoute.startPad?.padId || 'pad'}`,
      layer: activeLayer === 'B.Cu' ? 'B.Cu' : 'F.Cu',
      points,
      width_mm: traceWidth_mil * 0.0254,
    };

    set((state) => ({
      traces: [...state.traces, newTrace],
      isRoutingTrace: false,
      activeRoute: null,
    }));
  },

  cancelRouting: () => set({ isRoutingTrace: false, activeRoute: null }),

  resetPcb: () => {
    resetSchematicSync();
    setLoaded({
    boardWidth_mm: 100,
    boardHeight_mm: 80,
    activeLayer: 'F.Cu',
    traceWidth_mil: 10,
    gridSnap_mm: 0.635,
    visibleLayers: { 'F.Cu': true, 'B.Cu': true, 'F.Silk': true, 'B.Silk': true, 'Edge.Cuts': true },
    viewport: { x: 0, y: 0, scale: 1 },
    footprints: [],
    traces: [],
    vias: [],
    ratlines: [],
    drcViolations: [],
    selectedFootprintId: null,
    selectedTraceId: null,
    isRoutingTrace: false,
    activeRoute: null,
    });
    requestSchematicSync();
  },

  loadPcb: (layout) => {
    resetSchematicSync();
    const defaults = get();
    setLoaded({
      boardWidth_mm: Number.isFinite(layout?.boardWidth_mm) ? Number(layout?.boardWidth_mm) : defaults.boardWidth_mm,
      boardHeight_mm: Number.isFinite(layout?.boardHeight_mm) ? Number(layout?.boardHeight_mm) : defaults.boardHeight_mm,
      activeLayer: layout?.activeLayer === 'B.Cu' ? 'B.Cu' : 'F.Cu',
      traceWidth_mil: Number.isFinite(layout?.traceWidth_mil) ? Number(layout?.traceWidth_mil) : defaults.traceWidth_mil,
      gridSnap_mm: Number.isFinite(layout?.gridSnap_mm) ? Number(layout?.gridSnap_mm) : defaults.gridSnap_mm,
      visibleLayers: { ...defaults.visibleLayers, ...(layout?.visibleLayers || {}) },
      viewport: {
        x: Number(layout?.viewport?.x) || 0,
        y: Number(layout?.viewport?.y) || 0,
        scale: Math.max(0.2, Math.min(3, Number(layout?.viewport?.scale) || 1)),
      },
      footprints: Array.isArray(layout?.footprints) ? layout!.footprints! : [],
      traces: Array.isArray(layout?.traces) ? layout!.traces! : [],
      vias: Array.isArray(layout?.vias) ? layout!.vias! : [],
      ratlines: [],
      drcViolations: [],
      selectedFootprintId: null,
      selectedTraceId: null,
      isRoutingTrace: false,
      activeRoute: null,
    });
    requestSchematicSync();
  },

  getLayout: () => {
    // Save/share can run in the same event as a schematic edit, before the
    // microtask or React effects. Always read the newest authored source here.
    flushSchematicSync();
    const state = get();
    return {
      boardWidth_mm: state.boardWidth_mm,
      boardHeight_mm: state.boardHeight_mm,
      activeLayer: state.activeLayer,
      traceWidth_mil: state.traceWidth_mil,
      gridSnap_mm: state.gridSnap_mm,
      visibleLayers: state.visibleLayers,
      viewport: state.viewport,
      footprints: state.footprints,
      traces: state.traces,
      vias: state.vias,
    };
  },
  });
});
