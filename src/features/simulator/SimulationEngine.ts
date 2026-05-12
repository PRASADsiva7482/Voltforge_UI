// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation Engine (Code-Driven Logic Interpreter)
// ═══════════════════════════════════════════════════════════════════════════

import { CanvasNode, Wire } from '../../types';

export type PinState = 'HIGH' | 'LOW' | 'INPUT' | 'OUTPUT' | 'PWM';

export interface SimulationCallbacks {
  onSerialOutput: (text: string, options?: { newline?: boolean }) => void;
  onBaudRateChange?: (baudRate: number) => void;
  onPinStateChange: (componentId: string, pinId: string, state: PinState, value?: number) => void;
  onError: (error: string) => void;
}

interface PinInfo {
  mode: 'INPUT' | 'OUTPUT' | 'PWM';
  state: PinState;
  value: number; // 0-255 for analogWrite, 0/1 for digital
}

/**
 * Interpreter for Arduino-style C++ code.
 * Maps digital/analog writes to canvas component states.
 * Supports: pinMode, digitalWrite, analogWrite, digitalRead,
 * Serial.println, delay (simulated), and basic variables.
 */
export class SimulationEngine {
  private isRunning = false;
  private intervalId: number | null = null;
  private callbacks: SimulationCallbacks;
  private pins: Record<string, PinInfo> = {};
  private setupStatements: string[] = [];
  private loopStatements: string[] = [];
  private globals: Record<string, number> = {};
  private tick = 0;
  private delayAccumulator = 0;
  private currentDelay = 0;
  private serialThrottle: Set<string> = new Set();
  private serialLineBuffer = '';
  // For toggling state with delay patterns (e.g., blink)
  private pinToggleState: Record<string, boolean> = {};

  constructor(callbacks: SimulationCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(code: string, nodes: CanvasNode[], wires: Wire[]) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick = 0;
    this.delayAccumulator = 0;
    this.currentDelay = 0;
    this.pins = {};
    this.globals = {};
    this.pinToggleState = {};
    this.serialLineBuffer = '';
    this.serialThrottle.clear();

    try {
      this.callbacks.onSerialOutput('> Starting compatibility interpreter...');
      await new Promise(resolve => setTimeout(resolve, 500));

      this.parseCode(code);

      this.callbacks.onSerialOutput('> Hardware emulator worker not enabled yet; using code-compatibility mode');
      await new Promise(resolve => setTimeout(resolve, 300));
      this.callbacks.onSerialOutput('> Compatibility CPU Started');
      this.callbacks.onSerialOutput('────────────────────────────────');

      // Execute setup()
      this.executeBlock(this.setupStatements, nodes, wires, true);
      this.updateDiagnosticProbes(nodes, wires);

      // Start execution loop
      this.intervalId = window.setInterval(() => {
        if (!this.isRunning) return;

        // Handle delay simulation
        if (this.currentDelay > 0) {
          this.delayAccumulator += 100;
          if (this.delayAccumulator >= this.currentDelay) {
            this.delayAccumulator = 0;
            this.currentDelay = 0;
          }
          return;
        }

        this.executeBlock(this.loopStatements, nodes, wires, false);
        this.updateDiagnosticProbes(nodes, wires);
        this.tick += 100;
      }, 100);

    } catch (err: any) {
      this.callbacks.onError(err.message || 'Simulation Error');
      this.stop();
    }
  }

