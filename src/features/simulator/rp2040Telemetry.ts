/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.7.2.1: PASSIVE RP2040 DUAL-CORE CPU TELEMETRY DATA CONTRACTS
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Foundational TypeScript data contracts and pure evaluation helpers for passive
 * multicore CPU execution observability, condition flag decoding, SIO FIFO
 * telemetry, spinlock state, and core lifecycle resolution.
 *
 * Architectural Truth Constraints:
 * 1. The RP2040 contains two independent Cortex-M0+ single-issue cores (Core 0 and Core 1).
 * 2. RUNNABLE indicates the core is unblocked and eligible for execution in Thread mode,
 *    not that an instruction is retiring at the exact snapshot microsecond.
 * 3. WFE and WFI both map to generic SLEEPING (upstream core.waiting does not distinguish them).
 * 4. IPSR === 3 indicates Cortex-M0+ HardFault vector execution (HANDLER_MODE), which is an
 *    architectural handler mode, not an unrecoverable emulator fault or halted core.
 * 5. Controller/host errors are decoupled to aggregate snapshot state ('ERROR') and errors: string[].
 * 6. No per-core FAULT state exists in this data contract.
 * 7. Per-core cycle counters and global SoC totalCycleCount are exposed; speculative instruction
 *    retirement counts and MIPS are strictly excluded.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import type { Rp2040VectorTable } from './uf2Parser';

/**
 * Mutually exclusive, directly observed Cortex-M0+ core lifecycle states.
 * Evaluated via strict deterministic precedence in resolveCoreLifecycleState().
 */
export type CoreLifecycleState =
  | 'RUNNABLE'         // Unblocked, eligible for instruction execution in Thread mode
  | 'SLEEPING'         // Suspended in low-power sleep (WFE or WFI; core.waiting === true)
  | 'BOOTROM_PARKED'   // Core 1 parked in Boot ROM waiting for launch handshake
  | 'HANDLER_MODE';    // Servicing an exception or interrupt (core.IPSR > 0, including HardFault IPSR === 3)

/**
 * Controller-level execution state for the RP2040 simulation subsystem.
 * Host emulator exceptions or bus errors are captured here as 'ERROR'.
 */
export type Rp2040ExecutionState =
  | 'UNINITIALIZED'
  | 'LOADED'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'ERROR';

/**
 * Decoded condition flags and exception state from the 32-bit xPSR.
 */
export interface CortexM0Flags {
  /** N (Negative) condition flag - xPSR bit 31 */
  negative: boolean;
  /** Z (Zero) condition flag - xPSR bit 30 */
  zero: boolean;
  /** C (Carry) condition flag - xPSR bit 29 */
  carry: boolean;
  /** V (Overflow) condition flag - xPSR bit 28 */
  overflow: boolean;
  /** T (Thumb) execution state flag - xPSR bit 24 (always 1 on Cortex-M0+) */
  thumb: boolean;
  /** Active Interrupt Program Status Register value - xPSR bits 5:0 (0 = Thread mode) */
  ipsr: number;
  /** Human-readable exception name (e.g. "ThreadMode", "HardFault", "IRQ15(SIO0)") */
  exceptionName: string;
}

/**
 * Cortex-M0+ CONTROL register fields.
 */
export interface CoreControlRegister {
  /** SPSEL: 0 = SPmain (MSP), 1 = SPprocess (PSP) */
  spsel: boolean;
  /** nPRIV: 0 = Privileged, 1 = Unprivileged (Thread mode only) */
  npriv: boolean;
}

/**
 * NVIC interrupt pending and enabled bitmasks.
 */
export interface CoreInterrupts {
  /** 32-bit bitmask of pending NVIC interrupts (NVIC_ISPR) */
  pending: number;
  /** 32-bit bitmask of enabled NVIC interrupts (NVIC_ISER) */
  enabled: number;
}

/**
 * Complete passive observability snapshot for an individual Cortex-M0+ core.
 */
export interface Rp2040CoreSnapshot {
  /** Hardware Core ID (0 or 1) */
  coreId: 0 | 1;
  /** Deterministic core lifecycle state */
  lifecycle: CoreLifecycleState;

  // ── Register File ──
  /** R15: Program Counter */
  pc: number;
  /** R13: Active Stack Pointer (MSP or PSP depending on SPSEL) */
  sp: number;
  /** R14: Link Register */
  lr: number;
  /** General purpose registers R0 through R12 (array of 13 uint32 numbers) */
  r0_r12: number[];

