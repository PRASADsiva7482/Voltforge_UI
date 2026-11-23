/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Multicore Cortex-M0+ CPU Implementation
 * 
 * Extends CortexM0Core with:
 * 1. Independent Core context (coreId: 0 | 1)
 * 2. Cross-core event signaling (SEV opcode 0xBF40 interception and point-to-point TXEV/RXEV)
 * 3. WFE sleep/wake lifecycle with event latching and emulator consumption convention
 * 4. Exception Entry sanitization (overriding upstream line 247 defect)
 * 5. Native upstream line 296 Exception Return Event Register assertion preserved (ARMv6-M §B1.5.17)
 * 6. Dynamic interrupt edge and preemption evaluation (Mechanism 1 preemption and Mechanism 2 SEVONPEND)
 * 7. Upstream lines 517–529 execution guard for sleeping core
 * 8. SCR (System Control Register) SEVONPEND bit handling
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import type { RP2040Multicore } from './RP2040Multicore';

export type UpstreamCortexM0Core = typeof RP2040.prototype.core;

export interface UpstreamCortexM0CoreConstructor {
  new (rp2040: any): UpstreamCortexM0Core;
}

const UpstreamCortexM0CoreClass: UpstreamCortexM0CoreConstructor = (function () {
  const dummy = new RP2040();
  return Object.getPrototypeOf(dummy.core).constructor;
})();

export const OPCODE_SEV = 0xBF40; // 0b1011111101000000 (SEV hint instruction)
export const OPCODE_WFE = 0xBF20; // 0b1011111100100000 (WFE hint instruction)
export const LOWEST_PRIORITY_SENTINEL = 32; // Internal comparison sentinel in rp2040js

export class VoltForgeCortexM0Core extends UpstreamCortexM0CoreClass {
  readonly coreId: 0 | 1;
  readonly multicore: RP2040Multicore;

  /** SCR (System Control Register 0xE000ED10) bit 4: Send Event on Pending */
  sevonpend: boolean = false;
  sleepOnExit: boolean = false;
  sleepDeep: boolean = false;

  constructor(multicore: RP2040Multicore, coreId: 0 | 1) {
    super(multicore as any);
    this.multicore = multicore;
    this.coreId = coreId;
  }

  /**
   * Resets core state according to ARMv6-M §B1.5.15 and RP2040 Datasheet §2.4.2.8.2.
   */
  override reset(): void {
    super.reset();
    this.pendingInterrupts = 0;
    this.enabledInterrupts = 0;
    this.PM = false;
    this.IPSR = 0;
    this.currentMode = 0; // Mode_Thread
    this.interruptsUpdated = false;
    this.pendingNMI = false;
    this.pendingPendSV = false;
    this.pendingSVCall = false;
    this.pendingSystick = false;
    this.eventRegistered = false;
    this.waiting = false;
    this.sevonpend = false;
    this.sleepOnExit = false;
    this.sleepDeep = false;
  }

  /**
   * Evaluates dynamic interrupt edge transitions and WFE wake conditions.
   * Scopes peripheral lines 0–25; lines 26–31 are unconnected on RP2040.
   */
  override setInterrupt(irq: number, value: boolean): void {
    if (irq < 0 || irq > 31) return;

    const irqBit = 1 << irq;
    const wasPending = (this.pendingInterrupts & irqBit) !== 0;

    if (value) {
      this.pendingInterrupts |= irqBit;
      this.interruptsUpdated = true;
    } else {
      this.pendingInterrupts &= ~irqBit;
    }

    const isPending = (this.pendingInterrupts & irqBit) !== 0;

    // Evaluate dynamic transition entering pending state (0 -> 1)
    if (!wasPending && isPending) {
      // MECHANISM 2: SEVONPEND Event Generation (ARMv6-M §B1.5.15, §B3.2.3)
      // Generates an event on ANY pending transition: NO NVIC_ISER requirement!
      // Operates even if PRIMASK == 1 (Scenario 4)
      if (this.sevonpend) {
        if (this.waiting) {
          this.waiting = false;
          // Deterministic consumption policy (ARM §B1.5.15 implementation-defined; NOT MEASURED on physical silicon):
          this.eventRegistered = false;
        } else {
          this.eventRegistered = true;
        }
      }
      // MECHANISM 1: Preemption-Eligible Asynchronous Wake-Up (ARMv6-M §B1.5.15)
      // Requires NVIC_ISER enablement and priority preemption against active execution priority.
      // When PRIMASK == 1, execution priority is raised to 0, which blocks configurable
      // IRQs (priorities 0-3) from preempting. Hence Mechanism 1 is BLOCKED if PM == 1 (Scenario 3)!
      else if (this.waiting && !this.PM) {
        const isEnabled = (this.enabledInterrupts & irqBit) !== 0;
        if (isEnabled) {
          const irqPriority = this.getInterruptPriority(irq);
          const currentPri = this.currentPriority;
          // Lower numerical value represents strictly higher urgency
          if (irqPriority < currentPri) {
            this.waiting = false;
            this.eventRegistered = false;
            this.checkForInterrupts();
          }
        }
      }
    }
  }

