/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.5.5: GPIO AGGREGATE CURRENT DIAGNOSTIC INTEGRATION TEST
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies end-to-end integration and lifecycle behavior of GPIO/QSPI aggregate current
 * diagnostics:
 * 1. Normal operating current below warning threshold.
 * 2. Sourcing threshold crossing (> 50 mA) with multiple pads.
 * 3. Sinking threshold crossing (> 50 mA) with multiple pads.
 * 4. GPIO plus QSPI current aggregation without double-counting.
 * 5. Dynamic warning clearance upon load removal / recovery.
 * 6. Controller lifecycle: snapshot exposure, reset reinitialization, and stop teardown.
 * 7. Electrical solver invariance: no artificial current clamping or matrix manipulation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RP2040 } from 'rp2040js';
import { RP2040GpioBridge } from '../src/features/simulator/rp2040GpioBridge';
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';

const FUNCTION_SIO = 5;

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

function configurePinAsOutput(
  mcu: RP2040,
  bridge: RP2040GpioBridge,
  pinIndex: number,
  outputHigh: boolean,
  driveStrength: number = 3 // 12 mA default
): void {
  const p = mcu.gpio[pinIndex];
  p.ctrl = (p.ctrl & ~0x1f) | FUNCTION_SIO;
  (p as any).padValue = ((p as any).padValue & ~(0x3 << 4)) | ((driveStrength & 0x3) << 4);
  mcu.sio.gpioOutputEnable |= (1 << pinIndex);
  if (outputHigh) {
    mcu.sio.gpioValue |= (1 << pinIndex);
  } else {
    mcu.sio.gpioValue &= ~(1 << pinIndex);
  }
  bridge.recomputeDriverState(pinIndex);
}

