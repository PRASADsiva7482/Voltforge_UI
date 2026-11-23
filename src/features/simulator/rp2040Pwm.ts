/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 Hardware Pulse Width Modulator (PWM) Peripheral Emulation
 * 
 * Implements genuine RP2040 PWM hardware architecture:
 * - 8 identical slices (Slice 0 to Slice 7) with 20-byte stride (0x14)
 * - 16 independent PWM channels (Channel A and Channel B per slice)
 * - 4 KB register aperture at base address 0x40050000
 * - Atomic register aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)
 * - Free-running up-counting and phase-correct dual-slope counting
 * - 8.4 fractional clock divider (8-bit integer, 4-bit fractional sigma-delta rate division)
 * - 16-bit double-buffered counter compare (CC.A, CC.B) and period wrap limit (TOP)
 * - Output polarity inversion (A_INV, B_INV)
 * - Simultaneous multi-slice enable mask (PWM_EN)
 * - Shared system interrupt IRQ 4 (PWM_IRQ_WRAP) with INTR, INTE, INTF, and INTS
 * - Dedicated per-slice DMA request pacing: DREQ 24..31 (DREQ_PWM_WRAP0..7)
 * - Deterministic integer-based cycle advancement with zero floating-point timing drift
 * 
 * Hardware Reference:
 * - Raspberry Pi RP2040 Datasheet Section 4.5 "PWM"
 * - Raspberry Pi Pico SDK: hardware/regs/pwm.h & hardware/pwm.h
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040, BasePeripheral, type Peripheral } from 'rp2040js';

// ─── Register Offsets & Base Addresses ───────────────────────────────────────────────

export const PWM_BASE           = 0x40050000;
export const PWM_NUM_SLICES     = 8;
export const PWM_SLICE_STRIDE   = 0x14;
export const PWM_IRQ_WRAP       = 4;

// Slice Register Offsets (relative to slice base)
export const REG_CH_CSR         = 0x00; // Control and status
export const REG_CH_DIV         = 0x04; // Clock divider (8-bit int, 4-bit frac)
export const REG_CH_CTR         = 0x08; // 16-bit counter value
export const REG_CH_CC          = 0x0c; // Compare levels (CC.B in [31:16], CC.A in [15:0])
export const REG_CH_TOP         = 0x10; // Counter period limit (wrap value)

// Global Register Offsets
export const REG_PWM_EN         = 0xa0; // Simultaneous slice enable
export const REG_PWM_INTR       = 0xa4; // Raw interrupt status (W1C)
export const REG_PWM_INTE       = 0xa8; // Interrupt enable
export const REG_PWM_INTF       = 0xac; // Interrupt force
export const REG_PWM_INTS       = 0xb0; // Masked interrupt status (RO)

// ─── Bitfield Masks & Flags ──────────────────────────────────────────────────────────

// CHx_CSR
export const CSR_EN             = 1 << 0; // Slice enable
export const CSR_PH_CORRECT     = 1 << 1; // Phase-correct / dual-slope mode
export const CSR_A_INV          = 1 << 2; // Invert output A
export const CSR_B_INV          = 1 << 3; // Invert output B
export const CSR_DIVMODE_SHIFT  = 4;
export const CSR_DIVMODE_MASK   = 0x3;    // 00=Free-running, 01=Gated by B, 10=B rising, 11=B falling
export const CSR_PH_RET         = 1 << 6; // Retard phase (self-clearing)
export const CSR_PH_ADV         = 1 << 7; // Advance phase (self-clearing)

export const CSR_WRITABLE_MASK  = 0xff;

// CHx_DIV
export const DIV_FRAC_MASK      = 0x0f;
export const DIV_INT_SHIFT      = 4;
export const DIV_INT_MASK       = 0xff;
export const DIV_WRITABLE_MASK  = 0x0fff;

// CHx_CTR
export const CTR_MASK           = 0xffff;

// CHx_CC
export const CC_A_MASK          = 0xffff;
export const CC_B_SHIFT         = 16;
export const CC_B_MASK          = 0xffff;

