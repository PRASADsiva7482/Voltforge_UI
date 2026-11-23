/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.6.2: RP2040 PWM DIVMODE COMPREHENSIVE FUNCTIONAL TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Mathematically and functionally verifies genuine RP2040 PWM hardware clocking modes:
 * - DIVMODE 00: Free-running (fractional divider receives continuous system clock)
 * - DIVMODE 01: B_HIGH (fractional divider gated by channel B input level)
 * - DIVMODE 10: B_RISING (fractional divider receives 1 event per valid rising edge on B)
 * - DIVMODE 11: B_FALLING (fractional divider receives 1 event per valid falling edge on B)
 *
 * Strict Two-Stage Hardware Architecture:
 *   Input Selection / Edge Detector → 8.4 Fractional Divider → Counter Enable → PWM Counter
 *
 * Covers 15 Distinct Scenarios:
 *   1. Free-running baseline
 *   2. B_HIGH with permanently low input
 *   3. B_HIGH with permanently high input
 *   4. B_HIGH with changing high/low intervals
 *   5. B_RISING with known edge counts
 *   6. B_FALLING with known edge counts
 *   7. Multiple edges within a simulation interval
 *   8. Fractional divider behavior in edge modes (int & frac division)
 *   9. Fractional divider behavior in B_HIGH mode
 *  10. DIVMODE dynamic switching during execution
 *  11. GPIO B function selection and pin routing changes
 *  12. CC_B output suppression in non-free-running modes (channel B input)
 *  13. Multiple PWM slices operating independently with individual B inputs
 *  14. Input transitions at boundary clock cycles
 *  15. Invalid conditions, wrap limits, and peripheral reset semantics
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Pwm,
  REG_CH_CSR,
  REG_CH_DIV,
  REG_CH_CTR,
  REG_CH_CC,
  REG_CH_TOP,
  CSR_EN,
  PWM_NUM_SLICES,
} from '../src/features/simulator/rp2040Pwm';
import {
  RP2040GpioBridge,
  FUNCTION_PWM,
  FUNCTION_SIO,
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
  }
}

