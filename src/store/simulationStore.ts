import { create } from 'zustand';
import type { DebugSnapshot } from '../types/domain';
import type { CanvasProbe } from '../features/canvas/probeManager';
import type { LogicCaptureFrame } from '../features/simulator/logic/protocolAnalyzers';

interface SerialWriteOptions {
  newline?: boolean;
}

export interface LiveMeterMeasurement {
  voltage: number;
  acVoltage: number;
  current_mA: number;
  resistance_ohm: number;
  positiveLabel: string;
  negativeLabel: string;
}

interface SimulationState {
  isSimulating: boolean;
  serialLogs: string[];
  serialPanelOpen: boolean;
  baudRate: number;
  isSerialLineOpen: boolean;
  serialInputQueue: string[];
  debugSnapshot: DebugSnapshot;

  // ── MNA Solver State ──
  nodeVoltages: Record<string, number>;
  /** Solved current assigned to each physical wire for the flow overlay. */
  wireCurrents: Record<string, number>;
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
  oscilloscopeData: Record<string, number[]>;
  logicCapture: LogicCaptureFrame[];
  oscilloscopeSamplePeriodMs: number;
  oscilloscopePanelOpen: boolean;
  thermalHeatmapEnabled: boolean;
  solverConverged: boolean;
  liveMeter: LiveMeterMeasurement;
  meterProbes: CanvasProbe[];

  // ── Simulation Fidelity & Emulation Mode ──
  showCurrentFlow: boolean;
  currentFlowDirection: 'conventional' | 'electron';
  customHex: string | null;
  executionMode: 'interpreter' | 'avr8js';

  writeSerial: (text: string, options?: SerialWriteOptions) => void;
  setSimulating: (isSimulating: boolean) => void;
  sendSerialInput: (text: string) => void;
  drainSerialInput: () => string[];
  setDebugSnapshot: (snapshot: Partial<DebugSnapshot>) => void;
  setBreakpoints: (breakpoints: number[]) => void;
  clearSerial: () => void;
  setSerialPanelOpen: (open: boolean) => void;
  setBaudRate: (baudRate: number) => void;
  setShowCurrentFlow: (show: boolean) => void;
  setCurrentFlowDirection: (dir: 'conventional' | 'electron') => void;
  setCustomHex: (hex: string | null) => void;
  setExecutionMode: (mode: 'interpreter' | 'avr8js') => void;

