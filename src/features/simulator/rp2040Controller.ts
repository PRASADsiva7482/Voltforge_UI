/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 (Raspberry Pi Pico) 32-bit CPU Controller
 * 
 * Manages:
 * - Emulated RP2040 SoC instantiation via rp2040js
 * - Firmware binary ingestion & continuous NOR flash image mapping
 * - Cortex-M0+ Vector Table discovery & validation
 * - Boot initialization: Initial MSP loading, Reset Handler entry, Thumb bit enforcement
 * - Cycle-accurate instruction stepping & cycle accounting at configured clock (133 MHz)
 * - Deterministic simulated time tracking: simulatedTime_s = cycleCount / clockFrequency_Hz
 * - Execution lifecycle: start, pause, resume, reset, stop, error diagnostics
 * 
 * Designed for headless WebWorker and test runner execution with zero Node.js dependencies.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import { RP2040Multicore } from '../rp2040/multicore/RP2040Multicore';
import type { VoltForgeCortexM0Core } from '../rp2040/multicore/VoltForgeCortexM0Core';
import { bootromB1 } from './bootrom';
import {
  RP2040GpioBridge,
  type Rp2040PinDriverState,
  type Rp2040DriverUpdateEvent,
  type Rp2040GpioTransitionEvent,
  type Rp2040GpioDiagnostics,
} from './rp2040GpioBridge';
import { RP2040Uart, type UartDiagnostics } from './rp2040Uart';
import {
  RP2040I2c,
  type I2cDiagnostics,
  DREQ_I2C0_TX,
  DREQ_I2C0_RX,
  DREQ_I2C1_TX,
  DREQ_I2C1_RX,
} from './rp2040I2c';
import {
  RP2040Spi,
  type SpiDiagnostics,
  DREQ_SPI0_TX,
  DREQ_SPI0_RX,
  DREQ_SPI1_TX,
  DREQ_SPI1_RX,
} from './rp2040Spi';
import { RP2040Pwm, type PwmDiagnostics } from './rp2040Pwm';
import {
  parseUF2,
  validateRp2040UF2,
  extractRp2040FlashImage,
  discoverAndValidateVectorTable,
  RP2040_FAMILY_ID,
  RP2040_DEFAULT_FLASH_START,
  RP2040_DEFAULT_FLASH_SIZE,
  type Rp2040BoardConfig,
  type Rp2040VectorTable,
  type UF2ParseOptions,
} from './uf2Parser';

import {
  type Rp2040ExecutionState,
  type Rp2040ExecutionSnapshot as Rp2040TelemetrySnapshot,
  type Rp2040CoreSnapshot as Rp2040CoreTelemetrySnapshot,
  type Rp2040FifoTelemetry,
  type Rp2040CoreFifoStatus,
  type Rp2040SpinlockTelemetry,
  type Rp2040BootRomTelemetry,
  decodeCortexM0Flags,
  resolveCoreLifecycleState,
  countClaimedSpinlocks,
} from './rp2040Telemetry';

export type {
  Rp2040ExecutionState,
  Rp2040FifoTelemetry,
  Rp2040CoreFifoStatus,
  Rp2040SpinlockTelemetry,
  Rp2040BootRomTelemetry,
};

export interface Rp2040CoreSnapshot extends Rp2040CoreTelemetrySnapshot {
  /** Legacy alias for backward compatibility with older test runners */
  registers?: number[];
}

export interface Rp2040ExecutionSnapshot extends Rp2040TelemetrySnapshot {
  // Legacy / peripheral backward compatibility properties
  pc: number;
  sp: number;
  lr: number;
  registers: number[];
  xpsr: number;
  instructionCount: number;
  cycleCount: number;
  hostDuration_ms: number;
  mips: number;
  gpioStates?: Rp2040PinDriverState[];
  gpioDiagnostics?: Rp2040GpioDiagnostics;
  uartDiagnostics?: { uart0?: UartDiagnostics; uart1?: UartDiagnostics };
  i2cDiagnostics?: { i2c0?: I2cDiagnostics; i2c1?: I2cDiagnostics };
  spiDiagnostics?: { spi0?: SpiDiagnostics; spi1?: SpiDiagnostics };
  pwmDiagnostics?: PwmDiagnostics;
}

export interface Rp2040StepResult {
  instructionsExecuted: number;
  cyclesExecuted: number;
  pc: number;
  simulatedTime_s: number;
}

export class RP2040Controller {
  private rp2040: RP2040Multicore | null = null;
  private boardConfig: Rp2040BoardConfig;
  private state: Rp2040ExecutionState = 'UNINITIALIZED';
  private vectorTable: Rp2040VectorTable | null = null;
  private rawFlashImage: Uint8Array | null = null;
  private gpioBridge: RP2040GpioBridge | null = null;
  private boardComponentId: string;
  private vddIo: number;