  // ── Program Status & Control ──
  /** Raw 32-bit xPSR */
  xpsr: number;
  /** Decoded condition flags and exception number */
  flags: CortexM0Flags;
  /** PRIMASK priority mask (true = configurable interrupts masked) */
  primask: boolean;
  /** Execution mode: 0 = Mode_Thread, 1 = Mode_Handler */
  currentMode: number;
  /** Vector Table Offset Register base address */
  vtor: number;
  /** CONTROL register */
  control: CoreControlRegister;

  // ── Sleep & Event State ──
  /** Hardware low-power sleep suspension flag (set by WFE or WFI) */
  waiting: boolean;
  /** 1-bit Event Register latch (asserted by SEV, exception return, or peripheral event) */
  eventRegistered: boolean;
  /** System Control Register bit 4: Send Event on Pending */
  sevonpend: boolean;

  // ── Interrupt State ──
  /** NVIC interrupt pending and enabled masks */
  interrupts: CoreInterrupts;

  // ── Clock Accounting ──
  /** Cumulative clock cycles executed by this individual core */
  cycles: number;
}

/**
 * Non-destructive peek representation of an SIO inter-core FIFO queue.
 */
export interface Rp2040FifoQueueSnapshot {
  /** Number of 32-bit words currently queued (0 to 8) */
  depth: number;
  /** Queued 32-bit words from head to tail (obtained via non-destructive peek) */
  entries: number[];
}

/**
 * SIO FIFO status register flags (SIO_FIFO_ST) from the perspective of an individual core.
 */
export interface Rp2040CoreFifoStatus {
  /** VLD (Bit 0): Valid data available to read in RX FIFO */
  vld: boolean;
  /** RDY (Bit 1): Space available to write in TX FIFO */
  rdy: boolean;
  /** WOF (Bit 2): Sticky Write On Full error flag */
  wof: boolean;
  /** ROE (Bit 3): Sticky Read On Empty error flag */
  roe: boolean;
  /** SIO IRQ line asserted: IRQ 15 for Core 0, IRQ 16 for Core 1 */
  irqAsserted: boolean;
}

/**
 * Aggregate telemetry for the dual 8-word SIO inter-core FIFOs.
 */
export interface Rp2040FifoTelemetry {
  /** Queue Core 0 -> Core 1 (Core 0 TX / Core 1 RX) */
  fifo0to1: Rp2040FifoQueueSnapshot;
  /** Queue Core 1 -> Core 0 (Core 1 TX / Core 0 RX) */
  fifo1to0: Rp2040FifoQueueSnapshot;
  /** Core 0 status register view */
  core0Status: Rp2040CoreFifoStatus;
  /** Core 1 status register view */
  core1Status: Rp2040CoreFifoStatus;
}

/**
 * 32 hardware spinlocks state telemetry.
 */
export interface Rp2040SpinlockTelemetry {
  /** 32-bit bitmask representing SPINLOCK_ST (bit N = 1 if lock N claimed) */
  claimedMask: number;
  /** Number of spinlocks currently claimed (0 to 32) */
  claimedCount: number;
  /**
   * Lock ownership status: Untracked.
   * Upstream rp2040js maintains only a bitmask; core owner ID is not tracked in hardware.
   */
  ownershipModel: 'UNTRACKED';
}

/**
 * Boot ROM Core 1 launch state machine telemetry.
 */
export interface Rp2040BootRomTelemetry {
  /** True once Core 1 completes the handshake and branches to user application */
  isLaunched: boolean;
  /** Current handshake protocol step (0 to 5 during launch, 6 = LAUNCHED) */
  handshakeStep: number;
  /** Human-readable handshake description (e.g. "Expect 0", "Expect VTOR", "Launched") */
  stepDescription: string;
  /** Validated Vector Table base address passed during handshake */
  launchVtor?: number;
  /** Validated initial Stack Pointer passed during handshake */
  launchSp?: number;
  /** Validated Thumb entry point passed during handshake */
  launchEntry?: number;
}

/**
 * Aggregate RP2040 passive execution snapshot for dual-core observability.
 */
export interface Rp2040ExecutionSnapshot {
  /** Simulation / firmware reload generation counter (authoritative from main thread) */
  generationId: number;
  /** Monotonic sequence watermark within generation */
  sequenceId: number;
  /** Controller-level execution state */
  state: Rp2040ExecutionState;

  // ── Dual-Core Contexts ──
  /** Core 0 CPU state snapshot */
  core0: Rp2040CoreSnapshot;
  /** Core 1 CPU state snapshot */
  core1: Rp2040CoreSnapshot;
  /** True when Core 1 has been launched by Core 0 */
  isMulticoreActive: boolean;

