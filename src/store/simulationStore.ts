import { create } from 'zustand';
import type { DebugSnapshot } from '../types/domain';

interface SerialWriteOptions {
  newline?: boolean;
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
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
  oscilloscopeData: Record<string, number[]>;
  oscilloscopePanelOpen: boolean;
  solverConverged: boolean;

  writeSerial: (text: string, options?: SerialWriteOptions) => void;
  setSimulating: (isSimulating: boolean) => void;
  sendSerialInput: (text: string) => void;
  drainSerialInput: () => string[];
  setDebugSnapshot: (snapshot: Partial<DebugSnapshot>) => void;
  setBreakpoints: (breakpoints: number[]) => void;
  clearSerial: () => void;
  setSerialPanelOpen: (open: boolean) => void;
  setBaudRate: (baudRate: number) => void;

  // ── MNA Solver Actions ──
  setCircuitState: (
    voltages: Record<string, number>,
    currents: Record<string, number>,
    power: Record<string, number>,
    converged: boolean
  ) => void;
  appendOscilloscopeData: (nodeId: string, voltage: number) => void;
  clearOscilloscopeData: () => void;
  setOscilloscopePanelOpen: (open: boolean) => void;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const MAX_SCOPE_SAMPLES = 2048;

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
  branchCurrents: {},
  componentPower: {},
  oscilloscopeData: {},
  oscilloscopePanelOpen: false,
  solverConverged: true,

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

  // ── MNA Solver Actions ──
  setCircuitState: (voltages, currents, power, converged) => set({
    nodeVoltages: voltages,
    branchCurrents: currents,
    componentPower: power,
    solverConverged: converged,
  }),

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

  clearOscilloscopeData: () => set({ oscilloscopeData: {} }),

  setOscilloscopePanelOpen: (open) => set({ oscilloscopePanelOpen: open }),
}));


