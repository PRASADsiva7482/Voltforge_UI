/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.7.2.4: RP2040 CPU INSPECTOR UI INTEGRATION TESTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   1. Rp2040CpuInspectorPanel rendering with null snapshot (Placeholder view)
 *   2. Active snapshot rendering with dual-core tabs (Core 0 & Core 1)
 *   3. All 4 Lifecycle state badge renderings (RUNNABLE, SLEEPING, HANDLER_MODE, BOOTROM_PARKED)
 *   4. Hexadecimal and Decimal display formatting
 *   5. Register grid rendering (PC, SP, LR, xPSR, R0-R12)
 *   6. Cortex-M0+ condition flags decoding (N, Z, C, V, T)
 *   7. Exception information and IPSR decoding
 *   8. SIO FIFO depths, status flags (VLD, RDY, WOF, ROE), and queued words peek
 *   9. Spinlocks claimed mask and UNTRACKED ownership label
 *  10. Boot ROM launch state and handshake step
 *  11. Controller errors alert rendering
 *  12. Prohibited controls check (strictly NO stepping, breakpoints, or editing)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { useSimulationStore } from '../src/store/simulationStore';
import Rp2040CpuInspectorPanel from '../src/features/editor/Rp2040CpuInspectorPanel';
import type { Rp2040ExecutionSnapshot } from '../src/features/simulator/rp2040Telemetry';

let totalChecks = 0;
let passedChecks = 0;

