import { create } from 'zustand';
import type { DebugSnapshot } from '../types/domain';
import type { CanvasProbe } from '../features/canvas/probeManager';
import type { LogicCaptureFrame } from '../features/simulator/logic/protocolAnalyzers';
import type { SimulationFidelityMode } from '../features/simulator/simulationModels';
import type { CurrentFlowQualityMode } from '../features/canvas/renderBudget';
import type { SolverDiagnosticsSnapshot } from '../features/simulator/solverDiagnostics';
import { normalizeScopeTimePerDivisionMs } from '../features/simulator/scopeCapture';
import {
  OscilloscopeCaptureAccumulator,
  type OscilloscopeCaptureInput,
} from './oscilloscopeCapture';

export type MeterMeasurementMode = 'VOLTAGE' | 'CURRENT' | 'RESISTANCE';
export type SolverResultConsumer = 'ai' | 'lab';

interface SerialWriteOptions {
  newline?: boolean;
}

export interface LiveMeterMeasurement {
  voltage: number;
  acVoltage: number;
  current_mA: number;
  resistance_ohm: number;
  resistanceUnsafe: boolean;
  positiveLabel: string;
  negativeLabel: string;
}

export interface OscilloscopeCaptureBatch extends OscilloscopeCaptureInput {}

export interface AvrWorkloadSnapshot {
  active: boolean;
  fidelityMode: SimulationFidelityMode;
  sliceBudgetMs: number;
  averageSliceMs: number;
  maximumSliceMs: number;
  maximumDeadlineOvershootMs: number;
  mainThreadUtilizationPercent: number;
  instructionsPerSecond: number;
  emulatedClockHz: number;
  pendingCycleLagMs: number;
  budgetLimited: boolean;
  hardLimitReached: boolean;
  backgroundStallCount: number;
}

export type { SolverDiagnosticsSnapshot } from '../features/simulator/solverDiagnostics';

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
  oscilloscopeTimePerDivMs: number;
  oscilloscopePanelOpen: boolean;
  thermalHeatmapEnabled: boolean;
  solverConverged: boolean;
  /** Monotonic physical time reported by the MNA worker, in seconds. */
  simulationTime: number;
  liveMeter: LiveMeterMeasurement;
  meterProbes: CanvasProbe[];
  meterMode: MeterMeasurementMode;

  // ── Simulation Fidelity & Emulation Mode ──
  showCurrentFlow: boolean;
  currentFlowDirection: 'conventional' | 'electron';
  currentFlowQualityMode: CurrentFlowQualityMode;
  customHex: string | null;
  executionMode: 'interpreter' | 'avr8js';
  fidelityMode: SimulationFidelityMode;
  resultDataConsumers: Record<SolverResultConsumer, boolean>;
  avrWorkload: AvrWorkloadSnapshot;
  /** Opt-in worker instrumentation state; null means no sample has arrived. */
  solverDiagnostics: SolverDiagnosticsSnapshot | null;
  solverDiagnosticsOpen: boolean;

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
  setCurrentFlowQualityMode: (mode: CurrentFlowQualityMode) => void;
  setCustomHex: (hex: string | null) => void;
  setExecutionMode: (mode: 'interpreter' | 'avr8js') => void;
  setFidelityMode: (mode: SimulationFidelityMode) => void;
  setResultDataConsumer: (consumer: SolverResultConsumer, enabled: boolean) => void;
  setAvrWorkload: (snapshot: Partial<AvrWorkloadSnapshot>) => void;
  resetAvrWorkload: () => void;
  setSolverDiagnosticsOpen: (open: boolean) => void;
  setSolverDiagnostics: (snapshot: SolverDiagnosticsSnapshot) => void;
  clearSolverDiagnostics: () => void;
  resetSimulationTime: () => void;

  // ── MNA Solver Actions ──
  setCircuitState: (
    voltages: Record<string, number>,
    wireCurrents: Record<string, number>,
    currents: Record<string, number>,
    power: Record<string, number>,
    converged: boolean,
    simulationTime?: number,
  ) => void;
  setLiveMeter: (measurement: Partial<LiveMeterMeasurement>) => void;
  setMeterMode: (mode: MeterMeasurementMode) => void;
  toggleMeterProbe: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
  clearMeterProbes: () => void;
  publishOscilloscopeBatch: (batch: OscilloscopeCaptureBatch) => void;
  setOscilloscopeTimePerDiv: (timePerDivMs: number) => void;
  clearOscilloscopeData: () => void;
  setOscilloscopePanelOpen: (open: boolean) => void;
  setThermalHeatmapEnabled: (enabled: boolean) => void;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const MAX_SCOPE_SAMPLES = 2048;
const MAX_LOGIC_FRAMES = 16384;

