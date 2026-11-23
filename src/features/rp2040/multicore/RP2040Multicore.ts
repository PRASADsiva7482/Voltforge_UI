/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 Multicore SoC Coordinator
 * 
 * Extends the RP2040 SoC emulator with:
 * 1. Independent Core 0 and Core 1 execution contexts (VoltForgeCortexM0Core)
 * 2. Point-to-point cross-core event dispatch (Core 0 TXEV -> Core 1 RXEV and vice versa)
 * 3. High-fidelity inter-core SIO FIFO with level-sensitive IRQ 15 / 16 routing
 * 4. Boot ROM Core 1 launch state machine (RP2040 Datasheet §2.8.2)
 * 5. Dynamic SIO CPUID aperture reporting based on active executing core
 * 6. Dual-core execution stepping and cycle accounting
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import { VoltForgeCortexM0Core } from './VoltForgeCortexM0Core';
import { RP2040SioFifo, SIO_FIFO_ST, SIO_FIFO_RD } from './RP2040SioFifo';
import { RP2040BootRom } from './RP2040BootRom';
import type {
  Rp2040FifoTelemetry,
  Rp2040BootRomTelemetry,
} from '../../simulator/rp2040Telemetry';

export const SIO_CPUID = 0xd0000000;
export const PPB_SCR = 0xe000ed10;

export class RP2040Multicore extends RP2040 {
  readonly core0: VoltForgeCortexM0Core;
  readonly core1: VoltForgeCortexM0Core;
  readonly cores: [VoltForgeCortexM0Core, VoltForgeCortexM0Core];
  readonly sioFifo: RP2040SioFifo;
  readonly bootRom: RP2040BootRom;

  /** Active executing core ID (0 or 1), determining CPUID and SIO aperture context */
  public activeCoreId: 0 | 1 = 0;

  constructor(clock?: any) {
    super(clock);

    // Instantiate high-fidelity dual-core Cortex-M0+ contexts
    this.core0 = new VoltForgeCortexM0Core(this, 0);
    this.core1 = new VoltForgeCortexM0Core(this, 1);
    this.cores = [this.core0, this.core1];

    // Maintain backward-compatible alias: this.core points to Core 0
    (this as any).core = this.core0;

    // Instantiate SIO FIFO and Boot ROM state machine
    this.sioFifo = new RP2040SioFifo(this);
    this.bootRom = new RP2040BootRom(this);

    // Initial reset state
    this.reset();
  }

  /**
   * Resets SoC to initial power-on state:
   * - Core 0 resets and begins active execution
   * - Core 1 resets and starts parked in Boot ROM WFE (waiting = true)
   * - SIO FIFO and Boot ROM state machines reset to empty/step 0
   */
  override reset(): void {
    super.reset();
    if (this.core0 && this.core1) {
      this.core0.reset();
      this.core1.reset();

      // Core 1 starts parked in Boot ROM WFE
      this.core1.waiting = true;

      this.sioFifo?.reset();
      this.bootRom?.reset();
      this.activeCoreId = 0;
    }
  }

  /**
   * Point-to-Point Cross-Core Event Dispatch (RP2040 Datasheet §2.3.3).
   * Routes source core's TXEV output to target core's RXEV input pin.
   */
  public sendCrossCoreEvent(sourceCoreId: 0 | 1): void {
    const targetCoreId = (1 - sourceCoreId) as (0 | 1);
    this.cores[targetCoreId].receiveEventPulse();
  }

  /**
   * Intercepts memory reads for CPUID, SIO FIFO, and PPB SCR registers.
   */
  override readUint32(address: number): number {
    address = address >>> 0;

    // SIO CPUID: returns executing core ID (0 for Core 0, 1 for Core 1)
    if (address === SIO_CPUID) {
      return this.activeCoreId;
    }

    // SIO FIFO aperture: 0xd0000050..0xd0000058
    if (address >= SIO_FIFO_ST && address <= SIO_FIFO_RD) {
      return this.sioFifo.readFifoRegister(this.activeCoreId, address);
    }

    // PPB System Control Register (SCR): 0xe000ed10
    if (address === PPB_SCR) {
      const core = this.cores[this.activeCoreId];
      return (core.sevonpend ? (1 << 4) : 0) |
             (core.sleepDeep ? (1 << 2) : 0) |
             (core.sleepOnExit ? (1 << 1) : 0);
    }

    return super.readUint32(address);
  }

  /**
   * Intercepts memory writes for SIO FIFO and PPB SCR registers.
   */
  override writeUint32(address: number, value: number): void {
    address = address >>> 0;
    value = value >>> 0;

    // SIO FIFO aperture: 0xd0000050..0xd0000058
    if (address >= SIO_FIFO_ST && address <= SIO_FIFO_RD) {
      this.sioFifo.writeFifoRegister(this.activeCoreId, address, value);
      return;
    }

    // PPB System Control Register (SCR): 0xe000ed10
    if (address === PPB_SCR) {
      const core = this.cores[this.activeCoreId];
      core.sevonpend = (value & (1 << 4)) !== 0;
      core.sleepDeep = (value & (1 << 2)) !== 0;
      core.sleepOnExit = (value & (1 << 1)) !== 0;
      return;
    }

    super.writeUint32(address, value);
  }

  /**
   * Deterministically executes one instruction on the specified core.
   */
  public stepCore(coreId: 0 | 1): number {
    this.activeCoreId = coreId;
    return this.cores[coreId].executeInstruction();
  }

  /**
   * Co-steps both cores in lockstep, returning cycles executed by each.
   */
  public stepBothCores(): { core0Cycles: number; core1Cycles: number } {
    this.activeCoreId = 0;
    const core0Cycles = this.core0.executeInstruction();

    this.activeCoreId = 1;
    const core1Cycles = this.core1.executeInstruction();

    // Default active core back to 0
    this.activeCoreId = 0;

    return { core0Cycles, core1Cycles };
  }

  /**
   * Read-only accessor for the 32-bit SPINLOCK_ST claimed bitmask.
   * Accesses the raw bitmask without claiming or releasing any spinlocks.
   */
  public getSpinlockClaimedMask(): number {
    return (this.sio.spinLock >>> 0);
  }

  /**
   * Non-destructive peek of an SIO inter-core FIFO.
   */
  public peekFifo(direction: '0to1' | '1to0'): number[] {
    return this.sioFifo.peekFifo(direction);
  }

  /**
   * Non-destructive telemetry snapshot of both SIO FIFOs.
   */
  public getFifoTelemetry(): Rp2040FifoTelemetry {
    return this.sioFifo.getFifoTelemetry();
  }

  /**
   * Non-destructive telemetry snapshot of the Boot ROM Core 1 launch state machine.
   */
  public getBootRomTelemetry(): Rp2040BootRomTelemetry {
    return this.bootRom.getBootRomTelemetry();
  }
}
