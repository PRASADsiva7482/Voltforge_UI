// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation Engine (Code-Driven Logic Interpreter + MNA Solver)
// ═══════════════════════════════════════════════════════════════════════════

import { CanvasNode, Wire } from '../../types';
import { useCanvasStore } from '../../store/canvasStore';
import { useSimulationStore } from '../../store/simulationStore';
import { CPU, avrInstruction, AVRIOPort, AVRUSART, AVRTimer, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config, PinState as AvrPinState } from 'avr8js';
import { buildMNACircuit } from './NetlistBuilder';
import type { MNACircuit } from './NetlistBuilder';
import type { WorkerInMessage, WorkerResultMessage, WorkerOscilloscopeMessage } from './SimulationWorker';
import { LogicRegistry } from './logic/LogicRegistry';

export type PinState = 'HIGH' | 'LOW' | 'INPUT' | 'OUTPUT' | 'PWM';

export interface SimulationCallbacks {
  onSerialOutput: (text: string, options?: { newline?: boolean }) => void;
  onBaudRateChange?: (baudRate: number) => void;
  onPinStateChange: (componentId: string, pinId: string, state: PinState, value?: number) => void;
  onDebugSnapshot?: (snapshot: { currentLine: number | null; variables: Record<string, number | string>; pins: Record<string, PinInfo>; isPaused: boolean; breakpoints: number[] }) => void;
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
  private breakpoints = new Set<number>();
  private currentLine: number | null = null;
  private avrCpu: CPU | null = null;
  private avrPorts: Record<string, AVRIOPort> = {};
  private avrUsart: AVRUSART | null = null;
  // For toggling state with delay patterns (e.g., blink)
  private pinToggleState: Record<string, boolean> = {};

  // ── LCD Display state ──
  private lcdRows = 2;
  private lcdCols = 16;
  private lcdBuffer: string[][] = [];
  private lcdCursorRow = 0;
  private lcdCursorCol = 0;
  private lcdBacklight = true;
  private lcdInitialized = false;
  private lcdNodes: CanvasNode[] = [];  // display nodes on canvas

  // ── ESC / BLDC Motor state ──
  private escNodes: CanvasNode[] = [];   // ESC modules on canvas
  private bldcNodes: CanvasNode[] = [];  // BLDC motors on canvas
  private dcMotorNodes: CanvasNode[] = [];  // DC motors on canvas
  private stepperNodes: CanvasNode[] = [];  // Stepper motors on canvas

  // ── MNA Solver Integration ──
  private solverWorker: Worker | null = null;
  private mnaCircuit: MNACircuit | null = null;
  private mcuPinVoltages: Record<string, number> = {};  // pin number → voltage