// CHx_TOP
export const TOP_MASK           = 0xffff;

// Global Masks
export const SLICE_MASK         = 0xff; // 8 slices

// DMA DREQ Channels (RP2040 Datasheet Table 43)
export const DREQ_PWM_WRAP0     = 24;
export const DREQ_PWM_WRAP1     = 25;
export const DREQ_PWM_WRAP2     = 26;
export const DREQ_PWM_WRAP3     = 27;
export const DREQ_PWM_WRAP4     = 28;
export const DREQ_PWM_WRAP5     = 29;
export const DREQ_PWM_WRAP6     = 30;
export const DREQ_PWM_WRAP7     = 31;

// ─── Data Types & Diagnostic Interfaces ──────────────────────────────────────────────

export interface PwmSliceDiagnostics {
  sliceIndex: number;
  enabled: boolean;
  phaseCorrect: boolean;
  divMode: number;
  intDiv: number;
  fracDiv: number;
  effectiveDivider: number;
  frequency_Hz: number;
  counter: number;
  top: number;
  compareA: number;
  compareB: number;
  dutyA: number; // 0.0 to 1.0
  dutyB: number; // 0.0 to 1.0
  invA: boolean;
  invB: boolean;
  outA: boolean;
  outB: boolean;
  pinBLevel?: boolean;
  isChannelBInput?: boolean;
}

export interface PwmDiagnostics {
  baseAddress: number;
  irq: number;
  enRegister: number;
  rawInterrupts: number;
  interruptEnable: number;
  interruptForce: number;
  maskedInterrupts: number;
  slices: PwmSliceDiagnostics[];
}

export interface PwmOutputTransitionEvent {
  timestamp_s: number;
  cycle: number;
  slice: number;
  channel: 'A' | 'B';
  level: boolean;
}

/**
 * Individual RP2040 PWM Hardware Slice (Slice 0..7).
 */
export class PwmSlice {
  public readonly index: number;
  private readonly pwm: RP2040Pwm;

  // Registers
  public csr: number = 0x00000000;
  public div: number = 0x00000010; // Default divider = 1.0 (int=1, frac=0)
  public ctr: number = 0x00000000;
  public cc: number = 0x00000000;
  public top: number = 0x0000ffff; // Default TOP = 65535

  // Double-buffered latched registers (updated on wrap)
  private latchedCC: number = 0x00000000;
  private latchedTOP: number = 0x0000ffff;
  private ccPending: boolean = false;
  private topPending: boolean = false;

  // Timing & Counting State
  private countingDown: boolean = false;
  private fracAccumulator: number = 0; // Fixed-point accumulator (scale: 16)

  // Input Pin B Level & Edge Tracking (DIVMODE 01, 10, 11)
  public pinBLevel: boolean = false;
  private prevPinBLevel: boolean = false;

  // Current Output Levels
  public rawOutA: boolean = false;
  public rawOutB: boolean = false;

  constructor(pwm: RP2040Pwm, index: number) {
    this.pwm = pwm;
    this.index = index;
    this.reset();
  }

  public reset(): void {
    this.csr = 0x00000000;
    this.div = 0x00000010; // 1.0 (int=1, frac=0)
    this.ctr = 0x00000000;
    this.cc = 0x00000000;
    this.top = 0x0000ffff;
    this.latchedCC = 0x00000000;
    this.latchedTOP = 0x0000ffff;
    this.ccPending = false;
    this.topPending = false;
    this.countingDown = false;
    this.fracAccumulator = 0;
    this.pinBLevel = false;
    this.prevPinBLevel = false;
    this.rawOutA = false;
    this.rawOutB = false;
    this.updateOutputs();
  }

  // ─── Register Accessors ────────────────────────────────────────────────────────────

  public get enabled(): boolean {
    return (this.csr & CSR_EN) !== 0;
  }

  public set enabled(val: boolean) {
    const wasEnabled = this.enabled;
    if (val) {
      this.csr |= CSR_EN;
      if (!wasEnabled) {
        // Immediate commit on enable if pending
        this.commitDoubleBuffered();
        this.updateOutputs();
      }
    } else {
      this.csr &= ~CSR_EN;
      // Output held low (or inverted) when disabled
      this.rawOutA = false;
      this.rawOutB = false;
      this.updateOutputs();
    }
  }