const idleAvrWorkload = (): AvrWorkloadSnapshot => ({
  active: false,
  fidelityMode: 'adaptive',
  sliceBudgetMs: 0,
  averageSliceMs: 0,
  maximumSliceMs: 0,
  maximumDeadlineOvershootMs: 0,
  mainThreadUtilizationPercent: 0,
  instructionsPerSecond: 0,
  emulatedClockHz: 0,
  pendingCycleLagMs: 0,
  budgetLimited: false,
  hardLimitReached: false,
  backgroundStallCount: 0,
});

const oscilloscopeCapture = new OscilloscopeCaptureAccumulator(
  MAX_SCOPE_SAMPLES,
  MAX_LOGIC_FRAMES,
);

function clearCaptureBuffers() {
  oscilloscopeCapture.clear();
}

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
  oscilloscopeTimePerDivMs: 1,
  oscilloscopePanelOpen: false,
  thermalHeatmapEnabled: false,
  solverConverged: true,
  simulationTime: 0,
  liveMeter: {
    voltage: 0,
    acVoltage: 0,
    current_mA: 0,
    resistance_ohm: Number.POSITIVE_INFINITY,
    resistanceUnsafe: false,
    positiveLabel: 'Probe (+)',
    negativeLabel: 'Probe (-)',
  },
  meterProbes: [],
  meterMode: 'VOLTAGE',

  // ── Simulation Fidelity & Emulation Mode Defaults ──
  // Current-flow particles are opt-in so a dense schematic stays readable;
  // wire-current delivery is opt-in as well so inactive overlays do not retain
  // a large derived map in the render store.
  showCurrentFlow: false,
  currentFlowDirection: 'conventional',
  currentFlowQualityMode: 'adaptive',
  customHex: null,
  executionMode: 'interpreter',
  fidelityMode: 'adaptive',
  resultDataConsumers: { ai: false, lab: false },
  avrWorkload: idleAvrWorkload(),
  solverDiagnostics: null,
  solverDiagnosticsOpen: false,

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

  setCurrentFlowQualityMode: (currentFlowQualityMode) => set({ currentFlowQualityMode }),

  setCustomHex: (customHex) => set({ customHex }),

  setExecutionMode: (executionMode) => set({
    executionMode,
    ...(executionMode === 'avr8js' ? {} : { avrWorkload: idleAvrWorkload() }),
  }),

  setFidelityMode: (fidelityMode) => set({ fidelityMode }),

  setResultDataConsumer: (consumer, enabled) => set((state) => ({
    resultDataConsumers: { ...state.resultDataConsumers, [consumer]: enabled },
  })),

  setAvrWorkload: (snapshot) => set((state) => ({
    avrWorkload: { ...state.avrWorkload, ...snapshot },
  })),

  resetAvrWorkload: () => set({ avrWorkload: idleAvrWorkload() }),

  setSolverDiagnosticsOpen: (solverDiagnosticsOpen) => set({ solverDiagnosticsOpen }),

  setSolverDiagnostics: (solverDiagnostics) => set({ solverDiagnostics }),

  clearSolverDiagnostics: () => set({ solverDiagnostics: null }),

  resetSimulationTime: () => set({ simulationTime: 0 }),

  // ── MNA Solver Actions ──
  setCircuitState: (voltages, wireCurrents, currents, power, converged, simulationTime) => set((state) => ({
    nodeVoltages: voltages,
    wireCurrents,
    branchCurrents: currents,
    componentPower: power,
    solverConverged: converged,
    // Result delivery can be deferred by the UI throttle. Never let a late
    // result move the user-visible physical clock backwards.
    simulationTime: typeof simulationTime === 'number' && Number.isFinite(simulationTime)
      ? Math.max(state.simulationTime, simulationTime)
      : state.simulationTime,
  })),

  setLiveMeter: (measurement) => set((state) => ({
    liveMeter: { ...state.liveMeter, ...measurement },
  })),

  setMeterMode: (meterMode) => set({ meterMode }),

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

  publishOscilloscopeBatch: (batch) => {
    const snapshot = oscilloscopeCapture.append(batch);
    if (snapshot) set(snapshot);
  },

  setOscilloscopeTimePerDiv: (timePerDivMs) => set((state) => {
    const nextTimePerDivMs = normalizeScopeTimePerDivisionMs(timePerDivMs);
    if (state.oscilloscopeTimePerDivMs === nextTimePerDivMs) return state;
    clearCaptureBuffers();
    return {
      oscilloscopeTimePerDivMs: nextTimePerDivMs,
      oscilloscopeData: {},
      logicCapture: [],
      oscilloscopeSamplePeriodMs: 1,
    };
  }),

  clearOscilloscopeData: () => {
    clearCaptureBuffers();
    set({ oscilloscopeData: {}, logicCapture: [], oscilloscopeSamplePeriodMs: 1 });
  },

  setOscilloscopePanelOpen: (open) => set({ oscilloscopePanelOpen: open }),
  setThermalHeatmapEnabled: (thermalHeatmapEnabled) => set({ thermalHeatmapEnabled }),
}));


