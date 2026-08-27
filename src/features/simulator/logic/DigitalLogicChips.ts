// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — 74xx & CD4000 Digital Logic IC Library
// ═══════════════════════════════════════════════════════════════════════════

import type { IComponentLogic } from './LogicRegistry';
import type { PinState } from '../SimulationEngine';
import { useCanvasStore } from '../../../store/canvasStore';

/**
 * 74HC595: 8-Bit Serial-In Parallel-Out Shift Register with Storage Register
 */
export class ShiftRegister595Logic implements IComponentLogic {
  private shiftRegisters: Map<string, number> = new Map(); // 8-bit internal shift register
  private storageRegisters: Map<string, number> = new Map(); // 8-bit output latch
  private prevClk: Map<string, boolean> = new Map();
  private prevLatch: Map<string, boolean> = new Map();
  private serState: Map<string, boolean> = new Map();

  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes, wires } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinName = (pin?.name || pinId).toUpperCase();
    const isHigh = state === 'HIGH';

    let shift = this.shiftRegisters.get(componentId) ?? 0;
    let storage = this.storageRegisters.get(componentId) ?? 0;
    let prevC = this.prevClk.get(componentId) ?? false;
    let prevL = this.prevLatch.get(componentId) ?? false;
    let ser = this.serState.get(componentId) ?? false;

    if (pinName.includes('SER') || pinName.includes('DS') || pinName === 'DATA') {
      ser = isHigh;
      this.serState.set(componentId, ser);
    } else if (pinName.includes('SRCLK') || pinName.includes('SHCP') || pinName.includes('CLK') || pinName === 'SR_CP') {
      // Rising edge of shift clock: shift SER into MSB/LSB
      if (!prevC && isHigh) {
        shift = ((shift << 1) | (ser ? 1 : 0)) & 0xFF;
        this.shiftRegisters.set(componentId, shift);
      }
      this.prevClk.set(componentId, isHigh);
    } else if (pinName.includes('RCLK') || pinName.includes('STCP') || pinName.includes('LATCH') || pinName === 'ST_CP') {
      // Rising edge of storage register clock: transfer shift reg to output latch
      if (!prevL && isHigh) {
        storage = shift;
        this.storageRegisters.set(componentId, storage);

        // Update node properties with parallel output states QA-QH
        const outputs: Record<string, boolean> = {};
        for (let i = 0; i < 8; i++) {
          const pinChar = String.fromCharCode(65 + i); // 'A', 'B', ... 'H'
          const bitVal = Boolean((storage >> (7 - i)) & 1);
          outputs[`out_${pinChar}`] = bitVal;
          outputs[`Q${pinChar}`] = bitVal;
        }

        updateNode(componentId, {
          properties: {
            ...node.properties,
            shiftValue: storage,
            hexDisplay: `0x${storage.toString(16).toUpperCase().padStart(2, '0')}`,
            binaryDisplay: storage.toString(2).padStart(8, '0'),
            ...outputs,
          }
        });

        // Propagate QA-QH states to connected components (e.g. LEDs, 7-seg)
        this.propagateOutputs(componentId, storage, node, wires);
      }
      this.prevLatch.set(componentId, isHigh);
    } else if (pinName.includes('SRCLR') || pinName.includes('MR')) {
      // Active LOW shift register clear
      if (!isHigh) {
        shift = 0;
        this.shiftRegisters.set(componentId, 0);
      }
    }
  }

  private propagateOutputs(componentId: string, storageVal: number, node: any, wires: any[]) {
    const { updateNode, nodes } = useCanvasStore.getState();

    for (let i = 0; i < 8; i++) {
      const pinChar = String.fromCharCode(65 + i);
      const bitVal = Boolean((storageVal >> (7 - i)) & 1);
      const outPin = node.pins?.find((p: any) => p.name === `Q${pinChar}` || p.name === pinChar || p.id === `pin_Q${pinChar}`);

      if (outPin) {
        const connectedWires = wires.filter(w =>
          (w.fromNodeId === componentId && w.fromPinId === outPin.id) ||
          (w.toNodeId === componentId && w.toPinId === outPin.id)
        );

        connectedWires.forEach(w => {
          const targetNodeId = w.fromNodeId === componentId ? w.toNodeId : w.fromNodeId;
          const targetNode = nodes.find(n => n.id === targetNodeId);
          if (targetNode) {
            if (targetNode.type.includes('LED')) {
              updateNode(targetNodeId, {
                properties: { ...targetNode.properties, isLit: bitVal }
              });
            }
          }
        });
      }
    }
  }
}

