import { create } from 'zustand';
import type { DebugSnapshot } from '../types/domain';
import type { CanvasProbe } from '../features/canvas/probeManager';
import type { LogicCaptureFrame } from '../features/simulator/logic/protocolAnalyzers';
import type { SimulationFidelityMode } from '../features/simulator/simulationModels';
import type { CurrentFlowQualityMode } from '../features/canvas/renderBudget';
import type { SolverDiagnosticsSnapshot } from '../features/simulator/solverDiagnostics';
import type { PwmDiagnostics } from '../features/simulator/rp2040Pwm';
import type { Rp2040ExecutionSnapshot } from '../features/simulator/rp2040Telemetry';
import { normalizeScopeTimePerDivisionMs } from '../features/simulator/scopeCapture';
import {
  OscilloscopeCaptureAccumulator,
  type OscilloscopeCaptureInput,
} from './oscilloscopeCapture';

export type MeterMeasurementMode = 'VOLTAGE' | 'CURRENT' | 'RESISTANCE';
export type SolverResultConsumer = 'ai' | 'lab';

export type ExecutionPhase = 'idle' | 'preparing' | 'compiling' | 'starting' | 'running' | 'stopped' | 'compilation-failed' | 'runtime-error' | 'unavailable';
export interface ExecutionSession {
  id: string | null;
  projectId: string | null;
  boardType: string | null;
  phase: ExecutionPhase;
  diagnostic: string | null;
  firmwareSource: string | null;
}
export interface SerialEntry { text: string; kind: 'output' | 'diagnostic' | 'input'; timestamp: number; runId: string | null }
interface SerialWriteOptions {
  newline?: boolean;
  kind?: SerialEntry['kind'];
  runId?: string;
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
export type { PwmDiagnostics } from '../features/simulator/rp2040Pwm';
export type {
  Rp2040ExecutionSnapshot,
  Rp2040CoreSnapshot,
  CoreLifecycleState,
  Rp2040FifoTelemetry,
  Rp2040SpinlockTelemetry,
  Rp2040BootRomTelemetry,
} from '../features/simulator/rp2040Telemetry';

interface SimulationState {
  restartRequired: boolean;
  setRestartRequired: (required: boolean) => void;
  execution: ExecutionSession;
  serialEntries: SerialEntry[];
  beginExecution: (projectId: string, boardType: string, firmwareSource: string) => string | null;
  transitionExecution: (id: string, phase: ExecutionPhase, diagnostic?: string | null) => void;
  resetExecution: () => void;
  setExecutionDiagnostic: (diagnostic: string | null) => void;
  isSimulating: boolean;
  serialLogs: string[];
  serialPanelOpen: boolean;
  baudRate: number;
  activeUartPort: 0 | 1;
  isSerialLineOpen: boolean;
  serialInputQueue: string[];
  debugSnapshot: DebugSnapshot;

  // ── MNA Solver State ──
  nodeVoltages: Record<string, number>;
  /** Solved current assigned to each physical wire for the flow overlay. */
  wireCurrents: Record<string, number>;
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
  componentApparentPower: Record<string, number>;
  oscilloscopeData: Record<string, number[]>;
  logicCapture: LogicCaptureFrame[];
  oscilloscopeSamplePeriodMs: number;
  oscilloscopeTimePerDivMs: number;
  oscilloscopePanelOpen: boolean;
  oscilloscopeMode: 'oscilloscope' | 'logic_analyzer' | 'dual';
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
  pwmDiagnostics: PwmDiagnostics | null;
  pwmInspectorOpen: boolean;

  // ── RP2040 CPU Telemetry & Observability State ──
  expectedGenerationId: number;
  lastSequenceId: number;
  rp2040Snapshot: Rp2040ExecutionSnapshot | null;
  rp2040InspectorOpen: boolean;

  writeSerial: (text: string, options?: SerialWriteOptions) => void;
  setSimulating: (isSimulating: boolean) => void;
  sendSerialInput: (text: string) => void;
  drainSerialInput: () => string[];
  setDebugSnapshot: (snapshot: Partial<DebugSnapshot>) => void;
  setBreakpoints: (breakpoints: number[]) => void;
  clearSerial: () => void;
  setSerialPanelOpen: (open: boolean) => void;
  setBaudRate: (baudRate: number) => void;
  setActiveUartPort: (port: 0 | 1) => void;
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
  setPwmInspectorOpen: (open: boolean) => void;
  setPwmDiagnostics: (diagnostics: PwmDiagnostics | null) => void;
  clearPwmDiagnostics: () => void;
  setRp2040Snapshot: (snapshot: Rp2040ExecutionSnapshot) => boolean;
  invalidateTelemetry: (newExpectedGen: number) => void;
  setRp2040InspectorOpen: (open: boolean) => void;
  toggleRp2040Inspector: () => void;
  resetSimulationTime: () => void;