  // Cycle & Timing Accounting
  private clockFrequency_Hz: number;
  private instructionCount: number = 0;
  private cycleCount: number = 0;
  private simulatedTime_s: number = 0;
  private hostStartWallTime_ms: number = 0;
  private accumulatedHostWallTime_ms: number = 0;
  private cpuErrors: string[] = [];
  private onDriverChangeCallbacks: ((event: Rp2040DriverUpdateEvent) => void)[] = [];
  private bridgeUnsubscribers: (() => void)[] = [];
  private uart0: RP2040Uart | null = null;
  private uart1: RP2040Uart | null = null;
  private i2c0: RP2040I2c | null = null;
  private i2c1: RP2040I2c | null = null;
  private spi0: RP2040Spi | null = null;
  private spi1: RP2040Spi | null = null;
  private pwm: RP2040Pwm | null = null;
  private serialOutputCallbacks: ((byte: number, simulatedTime_s: number, uartIndex: number) => void)[] = [];

  // Multicore scheduler state
  private core0Cycles: number = 0;
  private core1Cycles: number = 0;
  private multicoreTurn: 0 | 1 = 0;

  // Telemetry Generation & Sequence Watermark Tracking
  private currentGenerationId: number = 1;
  private currentSequenceId: number = 0;

  constructor(
    boardConfig?: Rp2040BoardConfig,
    clockFrequency_Hz = 133_000_000,
    boardComponentId = 'pico_0',
    vddIo = 3.3
  ) {
    this.boardConfig = boardConfig ?? {
      flashStart: RP2040_DEFAULT_FLASH_START,
      flashSize: RP2040_DEFAULT_FLASH_SIZE,
    };
    this.clockFrequency_Hz = clockFrequency_Hz;
    this.boardComponentId = boardComponentId;
    this.vddIo = vddIo;
  }

  // ─── Lifecycle & Firmware Ingestion ────────────────────────────────────────────────

  /**
   * Ingests and validates a UF2 firmware binary, initializes the RP2040 SoC,
   * loads the NOR flash backing image, and primes Cortex-M0+ Core 0 at the
   * verified Reset Handler entry point.
   */
  public loadFirmware(
    input: ArrayBuffer | Uint8Array,
    options?: UF2ParseOptions
  ): { success: boolean; vectorTable: Rp2040VectorTable | null; errors: string[]; warnings: string[] } {
    this.stop();

    // 1. Parse UF2 binary (targeting RP2040 family)
    const parseOpts: UF2ParseOptions = {
      targetFamilyId: RP2040_FAMILY_ID,
      allowMultiFamily: true,
      ...options,
    };
    const parsed = parseUF2(input, parseOpts);
    if (!parsed.valid) {
      this.state = 'ERROR';
      this.cpuErrors = [...parsed.errors];
      return { success: false, vectorTable: null, errors: parsed.errors, warnings: parsed.warnings };
    }

    // 2. Validate against RP2040 hardware constraints
    const validation = validateRp2040UF2(parsed, this.boardConfig);
    if (!validation.valid) {
      this.state = 'ERROR';
      this.cpuErrors = [...validation.errors];
      return { success: false, vectorTable: null, errors: validation.errors, warnings: validation.warnings };
    }

    // 3. Extract continuous erased NOR flash image (0xFF background)
    let flashImage: Uint8Array;
    try {
      flashImage = extractRp2040FlashImage(parsed, this.boardConfig);
    } catch (err: any) {
      this.state = 'ERROR';
      const msg = err?.message || String(err);
      this.cpuErrors = [msg];
      return { success: false, vectorTable: null, errors: [msg], warnings: validation.warnings };
    }

    // 4. Discover and validate Vector Table
    const vtorValidation = discoverAndValidateVectorTable(flashImage, this.boardConfig);
    if (!vtorValidation.valid || !vtorValidation.vectorTable) {
      this.state = 'ERROR';
      this.cpuErrors = [...vtorValidation.errors];
      return { success: false, vectorTable: null, errors: vtorValidation.errors, warnings: vtorValidation.warnings };
    }

    this.vectorTable = vtorValidation.vectorTable;
    this.rawFlashImage = flashImage;

    // 5. Instantiate RP2040 Multicore emulator and prime Core 0
    this.rp2040 = new RP2040Multicore();
    this.rp2040.clkSys = this.clockFrequency_Hz;

    // Load official RP2040 B1 bootrom so rom_func_lookup and runtime boot functions succeed
    this.rp2040.loadBootrom(bootromB1);

    // Copy flash image into rp2040.flash (16 MiB allocated array)
    this.rp2040.flash.set(flashImage, 0);

    // Instantiate high-fidelity PL011 UART peripherals (IRQ 20 for UART0, IRQ 21 for UART1)
    this.uart0 = new RP2040Uart(this.rp2040, 'UART0', 20, { rx: 21, tx: 20 }, 0);
    this.uart1 = new RP2040Uart(this.rp2040, 'UART1', 21, { rx: 23, tx: 22 }, 1);
    (this.rp2040 as any).uart = [this.uart0 as any, this.uart1 as any];
    (this.rp2040 as any).peripherals[0x40034] = this.uart0;
    (this.rp2040 as any).peripherals[0x40038] = this.uart1;

    // Instantiate high-fidelity DesignWare DW_apb_i2c peripherals (IRQ 23 for I2C0, IRQ 24 for I2C1, DREQ 32..35)
    this.i2c0 = new RP2040I2c(this.rp2040, 'I2C0', 23, { tx: DREQ_I2C0_TX, rx: DREQ_I2C0_RX }, 0);
    this.i2c1 = new RP2040I2c(this.rp2040, 'I2C1', 24, { tx: DREQ_I2C1_TX, rx: DREQ_I2C1_RX }, 1);
    (this.rp2040 as any).i2c = [this.i2c0 as any, this.i2c1 as any];
    (this.rp2040 as any).peripherals[0x40044] = this.i2c0;
    (this.rp2040 as any).peripherals[0x40048] = this.i2c1;

    // Instantiate high-fidelity PL022 SPI peripherals (IRQ 18 for SPI0, IRQ 19 for SPI1, DREQ 16..19)
    this.spi0 = new RP2040Spi(this.rp2040, 'SPI0', 18, { tx: DREQ_SPI0_TX, rx: DREQ_SPI0_RX }, 0);
    this.spi1 = new RP2040Spi(this.rp2040, 'SPI1', 19, { tx: DREQ_SPI1_TX, rx: DREQ_SPI1_RX }, 1);
    (this.rp2040 as any).spi = [this.spi0 as any, this.spi1 as any];
    (this.rp2040 as any).peripherals[0x4003c] = this.spi0;
    (this.rp2040 as any).peripherals[0x40040] = this.spi1;

    // Instantiate high-fidelity RP2040 Hardware PWM peripheral (IRQ 4, base 0x40050000 -> aperture 0x40050)
    this.pwm = new RP2040Pwm(this.rp2040, 'PWM', 4);
    (this.rp2040 as any).pwm = this.pwm;
    (this.rp2040 as any).peripherals[0x40050] = this.pwm;

    this.uart0.onByteTransmit = (byte, simTime, idx) => {
      for (const cb of this.serialOutputCallbacks) {
        cb(byte, simTime, idx);
      }
    };
    this.uart1.onByteTransmit = (byte, simTime, idx) => {
      for (const cb of this.serialOutputCallbacks) {
        cb(byte, simTime, idx);
      }
    };

    // Initialize GPIO electrical bridge
    this.gpioBridge = new RP2040GpioBridge(this.rp2040, this.boardComponentId, this.vddIo);
    this.gpioBridge.setTimingProvider(() => ({
      cycle: this.cycleCount,
      simulatedTime_s: this.simulatedTime_s,
    }));
    this.gpioBridge.attachUart(this.uart0, this.uart1);
    this.gpioBridge.attachI2c(this.i2c0, this.i2c1);
    this.gpioBridge.attachSpi(this.spi0, this.spi1);
    this.gpioBridge.attachPwm(this.pwm);
    this.attachBridgeCallbacks();

    // Initialize Core 0 register state
    this.initializeCore0();

    this.state = 'LOADED';
    this.cpuErrors = [];
    return {
      success: true,
      vectorTable: this.vectorTable,
      errors: [],
      warnings: [...validation.warnings, ...vtorValidation.warnings],
    };
  }

