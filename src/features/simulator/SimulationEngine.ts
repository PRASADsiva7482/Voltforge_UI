// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation Engine (Code-Driven Logic Interpreter + MNA Solver)
// ═══════════════════════════════════════════════════════════════════════════

import type { CanvasNode, Wire } from '../../types/domain';
import { useCanvasStore } from '../../store/canvasStore';
import { useSimulationStore } from '../../store/simulationStore';
import { CPU, avrInstruction, AVRIOPort, AVRUSART, AVRTimer, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config, PinState as AvrPinState, AVRTWI, twiConfig, AVRADC, adcConfig } from 'avr8js';
import { buildMNACircuit } from './NetlistBuilder';
import type { MNACircuit } from './NetlistBuilder';
import type { WorkerInMessage, WorkerResultMessage, WorkerOscilloscopeMessage } from './SimulationWorker';
import { LogicRegistry } from './logic/LogicRegistry';
import { evaluateNumericExpression } from './ExpressionEvaluator';
import { AudioEngine } from './AudioEngine';
import { getBoardLogicVoltage, isBoardComponentType } from '../canvas/boardCatalog';

export type PinState = 'HIGH' | 'LOW' | 'INPUT' | 'OUTPUT' | 'PWM';

export interface SimulationCallbacks {
  onSerialOutput: (text: string, options?: { newline?: boolean }) => void;
  onBaudRateChange?: (baudRate: number) => void;
  onPinStateChange: (componentId: string, pinId: string, state: PinState, value?: number) => void;
  onDebugSnapshot?: (snapshot: { currentLine: number | null; variables: Record<string, number | string>; pins: Record<string, PinInfo>; isPaused: boolean; breakpoints: number[] }) => void;
  onError: (error: string) => void;
}

interface PinInfo {
  mode: 'INPUT' | 'INPUT_PULLUP' | 'OUTPUT' | 'PWM';
  state: PinState;
  value: number; // 0-255 for analogWrite, 0/1 for digital
}

interface ParsedStatement {
  type: 'statement' | 'if' | 'for' | 'while';
  code?: string;
  condition?: string;
  thenBlock?: ParsedStatement[];
  elseBlock?: ParsedStatement[];
  init?: string;
  update?: string;
  body?: ParsedStatement[];
}

class LcdI2CExpander {
  private address = 0x27;
  private rs = 0;
  private rw = 0;
  private en = 0;
  private backlight = 1;
  private highNibble: number | null = null;
  private cursorRow = 0;
  private cursorCol = 0;
  private buffer: string[][] = Array.from({ length: 2 }, () => Array(16).fill(' '));
  private fourBitMode = false;

  constructor(private onUpdate: (line1: string, line2: string, backlight: boolean) => void) {}

  write(val: number) {
    const rs = val & 0x01;
    const rw = (val & 0x02) >> 1;
    const en = (val & 0x04) >> 2;
    const backlight = (val & 0x08) >> 3;
    const nibble = (val & 0xF0) >> 4;

    this.backlight = backlight;

    // Detect high-to-low transition of EN
    if (this.en === 1 && en === 0) {
      if (!this.fourBitMode) {
        if (nibble === 0x03) {
          this.processLcdByte(rs, 0x30);
          this.highNibble = null;
        } else if (nibble === 0x02) {
          this.processLcdByte(rs, 0x20);
          this.fourBitMode = true;
          this.highNibble = null;
        } else {
          if (this.highNibble === null) {
            this.highNibble = nibble;
          } else {
            const fullByte = (this.highNibble << 4) | nibble;
            this.highNibble = null;
            this.processLcdByte(rs, fullByte);
          }
        }
      } else {
        if (this.highNibble === null) {
          // This is the first nibble (high nibble)
          this.highNibble = nibble;
        } else {
          // This is the second nibble (low nibble)
          const fullByte = (this.highNibble << 4) | nibble;
          this.highNibble = null;
          this.processLcdByte(rs, fullByte);
        }
      }
    }
    this.en = en;
    this.rs = rs;
    this.rw = rw;

    // Always update backlight state
    this.triggerUpdate();
  }

  private processLcdByte(rs: number, byte: number) {
    if (rs === 0) {
      // Command
      if (byte === 0x01) {
        // Clear Display
        this.buffer = Array.from({ length: 2 }, () => Array(16).fill(' '));
        this.cursorRow = 0;
        this.cursorCol = 0;
      } else if (byte === 0x02 || byte === 0x03) {
        // Return Home
        this.cursorRow = 0;
        this.cursorCol = 0;
      } else if (byte & 0x80) {
        // Set DDRAM Address
        const addr = byte & 0x7F;
        if (addr >= 0x40) {
          this.cursorRow = 1;
          this.cursorCol = addr - 0x40;
        } else {
          this.cursorRow = 0;
          this.cursorCol = addr;
        }
      }
    } else {
      // Data (Write Character)
      if (this.cursorRow < 2 && this.cursorCol < 16) {
        this.buffer[this.cursorRow][this.cursorCol] = String.fromCharCode(byte);
        this.cursorCol++;
        if (this.cursorCol >= 16) {
          this.cursorCol = 0;
          this.cursorRow = (this.cursorRow + 1) % 2;
        }
      }
    }
    this.triggerUpdate();
  }

  private triggerUpdate() {
    const line1 = this.buffer[0].join('');
    const line2 = this.buffer[1].join('');
    this.onUpdate(line1, line2, this.backlight === 1);
  }
}

class LcdTWIEventHandler {
  private activeAddress = 0;
  private lcdExpander: LcdI2CExpander | null = null;

  constructor(
    private twi: any,
    private lcdNodes: CanvasNode[],
    private callbacks: SimulationCallbacks
  ) {
    this.lcdExpander = new LcdI2CExpander((line1, line2, backlight) => {
      (globalThis as any).__voltforgeLcdState = (globalThis as any).__voltforgeLcdState || {};
      this.lcdNodes.forEach(node => {
        (globalThis as any).__voltforgeLcdState[node.id] = { line1, line2, backlight };
        this.callbacks.onPinStateChange(node.id, '__lcd_display__', 'HIGH', 0);
      });
    });
  }

  start() {
    this.twi.completeStart();
  }

  stop() {
    this.twi.completeStop();
  }

  connectToSlave(address: number, write: boolean) {
    this.activeAddress = address;
    const ack = (address === 0x27 || address === 0x3f);
    this.twi.completeConnect(ack);
  }

  writeByte(value: number) {
    const ack = (this.activeAddress === 0x27 || this.activeAddress === 0x3f);
    if (ack && this.lcdExpander) {
      this.lcdExpander.write(value);
    }
    this.twi.completeWrite(ack);
  }

  readByte() {
    this.twi.completeRead(0xff);
  }
}

/**
 * Interpreter for Arduino-style C++ code.
 * Maps digital/analog writes to canvas component states.
 * Supports: pinMode, digitalWrite, analogWrite, digitalRead,
 * Serial.println, delay (simulated), and basic variables.
 */
export class SimulationEngine {
  private isRunning = false;
  private isPaused = false;
  private simulationSpeed = 1;
  private isBatching = false;
  private accumulatedUpdates: Map<string, Record<string, any>> = new Map();
  private originalUpdateNode: any = null;
  private intervalId: number | null = null;
  private callbacks: SimulationCallbacks;
  private pins: Record<string, PinInfo> = {};
  private setupStatements: ParsedStatement[] = [];
  private loopStatements: ParsedStatement[] = [];
  private globals: Record<string, number | string> = {};
  private originalCodeLines: string[] = [];
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
  private avrAdc: AVRADC | null = null;
  // For toggling state with delay patterns (e.g., blink)
  private pinToggleState: Record<string, boolean> = {};
  private lastDcMotorUpdateTime = 0;

  // ── LCD Display state ──
  private lcdRows = 2;
  private lcdCols = 16;
  private lcdBuffer: string[][] = [];
  private lcdCursorRow = 0;
  private lcdCursorCol = 0;
  private lcdBacklight = true;
  private lcdInitialized = false;
  private lcdNodes: CanvasNode[] = [];  // display nodes on canvas
  private lastLcdPushTime = 0;           // throttle LCD canvas updates
  private lcdPushPending = false;        // deferred LCD push scheduled

  // ── ESC / BLDC Motor state ──
  private escNodes: CanvasNode[] = [];   // ESC modules on canvas
  private bldcNodes: CanvasNode[] = [];  // BLDC motors on canvas
  private dcMotorNodes: CanvasNode[] = [];  // DC motors on canvas
  private stepperNodes: CanvasNode[] = [];  // Stepper motors on canvas

  // ── MNA Solver Integration ──
  private solverWorker: Worker | null = null;
  private mnaCircuit: MNACircuit | null = null;
  private mcuPinVoltages: Record<string, number> = {};  // pin number → voltage
  private storeUnsubscribe: (() => void) | null = null;
  private lastResultTime = 0;
  private pendingResult: WorkerResultMessage | null = null;
  private resultRafId: number | null = null;
  private localSerialBuffer = '';
  private sensorAutoIntervalId: number | null = null;
  private sensorStartTime = 0;
  private servoAttachments = new Map<string, string>();

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
    this.localSerialBuffer = '';
    this.servoAttachments.clear();

    // Reset LCD state
    this.lcdBuffer = Array.from({ length: this.lcdRows }, () => Array(this.lcdCols).fill(' '));
    this.lcdCursorRow = 0;
    this.lcdCursorCol = 0;
    this.lcdBacklight = true;
    this.lcdInitialized = false;
    this.lastLcdPushTime = 0;
    this.lcdPushPending = false;
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

    // Initialize board properties: power on! And clear/reset other nodes to their initial simulation state.
    const { updateNode } = useCanvasStore.getState();
    nodes.forEach(node => {
      const updates: Record<string, any> = {};
      let changed = false;

      if (isBoardComponentType(node.type)) {
        updates.boardPowered = true;
        updates.builtInLedLit = false;
        changed = true;
      } else if (node.type.includes('LED')) {
        updates.isLit = false;
        updates.rgbRed = 0;
        updates.rgbGreen = 0;
        updates.rgbBlue = 0;
        changed = true;
      } else if (node.type === 'DISPLAY_LCD_I2C' || node.type === 'LCD_16X2' || node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY') {
        updates.lcdBacklight = false;
        updates.lcdLine1 = '';
        updates.lcdLine2 = '';
        changed = true;
      } else if (node.type === 'DISPLAY_7SEG') {
        updates.isActive = false;
        updates.segments = {};
        updates.displayDigit = '';
        changed = true;
      } else if (node.type === 'MOTOR_DC') {
        updates.isSpinning = false;
        updates.rpm = 0;
        updates.motorTick = 0;
        changed = true;
      } else if (node.type === 'MOTOR_BLDC') {
        updates.bldcRpm = 0;
        updates.bldcRotation = 0;
        updates.isSpinning = false;
        changed = true;
      } else if (node.type === 'MOTOR_STEPPER' || node.type === 'STEPPER_MOTOR') {
        updates.isSpinning = false;
        updates.stepperRotation = 0;
        updates.stepperSteps = 0;
        changed = true;
      } else if (node.type === 'BUZZER') {
        updates.isBeeping = false;
        changed = true;
      } else if (node.type.startsWith('RELAY_')) {
        updates.isActive = false;
        updates.isSwitched = false;
        Object.keys(node.properties || {}).forEach(k => {
          if (k.startsWith('isSwitched_')) {
            updates[k] = false;
          }
        });
        changed = true;
      } else if (node.type === 'MULTIMETER' || node.type === 'AMMETER' || node.type === 'OSCILLOSCOPE') {
        updates.displayValue = node.type === 'MULTIMETER' ? '0.00V' : node.type === 'AMMETER' ? '0.00 mA' : 'SCOPE';
        updates.measuredVoltage = 0;
        updates.measuredCurrent = 0;
        changed = true;
      }

      if (changed) {
        updateNode(node.id, {
          properties: {
            ...node.properties,
            ...updates,
          }
        });
      }
    });

    // updateNode() is synchronous, but the nodes passed by React still refer to
    // the pre-reset snapshot (often boardPowered=false after a previous stop).
    // Always initialize the electrical runtime from the refreshed store state.
    const initializedNodes = useCanvasStore.getState().nodes;
    this.lcdNodes = initializedNodes.filter(n =>
      n.type === 'DISPLAY_LCD_I2C' || n.type === 'LCD_16X2' ||
      n.type === 'DISPLAY_OLED' || n.type === 'OLED_DISPLAY'
    );
    this.escNodes = initializedNodes.filter(n => n.type === 'ESC_MODULE');
    this.bldcNodes = initializedNodes.filter(n => n.type === 'MOTOR_BLDC');
    this.dcMotorNodes = initializedNodes.filter(n => n.type === 'MOTOR_DC');
    this.stepperNodes = initializedNodes.filter(n => n.type === 'MOTOR_STEPPER' || n.type === 'STEPPER_MOTOR');

    // Subscribe to canvas store changes to dynamically update MNA solver values
    this.storeUnsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (!this.isRunning || !this.solverWorker || !this.mnaCircuit) return;
      if (state.nodes === prev.nodes) return;

