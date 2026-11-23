/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.7.2.1: TELEMETRY DATA CONTRACTS & STORE UNIT TEST HARNESS
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Authoritative Executable Verification for Stage 4.3.7.2.1:
 * 1. Initial telemetry store state
 * 2. Valid snapshot acceptance for expected generation
 * 3. Stale snapshot rejection (older generation < expectedGenerationId)
 * 4. Future/unauthorized generation rejection (> expectedGenerationId)
 * 5. Duplicate sequence rejection (sequenceId === lastSequenceId)
 * 6. Out-of-order sequence rejection (sequenceId < lastSequenceId)
 * 7. Strictly monotonic sequence acceptance (sequenceId > lastSequenceId)
 * 8. Telemetry invalidation clears stored snapshot
 * 9. Telemetry invalidation resets sequence watermark to 0
 * 10. Valid snapshot acceptance after invalidation into new generation
 * 11. State immutability on rejected snapshots (zero store mutation)
 * 12. Atomic invalidation (generation, sequence watermark, snapshot reset simultaneously)
 * 13. Deterministic core-state precedence across all 4 lifecycle states
 * 14. HardFault handler mode represented as HANDLER_MODE (not FAULT)
 * 15. Generic SLEEPING representation for WFE and WFI (no invalid split)
 * 16. Conflicting condition and boundary tests for core-state precedence
 * 17. Structural schema fidelity: dual-core registers, SIO FIFOs, spinlocks, Boot ROM
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import assert from 'node:assert';
import { useSimulationStore } from '../src/store/simulationStore';
import {
  type Rp2040ExecutionSnapshot,
  type Rp2040CoreSnapshot,
  type CoreLifecycleState,
  resolveCoreLifecycleState,
  decodeCortexM0Flags,
  getCortexM0ExceptionName,
  countClaimedSpinlocks,
} from '../src/features/simulator/rp2040Telemetry';

let totalChecks = 0;
let passedChecks = 0;

