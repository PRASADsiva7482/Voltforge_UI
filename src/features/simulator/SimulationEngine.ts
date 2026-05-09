// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation Engine (Code-Driven Logic Interpreter)
// ═══════════════════════════════════════════════════════════════════════════

import { CanvasNode, Wire } from '../../types';

export type PinState = 'HIGH' | 'LOW' | 'INPUT' | 'OUTPUT' | 'PWM';

export interface SimulationCallbacks {
  onSerialOutput: (text: string) => void;
  onPinStateChange: (componentId: string, pinId: string, state: PinState, value?: number) => void;
  onError: (error: string) => void;
}

/**
 * This interpreter parses Arduino-style C++ code and executes logic
 * by mapping digital/analog writes to canvas component states.
 */
export class SimulationEngine {
  private isRunning = false;
  private intervalId: number | null = null;
  private callbacks: SimulationCallbacks;
  private pins: Record<string, { mode: 'INPUT' | 'OUTPUT' | 'PWM'; state: PinState; value: number }> = {};
  private loopFunction: string = '';
  private setupFunction: string = '';
  private globals: Record<string, number> = {};

  constructor(callbacks: SimulationCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(code: string, nodes: CanvasNode[], wires: Wire[]) {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.callbacks.onSerialOutput('> Compiling firmware...');
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Basic Parser: Extract setup() and loop()
      this.parseCode(code);
      
      this.callbacks.onSerialOutput('> Uploading to virtual hardware...');
      await new Promise(resolve => setTimeout(resolve, 400));
      this.callbacks.onSerialOutput('> CPU Started');
      this.callbacks.onSerialOutput('----------------------------------------');

      // Execute setup()
      this.executeSetup();

      // Start execution loop
      let tick = 0;
      this.intervalId = window.setInterval(() => {
        if (!this.isRunning) return;
        
        this.executeLoop(nodes, wires);
        tick += 100; // simplified tick
      }, 100);

    } catch (err: any) {
      this.callbacks.onError(err.message || 'Simulation Error');
      this.stop();
    }
  }

  private parseCode(code: string) {
    // Very naive regex-based parser for simulation purposes
    const setupMatch = code.match(/void\s+setup\s*\(\s*\)\s*\{([\s\S]*?)\}/);
    const loopMatch = code.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\}/);

    this.setupFunction = setupMatch ? setupMatch[1] : '';
    this.loopFunction = loopMatch ? loopMatch[1] : '';

    // Extract simple variable definitions (e.g., int led = 13;)
    const varMatches = code.matchAll(/(?:int|const\s+int)\s+(\w+)\s*=\s*(\d+);/g);
    for (const match of varMatches) {
      this.globals[match[1]] = parseInt(match[2]);
    }
  }

  private executeSetup() {
    // Process pinMode calls
    const pinModes = this.setupFunction.matchAll(/pinMode\s*\(\s*(\d+|\w+)\s*,\s*(\w+)\s*\);/g);
    for (const match of pinModes) {
      const pin = this.resolveValue(match[1]);
      const mode = match[2] as 'INPUT' | 'OUTPUT';
      this.pins[pin] = { mode, state: 'LOW', value: 0 };
    }
  }

  private executeLoop(nodes: CanvasNode[], wires: Wire[]) {
    // Process digitalWrite calls
    const digitWrites = this.loopFunction.matchAll(/digitalWrite\s*\(\s*(\d+|\w+)\s*,\s*(\w+)\s*\);/g);
    for (const match of digitWrites) {
      const pin = this.resolveValue(match[1]);
      const state = match[2] as PinState;
      
      if (this.pins[pin]?.state !== state) {
        if (!this.pins[pin]) this.pins[pin] = { mode: 'OUTPUT', state: 'LOW', value: 0 };
        this.pins[pin].state = state;
        this.propagatePinState(pin, state, nodes, wires);
      }
    }

    // Process Serial.println
    const serialPrints = this.loopFunction.matchAll(/Serial\.println\s*\(\s*"(.*?)"\s*\);/g);
    for (const match of serialPrints) {
      // In a real loop we wouldn't print every tick if it's constant, 
      // but for simulation logic we'll limit it.
      if (Math.random() > 0.9) this.callbacks.onSerialOutput(match[1]);
    }
  }

  private propagatePinState(pin: string, state: PinState, nodes: CanvasNode[], wires: Wire[]) {
    // 1. Find the MCU node (the one with the pins like D13, 13, etc)
    const mcuNode = nodes.find(n => n.type.startsWith('ARDUINO') || n.type.startsWith('ESP'));
    if (!mcuNode) return;

    // 2. Find wires connected to this pin on the MCU
    const connectedWires = wires.filter(w => 
      (w.fromNodeId === mcuNode.id && (w.fromPinId === pin || w.fromPinId === 'D' + pin)) ||
      (w.toNodeId === mcuNode.id && (w.toPinId === pin || w.toPinId === 'D' + pin))
    );

    // 3. For each wire, notify the connected component
    connectedWires.forEach(wire => {
      const targetNodeId = wire.fromNodeId === mcuNode.id ? wire.toNodeId : wire.fromNodeId;
      const targetPinId = wire.fromNodeId === mcuNode.id ? wire.toPinId : wire.fromPinId;
      
      this.callbacks.onPinStateChange(targetNodeId, targetPinId, state);
    });
  }

  private resolveValue(val: string): string {
    if (this.globals[val] !== undefined) return this.globals[val].toString();
    return val;
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