/**
 * 74HC165: 8-Bit Parallel-In Serial-Out Shift Register
 */
export class ShiftRegister165Logic implements IComponentLogic {
  private shiftRegister: Map<string, number> = new Map();
  private prevClk: Map<string, boolean> = new Map();
  private parallelInputs: Map<string, number> = new Map();

  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    if (pinId === '__power_reset__') {
      this.shiftRegister.delete(componentId);
      this.prevClk.delete(componentId);
      this.parallelInputs.delete(componentId);
      return;
    }
    if (node.properties?.powered !== true) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinName = (pin?.name || pinId).toUpperCase();
    const isHigh = state === 'HIGH';

    let reg = this.shiftRegister.get(componentId) ?? 0;
    let prevC = this.prevClk.get(componentId) ?? false;
    let inputs = this.parallelInputs.get(componentId) ?? 0;

    // Parallel data pins D0-D7
    for (let i = 0; i < 8; i++) {
      if (pinName === `D${i}` || pinName === `P${i}`) {
        if (isHigh) inputs |= (1 << i);
        else inputs &= ~(1 << i);
        this.parallelInputs.set(componentId, inputs);
      }
    }

    if (pinName.includes('PL') || pinName.includes('SH_LD') || pinName.includes('LOAD')) {
      // Active LOW asynchronous parallel load
      if (!isHigh) {
        reg = inputs;
        this.shiftRegister.set(componentId, reg);
      }
    } else if (pinName.includes('CLK') || pinName.includes('CP')) {
      // Rising edge clock shift
      if (!prevC && isHigh) {
        reg = (reg << 1) & 0xFF;
        this.shiftRegister.set(componentId, reg);
      }
      this.prevClk.set(componentId, isHigh);
    }

    const serialOut = Boolean((reg >> 7) & 1);
    updateNode(componentId, {
      properties: {
        ...node.properties,
        shiftValue: reg,
        serialOut,
        serialOutInverted: !serialOut,
      }
    });
  }
}

/**
 * 74HC138: 3-to-8 Line Inverting Decoder/Demultiplexer
 */
export class Decoder138Logic implements IComponentLogic {
  private address: Map<string, number> = new Map();
  private enables: Map<string, { e1: boolean; e2: boolean; e3: boolean }> = new Map();

  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    if (pinId === '__power_reset__') {
      this.address.delete(componentId);
      this.enables.delete(componentId);
      return;
    }
    if (node.properties?.powered !== true) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinName = (pin?.name || pinId).toUpperCase();
    const isHigh = state === 'HIGH';

    let addr = this.address.get(componentId) ?? 0;
    let en = this.enables.get(componentId) ?? { e1: false, e2: false, e3: true };

    if (pinName === 'A0' || pinName === 'A') {
      addr = (addr & ~1) | (isHigh ? 1 : 0);
    } else if (pinName === 'A1' || pinName === 'B') {
      addr = (addr & ~2) | (isHigh ? 2 : 0);
    } else if (pinName === 'A2' || pinName === 'C') {
      addr = (addr & ~4) | (isHigh ? 4 : 0);
    } else if (pinName === 'E1' || pinName === 'E1_BAR') {
      en.e1 = isHigh;
    } else if (pinName === 'E2' || pinName === 'E2_BAR') {
      en.e2 = isHigh;
    } else if (pinName === 'E3') {
      en.e3 = isHigh;
    }

    this.address.set(componentId, addr);
    this.enables.set(componentId, en);

    // Enabled when E1=LOW, E2=LOW, E3=HIGH
    const isEnabled = !en.e1 && !en.e2 && en.e3;
    const outputs: Record<string, boolean> = {};

    for (let i = 0; i < 8; i++) {
      // 74HC138 outputs are active LOW
      outputs[`Y${i}`] = isEnabled ? (addr !== i) : true;
    }

    updateNode(componentId, {
      properties: {
        ...node.properties,
        activeChannel: isEnabled ? addr : -1,
        ...outputs,
      }
    });
  }
}

/**
 * 74HC151: 8-to-1 Data Selector/Multiplexer
 */