  public get phaseCorrect(): boolean {
    return (this.csr & CSR_PH_CORRECT) !== 0;
  }

  public get invA(): boolean {
    return (this.csr & CSR_A_INV) !== 0;
  }

  public get invB(): boolean {
    return (this.csr & CSR_B_INV) !== 0;
  }

  public get divMode(): number {
    return (this.csr >> CSR_DIVMODE_SHIFT) & CSR_DIVMODE_MASK;
  }

  public get intDiv(): number {
    const intVal = (this.div >> DIV_INT_SHIFT) & DIV_INT_MASK;
    return intVal === 0 ? 256 : intVal;
  }

  public get fracDiv(): number {
    return this.div & DIV_FRAC_MASK;
  }

  public get effectiveDivider(): number {
    return this.intDiv + this.fracDiv / 16.0;
  }

  public get counter(): number {
    return this.ctr;
  }

  public get compareA(): number {
    return this.cc & CC_A_MASK;
  }

  public get compareB(): number {
    return (this.cc >>> CC_B_SHIFT) & CC_B_MASK;
  }

  public get latchedCompareA(): number {
    return this.latchedCC & CC_A_MASK;
  }

  public get latchedCompareB(): number {
    return (this.latchedCC >>> CC_B_SHIFT) & CC_B_MASK;
  }

  public get outputA(): boolean {
    if (!this.enabled) return this.invA;
    return this.invA ? !this.rawOutA : this.rawOutA;
  }

  public get outputB(): boolean {
    // When divMode !== 0 (01: B_HIGH, 10: B_RISING, 11: B_FALLING),
    // Channel B acts strictly as an input pin; CC_B must not output PWM.
    if (this.divMode !== 0) return false;
    if (!this.enabled) return this.invB;
    return this.invB ? !this.rawOutB : this.rawOutB;
  }

  public get dutyCycleA(): number {
    const topVal = this.top;
    if (topVal === 0) return 0;
    const ccA = this.compareA;
    if (ccA > topVal) return 1.0;
    return Math.min(1.0, ccA / (topVal + 1));
  }

  public get dutyCycleB(): number {
    if (this.divMode !== 0) return 0;
    const topVal = this.top;
    if (topVal === 0) return 0;
    const ccB = this.compareB;
    if (ccB > topVal) return 1.0;
    return Math.min(1.0, ccB / (topVal + 1));
  }

  public get frequency_Hz(): number {
    if (!this.enabled) return 0;
    if (this.divMode === 2 || this.divMode === 3) {
      // Clocked externally by pin B transitions
      return 0;
    }
    const sysClk = this.pwm.systemClock_Hz;
    const div = this.effectiveDivider;
    const topVal = this.top;
    if (this.phaseCorrect) {
      if (topVal === 0) return 0;
      return sysClk / (2.0 * div * topVal);
    }
    return sysClk / (div * (topVal + 1));
  }

  // ─── Register Read / Write Logic ───────────────────────────────────────────────────

  public readRegister(regOffset: number): number {
    switch (regOffset) {
      case REG_CH_CSR:
        return this.csr;
      case REG_CH_DIV:
        return this.div;
      case REG_CH_CTR:
        return this.ctr;
      case REG_CH_CC:
        return this.cc;
      case REG_CH_TOP:
        return this.top;
      default:
        return 0;
    }
  }

