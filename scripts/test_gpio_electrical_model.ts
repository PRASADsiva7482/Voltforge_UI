/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 GPIO Electrical Model & Datasheet Conformance Test
 * Phase 4.3.5.2 Audit 2
 * 
 * Verifies:
 * 1. Relationship between PADS_BANK0 DRIVE settings and electrical source impedance.
 * 2. Distinguishes small-signal linear typical Ron from guaranteed limit conditions.
 * 3. Mathematical audit of the 100 Ω overload calculation (linear stamp vs physical saturation).
 * 4. Realistic load testing within rated current boundaries (overcurrent false, drop < 0.4V).
 * 5. Distinct behavior across Pull-Up, Pull-Down, Dual-Pull divider, High-Z, and Schmitt input.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040GpioBridge,
  FUNCTION_SIO,
} from '../src/features/simulator/rp2040GpioBridge';

let passedChecks = 0;
let totalChecks = 0;

function assertCheck(condition: boolean, message: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [CHECK PASS] ${message}`);
  } else {
    console.error(`  [CHECK FAIL] ${message}`);
    process.exit(1);
  }
}

function runGpioElectricalTests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5.2 — GPIO ELECTRICAL MODEL CONFORMANCE TEST     ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const mcu = new RP2040();
  const bridge = new RP2040GpioBridge(mcu, 'pico_0', 3.3);

  // ─── Test 1: DRIVE Settings vs Source Impedance ─────────────────────────────────
  console.log('--- TEST 1: PADS_BANK0 DRIVE SETTINGS & TYPICAL SOURCE IMPEDANCES ---');
  const d0 = RP2040GpioBridge.driveStrengthToImpedance(0); // 2 mA
  const d1 = RP2040GpioBridge.driveStrengthToImpedance(1); // 4 mA (default)
  const d2 = RP2040GpioBridge.driveStrengthToImpedance(2); // 8 mA
  const d3 = RP2040GpioBridge.driveStrengthToImpedance(3); // 12 mA

  assertCheck(d0.mA === 2 && d0.resistance === 100, 'DRIVE 0 (2 mA): Ron = 100 Ω typical');
  assertCheck(d1.mA === 4 && d1.resistance === 50, 'DRIVE 1 (4 mA): Ron = 50 Ω typical');
  assertCheck(d2.mA === 8 && d2.resistance === 25, 'DRIVE 2 (8 mA): Ron = 25 Ω typical');
  assertCheck(d3.mA === 12 && d3.resistance === 17, 'DRIVE 3 (12 mA): Ron = 17 Ω typical');

  // ─── Test 2: Datasheet Guaranteed Limits vs. Chord Resistance ──────────────────
  console.log('\n--- TEST 2: DATASHEET GUARANTEED LIMITS (VOL/VOH AT RATED CURRENT) ---');
  // Datasheet Table 628 specifies max voltage drop ΔV <= 0.4V at rated current across PVT
  // This defines the guaranteed MAXIMUM chord resistance R_chord_max = 0.4V / I_rated
  const maxChord2mA = 0.4 / 0.002;   // 200 Ω
  const maxChord4mA = 0.4 / 0.004;   // 100 Ω
  const maxChord8mA = 0.4 / 0.008;   // 50 Ω
  const maxChord12mA = 0.4 / 0.012;  // 33.3 Ω

  assertCheck(d0.resistance < maxChord2mA, `2mA typical Ron (100 Ω) is below guaranteed max chord limit (${maxChord2mA} Ω)`);
  assertCheck(d1.resistance < maxChord4mA, `4mA typical Ron (50 Ω) is below guaranteed max chord limit (${maxChord4mA} Ω)`);
  assertCheck(d2.resistance < maxChord8mA, `8mA typical Ron (25 Ω) is below guaranteed max chord limit (${maxChord8mA} Ω)`);
  assertCheck(d3.resistance < maxChord12mA, `12mA typical Ron (17 Ω) is below guaranteed max chord limit (${maxChord12mA.toFixed(1)} Ω)`);

  // ─── Test 3: Mathematical Inconsistency of 100 Ω Overload Example ───────────────
  console.log('\n--- TEST 3: RECALCULATION & AUDIT OF 100 Ω OVERLOAD CONDITION ---');
  // At 12mA drive, linear divider with 100 Ω load predicts:
  // I = 3.3V / (17 + 100) = 28.2 mA
  // V_node = 3.3 * (100 / 117) = 2.82 V
  const linearI_mA = (3.3 / (17 + 100)) * 1000;
  assertCheck(Math.abs(linearI_mA - 28.205) < 0.01, `Linear calculation yields ${linearI_mA.toFixed(2)} mA`);

  // Verify that 28.2 mA violates physical silicon constraints:
  assertCheck(linearI_mA > 16.0, 'Linear current (28.2 mA) exceeds RP2040 absolute maximum rating of 16 mA');
  assertCheck(linearI_mA > 12.0 * 2.0, 'Linear current (28.2 mA) is more than 2x the programmed 12 mA drive rating');

  // Verify bridge safety fault detection under this condition
  const pin0 = mcu.gpio[0];
  pin0.ctrl = (pin0.ctrl & ~0x1f) | FUNCTION_SIO;
  (pin0 as any).padValue = ((pin0 as any).padValue & ~(0x3 << 4)) | (3 << 4); // 12 mA drive
  mcu.sio.gpioOutputEnable |= (1 << 0);
  mcu.sio.gpioValue |= (1 << 0);
  bridge.recomputeDriverState(0);

  // Pass solved MNA voltage of 2.82V for 100 Ω load
  bridge.updateFromMnaResult([0, 2.8205], new Map([[0, 1]]));
  const driverState = bridge.getDriverState(0);
  assertCheck(driverState.faults.overcurrent === true, 'Bridge correctly flags overcurrent fault (I > 16 mA)');
  assertCheck(Math.abs(driverState.measuredCurrent_A * 1000 - 28.2) < 0.5, 'Bridge current measurement is mathematically consistent at 28.2 mA');

  // ─── Test 4: Realistic Loads & 242/258/330 Ω Boundary Calculations ───────────
  console.log('\n--- TEST 4: REALISTIC LOADS & 242/258/330 Ω BOUNDARY CALCULATIONS ---');
  // At 12 mA drive setting (Ron = 17 Ω in linear Thevenin model, Vdd = 3.3 V):
  // 1. 242 Ω load:
  // I = 3.3 / (17 + 242) = 12.741 mA (> 12 mA rated drive, +6.2% excess)
  const I_242_mA = (3.3 / (17 + 242)) * 1000;
  assertCheck(Math.abs(I_242_mA - 12.741) < 0.01, `242 Ω linear model: I = ${I_242_mA.toFixed(2)} mA (exceeds 12 mA drive rating)`);
  assertCheck(I_242_mA > 12.0, '242 Ω load exceeds 12 mA nominal drive rating in linear model');
  assertCheck(I_242_mA < 16.0, '242 Ω load remains below 16 mA abs max rating (per-pin overcurrent false)');

  // 2. 258 Ω load (Exact 12 mA boundary):
  // R_total = 3.3 / 0.012 = 275 Ω -> R_load = 275 - 17 = 258 Ω
  // I = 3.3 / (17 + 258) = 12.000 mA (Exact rated drive rating!)
  const I_258_mA = (3.3 / (17 + 258)) * 1000;
  assertCheck(Math.abs(I_258_mA - 12.000) < 0.001, `258 Ω linear model: I = ${I_258_mA.toFixed(3)} mA (exact 12.0 mA boundary)`);
  const V_258 = 3.3 * (258 / 275);
  const drop_258 = 3.3 - V_258;
  assertCheck(Math.abs(drop_258 - 0.204) < 0.005, `258 Ω linear drop: ΔV = ${drop_258.toFixed(3)} V <= 0.4 V datasheet limit`);

  // 3. 330 Ω load (Conservative safe load):
  // I = 3.3 / (17 + 330) = 9.510 mA <= 12 mA (Safe)
  const I_330_mA = (3.3 / (17 + 330)) * 1000;
  assertCheck(Math.abs(I_330_mA - 9.510) < 0.01, `330 Ω linear model: I = ${I_330_mA.toFixed(2)} mA (well within 12 mA rating)`);
  const V_330 = 3.3 * (330 / 347);
  assertCheck(3.3 - V_330 <= 0.4, '330 Ω linear drop: ΔV = 0.162 V <= 0.4 V datasheet limit');

  // Verify 258 Ω boundary in MNA bridge solver:
  bridge.updateFromMnaResult([0, V_258], new Map([[0, 1]]));
  const boundaryState = bridge.getDriverState(0)!;
  assertCheck(boundaryState.faults.overcurrent === false, '258 Ω boundary load: overcurrent is false');
  assertCheck(Math.abs(boundaryState.measuredCurrent_A * 1000 - 12.0) < 0.02, '258 Ω boundary load: measured current is 12.00 mA');

  // ─── Test 5: Distinct Pad Electrical Modes ─────────────────────────────────────
  console.log('\n--- TEST 5: DISTINCT PAD ELECTRICAL MODES (PULL-UP, PULL-DOWN, HIGH-Z) ---');
  const pin1 = mcu.gpio[1];
  pin1.ctrl = (pin1.ctrl & ~0x1f) | FUNCTION_SIO;
  mcu.sio.gpioOutputEnable &= ~(1 << 1); // Input mode

  // 1. Reset / Default State: Pull-Down Active (PDE=1, PUE=0)
  (pin1 as any).padValue = ((pin1 as any).padValue & ~0x0c) | 0x04;
  bridge.recomputeDriverState(1);
  const pdState = bridge.getDriverState(1);
  assertCheck(pdState.electricalTargetVoltage_V === 0.0, 'Pull-down target is 0.0 V');
  assertCheck(pdState.driverImpedance_Ohms === 50000, 'Pull-down impedance is 50 kΩ');

  // 2. Pull-Up Active (PUE=1, PDE=0)
  (pin1 as any).padValue = ((pin1 as any).padValue & ~0x0c) | 0x08;
  bridge.recomputeDriverState(1);
  const puState = bridge.getDriverState(1);
  assertCheck(puState.electricalTargetVoltage_V === 3.3, 'Pull-up target is 3.3 V');
  assertCheck(puState.driverImpedance_Ohms === 50000, 'Pull-up impedance is 50 kΩ');

  // 3. Dual Pulls Active Simultaneously (PUE=1, PDE=1) -> 1:1 Divider
  (pin1 as any).padValue = (pin1 as any).padValue | 0x0c;
  bridge.recomputeDriverState(1);
  const dualState = bridge.getDriverState(1);
  assertCheck(dualState.electricalTargetVoltage_V === 1.65, 'Dual pulls form Thevenin voltage divider Vth = 1.65 V');
  assertCheck(dualState.driverImpedance_Ohms === 25000, 'Dual pulls form Thevenin resistance Rth = 25 kΩ');

  // 4. Pure High-Z (PUE=0, PDE=0)
  (pin1 as any).padValue = (pin1 as any).padValue & ~0x0c;
  bridge.recomputeDriverState(1);
  const hizState = bridge.getDriverState(1);
  assertCheck(hizState.electricalTargetVoltage_V === 0.0, 'High-Z target is 0.0 V');
  assertCheck(hizState.driverImpedance_Ohms === 100000000, 'High-Z impedance is 100 MΩ');

  // 5. Schmitt Trigger Input Thresholds (Schmitt=1, InputEnable=1)
  (pin1 as any).padValue = (pin1 as any).padValue | 0x02 | 0x40; // Bit 1 = SCHMITT, Bit 6 = IE
  bridge.recomputeDriverState(1);
  bridge.updateFromMnaResult([0, 0, 1.60], new Map([[1, 2]])); // 1.60V >= 1.55V (Vt+)
  assertCheck(bridge.getDriverState(1).logicalInput === true, 'Schmitt input triggers HIGH at 1.60 V (Vt+ threshold)');
  bridge.updateFromMnaResult([0, 0, 1.35], new Map([[1, 2]])); // 1.35V inside hysteresis window
  assertCheck(bridge.getDriverState(1).logicalInput === true, 'Schmitt retains HIGH in hysteresis window (1.35 V)');
  bridge.updateFromMnaResult([0, 0, 1.00], new Map([[1, 2]])); // 1.00V <= 1.15V (Vt-)
  assertCheck(bridge.getDriverState(1).logicalInput === false, 'Schmitt input triggers LOW at 1.00 V (Vt- threshold)');

  // ─── Test 6: Source (Output-High) vs Sink (Output-Low) Model Separation ─────────
  console.log('\n--- TEST 6: SOURCE (OUTPUT-HIGH) VS SINK (OUTPUT-LOW) MODEL BEHAVIOR ---');
  // Sourcing logic HIGH into 258 Ω load to GND:
  pin0.ctrl = (pin0.ctrl & ~0x1f) | FUNCTION_SIO;
  (pin0 as any).padValue = ((pin0 as any).padValue & ~(0x3 << 4)) | (3 << 4); // 12 mA drive
  mcu.sio.gpioOutputEnable |= (1 << 0);
  mcu.sio.gpioValue |= (1 << 0); // Output HIGH (Sourcing)
  bridge.recomputeDriverState(0);
  const srcState = bridge.getDriverState(0)!;
  assertCheck(srcState.electricalTargetVoltage_V === 3.3, 'Sourcing target voltage is 3.3 V (IOVDD rail)');
  assertCheck(srcState.driverImpedance_Ohms === 17, 'Sourcing driver impedance is 17 Ω (linear approximation)');
  bridge.updateFromMnaResult([0, V_258], new Map([[0, 1]]));
  assertCheck(bridge.getDriverState(0)!.measuredCurrent_A > 0, 'Current is positive (sourcing current OUT of pin)');
  assertCheck(Math.abs(bridge.getDriverState(0)!.measuredCurrent_A * 1000 - 12.0) < 0.02, 'Sourcing current is 12.00 mA');

  // Sinking logic LOW from 258 Ω pull-up to 3.3 V:
  mcu.sio.gpioValue &= ~(1 << 0); // Output LOW (Sinking)
  bridge.recomputeDriverState(0);
  const snkState = bridge.getDriverState(0)!;
  assertCheck(snkState.electricalTargetVoltage_V === 0.0, 'Sinking target voltage is 0.0 V (IOVSS rail)');
  assertCheck(snkState.driverImpedance_Ohms === 17, 'Sinking driver impedance is 17 Ω (symmetric linear approximation)');
  // Pull-up of 258 Ω from 3.3V to 17 Ω to GND produces node voltage:
  // V_node = 3.3 * (17 / 275) = 0.204 V
  bridge.updateFromMnaResult([0, 0.204], new Map([[0, 1]]));
  assertCheck(bridge.getDriverState(0)!.measuredCurrent_A < 0, 'Current is negative (sinking current INTO pin)');
  assertCheck(Math.abs(Math.abs(bridge.getDriverState(0)!.measuredCurrent_A * 1000) - 12.0) < 0.02, 'Sinking current magnitude is 12.00 mA');
  assertCheck(bridge.getDriverState(0)!.measuredVoltage_V <= 0.4, 'Sinking voltage (0.204 V) satisfies VOL <= 0.4 V datasheet limit');
  assertCheck(bridge.getDriverState(0)!.faults.overcurrent === false, 'Sinking 12.0 mA: overcurrent is false');

  // ─── Test 7: Per-Pin & Aggregate IOVDD/IOVSS Current Diagnostics ──────────────
  console.log('\n--- TEST 7: PER-PIN & AGGREGATE IOVDD/IOVSS CURRENT DIAGNOSTICS ---');
  // Configure 5 pins (GP0..GP4) as SIO outputs sourcing current
  for (let i = 0; i < 5; i++) {
    const p = mcu.gpio[i];
    p.ctrl = (p.ctrl & ~0x1f) | FUNCTION_SIO;
    (p as any).padValue = ((p as any).padValue & ~(0x3 << 4)) | (3 << 4); // 12 mA drive
    mcu.sio.gpioOutputEnable |= (1 << i);
    mcu.sio.gpioValue |= (1 << i); // Output HIGH
    bridge.recomputeDriverState(i);
  }

  // 1. Sourcing Overload Condition:
  // Each pin draws 11 mA (below 16 mA per-pin limit, but total = 5 * 11 = 55 mA > 50 mA bank limit)
  // V_node = 3.3 - 0.011 * 17 = 3.113 V
  bridge.updateFromMnaResult(
    [0, 3.113, 3.113, 3.113, 3.113, 3.113],
    new Map([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]])
  );
  const diagSource = bridge.getAggregateDiagnostics();
  assertCheck(diagSource.totalSourcingCurrent_A >= 0.054 && diagSource.totalSourcingCurrent_A <= 0.056, 'Aggregate sourcing current correctly calculated ~55 mA');
  assertCheck(diagSource.isBankSourcingOvercurrent === true, 'Aggregate sourcing overcurrent warning asserted (> 50 mA limit)');
  assertCheck(diagSource.isBankSinkingOvercurrent === false, 'Aggregate sinking overcurrent warning is false');
  assertCheck(diagSource.overcurrentPins.length === 0, 'Per-pin overcurrent is false on all pins (each 11 mA <= 16 mA policy)');
  assertCheck(bridge.getDriverState(0)!.faults.bankOvercurrentSourcing === true, 'Pin 0 flags bankOvercurrentSourcing warning');
  assertCheck(bridge.getDriverState(0)!.faults.perPinOvercurrentPolicy === false, 'Pin 0 per-pin overcurrent policy is false');

  // 2. Sinking Overload Condition:
  // Set all 5 pins to Output LOW sinking 11 mA each (Total sinking = 55 mA > 50 mA bank limit)
  for (let i = 0; i < 5; i++) {
    mcu.sio.gpioValue &= ~(1 << i); // Output LOW
    bridge.recomputeDriverState(i);
  }
  // V_node = 0.011 * 17 = 0.187 V
  bridge.updateFromMnaResult(
    [0, 0.187, 0.187, 0.187, 0.187, 0.187],
    new Map([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]])
  );
  const diagSink = bridge.getAggregateDiagnostics();
  assertCheck(diagSink.totalSinkingCurrent_A >= 0.054 && diagSink.totalSinkingCurrent_A <= 0.056, 'Aggregate sinking current correctly calculated ~55 mA');
  assertCheck(diagSink.isBankSinkingOvercurrent === true, 'Aggregate sinking overcurrent warning asserted (> 50 mA limit)');
  assertCheck(diagSink.isBankSourcingOvercurrent === false, 'Aggregate sourcing overcurrent warning is false');
  assertCheck(bridge.getDriverState(0)!.faults.bankOvercurrentSinking === true, 'Pin 0 flags bankOvercurrentSinking warning');

  // 3. Normal Safe Aggregate Load:
  // Disconnect pins 2..4 (set node voltage to 0.0V with output LOW -> 0 mA), only pins 0 and 1 sink 11 mA (Total = 22 mA <= 50 mA)
  bridge.updateFromMnaResult(
    [0, 0.187, 0.187, 0.0, 0.0, 0.0],
    new Map([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]])
  );
  const diagSafe = bridge.getAggregateDiagnostics();
  assertCheck(diagSafe.totalSinkingCurrent_A <= 0.025, 'Normal aggregate sinking current is ~22 mA');
  assertCheck(diagSafe.isBankSinkingOvercurrent === false, 'Bank sinking overcurrent warning cleared');
  assertCheck(bridge.getDriverState(0)!.faults.bankOvercurrentSinking === false, 'Pin 0 bank sinking overcurrent warning cleared');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   GPIO ELECTRICAL MODEL TEST: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runGpioElectricalTests();