  // ── SIO Subsystems ──
  /** Inter-core FIFO queue status */
  fifo: Rp2040FifoTelemetry;
  /** 32 hardware spinlocks bitmask */
  spinlocks: Rp2040SpinlockTelemetry;
  /** Core 1 Boot ROM launch handshake status */
  bootRom: Rp2040BootRomTelemetry;

  // ── Clock & Timing Diagnostics ──
  /** System clock frequency in Hz (typically 125,000,000 Hz) */
  clockFrequency_Hz: number;
  /** Elapsed virtual simulated time in seconds */
  simulatedTime_s: number;
  /** Total SoC clock cycles executed across all cores and peripherals */
  totalCycleCount: number;
  /** Wall-clock execution time on host in milliseconds */
  hostWallTime_ms: number;

  // ── Peripheral Status & Errors ──
  /** Vector table metadata from UF2 binary */
  vectorTable: Rp2040VectorTable | null;
  /** Host-level emulator errors (decoupled from core execution state) */
  errors: string[];
}

// ── Pure Evaluation Helpers ──

/**
 * Input parameters for deterministic core lifecycle evaluation.
 */
export interface CoreLifecycleEvaluationInput {
  /** Core ID: 0 or 1 */
  coreId: 0 | 1;
  /** Hardware low-power sleep waiting latch (core.waiting) */
  waiting: boolean;
  /** Active exception vector number (IPSR, 0 = Thread mode) */
  ipsr: number;
  /** Whether Core 1 has successfully launched from Boot ROM (default: false) */
  bootRomLaunched?: boolean;
}

/**
 * Resolves the deterministic CoreLifecycleState based on authoritative architectural precedence:
 *
 * 1. BOOTROM_PARKED — Core 1, Boot ROM not launched, and waiting.
 * 2. HANDLER_MODE   — IPSR > 0 (including HardFault vector IPSR === 3).
 * 3. SLEEPING       — waiting === true (generic low-power sleep; WFE vs WFI indistinguishable).
 * 4. RUNNABLE       — otherwise, unblocked and eligible for instruction execution.
 */
export function resolveCoreLifecycleState(input: CoreLifecycleEvaluationInput): CoreLifecycleState {
  // Precedence 1: Core 1 parked in Boot ROM waiting for launch handshake
  if (input.coreId === 1 && !input.bootRomLaunched && input.waiting) {
    return 'BOOTROM_PARKED';
  }

  // Precedence 2: Actively servicing an exception or interrupt in Handler mode
  if (input.ipsr > 0) {
    return 'HANDLER_MODE';
  }

  // Precedence 3: Suspended in low-power sleep
  if (input.waiting) {
    return 'SLEEPING';
  }

  // Precedence 4: Unblocked and eligible for Thread mode instruction execution
  return 'RUNNABLE';
}

/**
 * Returns the standard ARMv6-M / RP2040 exception or interrupt name for a given IPSR value.
 */
export function getCortexM0ExceptionName(ipsr: number): string {
  switch (ipsr) {
    case 0:
      return 'ThreadMode';
    case 1:
      return 'Reset';
    case 2:
      return 'NMI';
    case 3:
      return 'HardFault';
    case 11:
      return 'SVCall';
    case 14:
      return 'PendSV';
    case 15:
      return 'SysTick';
    default:
      if (ipsr >= 16) {
        const irq = ipsr - 16;
        if (irq === 15) return 'IRQ15(SIO0)';
        if (irq === 16) return 'IRQ16(SIO1)';
        return `IRQ${irq}`;
      }
      return `Reserved(${ipsr})`;
  }
}

/**
 * Decodes the Cortex-M0+ 32-bit xPSR into structured condition flags and IPSR.
 */
export function decodeCortexM0Flags(xpsr: number): CortexM0Flags {
  const ipsr = xpsr & 0x3f;
  return {
    negative: (xpsr & (1 << 31)) !== 0,
    zero: (xpsr & (1 << 30)) !== 0,
    carry: (xpsr & (1 << 29)) !== 0,
    overflow: (xpsr & (1 << 28)) !== 0,
    thumb: (xpsr & (1 << 24)) !== 0,
    ipsr,
    exceptionName: getCortexM0ExceptionName(ipsr),
  };
}

/**
 * Counts the number of spinlocks currently claimed in a 32-bit SPINLOCK_ST bitmask.
 */
export function countClaimedSpinlocks(claimedMask: number): number {
  let count = 0;
  let mask = claimedMask >>> 0;
  while (mask > 0) {
    count += mask & 1;
    mask >>>= 1;
  }
  return count;
}

