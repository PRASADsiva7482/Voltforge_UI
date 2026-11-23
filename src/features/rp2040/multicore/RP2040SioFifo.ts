/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 SIO Inter-Core Dual FIFO
 * 
 * Implements:
 * - Unidirectional Core 0 -> Core 1 FIFO (8 words depth)
 * - Unidirectional Core 1 -> Core 0 FIFO (8 words depth)
 * - Core-specific FIFO_ST status registers (VLD, RDY, WOF, ROE)
 * - Non-blocking register writes to FIFO_WR with sticky WOF flag on overflow
 * - Non-blocking register reads from FIFO_RD with sticky ROE flag on underflow
 * - W1C write-one-to-clear sticky error flag behavior on FIFO_ST
 * - Level-sensitive interrupt outputs:
 *     * SIO_IRQ_PROC0 (IRQ 15) to Core 0
 *     * SIO_IRQ_PROC1 (IRQ 16) to Core 1
 * - Strict decoupling: FIFO write does NOT pulse SEV (Pico SDK executes explicit SEV)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import type { RP2040Multicore } from './RP2040Multicore';
import type {
  Rp2040CoreFifoStatus,
  Rp2040FifoTelemetry,
} from '../../simulator/rp2040Telemetry';

export const SIO_FIFO_ST = 0xd0000050;
export const SIO_FIFO_WR = 0xd0000054;
export const SIO_FIFO_RD = 0xd0000058;

export const SIO_FIFO_ST_VLD = 1 << 0; // Bit 0: Valid data in RX FIFO
export const SIO_FIFO_ST_RDY = 1 << 1; // Bit 1: Space available in TX FIFO
export const SIO_FIFO_ST_WOF = 1 << 2; // Bit 2: Sticky Write On Full error
export const SIO_FIFO_ST_ROE = 1 << 3; // Bit 3: Sticky Read On Empty error

export const SIO_FIFO_DEPTH = 8;
export const SIO_IRQ_PROC0 = 15;
export const SIO_IRQ_PROC1 = 16;

export class RP2040SioFifo {
  readonly multicore: RP2040Multicore;

  /** FIFO 0 -> 1 (Core 0 TX / Core 1 RX) */
  private fifo0to1: number[] = [];

  /** FIFO 1 -> 0 (Core 1 TX / Core 0 RX) */
  private fifo1to0: number[] = [];

  /** Sticky error flags for Core 0 */
  public wof0: boolean = false;
  public roe0: boolean = false;

  /** Sticky error flags for Core 1 */
  public wof1: boolean = false;
  public roe1: boolean = false;

  constructor(multicore: RP2040Multicore) {
    this.multicore = multicore;
  }

  /**
   * Resets both FIFOs and sticky flags to empty / ready.
   */
  public reset(): void {
    this.fifo0to1 = [];
    this.fifo1to0 = [];
    this.wof0 = false;
    this.roe0 = false;
    this.wof1 = false;
    this.roe1 = false;
    this.updateInterrupts();
  }

  /**
   * Pushes a 32-bit word into the outgoing TX FIFO for the specified core.
   * Returns true if successfully queued; false if discarded due to full FIFO.
   */
  public push(fromCore: 0 | 1, value: number): boolean {
    value = value >>> 0;

    // Core 0 TX FIFO is fifo0to1; Core 1 TX FIFO is fifo1to0
    const txFifo = fromCore === 0 ? this.fifo0to1 : this.fifo1to0;

    // Check overflow
    if (txFifo.length >= SIO_FIFO_DEPTH) {
      if (fromCore === 0) {
        this.wof0 = true;
      } else {
        this.wof1 = true;
      }
      this.updateInterrupts();
      return false; // Discard word
    }

    // Hand off to Boot ROM handshake state machine if Core 0 pushes before Core 1 launch
    if (fromCore === 0 && !this.multicore.bootRom.isLaunched()) {
      const handled = this.multicore.bootRom.handleCore0Push(value);
      if (handled) {
        this.updateInterrupts();
        return true;
      }
    }

    txFifo.push(value);
    this.updateInterrupts();
    return true;
  }

  /**
   * Pushes directly to an incoming FIFO (used by Boot ROM to deliver echoes).
   */
  public pushEcho(toCore: 0 | 1, value: number): boolean {
    value = value >>> 0;
    const rxFifo = toCore === 0 ? this.fifo1to0 : this.fifo0to1;
    if (rxFifo.length >= SIO_FIFO_DEPTH) {
      if (toCore === 0) {
        this.wof1 = true;
      } else {
        this.wof0 = true;
      }
      this.updateInterrupts();
      return false;
    }
    rxFifo.push(value);
    this.updateInterrupts();
    return true;
  }

  /**
   * Pops a 32-bit word from the incoming RX FIFO for the specified core.
   * Returns popped value, or 0 if empty (with ROE error latched).
   */
  public pop(byCore: 0 | 1): number {
    const rxFifo = byCore === 0 ? this.fifo1to0 : this.fifo0to1;

    if (rxFifo.length === 0) {
      if (byCore === 0) {
        this.roe0 = true;
      } else {
        this.roe1 = true;
      }
      this.updateInterrupts();
      return 0;
    }

    const value = rxFifo.shift()! >>> 0;
    this.updateInterrupts();
    return value;
  }

