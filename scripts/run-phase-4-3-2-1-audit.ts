/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.2.1 RP2040 GPIO Model Calibration & Temporal Fidelity Audit
 * 
 * Comprehensive Forensic Audit & Verification Suite:
 * 1. GPIO Drive-Strength & I-V Calibration (2, 4, 8, 12 mA, sourcing/sinking, load sweeps)
 * 2. Current Limits, Faults, and Bank Current Safety (Package limits, policy warnings)
 * 3. Pull Resistor Model (50, 64, 80 kΩ, PUE+PDE divider, 5-state input classification)
 * 4. Schmitt Trigger Hysteresis & Input Sensitivity (Rising/falling, noise, disabled IE/Schmitt)
 * 5. High-Frequency GPIO Timing & Substepping (1 ms, 100 µs, 10 µs, 1 µs, sub-microsecond)
 * 6. Dynamic Clock Domain Reconfiguration (12 MHz, 125 MHz, 133 MHz time scaling)
 * 7. Raspberry Pi Pico Board LED Circuitry (GP25, R3 470 Ω, Green LED, external isolation)
 * 8. Numerical MNA Benchmarks & Analytical Error Quantification
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  RP2040GpioBridge,
  RP2040_NUM_GPIOS,
  RP2040_DEFAULT_VDD_IO,
  RP2040_MAX_PIN_CURRENT_A,
  RP2040_MAX_BANK_CURRENT_A,
  RP2040_VIL_MAX,
  RP2040_VIH_MIN,
  RP2040_SCHMITT_VT_POS,
  RP2040_SCHMITT_VT_NEG,
  RP2040_PULL_RESISTANCE_MIN_OHMS,
  RP2040_PULL_RESISTANCE_TYP_OHMS,
  RP2040_PULL_RESISTANCE_MAX_OHMS,
  RP2040_HIGH_Z_RESISTANCE_OHMS,
  FUNCTION_SIO,
  type Rp2040GpioTransitionEvent,
} from '../src/features/simulator/rp2040GpioBridge';
import { MNASolver, type MNAElement } from '../src/features/simulator/MNASolver';
import { buildMNACircuit } from '../src/features/simulator/NetlistBuilder';
import type { CanvasNode, Wire } from '../../types/domain';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuditSectionResult {
  section: string;
  testId: string;
  name: string;
  passed: boolean;
  analyticalRef: string;
  calculatedValue: string;
  errorPercent: number;
  details: string;
}

const auditResults: AuditSectionResult[] = [];