  /**
   * Helper to determine effective priority of configurable external IRQ.
   */
  public getInterruptPriority(irq: number): number {
    for (let p = 0; p < 4; p++) {
      if ((this.interruptPriorities[p] & (1 << irq)) !== 0) {
        return p;
      }
    }
    return LOWEST_PRIORITY_SENTINEL;
  }

  /**
   * Helper for effective execution priority.
   * When IPSR == 0 (Thread mode), base comparison sentinel is 32 (LOWEST_PRIORITY in rp2040js).
   */
  public get currentPriority(): number {
    if (this.IPSR === 0) {
      return LOWEST_PRIORITY_SENTINEL;
    }
    return this.exceptionPriority(this.IPSR);
  }

  /**
   * Hardware RXEV Event Pulse Reception from counterpart core (RP2040 Datasheet §2.3.3).
   */
  public receiveEventPulse(): void {
    if (this.waiting) {
      // Wakes sleeping core
      this.waiting = false;
      // ARMv6-M DDI 0419C §B1.5.15 notes that whether restarting execution after WFE suspension causes ClearEventRegister() is IMPLEMENTATION DEFINED.
      // VoltForge adopts a deterministic consumption policy (eventRegistered = false). This is NOT MEASURED on physical silicon.
      this.eventRegistered = false;
    } else {
      // Core is awake: latches sticky event flag for subsequent WFE
      this.eventRegistered = true;
    }
  }

  /**
   * Exception Entry Sanitization:
   * Overrides upstream line 247 defect (which incorrectly set eventRegistered = true on entry).
   * ARMv6-M §B1.5.15 / §B1.5.17: exception entry does not set the Event Register.
   * Also ensures core exits sleeping state upon entering exception handler.
   */
  override exceptionEntry(exceptionNumber: number): void {
    const savedEventState = this.eventRegistered;
    super.exceptionEntry(exceptionNumber);
    this.eventRegistered = savedEventState;
    this.waiting = false;
  }

  /**
   * Core Instruction Execution and Sleep Management Loop.
   */
  override executeInstruction(): number {
    this.multicore.activeCoreId = this.coreId;

    // 1. SLEEPING STATE MANAGEMENT (Guards upstream lines 517–529 defect)
    if (this.waiting) {
      // NMI Wake-Up (Exception 2 is immune to PRIMASK)
      if (this.pendingNMI) {
        this.waiting = false;
        this.eventRegistered = false;
        this.interruptsUpdated = true;
        if (this.checkForInterrupts()) {
          this.cycles += 1;
          return 1;
        }
      }

      // Check if any eligible interrupt can wake us
      if (this.interruptsUpdated) {
        if (!this.PM && this.checkForInterrupts()) {
          this.waiting = false;
          this.cycles += 1;
          return 1;
        }
      }

      // Core remains in suspended low-power sleep state
      if (this.waiting) {
        this.cycles += 1; // Virtual time progression
        return 1;         // Do not fetch opcodes or advance PC
      }
    }

    // 2. ACTIVE INSTRUCTION FETCH
    const opcodePC = (this.PC & ~1) >>> 0;
    const opcode = this.readUint16(opcodePC);

    // 3. EXPLICIT SEV INSTRUCTION INTERCEPTION (Opcode 0xBF40)
    if (opcode === OPCODE_SEV) {
      this.PC += 2;
      this.cycles += 1;

      // Local core effect: set own event register (ARMv6-M §B1.5.15)
      this.eventRegistered = true;

      // Cross-core hardware pulse (RP2040 Datasheet §2.3.3)
      this.multicore.sendCrossCoreEvent(this.coreId);

      return 1;
    }

    // 4. DELEGATE TO UPSTREAM CORTEX-M0+ DECODER
    // Native upstream handles:
    // - WFE opcode: if (eventRegistered) eventRegistered=false; else waiting=true;
    // - exceptionReturn(): executes this.eventRegistered = true; (Line 296, §B1.5.17)
    return super.executeInstruction();
  }