  public writeRegister(regOffset: number, value: number): void {
    switch (regOffset) {
      case REG_CH_CSR: {
        const wasEnabled = this.enabled;
        const newEn = (value & CSR_EN) !== 0;

        // PH_ADV and PH_RET are self-clearing single-cycle nudges
        if (newEn) {
          if (value & CSR_PH_ADV) {
            this.advanceCounter(1);
          }
          if (value & CSR_PH_RET) {
            this.advanceCounter(-1);
          }
        }

        // Store CSR with PH_ADV / PH_RET cleared
        this.csr = value & (CSR_WRITABLE_MASK & ~(CSR_PH_ADV | CSR_PH_RET));

        if (newEn && !wasEnabled) {
          this.commitDoubleBuffered();
        }
        this.updateOutputs();
        break;
      }

      case REG_CH_DIV:
        this.div = value & DIV_WRITABLE_MASK;
        break;

      case REG_CH_CTR:
        this.ctr = value & CTR_MASK;
        this.pwm.clearDreq(this.index);
        this.updateOutputs();
        break;

      case REG_CH_CC:
        this.cc = value >>> 0;
        this.ccPending = true;
        this.pwm.clearDreq(this.index);
        if (!this.enabled) {
          this.commitDoubleBuffered();
        }
        break;

      case REG_CH_TOP:
        this.top = value & TOP_MASK;
        this.topPending = true;
        this.pwm.clearDreq(this.index);
        if (!this.enabled) {
          this.commitDoubleBuffered();
        }
        break;
    }
  }

  public commitDoubleBuffered(): void {
    if (this.ccPending) {
      this.latchedCC = this.cc;
      this.ccPending = false;
    }
    if (this.topPending) {
      this.latchedTOP = this.top;
      this.topPending = false;
    }
  }

  public advanceCounter(delta: number): void {
    const topVal = this.latchedTOP;
    let nextCtr = this.ctr + delta;
    if (nextCtr < 0) nextCtr = 0;
    if (nextCtr > topVal) nextCtr = topVal;
    this.ctr = nextCtr & CTR_MASK;
    this.updateOutputs();
  }

  // ─── Deterministic Timing & Counter Advancement ────────────────────────────────────

  /**
   * Feeds clock pulses into the 8.4 fractional divider.
   * Preserves two-stage hardware structure:
   * Clock/B event -> 8.4 fractional divider -> counter enable -> PWM counter.
   * Each input pulse increments the fractional accumulator by 16 units.
   * When accumulator reaches or exceeds dividerTicks (intDiv * 16 + fracDiv),
   * the counter is enabled to advance.
   */
  public feedDividerPulses(numPulses: number): void {
    if (!this.enabled || numPulses <= 0) return;

    const dividerTicks = this.intDiv * 16 + this.fracDiv;
    if (dividerTicks <= 0) return;

    this.fracAccumulator += numPulses * 16;
    const ticksToAdvance = Math.floor(this.fracAccumulator / dividerTicks);
    this.fracAccumulator %= dividerTicks;

    if (ticksToAdvance <= 0) return;

    for (let t = 0; t < ticksToAdvance; t++) {
      this.advanceTick();
    }
  }

  /**
   * Sets the digital logic level of the slice's channel B input pin.
   * Evaluates edge transitions for B_RISING and B_FALLING modes.
   */
  public setPinBLevel(level: boolean): void {
    const wasHigh = this.pinBLevel;
    this.pinBLevel = level;

    if (!this.enabled) {
      this.prevPinBLevel = level;
      return;
    }

    if (this.divMode === 2) {
      // 10: B_RISING — One clock pulse into divider on rising edge (0 -> 1)
      if (!wasHigh && level) {
        this.feedDividerPulses(1);
      }
    } else if (this.divMode === 3) {
      // 11: B_FALLING — One clock pulse into divider on falling edge (1 -> 0)
      if (wasHigh && !level) {
        this.feedDividerPulses(1);
      }
    }

    this.prevPinBLevel = level;
  }

  /**
   * Advances the slice counter by deltaCycles system clock cycles.
   * Uses exact 8.4 fractional rate scaling without floating-point drift.
   */
  public tickCycles(deltaCycles: number): void {
    if (!this.enabled || deltaCycles <= 0) return;

    if (this.divMode === 0) {
      // 00: Free-running — Fractional divider receives continuous system clock
      this.feedDividerPulses(deltaCycles);
    } else if (this.divMode === 1) {
      // 01: B_HIGH — Fractional divider input is gated by PWM B being high
      if (this.pinBLevel) {
        this.feedDividerPulses(deltaCycles);
      }
    }
    // 10: B_RISING & 11: B_FALLING — System clock does NOT feed divider.
    // Clock pulses into the divider are generated strictly by B pin transitions in setPinBLevel.
  }

