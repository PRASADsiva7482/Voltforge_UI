import { create } from 'zustand';

interface SerialWriteOptions {
  newline?: boolean;
}

interface SimulationState {
  serialLogs: string[];
  serialPanelOpen: boolean;
  baudRate: number;
  isSerialLineOpen: boolean;
  writeSerial: (text: string, options?: SerialWriteOptions) => void;
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

  clearSerial: () => set({ serialLogs: [], isSerialLineOpen: false }),

  setSerialPanelOpen: (open) => set({ serialPanelOpen: open }),

  setBaudRate: (baudRate) => set({ baudRate }),
}));