  /**
   * Reads from SIO FIFO aperture (FIFO_ST, FIFO_WR, FIFO_RD).
   */
  public readFifoRegister(coreId: 0 | 1, address: number): number {
    address = address >>> 0;

    switch (address) {
      case SIO_FIFO_ST: {
        const rxFifo = coreId === 0 ? this.fifo1to0 : this.fifo0to1;
        const txFifo = coreId === 0 ? this.fifo0to1 : this.fifo1to0;
        const wof = coreId === 0 ? this.wof0 : this.wof1;
        const roe = coreId === 0 ? this.roe0 : this.roe1;

        let st = 0;
        if (rxFifo.length > 0) st |= SIO_FIFO_ST_VLD;
        if (txFifo.length < SIO_FIFO_DEPTH) st |= SIO_FIFO_ST_RDY;
        if (wof) st |= SIO_FIFO_ST_WOF;
        if (roe) st |= SIO_FIFO_ST_ROE;

        return st >>> 0;
      }

      case SIO_FIFO_WR:
        // Reading write register returns 0
        return 0;

      case SIO_FIFO_RD:
        return this.pop(coreId);

      default:
        return 0;
    }
  }

  /**
   * Writes to SIO FIFO aperture (FIFO_ST, FIFO_WR, FIFO_RD).
   */
  public writeFifoRegister(coreId: 0 | 1, address: number, value: number): void {
    address = address >>> 0;
    value = value >>> 0;

    switch (address) {
      case SIO_FIFO_ST: {
        // W1C behavior: writing 1 clears sticky error flags
        // Also writing 0 clears sticky error flags per SDK conventions
        if (coreId === 0) {
          if ((value & SIO_FIFO_ST_WOF) !== 0 || value === 0) this.wof0 = false;
          if ((value & SIO_FIFO_ST_ROE) !== 0 || value === 0) this.roe0 = false;
        } else {
          if ((value & SIO_FIFO_ST_WOF) !== 0 || value === 0) this.wof1 = false;
          if ((value & SIO_FIFO_ST_ROE) !== 0 || value === 0) this.roe1 = false;
        }
        this.updateInterrupts();
        break;
      }

      case SIO_FIFO_WR:
        this.push(coreId, value);
        break;

      case SIO_FIFO_RD:
        // Writing to FIFO_RD has no effect on real silicon
        break;
    }
  }

  /**
   * Drains the incoming RX FIFO for the specified core.
   */
  public drain(coreId: 0 | 1): void {
    if (coreId === 0) {
      this.fifo1to0 = [];
    } else {
      this.fifo0to1 = [];
    }
    this.updateInterrupts();
  }

  /**
   * Queries lengths of FIFOs for diagnostics and tests.
   */
  public getRxCount(coreId: 0 | 1): number {
    return coreId === 0 ? this.fifo1to0.length : this.fifo0to1.length;
  }

  public getTxCount(coreId: 0 | 1): number {
    return coreId === 0 ? this.fifo0to1.length : this.fifo1to0.length;
  }

  /**
   * Non-destructive peek of the requested SIO inter-core FIFO.
   * Returns a shallow copy (.slice()) of the FIFO array from head to tail.
   * Does NOT pop, mutate pointers, modify sticky error flags, assert IRQs,
   * or emit events/wakeups.
   */
  public peekFifo(direction: '0to1' | '1to0'): number[] {
    return (direction === '0to1' ? this.fifo0to1 : this.fifo1to0).slice();
  }

  /**
   * Evaluates the SIO_FIFO_ST status flags and IRQ condition for the specified core
   * without modifying any registers or internal FIFO state.
   */
  public getFifoStatus(coreId: 0 | 1): Rp2040CoreFifoStatus {
    const rxFifo = coreId === 0 ? this.fifo1to0 : this.fifo0to1;
    const txFifo = coreId === 0 ? this.fifo0to1 : this.fifo1to0;
    const wof = coreId === 0 ? this.wof0 : this.wof1;
    const roe = coreId === 0 ? this.roe0 : this.roe1;
    const irqAsserted = rxFifo.length > 0 || wof || roe;

    return {
      vld: rxFifo.length > 0,
      rdy: txFifo.length < SIO_FIFO_DEPTH,
      wof,
      roe,
      irqAsserted,
    };
  }

  /**
   * Returns a complete non-destructive telemetry snapshot of both SIO FIFOs
   * and per-core status registers.
   */
  public getFifoTelemetry(): Rp2040FifoTelemetry {
    return {
      fifo0to1: {
        depth: this.fifo0to1.length,
        entries: this.fifo0to1.slice(),
      },
      fifo1to0: {
        depth: this.fifo1to0.length,
        entries: this.fifo1to0.slice(),
      },
      core0Status: this.getFifoStatus(0),
      core1Status: this.getFifoStatus(1),
    };
  }

  /**
   * Updates level-sensitive interrupt lines for both cores:
   * - IRQ 15 to Core 0
   * - IRQ 16 to Core 1
   */
  public updateInterrupts(): void {
    // Core 0 interrupt condition: RX data available or sticky error asserted
    const proc0Active = this.fifo1to0.length > 0 || this.wof0 || this.roe0;
    this.multicore.core0.setInterrupt(SIO_IRQ_PROC0, proc0Active);

    // Core 1 interrupt condition: RX data available or sticky error asserted
    const proc1Active = this.fifo0to1.length > 0 || this.wof1 || this.roe1;
    this.multicore.core1.setInterrupt(SIO_IRQ_PROC1, proc1Active);
  }
}