function check(condition: boolean, testId: string, description: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [CHECK PASS] ${testId}: ${description}`);
  } else {
    console.error(`  [CHECK FAIL] ${testId}: ${description}`);
    throw new Error(`Assertion failed for ${testId}: ${description}`);
  }
}

/**
 * Creates a valid, fully populated mock Rp2040ExecutionSnapshot for unit testing.
 */
function createMockSnapshot(generationId: number, sequenceId: number): Rp2040ExecutionSnapshot {
  const core0: Rp2040CoreSnapshot = {
    coreId: 0,
    lifecycle: 'RUNNABLE',
    pc: 0x10000100,
    sp: 0x20040000,
    lr: 0x10000180,
    r0_r12: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    xpsr: 0x01000000, // Thumb bit set, IPSR = 0 (Thread mode)
    flags: decodeCortexM0Flags(0x01000000),
    primask: false,
    currentMode: 0,
    vtor: 0x10000000,
    control: { spsel: false, npriv: false },
    waiting: false,
    eventRegistered: false,
    sevonpend: false,
    interrupts: { pending: 0, enabled: 0 },
    cycles: 1250,
  };

  const core1: Rp2040CoreSnapshot = {
    coreId: 1,
    lifecycle: 'BOOTROM_PARKED',
    pc: 0x00000178,
    sp: 0x20040800,
    lr: 0xffffffff,
    r0_r12: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    xpsr: 0x01000000,
    flags: decodeCortexM0Flags(0x01000000),
    primask: false,
    currentMode: 0,
    vtor: 0x00000000,
    control: { spsel: false, npriv: false },
    waiting: true,
    eventRegistered: false,
    sevonpend: false,
    interrupts: { pending: 0, enabled: 0 },
    cycles: 0,
  };

  return {
    generationId,
    sequenceId,
    state: 'RUNNING',
    core0,
    core1,
    isMulticoreActive: false,
    fifo: {
      fifo0to1: { depth: 0, entries: [] },
      fifo1to0: { depth: 0, entries: [] },
      core0Status: { vld: false, rdy: true, wof: false, roe: false, irqAsserted: false },
      core1Status: { vld: false, rdy: true, wof: false, roe: false, irqAsserted: false },
    },
    spinlocks: {
      claimedMask: 0x00000005, // Locks 0 and 2 claimed
      claimedCount: 2,
      ownershipModel: 'UNTRACKED',
    },
    bootRom: {
      isLaunched: false,
      handshakeStep: 0,
      stepDescription: 'Expect 0',
    },
    clockFrequency_Hz: 125_000_000,
    simulatedTime_s: 0.00001,
    totalCycleCount: 1250,
    hostWallTime_ms: 1.5,
    vectorTable: { address: 0x10000000, initialSP: 0x20040000, resetHandler: 0x10000101 },
    errors: [],
  };
}

console.log('════════════════════════════════════════════════════════════════════════');
console.log('   VOLTFORGE PHASE 4.3.7.2.1: TELEMETRY CONTRACTS & STORE UNIT TESTS   ');
console.log('════════════════════════════════════════════════════════════════════════\n');

// ── TEST GROUP 1: Initial Store State ──
console.log('[SECTION 1] Verifying Initial Telemetry Store State...');
{
  const store = useSimulationStore.getState();
  check(store.expectedGenerationId === 1, 'STORE-INIT-01', 'Initial expectedGenerationId is 1');
  check(store.lastSequenceId === 0, 'STORE-INIT-02', 'Initial lastSequenceId watermark is 0');
  check(store.rp2040Snapshot === null, 'STORE-INIT-03', 'Initial rp2040Snapshot is null');
  check(store.rp2040InspectorOpen === false, 'STORE-INIT-04', 'Initial rp2040InspectorOpen is false');
}

// ── TEST GROUP 2: Generation Gating & Stale Message Rejection ──
console.log('\n[SECTION 2] Verifying Generation Gating & Stale Message Rejection...');
{
  // Reset to known state: gen 1, watermark 0
  useSimulationStore.getState().invalidateTelemetry(1);

  // 2A: Valid snapshot in generation 1 accepted
  const snap1 = createMockSnapshot(1, 1);
  const accepted1 = useSimulationStore.getState().setRp2040Snapshot(snap1);
  check(accepted1 === true, 'GEN-GATE-01', 'Snapshot matching expectedGenerationId=1 accepted');
  check(useSimulationStore.getState().lastSequenceId === 1, 'GEN-GATE-02', 'Sequence watermark advanced to 1');
  check(useSimulationStore.getState().rp2040Snapshot?.sequenceId === 1, 'GEN-GATE-03', 'Snapshot stored in state');

  // 2B: Invalidate to generation 2
  useSimulationStore.getState().invalidateTelemetry(2);
  check(useSimulationStore.getState().expectedGenerationId === 2, 'GEN-GATE-04', 'expectedGenerationId updated to 2');
  check(useSimulationStore.getState().lastSequenceId === 0, 'GEN-GATE-05', 'Sequence watermark reset to 0');
  check(useSimulationStore.getState().rp2040Snapshot === null, 'GEN-GATE-06', 'Stored snapshot cleared to null');

  // 2C: Stale snapshot from older generation 1 rejected
  const staleSnap = createMockSnapshot(1, 2);
  const acceptedStale = useSimulationStore.getState().setRp2040Snapshot(staleSnap);
  check(acceptedStale === false, 'GEN-GATE-07', 'Stale snapshot with older generation (1 < 2) rejected');
  check(useSimulationStore.getState().rp2040Snapshot === null, 'GEN-GATE-08', 'Store snapshot remains null after rejection');
  check(useSimulationStore.getState().lastSequenceId === 0, 'GEN-GATE-09', 'Sequence watermark remains 0');

  // 2D: Unauthorized future generation rejected
  const futureSnap = createMockSnapshot(3, 1);
  const acceptedFuture = useSimulationStore.getState().setRp2040Snapshot(futureSnap);
  check(acceptedFuture === false, 'GEN-GATE-10', 'Future snapshot with unauthorized generation (3 > 2) rejected');
  check(useSimulationStore.getState().rp2040Snapshot === null, 'GEN-GATE-11', 'Store snapshot remains null after future rejection');
  check(useSimulationStore.getState().lastSequenceId === 0, 'GEN-GATE-12', 'Sequence watermark remains 0');

  // 2E: Valid snapshot for newly expected generation 2 accepted
  const validSnapGen2 = createMockSnapshot(2, 1);
  const acceptedGen2 = useSimulationStore.getState().setRp2040Snapshot(validSnapGen2);
  check(acceptedGen2 === true, 'GEN-GATE-13', 'Valid snapshot for generation 2 accepted');
  check(useSimulationStore.getState().lastSequenceId === 1, 'GEN-GATE-14', 'Watermark updated to 1 in generation 2');
  check(useSimulationStore.getState().rp2040Snapshot?.generationId === 2, 'GEN-GATE-15', 'Store holds generation 2 snapshot');
}

// ── TEST GROUP 3: Sequence Monotonicity & Out-of-Order Gating ──
console.log('\n[SECTION 3] Verifying Sequence Monotonicity & Out-of-Order Gating...');
{
  // Current state: gen 2, watermark 1
  // 3A: Strictly monotonic sequence sequenceId=2 accepted
  const snapSeq2 = createMockSnapshot(2, 2);
  const acceptedSeq2 = useSimulationStore.getState().setRp2040Snapshot(snapSeq2);
  check(acceptedSeq2 === true, 'SEQ-GATE-01', 'Sequence 2 (> 1) accepted');
  check(useSimulationStore.getState().lastSequenceId === 2, 'SEQ-GATE-02', 'Watermark advanced to 2');

  // 3B: Duplicate sequence sequenceId=2 rejected
  const dupSeq2 = createMockSnapshot(2, 2);
  dupSeq2.simulatedTime_s = 0.999; // Attempt to mutate simulatedTime
  const acceptedDup = useSimulationStore.getState().setRp2040Snapshot(dupSeq2);
  check(acceptedDup === false, 'SEQ-GATE-03', 'Duplicate sequence 2 rejected');
  check(useSimulationStore.getState().lastSequenceId === 2, 'SEQ-GATE-04', 'Watermark remains 2');
  check(useSimulationStore.getState().rp2040Snapshot?.simulatedTime_s !== 0.999, 'SEQ-GATE-05', 'Store snapshot not mutated by duplicate');

  // 3C: Lower/out-of-order sequence sequenceId=1 rejected
  const lowerSeq1 = createMockSnapshot(2, 1);
  const acceptedLower = useSimulationStore.getState().setRp2040Snapshot(lowerSeq1);
  check(acceptedLower === false, 'SEQ-GATE-06', 'Out-of-order sequence 1 (< 2) rejected');
  check(useSimulationStore.getState().lastSequenceId === 2, 'SEQ-GATE-07', 'Watermark remains 2');

  // 3D: Large sequence jump sequenceId=10 accepted
  const jumpSeq10 = createMockSnapshot(2, 10);
  const acceptedJump = useSimulationStore.getState().setRp2040Snapshot(jumpSeq10);
  check(acceptedJump === true, 'SEQ-GATE-08', 'Higher sequence 10 (> 2) accepted');
  check(useSimulationStore.getState().lastSequenceId === 10, 'SEQ-GATE-09', 'Watermark advanced to 10');

  // 3E: Intermediate sequence sequenceId=7 rejected after jump to 10
  const intermediateSeq7 = createMockSnapshot(2, 7);
  const acceptedIntermediate = useSimulationStore.getState().setRp2040Snapshot(intermediateSeq7);
  check(acceptedIntermediate === false, 'SEQ-GATE-10', 'Intermediate sequence 7 (< 10) rejected');
  check(useSimulationStore.getState().lastSequenceId === 10, 'SEQ-GATE-11', 'Watermark remains 10');
}

// ── TEST GROUP 4: Atomic Invalidation & State Isolation ──
console.log('\n[SECTION 4] Verifying Atomic Invalidation & State Isolation...');
{
  // Current state: gen 2, watermark 10, snapshot present
  check(useSimulationStore.getState().rp2040Snapshot !== null, 'ATOM-INV-01', 'Snapshot present before invalidation');

  // Invalidate to generation 5
  useSimulationStore.getState().invalidateTelemetry(5);
  const state = useSimulationStore.getState();

  check(state.expectedGenerationId === 5, 'ATOM-INV-02', 'Generation set to 5');
  check(state.lastSequenceId === 0, 'ATOM-INV-03', 'Sequence watermark reset to 0');
  check(state.rp2040Snapshot === null, 'ATOM-INV-04', 'Snapshot atomically cleared to null');

  // Sequence 1 of generation 5 accepted immediately after invalidation
  const snapGen5Seq1 = createMockSnapshot(5, 1);
  const accepted = useSimulationStore.getState().setRp2040Snapshot(snapGen5Seq1);
  check(accepted === true, 'ATOM-INV-05', 'First sequence of new generation accepted after invalidation');
  check(useSimulationStore.getState().lastSequenceId === 1, 'ATOM-INV-06', 'Sequence watermark updated to 1');

  // Toggle inspector open/close
  useSimulationStore.getState().setRp2040InspectorOpen(true);
  check(useSimulationStore.getState().rp2040InspectorOpen === true, 'INSP-TOGGLE-01', 'setRp2040InspectorOpen(true) sets open');
  useSimulationStore.getState().toggleRp2040Inspector();
  check(useSimulationStore.getState().rp2040InspectorOpen === false, 'INSP-TOGGLE-02', 'toggleRp2040Inspector toggles to false');
  useSimulationStore.getState().toggleRp2040Inspector();
  check(useSimulationStore.getState().rp2040InspectorOpen === true, 'INSP-TOGGLE-03', 'toggleRp2040Inspector toggles to true');
  useSimulationStore.getState().setRp2040InspectorOpen(false);
  check(useSimulationStore.getState().rp2040InspectorOpen === false, 'INSP-TOGGLE-04', 'setRp2040InspectorOpen(false) sets closed');
}

// ── TEST GROUP 5: Deterministic Core Lifecycle Precedence ──
console.log('\n[SECTION 5] Verifying Deterministic Core Lifecycle Precedence...');
{
  // Case 1: BOOTROM_PARKED (Precedence 1)
  // Core 1, Boot ROM not launched, waiting === true
  const state1 = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: false,
    waiting: true,
    ipsr: 0,
  });
  check(state1 === 'BOOTROM_PARKED', 'PRECEDENCE-01', 'Core 1 parked in Boot ROM resolves to BOOTROM_PARKED');

  // Case 2: HANDLER_MODE (Precedence 2)
  // IPSR > 0, not parked
  const state2 = resolveCoreLifecycleState({
    coreId: 0,
    waiting: false,
    ipsr: 15, // SysTick
  });
  check(state2 === 'HANDLER_MODE', 'PRECEDENCE-02', 'IPSR=15 (SysTick) resolves to HANDLER_MODE');

  // Case 3: SLEEPING (Precedence 3)
  // waiting === true, IPSR === 0
  const state3 = resolveCoreLifecycleState({
    coreId: 0,
    waiting: true,
    ipsr: 0,
  });
  check(state3 === 'SLEEPING', 'PRECEDENCE-03', 'core.waiting=true with IPSR=0 resolves to SLEEPING');

  // Case 4: RUNNABLE (Precedence 4)
  // waiting === false, IPSR === 0
  const state4 = resolveCoreLifecycleState({
    coreId: 0,
    waiting: false,
    ipsr: 0,
  });
  check(state4 === 'RUNNABLE', 'PRECEDENCE-04', 'Unblocked Thread mode resolves to RUNNABLE');
}

// ── TEST GROUP 6: HardFault & Architectural Exception Classification ──
console.log('\n[SECTION 6] Verifying HardFault & Exception Classification...');
{
  // HardFault (IPSR === 3) must resolve to HANDLER_MODE, NEVER FAULT
  const hfState = resolveCoreLifecycleState({
    coreId: 0,
    waiting: false,
    ipsr: 3,
  });
  check(hfState === 'HANDLER_MODE', 'HF-CLASS-01', 'HardFault (IPSR=3) resolves to HANDLER_MODE (never FAULT)');

  // Decode Cortex-M0 flags with HardFault
  const hfFlags = decodeCortexM0Flags(0x01000003); // Thumb=1, IPSR=3
  check(hfFlags.ipsr === 3, 'HF-CLASS-02', 'Decoded IPSR is 3');
  check(hfFlags.exceptionName === 'HardFault', 'HF-CLASS-03', 'Decoded exceptionName is "HardFault"');
  check(hfFlags.thumb === true, 'HF-CLASS-04', 'Thumb bit is true');

  // NMI (IPSR === 2)
  const nmiFlags = decodeCortexM0Flags(0x01000002);
  check(nmiFlags.exceptionName === 'NMI', 'EXC-NAME-01', 'Decoded IPSR=2 is "NMI"');

  // SVCall (IPSR === 11)
  const svcFlags = decodeCortexM0Flags(0x0100000b);
  check(svcFlags.exceptionName === 'SVCall', 'EXC-NAME-02', 'Decoded IPSR=11 is "SVCall"');

  // PendSV (IPSR === 14)
  const psvFlags = decodeCortexM0Flags(0x0100000e);
  check(psvFlags.exceptionName === 'PendSV', 'EXC-NAME-03', 'Decoded IPSR=14 is "PendSV"');

  // SIO IRQ 15 / 16
  const sio0Flags = decodeCortexM0Flags(0x0100001f); // 16 + 15 = 31 (0x1F)
  check(sio0Flags.exceptionName === 'IRQ15(SIO0)', 'EXC-NAME-04', 'Decoded IPSR=31 is "IRQ15(SIO0)"');
  const sio1Flags = decodeCortexM0Flags(0x01000020); // 16 + 16 = 32 (0x20)
  check(sio1Flags.exceptionName === 'IRQ16(SIO1)', 'EXC-NAME-05', 'Decoded IPSR=32 is "IRQ16(SIO1)"');

  // Thread mode (IPSR === 0)
  const threadFlags = decodeCortexM0Flags(0x01000000);
  check(threadFlags.exceptionName === 'ThreadMode', 'EXC-NAME-06', 'Decoded IPSR=0 is "ThreadMode"');

  // Condition code flags: N, Z, C, V
  const fullFlags = decodeCortexM0Flags(0xf1000000); // N=1, Z=1, C=1, V=1, Thumb=1
  check(fullFlags.negative === true, 'FLAG-DEC-01', 'N flag decoded');
  check(fullFlags.zero === true, 'FLAG-DEC-02', 'Z flag decoded');
  check(fullFlags.carry === true, 'FLAG-DEC-03', 'C flag decoded');
  check(fullFlags.overflow === true, 'FLAG-DEC-04', 'V flag decoded');
}

// ── TEST GROUP 7: Conflicting Conditions & Boundary Evaluation ──
console.log('\n[SECTION 7] Verifying Conflicting Conditions & Boundary Cases...');
{
  // Conflict A: Core 1 parked in Boot ROM (waiting=true, bootRomLaunched=false)
  // Precedence 1 guarantees BOOTROM_PARKED
  const confA = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: false,
    waiting: true,
    ipsr: 0,
  });
  check(confA === 'BOOTROM_PARKED', 'BOUNDARY-01', 'Core 1 parked resolves to BOOTROM_PARKED');

  // Conflict B: Core 1 launched (bootRomLaunched=true), waiting=true, ipsr=0
  // Precedence 1 does NOT match; falls through to Precedence 3: SLEEPING
  const confB = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: true,
    waiting: true,
    ipsr: 0,
  });
  check(confB === 'SLEEPING', 'BOUNDARY-02', 'Core 1 launched and sleeping resolves to SLEEPING');

  // Conflict C: Core 0 (cannot be BOOTROM_PARKED), waiting=true, ipsr=0
  // Precedence 1 only applies to Core 1; falls through to Precedence 3: SLEEPING
  const confC = resolveCoreLifecycleState({
    coreId: 0,
    bootRomLaunched: false,
    waiting: true,
    ipsr: 0,
  });
  check(confC === 'SLEEPING', 'BOUNDARY-03', 'Core 0 sleeping with bootRomLaunched=false resolves to SLEEPING');

  // Conflict D: Core 0 with waiting=true and ipsr=15 (e.g. WFE inside an ISR)
  // Precedence 2 (HANDLER_MODE) takes precedence over Precedence 3 (SLEEPING)
  const confD = resolveCoreLifecycleState({
    coreId: 0,
    waiting: true,
    ipsr: 15,
  });
  check(confD === 'HANDLER_MODE', 'BOUNDARY-04', 'Waiting inside an ISR resolves to HANDLER_MODE over SLEEPING');

  // Conflict E: Core 1 launched with waiting=true and ipsr=3 (HardFault while sleeping)
  // Precedence 2 (HANDLER_MODE) takes precedence over Precedence 3 (SLEEPING)
  const confE = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: true,
    waiting: true,
    ipsr: 3,
  });
  check(confE === 'HANDLER_MODE', 'BOUNDARY-05', 'Core 1 in HardFault with waiting=true resolves to HANDLER_MODE');

  // Conflict F: Core 0 with waiting=false, ipsr=0 (clean Thread mode)
  const confF = resolveCoreLifecycleState({
    coreId: 0,
    waiting: false,
    ipsr: 0,
  });
  check(confF === 'RUNNABLE', 'BOUNDARY-06', 'Core 0 unblocked Thread mode resolves to RUNNABLE');

  // Conflict G: Core 1 launched with waiting=false, ipsr=0 (clean Thread mode)
  const confG = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: true,
    waiting: false,
    ipsr: 0,
  });
  check(confG === 'RUNNABLE', 'BOUNDARY-07', 'Core 1 launched unblocked Thread mode resolves to RUNNABLE');
}

// ── TEST GROUP 8: Spinlock Bitmask & Claimed Count Evaluation ──
console.log('\n[SECTION 8] Verifying Spinlock Counting & Ownership Model...');
{
  check(countClaimedSpinlocks(0x00000000) === 0, 'SPINLOCK-01', '0 claimed locks for mask 0x0');
  check(countClaimedSpinlocks(0x00000001) === 1, 'SPINLOCK-02', '1 claimed lock for mask 0x1 (Lock 0)');
  check(countClaimedSpinlocks(0x00000005) === 2, 'SPINLOCK-03', '2 claimed locks for mask 0x5 (Locks 0, 2)');
  check(countClaimedSpinlocks(0xffffffff) === 32, 'SPINLOCK-04', '32 claimed locks for mask 0xFFFFFFFF');
  check(countClaimedSpinlocks(0x55555555) === 16, 'SPINLOCK-05', '16 claimed locks for alternating mask');
}

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log('   STAGE 4.3.7.2.1 TELEMETRY CONTRACTS & STORE VERIFICATION SUMMARY   ');
console.log('════════════════════════════════════════════════════════════════════════');
console.log(`Total Checks Executed: ${totalChecks}`);
console.log(`Total Checks Passed:   ${passedChecks} (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
console.log(`Total Checks Failed:   ${totalChecks - passedChecks}`);
console.log('════════════════════════════════════════════════════════════════════════\n');

if (totalChecks !== passedChecks) {
  process.exit(1);
}