      state.nodes.forEach(node => {
        const prevNode = prev.nodesById?.get(node.id) || prev.nodes.find(n => n.id === node.id);
        if (!prevNode) return;

        const props = node.properties || {};
        const prevProps = prevNode.properties || {};

        // 1. Potentiometer position change
        if (node.type === 'POTENTIOMETER' && props.position !== prevProps.position) {
          const total = Number(props.maxResistance) || Number(props.resistance) || 10000;
          const pos = Number(props.position !== undefined ? props.position : 50) / 100;
          const rTop = Math.max(total * pos, 1);
          const rBot = Math.max(total * (1 - pos), 1);

          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `pot_top_${node.id}`,
            voltage: rTop,
          });
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `pot_bot_${node.id}`,
            voltage: rBot,
          });
        }

        // 2. LDR light level change
        if ((node.type === 'LDR' || node.type === 'SENSOR_LDR') && props.lightLevel !== prevProps.lightLevel) {
          const rDark = Number(props.resistanceDark) || 100000;
          const rLight = Number(props.resistanceLight) || 500;
          const light = Number(props.lightLevel !== undefined ? props.lightLevel : 50) / 100;
          const resistance = Math.max(rDark - (rDark - rLight) * light, 1);

          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `ldr_${node.id}`,
            voltage: resistance,
          });
        }

        // 3. Button press state change
        if ((node.type === 'BUTTON' || node.type === 'PUSH_BUTTON') && props.isPressed !== prevProps.isPressed) {
          const isPressed = Boolean(props.isPressed);
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_btn_sw_${node.id}`,
            voltage: isPressed ? 0.01 : 1e8,
          });
        }

        // 4. Switch toggled state change
        if (node.type === 'SWITCH_SPST' && props.isClosed !== prevProps.isClosed) {
          const isClosed = Boolean(props.isClosed);
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_sw_${node.id}`,
            voltage: isClosed ? 0.01 : 1e8,
          });
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_sw_nc_${node.id}`,
            voltage: isClosed ? 1e8 : 0.01,
          });
        }

        // 5. PIR Sensor motion detected change
        if ((node.type === 'SENSOR_PIR' || node.type === 'PIR_SENSOR') && props.motionDetected !== prevProps.motionDetected) {
          const hasMotion = Boolean(props.motionDetected);
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `vs_pir_${node.id}`,
            voltage: hasMotion ? 5 : 0,
          });
        }

        // 6. Relay active state change
        if ((node.type === 'RELAY_SINGLE' || node.type === 'RELAY_SPDT') && props.isActive !== prevProps.isActive) {
          const isActive = Boolean(props.isActive);
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_contact_no_${node.id}`,
            voltage: isActive ? 0.01 : 1e8,
          });
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_contact_nc_${node.id}`,
            voltage: isActive ? 1e8 : 0.01,
          });
        }
        if (node.type === 'RELAY_2CH') {
          for (let ch = 1; ch <= 2; ch++) {
            const key = `isSwitched_${ch}`;
            if (props[key] !== prevProps[key]) {
              const active = Boolean(props[key]);
              this.solverWorker?.postMessage({
                type: 'UPDATE_PIN',
                elementId: `r_contact_no${ch}_${node.id}`,
                voltage: active ? 0.01 : 1e8,
              });
            }
          }
        }
        if (node.type === 'RELAY_4CH') {
          for (let ch = 1; ch <= 4; ch++) {
            const key = `isSwitched_${ch}`;
            if (props[key] !== prevProps[key]) {
              const active = Boolean(props[key]);
              this.solverWorker?.postMessage({
                type: 'UPDATE_PIN',
                elementId: `r_contact_no${ch}_${node.id}`,
                voltage: active ? 0.01 : 1e8,
              });
            }
          }
        }

        // 7. Soil Moisture level change → update MNA analog output
        if (node.type === 'SOIL_MOISTURE' && props.moistureLevel !== prevProps.moistureLevel) {
          const moisture = Number(props.moistureLevel ?? 50) / 100;
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `vs_soil_${node.id}`,
            voltage: moisture * 5,
          });
        }

      });
    });

    try {
      this.originalCodeLines = code.split('\n');

      if (hex?.trim()) {
        this.callbacks.onSerialOutput('> Starting AVR8js ATmega328P emulator...');
        this.parseCode(code);
        this.startMNASolver(initializedNodes, wires);
        this.startAvr(hex, initializedNodes, wires);
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
      this.startMNASolver(initializedNodes, wires);

      // Start execution loop for visual updates, animations, and diagnostics
      this.intervalId = window.setInterval(() => {
        if (!this.isRunning) return;

        this.runBatched(() => {
          const inputs = useSimulationStore.getState().drainSerialInput();
          if (inputs.length > 0) {
            this.localSerialBuffer += inputs.join('');
          }

          const currentNodes = useCanvasStore.getState().nodes;
          const mcuNode = currentNodes.find(n =>
            isBoardComponentType(n.type)
          );
          const isPowered = mcuNode ? mcuNode.properties?.boardPowered !== false : true;

          if (!isPowered) return;

          this.updateDiagnosticProbes(currentNodes, wires);
          this.updateBldcMotorAnimation();
          this.updateDcMotorAnimation();
          this.emitDebugSnapshot(false);
          this.tick += 100;
        });
      }, 100);

      // Run interpreter loop asynchronously in background
      const runInterpreter = async () => {
        try {
          const currentNodes = useCanvasStore.getState().nodes;
          // First run setup()
          await this.executeParsedStatementsAsync(this.setupStatements, currentNodes, wires, true);
          this.updateDiagnosticProbes(currentNodes, wires);

          // Then run loop() continuously
          while (this.isRunning && !this.avrCpu) {
            const freshNodes = useCanvasStore.getState().nodes;
            const freshMcuNode = freshNodes.find(n =>
              isBoardComponentType(n.type)
            );
            const isPowered = freshMcuNode ? freshMcuNode.properties?.boardPowered !== false : true;

            if (isPowered) {
              await this.executeParsedStatementsAsync(this.loopStatements, freshNodes, wires, false);
            } else {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            // Yield control back to JS event loop
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        } catch (err: any) {
          this.callbacks.onError(err.message || 'Interpreter Execution Error');
        }
      };
      runInterpreter();

      // ── Start sensor auto-cycling for live overlays ──
      this.startSensorAutoCycling(initializedNodes);

    } catch (err: any) {
      this.callbacks.onError(err.message || 'Simulation Error');
      this.stop();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Sensor Auto-Cycling — makes sensors feel alive during simulation
  // ═══════════════════════════════════════════════════════════════════════

  private startSensorAutoCycling(initialNodes: CanvasNode[]) {
    this.sensorStartTime = Date.now();
    this.sensorAutoIntervalId = window.setInterval(() => {
      if (!this.isRunning) return;
      const nodes = useCanvasStore.getState().nodes;
      const elapsed = (Date.now() - this.sensorStartTime) / 1000; // seconds
      const updatesList: Array<{ id: string; changes: Partial<CanvasNode> }> = [];

      for (const node of nodes) {
        const props = node.properties || {};
        const nodeChanges: Record<string, any> = {};
        let changed = false;

        // ── DHT Temperature + Humidity: oscillate around set value ──
        if (node.type === 'TEMP_SENSOR' || node.type === 'SENSOR_DHT11' || node.type === 'SENSOR_DHT22') {
          const baseTemp = Number(props.temperature ?? 25);
          const baseHum = Number(props.humidity ?? 60);
          const tempVariation = Math.sin(elapsed * 0.2) * 2 + Math.sin(elapsed * 0.7) * 0.5;
          const humVariation = Math.sin(elapsed * 0.15) * 5 + Math.cos(elapsed * 0.4) * 2;
          const newTemp = Math.round((baseTemp + tempVariation) * 10) / 10;
          const newHum = Math.max(0, Math.min(100, Math.round(baseHum + humVariation)));

          if (props.temperature !== newTemp || props.humidity !== newHum) {
            nodeChanges.temperature = newTemp;
            nodeChanges.humidity = newHum;
            changed = true;
          }
        }

        // ── Ultrasonic: distance slowly varies ±15cm ──
        if (node.type === 'ULTRASONIC_SENSOR' || node.type === 'SENSOR_ULTRASONIC') {
          const baseDist = Number(props.distance ?? 100);
          const distVariation = Math.sin(elapsed * 0.3) * 15 + Math.cos(elapsed * 0.8) * 5;
          const newDist = Math.max(2, Math.min(400, Math.round(baseDist + distVariation)));
          if (props.distance !== newDist) {
            nodeChanges.distance = newDist;
            changed = true;
          }
        }

        // ── PIR: motion triggers in bursts ──
        if (node.type === 'PIR_SENSOR' || node.type === 'SENSOR_PIR') {
          const isMotionPhase = Math.sin(elapsed * 0.5) > 0.6;
          const currentMotion = Boolean(props.motionDetected);
          if (isMotionPhase !== currentMotion) {
            nodeChanges.motionDetected = isMotionPhase;
            changed = true;
          }
        }

        // ── LDR: light level slowly drifts ──
        if (node.type === 'LDR' || node.type === 'SENSOR_LDR') {
          const baseLight = Number(props.lightLevel ?? 50);
          const lightVariation = Math.sin(elapsed * 0.1) * 15 + Math.cos(elapsed * 0.3) * 8;
          const newLight = Math.max(0, Math.min(100, Math.round(baseLight + lightVariation)));
          if (props.lightLevel !== newLight) {
            nodeChanges.lightLevel = newLight;
            changed = true;
          }
        }

        // ── IMU: subtle accelerometer noise + gentle tilt ──
        if (node.type === 'SENSOR_IMU') {
          const baseAx = Number(props.accelerationX ?? 0);
          const baseAy = Number(props.accelerationY ?? 0);
          const noise = () => (Math.random() - 0.5) * 0.2;
          const tiltX = Math.sin(elapsed * 0.4) * 0.5 + noise();
          const tiltY = Math.cos(elapsed * 0.3) * 0.3 + noise();
          const newAx = Math.round((baseAx + tiltX) * 100) / 100;
          const newAy = Math.round((baseAy + tiltY) * 100) / 100;
          if (props.accelerationX !== newAx || props.accelerationY !== newAy) {
            nodeChanges.accelerationX = newAx;
            nodeChanges.accelerationY = newAy;
            changed = true;
          }
        }

        // ── Soil Moisture: moisture slowly changes ──
        if (node.type === 'SOIL_MOISTURE') {
          const baseMoisture = Number(props.moistureLevel ?? 50);
          const moistureVariation = Math.sin(elapsed * 0.08) * 10 + Math.cos(elapsed * 0.2) * 5;
          const newMoisture = Math.max(0, Math.min(100, Math.round(baseMoisture + moistureVariation)));
          if (props.moistureLevel !== newMoisture) {
            nodeChanges.moistureLevel = newMoisture;
            changed = true;
          }
        }

        if (changed) {
          updatesList.push({
            id: node.id,
            changes: {
              properties: {
                ...props,
                ...nodeChanges,
              },
            },
          });
        }
      }

      if (updatesList.length > 0) {
        useCanvasStore.getState().batchUpdateNodes(updatesList);
      }
    }, 1000); // Update every 1000ms
  }

  private stopSensorAutoCycling() {
    if (this.sensorAutoIntervalId) {
      clearInterval(this.sensorAutoIntervalId);
      this.sensorAutoIntervalId = null;
    }
  }

  private extractBalancedBlock(code: string, keyword: string): string | null {
    const regex = new RegExp(`void\\s+${keyword}\\s*\\(\\s*\\)\\s*\\{`);
    const match = code.match(regex);
    if (!match || match.index === undefined) return null;

    const startIdx = match.index + match[0].length;
    let braceDepth = 1;
    let i = startIdx;
    while (i < code.length && braceDepth > 0) {
      if (code[i] === '{') braceDepth++;
      else if (code[i] === '}') braceDepth--;
      i++;
    }

    if (braceDepth === 0) {
      return code.substring(startIdx, i - 1);
    }
    return null;
  }

  private parseCode(code: string) {
    // Pre-initialize Arduino constants
    this.globals['HIGH'] = 1;
    this.globals['LOW'] = 0;
    this.globals['INPUT'] = 0;
    this.globals['OUTPUT'] = 1;
    this.globals['INPUT_PULLUP'] = 2;
    for (let i = 0; i <= 15; i++) {
      this.globals[`A${i}`] = `A${i}`;
    }

    // Extract global variables
    const varMatches = code.matchAll(/(?:int|const\s+int|byte|uint8_t|long|unsigned\s+long|float|double)\s+(\w+)\s*=\s*([^;]+);/g);
    for (const match of varMatches) {
      const rhs = match[2].trim();
      if (this.globals[rhs] !== undefined) {
        this.globals[match[1]] = this.globals[rhs];
      } else {
        const val = parseFloat(rhs);
        this.globals[match[1]] = isNaN(val) ? rhs : val;
      }
    }

    // Extract #define constants
    const defineMatches = code.matchAll(/#define\s+(\w+)\s+(\w+)/g);
    for (const match of defineMatches) {
      const rhs = match[2].trim();
      if (this.globals[rhs] !== undefined) {
        this.globals[match[1]] = this.globals[rhs];
      } else {
        const val = parseInt(rhs);
        this.globals[match[1]] = isNaN(val) ? rhs : val;
      }
    }

    // Extract setup() body
    const setupBody = this.extractBalancedBlock(code, 'setup');
    if (setupBody !== null) {
      this.setupStatements = this.parseBlockStatements(setupBody);
    }

    // Extract loop() body
    const loopBody = this.extractBalancedBlock(code, 'loop');
    if (loopBody !== null) {
      this.loopStatements = this.parseBlockStatements(loopBody);
    }
  }

  private parseBlockStatements(code: string): ParsedStatement[] {
    const statements: ParsedStatement[] = [];
    let i = 0;
    const len = code.length;
    const isIdentifierChar = (ch: string | undefined) => Boolean(ch && /[a-zA-Z0-9_]/.test(ch));

    const skipWhitespaceAndComments = () => {
      while (i < len) {
        const ch = code[i];
        if (/\s/.test(ch)) {
          i++;
        } else if (ch === '/' && code[i + 1] === '/') {
          i++;
          while (i < len && code[i] !== '\n') i++;
        } else if (ch === '/' && code[i + 1] === '*') {
          i += 2;
          while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
          i += 2;
        } else {
          break;
        }
      }
    };

    const startsWithKeyword = (keyword: string) => {
      if (!code.startsWith(keyword, i)) return false;
      return !isIdentifierChar(code[i - 1]) && !isIdentifierChar(code[i + keyword.length]);
    };

    const advanceOverString = (quote: string) => {
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i++;
          return;
        }
        i++;
      }
    };

    const advanceOverLineComment = () => {
      i += 2;
      while (i < len && code[i] !== '\n') i++;
    };

    const advanceOverBlockComment = () => {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i = Math.min(len, i + 2);
    };

    const skipIgnorableInScanner = (): boolean => {
      if ((code[i] === '"' || code[i] === "'")) {
        advanceOverString(code[i]);
        return true;
      }
      if (code[i] === '/' && code[i + 1] === '/') {
        advanceOverLineComment();
        return true;
      }
      if (code[i] === '/' && code[i + 1] === '*') {
        advanceOverBlockComment();
        return true;
      }
      return false;
    };

    const readParenthesized = () => {
      if (code[i] !== '(') return '';
      const start = i + 1;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (skipIgnorableInScanner()) continue;
        if (code[i] === '(') depth++;
        else if (code[i] === ')') depth--;
        i++;
      }
      return code.substring(start, depth === 0 ? i - 1 : i).trim();
    };

    const readBracedBlock = () => {
      if (code[i] !== '{') return '';
      const start = i + 1;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (skipIgnorableInScanner()) continue;
        if (code[i] === '{') depth++;
        else if (code[i] === '}') depth--;
        i++;
      }
      return code.substring(start, depth === 0 ? i - 1 : i);
    };

    const readStatementText = () => {
      const start = i;
      let parenDepth = 0;
      let bracketDepth = 0;

      while (i < len) {
        if (skipIgnorableInScanner()) continue;
        const ch = code[i];
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === ';' && parenDepth === 0 && bracketDepth === 0) {
          i++;
          break;
        }
        i++;
      }

      return code.substring(start, i).trim();
    };

    const splitForHeader = (header: string): [string, string, string] => {
      const parts: string[] = [];
      let start = 0;
      let parenDepth = 0;
      let bracketDepth = 0;
      let quote: string | null = null;

      for (let j = 0; j < header.length; j++) {
        const ch = header[j];
        if (quote) {
          if (ch === '\\') {
            j++;
          } else if (ch === quote) {
            quote = null;
          }
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === ';' && parenDepth === 0 && bracketDepth === 0) {
          parts.push(header.substring(start, j).trim());
          start = j + 1;
        }
      }

      parts.push(header.substring(start).trim());
      return [parts[0] || '', parts[1] || '', parts[2] || ''];
    };

    const readBlockOrStatement = (): ParsedStatement[] => {
      skipWhitespaceAndComments();
      if (code[i] === '{') {
        return this.parseBlockStatements(readBracedBlock());
      }
      const statement = readStatementText();
      return statement ? [{ type: 'statement', code: statement }] : [];
    };

    const parseOne = (): ParsedStatement | null => {
      skipWhitespaceAndComments();
      if (i >= len) return null;

      if (startsWithKeyword('if')) {
        i += 2;
        skipWhitespaceAndComments();
        const condition = readParenthesized();
        const thenBlock = readBlockOrStatement();

        skipWhitespaceAndComments();
        let elseBlock: ParsedStatement[] = [];
        if (startsWithKeyword('else')) {
          i += 4;
          skipWhitespaceAndComments();
          if (startsWithKeyword('if')) {
            const nested = parseOne();
            elseBlock = nested ? [nested] : [];
          } else {
            elseBlock = readBlockOrStatement();
          }
        }

        return {
          type: 'if',
          condition,
          thenBlock,
          elseBlock,
        };
      }

      if (startsWithKeyword('for')) {
        i += 3;
        skipWhitespaceAndComments();
        const [init, condition, update] = splitForHeader(readParenthesized());
        const body = readBlockOrStatement();
        return { type: 'for', init, condition, update, body };
      }

      if (startsWithKeyword('while')) {
        i += 5;
        skipWhitespaceAndComments();
        const condition = readParenthesized();
        const body = readBlockOrStatement();
        return { type: 'while', condition, body };
      }

      const stmtText = readStatementText();
      return stmtText ? { type: 'statement', code: stmtText } : null;
    };

    while (i < len) {
      const statement = parseOne();
      if (statement) {
        statements.push(statement);
      } else {
        i++;
      }
    }

    return statements;
  }

  private preprocessExpression(expr: string): string {
    let replaced = expr;
    const drMatches = replaced.matchAll(/digitalRead\s*\(\s*(\w+)\s*\)/g);
    for (const match of drMatches) {
      const pin = this.canonicalPin(match[1]);
      const state = this.pins[pin]?.state === 'HIGH' ? '1' : '0';
      replaced = replaced.replace(match[0], state);
    }
    const arMatches = replaced.matchAll(/analogRead\s*\(\s*(\w+)\s*\)/g);
    for (const match of arMatches) {
      const pin = this.canonicalPin(match[1]);
      const val8 = this.pins[pin]?.value ?? 0;
      const val10 = Math.round((val8 / 255) * 1023);
      replaced = replaced.replace(match[0], String(val10));
    }

    // pulseIn(pin, HIGH/LOW) — for ultrasonic ECHO pin, returns duration proportional to distance
    const pulseMatches = Array.from(replaced.matchAll(/pulseIn\s*\(\s*(\w+)\s*,\s*(\w+)\s*(?:,\s*\w+\s*)?\)/g));
    for (const match of pulseMatches) {
      const nodes = useCanvasStore.getState().nodes;
      const sensor = nodes.find(n => n.type === 'SENSOR_ULTRASONIC' || n.type === 'ULTRASONIC_SENSOR');
      let duration = 0;
      if (sensor) {
        const dist = Number(sensor.properties?.distance ?? 100);
        duration = Math.round(dist * 58.2); // µs round-trip time for sound at 343 m/s
      }
      replaced = replaced.replace(match[0], String(duration));
    }

    // dht.readTemperature() & dht.readHumidity() inline replacement
    const dhtTempMatches = Array.from(replaced.matchAll(/dht\.readTemperature\s*\([^)]*\)/gi));
    for (const match of dhtTempMatches) {
      const sensor = useCanvasStore.getState().nodes.find(n => n.type === 'TEMP_SENSOR' || n.type === 'SENSOR_DHT11' || n.type === 'SENSOR_DHT22');
      const temp = sensor ? Number(sensor.properties?.temperature ?? 25) : 25;
      replaced = replaced.replace(match[0], String(temp));
    }

    const dhtHumMatches = Array.from(replaced.matchAll(/dht\.readHumidity\s*\([^)]*\)/gi));
    for (const match of dhtHumMatches) {
      const sensor = useCanvasStore.getState().nodes.find(n => n.type === 'TEMP_SENSOR' || n.type === 'SENSOR_DHT11' || n.type === 'SENSOR_DHT22');
      const hum = sensor ? Number(sensor.properties?.humidity ?? 60) : 60;
      replaced = replaced.replace(match[0], String(hum));
    }

    replaced = replaced
      .replace(/\bmillis\s*\(\s*\)/g, String(this.tick))
      .replace(/\bmicros\s*\(\s*\)/g, String(this.tick * 1000));

    // ── UART Interactive Serial CLI ──
    replaced = replaced.replace(/Serial\.available\s*\(\s*\)/g, String(this.localSerialBuffer.length));

    const readMatches = Array.from(replaced.matchAll(/Serial\.read\s*\(\s*\)/g));
    for (const match of readMatches) {
      let val = -1;
      if (this.localSerialBuffer.length > 0) {
        val = this.localSerialBuffer.charCodeAt(0);
        this.localSerialBuffer = this.localSerialBuffer.slice(1);
      }
      replaced = replaced.replace(match[0], String(val));
    }

    const parseIntMatches = Array.from(replaced.matchAll(/Serial\.parseInt\s*\(\s*\)/g));
    for (const match of parseIntMatches) {
      const intMatch = this.localSerialBuffer.match(/^[^\d-]*(-?\d+)/);
      let val = 0;
      if (intMatch) {
        val = parseInt(intMatch[1]);
        const index = this.localSerialBuffer.indexOf(intMatch[1]);
        this.localSerialBuffer = this.localSerialBuffer.slice(index + intMatch[1].length);
      } else {
        this.localSerialBuffer = '';
      }
      replaced = replaced.replace(match[0], String(val));
    }

    const parseFloatMatches = Array.from(replaced.matchAll(/Serial\.parseFloat\s*\(\s*\)/g));
    for (const match of parseFloatMatches) {
      const floatMatch = this.localSerialBuffer.match(/^[^\d.-]*(-?\d+(?:\.\d+)?)/);
      let val = 0.0;
      if (floatMatch) {
        val = parseFloat(floatMatch[1]);
        const index = this.localSerialBuffer.indexOf(floatMatch[1]);
        this.localSerialBuffer = this.localSerialBuffer.slice(index + floatMatch[1].length);
      } else {
        this.localSerialBuffer = '';
      }
      replaced = replaced.replace(match[0], String(val));
    }

    // ── Preprocess logical NOT (e.g. !state) ──
    const notMatches = Array.from(replaced.matchAll(/!\s*([a-zA-Z0-9_]+)/g));
    for (const match of notMatches) {
      const innerVal = this.evaluateExpression(this.resolveValue(match[1]));
      replaced = replaced.replace(match[0], innerVal === 0 ? '1' : '0');
    }

    return replaced;
  }

  private toStatementCode(code: string): string {
    const trimmed = code.trim();
    return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
  }

  private async executeParsedStatementsAsync(statements: ParsedStatement[], nodes: CanvasNode[], wires: Wire[], isSetup: boolean): Promise<void> {
    for (const stmt of statements) {
      if (!this.isRunning) return;
      if (stmt.type === 'if') {
        const cond = stmt.condition || '0';
        const preprocessed = this.preprocessExpression(cond);
        const condVal = this.evaluateExpression(preprocessed);
        if (condVal !== 0) {
          if (stmt.thenBlock) {
            await this.executeParsedStatementsAsync(stmt.thenBlock, nodes, wires, isSetup);
          }
        } else {
          if (stmt.elseBlock) {
            await this.executeParsedStatementsAsync(stmt.elseBlock, nodes, wires, isSetup);
          }
        }
      } else if (stmt.type === 'for') {
        if (stmt.init) {
          await this.executeParsedStatementsAsync([{ type: 'statement', code: this.toStatementCode(stmt.init) }], nodes, wires, isSetup);
        }

        let iterations = 0;
        while (this.isRunning && iterations < 10000) {
          const condition = stmt.condition?.trim();
          if (condition) {
            const preprocessed = this.preprocessExpression(condition);
            if (this.evaluateExpression(preprocessed) === 0) break;
          }

          if (stmt.body?.length) {
            await this.executeParsedStatementsAsync(stmt.body, nodes, wires, isSetup);
          }

          if (stmt.update) {
            await this.executeParsedStatementsAsync([{ type: 'statement', code: this.toStatementCode(stmt.update) }], nodes, wires, isSetup);
          }

          iterations++;
          if (iterations % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        if (iterations >= 10000) {
          this.callbacks.onError('Loop iteration limit reached; check for an infinite for-loop');
        }
      } else if (stmt.type === 'while') {
        let iterations = 0;
        while (this.isRunning && iterations < 10000) {
          const condition = stmt.condition?.trim() || '0';
          const preprocessed = this.preprocessExpression(condition);
          if (this.evaluateExpression(preprocessed) === 0) break;

          if (stmt.body?.length) {
            await this.executeParsedStatementsAsync(stmt.body, nodes, wires, isSetup);
          }

          iterations++;
          if (iterations % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        if (iterations >= 10000) {
          this.callbacks.onError('Loop iteration limit reached; check for an infinite while-loop');
        }
      } else if (stmt.type === 'statement' && stmt.code) {
        const codeText = stmt.code.replace(/;$/, '').trim();
        if (!codeText) continue;

        this.currentLine = this.findLineForStatement(stmt.code);

        // pinMode(pin, mode)
        const pinMode = codeText.match(/pinMode\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
        if (pinMode) {
          const pin = this.canonicalPin(pinMode[1]);
          const mode = this.resolvePinMode(pinMode[2]);
          const isPullup = mode === 'INPUT_PULLUP';
          this.pins[pin] = { mode, state: isPullup ? 'HIGH' : 'LOW', value: isPullup ? 255 : 0 };
          this.updateMNAPinMode(pin, mode);
          this.updateMNAPinVoltage(pin, isPullup ? 5 : 0);
          continue;
        }

        // Serial.begin(baud)
        const serialBegin = codeText.match(/Serial\.begin\s*\(\s*(\d+)\s*\)/);
        if (serialBegin) {
          const baudRate = Number(serialBegin[1]);
          this.callbacks.onBaudRateChange?.(baudRate);
          this.callbacks.onSerialOutput(`> Serial initialized at ${baudRate} baud`);
          continue;
        }

        // digitalWrite(pin, state)
        const dw = codeText.match(/digitalWrite\s*\(\s*([^,)]+)\s*,\s*(.+)\s*\)/);
        if (dw) {
          const pin = this.canonicalPin(dw[1].trim());
          const expr = dw[2].trim().replace(/\)$/, '');
          const preprocessed = this.preprocessExpression(expr);
          const stateVal = this.evaluateExpression(preprocessed);
          const state = stateVal !== 0 ? 'HIGH' : 'LOW';

          if (!this.pins[pin]) this.pins[pin] = { mode: 'OUTPUT', state: 'LOW', value: 0 };
          if (this.pins[pin].mode === 'INPUT' || this.pins[pin].mode === 'INPUT_PULLUP') {
            this.pins[pin].mode = state === 'HIGH' ? 'INPUT_PULLUP' : 'INPUT';
            this.updateMNAPinMode(pin, this.pins[pin].mode);
          }

          if (this.pins[pin].state !== state) {
            this.pins[pin].state = state;
            this.pins[pin].value = state === 'HIGH' ? 255 : 0;
            this.propagatePinState(pin, state, nodes, wires, state === 'HIGH' ? 255 : 0);
            this.updateMNAPinVoltage(pin, state === 'HIGH' ? 5 : 0);
            this.emitDebugSnapshot(false);
          }
          continue;
        }

        // analogWrite(pin, value) — PWM
        const aw = codeText.match(/analogWrite\s*\(\s*([^,)]+)\s*,\s*(.+)\s*\)/);
        if (aw) {
          const pin = this.canonicalPin(aw[1].trim());
          const expr = aw[2].trim().replace(/\)$/, '');
          const preprocessed = this.preprocessExpression(expr);
          const value = Math.min(255, Math.max(0, this.evaluateExpression(preprocessed)));

          if (!this.pins[pin]) this.pins[pin] = { mode: 'PWM', state: 'PWM', value: 0 };
          this.pins[pin].mode = 'PWM';
          this.pins[pin].state = 'PWM';
          this.pins[pin].value = value;
          this.updateMNAPinMode(pin, 'PWM');
          this.propagatePinState(pin, 'PWM', nodes, wires, value);
          this.updateMNAPinVoltage(pin, (value / 255) * 5);
          continue;
        }

        // tone(pin, frequency, duration)
        const toneMatch = codeText.match(/tone\s*\(\s*([^,)]+)\s*,\s*([^,)]+)(?:\s*,\s*([^,)]+))?\s*\)/i);
        if (toneMatch) {
          const pin = this.canonicalPin(toneMatch[1].trim());
          const freqExpr = toneMatch[2].trim();
          const freq = Math.max(1, this.evaluateExpression(this.preprocessExpression(freqExpr)) || 440);

          if (!this.pins[pin]) this.pins[pin] = { mode: 'PWM', state: 'PWM', value: 255 };
          this.pins[pin].state = 'PWM';
          this.pins[pin].value = 255;
          this.propagatePinState(pin, 'PWM', nodes, wires, freq);
          this.updateMNAPinVoltage(pin, 2.5);
          AudioEngine.playTone(freq);
          continue;
        }

        // noTone(pin)
        const noToneMatch = codeText.match(/noTone\s*\(\s*([^,)]+)\s*\)/i);
        if (noToneMatch) {
          const pin = this.canonicalPin(noToneMatch[1].trim());
          if (this.pins[pin]) {
            this.pins[pin].state = 'LOW';
            this.pins[pin].value = 0;
          }
          this.propagatePinState(pin, 'LOW', nodes, wires, 0);
          this.updateMNAPinVoltage(pin, 0);
          AudioEngine.stopTone();
          continue;
        }

        // dht.readTemperature()
        const dhtTempAssign = codeText.match(/(?:float\s+)?(\w+)\s*=\s*dht\.readTemperature\s*\(/i);
        if (dhtTempAssign) {
          const sensor = nodes.find(n => n.type === 'TEMP_SENSOR' || n.type === 'SENSOR_DHT11' || n.type === 'SENSOR_DHT22');
          let temp = 0;
          if (sensor && this.isNodePowered(sensor.id)) {
            temp = Number(sensor.properties?.temperature !== undefined ? sensor.properties.temperature : 25);
          } else if (!sensor) {
            temp = 24.5 + Math.sin(this.tick / 3000) * 2;
          }
          this.globals[dhtTempAssign[1]] = Math.round(temp * 10) / 10;
          this.emitDebugSnapshot(false);
          continue;
        }

        // dht.readHumidity()
        const dhtHumAssign = codeText.match(/(?:float\s+)?(\w+)\s*=\s*dht\.readHumidity\s*\(/i);
        if (dhtHumAssign) {
          const sensor = nodes.find(n => n.type === 'TEMP_SENSOR' || n.type === 'SENSOR_DHT11' || n.type === 'SENSOR_DHT22');
          let hum = 0;
          if (sensor && this.isNodePowered(sensor.id)) {
            hum = Number(sensor.properties?.humidity !== undefined ? sensor.properties.humidity : 60);
          } else if (!sensor) {
            hum = 58 + Math.cos(this.tick / 5000) * 5;
          }
          this.globals[dhtHumAssign[1]] = Math.round(hum * 10) / 10;
          this.emitDebugSnapshot(false);
          continue;
        }

        // Ultrasonic read: sonar.ping_cm() / sonar.readDistance()
        const sonarAssign = codeText.match(/(?:float|int|long)?\s*(\w+)\s*=\s*sonar\.(?:ping_cm|readDistance|ping)\s*\(/i);
        if (sonarAssign) {
          const sensor = nodes.find(n => n.type === 'SENSOR_ULTRASONIC' || n.type === 'ULTRASONIC_SENSOR');
          let dist = 0;
          if (sensor && this.isNodePowered(sensor.id)) {
            dist = Number(sensor.properties?.distance !== undefined ? sensor.properties.distance : 100);
          } else if (!sensor) {
            dist = 120 + Math.sin(this.tick / 1000) * 20;
          }
          this.globals[sonarAssign[1]] = Math.round(dist);
          this.emitDebugSnapshot(false);
          continue;
        }

        // Accelerometer / Gyro read: mpu.getAccelerationX() / Y / Z
        const mpuAssign = codeText.match(/(?:float|double)?\s*(\w+)\s*=\s*mpu\.get(?:Acceleration|Gyro)([XYZ])\s*\(/i);
        if (mpuAssign) {
          const axis = mpuAssign[2].toUpperCase();
          const isGyro = codeText.toLowerCase().includes('gyro');
          const sensor = nodes.find(n => n.type === 'SENSOR_IMU');
          let val = 0;
          if (sensor && this.isNodePowered(sensor.id)) {
            const propName = isGyro ? `gyro${axis}` : `acceleration${axis}`;
            val = Number(sensor.properties?.[propName] !== undefined ? sensor.properties[propName] : 0);
          }
          this.globals[mpuAssign[1]] = val;
          this.emitDebugSnapshot(false);
          continue;
        }

        // dht.begin() — silently consume
        if (/dht\.begin\s*\(/i.test(codeText)) continue;

        // delay(ms) — simulate timing
        const delay = codeText.match(/delay\s*\(\s*(.+?)\s*\)/);
        if (delay) {
          const ms = this.evaluateExpression(this.preprocessExpression(delay[1]));
          if (ms > 0) {
            await new Promise<void>(resolve => {
              const startDelay = Date.now();
              const checkInterval = setInterval(() => {
                if (!this.isRunning || Date.now() - startDelay >= ms) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 25);
            });
          }
          continue;
        }

        // Serial.print(...) / Serial.println(...)
        const serialPrint = codeText.match(/Serial\.(print|println)\s*\(\s*(.*?)\s*\)$/);
        if (serialPrint) {
          const method = serialPrint[1];
          const text = this.resolveSerialArgument(serialPrint[2]);
          const newline = method === 'println';

          const key = `${method}_${text}_${Math.floor(this.tick / 500)}`;
          if (!this.serialThrottle.has(key)) {
            this.serialThrottle.add(key);
            this.writeSerial(text, newline);
          }
          continue;
        }

        // ── LCD commands ──
        if (this.handleLcdStatement(codeText, nodes)) continue;

        // ── ESC / Servo writeMicroseconds / write ──
        if (this.handleEscStatement(codeText, nodes, wires)) continue;

        // I2C / Wire.h commands — silently consume so they don't cause errors
        if (/Wire\.|lcd\.|dht\.|servo\.|esc\.|myservo\./i.test(codeText)) continue;

        // C++ class constructors (e.g., LiquidCrystal_I2C lcd(...), Servo myservo, DHT dht(...))
        if (/^(?:LiquidCrystal|Servo|DHT|NewPing|Adafruit_|Wire|SoftwareSerial|ESP|IRrecv)\w*\s+\w+/i.test(codeText)) continue;

        // #include directives
        if (/^#\s*include\b/.test(codeText)) continue;

        const unaryUpdate = codeText.match(/^(?:\+\+|--)?\s*([a-zA-Z_]\w*)\s*(?:\+\+|--)\s*$/);
        if (unaryUpdate) {
          const op = codeText.includes('--') ? -1 : 1;
          const current = this.evaluateExpression(String(this.globals[unaryUpdate[1]] ?? 0));
          this.globals[unaryUpdate[1]] = current + op;
          this.emitDebugSnapshot(false);
          continue;
        }

        const compoundAssign = codeText.match(/^([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
        if (compoundAssign) {
          const varName = compoundAssign[1];
          const current = this.evaluateExpression(String(this.globals[varName] ?? 0));
          const rhs = this.evaluateExpression(this.preprocessExpression(compoundAssign[3]));
          switch (compoundAssign[2]) {
            case '+': this.globals[varName] = current + rhs; break;
            case '-': this.globals[varName] = current - rhs; break;
            case '*': this.globals[varName] = current * rhs; break;
            case '/': this.globals[varName] = rhs !== 0 ? Math.floor(current / rhs) : 0; break;
            case '%': this.globals[varName] = rhs !== 0 ? current % rhs : 0; break;
          }
          this.emitDebugSnapshot(false);
          continue;
        }

        // Variable assignment: varName = expression
        const assignMatch = codeText.match(/^(?:int|const\s+int|byte|uint8_t|long|unsigned\s+long|float|double|auto)?\s*(\w+)\s*=\s*(.*)$/);
        if (assignMatch) {
          const varName = assignMatch[1].trim();
          const rhs = assignMatch[2].trim();
          const preprocessed = this.preprocessExpression(rhs);
          const val = this.evaluateExpression(preprocessed);
          this.globals[varName] = val;
          this.emitDebugSnapshot(false);
          continue;
        }

        const declarationMatch = codeText.match(/^(?:int|byte|uint8_t|long|unsigned\s+long|float|double|auto)\s+(\w+)$/);
        if (declarationMatch) {
          this.globals[declarationMatch[1]] = 0;
          this.emitDebugSnapshot(false);
          continue;
        }
      }
    }
  }

  /**
   * Parse and execute LCD-related statements.
   * Uses simple string matching — no regex escaping issues.
   * Supports any object name: lcd, display, oled, myLcd, etc.
   */
  private handleLcdStatement(stmt: string, nodes: CanvasNode[]): boolean {
    const s = stmt.trim();
    const dotIdx = s.indexOf('.');
    if (dotIdx < 1) return false;
    const objName = s.substring(0, dotIdx).trim().toLowerCase();
    if (objName.indexOf('lcd') < 0 && objName.indexOf('display') < 0 && objName.indexOf('oled') < 0) return false;
    const afterDot = s.substring(dotIdx + 1);
    const parenIdx = afterDot.indexOf('(');
    if (parenIdx < 0) return false;
    const method = afterDot.substring(0, parenIdx).trim().toLowerCase();
    const lastParen = afterDot.lastIndexOf(')');
    const args = lastParen > parenIdx ? afterDot.substring(parenIdx + 1, lastParen).trim() : '';

    if (method === 'init' || method === 'begin') {
      this.lcdInitialized = true;
      this.lcdBuffer = Array.from({ length: this.lcdRows }, () => Array(this.lcdCols).fill(' '));
      this.lcdCursorRow = 0;
      this.lcdCursorCol = 0;
      this.pushLcdToCanvas(nodes);
      return true;
    }
    if (method === 'backlight') {
      this.lcdBacklight = true;
      this.pushLcdToCanvas(nodes);
      return true;
    }
    if (method === 'nobacklight') {
      this.lcdBacklight = false;
      this.pushLcdToCanvas(nodes);
      return true;
    }
    if (method === 'clear' || method === 'cleardisplay') {
      this.lcdBuffer = Array.from({ length: this.lcdRows }, () => Array(this.lcdCols).fill(' '));
      this.lcdCursorRow = 0;
      this.lcdCursorCol = 0;
      this.pushLcdToCanvas(nodes);
      return true;
    }
    if (method === 'display') {
      this.pushLcdToCanvas(nodes);
      return true;
    }
    if (method === 'setcursor') {
      const parts = args.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        this.lcdCursorCol = Math.max(0, Math.min(this.lcdCols - 1, parseInt(this.resolveValue(parts[0])) || 0));
        this.lcdCursorRow = Math.max(0, Math.min(this.lcdRows - 1, parseInt(this.resolveValue(parts[1])) || 0));
      }
      return true;
    }
    if (method === 'print' || method === 'println') {
      const text = this.resolveSerialArgument(args);
      this.lcdWriteText(text);
      if (method === 'println') {
        this.lcdCursorCol = 0;
        this.lcdCursorRow = Math.min(this.lcdRows - 1, this.lcdCursorRow + 1);
      }
      this.pushLcdToCanvas(nodes);
      return true;
    }
    // Silently consume other known LCD/OLED library commands
    const known = 'settextsize,settextcolor,setrotation,drawpixel,drawline,drawrect,fillrect,drawcircle,fillcircle,home,nocursor,cursor,noblink,blink,nodisplay,scrolldisplayleft,scrolldisplayright,autoscroll,noautoscroll,createchar,write,setcursorposition';
    if (known.split(',').indexOf(method) >= 0) return true;
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

  /** Push the current LCD buffer text to canvas display nodes. Throttled to 5fps. */
  private pushLcdToCanvas(_nodes: CanvasNode[]) {
    const now = Date.now();
    if (now - this.lastLcdPushTime < 200) {
      // Schedule a deferred push if one isn't already pending
      if (!this.lcdPushPending) {
        this.lcdPushPending = true;
        setTimeout(() => {
          this.lcdPushPending = false;
          if (this.isRunning) this.pushLcdToCanvasImmediate();
        }, 200);
      }
      return;
    }
    this.lastLcdPushTime = now;
    this.pushLcdToCanvasImmediate();
  }

  private pushLcdToCanvasImmediate() {
    (globalThis as any).__voltforgeLcdState = (globalThis as any).__voltforgeLcdState || {};

    this.lcdNodes.forEach(lcdNode => {
      const line1 = this.lcdBuffer[0]?.join('') || '';
      const line2 = this.lcdBuffer[1]?.join('') || '';

      (globalThis as any).__voltforgeLcdState[lcdNode.id] = {
        line1, line2, backlight: this.lcdBacklight,
      };

      // Trigger LogicRegistry to push properties to canvas store
      this.callbacks.onPinStateChange(lcdNode.id, '__lcd_display__', 'HIGH', 0);
    });
  }

  private evaluateExpression(expr: string): number {
    return evaluateNumericExpression(expr, (name) => {
      const value = this.globals[name];
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return Number(value) || 0;
      return 0;
    });
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
        const pin = this.canonicalPin(match[1]);
        return this.pins[pin]?.state === 'HIGH' ? '1' : '0';
      }
    }

    if (raw.startsWith('analogRead')) {
      const match = raw.match(/analogRead\s*\(\s*(\w+)\s*\)/);
      if (match) {
        const pin = this.canonicalPin(match[1]);
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
      isBoardComponentType(n.type)
    );
    if (!mcuNode) return;

    const canonical = this.canonicalPin(pin);
    const mcuPin = mcuNode.pins?.find(p => this.pinNumberFromBoardPin(p) === canonical);
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
  private handleEscStatement(stmt: string, nodes: CanvasNode[], wires: Wire[]): boolean {
    const s = stmt.trim();

    // Consume attach patterns: esc.attach(pin) / myservo.attach(pin)
    const attachMatch = s.match(/(\w+)\.attach\s*\(\s*([^,)]+)\s*(?:,|\))/i);
    if (attachMatch && /(?:esc|servo)/i.test(attachMatch[1])) {
      this.servoAttachments.set(attachMatch[1].toLowerCase(), this.canonicalPin(attachMatch[2].trim()));
      return true;
    }

    // writeMicroseconds: 1000µs = 0%, 2000µs = 100%
    const wmsMatch = s.match(/(\w+)\.writeMicroseconds\s*\(\s*(\w+)\s*\)/i);
    if (wmsMatch) {
      const objectName = wmsMatch[1].toLowerCase();
      if (!/(?:esc|servo)/i.test(objectName) && !this.servoAttachments.has(objectName)) return false;
      const usValue = Math.max(1000, Math.min(2000, parseInt(this.resolveValue(wmsMatch[2])) || 1000));
      const pwmValue = Math.round(((usValue - 1000) / 1000) * 255);
      this.propagateServoOrEscSignal(objectName, pwmValue, nodes, wires);
      return true;
    }

    // write: 0-180 servo-style mapping
    const wMatch = s.match(/(\w+)\.write\s*\(\s*(\w+)\s*\)/i);
    if (wMatch) {
      const objectName = wMatch[1].toLowerCase();
      if (!/(?:esc|servo)/i.test(objectName) && !this.servoAttachments.has(objectName)) return false;
      const angle = Math.max(0, Math.min(180, parseInt(this.resolveValue(wMatch[2])) || 0));
      const pwmValue = Math.round((angle / 180) * 255);
      this.propagateServoOrEscSignal(objectName, pwmValue, nodes, wires);
      return true;
    }

    return false;
  }

  private propagateServoOrEscSignal(objectName: string, pwmValue: number, nodes: CanvasNode[], wires: Wire[]) {
    const attachedPin = this.servoAttachments.get(objectName);
    if (attachedPin) {
      if (!this.pins[attachedPin]) this.pins[attachedPin] = { mode: 'PWM', state: 'PWM', value: pwmValue };
      this.pins[attachedPin].mode = 'PWM';
      this.pins[attachedPin].state = 'PWM';
      this.pins[attachedPin].value = pwmValue;
      this.updateMNAPinMode(attachedPin, 'PWM');
      this.updateMNAPinVoltage(attachedPin, (pwmValue / 255) * 5);
      this.propagatePinState(attachedPin, 'PWM', nodes, wires, pwmValue);
    } else if (/servo/i.test(objectName)) {
      this.propagateServoSignal(pwmValue);
    }

    if (/esc/i.test(objectName) || !attachedPin) {
      this.propagateEscSignal(pwmValue);
    }
  }

  private propagateServoSignal(pwmValue: number) {
    const servoNodes = useCanvasStore.getState().nodes.filter(
      (node) => node.type === 'SERVO_MOTOR' || node.type === 'MOTOR_SERVO'
    );
    servoNodes.forEach((servoNode) => {
      const signalPin = servoNode.pins?.find((pin) => pin.id === 'sig' || pin.id === 'signal');
      if (signalPin) {
        this.callbacks.onPinStateChange(servoNode.id, signalPin.id, 'PWM', pwmValue);
      }
    });
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
  /**
   * Animate DC motors: increment rotation if isSpinning is true.
   * Throttled to 20fps to avoid freezing the React rendering main thread.
   */
  private updateDcMotorAnimation() {
    const now = Date.now();
    if (now - this.lastDcMotorUpdateTime < 50) return;
    this.lastDcMotorUpdateTime = now;

    const freshNodes = useCanvasStore.getState().nodes;
    const updatesList: Array<{ id: string; changes: Partial<CanvasNode> }> = [];

    this.dcMotorNodes.forEach(motor => {
      const freshMotor = freshNodes.find(n => n.id === motor.id);
      if (!freshMotor) return;

      const isSpinning = Boolean(freshMotor.properties?.isSpinning);
      if (!isSpinning) return;

      const currentTick = Number(freshMotor.properties?.motorTick) || 0;
      const newTick = (currentTick + 30) % 360; // 30° per tick = smooth rotation

      this.callbacks.onPinStateChange(motor.id, '__dc_anim__', 'HIGH', newTick);

      updatesList.push({
        id: motor.id,
        changes: {
          properties: {
            ...freshMotor.properties,
            motorTick: newTick,
          },
        },
      });
    });

    if (updatesList.length > 0) {
      useCanvasStore.getState().batchUpdateNodes(updatesList);
    }
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

      if (isBoardComponentType(node.type)) {
        const pinNumber = this.pinNumberFromBoardPin(pin);
        if (!pinNumber) continue;
        const pinInfo = this.pins[pinNumber];
        if (!pinInfo) continue;
        const logicVoltage = this.boardLogicVoltage(node.type);
        if (pinInfo.state === 'PWM') return (pinInfo.value / 255) * logicVoltage;
        if (pinInfo.state === 'HIGH') return logicVoltage;
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

      const currentNode = useCanvasStore.getState().nodesById.get(currentNodeId);
      if (currentNode?.type === 'BREADBOARD') {
        for (const linkedPinId of this.getBreadboardLinkedPins(currentPinId, currentNode.pins || [])) {
          const next = `${currentNodeId}:${linkedPinId}`;
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }

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

  private getBreadboardLinkedPins(pinId: string, pins: Array<{ id: string }>): string[] {
    const available = new Set(pins.map(pin => pin.id));
    const rowMatch = pinId.match(/^([a-j])(\d+)$/i);
    if (rowMatch) {
      const row = rowMatch[1].toLowerCase();
      const column = rowMatch[2];
      const rows = row <= 'e' ? ['a', 'b', 'c', 'd', 'e'] : ['f', 'g', 'h', 'i', 'j'];
      return rows.map(candidate => `${candidate}${column}`).filter(candidate => available.has(candidate));
    }

    const railMatch = pinId.match(/^(vcc|gnd)_(?:top|bottom)_\d+$/i);
    if (railMatch) {
      const rail = railMatch[1].toLowerCase();
      return pins
        .map(pin => pin.id)
        .filter(candidate => new RegExp(`^${rail}_(?:top|bottom)_\\d+$`, 'i').test(candidate));
    }

    return [pinId];
  }

  private pinNumberFromBoardPin(pin: { id: string; name: string }) {
    const pinStr = `${pin.name} ${pin.id}`;
    const analogMatch = pinStr.match(/\bA([0-9]{1,2})\b/i);
    if (analogMatch) {
      return `A${Number(analogMatch[1])}`;
    }
    const match = pinStr.match(/\bD(\d{1,2})\b/i);
    if (match) return String(Number(match[1]));
    if (/\bTX\b/i.test(pinStr)) return '1';
    if (/\bRX\b/i.test(pinStr)) return '3';
    return '';
  }

  private canonicalPin(pin: string) {
    const resolved = this.resolveValue(pin.trim()).trim();
    const analogMatch = resolved.match(/^A([0-9]{1,2})$/i);
    if (analogMatch) return `A${Number(analogMatch[1])}`;

    const digitalMatch = resolved.match(/^D?([0-9]{1,2})$/i);
    if (digitalMatch) return String(Number(digitalMatch[1]));

    return resolved;
  }

  private mnaPinSuffix(pin: string) {
    const canonical = this.canonicalPin(pin);
    return canonical.toUpperCase().startsWith('A')
      ? `a${canonical.slice(1)}`
      : `d${canonical}`;
  }

  private resolvePinMode(modeToken: string): PinInfo['mode'] {
    const mode = this.resolveValue(modeToken.trim()).toUpperCase();
    if (mode === '2' || mode === 'INPUT_PULLUP') return 'INPUT_PULLUP';
    if (mode === '1' || mode === 'OUTPUT') return 'OUTPUT';
    return 'INPUT';
  }

  private resolveValue(val: string): string {
    if (this.globals[val] !== undefined) return this.globals[val].toString();
    return val;
  }

  public setExternalPinState(pin: string, state: PinState) {
    const canonical = this.canonicalPin(pin);
    if (!this.pins[canonical]) {
      this.pins[canonical] = { mode: 'INPUT', state: 'LOW', value: 0 };
    }
    this.pins[canonical].state = state;
    this.pins[canonical].value = state === 'HIGH' ? 1 : 0;
    const avrPort = this.boardPinToAvrPort(canonical);
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

    this.avrAdc = new AVRADC(this.avrCpu, adcConfig);

    const twi = new AVRTWI(this.avrCpu, twiConfig, 16_000_000);
    twi.eventHandler = new LcdTWIEventHandler(twi, this.lcdNodes, this.callbacks);

    const handlePort = (portName: 'B' | 'C' | 'D', value: number) => {
      for (let bit = 0; bit < 8; bit += 1) {
        const pin = this.avrPortToBoardPin(portName, bit);
        if (!pin) continue;

        const pinState = this.avrPorts[portName].pinState(bit);
        const isOutput = pinState === AvrPinState.High || pinState === AvrPinState.Low;
        const isPullUp = pinState === AvrPinState.InputPullUp;

        const mode = isOutput ? 'OUTPUT' : isPullUp ? 'INPUT_PULLUP' : 'INPUT';
        const high = isOutput ? (pinState === AvrPinState.High) : isPullUp;
        const state = high ? 'HIGH' : 'LOW';
        const val = high ? 255 : 0;

        const prevPin = this.pins[pin];
        const changed = !prevPin || prevPin.mode !== mode || prevPin.state !== state;

        if (changed) {
          this.pins[pin] = { mode, state, value: val };
          this.propagatePinState(pin, state, nodes, wires, val);

          // Find MCU node
          const mcuNode = useCanvasStore.getState().nodes.find(n =>
            isBoardComponentType(n.type)
          );
          if (mcuNode) {
            const isPowered = mcuNode.properties?.boardPowered !== false;
            let resistance = 1e8; // Default to input high impedance
            if (isPowered) {
              if (isOutput) resistance = 40;
              else if (isPullUp) resistance = 40000;
            }
            this.solverWorker?.postMessage({
              type: 'UPDATE_PIN',
              elementId: `r_mcu_pin_${mcuNode.id}_${this.mnaPinSuffix(pin)}`,
              voltage: resistance,
            });
            this.updateMNAPinVoltage(pin, high ? 5 : 0);
          }
        }
      }
    };
    this.avrPorts.B.addListener((value) => handlePort('B', value));
    this.avrPorts.C.addListener((value) => handlePort('C', value));
    this.avrPorts.D.addListener((value) => handlePort('D', value));

    this.callbacks.onSerialOutput('> AVR8js CPU Started');
    this.intervalId = window.setInterval(() => {
      if (!this.isRunning || !this.avrCpu) return;
      const cpu = this.avrCpu;

      this.runBatched(() => {
        const inputs = useSimulationStore.getState().drainSerialInput();
        if (inputs.length > 0) {
          const str = inputs.join('');
          for (let i = 0; i < str.length; i++) {
            this.avrUsart?.writeByte(str.charCodeAt(i));
          }
        }

        const currentNodes = useCanvasStore.getState().nodes;
        const mcuNode = currentNodes.find(n =>
          isBoardComponentType(n.type)
        );
        const isPowered = mcuNode ? mcuNode.properties?.boardPowered !== false : true;

        if (isPowered) {
          for (let i = 0; i < 25000; i += 1) {
            avrInstruction(cpu);
            cpu.tick();
          }
        }
        this.updateBldcMotorAnimation();
        this.updateDcMotorAnimation();
        this.pushLcdToCanvas(currentNodes);
        this.updateDiagnosticProbes(currentNodes, wires);
        this.emitDebugSnapshot(false);
      });
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
    if (port === 'C' && bit <= 5) return `A${bit}`;
    return '';
  }

  private boardPinToAvrPort(pin: string) {
    const canonical = this.canonicalPin(pin);
    let value = Number(canonical);
    if (isNaN(value)) {
      if (canonical.startsWith('A')) {
        value = 14 + Number(canonical.slice(1));
      } else if (canonical.startsWith('D')) {
        value = Number(canonical.slice(1));
      }
    }
    if (value >= 0 && value <= 7) return { port: 'D', bit: value };
    if (value >= 8 && value <= 13) return { port: 'B', bit: value - 8 };
    if (value >= 14 && value <= 19) return { port: 'C', bit: value - 14 };
    return null;
  }

  private findLineForStatement(statementCode: string) {
    if (!statementCode) return null;
    const cleanStmt = statementCode.trim();
    const idx = this.originalCodeLines.findIndex(line => line.includes(cleanStmt));
    return idx >= 0 ? idx + 1 : null;
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

  private runBatched(fn: () => void) {
    if (this.isBatching) {
      fn();
      return;
    }

    this.isBatching = true;
    this.accumulatedUpdates.clear();

    const store = useCanvasStore.getState() as any;
    this.originalUpdateNode = store.updateNode;

    store.updateNode = (id: string, updates: Partial<CanvasNode>) => {
      const hasGeometry = Object.keys(updates).some(k =>
        k === 'x' || k === 'y' || k === 'width' || k === 'height' || k === 'rotation' || k === 'pins'
      );
      if (hasGeometry) {
        this.originalUpdateNode.call(store, id, updates);
        return;
      }

      let existing = this.accumulatedUpdates.get(id);
      if (!existing) {
        existing = {};
        this.accumulatedUpdates.set(id, existing);
      }
      if (updates.properties) {
        existing.properties = {
          ...existing.properties,
          ...updates.properties
        };
      }
      Object.entries(updates).forEach(([key, val]) => {
        if (key !== 'properties') {
          existing![key] = val;
        }
      });
    };

    try {
      fn();
    } finally {
      this.isBatching = false;
      if (this.originalUpdateNode) {
        store.updateNode = this.originalUpdateNode;
        this.originalUpdateNode = null;
      }

      if (this.accumulatedUpdates.size > 0) {
        const batch: Array<{ id: string; changes: Partial<CanvasNode> }> = [];

        this.accumulatedUpdates.forEach((changes, id) => {
          const node = store.nodes.find((n: any) => n.id === id);
          if (node) {
            const mergedProperties = changes.properties
              ? { ...node.properties, ...changes.properties }
              : node.properties;

            batch.push({
              id,
              changes: {
                ...changes,
                properties: mergedProperties
              }
            });
          }
        });

        if (batch.length > 0) {
          store.batchUpdateNodes(batch);
        }
        this.accumulatedUpdates.clear();
      }
    }
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
    this.avrAdc = null;
    this.stopMNASolver();
    this.stopSensorAutoCycling();
    AudioEngine.stopTone();
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    // Turn off board LEDs & reset all component states to unpowered/inactive
    this.runBatched(() => {
      const { updateNode, nodes } = useCanvasStore.getState();
      nodes.forEach(node => {
        const updates: Record<string, any> = {};
        let changed = false;

        if (isBoardComponentType(node.type)) {
          updates.boardPowered = false;
          updates.builtInLedLit = false;
          changed = true;
        } else if (node.type.includes('LED')) {
          updates.isLit = false;
          updates.rgbRed = 0;
          updates.rgbGreen = 0;
          updates.rgbBlue = 0;
          changed = true;
        } else if (node.type === 'DISPLAY_LCD_I2C' || node.type === 'LCD_16X2' || node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY') {
          updates.lcdBacklight = false;
          updates.lcdLine1 = '';
          updates.lcdLine2 = '';
          changed = true;
        } else if (node.type === 'DISPLAY_7SEG') {
          updates.isActive = false;
          updates.segments = {};
          updates.displayDigit = '';
          changed = true;
        } else if (node.type === 'MOTOR_DC') {
          updates.isSpinning = false;
          updates.rpm = 0;
          updates.motorTick = 0;
          changed = true;
        } else if (node.type === 'MOTOR_BLDC') {
          updates.bldcRpm = 0;
          updates.bldcRotation = 0;
          updates.isSpinning = false;
          changed = true;
        } else if (node.type === 'MOTOR_STEPPER' || node.type === 'STEPPER_MOTOR') {
          updates.isSpinning = false;
          updates.stepperRotation = 0;
          updates.stepperSteps = 0;
          changed = true;
        } else if (node.type === 'BUZZER') {
          updates.isBeeping = false;
          changed = true;
        } else if (node.type.startsWith('RELAY_')) {
          updates.isActive = false;
          updates.isSwitched = false;
          Object.keys(node.properties || {}).forEach(k => {
            if (k.startsWith('isSwitched_')) {
              updates[k] = false;
            }
          });
          changed = true;
        } else if (node.type === 'MULTIMETER' || node.type === 'AMMETER' || node.type === 'OSCILLOSCOPE') {
          updates.displayValue = node.type === 'MULTIMETER' ? '0.00V' : node.type === 'AMMETER' ? '0.00 mA' : 'SCOPE';
          updates.measuredVoltage = 0;
          updates.measuredCurrent = 0;
          changed = true;
        }

        if (changed) {
          updateNode(node.id, {
            properties: {
              ...node.properties,
              ...updates,
            }
          });
        }
      });
    });

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
      const pinModes: Record<string, string> = {};
      Object.entries(this.pins).forEach(([pin, info]) => {
        pinModes[pin] = info.mode;
      });

      const boardPoweredMap: Record<string, boolean> = {};
      nodes.forEach(node => {
        if (isBoardComponentType(node.type)) {
          boardPoweredMap[node.id] = node.properties?.boardPowered !== false;
        }
      });

      // Build the circuit netlist
      this.mnaCircuit = buildMNACircuit(nodes, wires, this.mcuPinVoltages, pinModes, boardPoweredMap);

      const elementIds = new Set<string>();
      for (const element of this.mnaCircuit.elements) {
        if (elementIds.has(element.id)) {
          throw new Error(`Duplicate circuit element id: ${element.id}`);
        }
        elementIds.add(element.id);
      }

      if (this.mnaCircuit.elements.length === 0) {
        // No solvable elements — skip solver
        return;
      }

      // Create WebWorker
      this.solverWorker = new Worker(
        new URL('./SimulationWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from the worker — throttle RESULT to ~15fps to avoid
      // starving the main-thread event loop with Zustand dispatches + React
      // reconciliation on every 16ms solver tick.
      this.solverWorker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (msg.type === 'RESULT') {
          this.pendingResult = msg as WorkerResultMessage;
          const now = performance.now();
          if (now - this.lastResultTime >= 66) {
            // Enough time has passed — process immediately
            this.lastResultTime = now;
            this.handleSolverResult(this.pendingResult!, nodes);
            this.pendingResult = null;
          } else if (!this.resultRafId) {
            // Schedule deferred processing on the next animation frame
            this.resultRafId = requestAnimationFrame(() => {
              this.resultRafId = null;
              if (this.pendingResult) {
                this.lastResultTime = performance.now();
                this.handleSolverResult(this.pendingResult!, nodes);
                this.pendingResult = null;
              }
            });
          }
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
    this.pendingResult = null;
    if (this.resultRafId) {
      cancelAnimationFrame(this.resultRafId);
      this.resultRafId = null;
    }

    // Clear solver state in store
    useSimulationStore.getState().setCircuitState({}, {}, {}, {}, true);
    useSimulationStore.getState().clearOscilloscopeData();
  }

  /** Pause all simulation-time work while retaining the solved circuit state. */
  public pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    AudioEngine.stopTone();
    this.solverWorker?.postMessage({ type: 'PAUSE' } as WorkerInMessage);
    this.emitDebugSnapshot(true);
  }

  /** Resume the simulation from its current transient state. */
  public resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.solverWorker?.postMessage({ type: 'RESUME' } as WorkerInMessage);
    this.emitDebugSnapshot(false);
  }

  /** Advance exactly one MNA transient step while paused. */
  public step() {
    if (!this.isRunning || !this.isPaused) return;
    this.solverWorker?.postMessage({ type: 'STEP' } as WorkerInMessage);
  }

  /** Set simulation playback speed without changing the physical time step. */
  public setSpeed(nextSpeed: number) {
    this.simulationSpeed = Math.max(0.05, Math.min(20, Number.isFinite(nextSpeed) ? nextSpeed : 1));
    this.solverWorker?.postMessage({
      type: 'SET_SPEED',
      speed: this.simulationSpeed,
    } as WorkerInMessage);
  }

  /**
   * Update a specific MCU pin voltage in the solver.
   * Called whenever digitalWrite/analogWrite changes a pin.
   */
  private updateMNAPinVoltage(pin: string, voltage: number) {
    const canonical = this.canonicalPin(pin);
    const nodes = useCanvasStore.getState().nodes;
    const mcuNode = nodes.find(n =>
      isBoardComponentType(n.type)
    );
    if (!mcuNode) return;
    const boundedVoltage = Math.max(0, Math.min(this.boardLogicVoltage(mcuNode.type), voltage));
    this.mcuPinVoltages[canonical] = boundedVoltage;

    if (!this.solverWorker || !this.mnaCircuit) return;

    // Build the element ID that matches NetlistBuilder naming (renamed to _src)
    const elementId = `vs_mcu_${mcuNode.id}_${this.mnaPinSuffix(canonical)}_src`;

    const updateMsg: WorkerInMessage = {
      type: 'UPDATE_PIN',
      elementId,
      voltage: boundedVoltage,
    };
    this.solverWorker.postMessage(updateMsg);
  }

  private updateMNAPinMode(pin: string, mode: string) {
    if (!this.solverWorker || !this.mnaCircuit) return;
    const canonical = this.canonicalPin(pin);
    const nodes = useCanvasStore.getState().nodes;
    const mcuNode = nodes.find(n =>
      isBoardComponentType(n.type)
    );
    if (!mcuNode) return;

    const isOutput = mode === 'OUTPUT' || mode === 'PWM';
    const isPullup = mode === 'INPUT_PULLUP';
    const isPowered = mcuNode.properties?.boardPowered !== false;
    const resistance = isPowered
      ? isOutput ? 40 : isPullup ? 40000 : 1e8
      : 1e8;

    this.solverWorker.postMessage({
      type: 'UPDATE_PIN',
      elementId: `r_mcu_pin_${mcuNode.id}_${this.mnaPinSuffix(canonical)}`,
      voltage: resistance,
    });

    if (isPullup) {
      this.updateMNAPinVoltage(canonical, this.boardLogicVoltage(mcuNode.type));
    }
  }

  private boardLogicVoltage(type: string): number {
    return getBoardLogicVoltage(type);
  }

  /**
   * Handle solver results from the WebWorker.
   * Maps MNA element IDs back to canvas components and dispatches visual updates.
   */
  /**
   * Helper to check if a component is powered (voltage difference > 3V).
   */
  private isNodePowered(nodeId: string): boolean {
    if (!this.mnaCircuit) return true;
    const pinToMNANode = this.mnaCircuit.pinToMNANode;

    const nodes = useCanvasStore.getState().nodes;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return true;

    // Find power and ground pins by labels
    const vccPin = node.pins?.find(p => /^(VCC|VDD|3V3|3\.3V|5V)$/i.test(p.name.trim()));
    const gndPin = node.pins?.find(p => /^(GND|GROUND|VSS)$/i.test(p.name.trim()));
    if (!vccPin || !gndPin) return true;

    const vccIndex = pinToMNANode.get(`${nodeId}:${vccPin.id}`);
    const gndIndex = pinToMNANode.get(`${nodeId}:${gndPin.id}`);
    if (vccIndex === undefined || gndIndex === undefined) return true;

    const state = useSimulationStore.getState();
    const vccVolt = state.nodeVoltages[String(vccIndex)] ?? 0;
    const gndVolt = state.nodeVoltages[String(gndIndex)] ?? 0;
    return Math.abs(vccVolt - gndVolt) > 3.0;
  }

  private solvedWireCurrents(
    result: WorkerResultMessage,
    nodes: CanvasNode[],
    wires: Wire[],
    circuit: MNACircuit,
  ): Record<string, number> {
    const terminalCurrents = new Map<string, number>();
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const addTerminalCurrent = (componentId: string, mnaNode: number, current: number) => {
      if (!Number.isFinite(current) || Math.abs(current) < Number.EPSILON) return;
      const component = nodesById.get(componentId);
      if (!component) return;
      for (const pin of component.pins || []) {
        const pinNode = circuit.pinToMNANode.get(`${componentId}:${pin.id}`);
        if (pinNode !== mnaNode) continue;
        const key = `${componentId}:${pin.id}`;
        terminalCurrents.set(key, (terminalCurrents.get(key) || 0) + Math.abs(current));
      }
    };

    for (const element of circuit.elements) {
      const componentId = circuit.elementToComponent.get(element.id);
      if (!componentId) continue;
      const current = result.branchCurrents[element.id];
      if (current === undefined) continue;
      addTerminalCurrent(componentId, element.nodeA, current);
      addTerminalCurrent(componentId, element.nodeB, current);
    }

    const wireCurrents: Record<string, number> = {};
    for (const wire of wires) {
      const endpointCurrents = [
        terminalCurrents.get(`${wire.fromNodeId}:${wire.fromPinId}`) || 0,
        terminalCurrents.get(`${wire.toNodeId}:${wire.toPinId}`) || 0,
      ].filter((current) => current > 1e-9);

      wireCurrents[wire.id] = endpointCurrents.length > 1
        ? Math.min(...endpointCurrents)
        : endpointCurrents[0] || 0;
    }
    return wireCurrents;
  }

  private handleSolverResult(result: WorkerResultMessage, _nodes: CanvasNode[]) {
    if (!this.mnaCircuit) return;
    const circuit = this.mnaCircuit;

    this.runBatched(() => {
      const { elementToComponent, pinToMNANode } = circuit;
    const nodes = useCanvasStore.getState().nodes;

    // Build component-level voltage and current maps
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

    // Map the solved MNA voltages to pin key identifiers globally for diagnostic tooltips
    const pinVoltages: Record<string, number> = {};
    for (const [pinKey, mnaNodeIndex] of pinToMNANode.entries()) {
      const voltage = result.nodeVoltages[mnaNodeIndex];
      if (voltage !== undefined) {
        pinVoltages[pinKey] = voltage;
      }
    }
    (globalThis as any).__voltforgePinVoltages = pinVoltages;

    // Update store with solver state
    const wireCurrents = this.solvedWireCurrents(result, nodes, useCanvasStore.getState().wires, circuit);
    useSimulationStore.getState().setCircuitState(
      nodeVoltageMap,
      wireCurrents,
      componentCurrents,
      componentPower,
      result.converged
    );

    // ── MCU Board Input Feedback ──
    const mcuNode = nodes.find(n =>
      isBoardComponentType(n.type)
    );
    if (mcuNode) {
      const logicVoltage = this.boardLogicVoltage(mcuNode.type);
      const highThreshold = logicVoltage * 0.6;
      // 1. Board Power Check (USB Connected vs VIN Battery vs 5V Supply)
      const usbConnected = mcuNode.properties?.usbConnected !== 'No';
      let powered = usbConnected;

      if (!powered) {
        const vinPin = mcuNode.pins?.find(p => p.name.toUpperCase() === 'VIN');
        if (vinPin) {
          const vinNode = pinToMNANode.get(`${mcuNode.id}:${vinPin.id}`) ?? 0;
          const vinV = result.nodeVoltages[vinNode] ?? 0;
          if (vinV >= 6.0) powered = true;
        }
      }

      if (!powered) {
        const v5Pin = mcuNode.pins?.find(p => p.name.toUpperCase() === '5V' || p.name.toUpperCase() === 'VCC');
        if (v5Pin) {
          const v5Node = pinToMNANode.get(`${mcuNode.id}:${v5Pin.id}`) ?? 0;
          const v5V = result.nodeVoltages[v5Node] ?? 0;
          if (v5V >= 4.5) powered = true;
        }
      }

      const currentPoweredState = Boolean(mcuNode.properties?.boardPowered);
      if (currentPoweredState !== powered) {
        useCanvasStore.getState().updateNode(mcuNode.id, {
          properties: {
            ...mcuNode.properties,
            boardPowered: powered,
          }
        });

        // Notify solver to open/close regulators and digital output pin switches
        const regs = ['5v', '3v3', 'vcc'];
        regs.forEach(p => {
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_board_pwr_${mcuNode.id}_${p}`,
            voltage: powered ? 0.01 : 1e8,
          });
        });

        for (const pin of mcuNode.pins || []) {
          const pinNum = this.pinNumberFromBoardPin(pin);
          if (!pinNum) continue;
          const pinInfo = this.pins[pinNum];
          const mode = pinInfo?.mode || 'INPUT';
          const isOutput = mode === 'OUTPUT' || mode === 'PWM';
          const isPullup = mode === 'INPUT_PULLUP';
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `r_mcu_pin_${mcuNode.id}_${this.mnaPinSuffix(pinNum)}`,
            voltage: powered ? (isOutput ? 40 : isPullup ? 40000 : 1e8) : 1e8,
          });
        }
      }

      for (const pin of mcuNode.pins || []) {
        const pinNum = this.pinNumberFromBoardPin(pin);
        if (!pinNum) continue;

        const pinInfo = this.pins[pinNum];
        const isInput = !pinInfo || pinInfo.mode === 'INPUT' || pinInfo.mode === 'INPUT_PULLUP';

        if (isInput) {
          const pinNode = pinToMNANode.get(`${mcuNode.id}:${pin.id}`) ?? 0;
          const voltage = result.nodeVoltages[pinNode] ?? 0;

          if (!this.pins[pinNum]) {
            this.pins[pinNum] = { mode: 'INPUT', state: 'LOW', value: 0 };
          }
          this.pins[pinNum].state = voltage >= highThreshold ? 'HIGH' : 'LOW';
          this.pins[pinNum].value = Math.round(Math.max(0, Math.min(1, voltage / logicVoltage)) * 255);

          if (this.avrCpu && this.avrPorts) {
            const avrPort = this.boardPinToAvrPort(pinNum);
            if (avrPort) {
              this.avrPorts[avrPort.port]?.setPin(avrPort.bit, voltage >= highThreshold);
            }
          }

          if (this.avrAdc && pinNum.startsWith('A')) {
            const ch = parseInt(pinNum.slice(1));
            if (!isNaN(ch) && ch >= 0 && ch < 8) {
              this.avrAdc.channelValues[ch] = voltage;
            }
          }
        }

        if (pinNum === '13' || pinNum === '2') {
          const pinState = pinInfo?.state || 'LOW';
          const isHigh = pinState === 'HIGH';
          if (mcuNode.properties?.builtInLedLit !== isHigh) {
            useCanvasStore.getState().updateNode(mcuNode.id, {
              properties: {
                ...mcuNode.properties,
                builtInLedLit: isHigh,
                boardPowered: true,
              }
            });
          }
        }
      }
    }

    // Dispatch to specific components
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

      // RGB LED: check currents of red, green, and blue diodes
      if (node.type === 'LED_RGB') {
        const iR = Math.abs(result.branchCurrents[`led_rgb_diode_r_${node.id}`] ?? 0);
        const iG = Math.abs(result.branchCurrents[`led_rgb_diode_g_${node.id}`] ?? 0);
        const iB = Math.abs(result.branchCurrents[`led_rgb_diode_b_${node.id}`] ?? 0);

        const scaleCurrent = (i: number) => Math.min(255, Math.round(i * 1000 * 12.75));
        const rVal = scaleCurrent(iR);
        const gVal = scaleCurrent(iG);
        const bVal = scaleCurrent(iB);

        const isLit = rVal > 0 || gVal > 0 || bVal > 0;
        const hexColor = `#${rVal.toString(16).padStart(2, '0')}${gVal.toString(16).padStart(2, '0')}${bVal.toString(16).padStart(2, '0')}`;

        if (node.properties?.isLit !== isLit || node.properties?.ledColor !== hexColor) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              isLit,
              ledColor: hexColor,
              rgbRed: rVal,
              rgbGreen: gVal,
              rgbBlue: bVal,
            }
          });
        }
      }

      // LED: check if enough current flows (> 1mA) to light up
      if (node.type.includes('LED') && !node.type.includes('NEOPIXEL') && node.type !== 'LED_RGB') {
        const elemId = `led_diode_${node.id}`;
        const current = result.branchCurrents[elemId] ?? result.branchCurrents[`led_${node.id}`] ?? 0;
        const isLit = Math.abs(current) > 0.001; // > 1mA

        const maxCurrent = Number(node.properties?.maxCurrent) || 20;
        const currentMa = Math.abs(current) * 1000;
        if (currentMa > maxCurrent * 2) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              isBlown: true,
              isLit: false,
              faultMessage: `Current ${currentMa.toFixed(1)} mA exceeds max ${maxCurrent} mA`,
            },
          });
        } else if (!node.properties?.isBlown && node.properties?.isLit !== isLit) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: { ...node.properties, isLit },
          });
        }
      }

      // Buzzer: check current
      if (node.type === 'BUZZER') {
        const elemId = `bz_${node.id}`;
        const current = result.branchCurrents[elemId] ?? 0;
        const isBeeping = Math.abs(current) > 0.001;
        if (node.properties?.isBeeping !== isBeeping) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: { ...node.properties, isBeeping },
          });
        }
      }

      // DC Motor: check current to spin
      if (node.type === 'MOTOR_DC') {
        const current = result.branchCurrents[`mot_${node.id}`] ?? 0;
        const m1Node = pinToMNANode.get(`${node.id}:m1`) ?? 0;
        const m2Node = pinToMNANode.get(`${node.id}:m2`) ?? 0;
        const appliedVoltage = (result.nodeVoltages[m1Node] ?? 0) - (result.nodeVoltages[m2Node] ?? 0);
        const currentMa = Math.abs(current) * 1000;
        const isSpinning = Math.abs(appliedVoltage) >= 0.5 && currentMa >= 1;
        const ratedVoltage = Math.max(1, Number(String(node.properties?.voltage || '5').replace(/[^0-9.]/g, '')) || 5);
        const ratedRpm = Math.max(1, Number(node.properties?.ratedRpm || node.properties?.rpm || 3000));
        const rpm = isSpinning
          ? Math.round(Math.min(1.5, Math.abs(appliedVoltage) / ratedVoltage) * ratedRpm)
          : 0;
        const direction = appliedVoltage < 0 ? 'reverse' : 'forward';

        if (
          node.properties?.isSpinning !== isSpinning ||
          node.properties?.rpm !== rpm ||
          node.properties?.appliedVoltage !== appliedVoltage ||
          node.properties?.currentMa !== currentMa
        ) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              isSpinning,
              rpm,
              direction,
              appliedVoltage,
              currentMa,
            },
          });
        }
      }

      if (node.type === 'VOLTAGE_REGULATOR_7805') {
        const vinNode = pinToMNANode.get(`${node.id}:vin`) ?? 0;
        const gndNode = pinToMNANode.get(`${node.id}:gnd`) ?? 0;
        const vinVoltage = Math.max(0, (result.nodeVoltages[vinNode] ?? 0) - (result.nodeVoltages[gndNode] ?? 0));
        const nominalOutput = Number(node.properties?.nominalOutputVoltage || node.properties?.outputVoltage || 5) || 5;
        const dropoutVoltage = Number(node.properties?.dropoutVoltage || 2) || 2;
        const outputVoltage = vinVoltage >= nominalOutput + dropoutVoltage
          ? nominalOutput
          : Math.max(0, Math.min(nominalOutput, vinVoltage - dropoutVoltage));
        const isRegulating = outputVoltage >= nominalOutput - 0.05;

        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `vreg_${node.id}`,
          voltage: outputVoltage,
        });

        if (
          node.properties?.isRegulating !== isRegulating ||
          node.properties?.inputVoltage !== vinVoltage ||
          node.properties?.actualOutputVoltage !== outputVoltage
        ) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              inputVoltage: vinVoltage,
              actualOutputVoltage: outputVoltage,
              isRegulating,
            },
          });
        }
      }

      if (node.type === 'SENSOR_PIR' || node.type === 'PIR_SENSOR') {
        const vccNode = pinToMNANode.get(`${node.id}:vcc`) ?? 0;
        const gndNode = pinToMNANode.get(`${node.id}:gnd`) ?? 0;
        const gndVoltage = result.nodeVoltages[gndNode] ?? 0;
        const supplyVoltage = (result.nodeVoltages[vccNode] ?? 0) - gndVoltage;
        const powered = supplyVoltage >= 3;
        const outputHigh = powered && Boolean(node.properties?.motionDetected);

        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `vs_pir_${node.id}`,
          voltage: outputHigh ? 5 : 0,
        });
        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `r_pir_out_${node.id}`,
          voltage: powered ? 100 : 1e8,
        });

        if (node.properties?.powered !== powered || node.properties?.outputHigh !== outputHigh) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              powered,
              outputHigh,
            },
          });
        }
      }

      if (node.type === 'MOTOR_SERVO' || node.type === 'SERVO_MOTOR' || node.type === 'LED_NEOPIXEL') {
        const vccNode = pinToMNANode.get(`${node.id}:vcc`) ?? 0;
        const gndNode = pinToMNANode.get(`${node.id}:gnd`) ?? 0;
        const supplyVoltage = (result.nodeVoltages[vccNode] ?? 0) - (result.nodeVoltages[gndNode] ?? 0);
        const powered = supplyVoltage >= 3.5;
        if (node.properties?.powered !== powered) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              powered,
              ...(powered ? {} : node.type === 'LED_NEOPIXEL' ? { isLit: false } : { isSpinning: false }),
            },
          });
        }
      }

      // Communication & powered modules: check power and set powered flag
      if (node.type === 'BLUETOOTH_MODULE' || node.type === 'WIFI_MODULE' ||
          node.type === 'IR_RECEIVER' || node.type === 'ESC_MODULE' ||
          node.type === 'RC_RECEIVER') {
        const vccPin = node.pins?.find(p => /vcc|3v3/i.test(p.id));
        const gndPin = node.pins?.find(p => /gnd/i.test(p.id));
        if (vccPin && gndPin) {
          const vccNode = pinToMNANode.get(`${node.id}:${vccPin.id}`) ?? 0;
          const gndNode = pinToMNANode.get(`${node.id}:${gndPin.id}`) ?? 0;
          const supplyVoltage = (result.nodeVoltages[vccNode] ?? 0) - (result.nodeVoltages[gndNode] ?? 0);
          const powered = supplyVoltage >= 2.5;
          if (node.properties?.powered !== powered) {
            useCanvasStore.getState().updateNode(node.id, {
              properties: { ...node.properties, powered },
            });
          }
        }
      }

      // Soil Moisture: update analog output voltage based on moistureLevel
      if (node.type === 'SOIL_MOISTURE') {
        const vccPin = node.pins?.find(p => /vcc/i.test(p.id));
        const gndPin = node.pins?.find(p => /gnd/i.test(p.id));
        if (vccPin && gndPin) {
          const vccNode = pinToMNANode.get(`${node.id}:${vccPin.id}`) ?? 0;
          const gndNode = pinToMNANode.get(`${node.id}:${gndPin.id}`) ?? 0;
          const supplyVoltage = (result.nodeVoltages[vccNode] ?? 0) - (result.nodeVoltages[gndNode] ?? 0);
          const powered = supplyVoltage >= 2.5;
          const moisture = Number(node.properties?.moistureLevel ?? 50) / 100;

          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `vs_soil_${node.id}`,
            voltage: powered ? moisture * 5 : 0,
          });

          if (node.properties?.powered !== powered) {
            useCanvasStore.getState().updateNode(node.id, {
              properties: { ...node.properties, powered },
            });
          }
        }
      }

      // SWITCH_SPST: sync solver resistance when toggled
      if (node.type === 'SWITCH_SPST') {
        const isClosed = Boolean(node.properties?.isClosed);
        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `r_sw_${node.id}`,
          voltage: isClosed ? 0.01 : 1e8,
        });
      }

      // Bare bipolar stepper: derive motion from winding currents.
      if (node.type === 'STEPPER_MOTOR') {
        const curA = Math.abs(result.branchCurrents[`r_coil_a_${node.id}`] ?? 0);
        const curB = Math.abs(result.branchCurrents[`r_coil_b_${node.id}`] ?? 0);
        const isA_High = curA > 0.05;
        const isB_High = curB > 0.05;

        const props = node.properties || {};
        const prevA = Boolean(props.prevCoilA);
        const prevB = Boolean(props.prevCoilB);

        if (isA_High !== prevA || isB_High !== prevB) {
          const currentSteps = Number(props.stepperSteps) || 0;
          const stepsPerRev = 200;

          let dir = 1;
          if (prevA && !isA_High && !prevB && isB_High) dir = 1;
          else if (!prevA && isA_High && prevB && !isB_High) dir = -1;

          const newSteps = currentSteps + dir;
          const rotation = ((newSteps % stepsPerRev) / stepsPerRev) * 360;

          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              stepperSteps: newSteps,
              stepperRotation: rotation,
              prevCoilA: isA_High,
              prevCoilB: isB_High,
              isSpinning: isA_High || isB_High,
            }
          });
        }
      }

      // ULN2003 stepper module: validate the standard half-step sequence.
      if (node.type === 'MOTOR_STEPPER') {
        const gndNode = pinToMNANode.get(`${node.id}:gnd`) ?? 0;
        const vccNode = pinToMNANode.get(`${node.id}:vcc`) ?? 0;
        const gndVoltage = result.nodeVoltages[gndNode] ?? 0;
        const supplyVoltage = (result.nodeVoltages[vccNode] ?? 0) - gndVoltage;
        const powered = supplyVoltage >= 3.5;
        const phases = [1, 2, 3, 4].map((ch) => {
          const inputNode = pinToMNANode.get(`${node.id}:in${ch}`) ?? 0;
          return powered && ((result.nodeVoltages[inputNode] ?? 0) - gndVoltage) >= 2;
        });
        const pattern = phases.map((active) => active ? '1' : '0').join('');
        const sequence = ['1000', '1100', '0100', '0110', '0010', '0011', '0001', '1001'];
        const previousPattern = String(node.properties?.stepperPattern || '');
        const previousIndex = sequence.indexOf(previousPattern);
        const currentIndex = sequence.indexOf(pattern);
        let stepDelta = 0;
        if (previousIndex >= 0 && currentIndex >= 0 && previousIndex !== currentIndex) {
          if (currentIndex === (previousIndex + 1) % sequence.length) stepDelta = 1;
          if (currentIndex === (previousIndex + sequence.length - 1) % sequence.length) stepDelta = -1;
        }

        const activePhaseCount = phases.filter(Boolean).length;
        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `r_stepper_load_${node.id}`,
          voltage: powered && activePhaseCount > 0 ? 50 / activePhaseCount : 1e8,
        });

        if (pattern !== previousPattern || stepDelta !== 0) {
          const currentSteps = Number(node.properties?.stepperSteps) || 0;
          const stepsPerRev = parseInt(String(node.properties?.stepsPerRev || '2048'), 10) || 2048;
          const newSteps = currentSteps + stepDelta;
          const rotation = ((newSteps % stepsPerRev) / stepsPerRev) * 360;
          const phaseProperties = Object.fromEntries(phases.map((active, index) => [`phase${index + 1}Active`, active]));
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              ...phaseProperties,
              stepperPattern: pattern,
              stepperSteps: newSteps,
              stepperRotation: rotation,
              isSpinning: stepDelta !== 0,
              powered,
            },
          });
        }
      }

      const isLegacySingleRelay = node.type === 'RELAY_SINGLE'
        && Object.prototype.hasOwnProperty.call(result.branchCurrents, `r_coil_${node.id}`);

      // Bare relay: derive armature state from coil current and update contacts.
      if (node.type === 'RELAY_SPDT' || isLegacySingleRelay) {
        const current = result.branchCurrents[`r_coil_${node.id}`] ?? 0;
        const isActive = Math.abs(current) > 0.02;
        if (node.properties?.isActive !== isActive) {
          this.solverWorker?.postMessage({ type: 'UPDATE_PIN', elementId: `r_contact_no_${node.id}`, voltage: isActive ? 0.05 : 1e8 });
          this.solverWorker?.postMessage({ type: 'UPDATE_PIN', elementId: `r_contact_nc_${node.id}`, voltage: isActive ? 1e8 : 0.05 });
          useCanvasStore.getState().updateNode(node.id, {
            properties: { ...node.properties, isActive },
          });
        }
      }

      // Relay modules: require module power and interpret each logic input.
      if ((node.type === 'RELAY_SINGLE' || node.type === 'RELAY_2CH' || node.type === 'RELAY_4CH') && !isLegacySingleRelay) {
        const channels = node.type === 'RELAY_SINGLE' ? 1 : node.type === 'RELAY_2CH' ? 2 : 4;
        const gndNode = pinToMNANode.get(`${node.id}:gnd`) ?? 0;
        const vccNode = pinToMNANode.get(`${node.id}:vcc`) ?? 0;
        const gndVoltage = result.nodeVoltages[gndNode] ?? 0;
        const supplyVoltage = (result.nodeVoltages[vccNode] ?? 0) - gndVoltage;
        const powered = supplyVoltage >= 3.5;
        const activeLow = String(node.properties?.triggerType || 'Active Low').toLowerCase() !== 'active high';
        const updates: Record<string, boolean> = {};
        let anySwitched = false;
        let changed = false;

        for (let ch = 1; ch <= channels; ch++) {
          const inputPin = channels === 1 ? 'in' : `in${ch}`;
          const inputNode = pinToMNANode.get(`${node.id}:${inputPin}`) ?? 0;
          const inputVoltage = (result.nodeVoltages[inputNode] ?? 0) - gndVoltage;
          const active = powered && (activeLow ? inputVoltage < supplyVoltage * 0.4 : inputVoltage > supplyVoltage * 0.6);
          const propertyName = channels === 1 ? 'isSwitched' : `isSwitched_${ch}`;
          updates[propertyName] = active;
          if (active) anySwitched = true;

          if (node.properties?.[propertyName] !== active) {
            changed = true;
            const suffix = channels === 1 ? '' : String(ch);
            this.solverWorker?.postMessage({ type: 'UPDATE_PIN', elementId: `r_relay_coil_${ch}_${node.id}`, voltage: active ? 70 : 1e8 });
            this.solverWorker?.postMessage({ type: 'UPDATE_PIN', elementId: `r_contact_no${suffix}_${node.id}`, voltage: active ? 0.05 : 1e8 });
            this.solverWorker?.postMessage({ type: 'UPDATE_PIN', elementId: `r_contact_nc${suffix}_${node.id}`, voltage: active ? 1e8 : 0.05 });
          }
        }

        if (changed || node.properties?.isActive !== anySwitched || node.properties?.powered !== powered) {
          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              ...updates,
              isActive: anySwitched,
              powered,
            }
          });
        }
      }

      // 7-Segment Display segment checks
      if (node.type === 'DISPLAY_7SEG') {
        const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
        const segStates: Record<string, boolean> = { ...(node.properties?.segments as Record<string, boolean> || {}) };
        let changed = false;

        for (const seg of segments) {
          const current = Math.abs(result.branchCurrents[`led_7seg_${seg}_${node.id}`] ?? 0);
          const isLit = current > 0.001;
          if (segStates[seg] !== isLit) {
            segStates[seg] = isLit;
            changed = true;
          }
        }

        if (changed) {
          const digitMap: Record<string, string> = {
            '1111110': '0', '0110000': '1', '1101101': '2', '1111001': '3',
            '0110011': '4', '1011011': '5', '1011111': '6', '1110000': '7',
            '1111111': '8', '1111011': '9',
          };
          const pattern = 'abcdefg'.split('').map(s => segStates[s] ? '1' : '0').join('');
          const displayDigit = digitMap[pattern] ?? '';
          const isActive = Object.values(segStates).some(v => v);

          useCanvasStore.getState().updateNode(node.id, {
            properties: {
              ...node.properties,
              segments: segStates,
              displayDigit,
              isActive,
            }
          });
        }
      }
    }

    // ── 74HC595 Shift Register Logic ──
    const shiftRegs = nodes.filter(n => n.type === 'IC_74HC595');
    shiftRegs.forEach(ic => {
      const isPowered = this.isNodePowered(ic.id);
      if (!isPowered) {
        const outputs = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qhp'];
        outputs.forEach(pinId => {
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `vs_595_${ic.id}_${pinId}`,
            voltage: 0,
          });
        });
        return;
      }

      const serNode = pinToMNANode.get(`${ic.id}:ser`) ?? 0;
      const srclkNode = pinToMNANode.get(`${ic.id}:srclk`) ?? 0;
      const rclkNode = pinToMNANode.get(`${ic.id}:rclk`) ?? 0;

      const vSer = result.nodeVoltages[serNode] ?? 0;
      const vSrclk = result.nodeVoltages[srclkNode] ?? 0;
      const vRclk = result.nodeVoltages[rclkNode] ?? 0;

      const props = ic.properties || {};
      const prevSrclk = Boolean(props.prevSrclk);
      const prevRclk = Boolean(props.prevRclk);

      const isSrclkHigh = vSrclk >= 2.0;
      const isRclkHigh = vRclk >= 2.0;

      let shiftVal = Number(props.shiftRegValue) || 0;
      let latchVal = Number(props.latchRegValue) || 0;
      let changed = false;

      if (isSrclkHigh && !prevSrclk) {
        const serBit = vSer >= 2.0 ? 1 : 0;
        shiftVal = ((shiftVal << 1) | serBit) & 0xFF;
        changed = true;
      }

      if (isRclkHigh && !prevRclk) {
        latchVal = shiftVal;
        changed = true;

        const outputs = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf'];
        outputs.forEach((pinId, idx) => {
          const bit = (latchVal >> idx) & 1;
          this.solverWorker?.postMessage({
            type: 'UPDATE_PIN',
            elementId: `vs_595_${ic.id}_${pinId}`,
            voltage: bit ? 5 : 0,
          });
        });

        const qhpBit = (latchVal >> 7) & 1;
        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `vs_595_${ic.id}_qhp`,
          voltage: qhpBit ? 5 : 0,
        });
      }

      if (changed || props.prevSrclk !== isSrclkHigh || props.prevRclk !== isRclkHigh) {
        useCanvasStore.getState().updateNode(ic.id, {
          properties: {
            ...ic.properties,
            shiftRegValue: shiftVal,
            latchRegValue: latchVal,
            prevSrclk: isSrclkHigh,
            prevRclk: isRclkHigh,
          }
        });
      }
    });

    // ── IC 555 Timer Logic ──
    const timers = nodes.filter(n => n.type === 'IC_555_TIMER');
    timers.forEach(ic => {
      const pinVcc = pinToMNANode.get(`${ic.id}:vcc`) ?? 0;
      const vVcc = result.nodeVoltages[pinVcc] ?? 0;

      const isPowered = vVcc >= 3.0;
      if (!isPowered) {
        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `vs_555_${ic.id}_out`,
          voltage: 0,
        });
        this.solverWorker?.postMessage({
          type: 'UPDATE_PIN',
          elementId: `r_555_disch_${ic.id}`,
          voltage: 1e8,
        });
        return;
      }

      const trigNode = pinToMNANode.get(`${ic.id}:trig`) ?? 0;
      const threshNode = pinToMNANode.get(`${ic.id}:thresh`) ?? 0;
      const resetNode = pinToMNANode.get(`${ic.id}:reset`) ?? 0;

      const vTrig = result.nodeVoltages[trigNode] ?? 0;
      const vThresh = result.nodeVoltages[threshNode] ?? 0;
      const vReset = result.nodeVoltages[resetNode] ?? 0;

      const vThLow = vVcc / 3;
      const vThHigh = (2 * vVcc) / 3;

      const props = ic.properties || {};
      let state = Boolean(props.timerState);

      if (vReset < 1.0) {
        state = false;
      } else {
        if (vTrig < vThLow) {
          state = true;
        } else if (vThresh > vThHigh) {
          state = false;
        }
      }

      this.solverWorker?.postMessage({
        type: 'UPDATE_PIN',
        elementId: `vs_555_${ic.id}_out`,
        voltage: state ? vVcc - 1.5 : 0,
      });

      this.solverWorker?.postMessage({
        type: 'UPDATE_PIN',
        elementId: `r_555_disch_${ic.id}`,
        voltage: state ? 1e8 : 10,
      });

      if (props.timerState !== state) {
        useCanvasStore.getState().updateNode(ic.id, {
          properties: {
            ...ic.properties,
            timerState: state,
          }
        });
      }
    });

      this.pushLcdToCanvas(nodes);
    });
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
