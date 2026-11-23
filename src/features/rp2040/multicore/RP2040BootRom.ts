/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 Boot ROM Core 1 Launch Protocol
 * 
 * Implements:
 * - Boot ROM Core 1 launch state machine (RP2040 Datasheet §2.8.2)
 * - 6-word command / echo handshake sequence:
 *     0. Expect 0x00000000 -> Echo 0x00000000
 *     1. Expect 0x00000000 -> Echo 0x00000000
 *     2. Expect 0x00000001 -> Echo 0x00000001
 *     3. Expect VectorTable (VTOR) -> Echo VTOR (validated: 256-byte aligned)
 *     4. Expect StackPointer (SP)  -> Echo SP   (validated: 8-byte aligned)
 *     5. Expect EntryPoint (ENTRY) -> Echo ENTRY (validated: Thumb bit set)
 * - Automatic sequence reset on mismatch or alignment violation
 * - Vectoring Core 1 to ENTRY with VTOR, SP, and LR initialized
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import type { RP2040Multicore } from './RP2040Multicore';
import type { Rp2040BootRomTelemetry } from '../../simulator/rp2040Telemetry';

export class RP2040BootRom {
  readonly multicore: RP2040Multicore;

  /** Current step in the 6-word handshake (0 to 5, or 6 = launched) */
  private step: number = 0;

  /** Stored handshake parameters */
  private pendingVtor: number = 0;
  private pendingSp: number = 0;
  private pendingEntry: number = 0;

  /** Flag indicating whether Core 1 has been launched */
  private launched: boolean = false;

  constructor(multicore: RP2040Multicore) {
    this.multicore = multicore;
  }

  /**
   * Resets the Boot ROM state machine. Core 1 is returned to parked WFE.
   */
  public reset(): void {
    this.step = 0;
    this.pendingVtor = 0;
    this.pendingSp = 0;
    this.pendingEntry = 0;
    this.launched = false;
  }

  /**
   * Returns whether Core 1 is actively launched out of Boot ROM.
   */
  public isLaunched(): boolean {
    return this.launched;
  }

  /**
   * Returns current handshake step (0 to 5, or 6 if launched).
   */
  public getStep(): number {
    return this.step;
  }

  /**
   * Returns human-readable description of current Boot ROM launch handshake status.
   */
  public getStepDescription(): string {
    switch (this.step) {
      case 0:
        return 'Expect 0 (Sequence Start)';
      case 1:
        return 'Expect 0 (Confirmation)';
      case 2:
        return 'Expect 1 (Launch Command)';
      case 3:
        return 'Expect Vector Table (VTOR)';
      case 4:
        return 'Expect Stack Pointer (SP)';
      case 5:
        return 'Expect Entry Point (ENTRY)';
      case 6:
        return 'Launched';
      default:
        return `Step ${this.step}`;
    }
  }

  /**
   * Returns validated VTOR passed during Core 1 handshake/launch, or undefined if not launched.
   */
  public getLaunchVtor(): number | undefined {
    return this.launched ? this.pendingVtor : undefined;
  }

  /**
   * Returns validated Stack Pointer passed during Core 1 handshake/launch, or undefined if not launched.
   */
  public getLaunchSp(): number | undefined {
    return this.launched ? this.pendingSp : undefined;
  }

  /**
   * Returns validated Entry Point passed during Core 1 handshake/launch, or undefined if not launched.
   */
  public getLaunchEntry(): number | undefined {
    return this.launched ? this.pendingEntry : undefined;
  }

  /**
   * Read-only passive telemetry snapshot of the Boot ROM state machine.
   */
  public getBootRomTelemetry(): Rp2040BootRomTelemetry {
    return {
      isLaunched: this.launched,
      handshakeStep: this.step,
      stepDescription: this.getStepDescription(),
      launchVtor: this.launched ? this.pendingVtor : undefined,
      launchSp: this.launched ? this.pendingSp : undefined,
      launchEntry: this.launched ? this.pendingEntry : undefined,
    };
  }

  /**
   * Processes a word written by Core 0 to SIO_FIFO_WR while Core 1 is in Boot ROM.
   * Returns true if handled by the Boot ROM state machine; false otherwise.
   */
  public handleCore0Push(value: number): boolean {
    value = value >>> 0;

    switch (this.step) {
      case 0:
        if (value === 0) {
          this.step = 1;
          this.echoAndPulse(0);
          return true;
        }
        // Sequence mismatch: stay at step 0
        return true;

      case 1:
        if (value === 0) {
          this.step = 2;
          this.echoAndPulse(0);
          return true;
        }
        // If non-zero received, reset to step 0
        this.step = 0;
        return true;

      case 2:
        if (value === 1) {
          this.step = 3;
          this.echoAndPulse(1);
          return true;
        }
        // If 0 received, reset to step 1 (first 0 matched)
        this.step = (value === 0) ? 1 : 0;
        return true;

      case 3:
        // Validate Vector Table alignment (must be 256-byte aligned per ARMv6-M)
        if ((value & 0xff) === 0) {
          this.pendingVtor = value;
          this.step = 4;
          this.echoAndPulse(value);
          return true;
        }
        // Alignment violation: reset sequence
        this.step = (value === 0) ? 1 : 0;
        return true;

      case 4:
        // Validate Stack Pointer alignment (must be 8-byte aligned per AAPCS)
        if ((value & 0x7) === 0) {
          this.pendingSp = value;
          this.step = 5;
          this.echoAndPulse(value);
          return true;
        }
        // Alignment violation: reset sequence
        this.step = (value === 0) ? 1 : 0;
        return true;

      case 5:
        // Validate Entry Point Thumb bit (bit 0 must be 1)
        if ((value & 0x1) === 1) {
          this.pendingEntry = value;
          this.step = 6;
          this.echoAndPulse(value);

          // Launch Core 1
          this.commitCore1Launch(this.pendingVtor, this.pendingSp, this.pendingEntry);
          return true;
        }
        // Thumb bit violation: reset sequence
        this.step = (value === 0) ? 1 : 0;
        return true;

      default:
        // Already launched or invalid state
        return false;
    }
  }

  /**
   * Directly configures and launches Core 1.
   */
  public launchCore1(vtor: number, sp: number, entry: number): boolean {
    // Validate alignments
    if ((vtor & 0xff) !== 0) return false;
    if ((sp & 0x7) !== 0) return false;
    if ((entry & 0x1) !== 1) return false;

    this.commitCore1Launch(vtor, sp, entry);
    return true;
  }

  /**
   * Configures Core 1 hardware registers and clears sleeping state.
   */
  private commitCore1Launch(vtor: number, sp: number, entry: number): void {
    const core1 = this.multicore.core1;
    this.pendingVtor = vtor >>> 0;
    this.pendingSp = sp >>> 0;
    this.pendingEntry = entry >>> 0;
    this.step = 6;
    core1.VTOR = vtor >>> 0;
    core1.SP = sp >>> 0;
    core1.LR = 0;
    core1.PC = (entry & ~1) >>> 0; // Strip Thumb bit for PC register
    core1.waiting = false;        // Wake core from initial Boot ROM WFE
    core1.cycles = 0;
    this.launched = true;
  }

  /**
   * Delivers an echo response to Core 0's RX FIFO and emits a cross-core SEV pulse.
   */
  private echoAndPulse(echoValue: number): void {
    this.multicore.sioFifo.pushEcho(0, echoValue);
    // Boot ROM executes __sev() to notify Core 0
    this.multicore.sendCrossCoreEvent(1);
  }
}

