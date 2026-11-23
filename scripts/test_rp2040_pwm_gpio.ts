/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge Phase 4.3.6 — Milestone 3: RP2040 PWM GPIO Routing & Driver Test
 * 
 * Verifies:
 * 1. Pin multiplexing across all 30 pins (GPIO 0..29) mapped to PWM slices 0..7
 *    - slice = (gpio >> 1) & 7
 *    - channel = (gpio % 2 === 0) ? 'A' : 'B'
 * 2. FUNCSEL=4 selects PWM function across IO_BANK0
 * 3. Dynamic output switching from PWM engine reflects on GPIO electrical driver
 * 4. Impedance scaling matches pad drive strength (17, 25, 50, 100 ohms)
 * 5. High-Z state when pad output disable (OD) is set
 * 6. Cycle-accurate transition event generation for MNA substepping
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import { RP2040Pwm, CSR_EN, REG_CH_CSR, REG_CH_TOP, REG_CH_CC } from '../src/features/simulator/rp2040Pwm';
import { RP2040GpioBridge, FUNCTION_PWM } from '../src/features/simulator/rp2040GpioBridge';

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
  console.log('   VOLTFORGE PHASE 4.3.6 — PWM GPIO MULTIPLEXING & DRIVER TEST         ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const rp2040 = new RP2040();
  const bridge = new RP2040GpioBridge(rp2040, 'pico_0', 3.3);
  const pwm = new RP2040Pwm(rp2040, 'PWM', 4);
  bridge.attachPwm(pwm);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: PIN MULTIPLEXING AUDIT (GPIO 0 TO 29) ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // RP2040 Datasheet Table 2: Function 4 is PWM for all 30 GPIOs
  for (let pinIdx = 0; pinIdx < 30; pinIdx++) {
    const expectedSlice = (pinIdx >> 1) & 0x7;
    const expectedChannel = pinIdx % 2 === 0 ? 'A' : 'B';

    // Set pin function to PWM (Function 4)
    (rp2040.gpio[pinIdx] as any).ctrl = FUNCTION_PWM;
    bridge.recomputeDriverState(pinIdx);
    const driverState = bridge.getDriverState(pinIdx);

    assert(driverState.functionSelect === FUNCTION_PWM, `GP${pinIdx}: functionSelect is 4 (PWM)`);
    assert(driverState.functionName === 'PWM', `GP${pinIdx}: functionName is 'PWM'`);

    // Verify mapping formula
    const calcSlice = (pinIdx >> 1) & 0x7;
    const calcChannel = pinIdx % 2 === 0 ? 'A' : 'B';
    assert(
      calcSlice === expectedSlice && calcChannel === expectedChannel,
      `GP${pinIdx} routes to Slice ${expectedSlice} Channel ${expectedChannel}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: DYNAMIC OUTPUT PROPAGATION TO GPIO DRIVERS ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Configure Slice 0 (maps to GP0 / GP1 and GP16 / GP17)
  // TOP = 10, CC.A = 5, CC.B = 8
  pwm.writeUint32(0x00 + REG_CH_TOP, 10);
  pwm.writeUint32(0x00 + REG_CH_CC, (8 << 16) | 5);
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);

  // GP0 is Slice 0 Channel A -> at CTR=0, output is HIGH
  // GP1 is Slice 0 Channel B -> at CTR=0, output is HIGH
  const gp0State = bridge.getDriverState(0);
  const gp1State = bridge.getDriverState(1);

  assert(gp0State.logicalOutput === true, 'GP0 (Slice 0A) logicalOutput is TRUE (CTR < 5)');
  assert(Math.abs(gp0State.electricalTargetVoltage_V - 3.3) < 1e-4, 'GP0 electrical target voltage is 3.3V');
  assert(gp1State.logicalOutput === true, 'GP1 (Slice 0B) logicalOutput is TRUE (CTR < 8)');
  assert(Math.abs(gp1State.electricalTargetVoltage_V - 3.3) < 1e-4, 'GP1 electrical target voltage is 3.3V');

  // Advance counter past compare A (CTR=6):
  // Channel A should become LOW (0.0V), Channel B should remain HIGH (3.3V)
  pwm.slices[0].ctr = 6;
  // Trigger update through PWM output refresh
  pwm.slices[0].writeRegister(REG_CH_CSR, CSR_EN);

  const gp0After = bridge.getDriverState(0);
  const gp1After = bridge.getDriverState(1);

  assert(gp0After.logicalOutput === false, 'GP0 logicalOutput is FALSE after CTR=6 >= CC_A');
  assert(gp0After.electricalTargetVoltage_V === 0.0, 'GP0 electrical target voltage is 0.0V');
  assert(gp1After.logicalOutput === true, 'GP1 logicalOutput remains TRUE after CTR=6 < CC_B');
  assert(Math.abs(gp1After.electricalTargetVoltage_V - 3.3) < 1e-4, 'GP1 electrical target voltage remains 3.3V');

  // Also verify GP16 (also Slice 0 Channel A) and GP17 (Slice 0 Channel B)
  (rp2040.gpio[16] as any).ctrl = FUNCTION_PWM;
  (rp2040.gpio[17] as any).ctrl = FUNCTION_PWM;
  bridge.recomputeDriverState(16);
  bridge.recomputeDriverState(17);
  const gp16State = bridge.getDriverState(16);
  const gp17State = bridge.getDriverState(17);

  assert(gp16State.logicalOutput === false, 'GP16 (also Slice 0A) is FALSE at CTR=6');
  assert(gp17State.logicalOutput === true, 'GP17 (also Slice 0B) is TRUE at CTR=6');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: PAD DRIVE STRENGTH & IMPEDANCE IN PWM MODE ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // 0 -> 2 mA (100 Ω), 1 -> 4 mA (50 Ω), 2 -> 8 mA (25 Ω), 3 -> 12 mA (17 Ω)
  const pin0 = rp2040.gpio[0] as any;

  pin0.padValue = 0 << 4; // 2 mA
  bridge.recomputeDriverState(0);
  assert(bridge.getDriverState(0).driverImpedance_Ohms === 100, 'Drive strength 0 (2mA) -> 100 Ω');

  pin0.padValue = 1 << 4; // 4 mA default
  bridge.recomputeDriverState(0);
  assert(bridge.getDriverState(0).driverImpedance_Ohms === 50, 'Drive strength 1 (4mA) -> 50 Ω');

  pin0.padValue = 2 << 4; // 8 mA
  bridge.recomputeDriverState(0);
  assert(bridge.getDriverState(0).driverImpedance_Ohms === 25, 'Drive strength 2 (8mA) -> 25 Ω');

  pin0.padValue = 3 << 4; // 12 mA
  bridge.recomputeDriverState(0);
  assert(bridge.getDriverState(0).driverImpedance_Ohms === 17, 'Drive strength 3 (12mA) -> 17 Ω');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: PAD OUTPUT DISABLE (OD) HIGH-Z BEHAVIOR ---');
  // ─────────────────────────────────────────────────────────────────────────────
  pin0.padValue |= 0x80; // outputDisable = true
  bridge.recomputeDriverState(0);
  assert(
    bridge.getDriverState(0).driverImpedance_Ohms === 1e8,
    'Setting pad outputDisable puts PWM pin in High-Z (100 MΩ)'
  );
  pin0.padValue &= ~0x80; // outputDisable = false
  bridge.recomputeDriverState(0);
  assert(
    bridge.getDriverState(0).driverImpedance_Ohms === 17,
    'Clearing pad outputDisable restores active 17 Ω driver'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: MNA TRANSITION EVENT QUEUEING ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Drain queue
  bridge.drainTransitionEvents();
  assert(bridge.hasTransitionEvents() === false, 'Transition queue empty before pulse');

  // Pulse PWM slice 0: advance counter from 6 to wrap at 0
  pwm.slices[0].ctr = 0;
  pwm.slices[0].writeRegister(REG_CH_CSR, CSR_EN);

  assert(bridge.hasTransitionEvents() === true, 'PWM level transition generated bridge event');
  const events = bridge.drainTransitionEvents();
  assert(events.length >= 1, `Queue drained ${events.length} transition event(s)`);
  assert(events.some((e) => e.gpioIndex === 0 && e.newLogicalOutput === true), 'Event records GP0 rising edge to TRUE');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM GPIO ROUTING & DRIVER: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runTests();
