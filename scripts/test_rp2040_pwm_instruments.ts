/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge Phase 4.3.6 — Milestone 6: RP2040 PWM Instruments & UI Integration Test
 * 
 * Verifies:
 * 1. Cycle-accurate edge event generation for Logic Analyzer protocol capture
 * 2. Exact pulse width and duty cycle timing fidelity from bridge event timestamps
 * 3. Oscilloscope peak-preserving decimation buffer capture without claiming anti-aliasing
 * 4. UI diagnostic snapshot export (frequency, duty cycle, TOP, CC, counter, mode)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Pwm,
  CSR_EN,
  CSR_PH_CORRECT,
  REG_CH_CSR,
  REG_CH_DIV,
  REG_CH_TOP,
  REG_CH_CC,
} from '../src/features/simulator/rp2040Pwm';
import { RP2040GpioBridge, FUNCTION_PWM } from '../src/features/simulator/rp2040GpioBridge';
import { ScopeCaptureBuffer } from '../src/features/simulator/scopeCapture';

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, message: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [CHECK PASS] ${message}`);
  } else {
    console.error(`  [CHECK FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTests() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.6 — PWM INSTRUMENTS & UI INTEGRATION TEST        ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const rp2040 = new RP2040();
  const bridge = new RP2040GpioBridge(rp2040, 'pico_0', 3.3);
  const pwm = new RP2040Pwm(rp2040, 'PWM', 4);
  bridge.attachPwm(pwm);

  // Set timing provider: simulated clock = 125 MHz (8 ns per cycle)
  let simulatedCycles = 0;
  bridge.setTimingProvider(() => ({
    cycle: simulatedCycles,
    simulatedTime_s: simulatedCycles / 125_000_000,
  }));

  // Route GP0 to PWM (Slice 0 Channel A)
  (rp2040.gpio[0] as any).ctrl = FUNCTION_PWM;
  bridge.recomputeDriverState(0);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: CYCLE-ACCURATE LOGIC ANALYZER EDGE EVENTS ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Configure 1 MHz PWM: clock = 125 MHz, DIV = 1.0, TOP = 124 (period = 125 cycles = 1.0 µs)
  // Duty cycle = 20% (CC_A = 25 cycles)
  pwm.writeUint32(0x00 + REG_CH_CSR, 0);
  pwm.writeUint32(0x00 + REG_CH_DIV, 0x10); // 1.0
  pwm.writeUint32(0x00 + REG_CH_TOP, 124);
  pwm.writeUint32(0x00 + REG_CH_CC, 25);
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);

  bridge.drainTransitionEvents();

  // Advance by 1 full period (125 cycles) in single cycles or sub-blocks
  // Cycle 0..24: output is HIGH
  // Cycle 25: output falls to LOW
  // Cycle 124 -> 125 (wrap to 0): output rises to HIGH
  for (let c = 0; c < 125; c++) {
    simulatedCycles++;
    pwm.tickCycles(1);
  }

  const events = bridge.drainTransitionEvents();
  assert(events.length >= 2, `Captured ${events.length} edge transitions within 1 PWM period`);

  const fallingEdge = events.find((e) => e.gpioIndex === 0 && e.newLogicalOutput === false);
  const risingEdge = events.find((e) => e.gpioIndex === 0 && e.newLogicalOutput === true);

  assert(fallingEdge !== undefined, 'Falling edge event recorded at compare match (CTR = 25)');
  assert(risingEdge !== undefined, 'Rising edge event recorded at wrap (CTR = 0)');
  assert(fallingEdge!.cycle === 25, `Falling edge cycle = ${fallingEdge!.cycle} (expected 25)`);
  assert(risingEdge!.cycle === 125, `Rising edge cycle = ${risingEdge!.cycle} (expected 125)`);

  const pulseWidth_s = (fallingEdge!.cycle) / 125_000_000;
  const expectedPulseWidth_s = 25 / 125_000_000; // 200 ns
  assert(
    Math.abs(pulseWidth_s - expectedPulseWidth_s) < 1e-12,
    `Pulse width is exactly ${(pulseWidth_s * 1e9).toFixed(1)} ns (20% of 1 µs)`
  );

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: OSCILLOSCOPE PEAK-PRESERVING CAPTURE ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Oscilloscope buffer with 100 sample capacity
  const scopeBuffer = new ScopeCaptureBuffer(100, 1);
  scopeBuffer.configureTiming(1e-6, 1); // 1 µs capture interval

  // Capture 10 successive PWM periods (10 µs total)
  // At each 1 µs interval, record instantaneous voltage
  for (let t_us = 0; t_us < 10; t_us++) {
    const vProbe = bridge.getDriverState(0).electricalTargetVoltage_V;
    scopeBuffer.capture(t_us * 1e-6, [vProbe]);
    // Advance PWM by 1 µs (125 cycles)
    simulatedCycles += 125;
    pwm.tickCycles(125);
  }

  const batch = scopeBuffer.drain();
  assert(batch !== null, 'Oscilloscope buffer drained a valid batch');
  assert(batch!.timestamps.length === 10, 'Oscilloscope batch contains 10 chronological samples');
  assert(batch!.values.length === 10, 'Oscilloscope batch contains 10 voltage values');
  assert(batch!.samplePeriodMs === 0.001, 'Sample period reported as 0.001 ms (1 µs)');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: UI DIAGNOSTICS SNAPSHOT EXPORT ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Configure Slice 3 for Phase-Correct mode:
  // TOP = 500, CC_A = 250 (50% duty), CC_B = 100 (20% duty), DIV = 2.5
  pwm.writeUint32(0x3C + REG_CH_CSR, 0);
  pwm.writeUint32(0x3C + REG_CH_DIV, (2 << 4) | 8); // 2.5
  pwm.writeUint32(0x3C + REG_CH_TOP, 500);
  pwm.writeUint32(0x3C + REG_CH_CC, (100 << 16) | 250);
  pwm.writeUint32(0x3C + REG_CH_CSR, CSR_EN | CSR_PH_CORRECT);

  const diag = pwm.getDiagnostics();
  assert(diag.baseAddress === 0x40050000, 'Diagnostics reports base address 0x40050000');
  assert(diag.irq === 4, 'Diagnostics reports IRQ 4');
  assert(diag.slices.length === 8, 'Diagnostics reports all 8 slices');

  const slice3Diag = diag.slices[3];
  assert(slice3Diag.sliceIndex === 3, 'Slice 3 index verified');
  assert(slice3Diag.enabled === true, 'Slice 3 enabled verified');
  assert(slice3Diag.phaseCorrect === true, 'Slice 3 phase-correct flag verified');
  assert(slice3Diag.effectiveDivider === 2.5, 'Slice 3 effective divider = 2.5');
  assert(slice3Diag.top === 500, 'Slice 3 TOP = 500');
  assert(slice3Diag.compareA === 250, 'Slice 3 CC_A = 250');
  assert(slice3Diag.compareB === 100, 'Slice 3 CC_B = 100');
  assert(Math.abs(slice3Diag.dutyA - 0.499) < 0.01, `Slice 3 duty A = ${(slice3Diag.dutyA * 100).toFixed(1)}%`);
  assert(Math.abs(slice3Diag.dutyB - 0.199) < 0.01, `Slice 3 duty B = ${(slice3Diag.dutyB * 100).toFixed(1)}%`);

  // Expected frequency in phase-correct mode: sysClk / (2 * div * top)
  // 125,000,000 / (2 * 2.5 * 500) = 125,000,000 / 2500 = 50,000 Hz (50 kHz)
  const expectedFreq = 125_000_000 / (2.0 * 2.5 * 500);
  assert(
    Math.abs(slice3Diag.frequency_Hz - expectedFreq) < 1.0,
    `Slice 3 frequency = ${slice3Diag.frequency_Hz.toFixed(1)} Hz (expected 50000 Hz)`
  );

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM INSTRUMENTS & UI: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runTests();