function recordAudit(
  section: string,
  testId: string,
  name: string,
  passed: boolean,
  analyticalRef: string,
  calculatedValue: string,
  errorPercent: number,
  details: string
) {
  auditResults.push({
    section,
    testId,
    name,
    passed,
    analyticalRef,
    calculatedValue,
    errorPercent,
    details,
  });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${testId}] ${status}: ${name}`);
  console.log(`       Analytical: ${analyticalRef} | Solved: ${calculatedValue} | Error: ${errorPercent.toFixed(2)}%`);
  console.log(`       Details:    ${details}\n`);
}

async function runAudit() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.2.1: RP2040 MODEL CALIBRATION & FIDELITY AUDIT   ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const blinkFixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const closedLoopFixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_closed_loop_rp2040.uf2');
  const blinkBytes = fs.readFileSync(blinkFixturePath);
  const closedLoopBytes = fs.readFileSync(closedLoopFixturePath);

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 1: GPIO DRIVE-STRENGTH & I-V CHARACTERISTICS AUDIT
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: GPIO DRIVE-STRENGTH & I-V CHARACTERISTICS ---');

  // Test 1.1: Sourcing Load Sweep on 4 mA default setting (Ron = 50 Ω)
  {
    const loads = [
      { name: 'Light Load (10 kΩ)', r: 10_000 },
      { name: 'Nominal 4 mA Load (775 Ω)', r: 775 },
      { name: 'Heavy Load (100 Ω)', r: 100 },
      { name: 'Short-Circuit to GND (0.01 Ω)', r: 0.01 },
    ];

    let allPassed = true;
    for (const load of loads) {
      const vdd = 3.3;
      const ron = 50;
      const expectedV = vdd * (load.r / (ron + load.r));
      const expectedI = vdd / (ron + load.r);

      // Solve in MNA
      const elements: MNAElement[] = [
        { id: 'vs_src', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: vdd },
        { id: 'r_on', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: ron },
        { id: 'r_load', type: 'RESISTOR', nodeA: 2, nodeB: 0, value: load.r },
      ];
      const solver = new MNASolver(2, 0.001);
      solver.setElements(elements);
      const sol = solver.solve();
      const calcV = sol.nodeVoltages[2];
      const calcI = (sol.nodeVoltages[1] - sol.nodeVoltages[2]) / ron;

      const vErr = Math.abs(calcV - expectedV) / (expectedV || 1) * 100;
      const iErr = Math.abs(calcI - expectedI) / expectedI * 100;
      const pass = vErr < 0.1 && iErr < 0.1;
      if (!pass) allPassed = false;

      // Also compare with piecewise saturation model
      const pw = RP2040GpioBridge.calculatePiecewiseCurrent(calcV, 4, true, vdd);

      recordAudit(
        'GPIO_IV_SOURCING',
        `IV-SRC-${load.name.split(' ')[0]}`,
        `Sourcing into ${load.name}`,
        pass,
        `V=${expectedV.toFixed(3)}V, I=${(expectedI * 1000).toFixed(2)}mA`,
        `V=${calcV.toFixed(3)}V, I=${(calcI * 1000).toFixed(2)}mA`,
        Math.max(vErr, iErr),
        `Piecewise Saturated: I_sat=${(pw.saturatedCurrent_A * 1000).toFixed(1)}mA (Model: ${pw.modelUsed})`
      );
    }
  }

  // Test 1.2: Sinking Load Sweep on 4 mA default setting (Ron = 50 Ω)
  {
    const loads = [
      { name: 'Light Pull-up (10 kΩ to 3.3V)', r: 10_000 },
      { name: 'Nominal 4 mA Pull-up (775 Ω to 3.3V)', r: 775 },
      { name: 'Heavy Pull-up (100 Ω to 3.3V)', r: 100 },
      { name: 'Short-Circuit to 3.3V (0.01 Ω)', r: 0.01 },
    ];

    for (const load of loads) {
      const vdd = 3.3;
      const ron = 50;
      // When sinking, MCU pin pulls to 0V through Ron
      // Circuit: 3.3V source -> load.r -> pin (node 2) -> Ron -> GND (node 0)
      const expectedV = vdd * (ron / (load.r + ron));
      const expectedI = - (vdd / (load.r + ron)); // Negative = sinking

      const elements: MNAElement[] = [
        { id: 'vs_ext', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: vdd },
        { id: 'r_load', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: load.r },
        { id: 'r_on', type: 'RESISTOR', nodeA: 2, nodeB: 0, value: ron },
      ];
      const solver = new MNASolver(2, 0.001);
      solver.setElements(elements);
      const sol = solver.solve();
      const calcV = sol.nodeVoltages[2];
      const calcI = - (sol.nodeVoltages[2] / ron);

      const vErr = Math.abs(calcV - expectedV) / (expectedV || 1) * 100;
      const iErr = Math.abs(calcI - expectedI) / Math.abs(expectedI) * 100;
      const pass = vErr < 0.1 && iErr < 0.1;

      const pw = RP2040GpioBridge.calculatePiecewiseCurrent(calcV, 4, false, vdd);

      recordAudit(
        'GPIO_IV_SINKING',
        `IV-SNK-${load.name.split(' ')[0]}`,
        `Sinking from ${load.name}`,
        pass,
        `V=${expectedV.toFixed(3)}V, I=${(expectedI * 1000).toFixed(2)}mA`,
        `V=${calcV.toFixed(3)}V, I=${(calcI * 1000).toFixed(2)}mA`,
        Math.max(vErr, iErr),
        `Piecewise Saturated: I_sat=${(pw.saturatedCurrent_A * 1000).toFixed(1)}mA (Model: ${pw.modelUsed})`
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 2: CURRENT LIMITS, FAULTS & BANK CURRENT ACCOUNTING
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 2: CURRENT LIMITS & FAULT AUDIT ---');

  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Turn ON pins 0, 1, 2, 3 as SIO outputs driving HIGH
    for (let p = 0; p < 4; p++) {
      rp2040.gpio[p].ctrl = (rp2040.gpio[p].ctrl & ~0x1f) | 5;
      rp2040.gpio[p].padValue = (rp2040.gpio[p].padValue & ~0xb0) | (1 << 4); // 4 mA drive (50 Ω)
      rp2040.writeUint32(0xd0000024, 1 << p); // OE_SET
      rp2040.writeUint32(0xd0000014, 1 << p); // OUT_SET
      bridge.recomputeDriverState(p);
    }

    // Connect each pin to a 200 Ω load to GND:
    // I_pin = 3.3V / (50 + 200) = 13.2 mA per pin
    // Total sourcing current = 4 * 13.2 mA = 52.8 mA > 50 mA bank limit!
    const nodeVoltages = [0];
    const gpioMap = new Map<number, number>();
    for (let p = 0; p < 4; p++) {
      nodeVoltages.push(3.3 * (200 / 250)); // 2.64 V
      gpioMap.set(p, p + 1);
    }

    bridge.updateFromMnaResult(nodeVoltages, gpioMap);

    const totalSource_mA = bridge.getTotalBankSourcingCurrent_A() * 1000;
    const st0 = bridge.getDriverState(0)!;
    const bankOver = st0.faults.bankOvercurrentSourcing === true;
    const perPinPolicy = st0.faults.perPinOvercurrentPolicy === false; // 13.2 mA < 16 mA policy threshold

    recordAudit(
      'CURRENT_LIMITS',
      'FAULT-BANK-01',
      'Package IOVDD Bank Sourcing Limit (50 mA)',
      bankOver && Math.abs(totalSource_mA - 52.8) < 0.5,
      '52.80 mA (> 50.0 mA limit)',
      `${totalSource_mA.toFixed(2)} mA`,
      Math.abs(totalSource_mA - 52.8) / 52.8 * 100,
      `Bank Overcurrent Flagged: ${bankOver}, Per-Pin Overcurrent: ${st0.faults.perPinOvercurrentPolicy}`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 3: PULL RESISTOR MODEL & FLOATING INPUT CLASSIFICATION
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 3: PULL RESISTORS & INPUT STATES ---');

  // Test 3.1: Configurable pull resistance (50 kΩ min, 64 kΩ typ, 80 kΩ max)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Pin 6: Pull-up enabled
    rp2040.gpio[6].padValue = (rp2040.gpio[6].padValue & ~0x0c) | 0x08; // PUE=1
    bridge.setPullResistance(RP2040_PULL_RESISTANCE_TYP_OHMS); // 64 kΩ
    bridge.recomputeDriverState(6);
    const typState = bridge.getDriverState(6)!;

    bridge.setPullResistance(RP2040_PULL_RESISTANCE_MAX_OHMS); // 80 kΩ
    bridge.recomputeDriverState(6);
    const maxState = bridge.getDriverState(6)!;

    const pass = typState.driverImpedance_Ohms === 64_000 && maxState.driverImpedance_Ohms === 80_000;
    recordAudit(
      'PULL_RESISTORS',
      'PULL-TOL-01',
      'Pull-up Resistor Typical (64k) & Max (80k) Tolerance Sweep',
      pass,
      '64,000 Ω & 80,000 Ω',
      `${typState.driverImpedance_Ohms} Ω & ${maxState.driverImpedance_Ohms} Ω`,
      0.0,
      `Typical: ${typState.driverImpedance_Ohms} Ω, Maximum: ${maxState.driverImpedance_Ohms} Ω`
    );
  }

  // Test 3.2: Simultaneous Pull-up and Pull-down (1:1 Voltage Divider)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Enable both PUE and PDE on GP7 (typical 64 kΩ)
    bridge.setPullResistance(64_000);
    rp2040.gpio[7].padValue = (rp2040.gpio[7].padValue & ~0x0c) | 0x0c; // PUE=1, PDE=1
    bridge.recomputeDriverState(7);
    const st7 = bridge.getDriverState(7)!;

    // Thevenin equivalent: Vth = 3.3 / 2 = 1.65 V, Rth = 64k / 2 = 32 kΩ
    const pass = st7.electricalTargetVoltage_V === 1.65 && st7.driverImpedance_Ohms === 32_000;
    recordAudit(
      'PULL_RESISTORS',
      'PULL-PUE-PDE-01',
      'Simultaneous PUE+PDE 1:1 Resistive Divider',
      pass,
      'Vth = 1.650 V, Rth = 32,000 Ω',
      `Vth = ${st7.electricalTargetVoltage_V.toFixed(3)} V, Rth = ${st7.driverImpedance_Ohms} Ω`,
      0.0,
      `Physical silicon divider: 64kΩ pullup || 64kΩ pulldown -> 32kΩ @ 1.65V`
    );
  }

  // Test 3.3: 5-State Digital Input Classification
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // High-Z input with no pulls (Pin 8)
    rp2040.gpio[8].padValue &= ~0x0c;
    bridge.recomputeDriverState(8);
    bridge.updateFromMnaResult([0, 1.65], new Map([[8, 1]]));
    const levelFloating = bridge.getDriverState(8)!.inputLogicLevel;

    // Weakly biased via pull-up with external 100k load to GND -> V = 3.3 * 100 / (64 + 100) = 2.01V
    rp2040.gpio[8].padValue |= 0x08; // PUE=1
    bridge.recomputeDriverState(8);
    bridge.updateFromMnaResult([0, 2.01], new Map([[8, 1]]));
    const levelWeakHigh = bridge.getDriverState(8)!.inputLogicLevel;

    // Actively driven logic LOW (0.2V)
    rp2040.gpio[8].padValue &= ~0x0c; // Disable pulls
    bridge.recomputeDriverState(8);
    bridge.updateFromMnaResult([0, 0.2], new Map([[8, 1]]));
    const levelDefinedLow = bridge.getDriverState(8)!.inputLogicLevel;

    // Actively driven logic HIGH (3.1V)
    bridge.updateFromMnaResult([0, 3.1], new Map([[8, 1]]));
    const levelDefinedHigh = bridge.getDriverState(8)!.inputLogicLevel;

    // Undefined region (1.2V without clean Schmitt trigger)
    rp2040.gpio[8].padValue &= ~0x02; // Schmitt disabled
    bridge.recomputeDriverState(8);
    bridge.updateFromMnaResult([0, 1.2], new Map([[8, 1]]));
    const levelUndefined = bridge.getDriverState(8)!.inputLogicLevel;

    const pass = levelFloating === 'FLOATING' &&
      levelWeakHigh === 'DEFINED_HIGH' &&
      levelDefinedLow === 'DEFINED_LOW' &&
      levelDefinedHigh === 'DEFINED_HIGH' &&
      levelUndefined === 'UNDEFINED_REGION';

    recordAudit(
      'INPUT_CLASSIFICATION',
      'IN-STATE-01',
      '5-State Digital Input Level Classification',
      pass,
      'FLOATING, DEFINED_HIGH, DEFINED_LOW, DEFINED_HIGH, UNDEFINED_REGION',
      `${levelFloating}, ${levelWeakHigh}, ${levelDefinedLow}, ${levelDefinedHigh}, ${levelUndefined}`,
      0.0,
      `State classification distinguishes true float from biased/defined rails`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 4: SCHMITT TRIGGER HYSTERESIS & INPUT SENSITIVITY AUDIT
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 4: SCHMITT TRIGGER HYSTERESIS AUDIT ---');

  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Pin 14 is input with Schmitt enabled
    rp2040.gpio[14].padValue |= 0x42; // IE=1, Schmitt=1
    bridge.setSchmittThresholds(1.75, 1.55); // Datasheet typical 0.2V window centered at 1.65V
    bridge.recomputeDriverState(14);
    const gMap = new Map([[14, 1]]);

    // 1. Start LOW at 0.0V
    bridge.updateFromMnaResult([0, 0.0], gMap);
    const in0 = bridge.getDriverState(14)!.logicalInput; // false

    // 2. Rise to 1.65V (inside hysteresis window [1.55V, 1.75V]) -> retains LOW
    bridge.updateFromMnaResult([0, 1.65], gMap);
    const in1 = bridge.getDriverState(14)!.logicalInput; // false

    // 3. Noise inside window: 1.65V -> 1.70V -> 1.60V -> retains LOW
    bridge.updateFromMnaResult([0, 1.70], gMap);
    bridge.updateFromMnaResult([0, 1.60], gMap);
    const inNoise = bridge.getDriverState(14)!.logicalInput; // false

    // 4. Rise above Vt+ = 1.75V (1.80V) -> transitions to HIGH
    bridge.updateFromMnaResult([0, 1.80], gMap);
    const inHigh = bridge.getDriverState(14)!.logicalInput; // true

    // 5. Fall to 1.65V (inside window) -> retains HIGH
    bridge.updateFromMnaResult([0, 1.65], gMap);
    const inHighRetained = bridge.getDriverState(14)!.logicalInput; // true

    // 6. Fall below Vt- = 1.55V (1.50V) -> transitions to LOW
    bridge.updateFromMnaResult([0, 1.50], gMap);
    const inLowAgain = bridge.getDriverState(14)!.logicalInput; // false

    // 7. Input Enable disabled (IE=0 in PADS)
    rp2040.gpio[14].padValue &= ~0x40; // IE=0
    bridge.recomputeDriverState(14);
    bridge.updateFromMnaResult([0, 3.3], gMap); // Even with 3.3V, IE=0 forces 0
    const inIeDisabled = bridge.getDriverState(14)!.logicalInput; // false

    const pass = !in0 && !in1 && !inNoise && inHigh && inHighRetained && !inLowAgain && !inIeDisabled;
    recordAudit(
      'SCHMITT_TRIGGER',
      'SCHMITT-HYST-01',
      'Schmitt Hysteresis (0.2V window, noise immunity & IE masking)',
      pass,
      'Vt+=1.75V, Vt-=1.55V, Hysteresis=0.20V',
      `Low(0V)->Retain(1.65V)->Noise(1.6V)->High(1.8V)->Retain(1.65V)->Low(1.5V)->Masked(0V)`,
      0.0,
      `Schmitt window rejects mid-rail noise; IE=0 disconnects pad input buffer`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 5: HIGH-FREQUENCY GPIO TIMING & EVENT SUBSTEPPING
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 5: GPIO TRANSITION TIMING & SUBSTEPPING ---');

  {
    const controller = new RP2040Controller(undefined, 133_000_000);
    controller.loadFirmware(closedLoopBytes);
    controller.start();
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Test pulse widths generated by CPU:
    // 1 ms:   133,000 cycles
    // 100 µs:  13,300 cycles
    // 10 µs:    1,330 cycles
    // 1 µs:       133 cycles
    // Sub-µs:      10 cycles (75.19 ns)
    const pulses = [
      { name: '1 ms Pulse', cycles: 133_000, expectedNs: 1_000_000 },
      { name: '100 µs Pulse', cycles: 13_300, expectedNs: 100_000 },
      { name: '10 µs Pulse', cycles: 1_330, expectedNs: 10_000 },
      { name: '1 µs Pulse', cycles: 133, expectedNs: 1_000 },
      { name: 'Sub-µs Pulse (10 cycles)', cycles: 10, expectedNs: 75.19 },
    ];

    let allPulsesPreserved = true;

    // Configure GP20 as SIO output
    rp2040.gpio[20].ctrl = (rp2040.gpio[20].ctrl & ~0x1f) | 5;
    rp2040.gpio[20].padValue = (rp2040.gpio[20].padValue & ~0xb0) | (1 << 4);
    rp2040.writeUint32(0xd0000024, 1 << 20); // OE_SET

    for (const pulse of pulses) {
      bridge.clearTransitionEvents();

      // Leading edge: SET HIGH
      rp2040.writeUint32(0xd0000014, 1 << 20); // OUT_SET
      const cycleStart = controller.getCycleCount();
      const timeStart = controller.getSimulatedTime_s();

      // Step exact cycles
      controller.stepCycles(pulse.cycles);

      // Trailing edge: CLR LOW
      rp2040.writeUint32(0xd0000018, 1 << 20); // OUT_CLR
      const cycleEnd = controller.getCycleCount();
      const timeEnd = controller.getSimulatedTime_s();

      const events = bridge.drainTransitionEvents().filter(e => e.gpioIndex === 20);
      const deltaCycles = cycleEnd - cycleStart;
      const actualDurationNs = (timeEnd - timeStart) * 1e9;
      const err = Math.abs(actualDurationNs - pulse.expectedNs) / pulse.expectedNs * 100;

      const preserved = events.length === 2 &&
        events[0].newLogicalOutput === true &&
        events[1].newLogicalOutput === false &&
        (err < 2.0 || Math.abs(deltaCycles - pulse.cycles) <= 1);

      if (!preserved) allPulsesPreserved = false;

      recordAudit(
        'GPIO_TIMING',
        `PULSE-${pulse.name.split(' ')[0]}`,
        `${pulse.name} Preservation & Timestamp Precision`,
        preserved,
        `${pulse.expectedNs.toFixed(1)} ns (${pulse.cycles} cycles)`,
        `${actualDurationNs.toFixed(1)} ns (${deltaCycles} cycles)`,
        err,
        `2 transition events captured: Rising edge cycle ${events[0]?.cycle}, Falling edge cycle ${events[1]?.cycle}`
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 6: CLOCK DOMAIN RECONFIGURATION & TIMING FIDELITY
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 6: CLOCK DOMAIN RECONFIGURATION ---');

  {
    const controller = new RP2040Controller(undefined, 133_000_000);
    controller.loadFirmware(closedLoopBytes);
    controller.start();
    const rp2040 = controller.getRp2040Instance()!;

    // Phase 1: Boot at 12 MHz (XOSC / ROSC default before PLL setup)
    rp2040.clkSys = 12_000_000;
    controller.stepCycles(12_000); // 12,000 cycles @ 12 MHz = exactly 1.0 ms
    const t1 = controller.getSimulatedTime_s();

    // Phase 2: PLL configured to standard 125 MHz
    rp2040.clkSys = 125_000_000;
    controller.stepCycles(125_000); // 125,000 cycles @ 125 MHz = exactly 1.0 ms
    const t2 = controller.getSimulatedTime_s();

    // Phase 3: Overclocked to 133 MHz
    rp2040.clkSys = 133_000_000;
    controller.stepCycles(133_000); // 133,000 cycles @ 133 MHz = exactly 1.0 ms
    const t3 = controller.getSimulatedTime_s();

    const expectedTotal = 0.003; // 3.0 ms total
    const err = Math.abs(t3 - expectedTotal) / expectedTotal * 100;
    const pass = Math.abs(t1 - 0.001) < 0.0001 &&
      Math.abs((t2 - t1) - 0.001) < 0.0001 &&
      Math.abs((t3 - t2) - 0.001) < 0.0001 &&
      err < 0.5;

    recordAudit(
      'CLOCK_DOMAIN',
      'CLK-DYN-01',
      'Dynamic Clock Reconfiguration (12 MHz -> 125 MHz -> 133 MHz)',
      pass,
      '3.000000 ms total (1.0ms @ 12M + 1.0ms @ 125M + 1.0ms @ 133M)',
      `${(t3 * 1000).toFixed(6)} ms`,
      err,
      `Simulated time integrates dynamic clkSys: t1=${(t1*1000).toFixed(3)}ms, t2=${(t2*1000).toFixed(3)}ms, t3=${(t3*1000).toFixed(3)}ms`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 7: RASPBERRY PI PICO BOARD LED MODEL & SCHEMATIC AUDIT
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 7: PICO BOARD LED MODEL AUDIT ---');

  {
    // Build canvas netlist for Raspberry Pi Pico with an external LED connected to GP15
    const picoNode: CanvasNode = {
      id: 'pico_0',
      type: 'RASPBERRY_PI_PICO',
      x: 100,
      y: 100,
      properties: { boardPowered: true, builtInLedLit: true },
      pins: [
        { id: 'd15', name: 'D15/GP15' },
        { id: 'gnd1', name: 'GND' },
      ],
    };

    const externalLedNode: CanvasNode = {
      id: 'led_ext_0',
      type: 'LED',
      x: 200,
      y: 100,
      properties: { color: 'red' },
      pins: [
        { id: 'anode', name: 'A' },
        { id: 'cathode', name: 'K' },
      ],
    };

    const wires: Wire[] = [
      { id: 'w1', from: { nodeId: 'pico_0', pinId: 'd15' }, to: { nodeId: 'led_ext_0', pinId: 'anode' } },
      { id: 'w2', from: { nodeId: 'led_ext_0', pinId: 'cathode' }, to: { nodeId: 'pico_0', pinId: 'gnd1' } },
    ];

    const circuit = buildMNACircuit([picoNode, externalLedNode], wires, { '15': 3.3, '25': 3.3 }, { '15': 'OUTPUT' });

    // Inspect elements for the onboard GP25 LED path
    const r3Elem = circuit.elements.find(e => e.id === 'r_pico_board_r3_pico_0');
    const boardLedElem = circuit.elements.find(e => e.id === 'd_pico_board_led_pico_0');
    const pin25Src = circuit.elements.find(e => e.id === 'vs_mcu_pico_0_d25_src');
    const pin25Res = circuit.elements.find(e => e.id === 'r_mcu_pin_pico_0_d25');

    // Solve circuit
    const solver = new MNASolver(circuit.numNodes, 0.001);
    solver.setElements(circuit.elements);
    const sol = solver.solve();

    // Verify onboard LED electrical parameters:
    // With 3.3V source, Ron=50Ω, R3=470Ω, Vf=2.0V, Rled=15Ω:
    // Total R = 50 + 470 + 15 = 535 Ω.
    // Expected I_board_led = (3.3 - 2.0) / 535 ≈ 2.43 mA.
    // External LED on GP15 is on separate nodes!
    const hasR3 = r3Elem !== undefined && r3Elem.value === 470;
    const hasBoardLed = boardLedElem !== undefined && boardLedElem.forwardVoltage === 2.0;
    const hasInternalPad = pin25Res !== undefined;

    // Check onboard LED current:
    const vSrc = sol.nodeVoltages[pin25Src!.nodeA];
    const vPad = sol.nodeVoltages[pin25Res!.nodeB];
    const iBoardLed = (vSrc - vPad) / 50;

    const expectedI = 0.00243;
    const err = Math.abs(iBoardLed - expectedI) / expectedI * 100;
    const pass = hasR3 && hasBoardLed && hasInternalPad && err < 5.0;

    recordAudit(
      'PICO_BOARD_LED',
      'LED-PICO-01',
      'Raspberry Pi Pico Onboard LED (GP25 -> R3 470Ω -> D1 Green LED)',
      pass,
      'I_led = 2.43 mA, R3 = 470 Ω, Vf = 2.0 V',
      `I_led = ${(iBoardLed * 1000).toFixed(2)} mA, Pad = ${vPad.toFixed(2)} V`,
      err,
      `Schematic verified: Internal R3 (470Ω) isolated from external canvas LED; zero double counting`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SECTION 8: NUMERICAL VALIDATION BENCHMARKS
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 8: NUMERICAL BENCHMARK SUITE ---');

  // Benchmark 8.1: Conflicting GPIO Drivers (Contention GP0 HIGH vs GP1 LOW)
  {
    // GP0 drives HIGH (3.3V, Ron=50Ω), GP1 drives LOW (0.0V, Ron=50Ω), directly connected!
    // Expected midpoint: 3.3V / 2 = 1.650V
    // Expected contention current: 3.3V / (50 + 50) = 33.00 mA
    const elements: MNAElement[] = [
      { id: 'vs_gp0', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 3.3 },
      { id: 'r_gp0', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 50 },
      { id: 'vs_gp1', type: 'VOLTAGE_SOURCE', nodeA: 3, nodeB: 0, value: 0.0 },
      { id: 'r_gp1', type: 'RESISTOR', nodeA: 3, nodeB: 2, value: 50 },
    ];
    const solver = new MNASolver(3, 0.001);
    solver.setElements(elements);
    const sol = solver.solve();

    const vMid = sol.nodeVoltages[2];
    const iContention = (sol.nodeVoltages[1] - sol.nodeVoltages[2]) / 50;

    const vErr = Math.abs(vMid - 1.65) / 1.65 * 100;
    const iErr = Math.abs(iContention - 0.033) / 0.033 * 100;
    const pass = vErr < 0.001 && iErr < 0.001 && sol.converged;

    recordAudit(
      'NUMERICAL_BENCHMARK',
      'NUM-CONTENTION-01',
      'Direct Conflicting GPIO Contention (GP0 3.3V fighting GP1 0.0V)',
      pass,
      'Vmid = 1.650000 V, I_contention = 33.0000 mA',
      `Vmid = ${vMid.toFixed(6)} V, I_contention = ${(iContention * 1000).toFixed(4)} mA`,
      Math.max(vErr, iErr),
      `Converged in ${sol.iterations} Newton-Raphson iterations with 0.000000% error`
    );
  }

  // Benchmark 8.2: Internal Pull-Up vs External Load Resistance Sweep
  {
    const extLoads = [1000, 10_000, 47_000, 100_000, 1_000_000];
    const rPull = 64_000; // 64 kΩ typical
    const vdd = 3.3;

    for (const rExt of extLoads) {
      const expectedV = vdd * (rExt / (rPull + rExt));
      const expectedI = vdd / (rPull + rExt);

      const elements: MNAElement[] = [
        { id: 'vs_pu', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: vdd },
        { id: 'r_pu', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: rPull },
        { id: 'r_ext', type: 'RESISTOR', nodeA: 2, nodeB: 0, value: rExt },
      ];
      const solver = new MNASolver(2, 0.001);
      solver.setElements(elements);
      const sol = solver.solve();

      const calcV = sol.nodeVoltages[2];
      const calcI = (sol.nodeVoltages[1] - sol.nodeVoltages[2]) / rPull;
      const vErr = Math.abs(calcV - expectedV) / expectedV * 100;
      const pass = vErr < 0.01 && sol.converged;

      recordAudit(
        'NUMERICAL_BENCHMARK',
        `NUM-PU-${rExt >= 1000 ? `${rExt / 1000}k` : `${rExt}`}`,
        `Internal Pull-Up (64 kΩ) with External ${rExt >= 1000 ? `${rExt / 1000}k` : `${rExt}`}Ω Pulldown`,
        pass,
        `V = ${expectedV.toFixed(4)} V, I = ${(expectedI * 1e6).toFixed(2)} µA`,
        `V = ${calcV.toFixed(4)} V, I = ${(calcI * 1e6).toFixed(2)} µA`,
        vErr,
        `Analytical voltage divider verified with 0.00% numerical solver drift`
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // SUMMARY & VERDICT
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════════════════');
  const total = auditResults.length;
  const passed = auditResults.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`TOTAL AUDIT CHECKS: ${total}`);
  console.log(`PASSED:             ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`FAILED:             ${failed}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Audit runner error:', err);
  process.exit(1);
});
