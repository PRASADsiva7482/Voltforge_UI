/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — STAGE 4.3.7.2.2: READ-ONLY ACCESSORS & OBSERVABILITY TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies Group A Passive Dual-Core CPU Execution Observability:
 * - OBS-01: Non-destructive SIO FIFO peek (.slice(), zero side effects)
 * - OBS-02: SIO FIFO status register flags & telemetry
 * - OBS-03: Raw SPINLOCK_ST claimed mask reading & telemetry
 * - OBS-04: Cortex-M0+ xPSR condition flag decoding & exception classification
 * - OBS-05: Deterministic core lifecycle state resolution precedence
 * - OBS-06: Telemetry generation adoption & monotonic sequence progression
 * - OBS-07: Full snapshot schema compliance, store acceptance & non-interference
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040Multicore } from '../src/features/rp2040/multicore/RP2040Multicore';
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  decodeCortexM0Flags,
  resolveCoreLifecycleState,
  countClaimedSpinlocks,
} from '../src/features/simulator/rp2040Telemetry';
import { useSimulationStore } from '../src/store/simulationStore';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(condition: boolean, testId: string, description: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testId} — ${description}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testId} — ${description}`);
  }
}

console.log('════════════════════════════════════════════════════════════════════════');
console.log('   VOLTFORGE STAGE 4.3.7.2.2: READ-ONLY ACCESSORS & OBSERVABILITY TESTS  ');
console.log('════════════════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1: OBS-01 — SIO FIFO Non-Destructive Peek
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SECTION 1] Verifying OBS-01: SIO FIFO Non-Destructive Peek...');
{
  const mcu = new RP2040Multicore();
  // Launch Core 1 so normal inter-core FIFO transfers operate without Boot ROM interception
  mcu.bootRom.launchCore1(0x10000000, 0x20042000, 0x10000101);
  const fifo = mcu.sioFifo;

  // Push 3 test words from Core 0 to Core 1
  mcu.activeCoreId = 0;
  fifo.push(0, 0x11111111);
  fifo.push(0, 0x22222222);
  fifo.push(0, 0x33333333);

  // 1.1: Peek returns array matching queued contents
  const peek0to1 = fifo.peekFifo('0to1');
  check(peek0to1.length === 3, 'OBS-01-01', 'peekFifo(0to1) returns array with length 3');
  check(peek0to1[0] === 0x11111111 && peek0to1[1] === 0x22222222 && peek0to1[2] === 0x33333333,
    'OBS-01-02', 'peekFifo(0to1) returns exact queued words in FIFO order');

  // 1.2: Calling peek does NOT alter internal queue length
  check(fifo.getTxCount(0) === 3, 'OBS-01-03', 'Calling peekFifo preserves Core 0 TX count');
  check(fifo.getRxCount(1) === 3, 'OBS-01-04', 'Calling peekFifo preserves Core 1 RX count');

  // 1.3: Successive peek calls return fresh shallow copies with identical contents
  const secondPeek = fifo.peekFifo('0to1');
  check(secondPeek !== peek0to1, 'OBS-01-05', 'peekFifo returns a new array reference each call');
  check(secondPeek[0] === peek0to1[0] && secondPeek[1] === peek0to1[1] && secondPeek[2] === peek0to1[2],
    'OBS-01-06', 'Successive peeks yield identical data without mutation');

  // 1.4: Mutating the returned array externally does NOT alter internal FIFO state
  secondPeek.pop();
  secondPeek[0] = 0x99999999;
  const thirdPeek = fifo.peekFifo('0to1');
  check(thirdPeek.length === 3, 'OBS-01-07', 'External mutation of peek array does not alter internal length');
  check(thirdPeek[0] === 0x11111111, 'OBS-01-08', 'External mutation of peek array does not alter internal data');

  // 1.5: Peek on opposite direction (1to0) is empty
  const peek1to0 = fifo.peekFifo('1to0');
  check(peek1to0.length === 0, 'OBS-01-09', 'peekFifo(1to0) returns empty array when empty');

  // 1.6: Sticky error flags unaffected by peek
  check(fifo.wof0 === false && fifo.roe0 === false, 'OBS-01-10', 'Core 0 sticky flags remain false after peek');
  check(fifo.wof1 === false && fifo.roe1 === false, 'OBS-01-11', 'Core 1 sticky flags remain false after peek');

  // 1.7: Event register latches and waiting states unaffected by peek
  mcu.core1.waiting = true;
  mcu.core1.eventRegistered = false;
  fifo.peekFifo('0to1');
  check(mcu.core0.eventRegistered === false, 'OBS-01-12', 'Core 0 eventRegistered remains false');
  check(mcu.core1.eventRegistered === false, 'OBS-01-13', 'Core 1 eventRegistered remains false');
  check(mcu.core1.waiting === true, 'OBS-01-14', 'Core 1 waiting state preserved after peek');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 2: OBS-02 — SIO FIFO Status Flags & Telemetry
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 2] Verifying OBS-02: SIO FIFO Status Flags & Telemetry...');
{
  const mcu = new RP2040Multicore();
  mcu.bootRom.launchCore1(0x10000000, 0x20042000, 0x10000101);
  const fifo = mcu.sioFifo;

  // Initial empty state status check
  const initSt0 = fifo.getFifoStatus(0);
  const initSt1 = fifo.getFifoStatus(1);
  check(initSt0.vld === false, 'OBS-02-01', 'Core 0 initial status: VLD is false');
  check(initSt0.rdy === true, 'OBS-02-02', 'Core 0 initial status: RDY is true');
  check(initSt0.wof === false && initSt0.roe === false, 'OBS-02-03', 'Core 0 initial status: WOF and ROE are false');
  check(initSt0.irqAsserted === false, 'OBS-02-04', 'Core 0 initial status: IRQ not asserted');
  check(initSt1.vld === false && initSt1.rdy === true, 'OBS-02-05', 'Core 1 initial status: VLD false, RDY true');

  // Push 1 word from Core 0
  fifo.push(0, 0xaabbccdd);
  const afterPushSt0 = fifo.getFifoStatus(0);
  const afterPushSt1 = fifo.getFifoStatus(1);
  check(afterPushSt0.vld === false, 'OBS-02-06', 'Core 0 status: VLD still false (no incoming data for Core 0)');
  check(afterPushSt1.vld === true, 'OBS-02-07', 'Core 1 status: VLD is true (data available in RX FIFO)');
  check(afterPushSt1.irqAsserted === true, 'OBS-02-08', 'Core 1 status: IRQ asserted due to incoming RX data');

  // Fill Core 0 TX FIFO to capacity (8 words total)
  for (let i = 1; i < 8; i++) {
    fifo.push(0, 0x1000 + i);
  }
  const fullSt0 = fifo.getFifoStatus(0);
  check(fullSt0.rdy === false, 'OBS-02-09', 'Core 0 status: RDY is false when TX FIFO full (depth 8)');
  check(fullSt0.wof === false, 'OBS-02-10', 'Core 0 status: WOF is false before overflow');

  // 9th push triggers overflow and sticky WOF
  const overflowPushed = fifo.push(0, 0x9999);
  check(overflowPushed === false, 'OBS-02-11', '9th push discarded due to full FIFO');
  const overflowSt0 = fifo.getFifoStatus(0);
  check(overflowSt0.wof === true, 'OBS-02-12', 'Core 0 status: WOF is true after overflow');
  check(overflowSt0.irqAsserted === true, 'OBS-02-13', 'Core 0 status: IRQ asserted due to sticky WOF');

  // Underflow: Pop from empty Core 0 RX FIFO triggers sticky ROE
  const underflowVal = fifo.pop(0);
  check(underflowVal === 0, 'OBS-02-14', 'Pop from empty FIFO returns 0');
  const underflowSt0 = fifo.getFifoStatus(0);
  check(underflowSt0.roe === true, 'OBS-02-15', 'Core 0 status: ROE is true after underflow');

  // getFifoTelemetry returns complete structured telemetry
  const fifoTelem = fifo.getFifoTelemetry();
  check(fifoTelem.fifo0to1.depth === 8, 'OBS-02-16', 'Telemetry fifo0to1 depth is 8');
  check(fifoTelem.fifo0to1.entries.length === 8, 'OBS-02-17', 'Telemetry fifo0to1 entries length is 8');
  check(fifoTelem.fifo1to0.depth === 0, 'OBS-02-18', 'Telemetry fifo1to0 depth is 0');
  check(fifoTelem.core0Status.wof === true && fifoTelem.core0Status.roe === true,
    'OBS-02-19', 'Telemetry core0Status reports latched WOF and ROE errors');
  check(fifoTelem.core1Status.vld === true && fifoTelem.core1Status.rdy === true,
    'OBS-02-20', 'Telemetry core1Status reports VLD=true and RDY=true');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 3: OBS-03 — Raw SPINLOCK_ST Claimed Mask Reading
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 3] Verifying OBS-03: Raw SPINLOCK_ST Claimed Mask Reading...');
{
  const mcu = new RP2040Multicore();

  // Initial spinlock state: all 32 locks unlocked
  check(mcu.getSpinlockClaimedMask() === 0, 'OBS-03-01', 'Initial spinlock claimed mask is 0x00000000');
  check(countClaimedSpinlocks(0) === 0, 'OBS-03-02', 'Initial claimed count is 0');

  // Acquire spinlock 0 (offset 0x100 -> bit 0)
  const lock0Val = mcu.sio.readUint32(0x100);
  check(lock0Val === 1, 'OBS-03-03', 'Acquiring lock 0 returns bit mask (1)');
  check(mcu.getSpinlockClaimedMask() === 1, 'OBS-03-04', 'getSpinlockClaimedMask reflects lock 0 claimed');

  // Acquire spinlock 5 (offset 0x114 -> bit 5)
  const lock5Val = mcu.sio.readUint32(0x114);
  check(lock5Val === (1 << 5), 'OBS-03-05', 'Acquiring lock 5 returns bit mask (1 << 5)');

  // Acquire spinlock 31 (offset 0x17c -> bit 31)
  const lock31Val = mcu.sio.readUint32(0x17c);
  check(lock31Val === (1 << 31), 'OBS-03-06', 'Acquiring lock 31 returns bit mask (1 << 31)');

  const expectedMask = (1 | (1 << 5) | (1 << 31)) >>> 0;
  const currentMask = mcu.getSpinlockClaimedMask();
  check(currentMask === expectedMask, 'OBS-03-07', 'getSpinlockClaimedMask returns exact 32-bit unsigned mask');
  check(countClaimedSpinlocks(currentMask) === 3, 'OBS-03-08', 'countClaimedSpinlocks returns 3');

  // Multiple consecutive calls to getSpinlockClaimedMask are side-effect free
  for (let i = 0; i < 5; i++) {
    const mask = mcu.getSpinlockClaimedMask();
    if (mask !== expectedMask) {
      check(false, 'OBS-03-09', 'Repeated mask reads caused side effects');
      break;
    }
  }
  check(mcu.getSpinlockClaimedMask() === expectedMask, 'OBS-03-09', 'Repeated reads of claimed mask have zero side effects');

  // Release lock 5
  mcu.sio.writeUint32(0x114, 0);
  const maskAfterRelease = mcu.getSpinlockClaimedMask();
  const expectedAfterRelease = (1 | (1 << 31)) >>> 0;
  check(maskAfterRelease === expectedAfterRelease, 'OBS-03-10', 'Mask correctly reflects lock 5 released');
  check(countClaimedSpinlocks(maskAfterRelease) === 2, 'OBS-03-11', 'countClaimedSpinlocks returns 2 after release');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 4: OBS-04 — Cortex-M0+ xPSR Flag Decoding
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 4] Verifying OBS-04: Cortex-M0+ xPSR Flag Decoding...');
{
  // Test 4.1: Clean reset state (Thumb bit = 1, IPSR = 0)
  const xpsr0 = 0x01000000;
  const flags0 = decodeCortexM0Flags(xpsr0);
  check(flags0.thumb === true, 'OBS-04-01', 'Thumb bit is true for xPSR 0x01000000');
  check(flags0.negative === false && flags0.zero === false && flags0.carry === false && flags0.overflow === false,
    'OBS-04-02', 'All condition flags false for xPSR 0x01000000');
  check(flags0.ipsr === 0, 'OBS-04-03', 'IPSR is 0');
  check(flags0.exceptionName === 'ThreadMode', 'OBS-04-04', 'Exception name is ThreadMode for IPSR 0');

  // Test 4.2: All ALU flags set (N=1, Z=1, C=1, V=1, T=1)
  const xpsrAllFlags = (0xf0000000 | 0x01000000) >>> 0;
  const flagsAll = decodeCortexM0Flags(xpsrAllFlags);
  check(flagsAll.negative === true, 'OBS-04-05', 'N flag is true (bit 31)');
  check(flagsAll.zero === true, 'OBS-04-06', 'Z flag is true (bit 30)');
  check(flagsAll.carry === true, 'OBS-04-07', 'C flag is true (bit 29)');
  check(flagsAll.overflow === true, 'OBS-04-08', 'V flag is true (bit 28)');
  check(flagsAll.thumb === true, 'OBS-04-09', 'T flag is true (bit 24)');

  // Test 4.3: HardFault exception vector (IPSR = 3)
  const xpsrHardFault = 0x01000003;
  const flagsHardFault = decodeCortexM0Flags(xpsrHardFault);
  check(flagsHardFault.ipsr === 3, 'OBS-04-10', 'IPSR is 3 for HardFault');
  check(flagsHardFault.exceptionName === 'HardFault', 'OBS-04-11', 'exceptionName is HardFault');

  // Test 4.4: SIO0 IRQ (IPSR = 16 + 15 = 31)
  const xpsrSio0 = 0x01000000 | 31;
  const flagsSio0 = decodeCortexM0Flags(xpsrSio0);
  check(flagsSio0.ipsr === 31, 'OBS-04-12', 'IPSR is 31 for IRQ 15');
  check(flagsSio0.exceptionName === 'IRQ15(SIO0)', 'OBS-04-13', 'exceptionName is IRQ15(SIO0)');

  // Test 4.5: SIO1 IRQ (IPSR = 16 + 16 = 32)
  const xpsrSio1 = 0x01000000 | 32;
  const flagsSio1 = decodeCortexM0Flags(xpsrSio1);
  check(flagsSio1.ipsr === 32, 'OBS-04-14', 'IPSR is 32 for IRQ 16');
  check(flagsSio1.exceptionName === 'IRQ16(SIO1)', 'OBS-04-15', 'exceptionName is IRQ16(SIO1)');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 5: OBS-05 — Deterministic Core Lifecycle State Resolution
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 5] Verifying OBS-05: Deterministic Core Lifecycle State Resolution...');
{
  // 5.1: Precedence 1: Core 1 parked in Boot ROM waiting
  const lc1 = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: false,
    waiting: true,
    ipsr: 0,
  });
  check(lc1 === 'BOOTROM_PARKED', 'OBS-05-01', 'Core 1 unlaunched & waiting -> BOOTROM_PARKED');

  // 5.2: Precedence 2: Exception / Handler mode trumps sleeping
  const lc2 = resolveCoreLifecycleState({
    coreId: 0,
    bootRomLaunched: false,
    waiting: true,
    ipsr: 3, // HardFault
  });
  check(lc2 === 'HANDLER_MODE', 'OBS-05-02', 'IPSR === 3 (HardFault) -> HANDLER_MODE (trumps waiting)');

  // 5.3: Precedence 2: Normal interrupt Handler mode
  const lc3 = resolveCoreLifecycleState({
    coreId: 0,
    waiting: false,
    ipsr: 31, // IRQ 15
  });
  check(lc3 === 'HANDLER_MODE', 'OBS-05-03', 'IPSR === 31 (IRQ15) -> HANDLER_MODE');

  // 5.4: Precedence 3: Sleeping in Thread mode (waiting = true, ipsr = 0)
  const lc4 = resolveCoreLifecycleState({
    coreId: 0,
    waiting: true,
    ipsr: 0,
  });
  check(lc4 === 'SLEEPING', 'OBS-05-04', 'Core 0 waiting=true & ipsr=0 -> SLEEPING');

  // 5.5: Precedence 3: Core 1 launched and sleeping in user code
  const lc5 = resolveCoreLifecycleState({
    coreId: 1,
    bootRomLaunched: true,
    waiting: true,
    ipsr: 0,
  });
  check(lc5 === 'SLEEPING', 'OBS-05-05', 'Core 1 launched & waiting=true -> SLEEPING');

  // 5.6: Precedence 4: Normal unblocked Thread mode
  const lc6 = resolveCoreLifecycleState({
    coreId: 0,
    waiting: false,
    ipsr: 0,
  });
  check(lc6 === 'RUNNABLE', 'OBS-05-06', 'Core 0 waiting=false & ipsr=0 -> RUNNABLE');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 6: OBS-06 — Sequence and Generation Management
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 6] Verifying OBS-06: Sequence and Generation Management...');
{
  const controller = new RP2040Controller();

  // 6.1: Initial controller sequence watermark
  check(controller.getTelemetryGeneration() === 1, 'OBS-06-01', 'Initial controller generationId is 1');
  check(controller.getLastSequenceId() === 0, 'OBS-06-02', 'Initial controller sequence watermark is 0');

  // 6.2: First snapshot produces sequenceId 1
  const snap1 = controller.getExecutionSnapshot();
  check(snap1.generationId === 1, 'OBS-06-03', 'Snapshot 1 generationId is 1');
  check(snap1.sequenceId === 1, 'OBS-06-04', 'Snapshot 1 sequenceId is 1');
  check(controller.getLastSequenceId() === 1, 'OBS-06-05', 'Controller sequence watermark advanced to 1');

  // 6.3: Consecutive snapshot produces strictly monotonic sequenceId 2
  const snap2 = controller.getExecutionSnapshot();
  check(snap2.generationId === 1, 'OBS-06-06', 'Snapshot 2 generationId is 1');
  check(snap2.sequenceId === 2, 'OBS-06-07', 'Snapshot 2 sequenceId is 2');

  // 6.4: Monotonic sequence generation across multiple calls
  let sequenceMonotonic = true;
  let lastSeq = snap2.sequenceId;
  for (let i = 0; i < 8; i++) {
    const snap = controller.getExecutionSnapshot();
    if (snap.sequenceId !== lastSeq + 1) {
      sequenceMonotonic = false;
      break;
    }
    lastSeq = snap.sequenceId;
  }
  check(sequenceMonotonic && lastSeq === 10, 'OBS-06-08', 'Sequence increments strictly monotonically to 10');

  // 6.5: setTelemetryGeneration adopts new generation and resets sequence watermark
  controller.setTelemetryGeneration(5);
  check(controller.getTelemetryGeneration() === 5, 'OBS-06-09', 'Generation updated to 5');
  check(controller.getLastSequenceId() === 0, 'OBS-06-10', 'Sequence watermark reset to 0 upon setTelemetryGeneration');

  const snapGen5 = controller.getExecutionSnapshot();
  check(snapGen5.generationId === 5, 'OBS-06-11', 'Snapshot adopts generation 5');
  check(snapGen5.sequenceId === 1, 'OBS-06-12', 'Snapshot restarts at sequenceId 1 in generation 5');

  // 6.6: Store integration: Snapshot accepted by simulationStore
  useSimulationStore.getState().invalidateTelemetry(5);
  const accepted = useSimulationStore.getState().setRp2040Snapshot(snapGen5);
  check(accepted === true, 'OBS-06-13', 'simulationStore accepts snapshot with matching generation and valid sequence');
  check(useSimulationStore.getState().lastSequenceId === 1, 'OBS-06-14', 'simulationStore watermark updated to 1');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 7: OBS-07 — Full Snapshot Schema Compliance & Non-Interference
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 7] Verifying OBS-07: Full Snapshot Schema Compliance & Non-Interference...');
{
  const controller = new RP2040Controller();
  const snap = controller.getExecutionSnapshot();

  // 7.1: Top-level snapshot fields
  check(typeof snap.generationId === 'number', 'OBS-07-01', 'Top-level generationId is number');
  check(typeof snap.sequenceId === 'number', 'OBS-07-02', 'Top-level sequenceId is number');
  check(typeof snap.state === 'string', 'OBS-07-03', 'Top-level state is string');
  check(typeof snap.isMulticoreActive === 'boolean', 'OBS-07-04', 'Top-level isMulticoreActive is boolean');
  check(typeof snap.clockFrequency_Hz === 'number', 'OBS-07-05', 'Top-level clockFrequency_Hz is number');
  check(typeof snap.simulatedTime_s === 'number', 'OBS-07-06', 'Top-level simulatedTime_s is number');
  check(typeof snap.totalCycleCount === 'number', 'OBS-07-07', 'Top-level totalCycleCount is number');
  check(typeof snap.hostWallTime_ms === 'number', 'OBS-07-08', 'Top-level hostWallTime_ms is number');
  check(Array.isArray(snap.errors), 'OBS-07-09', 'Top-level errors is array');

  // 7.2: Dual-core sub-snapshots
  check(snap.core0.coreId === 0, 'OBS-07-10', 'core0 coreId is 0');
  check(snap.core0.lifecycle === 'RUNNABLE', 'OBS-07-11', 'core0 initial lifecycle is RUNNABLE');
  check(snap.core0.r0_r12.length === 13, 'OBS-07-12', 'core0 r0_r12 has exactly 13 elements');
  check(typeof snap.core0.flags.negative === 'boolean', 'OBS-07-13', 'core0 flags.negative is boolean');
  check(typeof snap.core0.control.spsel === 'boolean', 'OBS-07-14', 'core0 control.spsel is boolean');
  check(typeof snap.core0.interrupts.pending === 'number', 'OBS-07-15', 'core0 interrupts.pending is number');

  check(snap.core1.coreId === 1, 'OBS-07-16', 'core1 coreId is 1');
  check(snap.core1.lifecycle === 'BOOTROM_PARKED', 'OBS-07-17', 'core1 initial lifecycle is BOOTROM_PARKED');
  check(snap.core1.waiting === true, 'OBS-07-18', 'core1 initial waiting is true');
  check(snap.core1.r0_r12.length === 13, 'OBS-07-19', 'core1 r0_r12 has exactly 13 elements');

  // 7.3: Subsystems telemetry
  check(snap.fifo.fifo0to1.depth === 0, 'OBS-07-20', 'fifo0to1 depth is 0');
  check(snap.fifo.fifo1to0.depth === 0, 'OBS-07-21', 'fifo1to0 depth is 0');
  check(snap.spinlocks.claimedMask === 0, 'OBS-07-22', 'spinlocks claimedMask is 0');
  check(snap.spinlocks.claimedCount === 0, 'OBS-07-23', 'spinlocks claimedCount is 0');
  check(snap.spinlocks.ownershipModel === 'UNTRACKED', 'OBS-07-24', 'spinlocks ownershipModel is UNTRACKED');
  check(snap.bootRom.isLaunched === false, 'OBS-07-25', 'bootRom isLaunched is false');
  check(snap.bootRom.handshakeStep === 0, 'OBS-07-26', 'bootRom handshakeStep is 0');

  // 7.4: Non-interference verification
  const snapA = controller.getExecutionSnapshot();
  const snapB = controller.getExecutionSnapshot();
  check(snapA.core0.cycles === snapB.core0.cycles, 'OBS-07-27', 'Consecutive snapshots do not advance core0 cycles');
  check(snapA.core1.cycles === snapB.core1.cycles, 'OBS-07-28', 'Consecutive snapshots do not advance core1 cycles');
  check(snapA.totalCycleCount === snapB.totalCycleCount, 'OBS-07-29', 'Consecutive snapshots do not advance totalCycleCount');
  check(snapA.core0.pc === snapB.core0.pc, 'OBS-07-30', 'Consecutive snapshots do not change core0 PC');
  check(snapA.core1.pc === snapB.core1.pc, 'OBS-07-31', 'Consecutive snapshots do not change core1 PC');
  check(snapA.fifo.fifo0to1.depth === snapB.fifo.fifo0to1.depth, 'OBS-07-32', 'Consecutive snapshots do not alter FIFO depth');
  check(snapA.spinlocks.claimedMask === snapB.spinlocks.claimedMask, 'OBS-07-33', 'Consecutive snapshots do not alter spinlock mask');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY REPORT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL TESTS:   ${totalTests}`);
console.log(`PASSED:        ${passedTests}`);
console.log(`FAILED:        ${failedTests}`);
console.log(`SUCCESS RATE:  ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('════════════════════════════════════════════════════════════════════════\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