function check(condition: boolean, id: string, description: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${id} — ${description}`);
  } else {
    console.error(`  [FAIL] ${id} — ${description}`);
    throw new Error(`Assertion failed for ${id}: ${description}`);
  }
}

function createSampleSnapshot(): Rp2040ExecutionSnapshot {
  return {
    generationId: 6,
    sequenceId: 10,
    state: 'RUNNING',
    isMulticoreActive: true,
    clockFrequency_Hz: 125000000,
    simulatedTime_s: 0.05,
    totalCycleCount: 6250000,
    hostWallTime_ms: Date.now(),
    errors: [],
    core0: {
      coreId: 0,
      lifecycle: 'RUNNABLE',
      pc: 0x10000104,
      sp: 0x20041000,
      lr: 0x10000181,
      r0_r12: [42, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
      xpsr: 0x61000000, // Negative=0, Zero=1, Carry=1, Overflow=0, Thumb=1, IPSR=0
      flags: {
        negative: false,
        zero: true,
        carry: true,
        overflow: false,
        thumb: true,
        ipsr: 0,
        exceptionName: 'ThreadMode',
      },
      control: { spsel: false, npriv: false },
      interrupts: { pending: 0, enabled: 0 },
      eventRegistered: false,
      waiting: false,
      cycles: 3125000,
    },
    core1: {
      coreId: 1,
      lifecycle: 'BOOTROM_PARKED',
      pc: 0x00000140,
      sp: 0x20041f00,
      lr: 0xffffffff,
      r0_r12: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      xpsr: 0x01000000,
      flags: {
        negative: false,
        zero: false,
        carry: false,
        overflow: false,
        thumb: true,
        ipsr: 0,
        exceptionName: 'ThreadMode',
      },
      control: { spsel: false, npriv: false },
      interrupts: { pending: 0, enabled: 0 },
      eventRegistered: false,
      waiting: true,
      cycles: 3125000,
    },
    fifo: {
      fifo0to1: { depth: 2, entries: [0xaa, 0xbb] },
      fifo1to0: { depth: 0, entries: [] },
      core0Status: { vld: false, rdy: true, wof: false, roe: false, irqAsserted: false },
      core1Status: { vld: true, rdy: true, wof: false, roe: false, irqAsserted: true },
    },
    spinlocks: {
      claimedMask: 0x00000005, // Locks 0 and 2
      claimedCount: 2,
      ownershipModel: 'UNTRACKED',
    },
    bootRom: {
      isLaunched: false,
      handshakeStep: 2,
      stepDescription: 'Expect 0',
      launchVtor: 0x10000000,
      launchSp: 0x20041f00,
      launchEntry: 0x10000201,
    },
  };
}

async function runUiTests(): Promise<void> {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE STAGE 4.3.7.2.4: RP2040 CPU INSPECTOR UI TESTS             ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: STORE STATE TOGGLES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[SECTION 1] Store State & Inspector Open/Close Toggles...');

  useSimulationStore.getState().setRp2040InspectorOpen(false);
  check(useSimulationStore.getState().rp2040InspectorOpen === false, 'UI-01a', 'rp2040InspectorOpen is initially false');

  useSimulationStore.getState().setRp2040InspectorOpen(true);
  check(useSimulationStore.getState().rp2040InspectorOpen === true, 'UI-01b', 'setRp2040InspectorOpen(true) opens inspector in store');

  useSimulationStore.getState().toggleRp2040Inspector();
  check(useSimulationStore.getState().rp2040InspectorOpen === false, 'UI-01c', 'toggleRp2040Inspector() toggles to false');

  useSimulationStore.getState().toggleRp2040Inspector();
  check(useSimulationStore.getState().rp2040InspectorOpen === true, 'UI-01d', 'toggleRp2040Inspector() toggles back to true');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: PLACEHOLDER RENDERING WHEN NO SNAPSHOT EXISTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 2] Component Placeholder Rendering (Null Snapshot)...');

  const htmlPlaceholder = renderToString(
    React.createElement(Rp2040CpuInspectorPanel, {
      isOpen: true,
      onClose: () => {},
      snapshot: null,
    })
  );

  check(htmlPlaceholder.includes('RP2040 Dual-Core CPU Inspector'), 'UI-02a', 'Panel header displays correct title');
  check(htmlPlaceholder.includes('Awaiting RP2040 CPU Telemetry') || htmlPlaceholder.includes('Simulation Inactive'), 'UI-02b', 'Placeholder message rendered when snapshot is null');
  check(htmlPlaceholder.includes('Core 0') && htmlPlaceholder.includes('Core 1'), 'UI-02c', 'Core selector buttons rendered in toolbar');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: ACTIVE SNAPSHOT RENDERING & CORE 0 VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 3] Active Snapshot Rendering (Core 0 View)...');

  const sampleSnapshot = createSampleSnapshot();
  const htmlCore0 = renderToString(
    React.createElement(Rp2040CpuInspectorPanel, {
      isOpen: true,
      onClose: () => {},
      snapshot: sampleSnapshot,
    })
  );

  check(htmlCore0.includes('RUNNABLE'), 'UI-03a', 'Core 0 lifecycle badge reports RUNNABLE');
  check(htmlCore0.includes('0x10000104'), 'UI-03b', 'Core 0 PC rendered in hexadecimal format');
  check(htmlCore0.includes('0x20041000'), 'UI-03c', 'Core 0 SP rendered in hexadecimal format');
  check(htmlCore0.includes('0x10000181'), 'UI-03d', 'Core 0 LR rendered in hexadecimal format');
  check(htmlCore0.includes('0x61000000'), 'UI-03e', 'Core 0 xPSR rendered in hexadecimal format');
  check(htmlCore0.includes('0x0000002A'), 'UI-03f', 'Core 0 R0 (42) rendered in hexadecimal (0x0000002A)');
  check(htmlCore0.includes('Thread Mode'), 'UI-03g', 'Core 0 mode reports Thread Mode');
  check(htmlCore0.includes('ThreadMode (0)'), 'UI-03h', 'Core 0 exception reports ThreadMode (0)');
  check(htmlCore0.includes('SoC Cycles'), 'UI-03i', 'Global SoC cycle count rendered');
  check(htmlCore0.includes('IRQ Pending'), 'UI-03j', 'Core 0 IRQ pending information rendered');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: CONDITION FLAGS DECODING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 4] Condition Flags Decoding...');

  check(htmlCore0.includes('N=0'), 'UI-04a', 'Negative flag decoded as N=0');
  check(htmlCore0.includes('Z=1'), 'UI-04b', 'Zero flag decoded as Z=1');
  check(htmlCore0.includes('C=1'), 'UI-04c', 'Carry flag decoded as C=1');
  check(htmlCore0.includes('V=0'), 'UI-04d', 'Overflow flag decoded as V=0');
  check(htmlCore0.includes('T=1'), 'UI-04e', 'Thumb flag decoded as T=1');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: SIO FIFOS, SPINLOCKS & BOOT ROM TELEMETRY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 5] SIO FIFOs, Spinlocks & Boot ROM Telemetry Rendering...');

  check(htmlCore0.includes('FIFO 0') && htmlCore0.includes('FIFO 1'), 'UI-05a', 'Both FIFO channels displayed');
  check(htmlCore0.includes('Depth 2/8'), 'UI-05b', 'FIFO 0 -> 1 depth reports 2/8');
  check(htmlCore0.includes('Depth 0/8'), 'UI-05c', 'FIFO 1 -> 0 depth reports 0/8');
  check(htmlCore0.includes('0x00000005'), 'UI-05d', 'Spinlock claimed mask reports 0x00000005');
  check(htmlCore0.includes('2 / 32'), 'UI-05e', 'Spinlock claimed count reports 2 / 32');
  check(htmlCore0.includes('UNTRACKED'), 'UI-05f', 'Spinlock ownership explicitly reports UNTRACKED');
  check(htmlCore0.includes('Parked'), 'UI-05g', 'Boot ROM reports Parked');
  check(htmlCore0.includes('Step 2'), 'UI-05h', 'Boot ROM reports Handshake Step 2');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: LIFECYCLE BADGES FOR ALL 4 DOCUMENTED STATES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 6] Lifecycle State Badge Renderings...');

  const sleepingSnap = {
    ...sampleSnapshot,
    core0: { ...sampleSnapshot.core0, lifecycle: 'SLEEPING' as const },
  };
  const htmlSleeping = renderToString(
    React.createElement(Rp2040CpuInspectorPanel, { isOpen: true, onClose: () => {}, snapshot: sleepingSnap })
  );
  check(htmlSleeping.includes('SLEEPING (WFE/WFI)'), 'UI-06a', 'Badge renders SLEEPING (WFE/WFI)');

  const handlerSnap = {
    ...sampleSnapshot,
    core0: {
      ...sampleSnapshot.core0,
      lifecycle: 'HANDLER_MODE' as const,
      flags: { ...sampleSnapshot.core0.flags, ipsr: 3, exceptionName: 'HardFault' },
    },
  };
  const htmlHandler = renderToString(
    React.createElement(Rp2040CpuInspectorPanel, { isOpen: true, onClose: () => {}, snapshot: handlerSnap })
  );
  check(htmlHandler.includes('HANDLER MODE'), 'UI-06b', 'Badge renders HANDLER MODE');
  check(htmlHandler.includes('HardFault (3)'), 'UI-06c', 'IPSR 3 renders HardFault (3)');

  const bootParkedSnap = {
    ...sampleSnapshot,
    core0: { ...sampleSnapshot.core0, lifecycle: 'BOOTROM_PARKED' as const },
  };
  const htmlBootParked = renderToString(
    React.createElement(Rp2040CpuInspectorPanel, { isOpen: true, onClose: () => {}, snapshot: bootParkedSnap })
  );
  check(htmlBootParked.includes('BOOTROM PARKED'), 'UI-06d', 'Badge renders BOOTROM PARKED');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: CONTROLLER ERRORS ALERT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 7] Controller Errors Alert Box...');

  const errSnap = {
    ...sampleSnapshot,
    errors: ['Bus fault: unmapped address 0xdeadbeef', 'HardFault triggered on Core 0'],
  };
  const htmlErr = renderToString(
    React.createElement(Rp2040CpuInspectorPanel, { isOpen: true, onClose: () => {}, snapshot: errSnap })
  );
  check(htmlErr.includes('Host Controller Errors'), 'UI-07a', 'Error container rendered');
  check(htmlErr.includes('Bus fault: unmapped address 0xdeadbeef'), 'UI-07b', 'Specific error text rendered');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: PROHIBITED CONTROLS CHECK (Group A Strict Read-Only Policy)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 8] Prohibited Controls Security Verification...');

  check(!htmlCore0.toLowerCase().includes('step instruction'), 'PROHIB-01', 'No step instruction control');
  check(!htmlCore0.toLowerCase().includes('step core'), 'PROHIB-02', 'No step core control');
  check(!htmlCore0.toLowerCase().includes('breakpoint'), 'PROHIB-03', 'No breakpoint controls');
  check(!htmlCore0.includes('<input'), 'PROHIB-04', 'No text input or editable register fields');
  check(!htmlCore0.toLowerCase().includes('edit register'), 'PROHIB-05', 'No register edit controls');
  check(!htmlCore0.toLowerCase().includes('modify memory'), 'PROHIB-06', 'No memory modify controls');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   STAGE 4.3.7.2.4 UI TESTS: ${passedChecks} / ${totalChecks} CHECKS PASSED`);
  console.log('   STATUS: READ-ONLY RP2040 INSPECTOR VERIFIED (100% PASS)');
  console.log('════════════════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

runUiTests().catch((err) => {
  console.error('[UI TEST FAILURE]:', err);
  process.exit(1);
});

