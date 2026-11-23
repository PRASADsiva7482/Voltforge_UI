/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge Phase 4.3.6 — Milestone 2: RP2040 PWM Counter & Timing Engine Test
 * 
 * Verifies:
 * 1. Sawtooth up-counting (CTR 0 -> TOP -> 0) with period = TOP + 1
 * 2. Phase-correct dual-slope counting (CTR 0 -> TOP -> 0) with period = 2 * TOP
 * 3. 8.4 fractional clock divider timing across standard divider ratios
 * 4. Output compare match on channels A and B (CTR < CC = HIGH, CTR >= CC = LOW)
 * 5. Double-buffered CC and TOP latching strictly on counter wrap
 * 6. Polarity inversion (A_INV, B_INV)
 * 7. Phase advance and retard nudges (PH_ADV, PH_RET)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Pwm,
  CSR_EN,
  CSR_PH_CORRECT,
  CSR_A_INV,
  CSR_B_INV,
  CSR_PH_ADV,
  CSR_PH_RET,
  REG_CH_CSR,
  REG_CH_DIV,
  REG_CH_CTR,
  REG_CH_CC,
  REG_CH_TOP,
} from '../src/features/simulator/rp2040Pwm';

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
  console.log('   VOLTFORGE PHASE 4.3.6 — PWM COUNTER & TIMING ENGINE TEST             ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const rp2040 = new RP2040();
  const pwm = new RP2040Pwm(rp2040, 'PWM', 4);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: SAWTOOTH UP-COUNTING (FREE-RUNNING) ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Configure Slice 0: TOP = 4, DIV = 1.0 (int=1, frac=0), EN = 1
  pwm.writeUint32(0x00 + REG_CH_TOP, 4);
  pwm.writeUint32(0x00 + REG_CH_DIV, 0x10); // 1.0
  pwm.writeUint32(0x00 + REG_CH_CTR, 0);
  pwm.writeUint32(0x00 + REG_CH_CC, (3 << 16) | 2); // CC.B = 3, CC.A = 2
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);

  const slice0 = pwm.slices[0];
  assert(slice0.ctr === 0, 'Slice 0 starts at CTR 0');
  assert(slice0.outputA === true, 'CTR=0 < CC_A=2 -> Output A is HIGH');
  assert(slice0.outputB === true, 'CTR=0 < CC_B=3 -> Output B is HIGH');

  // Step 1 cycle -> CTR=1
  pwm.tickCycles(1);
  assert(slice0.ctr === 1, 'After 1 cycle, CTR is 1');
  assert(slice0.outputA === true, 'CTR=1 < CC_A=2 -> Output A remains HIGH');
  assert(slice0.outputB === true, 'CTR=1 < CC_B=3 -> Output B remains HIGH');

  // Step 1 cycle -> CTR=2
  pwm.tickCycles(1);
  assert(slice0.ctr === 2, 'After 2 cycles, CTR is 2');
  assert(slice0.outputA === false, 'CTR=2 >= CC_A=2 -> Output A transitions to LOW');
  assert(slice0.outputB === true, 'CTR=2 < CC_B=3 -> Output B remains HIGH');

  // Step 1 cycle -> CTR=3
  pwm.tickCycles(1);
  assert(slice0.ctr === 3, 'After 3 cycles, CTR is 3');
  assert(slice0.outputA === false, 'CTR=3 >= CC_A=2 -> Output A is LOW');
  assert(slice0.outputB === false, 'CTR=3 >= CC_B=3 -> Output B transitions to LOW');

  // Step 1 cycle -> CTR=4 (TOP)
  pwm.tickCycles(1);
  assert(slice0.ctr === 4, 'After 4 cycles, CTR reaches TOP (4)');
  assert(slice0.outputA === false, 'CTR=4 >= CC_A=2 -> Output A is LOW');
  assert(slice0.outputB === false, 'CTR=4 >= CC_B=3 -> Output B is LOW');

  // Step 1 cycle -> wrap to CTR=0
  pwm.tickCycles(1);
  assert(slice0.ctr === 0, 'After 5 cycles, CTR wraps to 0 (period = TOP + 1 = 5)');
  assert(slice0.outputA === true, 'CTR=0 < CC_A=2 -> Output A returns to HIGH');
  assert(slice0.outputB === true, 'CTR=0 < CC_B=3 -> Output B returns to HIGH');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: PHASE-CORRECT DUAL-SLOPE COUNTING ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Configure Slice 1: TOP = 3, DIV = 1.0, PH_CORRECT = 1, CC.A = 2
  pwm.writeUint32(0x14 + REG_CH_TOP, 3);
  pwm.writeUint32(0x14 + REG_CH_DIV, 0x10);
  pwm.writeUint32(0x14 + REG_CH_CTR, 0);
  pwm.writeUint32(0x14 + REG_CH_CC, 2);
  pwm.writeUint32(0x14 + REG_CH_CSR, CSR_EN | CSR_PH_CORRECT);

  const slice1 = pwm.slices[1];
  assert(slice1.phaseCorrect === true, 'Slice 1 configured for phase-correct mode');

  // Sequence of counts for TOP=3 in phase-correct mode:
  // 0 -> 1 -> 2 -> 3 -> 2 -> 1 -> 0 (wrap on next tick) -> 1 ...
  // Total period = 2 * TOP = 6 cycles!
  const expectedCounts = [1, 2, 3, 2, 1, 0];
  const expectedA = [true, false, false, false, true, true]; // CC_A = 2 -> HIGH when CTR < 2

  for (let step = 0; step < 6; step++) {
    pwm.tickCycles(1);
    assert(slice1.ctr === expectedCounts[step], `Step ${step + 1}: CTR is ${expectedCounts[step]}`);
    assert(slice1.outputA === expectedA[step], `Step ${step + 1}: Output A is ${expectedA[step]}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: 8.4 FRACTIONAL CLOCK DIVIDER ACCURACY ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Test integer divider: DIV = 4.0 (0x40)
  pwm.writeUint32(0x28 + REG_CH_TOP, 10);
  pwm.writeUint32(0x28 + REG_CH_DIV, 0x40); // 4.0
  pwm.writeUint32(0x28 + REG_CH_CTR, 0);
  pwm.writeUint32(0x28 + REG_CH_CSR, CSR_EN);

  const slice2 = pwm.slices[2];
  pwm.tickCycles(3);
  assert(slice2.ctr === 0, 'DIV=4.0: after 3 cycles CTR is still 0');
  pwm.tickCycles(1);
  assert(slice2.ctr === 1, 'DIV=4.0: after 4th cycle CTR increments to 1');
  pwm.tickCycles(4);
  assert(slice2.ctr === 2, 'DIV=4.0: after 8th cycle CTR increments to 2');

  // Test fractional divider: DIV = 2.5 (0x28 -> int=2, frac=8 -> 8/16 = 0.5)
  // Over 10 cycles, it should advance exactly 10 / 2.5 = 4 ticks.
  pwm.writeUint32(0x3C + REG_CH_TOP, 100);
  pwm.writeUint32(0x3C + REG_CH_DIV, (2 << 4) | 8); // 2.5
  pwm.writeUint32(0x3C + REG_CH_CTR, 0);
  pwm.writeUint32(0x3C + REG_CH_CSR, CSR_EN);

  const slice3 = pwm.slices[3];
  pwm.tickCycles(10);
  assert(slice3.ctr === 4, 'DIV=2.5: exactly 4 counts in 10 system cycles (10 / 2.5 = 4)');
  pwm.tickCycles(10);
  assert(slice3.ctr === 8, 'DIV=2.5: exactly 8 counts in 20 system cycles (20 / 2.5 = 8)');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: DOUBLE-BUFFERED REGISTER LATCHING ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // In RP2040, writes to CC and TOP while running are buffered and only committed on WRAP.
  pwm.writeUint32(0x00 + REG_CH_CSR, 0); // Disable first to set initial configuration
  pwm.writeUint32(0x00 + REG_CH_TOP, 5); // Current TOP = 5
  pwm.writeUint32(0x00 + REG_CH_CTR, 1);
  pwm.writeUint32(0x00 + REG_CH_CC, 1);  // CC_A = 1
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN); // Enable commits initial buffered values

  // Write new TOP = 10 and new CC_A = 4 while running
  pwm.writeUint32(0x00 + REG_CH_TOP, 10);
  pwm.writeUint32(0x00 + REG_CH_CC, 4);

  // Before wrap, latched CC and TOP must retain previous values
  assert(slice0.latchedCompareA === 1, 'Before wrap, latched CC_A is still 1');
  assert(slice0.latchedTOP === 5, 'Before wrap, latched TOP is still 5');
  assert(slice0.compareA === 4, 'Register CC_A reflects pending write 4');
  assert(slice0.top === 10, 'Register TOP reflects pending write 10');

  // Advance counter to wrap (CTR goes 1 -> 2 -> 3 -> 4 -> 5 -> 0 wrap!)
  pwm.tickCycles(4); // CTR = 5
  assert(slice0.ctr === 5, 'CTR reached 5');
  assert(slice0.latchedTOP === 5, 'Still latched at 5 before wrap transition');

  pwm.tickCycles(1); // wrap occurs
  assert(slice0.ctr === 0, 'CTR wrapped to 0');
  assert(slice0.latchedCompareA === 4, 'On wrap, latched CC_A updated to 4');
  assert(slice0.latchedTOP === 10, 'On wrap, latched TOP updated to 10');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: POLARITY INVERSION (A_INV, B_INV) ---');
  // ─────────────────────────────────────────────────────────────────────────────
  pwm.writeUint32(0x00 + REG_CH_CSR, 0); // Disable to commit initial values
  pwm.writeUint32(0x00 + REG_CH_TOP, 10);
  pwm.writeUint32(0x00 + REG_CH_CC, (5 << 16) | 5);
  pwm.writeUint32(0x00 + REG_CH_CTR, 0);
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);

  // At CTR=0 < 5: normal rawOutA=true, rawOutB=true
  assert(slice0.outputA === true, 'Normal polarity: Output A is HIGH at CTR=0');
  assert(slice0.outputB === true, 'Normal polarity: Output B is HIGH at CTR=0');

  // Invert A
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN | CSR_A_INV);
  assert(slice0.outputA === false, 'A_INV=1: Output A is inverted to LOW');
  assert(slice0.outputB === true, 'B_INV=0: Output B remains HIGH');

  // Invert both
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN | CSR_A_INV | CSR_B_INV);
  assert(slice0.outputA === false, 'A_INV=1: Output A is LOW');
  assert(slice0.outputB === false, 'B_INV=1: Output B is inverted to LOW');

  // Advance to CTR=6 >= 5 (raw is LOW)
  pwm.writeUint32(0x00 + REG_CH_CTR, 6);
  assert(slice0.outputA === true, 'A_INV=1 with raw LOW -> Output A is HIGH');
  assert(slice0.outputB === true, 'B_INV=1 with raw LOW -> Output B is HIGH');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: PHASE ADVANCE AND RETARD (PH_ADV, PH_RET) ---');
  // ─────────────────────────────────────────────────────────────────────────────
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN); // Clear inversion
  pwm.writeUint32(0x00 + REG_CH_CTR, 5);
  assert(slice0.ctr === 5, 'CTR starts at 5');

  // Advance by 1
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN | CSR_PH_ADV);
  assert(slice0.ctr === 6, 'PH_ADV incremented CTR from 5 to 6');
  assert((pwm.readUint32(0x00 + REG_CH_CSR) & CSR_PH_ADV) === 0, 'PH_ADV self-cleared');

  // Retard by 1
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN | CSR_PH_RET);
  assert(slice0.ctr === 5, 'PH_RET decremented CTR from 6 to 5');
  assert((pwm.readUint32(0x00 + REG_CH_CSR) & CSR_PH_RET) === 0, 'PH_RET self-cleared');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM COUNTER & TIMING ENGINE: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runTests();