  constructor(callbacks: SimulationCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(code: string, nodes: CanvasNode[], wires: Wire[], hex?: string) {
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
    this.currentLine = null;

    // Reset LCD state
    this.lcdBuffer = Array.from({ length: this.lcdRows }, () => Array(this.lcdCols).fill(' '));
    this.lcdCursorRow = 0;
    this.lcdCursorCol = 0;
    this.lcdBacklight = true;
    this.lcdInitialized = false;
    // Find display nodes on the canvas
    this.lcdNodes = nodes.filter(n =>
      n.type === 'DISPLAY_LCD_I2C' || n.type === 'LCD_16X2' ||
      n.type === 'DISPLAY_OLED' || n.type === 'OLED_DISPLAY'
    );
    // Find ESC and BLDC motor nodes
    this.escNodes = nodes.filter(n => n.type === 'ESC_MODULE');
    this.bldcNodes = nodes.filter(n => n.type === 'MOTOR_BLDC');
    this.dcMotorNodes = nodes.filter(n => n.type === 'MOTOR_DC');
    this.stepperNodes = nodes.filter(n => n.type === 'MOTOR_STEPPER' || n.type === 'STEPPER_MOTOR');

    // Reset MNA state
    this.mcuPinVoltages = {};

    try {
      if (hex?.trim()) {
        this.callbacks.onSerialOutput('> Starting AVR8js ATmega328P emulator...');
        this.parseCode(code);
        this.startMNASolver(nodes, wires);
        this.startAvr(hex, nodes, wires);
        return;
      }

      this.callbacks.onSerialOutput('> Starting compatibility interpreter...');
      await new Promise(resolve => setTimeout(resolve, 500));

      this.parseCode(code);

      this.callbacks.onSerialOutput('> Compiled firmware not available; falling back to code-compatibility interpreter');
      await new Promise(resolve => setTimeout(resolve, 300));
      this.callbacks.onSerialOutput('> Physics-based MNA solver active');
      this.callbacks.onSerialOutput('> Compatibility CPU Started');
      this.callbacks.onSerialOutput('────────────────────────────────');

      // Start MNA solver in WebWorker
      this.startMNASolver(nodes, wires);

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
        this.updateBldcMotorAnimation();
        this.updateDcMotorAnimation();
        this.emitDebugSnapshot(false);
        this.tick += 100;
      }, 100);

    } catch (err: any) {
      this.callbacks.onError(err.message || 'Simulation Error');
      this.stop();
    }
  }

  private parseCode(code: string) {
    // Extract global variables
    const varMatches = code.matchAll(/(?:int|const\s+int|byte|uint8_t|long|unsigned\s+long|float|double)\s+(\w+)\s*=\s*([^;]+);/g);
    for (const match of varMatches) {
      const val = parseFloat(match[2]);
      this.globals[match[1]] = isNaN(val) ? 0 : val;
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
      this.currentLine = this.findLineForStatement(stmt);
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
          // Update MNA solver with new pin voltage
          this.updateMNAPinVoltage(pin, state === 'HIGH' ? 5 : 0);
          this.emitDebugSnapshot(false);
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
        // Update MNA solver with PWM average voltage
        this.updateMNAPinVoltage(pin, (value / 255) * 5);
        continue;
      }

      // digitalRead(pin)
      const drAssign = stmt.match(/(\w+)\s*=\s*digitalRead\s*\(\s*(\w+)\s*\)/);
      if (drAssign) {
        const pin = this.resolveValue(drAssign[2]);
        const state = this.pins[pin]?.state === 'HIGH' ? 1 : 0;
        this.globals[drAssign[1]] = state;
        this.emitDebugSnapshot(false);
        continue;
      }

      // dht.readTemperature() → simulated temperature ~25°C with slight variation
      const dhtTempAssign = stmt.match(/(?:float\s+)?(\w+)\s*=\s*dht\.readTemperature\s*\(/i);
      if (dhtTempAssign) {
        const temp = 24.5 + Math.sin(this.tick / 3000) * 2 + (Math.random() * 0.5 - 0.25);
        this.globals[dhtTempAssign[1]] = Math.round(temp * 10) / 10;
        this.emitDebugSnapshot(false);
        continue;
      }

      // dht.readHumidity() → simulated humidity ~60%
      const dhtHumAssign = stmt.match(/(?:float\s+)?(\w+)\s*=\s*dht\.readHumidity\s*\(/i);
      if (dhtHumAssign) {
        const hum = 58 + Math.cos(this.tick / 5000) * 5 + (Math.random() * 1 - 0.5);
        this.globals[dhtHumAssign[1]] = Math.round(hum * 10) / 10;
        this.emitDebugSnapshot(false);
        continue;
      }

      // dht.begin() — silently consume
      if (/dht\.begin\s*\(/i.test(stmt)) continue;

      // Variable assignment: varName = expression (needs to happen after digitalRead check)
      const assign = stmt.match(/(\w+)\s*=\s*([^;]+)/);
      if (assign && this.globals[assign[1]] !== undefined && !assign[2].includes('digitalRead')) {
        const expr = assign[2].trim();
        // Simple expression evaluation
        const val = this.evaluateExpression(expr);
        if (!isNaN(val)) {
          this.globals[assign[1]] = val;
          this.emitDebugSnapshot(false);
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

      // ── LCD commands ──
      if (this.handleLcdStatement(stmt, nodes)) continue;

      // ── ESC / Servo writeMicroseconds / write ──
      if (this.handleEscStatement(stmt, nodes, wires)) continue;

      // I2C / Wire.h commands — silently consume so they don't cause errors
      if (/Wire\.|lcd\.|dht\.|servo\.|esc\.|myservo\./i.test(stmt)) continue;

      // (Variable assignment moved up to handle digitalRead)
    }
  }

  /**
   * Parse and execute LCD-related statements.
   * Handles: lcd.init(), lcd.begin(), lcd.backlight(), lcd.noBacklight(),
   *          lcd.clear(), lcd.setCursor(col, row), lcd.print("text")
   */
  private handleLcdStatement(stmt: string, nodes: CanvasNode[]): boolean {
    const s = stmt.trim();

    // lcd.init() / lcd.begin()
    if (/lcd\.(init|begin)\s*\(/i.test(s)) {
      this.lcdInitialized = true;
      this.lcdBuffer = Array.from({ length: this.lcdRows }, () => Array(this.lcdCols).fill(' '));
      this.lcdCursorRow = 0;
      this.lcdCursorCol = 0;
      this.pushLcdToCanvas(nodes);
      return true;
    }

    // lcd.backlight()
    if (/lcd\.backlight\s*\(/i.test(s)) {
      this.lcdBacklight = true;
      this.pushLcdToCanvas(nodes);
      return true;
    }

    // lcd.noBacklight()
    if (/lcd\.noBacklight\s*\(/i.test(s)) {
      this.lcdBacklight = false;
      this.pushLcdToCanvas(nodes);
      return true;
    }

    // lcd.clear()
    if (/lcd\.clear\s*\(/i.test(s)) {
      this.lcdBuffer = Array.from({ length: this.lcdRows }, () => Array(this.lcdCols).fill(' '));
      this.lcdCursorRow = 0;
      this.lcdCursorCol = 0;
      this.pushLcdToCanvas(nodes);
      return true;
    }

    // lcd.setCursor(col, row)
    const cursorMatch = s.match(/lcd\.setCursor\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/i);
    if (cursorMatch) {
      this.lcdCursorCol = Math.max(0, Math.min(this.lcdCols - 1, parseInt(this.resolveValue(cursorMatch[1])) || 0));
      this.lcdCursorRow = Math.max(0, Math.min(this.lcdRows - 1, parseInt(this.resolveValue(cursorMatch[2])) || 0));
      return true;
    }

    // lcd.print("text") / lcd.print(variable)
    const printMatch = s.match(/lcd\.print\s*\(\s*(.*?)\s*\)$/i);
    if (printMatch) {
      const text = this.resolveSerialArgument(printMatch[1]);
      this.lcdWriteText(text);
      this.pushLcdToCanvas(nodes);
      return true;
    }

    return false;
  }

  /** Write text into the LCD buffer at the current cursor position. */
  private lcdWriteText(text: string) {
    for (const ch of text) {
      if (this.lcdCursorCol >= this.lcdCols) {
        // Wrap to next row
        this.lcdCursorCol = 0;
        this.lcdCursorRow = (this.lcdCursorRow + 1) % this.lcdRows;
      }
      this.lcdBuffer[this.lcdCursorRow][this.lcdCursorCol] = ch;
      this.lcdCursorCol++;
    }
  }

  /** Push the current LCD buffer text to canvas display nodes. */
  private pushLcdToCanvas(_nodes: CanvasNode[]) {
    const line1 = this.lcdBuffer[0]?.join('') || '';
    const line2 = this.lcdBuffer[1]?.join('') || '';

    // Update each LCD node on the canvas with the display text
    this.lcdNodes.forEach(lcdNode => {
      // Use a special pin state callback to trigger display update
      // The LogicRegistry will handle updating the node properties
      this.callbacks.onPinStateChange(lcdNode.id, '__lcd_display__', 'HIGH', 0);
    });

    // Store text in a global accessible to the canvas renderer
    (globalThis as any).__voltforgeLcdState = (globalThis as any).__voltforgeLcdState || {};
    this.lcdNodes.forEach(lcdNode => {
      (globalThis as any).__voltforgeLcdState[lcdNode.id] = {
        line1, line2, backlight: this.lcdBacklight
      };
    });
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

  /**
   * Handle ESC-related statements:
   *   esc.writeMicroseconds(value)  — maps 1000-2000µs to 0-255 PWM
   *   esc.write(value)              — maps 0-180 servo-style to 0-255 PWM
   *   myservo.writeMicroseconds(value)
   *   servo.attach(pin) / esc.attach(pin)
   */
  private handleEscStatement(stmt: string, _nodes: CanvasNode[], _wires: Wire[]): boolean {
    const s = stmt.trim();

    // Consume attach patterns: esc.attach(pin) / myservo.attach(pin)
    if (/(?:esc|myservo|servo)\w*\.attach\s*\(/i.test(s)) return true;

    // writeMicroseconds: 1000µs = 0%, 2000µs = 100%
    const wmsMatch = s.match(/(?:esc|myservo|servo)\w*\.writeMicroseconds\s*\(\s*(\w+)\s*\)/i);
    if (wmsMatch) {
      const usValue = Math.max(1000, Math.min(2000, parseInt(this.resolveValue(wmsMatch[1])) || 1000));
      const pwmValue = Math.round(((usValue - 1000) / 1000) * 255);
      this.propagateEscSignal(pwmValue);
      return true;
    }

    // write: 0-180 servo-style mapping
    const wMatch = s.match(/(?:esc|myservo|servo)\w*\.write\s*\(\s*(\w+)\s*\)/i);
    if (wMatch) {
      const angle = Math.max(0, Math.min(180, parseInt(this.resolveValue(wMatch[1])) || 0));
      const pwmValue = Math.round((angle / 180) * 255);
      this.propagateEscSignal(pwmValue);
      return true;
    }

    return false;
  }

  /**
   * Propagate a PWM signal to all ESC_MODULE nodes on the canvas.
   * The ESCLogic handler in LogicRegistry will then forward RPM to BLDC motors.
   */
  private propagateEscSignal(pwmValue: number) {
    this.escNodes.forEach(escNode => {
      const sigPin = escNode.pins?.find(p => p.id === 'sig');
      if (sigPin) {
        this.callbacks.onPinStateChange(escNode.id, sigPin.id, 'PWM', pwmValue);
      }
    });
  }

  /**
   * Animate BLDC motors: increment rotation based on stored RPM.
   * Called every tick (~100ms). Rotation speed is proportional to RPM.
   */
  private updateBldcMotorAnimation() {
    // Get fresh nodes from the store to read the latest RPM set by ESCLogic
    const freshNodes = useCanvasStore.getState().nodes;
    
    this.bldcNodes.forEach(motor => {
      const freshMotor = freshNodes.find(n => n.id === motor.id);
      if (!freshMotor) return;

      const rpm = Number(freshMotor.properties?.bldcRpm) || 0;
      if (rpm <= 0) return;

      // Visual rotation speed: prevent wagon-wheel effect (syncing with frame rate).
      // We map the full 0-12000 RPM range to a nice visual 0-47 degrees per tick.
      const degreesPerTick = (rpm / 12000) * 47;
      const currentRotation = Number(freshMotor.properties?.bldcRotation) || 0;
      const newRotation = (currentRotation + degreesPerTick) % 360;

      // Store rotation state for canvas rendering via globalThis
      (globalThis as any).__voltforgeBldcState = (globalThis as any).__voltforgeBldcState || {};
      (globalThis as any).__voltforgeBldcState[motor.id] = {
        rotation: newRotation,
        rpm,
      };

      // Trigger re-render with updated rotation
      this.callbacks.onPinStateChange(motor.id, '__bldc_anim__', 'HIGH', newRotation);
    });
  }

  /**
   * Animate DC motors: increment rotation if isSpinning is true.
   * Called every tick (~100ms).
   */
  private updateDcMotorAnimation() {
    const freshNodes = useCanvasStore.getState().nodes;

    this.dcMotorNodes.forEach(motor => {
      const freshMotor = freshNodes.find(n => n.id === motor.id);
      if (!freshMotor) return;

      const isSpinning = Boolean(freshMotor.properties?.isSpinning);
      if (!isSpinning) return;

      const currentTick = Number(freshMotor.properties?.motorTick) || 0;
      const newTick = (currentTick + 30) % 360; // 30° per tick = smooth rotation

      this.callbacks.onPinStateChange(motor.id, '__dc_anim__', 'HIGH', newTick);

      // Update the store directly for the visual
      const { updateNode } = useCanvasStore.getState();
      updateNode(motor.id, {
        properties: {
          ...freshMotor.properties,
          motorTick: newTick,
        },
      });
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
    const avrPort = this.boardPinToAvrPort(pin);
    if (avrPort) {
      this.avrPorts[avrPort.port]?.setPin(avrPort.bit, state === 'HIGH');
    }
    this.emitDebugSnapshot(false);
  }

  public setBreakpoints(lines: number[]) {
    this.breakpoints = new Set(lines);
  }

  private startAvr(hex: string, nodes: CanvasNode[], wires: Wire[]) {
    const program = this.hexToProgram(hex);
    this.avrCpu = new CPU(program);
    this.avrPorts = {
      B: new AVRIOPort(this.avrCpu, portBConfig),
      C: new AVRIOPort(this.avrCpu, portCConfig),
      D: new AVRIOPort(this.avrCpu, portDConfig),
    };
    new AVRTimer(this.avrCpu, timer0Config);
    new AVRTimer(this.avrCpu, timer1Config);
    new AVRTimer(this.avrCpu, timer2Config);
    this.avrUsart = new AVRUSART(this.avrCpu, usart0Config, 16_000_000);
    this.avrUsart.onLineTransmit = (line) => this.callbacks.onSerialOutput(line);
    this.avrUsart.onByteTransmit = (value) => {
      const text = String.fromCharCode(value);
      this.callbacks.onSerialOutput(text, { newline: text === '\n' });
    };
    this.avrUsart.onConfigurationChange = () => {
      if (this.avrUsart) this.callbacks.onBaudRateChange?.(this.avrUsart.baudRate);
    };

    const handlePort = (portName: 'B' | 'C' | 'D', value: number) => {
      for (let bit = 0; bit < 8; bit += 1) {
        const pin = this.avrPortToBoardPin(portName, bit);
        if (!pin) continue;
        const pinState = this.avrPorts[portName].pinState(bit);
        const high = pinState === AvrPinState.High || Boolean(value & (1 << bit));
        this.pins[pin] = { mode: 'OUTPUT', state: high ? 'HIGH' : 'LOW', value: high ? 255 : 0 };
        this.propagatePinState(pin, high ? 'HIGH' : 'LOW', nodes, wires, high ? 255 : 0);
      }
    };
    this.avrPorts.B.addListener((value) => handlePort('B', value));
    this.avrPorts.C.addListener((value) => handlePort('C', value));
    this.avrPorts.D.addListener((value) => handlePort('D', value));

    this.callbacks.onSerialOutput('> AVR8js CPU Started');
    this.intervalId = window.setInterval(() => {
      if (!this.isRunning || !this.avrCpu) return;
      for (let i = 0; i < 50000; i += 1) {
        avrInstruction(this.avrCpu);
        this.avrCpu.tick();
      }
      this.updateBldcMotorAnimation();
      this.updateDcMotorAnimation();
      this.emitDebugSnapshot(false);
    }, 16);
  }

  private hexToProgram(hex: string): Uint16Array {
    const bytes: number[] = [];
    for (const line of hex.split(/\r?\n/)) {
      if (!line.startsWith(':')) continue;
      const length = parseInt(line.slice(1, 3), 16);
      const address = parseInt(line.slice(3, 7), 16);
      const type = parseInt(line.slice(7, 9), 16);
      if (type !== 0) continue;
      for (let i = 0; i < length; i += 1) {
        bytes[address + i] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      }
    }
    const words = new Uint16Array(Math.ceil(bytes.length / 2));
    for (let i = 0; i < words.length; i += 1) {
      words[i] = (bytes[i * 2] || 0) | ((bytes[i * 2 + 1] || 0) << 8);
    }
    return words;
  }

  private avrPortToBoardPin(port: 'B' | 'C' | 'D', bit: number) {
    if (port === 'D') return String(bit);
    if (port === 'B' && bit <= 5) return String(bit + 8);
    if (port === 'C' && bit <= 5) return String(bit + 14);
    return '';
  }

  private boardPinToAvrPort(pin: string) {
    const value = Number(pin);
    if (value >= 0 && value <= 7) return { port: 'D', bit: value };
    if (value >= 8 && value <= 13) return { port: 'B', bit: value - 8 };
    if (value >= 14 && value <= 19) return { port: 'C', bit: value - 14 };
    return null;
  }

  private findLineForStatement(statement: string) {
    const source = [...this.setupStatements, ...this.loopStatements].join('\n');
    const offset = source.indexOf(statement);
    return offset < 0 ? null : source.slice(0, offset).split('\n').length;
  }

  private emitDebugSnapshot(isPaused: boolean) {
    this.callbacks.onDebugSnapshot?.({
      currentLine: this.currentLine,
      variables: { ...this.globals },
      pins: { ...this.pins },
      isPaused,
      breakpoints: Array.from(this.breakpoints),
    });
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.avrCpu = null;
    this.avrUsart = null;
    this.avrPorts = {};
    this.stopMNASolver();
    this.emitDebugSnapshot(false);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MNA Solver Integration
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the MNA circuit from the canvas and start the solver WebWorker.
   */
  private startMNASolver(nodes: CanvasNode[], wires: Wire[]) {
    try {
      // Build the circuit netlist
      this.mnaCircuit = buildMNACircuit(nodes, wires, this.mcuPinVoltages);

      if (this.mnaCircuit.elements.length === 0) {
        // No solvable elements — skip solver
        return;
      }

      // Create WebWorker
      this.solverWorker = new Worker(
        new URL('./SimulationWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from the worker
      this.solverWorker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (msg.type === 'RESULT') {
          this.handleSolverResult(msg as WorkerResultMessage, nodes);
        } else if (msg.type === 'OSCILLOSCOPE') {
          this.handleOscilloscopeData(msg as WorkerOscilloscopeMessage);
        }
      };

      this.solverWorker.onerror = (err) => {
        console.warn('[VoltForge MNA] Solver worker error:', err.message);
      };

      // Initialize the worker with circuit data
      const initMsg: WorkerInMessage = {
        type: 'INIT',
        numNodes: this.mnaCircuit.numNodes,
        elements: this.mnaCircuit.elements,
        dt: 0.001, // 1ms time step
      };
      this.solverWorker.postMessage(initMsg);

      // Start the solver loop
      const startMsg: WorkerInMessage = { type: 'START' };
      this.solverWorker.postMessage(startMsg);

    } catch (err: any) {
      console.warn('[VoltForge MNA] Failed to start solver:', err.message);
    }
  }

  /**
   * Stop and dispose the solver WebWorker.
   */
  private stopMNASolver() {
    if (this.solverWorker) {
      const stopMsg: WorkerInMessage = { type: 'STOP' };
      this.solverWorker.postMessage(stopMsg);
      this.solverWorker.terminate();
      this.solverWorker = null;
    }
    this.mnaCircuit = null;
    this.mcuPinVoltages = {};

    // Clear solver state in store
    useSimulationStore.getState().setCircuitState({}, {}, {}, true);
    useSimulationStore.getState().clearOscilloscopeData();
  }

  /**
   * Update a specific MCU pin voltage in the solver.
   * Called whenever digitalWrite/analogWrite changes a pin.
   */
  private updateMNAPinVoltage(pin: string, voltage: number) {
    this.mcuPinVoltages[pin] = voltage;

    if (!this.solverWorker || !this.mnaCircuit) return;

    // Find the MCU node on canvas
    const nodes = useCanvasStore.getState().nodes;
    const mcuNode = nodes.find(n =>
      n.type.startsWith('ARDUINO') || n.type.startsWith('ESP') || n.type.startsWith('RASPBERRY')
    );
    if (!mcuNode) return;

    // Build the element ID that matches NetlistBuilder naming
    const elementId = `vs_mcu_${mcuNode.id}_d${pin}`;

    const updateMsg: WorkerInMessage = {
      type: 'UPDATE_PIN',
      elementId,
      voltage,
    };
    this.solverWorker.postMessage(updateMsg);
  }

  /**
   * Handle solver results from the WebWorker.
   * Maps MNA element IDs back to canvas components and dispatches visual updates.
   */
  private handleSolverResult(result: WorkerResultMessage, _nodes: CanvasNode[]) {
    if (!this.mnaCircuit) return;

    const { elementToComponent, pinToMNANode } = this.mnaCircuit;
    const nodes = useCanvasStore.getState().nodes;

    // Build component-level voltage and current maps
    const componentVoltages: Record<string, number> = {};
    const componentCurrents: Record<string, number> = {};
    const componentPower: Record<string, number> = {};

    // Map MNA node voltages to a string-keyed record for the store
    const nodeVoltageMap: Record<string, number> = {};
    for (let i = 0; i < result.nodeVoltages.length; i++) {
      nodeVoltageMap[String(i)] = result.nodeVoltages[i];
    }

    // Map element results to canvas components
    for (const [elemId, current] of Object.entries(result.branchCurrents)) {
      const componentId = elementToComponent.get(elemId);
      if (!componentId) continue;
      componentCurrents[componentId] = (componentCurrents[componentId] || 0) + Math.abs(current);
    }

    for (const [elemId, power] of Object.entries(result.componentPower)) {
      const componentId = elementToComponent.get(elemId);
      if (!componentId) continue;
      componentPower[componentId] = (componentPower[componentId] || 0) + power;
    }

    // Update store with solver state
    useSimulationStore.getState().setCircuitState(
      nodeVoltageMap,
      componentCurrents,
      componentPower,
      result.converged
    );

    // Dispatch to specific instrument components
    for (const node of nodes) {
      // Multimeter: read voltage between probe nodes
      if (node.type === 'MULTIMETER') {
        const probeNode = pinToMNANode.get(`${node.id}:v_probe`) ?? 0;
        const comNode = pinToMNANode.get(`${node.id}:com`) ?? 0;
        const probeV = result.nodeVoltages[probeNode] ?? 0;
        const comV = result.nodeVoltages[comNode] ?? 0;
        const voltage = Math.abs(probeV - comV);
        LogicRegistry.dispatch('MULTIMETER', node.id, 'v_probe', voltage > 0.01 ? 'HIGH' : 'LOW', voltage);
      }

      // Ammeter: read branch current
      if (node.type === 'AMMETER') {
        const elemId = `am_${node.id}`;
        const current = result.branchCurrents[elemId] ?? 0;
        LogicRegistry.dispatch('AMMETER', node.id, 'in', Math.abs(current) > 0.0001 ? 'HIGH' : 'LOW', current);
      }

      // Oscilloscope: handled separately via OSCILLOSCOPE messages

      // LED: check if enough current flows (> 1mA) to light up
      if (node.type.includes('LED') && !node.type.includes('NEOPIXEL')) {
        const elemId = `led_${node.id}`;
        const current = result.branchCurrents[elemId] ?? 0;
        const isLit = Math.abs(current) > 0.001; // > 1mA

        // Check for burnout: typical LED max is 20mA
        const maxCurrent = Number(node.properties?.maxCurrent) || 20;
        const currentMa = Math.abs(current) * 1000;
        if (currentMa > maxCurrent * 2) {
          // Blown!
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              isBlown: true,
              isLit: false,
              faultMessage: `Current ${currentMa.toFixed(1)} mA exceeds max ${maxCurrent} mA`,
            },
          });
        } else if (!node.properties?.isBlown) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              isLit,
            },
          });
        }
      }

      // Buzzer: check current
      if (node.type === 'BUZZER') {
        const elemId = `bz_${node.id}`;
        const current = result.branchCurrents[elemId] ?? 0;
        const isBeeping = Math.abs(current) > 0.001;
        useCanvasStore.getState().updateNode(node.id, {
          properties: { ...node.properties, isBeeping },
        });
      }
    }
  }

  /**
   * Handle oscilloscope data from the WebWorker.
   */
  private handleOscilloscopeData(msg: WorkerOscilloscopeMessage) {
    const store = useSimulationStore.getState();
    for (const [nodeIdx, voltage] of Object.entries(msg.samples)) {
      store.appendOscilloscopeData(nodeIdx, voltage);
    }
  }
}