export class Multiplexer151Logic implements IComponentLogic {
  private dataInputs: Map<string, number> = new Map();
  private select: Map<string, number> = new Map();
  private enableBar: Map<string, boolean> = new Map();

  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    if (pinId === '__power_reset__') {
      this.dataInputs.delete(componentId);
      this.select.delete(componentId);
      this.enableBar.delete(componentId);
      return;
    }
    if (node.properties?.powered !== true) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinName = (pin?.name || pinId).toUpperCase();
    const isHigh = state === 'HIGH';

    let data = this.dataInputs.get(componentId) ?? 0;
    let sel = this.select.get(componentId) ?? 0;
    let enBar = this.enableBar.get(componentId) ?? false;

    // Data inputs D0-D7
    for (let i = 0; i < 8; i++) {
      if (pinName === `D${i}` || pinName === `I${i}`) {
        if (isHigh) data |= (1 << i);
        else data &= ~(1 << i);
      }
    }

    // Select pins A, B, C
    if (pinName === 'A' || pinName === 'S0') {
      sel = (sel & ~1) | (isHigh ? 1 : 0);
    } else if (pinName === 'B' || pinName === 'S1') {
      sel = (sel & ~2) | (isHigh ? 2 : 0);
    } else if (pinName === 'C' || pinName === 'S2') {
      sel = (sel & ~4) | (isHigh ? 4 : 0);
    } else if (pinName === 'E_BAR' || pinName === 'STROBE' || pinName === 'E') {
      enBar = isHigh;
    }

    this.dataInputs.set(componentId, data);
    this.select.set(componentId, sel);
    this.enableBar.set(componentId, enBar);

    // If E_BAR is HIGH, output Y is LOW, W is HIGH
    let y = false;
    if (!enBar) {
      y = Boolean((data >> sel) & 1);
    }
    const w = !y;

    updateNode(componentId, {
      properties: {
        ...node.properties,
        selectedInput: sel,
        outputY: y,
        outputW: w,
      }
    });
  }
}

/**
 * CD4017: 5-Stage Johnson Decade Counter with 10 Decoded Outputs
 */
export class DecadeCounter4017Logic implements IComponentLogic {
  private count: Map<string, number> = new Map();
  private prevClk: Map<string, boolean> = new Map();

  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes, wires } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    if (pinId === '__power_reset__') {
      this.count.delete(componentId);
      this.prevClk.delete(componentId);
      return;
    }
    if (node.properties?.powered !== true) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinName = (pin?.name || pinId).toUpperCase();
    const isHigh = state === 'HIGH';

    let count = this.count.get(componentId) ?? 0;
    let prevC = this.prevClk.get(componentId) ?? false;

    if (pinName.includes('RESET') || pinName === 'MR') {
      if (isHigh) {
        count = 0;
        this.count.set(componentId, 0);
      }
    } else if (pinName.includes('CLK') || pinName === 'CP0') {
      // Clock input: increment on rising edge
      if (!prevC && isHigh) {
        count = (count + 1) % 10;
        this.count.set(componentId, count);
      }
      this.prevClk.set(componentId, isHigh);
    }

    const outputs: Record<string, boolean> = {};
    for (let i = 0; i < 10; i++) {
      outputs[`Q${i}`] = count === i;
    }
    // Carry out is HIGH for counts 0-4, LOW for 5-9
    const carryOut = count < 5;

    updateNode(componentId, {
      properties: {
        ...node.properties,
        currentCount: count,
        carryOut,
        ...outputs,
      }
    });

    // Propagate output Q0-Q9 to connected LEDs
    this.propagateOutputs(componentId, count, node, wires);
  }

  private propagateOutputs(componentId: string, activeIndex: number, node: any, wires: any[]) {
    const { updateNode, nodes } = useCanvasStore.getState();

    for (let i = 0; i < 10; i++) {
      const pinName = `Q${i}`;
      const isHigh = i === activeIndex;
      const outPin = node.pins?.find((p: any) => p.name === pinName || p.id === `pin_Q${i}`);

      if (outPin) {
        const connectedWires = wires.filter(w =>
          (w.fromNodeId === componentId && w.fromPinId === outPin.id) ||
          (w.toNodeId === componentId && w.toPinId === outPin.id)
        );

        connectedWires.forEach(w => {
          const targetNodeId = w.fromNodeId === componentId ? w.toNodeId : w.fromNodeId;
          const targetNode = nodes.find(n => n.id === targetNodeId);
          if (targetNode && targetNode.type.includes('LED')) {
            updateNode(targetNodeId, {
              properties: { ...targetNode.properties, isLit: isHigh }
            });
          }
        });
      }
    }
  }
}