  /**
   * Initializes Core 0 VTOR, Stack Pointer, and Program Counter from the verified vector table.
   */
  private initializeCore0(): void {
    if (!this.rp2040 || !this.vectorTable) return;

    const core = this.rp2040.core;
    core.VTOR = this.vectorTable.address;
    core.SP = this.vectorTable.initialSP;
    // ARMv6-M: PC register stores the even instruction halfword (Thumb bit stripped)
    core.PC = this.vectorTable.entryPC;
    core.cycles = 0;
    this.core0Cycles = 0;
    this.core1Cycles = 0;
    this.multicoreTurn = 0;
    this.instructionCount = 0;
    this.cycleCount = 0;
    this.simulatedTime_s = 0;
    this.currentSequenceId = 0;
  }

  // ─── Execution Stepping & Cycle Accounting ─────────────────────────────────────────

  /**
   * Deterministically executes up to `instructionLimit` instructions on Core 0 (or interleaved across both cores if Core 1 is launched).
   */
  public step(instructionLimit = 1): Rp2040StepResult {
    if (!this.rp2040 || !this.vectorTable) {
      throw new Error('RP2040Controller: cannot step without loaded firmware');
    }

    if (this.isCore1Launched()) {
      return this.stepMulticoreInstructions(instructionLimit);
    }

    if (this.state === 'STOPPED' || this.state === 'ERROR') {
      return {
        instructionsExecuted: 0,
        cyclesExecuted: 0,
        pc: this.rp2040.core.PC,
        simulatedTime_s: this.getSimulatedTime_s(),
      };
    }

    const startHost = performance.now();
    let instructionsDone = 0;
    let cyclesDone = 0;

    try {
      while (instructionsDone < instructionLimit) {
        const curFreq = this.rp2040.clkSys || this.clockFrequency_Hz;
        if (this.rp2040.core.waiting) {
          const waitCycles = 1;
          cyclesDone += waitCycles;
          this.cycleCount += waitCycles;
          this.simulatedTime_s += waitCycles / curFreq;
          this.tickClock(waitCycles);
          if (!this.rp2040.core.waiting) continue;
          break;
        }

        const deltaCycles = this.rp2040.core.executeInstruction();
        instructionsDone += 1;
        cyclesDone += deltaCycles;
        this.instructionCount += 1;
        this.cycleCount += deltaCycles;
        this.simulatedTime_s += deltaCycles / curFreq;
        this.tickClock(deltaCycles);
      }
    } catch (err: any) {
      this.state = 'ERROR';
      const msg = `CPU Execution Fault at PC 0x${this.rp2040.core.PC.toString(16)}: ${err?.message || err}`;
      this.cpuErrors.push(msg);
    } finally {
      this.accumulatedHostWallTime_ms += (performance.now() - startHost);
    }

    return {
      instructionsExecuted: instructionsDone,
      cyclesExecuted: cyclesDone,
      pc: this.rp2040.core.PC,
      simulatedTime_s: this.getSimulatedTime_s(),
    };
  }