  /**
   * Core-specific memory reads (intercepts CPUID, SIO FIFO, SCR, and Core-Private PPB / NVIC).
   */
  override readUint32(address: number): number {
    this.multicore.activeCoreId = this.coreId;
    address = address >>> 0;

    // SIO CPUID: returns executing core ID
    if (address === 0xd0000000) {
      return this.coreId;
    }

    // SIO FIFO aperture: 0xd0000050..0xd0000058
    if (address >= 0xd0000050 && address <= 0xd0000058) {
      return this.multicore.sioFifo.readFifoRegister(this.coreId, address);
    }

    // PPB System Control Register (SCR): 0xe000ed10
    if (address === 0xe000ed10) {
      return (this.sevonpend ? (1 << 4) : 0) |
             (this.sleepDeep ? (1 << 2) : 0) |
             (this.sleepOnExit ? (1 << 1) : 0);
    }

    // Core-Private NVIC Registers:
    if (address === 0xe000e100 || address === 0xe000e180) {
      return this.enabledInterrupts >>> 0;
    }
    if (address === 0xe000e200 || address === 0xe000e280) {
      return this.pendingInterrupts >>> 0;
    }
    if (address === 0xe000ed08) {
      return this.VTOR >>> 0;
    }
    if (address === 0xe000ed04) {
      return ((this.IPSR & 0x1ff) |
             (this.pendingNMI ? (1 << 31) : 0) |
             (this.pendingPendSV ? (1 << 28) : 0) |
             (this.pendingSystick ? (1 << 26) : 0)) >>> 0;
    }
    if (address >= 0xe000e400 && address <= 0xe000e41c) {
      const regIndex = (address - 0xe000e400) >> 2;
      let val = 0;
      for (let b = 0; b < 4; b++) {
        const irq = regIndex * 4 + b;
        const pri = this.getInterruptPriority(irq);
        val |= (pri & 0x3) << (8 * b + 6);
      }
      return val >>> 0;
    }

    return super.readUint32(address);
  }

  /**
   * Core-specific memory writes (intercepts SIO FIFO, SCR, and Core-Private PPB / NVIC).
   */
  override writeUint32(address: number, value: number): void {
    this.multicore.activeCoreId = this.coreId;
    address = address >>> 0;
    value = value >>> 0;

    // SIO FIFO aperture: 0xd0000050..0xd0000058
    if (address >= 0xd0000050 && address <= 0xd0000058) {
      this.multicore.sioFifo.writeFifoRegister(this.coreId, address, value);
      return;
    }

    // PPB System Control Register (SCR): 0xe000ed10
    if (address === 0xe000ed10) {
      this.sevonpend = (value & (1 << 4)) !== 0;
      this.sleepDeep = (value & (1 << 2)) !== 0;
      this.sleepOnExit = (value & (1 << 1)) !== 0;
      return;
    }

    // Core-Private NVIC Registers:
    if (address === 0xe000e100) {
      this.enabledInterrupts |= value;
      this.interruptsUpdated = true;
      return;
    }
    if (address === 0xe000e180) {
      this.enabledInterrupts &= ~value;
      return;
    }
    if (address === 0xe000e200) {
      this.pendingInterrupts |= value;
      this.interruptsUpdated = true;
      return;
    }
    if (address === 0xe000e280) {
      this.pendingInterrupts &= ~value;
      return;
    }
    if (address === 0xe000ed08) {
      this.VTOR = value;
      return;
    }
    if (address === 0xe000ed04) {
      if (value & (1 << 31)) {
        this.pendingNMI = true;
        this.interruptsUpdated = true;
      }
      if (value & (1 << 28)) {
        this.pendingPendSV = true;
        this.interruptsUpdated = true;
      }
      if (value & (1 << 27)) {
        this.pendingPendSV = false;
      }
      if (value & (1 << 26)) {
        this.pendingSystick = true;
        this.interruptsUpdated = true;
      }
      if (value & (1 << 25)) {
        this.pendingSystick = false;
      }
      return;
    }
    if (address >= 0xe000e400 && address <= 0xe000e41c) {
      const regIndex = (address - 0xe000e400) >> 2;
      for (let b = 0; b < 4; b++) {
        const interruptNumber = regIndex * 4 + b;
        const newPriority = (value >> (8 * b + 6)) & 0x3;
        for (let p = 0; p < this.interruptPriorities.length; p++) {
          this.interruptPriorities[p] &= ~(1 << interruptNumber);
        }
        this.interruptPriorities[newPriority] |= 1 << interruptNumber;
      }
      this.interruptsUpdated = true;
      return;
    }

    super.writeUint32(address, value);
  }
}
