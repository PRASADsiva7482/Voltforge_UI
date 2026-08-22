import { create } from 'zustand';

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

interface PcbState {
  boardWidth_mm: number;
  boardHeight_mm: number;
  activeLayer: PcbLayer;
  traceWidth_mil: number;
  gridSnap_mm: number;
  visibleLayers: Record<PcbLayer, boolean>;

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
  toggleLayerVisibility: (layer: PcbLayer) => void;

  setFootprints: (footprints: PcbFootprint[]) => void;
  updateFootprintPosition: (id: string, x: number, y: number, rotation?: number) => void;
  addTrace: (trace: PcbTrace) => void;
  removeTrace: (id: string) => void;
  addVia: (via: PcbVia) => void;
  updateViaPosition: (id: string, x: number, y: number) => void;
  removeVia: (id: string) => void;
  setRatlines: (ratlines: Ratline[]) => void;
  setDrcViolations: (violations: DrcViolation[]) => void;

  selectFootprint: (id: string | null) => void;
  selectTrace: (id: string | null) => void;
  startRouting: (startPad: { componentId: string; padId: string; x: number; y: number; netId?: string }) => void;
  updateActiveRoute: (point: { x: number; y: number }) => void;
  finishRouting: (endPad?: { componentId: string; padId: string; x: number; y: number }) => void;
  cancelRouting: () => void;
}

export const usePcbStore = create<PcbState>((set, get) => ({
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

  toggleLayerVisibility: (layer) => set((state) => ({
    visibleLayers: { ...state.visibleLayers, [layer]: !state.visibleLayers[layer] }
  })),

  setFootprints: (footprints) => set({ footprints }),
  updateFootprintPosition: (id, x, y, rotation) => set((state) => ({
    footprints: state.footprints.map((f) =>
      f.id === id ? { ...f, x, y, rotation: rotation !== undefined ? rotation : f.rotation } : f
    ),
  })),

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

  finishRouting: (_endPad) => {
    const { activeRoute, activeLayer, traceWidth_mil } = get();
    if (!activeRoute || activeRoute.currentPoints.length < 2) {
      set({ isRoutingTrace: false, activeRoute: null });
      return;
    }

    const newTrace: PcbTrace = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      netId: activeRoute.startPad?.netId || 'net_0',
      layer: activeLayer === 'B.Cu' ? 'B.Cu' : 'F.Cu',
      points: activeRoute.currentPoints,
      width_mm: traceWidth_mil * 0.0254,
    };

    set((state) => ({
      traces: [...state.traces, newTrace],
      isRoutingTrace: false,
      activeRoute: null,
    }));
  },

  cancelRouting: () => set({ isRoutingTrace: false, activeRoute: null }),
}));
