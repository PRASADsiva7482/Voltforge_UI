import { create } from 'zustand';
import type { DebugSnapshot } from '../types';

interface SerialWriteOptions {
  newline?: boolean;
}

interface SimulationState {
  serialLogs: string[];
  serialPanelOpen: boolean;
  baudRate: number;
  isSerialLineOpen: boolean;
  serialInputQueue: string[];
  debugSnapshot: DebugSnapshot;
  writeSerial: (text: string, options?: SerialWriteOptions) => void;
  sendSerialInput: (text: string) => void;
  drainSerialInput: () => string[];
  setDebugSnapshot: (snapshot: Partial<DebugSnapshot>) => void;
  setBreakpoints: (breakpoints: number[]) => void;
  clearSerial: () => void;
  setSerialPanelOpen: (open: boolean) => void;
  setBaudRate: (baudRate: number) => void;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export const useSimulationStore = create<SimulationState>((set) => ({
  serialLogs: [],
  serialPanelOpen: false,
  baudRate: 9600,
  isSerialLineOpen: false,
  serialInputQueue: [],
  debugSnapshot: { currentLine: null, variables: {}, pins: {}, isPaused: false, breakpoints: [] },

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
}));