  // ── MNA Solver Actions ──
  setCircuitState: (
    voltages: Record<string, number>,
    wireCurrents: Record<string, number>,
    currents: Record<string, number>,
    power: Record<string, number>,
    converged: boolean,
    simulationTime?: number,
    apparentPower?: Record<string, number>,
  ) => void;
  setLiveMeter: (measurement: Partial<LiveMeterMeasurement>) => void;
  setMeterMode: (mode: MeterMeasurementMode) => void;
  toggleMeterProbe: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
  clearMeterProbes: () => void;
  publishOscilloscopeBatch: (batch: OscilloscopeCaptureBatch) => void;
  setOscilloscopeTimePerDiv: (timePerDivMs: number) => void;
  clearOscilloscopeData: () => void;
  setOscilloscopePanelOpen: (open: boolean) => void;
  setOscilloscopeMode: (mode: 'oscilloscope' | 'logic_analyzer' | 'dual') => void;
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

function getInitialFidelityMode(): SimulationFidelityMode {
  if (typeof window === 'undefined' || !window.localStorage) return 'adaptive';
  try {
    const pref = window.localStorage.getItem('vf-pref-fidelity');
    if (pref === 'full-fidelity' || pref === 'high') return 'full-fidelity';
    if (pref === 'adaptive') return 'adaptive';
  } catch {}
  return 'adaptive';
}

export const useSimulationStore = create<SimulationState>((set) => ({
  restartRequired: false,
  setRestartRequired: restartRequired => set({ restartRequired }),
  execution: { id: null, projectId: null, boardType: null, phase: 'idle', diagnostic: null, firmwareSource: null },
  serialEntries: [],
  beginExecution: (projectId, boardType, firmwareSource) => {
    let id: string | null = null;
    set(state => {
      if (['preparing', 'compiling', 'starting', 'running'].includes(state.execution.phase)) return state;
      id = crypto.randomUUID();
      return { execution: { id, projectId, boardType, firmwareSource, phase: 'preparing', diagnostic: null }, isSimulating: false, restartRequired: false,
        serialLogs: [], serialEntries: [], isSerialLineOpen: false, serialInputQueue: [], baudRate: 9600, serialPanelOpen: true };
    });
    return id;
  },
  transitionExecution: (id, phase, diagnostic = null) => set(state => state.execution.id !== id ? state : ({
    execution: { ...state.execution, phase, diagnostic }, isSimulating: phase === 'running',
    ...(['stopped', 'runtime-error', 'compilation-failed', 'unavailable'].includes(phase) ? { serialInputQueue: [] } : {}),
  })),
  resetExecution: () => set({ execution: { id: null, projectId: null, boardType: null, firmwareSource: null, phase: 'idle', diagnostic: null }, isSimulating: false }),
  setExecutionDiagnostic: diagnostic => set(state => ({ execution: { ...state.execution, diagnostic } })),
  isSimulating: false,
  serialLogs: [],
  serialPanelOpen: false,
  baudRate: 9600,
  activeUartPort: 0,
  isSerialLineOpen: false,
  serialInputQueue: [],
  debugSnapshot: { currentLine: null, variables: {}, pins: {}, isPaused: false, breakpoints: [] },

  // ── MNA Solver State Defaults ──
  nodeVoltages: {},
  wireCurrents: {},
  branchCurrents: {},
  componentPower: {},
  componentApparentPower: {},
  oscilloscopeData: {},
  logicCapture: [],
  oscilloscopeSamplePeriodMs: 1,
  oscilloscopeTimePerDivMs: 1,
  oscilloscopePanelOpen: false,
  oscilloscopeMode: 'oscilloscope',
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
  fidelityMode: getInitialFidelityMode(),
  resultDataConsumers: { ai: false, lab: false },
  avrWorkload: idleAvrWorkload(),
  solverDiagnostics: null,
  solverDiagnosticsOpen: false,
  pwmDiagnostics: null,
  pwmInspectorOpen: false,
  expectedGenerationId: 1,
  lastSequenceId: 0,
  rp2040Snapshot: null,
  rp2040InspectorOpen: false,

  setSimulating: (isSimulating) => set(state => ({ isSimulating, execution: { ...state.execution,
    phase: isSimulating ? 'running' : state.execution.phase === 'running' ? 'stopped' : state.execution.phase } })),

  writeSerial: (text, options) => {
    const newline = options?.newline ?? true;
    set((state) => {
      if (options?.runId && options.runId !== state.execution.id) return state;
      const logs = [...state.serialLogs];
      const entries = [...state.serialEntries];
      const incoming = (text ?? '').slice(-16000);
      const kind = options?.kind ?? 'diagnostic';

      if (state.isSerialLineOpen && logs.length > 0 && entries.at(-1)?.kind === kind) {
        logs[logs.length - 1] = `${logs[logs.length - 1]}${incoming}`.slice(-16000);
        entries[entries.length - 1] = { ...entries[entries.length - 1], text: logs[logs.length - 1] };
      } else {
        logs.push(incoming);
        entries.push({ text: incoming, kind, timestamp: Date.now(), runId: state.execution.id });
      }

      return {
        serialLogs: logs.slice(-300),
        serialEntries: entries.slice(-300),
        isSerialLineOpen: !newline,
      };
    });
  },

  sendSerialInput: (text) => set((state) => !state.isSimulating ? state : ({
    serialInputQueue: [...state.serialInputQueue, text],
    serialLogs: [...state.serialLogs, `> ${text}`].slice(-300),
    serialEntries: [...state.serialEntries, { text: `> ${text}`, kind: 'input' as const, timestamp: Date.now(), runId: state.execution.id }].slice(-300),
    isSerialLineOpen: false,
  })),

  drainSerialInput: () => {
    let pending: string[] = [];
    set((state) => {
      // AVR polls each frame, even when no serial input has arrived.
      if (state.serialInputQueue.length === 0) return state;
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

  clearSerial: () => set({ serialLogs: [], serialEntries: [], isSerialLineOpen: false }),

  setSerialPanelOpen: (open) => set({ serialPanelOpen: open }),

  setBaudRate: (baudRate) => set({ baudRate }),
  setActiveUartPort: (activeUartPort) => set({ activeUartPort }),

  setShowCurrentFlow: (showCurrentFlow) => set({ showCurrentFlow }),

  setCurrentFlowDirection: (currentFlowDirection) => set({ currentFlowDirection }),

  setCurrentFlowQualityMode: (currentFlowQualityMode) => set({ currentFlowQualityMode }),

  setCustomHex: (customHex) => set({ customHex }),

  setExecutionMode: (executionMode) => set({
    executionMode,
    ...(executionMode === 'avr8js' ? {} : { avrWorkload: idleAvrWorkload() }),
  }),

  setFidelityMode: (fidelityMode) => {
    try {
      window?.localStorage?.setItem('vf-pref-fidelity', fidelityMode);
    } catch {}
    set({ fidelityMode });
  },

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
  setPwmInspectorOpen: (pwmInspectorOpen) => set({ pwmInspectorOpen }),
  setPwmDiagnostics: (pwmDiagnostics) => set({ pwmDiagnostics }),
  clearPwmDiagnostics: () => set({ pwmDiagnostics: null }),

  setRp2040Snapshot: (snapshot) => {
    let accepted = false;
    set((state) => {
      // 1. Generation Validation: snapshot.generationId === expectedGenerationId
      // Rejects older generations (<) and future/unauthorized generations (>)
      if (snapshot.generationId !== state.expectedGenerationId) {
        return state;
      }
      // 2. Sequence Validation: sequenceId > lastSequenceId within current generation
      // Rejects duplicate (==) and out-of-order (<) sequence IDs
      if (snapshot.sequenceId <= state.lastSequenceId) {
        return state;
      }
      accepted = true;
      return {
        rp2040Snapshot: snapshot,
        lastSequenceId: snapshot.sequenceId,
      };
    });
    return accepted;
  },

  invalidateTelemetry: (newExpectedGen) => set({
    expectedGenerationId: newExpectedGen,
    lastSequenceId: 0,
    rp2040Snapshot: null,
  }),

  setRp2040InspectorOpen: (rp2040InspectorOpen) => set({ rp2040InspectorOpen }),

  toggleRp2040Inspector: () => set((state) => ({ rp2040InspectorOpen: !state.rp2040InspectorOpen })),

  resetSimulationTime: () => set({ simulationTime: 0 }),

  // ── MNA Solver Actions ──
  setCircuitState: (voltages, wireCurrents, currents, power, converged, simulationTime, apparentPower) => set((state) => ({
    nodeVoltages: voltages,
    wireCurrents,
    branchCurrents: currents,
    componentPower: power,
    componentApparentPower: apparentPower ?? state.componentApparentPower,
    solverConverged: converged,
    // Result delivery can be deferred by the UI throttle. Never let a late
    // result move the user-visible physical clock backwards.
    simulationTime: typeof simulationTime === 'number' && Number.isFinite(simulationTime)
      ? Math.max(state.simulationTime, simulationTime)
      : state.simulationTime,
  })),

  setLiveMeter: (measurement) => set((state) => {
    if (Object.entries(measurement).every(([key, value]) =>
      Object.is(state.liveMeter[key as keyof LiveMeterMeasurement], value),
    )) return state;
    return { liveMeter: { ...state.liveMeter, ...measurement } };
  }),

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
  setOscilloscopeMode: (oscilloscopeMode) => set({ oscilloscopeMode }),
  setThermalHeatmapEnabled: (thermalHeatmapEnabled) => set({ thermalHeatmapEnabled }),
}));