  /**
   * Executes instructions until a target number of clock cycles has elapsed.
   */
  public stepCycles(targetCycles: number): Rp2040StepResult {
    if (!this.rp2040 || !this.vectorTable) {
      throw new Error('RP2040Controller: cannot step without loaded firmware');
    }

    if (this.isCore1Launched()) {
      return this.stepMulticoreCycles(targetCycles);
    }

    let cyclesExecuted = 0;
    let instructionsExecuted = 0;
    const startHost = performance.now();

    try {
      while (cyclesExecuted < targetCycles) {
        const curFreq = this.rp2040.clkSys || this.clockFrequency_Hz;
        if (this.rp2040.core.waiting) {
          const remaining = Math.max(1, targetCycles - cyclesExecuted);
          cyclesExecuted += remaining;
          this.cycleCount += remaining;
          this.simulatedTime_s += remaining / curFreq;
          this.tickClock(remaining);
          if (!this.rp2040.core.waiting) continue;
          break;
        }

        const delta = this.rp2040.core.executeInstruction();
        instructionsExecuted += 1;
        cyclesExecuted += delta;
        this.instructionCount += 1;
        this.cycleCount += delta;
        this.simulatedTime_s += delta / curFreq;
        this.tickClock(delta);
      }
    } catch (err: any) {
      this.state = 'ERROR';
      this.cpuErrors.push(`CPU Fault at PC 0x${this.rp2040.core.PC.toString(16)}: ${err?.message || err}`);
    } finally {
      this.accumulatedHostWallTime_ms += (performance.now() - startHost);
    }

    return {
      instructionsExecuted,
      cyclesExecuted,
      pc: this.rp2040.core.PC,
      simulatedTime_s: this.getSimulatedTime_s(),
    };
  }

  /**
   * Executes instructions until target cycles elapse OR a GPIO transition occurs,
   * yielding at the exact cycle boundary of the transition for event-driven MNA substepping.
   */
  public stepCyclesWithEventBreak(
    targetCycles: number,
    onEvent?: (event: Rp2040GpioTransitionEvent) => void
  ): Rp2040StepResult & { eventOccurred: boolean } {
    if (!this.rp2040 || !this.vectorTable) {
      throw new Error('RP2040Controller: cannot step without loaded firmware');
    }

    if (this.isCore1Launched()) {
      return this.stepMulticoreCyclesWithEventBreak(targetCycles, onEvent);
    }

    let cyclesExecuted = 0;
    let instructionsExecuted = 0;
    let eventOccurred = false;
    const startHost = performance.now();
    const bridge = this.gpioBridge;

    try {
      while (cyclesExecuted < targetCycles) {
        const curFreq = this.rp2040.clkSys || this.clockFrequency_Hz;
        if (this.rp2040.core.waiting) {
          const remaining = Math.max(1, targetCycles - cyclesExecuted);
          cyclesExecuted += remaining;
          this.cycleCount += remaining;
          this.simulatedTime_s += remaining / curFreq;
          this.tickClock(remaining);
          if (!this.rp2040.core.waiting) continue;
          break;
        }

        const delta = this.rp2040.core.executeInstruction();
        instructionsExecuted += 1;
        cyclesExecuted += delta;
        this.instructionCount += 1;
        this.cycleCount += delta;
        this.simulatedTime_s += delta / curFreq;
        this.tickClock(delta);

        if (bridge && bridge.hasTransitionEvents()) {
          eventOccurred = true;
          if (onEvent) {
            const events = bridge.peekTransitionEvents();
            for (const ev of events) {
              onEvent(ev);
            }
          }
          break;
        }
      }
    } catch (err: any) {
      this.state = 'ERROR';
      this.cpuErrors.push(`CPU Fault at PC 0x${this.rp2040.core.PC.toString(16)}: ${err?.message || err}`);
    } finally {
      this.accumulatedHostWallTime_ms += (performance.now() - startHost);
    }

    return {
      instructionsExecuted,
      cyclesExecuted,
      pc: this.rp2040.core.PC,
      simulatedTime_s: this.getSimulatedTime_s(),
      eventOccurred,
    };
  }

  // ─── Multicore Dual-Core Scheduling Engine ──────────────────────────────────────────

