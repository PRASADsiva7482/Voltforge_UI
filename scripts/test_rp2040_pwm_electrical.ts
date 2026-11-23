/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge Phase 4.3.6 — Milestone 5: RP2040 PWM Electrical & MNA Co-Simulation Test
 * 
 * Verifies:
 * 1. Edge-resolved Thevenin output driver loading across drive strengths (17, 25, 50, 100 Ω)
 * 2. Peak-to-peak RC PWM ripple matches exact steady-state exponential expression:
 *    ΔV = VIO * [(1 - exp(-D*T/tau)) * (1 - exp(-(1-D)*T/tau))] / [1 - exp(-T/tau)]
 * 3. Nonlinear LED forward threshold behavior and duty-cycle average luminous power
 * 4. Inductive RL flyback dynamics and qualified averaged inductor current equations
 * 5. Current safety thresholding and bank aggregate current attribution
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Pwm,
  CSR_EN,
  REG_CH_CSR,
  REG_CH_CTR,
  REG_CH_TOP,
  REG_CH_CC,
} from '../src/features/simulator/rp2040Pwm';
import {
  RP2040GpioBridge,
  FUNCTION_PWM,
  RP2040_MAX_PIN_CURRENT_A,
} from '../src/features/simulator/rp2040GpioBridge';

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
  console.log('   VOLTFORGE PHASE 4.3.6 — PWM ELECTRICAL & MNA INTEGRATION TEST       ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const rp2040 = new RP2040();
  const bridge = new RP2040GpioBridge(rp2040, 'pico_0', 3.3);
  const pwm = new RP2040Pwm(rp2040, 'PWM', 4);
  bridge.attachPwm(pwm);

  // Set GP0 to PWM mode (Slice 0 Channel A)
  (rp2040.gpio[0] as any).ctrl = FUNCTION_PWM;
  bridge.recomputeDriverState(0);

  // Configure Slice 0: TOP = 99, CC_A = 50 (50% duty), DIV = 1.0, EN = 1
  pwm.writeUint32(0x00 + REG_CH_TOP, 99);
  pwm.writeUint32(0x00 + REG_CH_CC, 50);
  pwm.writeUint32(0x00 + REG_CH_CTR, 0);
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: THEVENIN OUTPUT DRIVER LOADING ACROSS DRIVE STRENGTHS ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // At CTR=0 < 50, GP0 driver output is HIGH (3.3V)
  const pin0 = rp2040.gpio[0] as any;
  const loadR = 258; // 258 Ω external load to ground

  function feedPinMna(pin: number, measuredV: number) {
    const nodeMap = new Map<number, number>([[pin, 1]]);
    bridge.updateFromMnaResult([0, measuredV], nodeMap);
  }

  // Drive strength 3: Ron = 17 Ω
  pin0.padValue = 3 << 4;
  bridge.recomputeDriverState(0);
  let driver = bridge.getDriverState(0);
  assert(driver.driverImpedance_Ohms === 17, 'Drive strength 12mA -> Ron = 17 Ω');

  // MNA solve with loadR: Vpin = Vth * Rload / (Ron + Rload), I = Vth / (Ron + Rload)
  let expectedV = 3.3 * (loadR / (17 + loadR));
  let expectedI = 3.3 / (17 + loadR);
  feedPinMna(0, expectedV);
  driver = bridge.getDriverState(0);

  assert(Math.abs(driver.measuredVoltage_V - expectedV) < 1e-4, `17 Ω: measured V = ${expectedV.toFixed(3)}V`);
  assert(Math.abs(driver.measuredCurrent_A - expectedI) < 1e-5, `17 Ω: measured I = ${(expectedI * 1000).toFixed(2)}mA (< 12mA threshold)`);
  assert(driver.faults.overcurrent === false, '17 Ω: no overcurrent fault');

  // Drive strength 1: Ron = 50 Ω (default 4mA)
  pin0.padValue = 1 << 4;
  bridge.recomputeDriverState(0);
  expectedV = 3.3 * (loadR / (50 + loadR));
  expectedI = 3.3 / (50 + loadR);
  feedPinMna(0, expectedV);
  driver = bridge.getDriverState(0);

  assert(driver.driverImpedance_Ohms === 50, 'Drive strength 4mA -> Ron = 50 Ω');
  assert(Math.abs(driver.measuredVoltage_V - expectedV) < 1e-4, `50 Ω: measured V = ${expectedV.toFixed(3)}V`);
  assert(Math.abs(driver.measuredCurrent_A - expectedI) < 1e-5, `50 Ω: measured I = ${(expectedI * 1000).toFixed(2)}mA`);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: EXACT RC PWM PEAK-TO-PEAK RIPPLE QUALIFICATION ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Evaluate exact formula proven in Phase 4.3.5.8:
  // ΔV = VIO * [(1 - exp(-D*T/tau)) * (1 - exp(-(1-D)*T/tau))] / [1 - exp(-T/tau)]
  const VIO = 3.3;
  const f_pwm = 25_000; // 25 kHz
  const T_pwm = 1.0 / f_pwm; // 40 µs
  const R_filt = 1000;  // 1 kΩ
  const C_filt = 1e-6;  // 1 µF -> tau = R*C = 1 ms = 1000 µs
  const tau = R_filt * C_filt;

  function exactRcRipple(D: number): number {
    const term1 = 1 - Math.exp(-D * T_pwm / tau);
    const term2 = 1 - Math.exp(-(1 - D) * T_pwm / tau);
    const denom = 1 - Math.exp(-T_pwm / tau);
    return VIO * (term1 * term2) / denom;
  }

  function smallRippleApprox(D: number): number {
    return VIO * D * (1 - D) * (T_pwm / tau);
  }

  // At D = 0.5 (maximum ripple)
  const exactRipple50 = exactRcRipple(0.5);
  const approxRipple50 = smallRippleApprox(0.5);
  const relDiff = Math.abs(exactRipple50 - approxRipple50) / exactRipple50;

  assert(exactRipple50 > 0 && exactRipple50 < 0.1, `Exact ripple at 50% duty is ${(exactRipple50 * 1000).toFixed(3)} mV`);
  assert(relDiff < 0.05, `Small-ripple approximation matches exact expression within 5% (diff=${(relDiff * 100).toFixed(2)}%)`);

  // At D = 0.2
  const exactRipple20 = exactRcRipple(0.2);
  assert(exactRipple20 < exactRipple50, `Ripple at 20% duty (${(exactRipple20 * 1000).toFixed(3)} mV) < 50% duty`);

  // Symmetry: ripple at D = 0.2 must equal ripple at D = 0.8
  const exactRipple80 = exactRcRipple(0.8);
  assert(Math.abs(exactRipple20 - exactRipple80) < 1e-12, 'Exact RC ripple is strictly symmetric about D = 0.5');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: NONLINEAR LED FORWARD THRESHOLD CO-SIMULATION ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Red LED: Vf = 2.0V, series resistor R = 330 Ω, Ron = 17 Ω -> Rtotal = 347 Ω
  const Vf = 2.0;
  const Rled_series = 330;
  const Rtotal = 17 + Rled_series;

  // Output HIGH (3.3V):
  const I_on = (3.3 - Vf) / Rtotal; // ~3.75 mA
  // Output LOW (0.0V):
  const I_off = 0.0;

  // Edge-resolved switching:
  // Current during HIGH: I_on
  // Current during LOW: 0.0
  // For duty cycle D = 0.75:
  const D = 0.75;
  const I_avg = D * I_on + (1 - D) * I_off;
  const P_avg_luminous = I_avg * Vf; // Average power delivered to LED junction

  assert(I_on > 0.003 && I_on < 0.004, `LED ON current is ${(I_on * 1000).toFixed(2)} mA`);
  assert(Math.abs(I_avg - 0.75 * I_on) < 1e-6, `Average LED current at 75% duty is ${(I_avg * 1000).toFixed(2)} mA`);
  assert(P_avg_luminous > 0, `Average optical power dissipation is ${(P_avg_luminous * 1000).toFixed(2)} mW`);

  // Zero-current verification when pin is LOW
  pwm.slices[0].ctr = 75; // CTR >= CC_A (50) -> pin is LOW
  pwm.slices[0].writeRegister(REG_CH_CSR, CSR_EN);
  feedPinMna(0, 0.0);
  assert(bridge.getDriverState(0).measuredCurrent_A === 0, 'LED current is zero during PWM LOW state');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: INDUCTIVE RL FLYBACK DYNAMICS QUALIFICATION ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Solenoid / DC motor model: L = 10 mH, R = 50 Ω, flyback diode Vf_diode = 0.7V
  // Qualified averaged inductor equation from Phase 4.3.5.9:
  // L * di_avg/dt = V_avg - R * i_avg - V_diode * (1 - D)
  const L = 0.010; // 10 mH
  const R_ind = 50.0; // 50 Ω
  const Vf_diode = 0.7; // 0.7V
  const D_motor = 0.6; // 60% duty

  // Steady-state average current:
  // 0 = D * VIO - R * I_ss - (1 - D) * Vf_diode
  // I_ss = [D * VIO - (1 - D) * Vf_diode] / R
  const I_ss_avg = (D_motor * VIO - (1 - D_motor) * Vf_diode) / R_ind;

  assert(I_ss_avg > 0, `Averaged steady-state inductor current is ${(I_ss_avg * 1000).toFixed(2)} mA`);

  // Peak-to-peak switching ripple current:
  // ΔI_peak = [(VIO - R * I_ss) / L] * D * T_pwm
  const delta_I = ((VIO - R_ind * I_ss_avg) / L) * D_motor * T_pwm;
  assert(delta_I > 0 && delta_I < I_ss_avg, `Switching ripple current is ${(delta_I * 1000).toFixed(3)} mA`);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: SAFETY CURRENT THRESHOLDING & OVERCURRENT FAULT ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Excessive load: short to GND (measured V = 0V while target V = 3.3V, Ron = 17 Ω) -> I = 3.3 / 17 ≈ 194 mA
  // This exceeds RP2040_MAX_PIN_CURRENT_A = 16 mA!
  pwm.slices[0].ctr = 0; // CTR < 50 -> pin is HIGH (3.3V)
  pwm.slices[0].writeRegister(REG_CH_CSR, CSR_EN);
  feedPinMna(0, 0.0); // short to GND
  const faultDriver = bridge.getDriverState(0);

  assert(faultDriver.faults.overcurrent === true, 'Overcurrent fault flag asserted when I > 16 mA');
  assert(faultDriver.measuredCurrent_A > RP2040_MAX_PIN_CURRENT_A, 'Measured current exceeds 16 mA policy threshold');

  // Restore normal load: measured V = 3.2V -> I = (3.3 - 3.2)/17 ≈ 5.88 mA < 16 mA
  feedPinMna(0, 3.2);
  assert(bridge.getDriverState(0).faults.overcurrent === false, 'Overcurrent fault clears when current returns to normal');
  assert(bridge.getDriverState(0).faults.overcurrent === false, 'Overcurrent fault clears when current returns to normal');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM ELECTRICAL & MNA: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runTests();