  private advanceTick(): void {
    const topVal = this.latchedTOP;

    if (this.phaseCorrect) {
      // Dual-slope (up-and-down) counting
      if (!this.countingDown) {
        if (this.ctr >= topVal) {
          if (topVal === 0) {
            // At TOP=0, immediately wrap
            this.triggerWrap();
          } else {
            this.countingDown = true;
            this.ctr = topVal - 1;
          }
        } else {
          this.ctr++;
        }
      } else {
        // Counting down
        if (this.ctr <= 0) {
          this.countingDown = false;
          this.triggerWrap();
          this.ctr = topVal > 0 ? 1 : 0;
        } else {
          this.ctr--;
        }
      }
    } else {
      // Standard sawtooth (up-counting) mode
      if (this.ctr >= topVal) {
        this.ctr = 0;
        this.triggerWrap();
      } else {
        this.ctr++;
      }
    }

    this.updateOutputs();
  }

  private triggerWrap(): void {
    // 1. Commit double-buffered CC and TOP
    this.commitDoubleBuffered();

    // 2. Assert raw interrupt bit in INTR
    this.pwm.assertRawInterrupt(this.index);

    // 3. Assert dedicated DMA request for this slice (DREQ 24..31)
    this.pwm.assertDreq(this.index);
  }

  private updateOutputs(): void {
    const prevOutA = this.outputA;
    const prevOutB = this.outputB;

    if (!this.enabled) {
      this.rawOutA = false;
      this.rawOutB = false;
    } else {
      // RP2040 Datasheet Section 4.5.2.2:
      // Output is HIGH when CTR < CC, and LOW when CTR >= CC
      const ccA = this.latchedCompareA;
      const ccB = this.latchedCompareB;
      this.rawOutA = this.ctr < ccA;
      this.rawOutB = this.ctr < ccB;
    }

    const curOutA = this.outputA;
    const curOutB = this.outputB;

    if (curOutA !== prevOutA) {
      this.pwm.notifyOutputTransition(this.index, 'A', curOutA);
    }
    if (curOutB !== prevOutB) {
      this.pwm.notifyOutputTransition(this.index, 'B', curOutB);
    }
  }

  public getDiagnostics(): PwmSliceDiagnostics {
    return {
      sliceIndex: this.index,
      enabled: this.enabled,
      phaseCorrect: this.phaseCorrect,
      divMode: this.divMode,
      intDiv: this.intDiv,
      fracDiv: this.fracDiv,
      effectiveDivider: this.effectiveDivider,
      frequency_Hz: this.frequency_Hz,
      counter: this.ctr,
      top: this.top,
      compareA: this.compareA,
      compareB: this.compareB,
      dutyA: this.dutyCycleA,
      dutyB: this.dutyCycleB,
      invA: this.invA,
      invB: this.invB,
      outA: this.outputA,
      outB: this.outputB,
      pinBLevel: this.pinBLevel,
      isChannelBInput: this.divMode !== 0,
    };
  }
}

/**
 * High-Fidelity RP2040 Hardware PWM Peripheral.
 */
export class RP2040Pwm extends BasePeripheral implements Peripheral {
  public readonly irq: number = PWM_IRQ_WRAP;
  public readonly slices: PwmSlice[] = [];

  // Global Registers
  private intRaw: number = 0;    // INTR: Raw interrupt flags (W1C)
  private intEnable: number = 0; // INTE: Interrupt enable mask
  private intForce: number = 0;  // INTF: Software interrupt force

  // Clock Reference
  public systemClock_Hz: number = 125_000_000;

  // Listeners
  public onPinChange?: () => void;
  public onTransitionEvent?: (event: PwmOutputTransitionEvent) => void;