  private stepMulticoreInstructions(instructionLimit: number): Rp2040StepResult {
    const mcu = this.rp2040!;
    let instructionsDone = 0;
    let masterCycles = 0;
    const startHost = performance.now();
    const curFreq = mcu.clkSys || this.clockFrequency_Hz;

    try {
      while (instructionsDone < instructionLimit) {
        if (mcu.core0.waiting && mcu.core1.waiting) {
          const waitCycles = 1;
          masterCycles += waitCycles;
          this.core0Cycles += waitCycles;
          this.core1Cycles += waitCycles;
          this.cycleCount += waitCycles;
          this.simulatedTime_s += waitCycles / curFreq;
          this.tickClock(waitCycles);
          if (!mcu.core0.waiting || !mcu.core1.waiting) continue;
          break;
        }

        let chooseCore: 0 | 1;
        if (mcu.core0.waiting && !mcu.core1.waiting) {
          chooseCore = 1;
        } else if (mcu.core1.waiting && !mcu.core0.waiting) {
          chooseCore = 0;
        } else if (this.core0Cycles < this.core1Cycles) {
          chooseCore = 0;
        } else if (this.core1Cycles < this.core0Cycles) {
          chooseCore = 1;
        } else {
          chooseCore = this.multicoreTurn;
        }

        mcu.activeCoreId = chooseCore;
        let delta = 0;
        if (chooseCore === 0) {
          delta = mcu.core0.executeInstruction();
          this.core0Cycles += delta;
          this.multicoreTurn = 1;
        } else {
          delta = mcu.core1.executeInstruction();
          this.core1Cycles += delta;
          this.multicoreTurn = 0;
        }

        instructionsDone++;
        this.instructionCount++;
        masterCycles += delta;
        this.cycleCount += delta;
        this.simulatedTime_s += delta / curFreq;
        this.tickClock(delta);
      }
    } catch (err: any) {
      this.state = 'ERROR';
      this.cpuErrors.push(`CPU Fault during multicore execution: ${err?.message || err}`);
    } finally {
      mcu.activeCoreId = 0;
      this.accumulatedHostWallTime_ms += (performance.now() - startHost);
    }

    return {
      instructionsExecuted: instructionsDone,
      cyclesExecuted: masterCycles,
      pc: mcu.core0.PC,
      simulatedTime_s: this.getSimulatedTime_s(),
    };
  }

  private stepMulticoreCycles(targetCycles: number): Rp2040StepResult {
    const mcu = this.rp2040!;
    let masterCycles = 0;
    let instructionsDone = 0;
    const startHost = performance.now();
    const curFreq = mcu.clkSys || this.clockFrequency_Hz;

    try {
      while (masterCycles < targetCycles) {
        if (mcu.core0.waiting && mcu.core1.waiting) {
          const remaining = targetCycles - masterCycles;
          masterCycles += remaining;
          this.core0Cycles += remaining;
          this.core1Cycles += remaining;
          this.cycleCount += remaining;
          this.simulatedTime_s += remaining / curFreq;
          this.tickClock(remaining);
          break;
        }

        let chooseCore: 0 | 1;
        if (mcu.core0.waiting && !mcu.core1.waiting) {
          chooseCore = 1;
        } else if (mcu.core1.waiting && !mcu.core0.waiting) {
          chooseCore = 0;
        } else if (this.core0Cycles < this.core1Cycles) {
          chooseCore = 0;
        } else if (this.core1Cycles < this.core0Cycles) {
          chooseCore = 1;
        } else {
          chooseCore = this.multicoreTurn;
        }

        mcu.activeCoreId = chooseCore;
        let delta = 0;
        if (chooseCore === 0) {
          delta = mcu.core0.executeInstruction();
          this.core0Cycles += delta;
          this.multicoreTurn = 1;
        } else {
          delta = mcu.core1.executeInstruction();
          this.core1Cycles += delta;
          this.multicoreTurn = 0;
        }

        instructionsDone++;
        this.instructionCount++;

        const stepAdvance = targetCycles <= 1 ? delta : 1;
        masterCycles += stepAdvance;
        this.cycleCount += stepAdvance;
        this.simulatedTime_s += stepAdvance / curFreq;
        this.tickClock(stepAdvance);
      }
    } catch (err: any) {
      this.state = 'ERROR';
      this.cpuErrors.push(`CPU Fault during multicore execution: ${err?.message || err}`);
    } finally {
      mcu.activeCoreId = 0;
      this.accumulatedHostWallTime_ms += (performance.now() - startHost);
    }

    return {
      instructionsExecuted: instructionsDone,
      cyclesExecuted: masterCycles,
      pc: mcu.core0.PC,
      simulatedTime_s: this.getSimulatedTime_s(),
    };
  }

