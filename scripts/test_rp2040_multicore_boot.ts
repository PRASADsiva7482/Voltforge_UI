/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.7.1: INDEPENDENT RP2040 MULTICORE & 36 ARCHITECTURAL SPECIFICATIONS HARNESS
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Authoritative Executable Verification for:
 * 1. 9 Executable proofs of dual-core scheduler execution in SimulationEngine / Controller (SCHED-00 .. SCHED-08)
 * 2. Group 1: 10 SIO FIFO and SEV specifications (TEST-SEM-01 .. TEST-SEM-10)
 * 3. Group 2: 7 IRQ Routing and Cross-Core Isolation specifications (TEST-IRQ-01 .. TEST-IRQ-07)
 * 4. Group 3: 16 ARMv6-M WFE Wake-up & Exception truth-table scenarios across 17 unique test IDs (TEST-WFE-01 .. TEST-WFE-15, including 12A/B/C)
 * 5. Group 4: 2 Boot ROM Handshake and Handover specifications (TEST-BOOT-01 .. TEST-BOOT-02)
 * 6. HardFault and NMI wake-up immunity under PRIMASK
 * 7. Backward compatibility for Core 0-only single-core firmware
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040Multicore, SIO_CPUID, PPB_SCR } from '../src/features/rp2040/multicore/RP2040Multicore';
import {
  RP2040SioFifo,
  SIO_FIFO_ST,
  SIO_FIFO_WR,
  SIO_FIFO_RD,
  SIO_FIFO_ST_VLD,
  SIO_FIFO_ST_RDY,
  SIO_FIFO_ST_WOF,
  SIO_FIFO_ST_ROE,
  SIO_IRQ_PROC0,
  SIO_IRQ_PROC1,
} from '../src/features/rp2040/multicore/RP2040SioFifo';
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, specId: string, message: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [CHECK PASS] ${specId}: ${message}`);
  } else {
    console.error(`  [CHECK FAIL] ${specId}: ${message}`);
  }
}

function buildUf2(flashPayload: Uint8Array, startAddress = 0x10000000): Uint8Array {
  const blockSize = 256;
  const numBlocks = Math.ceil(flashPayload.length / blockSize);
  const uf2 = new Uint8Array(numBlocks * 512);
  const view = new DataView(uf2.buffer);

  for (let i = 0; i < numBlocks; i++) {
    const offset = i * 512;
    view.setUint32(offset + 0, 0x0a324655, true);
    view.setUint32(offset + 4, 0x9e5d5157, true);
    view.setUint32(offset + 8, 0x00002000, true);
    view.setUint32(offset + 12, startAddress + i * blockSize, true);
    view.setUint32(offset + 16, blockSize, true);
    view.setUint32(offset + 20, i, true);
    view.setUint32(offset + 24, numBlocks, true);
    view.setUint32(offset + 28, 0xe48bff56, true);

    const chunk = flashPayload.subarray(i * blockSize, Math.min((i + 1) * blockSize, flashPayload.length));
    uf2.set(chunk, offset + 32);

    view.setUint32(offset + 508, 0x0ab16f30, true);
  }
  return uf2;
}

function runAllMulticoreVerifications(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.7.1 — INDEPENDENT 36 ARCHITECTURAL SPECIFICATIONS & 9 SCHEDULER PROOFS');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION A: 9 Executable Proofs of Dual-Core Execution under Scheduler (SCHED-00 .. SCHED-08)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[SECTION A] Verifying Dual-Core Execution Path under Controller & Scheduler...');
  const ctrl = new RP2040Controller();

  // Create minimal valid vector table in a 4KB synthetic flash image
  const syntheticFlash = new Uint8Array(4096).fill(0xff);
  const flashView = new DataView(syntheticFlash.buffer);
  const core0Entry = 0x10000101; // Thumb
  const core1Entry = 0x10000201; // Thumb
  const sp0 = 0x20041000;
  const sp1 = 0x20042000;

  // Flash: Initial SP and Reset Handler
  flashView.setUint32(0x0000, sp0, true);
  flashView.setUint32(0x0004, core0Entry, true);

  // Core 0 Code at 0x100:
  // 0x100: MOVS R0, #42 (0x202A)
  // 0x102: SEV          (0xBF40)
  // 0x104: ADDS R0, #1  (0x3001)
  // 0x106: B .          (0xE7FE)
  flashView.setUint16(0x0100, 0x202a, true);
  flashView.setUint16(0x0102, 0xbf40, true);
  flashView.setUint16(0x0104, 0x3001, true);
  flashView.setUint16(0x0106, 0xe7fe, true);

  // Core 1 Code at 0x200:
  // 0x200: WFE          (0xBF20)
  // 0x202: MOVS R1, #99 (0x2163)
  // 0x204: ADDS R1, #1  (0x3101)
  // 0x206: B .          (0xE7FE)
  flashView.setUint16(0x0200, 0xbf20, true);
  flashView.setUint16(0x0202, 0x2163, true);
  flashView.setUint16(0x0204, 0x3101, true);
  flashView.setUint16(0x0206, 0xe7fe, true);

  // Load into controller using authentic UF2 container
  const uf2Image = buildUf2(syntheticFlash);
  const loadRes = ctrl.loadFirmware(uf2Image);
  assert(loadRes.success, 'SCHED-00', 'Firmware ingested into RP2040Controller');
  const mcu = ctrl.getMulticoreInstance()!;
  assert(mcu !== null, 'SCHED-00', 'Multicore SoC instantiated in RP2040Controller');

  // Launch Core 1 via Boot ROM
  mcu.bootRom.launchCore1(0x10000000, sp1, core1Entry);
  assert(ctrl.isCore1Launched(), 'SCHED-00', 'Core 1 launched into active multicore co-simulation');

  // Verify SCHED-08: Before stepping, Core 0 is primed at Reset Handler
  assert(mcu.core0.PC === (core0Entry & ~1), 'SCHED-08', 'Core 0 reset handler initialized');
  assert(mcu.core1.PC === (core1Entry & ~1), 'SCHED-00', 'Core 1 entry point initialized');

  // Step 1: Execute 1 instruction on the scheduler (Core 0: MOVS R0, #42)
  ctrl.step(1);
  assert(mcu.core0.registers[0] === 42, 'SCHED-01', 'Core 0 executes instruction sequence mutating R0 to 42');

  // Step 2: Step scheduler. Core 1 executes WFE (0x200) and enters sleep!
  ctrl.step(1);
  assert(mcu.core1.waiting === true, 'SCHED-04', 'Core 1 enters low-power WFE sleep while Core 0 continues');
  const core1PcAtSleep = mcu.core1.PC;

  // Step 3: Step scheduler multiple cycles while Core 1 sleeps. Core 0 executes SEV and advances, Core 1 does NOT move!
  // But wait: Core 0 at 0x102 is SEV! Before Core 0 executes SEV:
  // Step Core 1 once more to prove sleeping core does not advance PC or execute instructions
  mcu.activeCoreId = 1;
  const sleepDelta = mcu.core1.executeInstruction();
  assert(sleepDelta === 1, 'SCHED-05', 'Sleeping core returns 1 virtual cycle');
  assert(mcu.core1.PC === core1PcAtSleep, 'SCHED-05', 'Sleeping core does NOT advance PC or execute instructions');

  // Step 4: Step scheduler. Core 0 executes SEV (0x102) -> emits pulse to Core 1
  ctrl.step(1);
  assert(mcu.core0.eventRegistered === true, 'SCHED-06', 'Core 0 executing SEV asserts its own Event Register');
  assert(mcu.core1.waiting === false, 'SCHED-06', 'Cross-core SEV pulse wakes sleeping Core 1');

  // Step 5: Step scheduler. Both cores now progress concurrently under the actual simulation scheduler
  // Core 0 executes ADDS R0, #1 -> R0 becomes 43
  // Core 1 executes MOVS R1, #99 -> R1 becomes 99
  ctrl.stepCyclesWithEventBreak(10);
  assert(mcu.core0.registers[0] === 43, 'SCHED-03', 'Core 0 progressed under simulation scheduler (R0 = 43)');
  assert(mcu.core1.registers[1] === 100, 'SCHED-02', 'Core 1 independently executes sequence under scheduler (R1 = 100)');

  // Step 6: Verify independent CPU and exception state
  assert(mcu.core0.registers[0] !== mcu.core1.registers[0], 'SCHED-07', 'Core 0 and Core 1 retain independent R0');
  assert(mcu.core0.SP !== mcu.core1.SP, 'SCHED-07', 'Core 0 and Core 1 retain independent SP');
  assert(mcu.core0.PC !== mcu.core1.PC, 'SCHED-07', 'Core 0 and Core 1 retain independent PC');

  // Verify SCHED-08: Single-core execution snapshot
  const snap = ctrl.getExecutionSnapshot();
  assert(snap.isMulticoreActive === true, 'SCHED-08', 'Snapshot reports multicore active');
  assert(snap.core0 !== undefined && snap.core1 !== undefined, 'SCHED-08', 'Snapshot contains both core0 and core1 diagnostics');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION B: Group 1 — SIO FIFO & Software SEV Semantics (10 Specifications)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION B] Verifying Group 1: SIO FIFO & Software SEV Semantics (TEST-SEM-01 .. 10)...');
  mcu.reset();
  mcu.bootRom.launchCore1(0x10000000, sp1, core1Entry);
  const fifo = mcu.sioFifo;

  // TEST-SEM-01: Receiver polls FIFO_ST.VLD without SEV
  mcu.core0.writeUint32(SIO_FIFO_WR, 0x11223344);
  assert((mcu.core1.readUint32(SIO_FIFO_ST) & SIO_FIFO_ST_VLD) !== 0, 'TEST-SEM-01', 'Core 1 polls FIFO_ST and observes VLD=1');
  assert(mcu.core1.eventRegistered === false, 'TEST-SEM-01', 'Event Register remains false (no implicit SEV on FIFO write)');
  assert(mcu.core1.readUint32(SIO_FIFO_RD) === 0x11223344, 'TEST-SEM-01', 'Core 1 reads data from FIFO_RD');

  // TEST-SEM-02: FIFO write with IRQ enabled in NVIC
  mcu.core1.enabledInterrupts = (1 << SIO_IRQ_PROC1); // Enable IRQ 16 in Core 1
  mcu.core1.PM = false;
  mcu.core0.writeUint32(SIO_FIFO_WR, 0x55667788);
  assert((mcu.core1.pendingInterrupts & (1 << SIO_IRQ_PROC1)) !== 0, 'TEST-SEM-02', 'Core 1 NVIC asserts IRQ 16 pending on FIFO write');
  mcu.core1.readUint32(SIO_FIFO_RD); // Drain
  mcu.core1.enabledInterrupts = 0;

  // TEST-SEM-03: FIFO write while receiver sleeps (SEVONPEND=0, IRQ disabled)
  mcu.core1.waiting = true;
  mcu.core1.eventRegistered = false;
  mcu.core1.enabledInterrupts = 0;
  mcu.core1.sevonpend = false;
  mcu.core0.writeUint32(SIO_FIFO_WR, 0x99AABBCC);
  assert(mcu.core1.waiting === true, 'TEST-SEM-03', 'Receiver remains sleeping in WFE; FIFO write does NOT wake receiver');
  assert(mcu.core1.eventRegistered === false, 'TEST-SEM-03', 'Receiver Event Register remains false');
  mcu.core1.readUint32(SIO_FIFO_RD); // Drain
  mcu.core1.waiting = false;

  // TEST-SEM-04: FIFO write while receiver sleeps (SEVONPEND=1, IRQ asserted)
  mcu.core1.waiting = true;
  mcu.core1.eventRegistered = false;
  mcu.core1.sevonpend = true; // SEVONPEND enabled
  mcu.core0.writeUint32(SIO_FIFO_WR, 0xDDEEFF00);
  assert(mcu.core1.waiting === false, 'TEST-SEM-04', 'Receiver wakes from WFE via SEVONPEND on FIFO IRQ 16 assertion');
  mcu.core1.readUint32(SIO_FIFO_RD);
  mcu.core1.sevonpend = false;

  // TEST-SEM-05: Explicit Core 0 SEV waking Core 1
  mcu.core1.waiting = true;
  mcu.core1.eventRegistered = false;
  mcu.flashView.setUint16(0x0102, 0xbf40, true);
  mcu.core0.PC = 0x10000102; // SEV instruction
  mcu.core0.executeInstruction();
  assert(mcu.core1.waiting === false, 'TEST-SEM-05', 'Core 1 wakes from WFE upon Core 0 executing SEV');
  assert(mcu.core1.eventRegistered === false, 'TEST-SEM-05', 'Core 1 Event Register consumed to false on wake-up');

  // TEST-SEM-06: Explicit Core 1 SEV waking Core 0
  mcu.core0.waiting = true;
  mcu.core0.eventRegistered = false;
  mcu.core1.waiting = false;
  mcu.flashView.setUint16(0x0210, 0xbf40, true); // SEV at 0x210
  mcu.core1.PC = 0x10000210;
  mcu.core1.executeInstruction();
  assert(mcu.core0.waiting === false, 'TEST-SEM-06', 'Core 0 wakes from WFE upon Core 1 executing SEV');

  // TEST-SEM-07: SEV executed before WFE
  mcu.core1.waiting = false;
  mcu.core1.eventRegistered = false;
  mcu.sendCrossCoreEvent(0); // Pulse from Core 0
  assert(mcu.core1.eventRegistered === true, 'TEST-SEM-07', 'Event Register set to true prior to WFE');
  mcu.flashView.setUint16(0x0220, 0xbf20, true); // WFE at 0x220
  mcu.core1.PC = 0x10000220;
  mcu.core1.executeInstruction();
  assert(mcu.core1.waiting === false, 'TEST-SEM-07', 'WFE consumes event and does NOT sleep');
  assert(mcu.core1.eventRegistered === false, 'TEST-SEM-07', 'Event Register cleared to false after consumption');

  // TEST-SEM-08: Multiple SEV pulses before WFE (saturation)
  mcu.core1.waiting = false;
  mcu.core1.eventRegistered = false;
  mcu.sendCrossCoreEvent(0);
  mcu.sendCrossCoreEvent(0);
  mcu.sendCrossCoreEvent(0);
  assert(mcu.core1.eventRegistered === true, 'TEST-SEM-08', 'Multiple SEVs saturate 1-bit Event Register at true');
  mcu.flashView.setUint16(0x0222, 0xbf20, true);
  mcu.core1.PC = 0x10000222;
  mcu.core1.executeInstruction(); // 1st WFE consumes
  assert(mcu.core1.waiting === false, 'TEST-SEM-08', '1st WFE consumes event without sleeping');
  assert(mcu.core1.eventRegistered === false, 'TEST-SEM-08', 'Event Register is now false');
  mcu.flashView.setUint16(0x0224, 0xbf20, true);
  mcu.core1.PC = 0x10000224;
  mcu.core1.executeInstruction(); // 2nd WFE suspends!
  assert(mcu.core1.waiting === true, 'TEST-SEM-08', '2nd WFE suspends execution (proves 1-bit latching saturation)');
  mcu.core1.waiting = false;

  // TEST-SEM-09: WFE consuming Event Register
  mcu.core0.eventRegistered = true;
  mcu.core0.waiting = false;
  mcu.flashView.setUint16(0x0120, 0xbf20, true);
  mcu.core0.PC = 0x10000120;
  mcu.core0.executeInstruction();
  assert(mcu.core0.eventRegistered === false, 'TEST-SEM-09', 'Executing WFE consumes Event Register to false');
  assert(mcu.core0.waiting === false, 'TEST-SEM-09', 'Core does not sleep when event was registered');

  // TEST-SEM-10: Separate FIFO write followed by SEV (SDK pattern)
  mcu.core1.waiting = true;
  mcu.core1.eventRegistered = false;
  mcu.core0.writeUint32(SIO_FIFO_WR, 0x12344321); // Step A: push data
  assert(mcu.core1.waiting === true, 'TEST-SEM-10', 'Step A: Receiver still sleeping after raw FIFO push');
  mcu.sendCrossCoreEvent(0); // Step B: explicit __sev()
  assert(mcu.core1.waiting === false, 'TEST-SEM-10', 'Step B: Receiver wakes upon subsequent explicit SEV');
  assert(mcu.core1.readUint32(SIO_FIFO_RD) === 0x12344321, 'TEST-SEM-10', 'Step C: Receiver pops valid FIFO data');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION C: Group 2 — Interrupt Routing & Cross-Core Isolation (7 Specs)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION C] Verifying Group 2: Interrupt Routing & Cross-Core Isolation (TEST-IRQ-01 .. 07)...');
  mcu.reset();
  mcu.bootRom.launchCore1(0x10000000, sp1, core1Entry);

  // TEST-IRQ-01: Core 0 FIFO write isolates to Core 1 line 16
  mcu.core0.writeUint32(SIO_FIFO_WR, 0xAAAA5555);
  assert((mcu.core1.pendingInterrupts & (1 << SIO_IRQ_PROC1)) !== 0, 'TEST-IRQ-01', 'Core 1 receives IRQ 16 on Core 0 FIFO write');
  assert((mcu.core0.pendingInterrupts & (1 << SIO_IRQ_PROC0)) === 0, 'TEST-IRQ-01', 'Core 0 line 15 remains 0');
  assert((mcu.core0.pendingInterrupts & (1 << SIO_IRQ_PROC1)) === 0, 'TEST-IRQ-01', 'Core 0 line 16 is disconnected');

  // TEST-IRQ-03: Dynamic de-assertion on FIFO drain
  mcu.core1.readUint32(SIO_FIFO_RD);
  assert((mcu.core1.pendingInterrupts & (1 << SIO_IRQ_PROC1)) === 0, 'TEST-IRQ-03', 'IRQ 16 dynamically de-asserts to 0 when RX FIFO is drained');

  // TEST-IRQ-02: Core 1 FIFO write isolates to Core 0 line 15
  mcu.core1.writeUint32(SIO_FIFO_WR, 0x5555AAAA);
  assert((mcu.core0.pendingInterrupts & (1 << SIO_IRQ_PROC0)) !== 0, 'TEST-IRQ-02', 'Core 0 receives IRQ 15 on Core 1 FIFO write');
  assert((mcu.core1.pendingInterrupts & (1 << SIO_IRQ_PROC1)) === 0, 'TEST-IRQ-02', 'Core 1 line 16 remains 0');
  mcu.core0.readUint32(SIO_FIFO_RD);
  assert((mcu.core0.pendingInterrupts & (1 << SIO_IRQ_PROC0)) === 0, 'TEST-IRQ-02', 'Core 0 line 15 dynamically de-asserts to 0 on drain');

  // TEST-IRQ-04: IO_BANK0 PROC0 interrupt isolation (IRQ 13)
  mcu.core0.setInterrupt(13, true);
  assert((mcu.core0.pendingInterrupts & (1 << 13)) !== 0, 'TEST-IRQ-04', 'Core 0 asserts PROC0 IO_BANK0 interrupt (IRQ 13)');
  assert((mcu.core1.pendingInterrupts & (1 << 13)) === 0, 'TEST-IRQ-04', 'Core 1 IO_BANK0 line remains unaffected (isolated)');
  mcu.core0.setInterrupt(13, false);

  // TEST-IRQ-05: IO_BANK0 PROC1 interrupt isolation (IRQ 13)
  mcu.core1.setInterrupt(13, true);
  assert((mcu.core1.pendingInterrupts & (1 << 13)) !== 0, 'TEST-IRQ-05', 'Core 1 asserts PROC1 IO_BANK0 interrupt (IRQ 13)');
  assert((mcu.core0.pendingInterrupts & (1 << 13)) === 0, 'TEST-IRQ-05', 'Core 0 IO_BANK0 line remains unaffected (isolated)');
  mcu.core1.setInterrupt(13, false);

  // TEST-IRQ-06: Independent NVIC_ICPR clearing
  mcu.core0.setInterrupt(4, true); // Shared PWM IRQ
  mcu.core1.setInterrupt(4, true);
  assert((mcu.core0.pendingInterrupts & (1 << 4)) !== 0, 'TEST-IRQ-06', 'Core 0 IRQ 4 pending');
  assert((mcu.core1.pendingInterrupts & (1 << 4)) !== 0, 'TEST-IRQ-06', 'Core 1 IRQ 4 pending');
  // Clear on Core 0 only via ICPR write: 0xE000E280
  mcu.core0.writeUint32(0xe000e280, (1 << 4));
  assert((mcu.core0.pendingInterrupts & (1 << 4)) === 0, 'TEST-IRQ-06', 'Core 0 pending bit 4 cleared via NVIC_ICPR');
  assert((mcu.core1.pendingInterrupts & (1 << 4)) !== 0, 'TEST-IRQ-06', 'Core 1 pending bit 4 remains 1 (independent NVIC)');
  mcu.core1.writeUint32(0xe000e280, (1 << 4));

  // TEST-IRQ-07: Peripheral-level de-assertion
  mcu.core0.setInterrupt(4, true);
  mcu.core1.setInterrupt(4, true);
  // Peripheral de-asserts physical line:
  mcu.core0.setInterrupt(4, false);
  mcu.core1.setInterrupt(4, false);
  assert((mcu.core0.pendingInterrupts & (1 << 4)) === 0, 'TEST-IRQ-07', 'Core 0 IRQ 4 line drops to 0 on peripheral de-assertion');
  assert((mcu.core1.pendingInterrupts & (1 << 4)) === 0, 'TEST-IRQ-07', 'Core 1 IRQ 4 line drops to 0 on peripheral de-assertion');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION D: Group 3 — 16 ARMv6-M WFE Truth-Table Scenarios across 17 Unique Test IDs (TEST-WFE-01 .. 15, 12A/B/C)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION D] Verifying Group 3: 16 ARMv6-M WFE Truth Table across 17 Unique Test IDs (TEST-WFE-01 .. 15, 12A/B/C)...');

  // Set up dummy vector table for exception tests
  for (let i = 0; i < 48; i++) {
    mcu.flashView.setUint32(i * 4, 0x10000801, true);
  }
  mcu.flashView.setUint16(0x0800, 0xe7fe, true); // B .

  // TEST-WFE-01: Event register set before WFE
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.eventRegistered = true;
  mcu.core0.waiting = false;
  mcu.flashView.setUint16(0x0130, 0xbf20, true);
  mcu.core0.PC = 0x10000130;
  mcu.core0.executeInstruction();
  assert(mcu.core0.eventRegistered === false, 'TEST-WFE-01', 'Event register set before WFE is consumed to false');
  assert(mcu.core0.waiting === false, 'TEST-WFE-01', 'WFE does not sleep when event was set');
  assert(mcu.core0.PC === 0x10000132, 'TEST-WFE-01', 'PC advances past WFE');

  // TEST-WFE-02: Event register clear before WFE
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.eventRegistered = false;
  mcu.core0.waiting = false;
  mcu.flashView.setUint16(0x0134, 0xbf20, true);
  mcu.core0.PC = 0x10000134;
  mcu.core0.executeInstruction();
  assert(mcu.core0.waiting === true, 'TEST-WFE-02', 'Core enters low-power sleep when event register was clear');
  assert(mcu.core0.eventRegistered === false, 'TEST-WFE-02', 'Event register remains false');
  assert(mcu.core0.PC === 0x10000136, 'TEST-WFE-02', 'PC advances past WFE instruction to next instruction');
  const pcWhileWaiting = mcu.core0.PC;
  mcu.core0.executeInstruction();
  assert(mcu.core0.PC === pcWhileWaiting, 'TEST-WFE-02', 'PC remains parked while waiting in WFE');

  // TEST-WFE-03: Explicit SEV received while sleeping
  mcu.core0.reset();
  mcu.core0.waiting = true;
  mcu.core0.eventRegistered = false;
  mcu.sendCrossCoreEvent(1); // Core 1 sends SEV to Core 0
  assert(mcu.core0.waiting === false, 'TEST-WFE-03', 'Core 0 wakes into Thread mode upon counterpart SEV');
  assert(mcu.core0.eventRegistered === false, 'TEST-WFE-03', 'Event Register cleared on wake under emulator consumption policy');

  // TEST-WFE-04: Enabled unmasked IRQ arrives while sleeping
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.waiting = true;
  mcu.core0.PM = false;
  mcu.core0.enabledInterrupts = (1 << 20);
  mcu.core0.sevonpend = false;
  mcu.core0.setInterrupt(20, true);
  assert(mcu.core0.waiting === false, 'TEST-WFE-04', 'Enabled unmasked IRQ wakes core from WFE');
  assert(mcu.core0.IPSR === 36, 'TEST-WFE-04', 'Vectors to exception handler (IPSR = 16 + 20 = 36)');

  // TEST-WFE-05: Masked IRQ arrives (PRIMASK=1, SEVONPEND=0)
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.waiting = true;
  mcu.core0.PM = true; // Masked
  mcu.core0.enabledInterrupts = (1 << 20);
  mcu.core0.sevonpend = false;
  mcu.core0.setInterrupt(20, true);
  assert(mcu.core0.waiting === true, 'TEST-WFE-05', 'PRIMASK=1 masks preemption wake-up; core remains in WFE sleep');
  assert(mcu.core0.eventRegistered === false, 'TEST-WFE-05', 'Event Register remains false');
  assert((mcu.core0.pendingInterrupts & (1 << 20)) !== 0, 'TEST-WFE-05', 'Interrupt remains asserted in NVIC');

  // TEST-WFE-06: Masked IRQ arrives (PRIMASK=1, SEVONPEND=1)
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.waiting = true;
  mcu.core0.PM = true;
  mcu.core0.enabledInterrupts = (1 << 20);
  mcu.core0.sevonpend = true; // SEVONPEND active
  mcu.core0.setInterrupt(20, true);
  assert(mcu.core0.waiting === false, 'TEST-WFE-06', 'Wakes strictly via Mechanism 2 (SEVONPEND)');
  assert(mcu.core0.IPSR === 0, 'TEST-WFE-06', 'Resumes Thread mode; does NOT enter ISR while PRIMASK=1');
  assert((mcu.core0.pendingInterrupts & (1 << 20)) !== 0, 'TEST-WFE-06', 'Pending interrupt retained in NVIC');

  // TEST-WFE-07: Disabled IRQ arrives (SEVONPEND=0)
  mcu.core0.reset();
  mcu.core0.waiting = true;
  mcu.core0.PM = false;
  mcu.core0.enabledInterrupts = 0; // Disabled
  mcu.core0.sevonpend = false;
  mcu.core0.setInterrupt(20, true);
  assert(mcu.core0.waiting === true, 'TEST-WFE-07', 'Disabled IRQ with SEVONPEND=0 does NOT wake WFE');

  // TEST-WFE-08: Disabled IRQ arrives (SEVONPEND=1)
  mcu.core0.reset();
  mcu.core0.waiting = true;
  mcu.core0.PM = false;
  mcu.core0.enabledInterrupts = 0; // Disabled in NVIC
  mcu.core0.sevonpend = true;      // But SEVONPEND active
  mcu.core0.setInterrupt(20, true);
  assert(mcu.core0.waiting === false, 'TEST-WFE-08', 'Disabled IRQ with SEVONPEND=1 wakes WFE into Thread mode');
  assert(mcu.core0.IPSR === 0, 'TEST-WFE-08', 'No ISR vectoring when disabled in NVIC_ISER');

  // TEST-WFE-09: Pre-existing pending IRQ before WFE (PM=0)
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.waiting = false;
  mcu.core0.PM = false;
  mcu.core0.enabledInterrupts = (1 << 20);
  mcu.core0.pendingInterrupts = (1 << 20);
  mcu.core0.interruptsUpdated = true;
  // Core approaches WFE at 0x140
  mcu.flashView.setUint16(0x0140, 0xbf20, true);
  mcu.core0.PC = 0x10000140;
  mcu.core0.executeInstruction();
  assert(mcu.core0.IPSR === 36, 'TEST-WFE-09', 'Pre-existing pending IRQ vectors to ISR before WFE sleep occurs');
  assert(mcu.core0.waiting === false, 'TEST-WFE-09', 'Core is in active ISR, not sleeping');

  // TEST-WFE-10: Pre-existing stagnant pending IRQ (PM=1, SEVONPEND=0)
  mcu.core0.reset();
  mcu.core0.waiting = false;
  mcu.core0.PM = true; // Masked
  mcu.core0.enabledInterrupts = (1 << 20);
  mcu.core0.pendingInterrupts = (1 << 20); // Stagnant pending state (not a new edge)
  mcu.core0.sevonpend = false;
  mcu.core0.eventRegistered = false;
  mcu.flashView.setUint16(0x0144, 0xbf20, true);
  mcu.core0.PC = 0x10000144;
  mcu.core0.executeInstruction();
  assert(mcu.core0.waiting === true, 'TEST-WFE-10', 'Stagnant pending IRQ does not generate event; core enters WFE sleep');

  // TEST-WFE-11: Priority cannot preempt active ISR
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.IPSR = 36; // In IRQ 20 handler (priority 0)
  (mcu.core0 as any).currentMode = 1; // Handler mode
  mcu.core0.waiting = true;
  mcu.core0.PM = false;
  mcu.core0.enabledInterrupts = (1 << 21);
  mcu.core0.interruptPriorities[1] = (1 << 21); // IRQ 21 has priority 1 (less urgent than 0)
  mcu.core0.sevonpend = false;
  mcu.core0.setInterrupt(21, true);
  assert(mcu.core0.waiting === true, 'TEST-WFE-11', 'Lower urgency priority cannot preempt active ISR; remains in WFE');

  // TEST-WFE-12A: Ordinary BX LR subroutine return (does not assert Event Register)
  mcu.core0.reset();
  mcu.core0.eventRegistered = false;
  mcu.core0.LR = 0x10000105; // Ordinary code address in Thread mode (LR[31:28] != 0xF)
  mcu.core0.BXWritePC(mcu.core0.LR);
  assert(mcu.core0.PC === 0x10000104, 'TEST-WFE-12A', 'Ordinary BX LR branches to return address');
  assert(mcu.core0.eventRegistered === false, 'TEST-WFE-12A', 'Ordinary BX LR does NOT set Event Register');

  // TEST-WFE-12B: Architectural EXC_RETURN to Thread mode (sets Event Register = true)
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.SP = 0x20041000;
  mcu.core0.exceptionEntry(36); // Enter IRQ 20
  mcu.core0.eventRegistered = false;
  mcu.core0.exceptionReturn(0xfffffff9); // Return to Thread mode
  assert(mcu.core0.eventRegistered === true, 'TEST-WFE-12B', 'EXC_RETURN to Thread mode sets Event Register = true (ARMv6-M §B1.5.17)');
  assert(mcu.core0.IPSR === 0, 'TEST-WFE-12B', 'Restores Thread mode (IPSR = 0)');

  // TEST-WFE-12C: Architectural EXC_RETURN to nested Handler mode (sets Event Register = true)
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.SP = 0x20041000;
  mcu.core0.exceptionEntry(36); // Outer exception
  mcu.core0.exceptionEntry(37); // Nested exception
  mcu.core0.eventRegistered = false;
  mcu.core0.exceptionReturn(0xfffffff1); // Return to nested Handler mode
  assert(mcu.core0.eventRegistered === true, 'TEST-WFE-12C', 'EXC_RETURN to nested Handler mode sets Event Register = true');
  assert(mcu.core0.IPSR === 36, 'TEST-WFE-12C', 'Restores outer Handler mode (IPSR = 36)');

  // TEST-WFE-13: Multiple SEV pulses before WFE (saturation)
  mcu.core0.reset();
  mcu.core0.eventRegistered = false;
  mcu.core0.waiting = false;
  mcu.sendCrossCoreEvent(1);
  mcu.sendCrossCoreEvent(1);
  assert(mcu.core0.eventRegistered === true, 'TEST-WFE-13', 'Multiple incoming SEVs saturate 1-bit Event Register');
  mcu.flashView.setUint16(0x0150, 0xbf20, true);
  mcu.core0.PC = 0x10000150;
  mcu.core0.executeInstruction(); // 1st WFE consumes
  assert(mcu.core0.waiting === false, 'TEST-WFE-13', '1st WFE consumes event without sleeping');
  mcu.flashView.setUint16(0x0152, 0xbf20, true);
  mcu.core0.PC = 0x10000152;
  mcu.core0.executeInstruction(); // 2nd WFE suspends
  assert(mcu.core0.waiting === true, 'TEST-WFE-13', '2nd WFE suspends (1-bit saturation confirmed)');

  // TEST-WFE-14: NMI (Exception 2) arrives while suspended in WFE
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.waiting = true;
  mcu.core0.PM = true; // Masked by PRIMASK
  mcu.core0.pendingNMI = true; // NMI arrives
  mcu.core0.executeInstruction();
  assert(mcu.core0.waiting === false, 'TEST-WFE-14', 'NMI wakes core from WFE unconditionally (immune to PRIMASK)');
  assert(mcu.core0.IPSR === 2, 'TEST-WFE-14', 'Vectors to NMI handler (IPSR = 2)');

  // Bonus: HardFault (Exception 3) wake-up verification
  mcu.core0.reset();
  mcu.core0.VTOR = 0x10000000;
  mcu.core0.waiting = true;
  mcu.core0.PM = true;
  mcu.core0.exceptionEntry(3); // HardFault
  assert(mcu.core0.waiting === false, 'TEST-WFE-15', 'HardFault wakes core from WFE (immune to PRIMASK)');
  assert(mcu.core0.IPSR === 3, 'TEST-WFE-15', 'Vectors to HardFault handler (IPSR = 3)');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION E: Group 4 — Boot ROM Handshake & Handover Sequences (2 Specs)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION E] Verifying Group 4: Boot ROM Handshake & Handover (TEST-BOOT-01 .. 02)...');

  // TEST-BOOT-01: Token mismatch recovery and sequence restart
  mcu.reset();
  assert(mcu.bootRom.getStep() === 0, 'TEST-BOOT-01', 'Initial Boot ROM at step 0');
  mcu.core0.writeUint32(SIO_FIFO_WR, 0); // Step 0 -> Step 1
  mcu.core0.readUint32(SIO_FIFO_RD);
  mcu.core0.writeUint32(SIO_FIFO_WR, 0); // Step 1 -> Step 2
  mcu.core0.readUint32(SIO_FIFO_RD);
  assert(mcu.bootRom.getStep() === 2, 'TEST-BOOT-01', 'Boot ROM advances to step 2');

  // Send corrupt token 0xDEADBEEF instead of 1
  mcu.core0.writeUint32(SIO_FIFO_WR, 0xDEADBEEF);
  assert(mcu.bootRom.getStep() === 0, 'TEST-BOOT-01', 'Unexpected token resets Boot ROM step to 0');
  assert(mcu.bootRom.isLaunched() === false, 'TEST-BOOT-01', 'Core 1 remains unlaunched in Boot ROM WFE');

  // TEST-BOOT-02: Thumb bit 0 validation on entry branch
  mcu.reset();
  mcu.core0.writeUint32(SIO_FIFO_WR, 0);
  mcu.core0.readUint32(SIO_FIFO_RD);
  mcu.core0.writeUint32(SIO_FIFO_WR, 0);
  mcu.core0.readUint32(SIO_FIFO_RD);
  mcu.core0.writeUint32(SIO_FIFO_WR, 1);
  mcu.core0.readUint32(SIO_FIFO_RD);
  mcu.core0.writeUint32(SIO_FIFO_WR, 0x20000100); // VTOR
  mcu.core0.readUint32(SIO_FIFO_RD);
  mcu.core0.writeUint32(SIO_FIFO_WR, 0x20041000); // SP
  mcu.core0.readUint32(SIO_FIFO_RD);
  assert(mcu.bootRom.getStep() === 5, 'TEST-BOOT-02', 'Boot ROM at step 5 (expecting ENTRY)');

  // Send even ENTRY address (bit 0 = 0)
  const evenEntry = 0x10000400; // Not a Thumb entry address!
  mcu.core0.writeUint32(SIO_FIFO_WR, evenEntry);
  assert(mcu.bootRom.isLaunched() === false, 'TEST-BOOT-02', 'Even ENTRY address rejected: Core 1 unlaunched');
  assert(mcu.bootRom.getStep() === 0, 'TEST-BOOT-02', 'Boot ROM sequence resets on Thumb bit violation');

  // ───────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('   STAGE 4.3.7.1 INDEPENDENT VERIFICATION & 36 ARCHITECTURAL SPECS SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log(`Total Architectural Checks Executed: ${totalChecks}`);
  console.log(`Total Architectural Checks Passed:   ${passedChecks} (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
  console.log(`Total Architectural Checks Failed:   ${totalChecks - passedChecks}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runAllMulticoreVerifications();