  // ── MNA Solver Actions ──
  setCircuitState: (
    voltages: Record<string, number>,
    wireCurrents: Record<string, number>,
    currents: Record<string, number>,
    power: Record<string, number>,
    converged: boolean
  ) => void;
  setLiveMeter: (measurement: Partial<LiveMeterMeasurement>) => void;
  toggleMeterProbe: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
  clearMeterProbes: () => void;
  appendOscilloscopeData: (nodeId: string, voltage: number) => void;
  appendLogicCapture: (frame: LogicCaptureFrame) => void;
  setOscilloscopeSamplePeriod: (periodMs: number) => void;
  clearOscilloscopeData: () => void;
  setOscilloscopePanelOpen: (open: boolean) => void;
  setThermalHeatmapEnabled: (enabled: boolean) => void;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const MAX_SCOPE_SAMPLES = 2048;
const MAX_LOGIC_FRAMES = 16384;

export const useSimulationStore = create<SimulationState>((set) => ({
  isSimulating: false,
  serialLogs: [],
  serialPanelOpen: false,
  baudRate: 9600,
  isSerialLineOpen: false,
  serialInputQueue: [],
  debugSnapshot: { currentLine: null, variables: {}, pins: {}, isPaused: false, breakpoints: [] },

  // ── MNA Solver State Defaults ──
  nodeVoltages: {},
  wireCurrents: {},
  branchCurrents: {},
  componentPower: {},
  oscilloscopeData: {},
  logicCapture: [],
  oscilloscopeSamplePeriodMs: 1,
  oscilloscopePanelOpen: false,
  thermalHeatmapEnabled: false,
  solverConverged: true,
  liveMeter: {
    voltage: 0,
    acVoltage: 0,
    current_mA: 0,
    resistance_ohm: Number.POSITIVE_INFINITY,
    positiveLabel: 'Probe (+)',
    negativeLabel: 'Probe (-)',
  },
  meterProbes: [],

  // ── Simulation Fidelity & Emulation Mode Defaults ──
  showCurrentFlow: true,
  currentFlowDirection: 'conventional',
  customHex: null,
  executionMode: 'interpreter',

  setSimulating: (isSimulating) => set({ isSimulating }),

  writeSerial: (text, options) => {
    const newline = options?.newline ?? true;
    set((state) => {
      const logs = [...state.serialLogs];
      const incoming = text ?? '';

      if (state.isSerialLineOpen && logs.length > 0) {
        logs[logs.length - 1] = `${logs[logs.length - 1]}${incoming}`;
      } else {
        logs.push(incoming);
      }

      return {
        serialLogs: logs.slice(-300),
        serialPanelOpen: true,
        isSerialLineOpen: !newline,
      };
    });
  },

  sendSerialInput: (text) => set((state) => ({
    serialInputQueue: [...state.serialInputQueue, text],
    serialLogs: [...state.serialLogs, `> ${text}`].slice(-300),
  })),

  drainSerialInput: () => {
    let pending: string[] = [];
    set((state) => {
      pending = state.serialInputQueue;
      return { serialInputQueue: [] };
    });
    return pending;
  },

  setDebugSnapshot: (snapshot) => set((state) => ({
    debugSnapshot: { ...state.debugSnapshot, ...snapshot },
  })),

  setBreakpoints: (breakpoints) => set((state) => ({
    debugSnapshot: { ...state.debugSnapshot, breakpoints },
  })),

  clearSerial: () => set({ serialLogs: [], isSerialLineOpen: false }),

  setSerialPanelOpen: (open) => set({ serialPanelOpen: open }),

  setBaudRate: (baudRate) => set({ baudRate }),

  setShowCurrentFlow: (showCurrentFlow) => set({ showCurrentFlow }),

  setCurrentFlowDirection: (currentFlowDirection) => set({ currentFlowDirection }),

  setCustomHex: (customHex) => set({ customHex }),

  setExecutionMode: (executionMode) => set({ executionMode }),

  // ── MNA Solver Actions ──
  setCircuitState: (voltages, wireCurrents, currents, power, converged) => set({
    nodeVoltages: voltages,
    wireCurrents,
    branchCurrents: currents,
    componentPower: power,
    solverConverged: converged,
  }),

  setLiveMeter: (measurement) => set((state) => ({
    liveMeter: { ...state.liveMeter, ...measurement },
  })),

  toggleMeterProbe: (target) => set((state) => {
    const existing = state.meterProbes.find(
      (probe) => probe.nodeId === target.nodeId && probe.pinId === target.pinId,
    );
    if (existing) {
      return { meterProbes: state.meterProbes.filter((probe) => probe.id !== existing.id) };
    }

    const probe: CanvasProbe = {
      id: `meter_probe_${target.nodeId}_${target.pinId}`,
      nodeId: target.nodeId,
      pinId: target.pinId,
      label: state.meterProbes.length === 0 ? 'Red (+)' : 'Black (-)',
      channelIndex: state.meterProbes.length,
      color: state.meterProbes.length === 0 ? '#ef4444' : '#111827',
      mode: 'voltage',
      x: target.x,
      y: target.y,
    };
    return { meterProbes: [...state.meterProbes.slice(-1), probe] };
  }),

  clearMeterProbes: () => set({ meterProbes: [] }),

  appendOscilloscopeData: (nodeId, voltage) => set((state) => {
    const existing = state.oscilloscopeData[nodeId] || [];
    const updated = [...existing, voltage];
    // Keep only the last MAX_SCOPE_SAMPLES samples
    const trimmed = updated.length > MAX_SCOPE_SAMPLES
      ? updated.slice(updated.length - MAX_SCOPE_SAMPLES)
      : updated;
    return {
      oscilloscopeData: { ...state.oscilloscopeData, [nodeId]: trimmed },
    };
  }),

  appendLogicCapture: (frame) => set((state) => ({
    logicCapture: [...state.logicCapture, frame].slice(-MAX_LOGIC_FRAMES),
  })),

  setOscilloscopeSamplePeriod: (periodMs) => set({
    oscilloscopeSamplePeriodMs: Math.max(Number.EPSILON, periodMs),
  }),

  clearOscilloscopeData: () => set({ oscilloscopeData: {}, logicCapture: [], oscilloscopeSamplePeriodMs: 1 }),

  setOscilloscopePanelOpen: (open) => set({ oscilloscopePanelOpen: open }),
  setThermalHeatmapEnabled: (thermalHeatmapEnabled) => set({ thermalHeatmapEnabled }),
}));