  private stepMulticoreCyclesWithEventBreak(
    targetCycles: number,
    onEvent?: (event: Rp2040GpioTransitionEvent) => void
  ): Rp2040StepResult & { eventOccurred: boolean } {
    const mcu = this.rp2040!;
    let masterCycles = 0;
    let instructionsDone = 0;
    let eventOccurred = false;
    const startHost = performance.now();
    const bridge = this.gpioBridge;
    const curFreq = mcu.clkSys || this.clockFrequency_Hz;

    try {
      while (masterCycles < targetCycles) {
        if (mcu.core0.waiting && mcu.core1.waiting) {
          const remaining = targetCycles - masterCycles;
          masterCycles += remaining;
          this.core0Cycles += remaining;
          this.core1Cycles += remaining;
          this.cycleCount += remaining;
          this.simulatedTime_s += remaining / curFreq;
          this.tickClock(remaining);
          break;
        }

        let chooseCore: 0 | 1;
        if (mcu.core0.waiting && !mcu.core1.waiting) {
          chooseCore = 1;
        } else if (mcu.core1.waiting && !mcu.core0.waiting) {
          chooseCore = 0;
        } else if (this.core0Cycles < this.core1Cycles) {
          chooseCore = 0;
        } else if (this.core1Cycles < this.core0Cycles) {
          chooseCore = 1;
        } else {
          chooseCore = this.multicoreTurn;
        }

        mcu.activeCoreId = chooseCore;
        let delta = 0;
        if (chooseCore === 0) {
          delta = mcu.core0.executeInstruction();
          this.core0Cycles += delta;
          this.multicoreTurn = 1;
        } else {
          delta = mcu.core1.executeInstruction();
          this.core1Cycles += delta;
          this.multicoreTurn = 0;
        }

        instructionsDone++;
        this.instructionCount++;

        const stepAdvance = targetCycles <= 1 ? delta : 1;
        masterCycles += stepAdvance;
        this.cycleCount += stepAdvance;
        this.simulatedTime_s += stepAdvance / curFreq;
        this.tickClock(stepAdvance);

        if (bridge && bridge.hasTransitionEvents()) {
          eventOccurred = true;
          if (onEvent) {
            const events = bridge.peekTransitionEvents();
            for (const ev of events) {
              onEvent(ev);
            }
          }
          break;
        }
      }
    } catch (err: any) {
      this.state = 'ERROR';
      this.cpuErrors.push(`CPU Fault during multicore execution: ${err?.message || err}`);
    } finally {
      mcu.activeCoreId = 0;
      this.accumulatedHostWallTime_ms += (performance.now() - startHost);
    }

    return {
      instructionsExecuted: instructionsDone,
      cyclesExecuted: masterCycles,
      pc: mcu.core0.PC,
      simulatedTime_s: this.getSimulatedTime_s(),
      eventOccurred,
    };
  }

  private tickClock(deltaCycles: number): void {
    if (this.rp2040) {
      const curFreq = this.rp2040.clkSys || this.clockFrequency_Hz;
      const clock = this.rp2040.clock as { tick?: (nanos: number) => void };
      if (typeof clock.tick === 'function') {
        clock.tick((deltaCycles * 1e9) / curFreq);
      }
      this.uart0?.tickCycles(deltaCycles);
      this.uart1?.tickCycles(deltaCycles);
      this.i2c0?.tickCycles(deltaCycles);
      this.i2c1?.tickCycles(deltaCycles);
      this.spi0?.tickCycles(deltaCycles);
      this.spi1?.tickCycles(deltaCycles);
      this.pwm?.tickCycles(deltaCycles);
    }
  }

  // ─── Control Actions ───────────────────────────────────────────────────────────────

  public start(): void {
    if (this.state === 'LOADED' || this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.hostStartWallTime_ms = performance.now();
    }
  }