  private parseCode(code: string) {
    // Extract global variables
    const varMatches = code.matchAll(/(?:int|const\s+int|byte|uint8_t|long|unsigned\s+long)\s+(\w+)\s*=\s*(\d+);/g);
    for (const match of varMatches) {
      this.globals[match[1]] = parseInt(match[2]);
    }

    // Extract #define constants
    const defineMatches = code.matchAll(/#define\s+(\w+)\s+(\d+)/g);
    for (const match of defineMatches) {
      this.globals[match[1]] = parseInt(match[2]);
    }

    // Extract setup() body
    const setupMatch = code.match(/void\s+setup\s*\(\s*\)\s*\{([\s\S]*?)\}/);
    if (setupMatch) {
      this.setupStatements = this.splitStatements(setupMatch[1]);
    }

    // Extract loop() body
    const loopMatch = code.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\}/);
    if (loopMatch) {
      this.loopStatements = this.splitStatements(loopMatch[1]);
    }
  }

  private splitStatements(block: string): string[] {
    return block
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('//'));
  }

  private executeBlock(statements: string[], nodes: CanvasNode[], wires: Wire[], isSetup: boolean) {
    for (const stmt of statements) {
      // pinMode(pin, mode)
      const pinMode = stmt.match(/pinMode\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
      if (pinMode) {
        const pin = this.resolveValue(pinMode[1]);
        const mode = pinMode[2] as 'INPUT' | 'OUTPUT';
        this.pins[pin] = { mode, state: 'LOW', value: 0 };
        continue;
      }

      // Serial.begin(baud)
      const serialBegin = stmt.match(/Serial\.begin\s*\(\s*(\d+)\s*\)/);
      if (serialBegin) {
        const baudRate = Number(serialBegin[1]);
        this.callbacks.onBaudRateChange?.(baudRate);
        this.callbacks.onSerialOutput(`> Serial initialized at ${baudRate} baud`);
        continue;
      }

      // digitalWrite(pin, state)
      const dw = stmt.match(/digitalWrite\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
      if (dw) {
        const pin = this.resolveValue(dw[1]);
        const state = dw[2] === 'HIGH' ? 'HIGH' : 'LOW';

        if (!this.pins[pin]) this.pins[pin] = { mode: 'OUTPUT', state: 'LOW', value: 0 };

        // Only propagate if state actually changed
        if (this.pins[pin].state !== state) {
          this.pins[pin].state = state;
          this.pins[pin].value = state === 'HIGH' ? 255 : 0;
          this.propagatePinState(pin, state, nodes, wires, state === 'HIGH' ? 255 : 0);
        }
        continue;
      }

      // analogWrite(pin, value) — PWM
      const aw = stmt.match(/analogWrite\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
      if (aw) {
        const pin = this.resolveValue(aw[1]);
        const value = Math.min(255, Math.max(0, parseInt(this.resolveValue(aw[2]))));

        if (!this.pins[pin]) this.pins[pin] = { mode: 'PWM', state: 'PWM', value: 0 };
        this.pins[pin].state = 'PWM';
        this.pins[pin].value = value;
        this.propagatePinState(pin, 'PWM', nodes, wires, value);
        continue;
      }
      
      // digitalRead(pin)
      const drAssign = stmt.match(/(\w+)\s*=\s*digitalRead\s*\(\s*(\w+)\s*\)/);
      if (drAssign) {
        const pin = this.resolveValue(drAssign[2]);
        const state = this.pins[pin]?.state === 'HIGH' ? 1 : 0;
        this.globals[drAssign[1]] = state;
        continue;
      }

      // Variable assignment: varName = expression (needs to happen after digitalRead check)
      const assign = stmt.match(/(\w+)\s*=\s*([^;]+)/);
      if (assign && this.globals[assign[1]] !== undefined && !assign[2].includes('digitalRead')) {
        const expr = assign[2].trim();
        // Simple expression evaluation
        const val = this.evaluateExpression(expr);
        if (!isNaN(val)) {
          this.globals[assign[1]] = val;
        }
      }

      // delay(ms) — simulate timing
      const delay = stmt.match(/delay\s*\(\s*(\w+)\s*\)/);
      if (delay && !isSetup) {
        const ms = parseInt(this.resolveValue(delay[1]));
        if (ms > 0) {
          this.currentDelay = ms;
          this.delayAccumulator = 0;
          // Toggle pin states for common blink patterns
          Object.keys(this.pins).forEach(pin => {
            if (this.pins[pin].mode === 'OUTPUT') {
              const currentState = this.pins[pin].state;
              const newState = currentState === 'HIGH' ? 'LOW' : 'HIGH';
              this.pinToggleState[pin] = !this.pinToggleState[pin];
            }
          });
        }
        return; // Stop processing further statements until delay is done
      }

      // Serial.print(...) / Serial.println(...)
      const serialPrint = stmt.match(/Serial\.(print|println)\s*\(\s*(.*?)\s*\)$/);
      if (serialPrint) {
        const method = serialPrint[1];
        const text = this.resolveSerialArgument(serialPrint[2]);
        const newline = method === 'println';

        // Throttle repeated messages
        const key = `${method}_${text}_${Math.floor(this.tick / 500)}`;
        if (!this.serialThrottle.has(key)) {
          this.serialThrottle.add(key);
          this.writeSerial(text, newline);
        }
        continue;
      }

      // (Variable assignment moved up to handle digitalRead)
    }
  }

  private evaluateExpression(expr: string): number {
    // Handle simple math: val + 1, val - 1, val * 2, etc.
    const parts = expr.match(/(\w+)\s*([+\-*/])\s*(\w+)/);
    if (parts) {
      const a = this.globals[parts[1]] ?? parseInt(parts[1]);
      const b = this.globals[parts[3]] ?? parseInt(parts[3]);
      switch (parts[2]) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b !== 0 ? Math.floor(a / b) : 0;
      }
    }
    // Single value
    const resolved = this.resolveValue(expr);
    return parseInt(resolved) || 0;
  }

  private resolveSerialArgument(argument: string): string {
    const raw = argument.trim();
    if (!raw) return '';

    const parts = raw.split(/\s*\+\s*/);
    if (parts.length > 1) {
      return parts.map((part) => this.resolveSerialArgument(part)).join('');
    }

    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    }

    if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;

    if (raw.startsWith('digitalRead')) {
      const match = raw.match(/digitalRead\s*\(\s*(\w+)\s*\)/);
      if (match) {
        const pin = this.resolveValue(match[1]);
        return this.pins[pin]?.state === 'HIGH' ? '1' : '0';
      }
    }

    if (raw.startsWith('analogRead')) {
      const match = raw.match(/analogRead\s*\(\s*(\w+)\s*\)/);
      if (match) {
        const pin = this.resolveValue(match[1]);
        const value = this.pins[pin]?.value ?? 0;
        return Math.round((value / 255) * 1023).toString();
      }
    }

    const value = this.evaluateExpression(raw);
    if (!Number.isNaN(value)) return value.toString();
    return raw;
  }

  private writeSerial(text: string, newline: boolean) {
    if (!newline) {
      this.serialLineBuffer += text;
      this.callbacks.onSerialOutput(text, { newline: false });
      return;
    }

    this.serialLineBuffer = '';
    this.callbacks.onSerialOutput(text, { newline: true });
  }

  private propagatePinState(pin: string, state: PinState, nodes: CanvasNode[], wires: Wire[], value = 0) {
    // Find MCU node
    const mcuNode = nodes.find(n =>
      n.type.startsWith('ARDUINO') || n.type.startsWith('ESP') || n.type.startsWith('RASPBERRY')
    );
    if (!mcuNode) return;

    // Find matching pin on MCU by name (D13, A0, etc.) or number
    const mcuPin = mcuNode.pins?.find(p =>
      p.name === `D${pin}` || p.name === pin || p.name === `A${pin}` ||
      p.name.includes(`/${pin}`) || p.id.includes(pin)
    );
    if (!mcuPin) return;

    const connectedPins = this.getConnectedPins(mcuNode.id, mcuPin.id, wires);
    connectedPins.forEach(pinRef => {
      if (pinRef.nodeId === mcuNode.id && pinRef.pinId === mcuPin.id) return;
      this.callbacks.onPinStateChange(pinRef.nodeId, pinRef.pinId, state, value);
    });
  }

  private updateDiagnosticProbes(nodes: CanvasNode[], wires: Wire[]) {
    const meters = nodes.filter(node => node.type === 'MULTIMETER');
    meters.forEach(meter => {
      const probePin = meter.pins?.find(pin => /v|vcc|\+|probe/i.test(`${pin.id} ${pin.name}`));
      const comPin = meter.pins?.find(pin => /com|gnd|ground|-/i.test(`${pin.id} ${pin.name}`));
      if (!probePin) return;

      const probeVoltage = this.voltageAtPin(meter.id, probePin.id, nodes, wires);
      const commonVoltage = comPin ? this.voltageAtPin(meter.id, comPin.id, nodes, wires) : 0;
      const voltage = Math.max(0, probeVoltage - commonVoltage);
      this.callbacks.onPinStateChange(meter.id, probePin.id, voltage > 0.05 ? 'HIGH' : 'LOW', voltage);
    });
  }

  private voltageAtPin(nodeId: string, pinId: string, nodes: CanvasNode[], wires: Wire[]): number {
    const connectedPins = this.getConnectedPins(nodeId, pinId, wires);

    for (const ref of connectedPins) {
      const node = nodes.find(item => item.id === ref.nodeId);
      const pin = node?.pins?.find(item => item.id === ref.pinId);
      if (!node || !pin) continue;

      const label = pin.name.toUpperCase();
      if (label.includes('GND') || label === 'COM') return 0;
      if (label === '3.3V' || label === '3V3') return 3.3;
      if (label === '5V' || label === 'VCC') return 5;
      if (label === 'VIN') return 7;

      if (node.type.startsWith('ARDUINO') || node.type.startsWith('ESP')) {
        const pinNumber = this.pinNumberFromBoardPin(pin);
        if (!pinNumber) continue;
        const pinInfo = this.pins[pinNumber];
        if (!pinInfo) continue;
        if (pinInfo.state === 'PWM') return (pinInfo.value / 255) * 5;
        if (pinInfo.state === 'HIGH') return 5;
      }
    }

    return 0;
  }

  private getConnectedPins(nodeId: string, pinId: string, wires: Wire[]) {
    const start = `${nodeId}:${pinId}`;
    const visited = new Set<string>([start]);
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const [currentNodeId, currentPinId] = current.split(':');
      wires.forEach(wire => {
        const a = `${wire.fromNodeId}:${wire.fromPinId}`;
        const b = `${wire.toNodeId}:${wire.toPinId}`;
        const next = a === current ? b : b === current ? a : null;
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      });
    }

    return Array.from(visited).map(key => {
      const [connectedNodeId, connectedPinId] = key.split(':');
      return { nodeId: connectedNodeId, pinId: connectedPinId };
    });
  }

  private pinNumberFromBoardPin(pin: { id: string; name: string }) {
    const match = `${pin.name} ${pin.id}`.match(/\bD?(\d{1,2})\b/i);
    return match ? match[1] : '';
  }

  private resolveValue(val: string): string {
    if (this.globals[val] !== undefined) return this.globals[val].toString();
    return val;
  }

  public setExternalPinState(pin: string, state: PinState) {
    if (!this.pins[pin]) {
      this.pins[pin] = { mode: 'INPUT', state: 'LOW', value: 0 };
    }
    this.pins[pin].state = state;
    this.pins[pin].value = state === 'HIGH' ? 1 : 0;
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