  constructor(rp2040: RP2040, name: string = 'PWM', irq: number = PWM_IRQ_WRAP) {
    super(rp2040, name);
    this.irq = irq;
    this.systemClock_Hz = rp2040.clkSys || 125_000_000;

    for (let i = 0; i < PWM_NUM_SLICES; i++) {
      this.slices.push(new PwmSlice(this, i));
    }

    this.reset();
  }

  public reset(): void {
    this.intRaw = 0;
    this.intEnable = 0;
    this.intForce = 0;
    for (const slice of this.slices) {
      slice.reset();
    }
    this.checkInterrupts();
    this.clearAllDreq();
  }

  // ─── Interrupt & DMA Handling ──────────────────────────────────────────────────────

  public get maskedInterrupts(): number {
    return (this.intRaw & this.intEnable) | this.intForce;
  }

  public assertRawInterrupt(sliceIndex: number): void {
    this.intRaw |= (1 << sliceIndex) & SLICE_MASK;
    this.checkInterrupts();
  }

  /**
   * Triggers a slice wrap interrupt and asserts DMA DREQ.
   * Backward-compatible alias for rp2040js channelInterrupt().
   */
  public channelInterrupt(sliceIndex: number): void {
    this.assertRawInterrupt(sliceIndex);
    this.assertDreq(sliceIndex);
  }

  public checkInterrupts(): void {
    const asserted = (this.maskedInterrupts & SLICE_MASK) !== 0;
    this.rp2040.setInterrupt(this.irq, asserted);
  }

  public assertDreq(sliceIndex: number): void {
    const dreqIndex = DREQ_PWM_WRAP0 + (sliceIndex & 0x7);
    this.rp2040.dma?.setDREQ(dreqIndex);
  }

  public clearDreq(sliceIndex: number): void {
    const dreqIndex = DREQ_PWM_WRAP0 + (sliceIndex & 0x7);
    this.rp2040.dma?.clearDREQ(dreqIndex);
  }

  public clearAllDreq(): void {
    for (let i = 0; i < PWM_NUM_SLICES; i++) {
      this.clearDreq(i);
    }
  }

  public notifyOutputTransition(slice: number, channel: 'A' | 'B', level: boolean): void {
    this.onPinChange?.();
    if (this.onTransitionEvent) {
      const curCycle = (this.rp2040.core as any)?.cycles ?? 0;
      const simTime = curCycle / this.systemClock_Hz;
      this.onTransitionEvent({
        timestamp_s: simTime,
        cycle: curCycle,
        slice,
        channel,
        level,
      });
    }
  }

  // ─── Direct Output Query Interface for GPIO Bridge ─────────────────────────────────

  public isSliceOutputEnabled(sliceIndex: number): boolean {
    if (sliceIndex < 0 || sliceIndex >= PWM_NUM_SLICES) return false;
    return this.slices[sliceIndex].enabled;
  }

  public getChannelOutput(sliceIndex: number, channel: 'A' | 'B'): boolean {
    if (sliceIndex < 0 || sliceIndex >= PWM_NUM_SLICES) return false;
    const slice = this.slices[sliceIndex];
    return channel === 'A' ? slice.outputA : slice.outputB;
  }

  public setPinBLevel(sliceIndex: number, level: boolean): void {
    if (sliceIndex >= 0 && sliceIndex < PWM_NUM_SLICES) {
      this.slices[sliceIndex].setPinBLevel(level);
    }
  }

  public getSliceDivMode(sliceIndex: number): number {
    if (sliceIndex >= 0 && sliceIndex < PWM_NUM_SLICES) {
      return this.slices[sliceIndex].divMode;
    }
    return 0;
  }

  /**
   * Invoked by rp2040js or bridge when a GPIO input level changes.
   * If the pin is mapped to PWM Channel B and has FUNCTION_PWM selected,
   * feeds the digital input level into the respective PWM slice.
   */
  public gpioOnInput(gpioIndex: number): void {
    if (gpioIndex < 0 || gpioIndex >= 30) return;
    const pin = this.rp2040.gpio[gpioIndex];
    if (!pin || pin.functionSelect !== 4 /* FUNCTION_PWM */) return;
    if ((gpioIndex & 1) === 1) {
      const sliceIndex = (gpioIndex >> 1) & 0x7;
      this.setPinBLevel(sliceIndex, pin.inputValue);
    }
  }