  public pause(): void {
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
      this.accumulatedHostWallTime_ms += (performance.now() - this.hostStartWallTime_ms);
    }
  }

  public resume(): void {
    if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.hostStartWallTime_ms = performance.now();
    }
  }

  public reset(): void {
    if (!this.rp2040 || !this.vectorTable || !this.rawFlashImage) return;

    // Reset Core 0 registers and reload flash memory
    this.core0Cycles = 0;
    this.core1Cycles = 0;
    this.multicoreTurn = 0;
    this.rp2040.loadBootrom(bootromB1);
    this.rp2040.flash.set(this.rawFlashImage, 0);
    this.initializeCore0();
    this.uart0?.reset();
    this.uart1?.reset();
    this.i2c0?.reset();
    this.i2c1?.reset();

    if (this.gpioBridge) {
      this.gpioBridge.detachHardwareListeners();
      this.gpioBridge = new RP2040GpioBridge(this.rp2040, this.boardComponentId, this.vddIo);
      this.gpioBridge.setTimingProvider(() => ({
        cycle: this.cycleCount,
        simulatedTime_s: this.simulatedTime_s,
      }));
      if (this.uart0 && this.uart1) {
        this.gpioBridge.attachUart(this.uart0, this.uart1);
      }
      if (this.i2c0 && this.i2c1) {
        this.gpioBridge.attachI2c(this.i2c0, this.i2c1);
      }
      this.attachBridgeCallbacks();
    }
    this.state = 'LOADED';
    this.accumulatedHostWallTime_ms = 0;
    this.cpuErrors = [];
  }

  public stop(): void {
    for (const unsub of this.bridgeUnsubscribers) {
      unsub();
    }
    this.bridgeUnsubscribers = [];
    this.uart0?.reset();
    this.uart1?.reset();
    this.i2c0?.reset();
    this.i2c1?.reset();
    if (this.gpioBridge) {
      this.gpioBridge.detachHardwareListeners();
      this.gpioBridge = null;
    }
    if (this.rp2040) {
      this.rp2040.flash.fill(0xff);
      this.rp2040.sram.fill(0x00);
      this.rp2040 = null;
    }
    this.rawFlashImage = null;
    this.vectorTable = null;
    this.state = 'STOPPED';
    this.instructionCount = 0;
    this.cycleCount = 0;
    this.simulatedTime_s = 0;
    this.currentSequenceId = 0;
    this.accumulatedHostWallTime_ms = 0;
  }

  // ─── Driver Update Callbacks ───────────────────────────────────────────────────────

  public onDriverChange(cb: (event: Rp2040DriverUpdateEvent) => void): () => void {
    this.onDriverChangeCallbacks.push(cb);
    if (this.gpioBridge) {
      this.bridgeUnsubscribers.push(this.gpioBridge.onDriverChange(cb));
    }
    return () => {
      const idx = this.onDriverChangeCallbacks.indexOf(cb);
      if (idx >= 0) this.onDriverChangeCallbacks.splice(idx, 1);
    };
  }

  private attachBridgeCallbacks(): void {
    for (const unsub of this.bridgeUnsubscribers) {
      unsub();
    }
    this.bridgeUnsubscribers = [];
    if (this.gpioBridge) {
      for (const cb of this.onDriverChangeCallbacks) {
        this.bridgeUnsubscribers.push(this.gpioBridge.onDriverChange(cb));
      }
    }
  }

  // ─── Diagnostics & Inspection ──────────────────────────────────────────────────────

  public getGpioBridge(): RP2040GpioBridge | null {
    return this.gpioBridge;
  }

  public getState(): Rp2040ExecutionState {
    return this.state;
  }

  public getVectorTable(): Rp2040VectorTable | null {
    return this.vectorTable;
  }

  public getSimulatedTime_s(): number {
    return this.simulatedTime_s;
  }

  public getClockFrequency_Hz(): number {
    return this.rp2040?.clkSys || this.clockFrequency_Hz;
  }

  public getCycleCount(): number {
    return this.cycleCount;
  }

  public getInstructionCount(): number {
    return this.instructionCount;
  }

  public getRp2040Instance(): RP2040 | null {
    return this.rp2040;
  }

  public getMulticoreInstance(): RP2040Multicore | null {
    return this.rp2040;
  }

  public getCore(id: 0 | 1): VoltForgeCortexM0Core | null {
    return this.rp2040 ? this.rp2040.cores[id] : null;
  }

  public isCore1Launched(): boolean {
    return this.rp2040 ? this.rp2040.bootRom.isLaunched() : false;
  }

  public getUart(index: 0 | 1): RP2040Uart | null {
    return index === 0 ? this.uart0 : this.uart1;
  }

  public getI2c(index: 0 | 1): RP2040I2c | null {
    return index === 0 ? this.i2c0 : this.i2c1;
  }

  public onSerialTransmit(callback: (byte: number, simulatedTime_s: number, uartIndex: number) => void): () => void {
    this.serialOutputCallbacks.push(callback);
    return () => {
      const idx = this.serialOutputCallbacks.indexOf(callback);
      if (idx >= 0) this.serialOutputCallbacks.splice(idx, 1);
    };
  }

  public sendSerialByte(byte: number, uartIndex: 0 | 1 = 0): void {
    const uart = uartIndex === 0 ? this.uart0 : this.uart1;
    uart?.feedByte(byte);
  }

  public sendSerialString(text: string, uartIndex: 0 | 1 = 0): void {
    const uart = uartIndex === 0 ? this.uart0 : this.uart1;
    uart?.feedString(text);
  }

  public getUartDiagnostics(): { uart0?: UartDiagnostics; uart1?: UartDiagnostics } {
    return {
      uart0: this.uart0?.getDiagnostics(),
      uart1: this.uart1?.getDiagnostics(),
    };
  }

  public getI2cDiagnostics(): { i2c0?: I2cDiagnostics; i2c1?: I2cDiagnostics } {
    return {
      i2c0: this.i2c0?.getDiagnostics(),
      i2c1: this.i2c1?.getDiagnostics(),
    };
  }

  public getSpi(index: 0 | 1 = 0): RP2040Spi | null {
    return index === 0 ? this.spi0 : this.spi1;
  }

  public getSpiDiagnostics(): { spi0?: SpiDiagnostics; spi1?: SpiDiagnostics } {
    return {
      spi0: this.spi0?.getDiagnostics(),
      spi1: this.spi1?.getDiagnostics(),
    };
  }

  public getPwm(): RP2040Pwm | null {
    return this.pwm;
  }

  public getPwmDiagnostics(): PwmDiagnostics | undefined {
    return this.pwm?.getDiagnostics();
  }

  public getGpioDiagnostics(): Rp2040GpioDiagnostics | undefined {
    return this.gpioBridge?.getAggregateDiagnostics();
  }

  public setTelemetryGeneration(generationId: number): void {
    this.currentGenerationId = generationId;
    this.currentSequenceId = 0;
  }

  public getTelemetryGeneration(): number {
    return this.currentGenerationId;
  }

  public getLastSequenceId(): number {
    return this.currentSequenceId;
  }

  public peekFifo(direction: '0to1' | '1to0'): number[] {
    return this.rp2040 ? this.rp2040.sioFifo.peekFifo(direction) : [];
  }

  public getFifoStatus(coreId: 0 | 1): Rp2040CoreFifoStatus {
    return this.rp2040
      ? this.rp2040.sioFifo.getFifoStatus(coreId)
      : { vld: false, rdy: true, wof: false, roe: false, irqAsserted: false };
  }

  public getFifoTelemetry(): Rp2040FifoTelemetry {
    return this.rp2040
      ? this.rp2040.sioFifo.getFifoTelemetry()
      : {
          fifo0to1: { depth: 0, entries: [] },
          fifo1to0: { depth: 0, entries: [] },
          core0Status: { vld: false, rdy: true, wof: false, roe: false, irqAsserted: false },
          core1Status: { vld: false, rdy: true, wof: false, roe: false, irqAsserted: false },
        };
  }

  public getSpinlockClaimedMask(): number {
    return this.rp2040 ? (this.rp2040.sio.spinLock >>> 0) : 0;
  }

  public getSpinlockTelemetry(): Rp2040SpinlockTelemetry {
    const claimedMask = this.getSpinlockClaimedMask();
    return {
      claimedMask,
      claimedCount: countClaimedSpinlocks(claimedMask),
      ownershipModel: 'UNTRACKED',
    };
  }

  public getBootRomTelemetry(): Rp2040BootRomTelemetry {
    return this.rp2040
      ? this.rp2040.bootRom.getBootRomTelemetry()
      : {
          isLaunched: false,
          handshakeStep: 0,
          stepDescription: 'Uninitialized',
        };
  }

  private createDefaultCoreSnapshot(coreId: 0 | 1): Rp2040CoreSnapshot {
    const xpsr = 0x01000000;
    const flags = decodeCortexM0Flags(xpsr);
    const waiting = coreId === 1;
    const lifecycle = resolveCoreLifecycleState({
      coreId,
      waiting,
      ipsr: 0,
      bootRomLaunched: false,
    });

    return {
      coreId,
      lifecycle,
      pc: 0,
      sp: 0,
      lr: 0,
      r0_r12: new Array(13).fill(0),
      registers: new Array(16).fill(0),
      xpsr,
      flags,
      primask: false,
      currentMode: 0,
      vtor: 0,
      control: { spsel: false, npriv: false },
      waiting,
      eventRegistered: false,
      sevonpend: false,
      interrupts: { pending: 0, enabled: 0 },
      cycles: 0,
    };
  }

  private createCoreSnapshot(coreId: 0 | 1): Rp2040CoreSnapshot {
    if (!this.rp2040) {
      return this.createDefaultCoreSnapshot(coreId);
    }
    const core = this.rp2040.cores[coreId];
    const r0_r12 = Array.from(core.registers.slice(0, 13));
    const registers = Array.from(core.registers.slice(0, 16));
    const xpsr = core.xPSR >>> 0;
    const flags = decodeCortexM0Flags(xpsr);
    const lifecycle = resolveCoreLifecycleState({
      coreId,
      waiting: Boolean(core.waiting),
      ipsr: flags.ipsr,
      bootRomLaunched: this.isCore1Launched(),
    });

    return {
      coreId,
      lifecycle,
      pc: core.PC >>> 0,
      sp: core.SP >>> 0,
      lr: core.LR >>> 0,
      r0_r12,
      registers,
      xpsr,
      flags,
      primask: Boolean(core.PM),
      currentMode: core.currentMode,
      vtor: core.VTOR >>> 0,
      control: {
        spsel: core.SPSEL === 1,
        npriv: Boolean(core.nPRIV),
      },
      waiting: Boolean(core.waiting),
      eventRegistered: Boolean(core.eventRegistered),
      sevonpend: Boolean(core.sevonpend),
      interrupts: {
        pending: (core.pendingInterrupts >>> 0),
        enabled: (core.enabledInterrupts >>> 0),
      },
      cycles: core.cycles,
    };
  }

  public getExecutionSnapshot(): Rp2040ExecutionSnapshot {
    const sequenceId = ++this.currentSequenceId;

    const hostDuration_ms = this.accumulatedHostWallTime_ms +
      (this.state === 'RUNNING' ? (performance.now() - this.hostStartWallTime_ms) : 0);

    const mips = hostDuration_ms > 0
      ? (this.instructionCount / (hostDuration_ms / 1000)) / 1_000_000
      : 0;

    const core0 = this.createCoreSnapshot(0);
    const core1 = this.createCoreSnapshot(1);
    const isMulticoreActive = this.isCore1Launched();
    const fifo = this.getFifoTelemetry();
    const spinlocks = this.getSpinlockTelemetry();
    const bootRom = this.getBootRomTelemetry();

    return {
      generationId: this.currentGenerationId,
      sequenceId,
      state: this.state,

      // Dual-Core Contexts
      core0,
      core1,
      isMulticoreActive,

      // SIO Subsystems
      fifo,
      spinlocks,
      bootRom,

      // Clock & Timing Diagnostics
      clockFrequency_Hz: this.clockFrequency_Hz,
      simulatedTime_s: this.getSimulatedTime_s(),
      totalCycleCount: this.cycleCount,
      hostWallTime_ms: hostDuration_ms,

      // Peripheral Status & Errors
      vectorTable: this.vectorTable,
      errors: [...this.cpuErrors],

      // Legacy single-core / peripheral backward compatibility properties
      pc: core0.pc,
      sp: core0.sp,
      lr: core0.lr,
      registers: core0.registers ?? Array.from(this.rp2040 ? this.rp2040.core0.registers.slice(0, 16) : new Array(16).fill(0)),
      xpsr: core0.xpsr,
      instructionCount: this.instructionCount,
      cycleCount: this.cycleCount,
      hostDuration_ms,
      mips,
      gpioStates: this.gpioBridge ? this.gpioBridge.getAllDriverStates() : undefined,
      gpioDiagnostics: this.getGpioDiagnostics(),
      uartDiagnostics: this.getUartDiagnostics(),
      i2cDiagnostics: this.getI2cDiagnostics(),
      spiDiagnostics: this.getSpiDiagnostics(),
      pwmDiagnostics: this.getPwmDiagnostics(),
    };
  }
}

