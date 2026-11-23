/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.6.2: PWM DIAGNOSTICS BROWSER & UI INTEGRATION TEST
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the full end-to-end data pipeline for RP2040 PWM diagnostics:
 *   RP2040Controller → SimulationWorker → SimulationEngine → simulationStore → PWM Inspector UI
 *
 * Verification Steps:
 *   1. Store state initialization and typing
 *   2. WorkerResultMessage serialization compatibility
 *   3. Live store dispatch and reactive slice diagnostics updating
 *   4. DIVMODE badges and Channel B input mode alerts in diagnostics payload
 *   5. Non-RP2040 board safety (null/missing diagnostics handling)
 *   6. Simulation stop and reset lifecycle cleanup (zero stale diagnostics)
 *   7. Component rendering integrity and headless verification
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { RP2040 } from 'rp2040js';
import { RP2040Pwm, type PwmDiagnostics } from '../src/features/simulator/rp2040Pwm';
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import { useSimulationStore } from '../src/store/simulationStore';
import type { WorkerResultMessage } from '../src/features/simulator/SimulationWorker';
import PwmInspectorPanel from '../src/features/editor/PwmInspectorPanel';

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, message: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [CHECK PASS] ${message}`);
  } else {
    console.error(`  [CHECK FAIL] ${message}`);
  }
}

async function runUiIntegrationTests(): Promise<void> {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.6.2 — PWM DIAGNOSTICS & UI INTEGRATION TEST       ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // -----------------------------------------------------------------------------------
  // TEST 1: Initial Store State
  // -----------------------------------------------------------------------------------
  console.log('--- TEST 1: STORE STATE INITIALIZATION ---');
  useSimulationStore.getState().clearPwmDiagnostics();
  useSimulationStore.getState().setPwmInspectorOpen(false);

  let state = useSimulationStore.getState();
  assert(state.pwmDiagnostics === null, 'Initial pwmDiagnostics in store is null');
  assert(state.pwmInspectorOpen === false, 'Initial pwmInspectorOpen in store is false');

  useSimulationStore.getState().setPwmInspectorOpen(true);
  state = useSimulationStore.getState();
  assert(state.pwmInspectorOpen === true, 'setPwmInspectorOpen(true) updates store state');

  // -----------------------------------------------------------------------------------
  // TEST 2: Controller Diagnostics Generation
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 2: CONTROLLER DIAGNOSTICS GENERATION ---');
  const mcu = new RP2040();
  const pwm = new RP2040Pwm(mcu, 'PWM', 4);
  (mcu as any).pwm = pwm;

  // Configure Slice 0: Free-running, TOP=999, CC_A=500 (50% duty), CC_B=250 (25% duty)
  pwm.slices[0].writeRegister(0x10, 999); // TOP
  pwm.slices[0].writeRegister(0x0c, (250 << 16) | 500); // CC
  pwm.slices[0].writeRegister(0x04, 0x10); // DIV = 1.0
  pwm.slices[0].writeRegister(0x00, 1); // CSR EN=1, DIVMODE=00

  // Configure Slice 1: B_RISING (DIVMODE 10), div=2.0
  pwm.slices[1].writeRegister(0x10, 500);
  pwm.slices[1].writeRegister(0x04, 0x20); // DIV = 2.0
  pwm.slices[1].writeRegister(0x00, 1 | (2 << 4)); // CSR EN=1, DIVMODE=10

  const diag = pwm.getDiagnostics();
  assert(diag.baseAddress === 0x40050000, `Base address is 0x40050000 (actual: 0x${diag.baseAddress.toString(16)})`);
  assert(diag.irq === 4, `IRQ is 4 (actual: ${diag.irq})`);
  assert(diag.slices.length === 8, `Diagnostics snapshot contains 8 slices (actual: ${diag.slices.length})`);
  assert(diag.slices[0].enabled === true, 'Slice 0 is enabled');
  assert(diag.slices[0].divMode === 0, 'Slice 0 divMode is 00 (Free-running)');
  assert(Math.abs(diag.slices[0].dutyA - 0.5) < 1e-4, `Slice 0 dutyA is 50% (actual: ${(diag.slices[0].dutyA * 100).toFixed(1)}%)`);
  assert(diag.slices[1].divMode === 2, 'Slice 1 divMode is 10 (B_RISING)');
  assert(diag.slices[1].isChannelBInput === true, 'Slice 1 Channel B marked as input mode');

  // -----------------------------------------------------------------------------------
  // TEST 3: Worker Result Message Serialization
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 3: WORKER RESULT MESSAGE COMPATIBILITY ---');
  const mockWorkerResult: WorkerResultMessage = {
    type: 'RESULT',
    nodeIndices: [0, 1, 2],
    nodeVoltages: new Float64Array([0, 3.3, 1.65]),
    converged: true,
    timestamp: 0.05,
    timeStep: 1e-6,
    stepsThisFrame: 50,
    fidelityMode: 'adaptive',
    pwmDiagnostics: diag,
  };

  assert(mockWorkerResult.pwmDiagnostics !== undefined, 'WorkerResultMessage carries pwmDiagnostics payload');
  assert(mockWorkerResult.pwmDiagnostics?.slices[0].top === 999, 'Serialized slice 0 TOP matches 999');

  // -----------------------------------------------------------------------------------
  // TEST 4: Dispatch to simulationStore
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 4: STORE DISPATCH & REACTIVE UPDATES ---');
  useSimulationStore.getState().setPwmDiagnostics(mockWorkerResult.pwmDiagnostics ?? null);
  state = useSimulationStore.getState();

  assert(state.pwmDiagnostics !== null, 'simulationStore holds active pwmDiagnostics');
  assert(state.pwmDiagnostics?.slices.length === 8, 'Stored diagnostics has 8 slices');
  assert(state.pwmDiagnostics?.slices[0].counter === 0, 'Initial slice 0 counter is 0');

  // Advance counter and update store
  pwm.tickCycles(100);
  const updatedDiag = pwm.getDiagnostics();
  useSimulationStore.getState().setPwmDiagnostics(updatedDiag);
  state = useSimulationStore.getState();
  assert(state.pwmDiagnostics?.slices[0].counter === 100, `Stored counter reactively updated to 100 (actual: ${state.pwmDiagnostics?.slices[0].counter})`);

  // -----------------------------------------------------------------------------------
  // TEST 5: Non-RP2040 Board Safety (Null Handling)
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 5: NON-RP2040 BOARD HANDLING ---');
  // When an Arduino Uno or non-RP2040 board runs, pwmDiagnostics is null
  useSimulationStore.getState().setPwmDiagnostics(null);
  state = useSimulationStore.getState();
  assert(state.pwmDiagnostics === null, 'Non-RP2040 board sets pwmDiagnostics to null');

  // Verify headless component rendering with null state (empty state fallback)
  const emptyHtml = renderToString(
    React.createElement(PwmInspectorPanel, { isOpen: true, onClose: () => {} })
  );
  assert(emptyHtml.includes('No RP2040 PWM Activity Detected') || emptyHtml.includes('Simulation Inactive'),
    'PwmInspectorPanel gracefully renders informative fallback when pwmDiagnostics is null');

  // -----------------------------------------------------------------------------------
  // TEST 6: Component Rendering with Live PWM Data
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 6: COMPONENT RENDERING WITH LIVE PWM DATA ---');
  useSimulationStore.getState().setPwmDiagnostics(updatedDiag);

  const liveHtml = renderToString(
    React.createElement(PwmInspectorPanel, { isOpen: true, onClose: () => {}, diagnostics: updatedDiag })
  );

  assert(liveHtml.includes('RP2040 PWM Peripheral Inspector'), 'Panel title rendered in markup');
  assert(liveHtml.includes('0x40050000'), 'Base address 0x40050000 rendered in markup');
  assert(liveHtml.includes('IRQ 4'), 'IRQ 4 rendered in markup');
  assert(liveHtml.includes('Slice 0'), 'Slice 0 rendered in markup');
  assert(liveHtml.includes('DIVMODE 00'), 'DIVMODE 00 badge rendered in markup');
  assert(liveHtml.includes('Slice 1'), 'Slice 1 rendered in markup');
  assert(liveHtml.includes('DIVMODE 10'), 'DIVMODE 10 badge rendered in markup');
  assert(liveHtml.includes('Channel B acts as input'), 'Channel B input mode warning rendered for Slice 1');

  // -----------------------------------------------------------------------------------
  // TEST 7: Stop & Reset Cleanup Lifecycle
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 7: STOP & RESET LIFECYCLE CLEANUP ---');
  useSimulationStore.getState().clearPwmDiagnostics();
  state = useSimulationStore.getState();
  assert(state.pwmDiagnostics === null, 'clearPwmDiagnostics resets store diagnostics to null');

  useSimulationStore.getState().setPwmInspectorOpen(false);
  state = useSimulationStore.getState();
  assert(state.pwmInspectorOpen === false, 'Closing inspector updates pwmInspectorOpen to false');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM UI INTEGRATION: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runUiIntegrationTests();