  // ─── Cycle-Accurate Stepping ───────────────────────────────────────────────────────

  public tickCycles(deltaCycles: number): void {
    if (deltaCycles <= 0) return;
    for (const slice of this.slices) {
      if (slice.enabled) {
        slice.tickCycles(deltaCycles);
      }
    }
  }

  // ─── Register Read / Write Interface with Atomic Aliases ───────────────────────────

  public override readUint32(offset: number): number {
    const regOffset = offset & 0xfff;

    // Slice registers: offset 0x00 .. 0x9F (8 slices * 0x14 = 0xA0)
    if (regOffset < REG_PWM_EN) {
      const sliceIndex = Math.floor(regOffset / PWM_SLICE_STRIDE);
      if (sliceIndex >= PWM_NUM_SLICES) return 0;
      const sliceOffset = regOffset % PWM_SLICE_STRIDE;
      return this.slices[sliceIndex].readRegister(sliceOffset);
    }

    switch (regOffset) {
      case REG_PWM_EN: {
        let enMask = 0;
        for (let i = 0; i < PWM_NUM_SLICES; i++) {
          if (this.slices[i].enabled) enMask |= (1 << i);
        }
        return enMask;
      }
      case REG_PWM_INTR:
        return this.intRaw;
      case REG_PWM_INTE:
        return this.intEnable;
      case REG_PWM_INTF:
        return this.intForce;
      case REG_PWM_INTS:
        return this.maskedInterrupts;
      default:
        return super.readUint32(offset);
    }
  }

  public override writeUint32(offset: number, value: number): void {
    // Atomic alias decoding: bits [13:12] determine atomic operation
    const atomicOp = (offset >>> 12) & 0x3;
    const regOffset = offset & 0xfff;

    if (atomicOp !== 0) {
      const curVal = this.readUint32(regOffset);
      let newVal = curVal;
      switch (atomicOp) {
        case 1: newVal = curVal ^ value; break; // XOR (+0x1000)
        case 2: newVal = curVal | value; break; // SET (+0x2000)
        case 3: newVal = curVal & ~value; break; // CLR (+0x3000)
      }
      this.writeUint32(regOffset, newVal);
      return;
    }

    // Normal Write
    if (regOffset < REG_PWM_EN) {
      const sliceIndex = Math.floor(regOffset / PWM_SLICE_STRIDE);
      if (sliceIndex >= PWM_NUM_SLICES) return;
      const sliceOffset = regOffset % PWM_SLICE_STRIDE;
      this.slices[sliceIndex].writeRegister(sliceOffset, value);
      return;
    }

    switch (regOffset) {
      case REG_PWM_EN: {
        // Simultaneous 8-bit slice enable
        for (let i = 0; i < PWM_NUM_SLICES; i++) {
          this.slices[i].enabled = (value & (1 << i)) !== 0;
        }
        break;
      }
      case REG_PWM_INTR: {
        // Write-1-to-clear
        this.intRaw &= ~(value & SLICE_MASK);
        this.checkInterrupts();
        break;
      }
      case REG_PWM_INTE: {
        this.intEnable = value & SLICE_MASK;
        this.checkInterrupts();
        break;
      }
      case REG_PWM_INTF: {
        this.intForce = value & SLICE_MASK;
        this.checkInterrupts();
        break;
      }
      default:
        super.writeUint32(offset, value);
    }
  }

  // ─── Diagnostics Snapshot ──────────────────────────────────────────────────────────

  public getDiagnostics(): PwmDiagnostics {
    return {
      baseAddress: PWM_BASE,
      irq: this.irq,
      enRegister: this.readUint32(REG_PWM_EN),
      rawInterrupts: this.intRaw,
      interruptEnable: this.intEnable,
      interruptForce: this.intForce,
      maskedInterrupts: this.maskedInterrupts,
      slices: this.slices.map((s) => s.getDiagnostics()),
    };
  }
}