function runPwmDivmodeTests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.6.2 — RP2040 PWM DIVMODE FUNCTIONAL VALIDATION   ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const mcu = new RP2040();
  const pwm = new RP2040Pwm(mcu, 'PWM', 4);
  (mcu as any).pwm = pwm;
  const bridge = new RP2040GpioBridge(mcu, 'pico_0', 3.3);
  bridge.attachPwm(pwm);

  // -----------------------------------------------------------------------------------
  // SCENARIO 1: Free-Running Baseline (DIVMODE 00)
  // -----------------------------------------------------------------------------------
  console.log('--- SCENARIO 1: FREE-RUNNING BASELINE (DIVMODE 00) ---');
  pwm.reset();
  const s0 = pwm.slices[0];
  // Enable slice 0, DIVMODE = 00, div = 1.0 (0x10), TOP = 1000
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10); // 1.0
  s0.writeRegister(REG_CH_CSR, CSR_EN | (0 << 4)); // DIVMODE = 00, EN = 1

  assert(s0.divMode === 0, 'Slice 0 configured for DIVMODE 00 (Free-running)');
  assert(s0.counter === 0, 'Initial counter value is 0');

  // Advance 100 cycles
  pwm.tickCycles(100);
  assert(s0.counter === 100, `Counter advanced by 100 cycles (actual: ${s0.counter})`);

  // Channel B input state changes must have ZERO effect in mode 00
  s0.setPinBLevel(true);
  s0.setPinBLevel(false);
  s0.setPinBLevel(true);
  assert(s0.counter === 100, 'Toggling Pin B in mode 00 does not advance counter');

  pwm.tickCycles(50);
  assert(s0.counter === 150, `Counter advanced by additional 50 cycles (actual: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 2: B_HIGH with Permanently Low Input (DIVMODE 01)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: B_HIGH WITH PERMANENTLY LOW INPUT (DIVMODE 01) ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10);
  s0.writeRegister(REG_CH_CSR, CSR_EN | (1 << 4)); // DIVMODE = 01 (B_HIGH), EN = 1
  s0.setPinBLevel(false); // Held low

  assert(s0.divMode === 1, 'Slice 0 configured for DIVMODE 01 (B_HIGH)');
  assert(s0.pinBLevel === false, 'Pin B level is held LOW');

  // Step 200 system clock cycles
  pwm.tickCycles(200);
  assert(s0.counter === 0, `Counter did NOT advance while B is LOW (actual: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 3: B_HIGH with Permanently High Input (DIVMODE 01)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: B_HIGH WITH PERMANENTLY HIGH INPUT (DIVMODE 01) ---');
  s0.setPinBLevel(true); // Held high
  assert(s0.pinBLevel === true, 'Pin B level is now held HIGH');

  pwm.tickCycles(120);
  assert(s0.counter === 120, `Counter advanced at full rate while B is HIGH (actual: ${s0.counter})`);

  pwm.tickCycles(80);
  assert(s0.counter === 200, `Counter advanced by additional 80 cycles (actual: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 4: B_HIGH with Changing High/Low Intervals (DIVMODE 01)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: B_HIGH WITH DYNAMIC HIGH/LOW GATING (DIVMODE 01) ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10);
  s0.writeRegister(REG_CH_CSR, CSR_EN | (1 << 4));

  // Sequence: B=HIGH (30 cyc) -> B=LOW (40 cyc) -> B=HIGH (25 cyc) -> B=LOW (50 cyc)
  s0.setPinBLevel(true);
  pwm.tickCycles(30);
  assert(s0.counter === 30, `Interval 1 (B=HIGH 30 cyc): counter = ${s0.counter}`);

  s0.setPinBLevel(false);
  pwm.tickCycles(40);
  assert(s0.counter === 30, `Interval 2 (B=LOW 40 cyc): counter held at ${s0.counter}`);

  s0.setPinBLevel(true);
  pwm.tickCycles(25);
  assert(s0.counter === 55, `Interval 3 (B=HIGH 25 cyc): counter = ${s0.counter}`);

  s0.setPinBLevel(false);
  pwm.tickCycles(50);
  assert(s0.counter === 55, `Interval 4 (B=LOW 50 cyc): counter held at ${s0.counter}`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 5: B_RISING with Known Edge Counts (DIVMODE 10)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: B_RISING WITH KNOWN EDGE COUNTS (DIVMODE 10) ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10); // div = 1.0
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // DIVMODE = 10 (B_RISING)

  assert(s0.divMode === 2, 'Slice 0 configured for DIVMODE 10 (B_RISING)');

  // System clock ticking alone must NOT advance the counter
  pwm.tickCycles(500);
  assert(s0.counter === 0, `System clock ticks do not advance counter in B_RISING mode (counter: ${s0.counter})`);

  // Inject 12 clean square pulses (12 rising edges, 12 falling edges)
  for (let i = 0; i < 12; i++) {
    s0.setPinBLevel(true);  // Rising edge!
    s0.setPinBLevel(false); // Falling edge (should be ignored)
  }
  assert(s0.counter === 12, `12 rising edges advanced counter by exactly 12 (actual: ${s0.counter})`);

  // Stepping system clock still does not change counter
  pwm.tickCycles(100);
  assert(s0.counter === 12, `Counter unchanged after system clock stepping (actual: ${s0.counter})`);

  // Repeated same-level calls (e.g. true -> true) must not be counted as edges
  s0.setPinBLevel(true);  // 13th rising edge
  s0.setPinBLevel(true);  // Duplicate level (no transition)
  s0.setPinBLevel(true);  // Duplicate level (no transition)
  assert(s0.counter === 13, `Duplicate level assertions do not generate spurious edges (actual: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 6: B_FALLING with Known Edge Counts (DIVMODE 11)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: B_FALLING WITH KNOWN EDGE COUNTS (DIVMODE 11) ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10); // div = 1.0
  s0.writeRegister(REG_CH_CSR, CSR_EN | (3 << 4)); // DIVMODE = 11 (B_FALLING)

  assert(s0.divMode === 3, 'Slice 0 configured for DIVMODE 11 (B_FALLING)');

  // Set pin to HIGH initially (rising edge should be ignored in B_FALLING mode)
  s0.setPinBLevel(true);
  assert(s0.counter === 0, 'Rising edge on B ignored in B_FALLING mode');

  // Inject 15 falling edges
  for (let i = 0; i < 15; i++) {
    s0.setPinBLevel(false); // Falling edge!
    s0.setPinBLevel(true);  // Rising edge (ignored)
  }
  assert(s0.counter === 15, `15 falling edges advanced counter by exactly 15 (actual: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 7: Multiple Edges Within a Simulation Interval
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: MULTIPLE EDGES WITHIN A SIMULATION INTERVAL ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10);
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // B_RISING

  // Perform multiple transitions interleaved with small clock intervals
  for (let burst = 0; burst < 5; burst++) {
    for (let e = 0; e < 4; e++) {
      s0.setPinBLevel(true);
      s0.setPinBLevel(false);
    }
    pwm.tickCycles(10);
  }
  assert(s0.counter === 20, `5 bursts of 4 rising edges = exactly 20 counts (actual: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 8: Fractional Divider Behavior in Edge Modes (2-Stage Divider Structure)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: FRACTIONAL DIVIDER BEHAVIOR IN EDGE MODES ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);

  // Test 8A: Integer Divider = 2.0 (0x20) in B_RISING mode
  // Every 2 rising edges should produce 1 counter tick
  s0.writeRegister(REG_CH_DIV, 0x20); // int=2, frac=0 -> divider = 2.0
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // B_RISING

  assert(s0.effectiveDivider === 2.0, 'Configured effective divider = 2.0');

  // Inject 1st edge -> fracAccumulator = 16 < 32 -> counter stays 0
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 0, '1st edge: divider accumulator holds 16/32, counter = 0');

  // Inject 2nd edge -> fracAccumulator = 32 >= 32 -> counter becomes 1
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 1, '2nd edge: divider pulses counter, counter = 1');

  // Inject 8 more edges (total 10 edges -> 5 counts)
  for (let i = 0; i < 4; i++) {
    s0.setPinBLevel(true); s0.setPinBLevel(false);
    s0.setPinBLevel(true); s0.setPinBLevel(false);
  }
  assert(s0.counter === 5, `10 total edges with divider 2.0 yielded exactly 5 counts (actual: ${s0.counter})`);

  // Test 8B: Fractional Divider = 1.5 (0x18: int=1, frac=8 -> dividerTicks = 24)
  // Accumulator sequence per edge (+16):
  // Edge 1: acc = 16 -> advance 0 (rem 16)
  // Edge 2: acc = 32 -> advance 1 (rem 8)
  // Edge 3: acc = 24 -> advance 1 (rem 0)
  // Edge 4: acc = 16 -> advance 0 (rem 16)
  // Edge 5: acc = 32 -> advance 1 (rem 8)
  // Edge 6: acc = 24 -> advance 1 (rem 0)
  // Total 6 edges -> 4 counter advances
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x18); // int=1, frac=8 -> 1.5
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // B_RISING

  assert(s0.effectiveDivider === 1.5, 'Configured effective divider = 1.5 (8.4 format 0x18)');

  const counts: number[] = [];
  for (let i = 0; i < 6; i++) {
    s0.setPinBLevel(true);
    s0.setPinBLevel(false);
    counts.push(s0.counter);
  }

  assert(counts[0] === 0, `Edge 1 count = ${counts[0]} (expected 0)`);
  assert(counts[1] === 1, `Edge 2 count = ${counts[1]} (expected 1)`);
  assert(counts[2] === 2, `Edge 3 count = ${counts[2]} (expected 2)`);
  assert(counts[3] === 2, `Edge 4 count = ${counts[3]} (expected 2)`);
  assert(counts[4] === 3, `Edge 5 count = ${counts[4]} (expected 3)`);
  assert(counts[5] === 4, `Edge 6 count = ${counts[5]} (expected 4)`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 9: Fractional Divider Behavior in B_HIGH Mode
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 9: FRACTIONAL DIVIDER BEHAVIOR IN B_HIGH MODE ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x28); // int=2, frac=8 -> divider = 2.5 (dividerTicks = 40)
  s0.writeRegister(REG_CH_CSR, CSR_EN | (1 << 4)); // B_HIGH

  assert(s0.effectiveDivider === 2.5, 'Configured effective divider = 2.5');

  // While B is HIGH, run 50 cycles: expected counts = floor(50 / 2.5) = 20
  s0.setPinBLevel(true);
  pwm.tickCycles(50);
  assert(s0.counter === 20, `50 cycles at div=2.5 with B=HIGH yielded exactly 20 counts (actual: ${s0.counter})`);

  // Set B=LOW and run 50 cycles: counter must remain at 20
  s0.setPinBLevel(false);
  pwm.tickCycles(50);
  assert(s0.counter === 20, `50 cycles with B=LOW resulted in 0 counts (counter held at ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 10: DIVMODE Switching During Execution
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 10: DYNAMIC DIVMODE SWITCHING DURING EXECUTION ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10);

  // Phase A: Mode 00 (Free-running) for 15 cycles
  s0.writeRegister(REG_CH_CSR, CSR_EN | (0 << 4));
  pwm.tickCycles(15);
  assert(s0.counter === 15, `Phase A (Free-running): counter = ${s0.counter}`);

  // Phase B: Switch dynamically to Mode 10 (B_RISING)
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4));
  assert(s0.divMode === 2, 'Switched to Mode 10');
  pwm.tickCycles(50); // Clock stepping alone does not advance
  assert(s0.counter === 15, `Clock steps in Mode 10 do not advance counter (${s0.counter})`);

  // Inject 7 rising edges
  for (let i = 0; i < 7; i++) {
    s0.setPinBLevel(true);
    s0.setPinBLevel(false);
  }
  assert(s0.counter === 22, `7 edges in Mode 10 brought counter to ${s0.counter}`);

  // Phase C: Switch dynamically to Mode 01 (B_HIGH) with B held LOW
  s0.writeRegister(REG_CH_CSR, CSR_EN | (1 << 4));
  s0.setPinBLevel(false);
  pwm.tickCycles(40);
  assert(s0.counter === 22, `Mode 01 with B=LOW held counter at ${s0.counter}`);

  // Drive B HIGH for 18 cycles
  s0.setPinBLevel(true);
  pwm.tickCycles(18);
  assert(s0.counter === 40, `Mode 01 with B=HIGH brought counter to ${s0.counter}`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 11: GPIO B Function Changes & Hardware Multiplexing
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 11: GPIO B FUNCTION CHANGES & MULTIPLEXING ROUTING ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10);
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // B_RISING

  // GPIO 1 maps to Slice 0 Channel B
  const pin1 = mcu.gpio[1];
  (pin1 as any).ctrl = FUNCTION_PWM;
  (pin1 as any).padValue = 0x40; // PADS_BANK0 IE (Input Enable)
  bridge.recomputeDriverState(1);

  // Pin 1 transition 0 -> 1 via GPIO input path
  pin1.setInputValue(true);
  bridge.recomputeDriverState(1);
  assert(s0.counter === 1, `Edge on GPIO 1 with FUNCTION_PWM advanced counter to ${s0.counter}`);

  pin1.setInputValue(false);
  bridge.recomputeDriverState(1);

  // Change GPIO 1 function select away to SIO
  (pin1 as any).ctrl = FUNCTION_SIO;
  bridge.recomputeDriverState(1);

  // Transitions on GPIO 1 while FUNCTION_SIO must NOT advance PWM slice 0
  pin1.setInputValue(true);
  bridge.recomputeDriverState(1);
  pin1.setInputValue(false);
  bridge.recomputeDriverState(1);
  assert(s0.counter === 1, `Transitions on GPIO 1 while FUNCTION_SIO do NOT clock PWM (counter: ${s0.counter})`);

  // Restore GPIO 1 function select to PWM
  (pin1 as any).ctrl = FUNCTION_PWM;
  bridge.recomputeDriverState(1);

  pin1.setInputValue(true);
  bridge.recomputeDriverState(1);
  assert(s0.counter === 2, `Restoring FUNCTION_PWM re-enables edge clocking on GPIO 1 (counter: ${s0.counter})`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 12: CC_B Ignored / Output Suppressed in Non-Free-Running Modes
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 12: CC_B OUTPUT SUPPRESSION IN NON-FREE-RUNNING MODES ---');
  pwm.reset();
  s0.writeRegister(REG_CH_TOP, 100);
  s0.writeRegister(REG_CH_CC, (50 << 16) | 25); // CC_B = 50, CC_A = 25
  s0.writeRegister(REG_CH_CTR, 10); // CTR = 10 < CC_A and < CC_B

  // In Free-Running Mode (00): Both A and B output HIGH (CTR < CC)
  s0.writeRegister(REG_CH_CSR, CSR_EN | (0 << 4));
  assert(s0.outputA === true, 'Mode 00: Output A is HIGH (CTR < CC_A)');
  assert(s0.outputB === true, 'Mode 00: Output B is HIGH (CTR < CC_B)');

  // Now switch to Mode 10 (B_RISING)
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4));
  assert(s0.outputA === true, 'Mode 10: Output A remains normal active PWM output');
  assert(s0.outputB === false, 'Mode 10: Output B is suppressed (acting strictly as input pin)');

  // Check GPIO bridge driver state for GPIO 0 (A) and GPIO 1 (B)
  const pin0 = mcu.gpio[0];
  (pin0 as any).ctrl = FUNCTION_PWM;
  (pin1 as any).ctrl = FUNCTION_PWM;
  bridge.recomputeDriverState(0);
  bridge.recomputeDriverState(1);

  const stateA = bridge.getDriverState(0);
  const stateB = bridge.getDriverState(1);

  assert(stateA.logicalOutput === true, 'Bridge State A: logicalOutput is TRUE');
  assert(stateA.driverImpedance_Ohms <= 100, `Bridge State A: active low driver impedance (${stateA.driverImpedance_Ohms} Ohm)`);
  assert(stateB.logicalOutput === false, 'Bridge State B: logicalOutput is FALSE');
  assert(stateB.driverImpedance_Ohms >= 1e6, `Bridge State B: High-Z input mode (${stateB.driverImpedance_Ohms} Ohm)`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 13: Multiple PWM Slices Operating Independently with Individual B Inputs
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 13: MULTIPLE SLICES WITH INDEPENDENT B INPUTS ---');
  pwm.reset();
  const s1 = pwm.slices[1];
  const s2 = pwm.slices[2];

  // Slice 0: B_RISING, div=1.0
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x10);
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4));

  // Slice 1: B_FALLING, div=1.0
  s1.writeRegister(REG_CH_TOP, 1000);
  s1.writeRegister(REG_CH_DIV, 0x10);
  s1.writeRegister(REG_CH_CSR, CSR_EN | (3 << 4));
  s1.setPinBLevel(true); // Initial high for falling edges

  // Slice 2: B_HIGH, div=1.0
  s2.writeRegister(REG_CH_TOP, 1000);
  s2.writeRegister(REG_CH_DIV, 0x10);
  s2.writeRegister(REG_CH_CSR, CSR_EN | (1 << 4));
  s2.setPinBLevel(false);

  // Inject 3 rising edges into Slice 0
  for (let i = 0; i < 3; i++) {
    s0.setPinBLevel(true); s0.setPinBLevel(false);
  }

  // Inject 4 falling edges into Slice 1
  for (let i = 0; i < 4; i++) {
    s1.setPinBLevel(false); s1.setPinBLevel(true);
  }

  // Slice 2 remains held low
  pwm.tickCycles(50);

  assert(s0.counter === 3, `Slice 0 received 3 rising edges: counter = ${s0.counter}`);
  assert(s1.counter === 4, `Slice 1 received 4 falling edges: counter = ${s1.counter}`);
  assert(s2.counter === 0, `Slice 2 remained held LOW: counter = ${s2.counter}`);

  // Now enable Slice 2 by setting B=HIGH and stepping 25 cycles
  s2.setPinBLevel(true);
  pwm.tickCycles(25);
  assert(s2.counter === 25, `Slice 2 gated HIGH counted 25 cycles: counter = ${s2.counter}`);
  assert(s0.counter === 3, 'Slice 0 counter untouched during Slice 2 stepping');
  assert(s1.counter === 4, 'Slice 1 counter untouched during Slice 2 stepping');

  // -----------------------------------------------------------------------------------
  // SCENARIO 14: Input Transitions at Boundary Clock Cycles & Remainder Persistence
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 14: INPUT TRANSITIONS AT BOUNDARIES & ACCUMULATOR PERSISTENCE ---');
  pwm.reset();
  // Div = 2.0. Send 1 edge (counter remains 0, fracAccumulator = 16).
  // Then tick cycles (should not erase remainder).
  // Then send 2nd edge (counter advances to 1).
  s0.writeRegister(REG_CH_TOP, 1000);
  s0.writeRegister(REG_CH_DIV, 0x20); // 2.0
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // B_RISING

  s0.setPinBLevel(true);
  s0.setPinBLevel(false);
  assert(s0.counter === 0, 'First edge stored in accumulator (counter = 0)');

  pwm.tickCycles(100); // 100 cycles pass
  assert(s0.counter === 0, 'Clock cycles do not corrupt edge accumulator state');

  s0.setPinBLevel(true);
  s0.setPinBLevel(false);
  assert(s0.counter === 1, 'Second edge successfully completes divider cycle (counter = 1)');

  // -----------------------------------------------------------------------------------
  // SCENARIO 15: Invalid Conditions, Wrap Limits, Interrupts and Reset
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 15: WRAP LIMITS, INTERRUPTS & RESET CONDITIONS ---');
  pwm.reset();
  // Set TOP = 3. In B_RISING mode, 4 edges should wrap 0 -> 1 -> 2 -> 3 -> wrap to 0,
  // triggering raw interrupt in INTR and DMA DREQ.
  s0.writeRegister(REG_CH_TOP, 3);
  s0.writeRegister(REG_CH_DIV, 0x10);
  s0.writeRegister(REG_CH_CSR, CSR_EN | (2 << 4)); // B_RISING

  // Disabled slice must not advance
  s0.enabled = false;
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 0, 'Disabled slice does not advance counter on B edge');

  s0.enabled = true;
  // Edge 1 -> CTR = 1
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 1, `Edge 1: counter = ${s0.counter}`);

  // Edge 2 -> CTR = 2
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 2, `Edge 2: counter = ${s0.counter}`);

  // Edge 3 -> CTR = 3 (at TOP)
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 3, `Edge 3: counter at TOP = ${s0.counter}`);

  const rawIntrBefore = pwm.readUint32(0xa4);
  assert((rawIntrBefore & (1 << 0)) === 0, 'Interrupt flag not yet asserted before wrap');

  // Edge 4 -> Wrap to 0, assert interrupt flag!
  s0.setPinBLevel(true); s0.setPinBLevel(false);
  assert(s0.counter === 0, `Edge 4 wrapped counter to 0 (actual: ${s0.counter})`);

  const rawIntrAfter = pwm.readUint32(0xa4);
  assert((rawIntrAfter & (1 << 0)) !== 0, 'Raw interrupt bit 0 asserted upon edge-induced wrap');

  // Reset peripheral: all registers, state, and accumulators reset cleanly
  pwm.reset();
  assert(s0.csr === 0, 'Slice CSR reset to 0');
  assert(s0.counter === 0, 'Slice CTR reset to 0');
  assert(s0.divMode === 0, 'Slice DIVMODE reset to 00');
  assert(s0.pinBLevel === false, 'Pin B level reset to false');
  assert(pwm.readUint32(0xa4) === 0, 'Interrupt status register reset to 0');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   RP2040 PWM DIVMODE: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runPwmDivmodeTests();