function runIntegrationTests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5.5 — GPIO AGGREGATE DIAGNOSTICS INTEGRATION     ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: NORMAL CURRENT BELOW WARNING THRESHOLD
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: NORMAL CURRENT BELOW WARNING THRESHOLD ---');
  const rp2040_1 = new RP2040();
  const bridge1 = new RP2040GpioBridge(rp2040_1, 'pico_0', 3.3);

  // Configure 2 pins (GP0, GP1) as Output HIGH with 12 mA drive (17 Ω)
  configurePinAsOutput(rp2040_1, bridge1, 0, true, 3);
  configurePinAsOutput(rp2040_1, bridge1, 1, true, 3);

  // Two pins sourcing 10 mA each (total 20 mA < 50 mA limit)
  // V_node = 3.3 - 0.010 * 17 = 3.13 V
  bridge1.updateFromMnaResult(
    [0, 3.13, 3.13],
    new Map([[0, 1], [1, 2]])
  );

  const diag1 = bridge1.getAggregateDiagnostics();
  assert(Math.abs(diag1.totalSourcingCurrent_A - 0.020) < 1e-4, 'Total sourcing current is 20.0 mA');
  assert(diag1.totalSinkingCurrent_A === 0, 'Total sinking current is 0.0 mA');
  assert(diag1.isBankSourcingOvercurrent === false, 'Bank sourcing overcurrent warning is FALSE');
  assert(diag1.isBankSinkingOvercurrent === false, 'Bank sinking overcurrent warning is FALSE');
  assert(diag1.overcurrentPins.length === 0, 'Zero pins exceed per-pin policy limit');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSourcing === false, 'Pin 0 bank sourcing fault is FALSE');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSinking === false, 'Pin 0 bank sinking fault is FALSE');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: SOURCING THRESHOLD CROSSING (> 50 mA) WITH MULTIPLE PADS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: SOURCING THRESHOLD CROSSING (> 50 mA) ---');
  // Configure 5 pins (GP0..GP4) as Output HIGH
  for (let i = 0; i < 5; i++) {
    configurePinAsOutput(rp2040_1, bridge1, i, true, 3);
  }

  // 5 pins drawing 11.11 mA each = 55.55 mA (each below 16 mA pin limit, sum > 50 mA bank limit)
  // V_node = 3.3 - 0.01111 * 17 = 3.11113 V
  const vSource = 3.3 - (0.01111 * 17);
  bridge1.updateFromMnaResult(
    [0, vSource, vSource, vSource, vSource, vSource],
    new Map([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]])
  );

  const diag2 = bridge1.getAggregateDiagnostics();
  assert(Math.abs(diag2.totalSourcingCurrent_A - 0.05555) < 1e-4, 'Total sourcing current is ~55.55 mA');
  assert(diag2.isBankSourcingOvercurrent === true, 'Bank sourcing overcurrent warning is TRUE (> 50 mA)');
  assert(diag2.isBankSinkingOvercurrent === false, 'Bank sinking overcurrent warning remains FALSE');
  assert(diag2.overcurrentPins.length === 0, 'Zero pins exceed per-pin 16 mA policy (each 11.11 mA)');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSourcing === true, 'Pin 0 reflects bank sourcing fault');
  assert(bridge1.getDriverState(5)?.faults.bankOvercurrentSourcing === true, 'Unused Pin 5 reflects bank sourcing fault');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: SINKING THRESHOLD CROSSING (> 50 mA) WITH MULTIPLE PADS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: SINKING THRESHOLD CROSSING (> 50 mA) ---');
  // Configure 5 pins (GP0..GP4) as Output LOW
  for (let i = 0; i < 5; i++) {
    configurePinAsOutput(rp2040_1, bridge1, i, false, 3);
  }

  // 5 pins sinking 11.11 mA each = 55.55 mA sinking
  // V_node = 0.0 + 0.01111 * 17 = 0.18887 V
  const vSink = 0.01111 * 17;
  bridge1.updateFromMnaResult(
    [0, vSink, vSink, vSink, vSink, vSink],
    new Map([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]])
  );

  const diag3 = bridge1.getAggregateDiagnostics();
  assert(Math.abs(diag3.totalSinkingCurrent_A - 0.05555) < 1e-4, 'Total sinking current is ~55.55 mA');
  assert(diag3.totalSourcingCurrent_A === 0, 'Total sourcing current is 0.0 mA');
  assert(diag3.isBankSinkingOvercurrent === true, 'Bank sinking overcurrent warning is TRUE (> 50 mA)');
  assert(diag3.isBankSourcingOvercurrent === false, 'Bank sourcing overcurrent warning is FALSE');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSinking === true, 'Pin 0 reflects bank sinking fault');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSourcing === false, 'Pin 0 bank sourcing fault is FALSE');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: GPIO PLUS QSPI CURRENT AGGREGATION WITHOUT DOUBLE-COUNTING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: GPIO PLUS QSPI CURRENT AGGREGATION ---');
  // Configure 2 GPIO pins sourcing 15 mA each = 30 mA
  configurePinAsOutput(rp2040_1, bridge1, 0, true, 3);
  configurePinAsOutput(rp2040_1, bridge1, 1, true, 3);
  // Clear other pins to inputs
  for (let i = 2; i < 5; i++) {
    rp2040_1.sio.gpioOutputEnable &= ~(1 << i);
    bridge1.recomputeDriverState(i);
  }

  const v30 = 3.3 - (0.015 * 17);
  bridge1.updateFromMnaResult(
    [0, v30, v30],
    new Map([[0, 1], [1, 2]])
  );

  // Set 25 mA total on QSPI
  bridge1.updateQspiCurrent(0, 0.0125);
  bridge1.updateQspiCurrent(1, 0.0125);

  const diag4 = bridge1.getAggregateDiagnostics();
  assert(Math.abs(diag4.gpioSourcingCurrent_A - 0.030) < 1e-4, 'GPIO sourcing current is 30.0 mA');
  assert(Math.abs(diag4.qspiSourcingCurrent_A - 0.025) < 1e-4, 'QSPI sourcing current is 25.0 mA');
  assert(Math.abs(diag4.totalSourcingCurrent_A - 0.055) < 1e-4, 'Total aggregate sourcing current is 55.0 mA');
  assert(diag4.isBankSourcingOvercurrent === true, 'Aggregate warning asserted with combined GPIO + QSPI');
  assert(diag4.isBankSinkingOvercurrent === false, 'Sinking warning is FALSE');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: DYNAMIC RECOVERY AFTER LOAD REMOVAL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: DYNAMIC RECOVERY AFTER LOAD REMOVAL ---');
  // Clear QSPI and set GPIO voltage to open-circuit (3.3V, 0A)
  bridge1.updateQspiCurrent(0, 0);
  bridge1.updateQspiCurrent(1, 0);
  bridge1.updateFromMnaResult(
    [0, 3.30, 3.30],
    new Map([[0, 1], [1, 2]])
  );

  const diag5 = bridge1.getAggregateDiagnostics();
  assert(diag5.totalSourcingCurrent_A === 0, 'Total sourcing current recovered to 0.0 mA');
  assert(diag5.totalSinkingCurrent_A === 0, 'Total sinking current recovered to 0.0 mA');
  assert(diag5.isBankSourcingOvercurrent === false, 'Bank sourcing warning automatically cleared');
  assert(diag5.isBankSinkingOvercurrent === false, 'Bank sinking warning automatically cleared');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSourcing === false, 'Pin 0 fault flag cleared');
  assert(bridge1.getDriverState(0)?.faults.bankOvercurrentSinking === false, 'Pin 0 fault flag cleared');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: CONTROLLER SNAPSHOT, RESET & STOP LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: CONTROLLER SNAPSHOT, RESET & STOP LIFECYCLE ---');
  const controller = new RP2040Controller();
  const fixturePath = path.resolve(process.cwd(), 'src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const uf2Bytes = new Uint8Array(fs.readFileSync(fixturePath));
  const loadRes = controller.loadFirmware(uf2Bytes);
  assert(loadRes.success === true, 'Controller successfully loaded authentic Pico UF2 firmware');

  const bridgeCtrl = controller.getGpioBridge();
  const mcuCtrl = controller.getRp2040Instance();
  assert(bridgeCtrl !== null, 'Controller instantiates GPIO bridge on firmware load');
  assert(mcuCtrl !== null, 'Controller instantiates RP2040 MCU instance');

  const initialDiag = controller.getGpioDiagnostics();
  assert(initialDiag !== undefined, 'controller.getGpioDiagnostics() returns diagnostic object');
  assert(initialDiag?.totalSourcingCurrent_A === 0, 'Initial sourcing current is 0');
  assert(initialDiag?.isBankSourcingOvercurrent === false, 'Initial sourcing overcurrent is false');

  if (mcuCtrl && bridgeCtrl) {
    // Configure GP0 as output HIGH with 12 mA drive
    configurePinAsOutput(mcuCtrl, bridgeCtrl, 0, true, 3);
    // Connect to 100 Ω overload (28.2 mA)
    const vOverload = 3.3 - (0.028205 * 17);
    // Set bank limit to 20 mA so 28.2 mA triggers bank overcurrent
    bridgeCtrl.setBankCurrentLimit_A(0.020);
    bridgeCtrl.updateFromMnaResult([0, vOverload], new Map([[0, 1]]));
  }

  const triggeredDiag = controller.getGpioDiagnostics();
  assert(triggeredDiag?.isBankSourcingOvercurrent === true, 'controller.getGpioDiagnostics() reports overcurrent');

  const snapshot = controller.getExecutionSnapshot();
  assert(snapshot.gpioDiagnostics !== undefined, 'Snapshot contains gpioDiagnostics');
  assert(snapshot.gpioDiagnostics?.isBankSourcingOvercurrent === true, 'Snapshot gpioDiagnostics reflects overcurrent');
  assert(Math.abs((snapshot.gpioDiagnostics?.totalSourcingCurrent_A ?? 0) - 0.0282) < 0.001, 'Snapshot reflects 28.2 mA sourcing current');

  // Execute controller reset
  controller.reset();
  const resetDiag = controller.getGpioDiagnostics();
  assert(resetDiag !== undefined, 'Post-reset diagnostic object is valid');
  assert(resetDiag?.totalSourcingCurrent_A === 0, 'Post-reset sourcing current reinitialized to 0.0 mA');
  assert(resetDiag?.isBankSourcingOvercurrent === false, 'Post-reset overcurrent warning cleared');

  // Execute controller stop / teardown
  controller.stop();
  const stoppedDiag = controller.getGpioDiagnostics();
  const stoppedBridge = controller.getGpioBridge();
  assert(stoppedDiag === undefined, 'Stopped controller returns undefined for gpioDiagnostics');
  assert(stoppedBridge === null, 'Stopped controller sets gpioBridge to null (no stale leak)');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: ELECTRICAL SOLVER INVARIANCE (NO ARTIFICIAL CLAMPING)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: ELECTRICAL SOLVER INVARIANCE ---');
  const rp2040_7 = new RP2040();
  const bridge7 = new RP2040GpioBridge(rp2040_7, 'pico_0', 3.3);

  configurePinAsOutput(rp2040_7, bridge7, 0, true, 3);

  // Apply heavy 100 Ω overload: linear current is 3.3 / (100 + 17) = 28.205 mA
  const overloadCurrent = 3.3 / (100 + 17); // 0.028205 A
  const expectedDropVoltage = 3.3 - (overloadCurrent * 17); // 2.8205 V

  bridge7.updateFromMnaResult([0, expectedDropVoltage], new Map([[0, 1]]));

  const state0 = bridge7.getDriverState(0);
  assert(state0 !== null, 'Driver state 0 exists');
  assert(Math.abs((state0?.measuredCurrent_A ?? 0) - overloadCurrent) < 1e-4, 'Current is NOT clamped (measured at 28.21 mA)');
  assert(Math.abs((state0?.measuredVoltage_V ?? 0) - expectedDropVoltage) < 1e-4, 'Voltage is NOT altered by warning flag');
  assert(state0?.faults.overcurrent === true, 'Per-pin overcurrent warning is set as diagnostic monitor');

  // Confirm configurable thresholds
  bridge7.setBankCurrentLimit_A(0.020); // Configure bank limit down to 20 mA
  assert(bridge7.getBankCurrentLimit_A() === 0.020, 'setBankCurrentLimit_A updates warning threshold to 20 mA');

  bridge7.updateFromMnaResult([0, expectedDropVoltage], new Map([[0, 1]]));
  const diag7 = bridge7.getAggregateDiagnostics();
  assert(diag7.bankCurrentLimit_A === 0.020, 'Diagnostics reflect dynamically configured limit');
  assert(diag7.isBankSourcingOvercurrent === true, '28.21 mA triggers configured 20 mA limit');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   GPIO AGGREGATE DIAGNOSTICS: ${passedChecks}/${totalChecks} CHECKS PASSED (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runIntegrationTests();
