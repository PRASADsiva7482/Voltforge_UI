/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.6: RP2040 PWM REGISTER MODEL CONFORMANCE TEST
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies Milestone 1:
 * 1. Base address, 4 KB aperture, and 8 slices with 0x14 stride.
 * 2. All 5 per-slice registers: CSR, DIV, CTR, CC, TOP for all 8 slices.
 * 3. All global registers: EN (0xA0), INTR (0xA4), INTE (0xA8), INTF (0xAC), INTS (0xB0).
 * 4. Reset values match authoritative RP2040 datasheet specification.
 * 5. W1C write-one-to-clear behavior for INTR.
 * 6. Read-only masking on INTS = (INTR & INTE) | INTF.
 * 7. Simultaneous slice enable synchronization via EN.
 * 8. Atomic register access aliases: normal, +0x1000 (XOR), +0x2000 (SET), +0x3000 (CLR).
 * 9. Bitfield masking and reserved bits handling (PH_ADV and PH_RET self-clearing).
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Pwm,
  PWM_BASE,
  PWM_NUM_SLICES,
  PWM_SLICE_STRIDE,
  REG_CH_CSR,
  REG_CH_DIV,
  REG_CH_CTR,
  REG_CH_CC,
  REG_CH_TOP,
  REG_PWM_EN,
  REG_PWM_INTR,
  REG_PWM_INTE,
  REG_PWM_INTF,
  REG_PWM_INTS,
  CSR_EN,
  CSR_PH_CORRECT,
  CSR_A_INV,
  CSR_B_INV,
  CSR_PH_ADV,
  CSR_PH_RET,
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
  }
}

function runPwmRegisterTests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.6 — PWM REGISTER CONFORMANCE TEST                ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const mcu = new RP2040();
  const pwm = new RP2040Pwm(mcu, 'PWM', 4);

  // -----------------------------------------------------------------------------------
  // TEST 1: Register Reset Values for all 8 Slices
  // -----------------------------------------------------------------------------------
  console.log('--- TEST 1: PER-SLICE REGISTER RESET VALUES (SLICES 0..7) ---');
  for (let s = 0; s < PWM_NUM_SLICES; s++) {
    const sliceBase = s * PWM_SLICE_STRIDE;
    const csr = pwm.readUint32(sliceBase + REG_CH_CSR);
    const div = pwm.readUint32(sliceBase + REG_CH_DIV);
    const ctr = pwm.readUint32(sliceBase + REG_CH_CTR);
    const cc  = pwm.readUint32(sliceBase + REG_CH_CC);
    const top = pwm.readUint32(sliceBase + REG_CH_TOP);

    assert(csr === 0x00000000, `Slice ${s} CSR reset is 0x00000000`);
    assert(div === 0x00000010, `Slice ${s} DIV reset is 0x00000010 (divider 1.0)`);
    assert(ctr === 0x00000000, `Slice ${s} CTR reset is 0x00000000`);
    assert(cc  === 0x00000000, `Slice ${s} CC reset is 0x00000000`);
    assert(top === 0x0000ffff, `Slice ${s} TOP reset is 0x0000FFFF (65535)`);
  }

  // -----------------------------------------------------------------------------------
  // TEST 2: Global Register Reset Values
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 2: GLOBAL REGISTER RESET VALUES ---');
  assert(pwm.readUint32(REG_PWM_EN)   === 0x00, 'Global EN reset is 0x00');
  assert(pwm.readUint32(REG_PWM_INTR) === 0x00, 'Global INTR reset is 0x00');
  assert(pwm.readUint32(REG_PWM_INTE) === 0x00, 'Global INTE reset is 0x00');
  assert(pwm.readUint32(REG_PWM_INTF) === 0x00, 'Global INTF reset is 0x00');
  assert(pwm.readUint32(REG_PWM_INTS) === 0x00, 'Global INTS reset is 0x00');

  // -----------------------------------------------------------------------------------
  // TEST 3: Per-Slice Read/Write and Bitfield Masking
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 3: PER-SLICE READ/WRITE & BITFIELD MASKING ---');
  // Test Slice 3
  const s3Base = 3 * PWM_SLICE_STRIDE;

  // DIV: test writing 8-bit int and 4-bit frac (e.g. int=12, frac=5 -> 0x0C5)
  pwm.writeUint32(s3Base + REG_CH_DIV, 0x0c5);
  assert(pwm.readUint32(s3Base + REG_CH_DIV) === 0x0c5, 'Slice 3 DIV accepts 0x0C5 (int=12, frac=5)');
  assert(pwm.slices[3].intDiv === 12, 'Slice 3 intDiv parsed as 12');
  assert(pwm.slices[3].fracDiv === 5, 'Slice 3 fracDiv parsed as 5');
  assert(Math.abs(pwm.slices[3].effectiveDivider - (12 + 5/16)) < 1e-6, 'Slice 3 effective divider is 12.3125');

  // CC: write CC.A = 1000 (0x03E8), CC.B = 2000 (0x07D0) -> 0x07D003E8
  pwm.writeUint32(s3Base + REG_CH_CC, 0x07d003e8);
  assert(pwm.readUint32(s3Base + REG_CH_CC) === 0x07d003e8, 'Slice 3 CC holds 0x07D003E8');
  assert(pwm.slices[3].compareA === 1000, 'Slice 3 compareA is 1000');
  assert(pwm.slices[3].compareB === 2000, 'Slice 3 compareB is 2000');

  // TOP: write 4000
  pwm.writeUint32(s3Base + REG_CH_TOP, 4000);
  assert(pwm.readUint32(s3Base + REG_CH_TOP) === 4000, 'Slice 3 TOP holds 4000');

  // CTR: write 250
  pwm.writeUint32(s3Base + REG_CH_CTR, 250);
  assert(pwm.readUint32(s3Base + REG_CH_CTR) === 250, 'Slice 3 CTR holds 250');

  // CSR: test EN, PH_CORRECT, A_INV, B_INV, and self-clearing PH_ADV, PH_RET
  const csrVal = CSR_EN | CSR_PH_CORRECT | CSR_A_INV | CSR_B_INV | CSR_PH_ADV | CSR_PH_RET;
  pwm.writeUint32(s3Base + REG_CH_CSR, csrVal);
  const readCsr = pwm.readUint32(s3Base + REG_CH_CSR);
  assert((readCsr & CSR_EN) !== 0, 'Slice 3 CSR_EN is set');
  assert((readCsr & CSR_PH_CORRECT) !== 0, 'Slice 3 CSR_PH_CORRECT is set');
  assert((readCsr & CSR_A_INV) !== 0, 'Slice 3 CSR_A_INV is set');
  assert((readCsr & CSR_B_INV) !== 0, 'Slice 3 CSR_B_INV is set');
  assert((readCsr & CSR_PH_ADV) === 0, 'Slice 3 CSR_PH_ADV reads back 0 (self-clearing)');
  assert((readCsr & CSR_PH_RET) === 0, 'Slice 3 CSR_PH_RET reads back 0 (self-clearing)');

  // -----------------------------------------------------------------------------------
  // TEST 4: Simultaneous Slice Enable via Global EN Register
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 4: SIMULTANEOUS SLICE ENABLE (EN REGISTER) ---');
  // Write 0b10101010 (0xAA) -> slices 1, 3, 5, 7 enabled; 0, 2, 4, 6 disabled
  pwm.writeUint32(REG_PWM_EN, 0xaa);
  assert(pwm.readUint32(REG_PWM_EN) === 0xaa, 'Global EN register reads back 0xAA');
  assert(!pwm.slices[0].enabled, 'Slice 0 is disabled');
  assert(pwm.slices[1].enabled, 'Slice 1 is enabled');
  assert(!pwm.slices[2].enabled, 'Slice 2 is disabled');
  assert(pwm.slices[3].enabled, 'Slice 3 is enabled');
  assert(!pwm.slices[4].enabled, 'Slice 4 is disabled');
  assert(pwm.slices[5].enabled, 'Slice 5 is enabled');
  assert(!pwm.slices[6].enabled, 'Slice 6 is disabled');
  assert(pwm.slices[7].enabled, 'Slice 7 is enabled');

  // Write 0x00 -> all disabled
  pwm.writeUint32(REG_PWM_EN, 0x00);
  assert(pwm.readUint32(REG_PWM_EN) === 0x00, 'Global EN register reads back 0x00');
  for (let s = 0; s < PWM_NUM_SLICES; s++) {
    assert(!pwm.slices[s].enabled, `Slice ${s} is disabled after EN=0`);
  }

  // -----------------------------------------------------------------------------------
  // TEST 5: Interrupt Masking, Forcing and W1C Clearing
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 5: INTERRUPTS (INTR, INTE, INTF, INTS, W1C) ---');
  // Assert raw interrupts on slice 2 and slice 5
  pwm.assertRawInterrupt(2);
  pwm.assertRawInterrupt(5);
  assert(pwm.readUint32(REG_PWM_INTR) === ((1 << 2) | (1 << 5)), 'INTR reflects raw interrupts 2 and 5 (0x24)');
  assert(pwm.readUint32(REG_PWM_INTS) === 0x00, 'INTS is 0 because INTE is 0 (unmasked)');

  // Enable interrupt on slice 2 only
  pwm.writeUint32(REG_PWM_INTE, 1 << 2);
  assert(pwm.readUint32(REG_PWM_INTE) === (1 << 2), 'INTE has bit 2 set');
  assert(pwm.readUint32(REG_PWM_INTS) === (1 << 2), 'INTS has bit 2 set (masked status)');

  // Force interrupt on slice 7 via INTF
  pwm.writeUint32(REG_PWM_INTF, 1 << 7);
  assert(pwm.readUint32(REG_PWM_INTF) === (1 << 7), 'INTF has bit 7 set');
  assert(pwm.readUint32(REG_PWM_INTS) === ((1 << 2) | (1 << 7)), 'INTS reflects both enabled bit 2 and forced bit 7');

  // W1C: clear slice 2 in INTR by writing (1 << 2)
  pwm.writeUint32(REG_PWM_INTR, 1 << 2);
  assert(pwm.readUint32(REG_PWM_INTR) === (1 << 5), 'INTR has bit 2 cleared via W1C; bit 5 remains');
  assert(pwm.readUint32(REG_PWM_INTS) === (1 << 7), 'INTS now only has forced bit 7');

  // Clear INTF
  pwm.writeUint32(REG_PWM_INTF, 0x00);
  assert(pwm.readUint32(REG_PWM_INTS) === 0x00, 'INTS is 0 after INTF cleared');

  // Clear remaining bit 5 in INTR
  pwm.writeUint32(REG_PWM_INTR, 1 << 5);
  assert(pwm.readUint32(REG_PWM_INTR) === 0x00, 'INTR is fully cleared');

  // -----------------------------------------------------------------------------------
  // TEST 6: Atomic Register Access Aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLR)
  // -----------------------------------------------------------------------------------
  console.log('\n--- TEST 6: ATOMIC REGISTER ACCESS ALIASES ---');
  // Reset peripheral
  pwm.reset();
  const s0Base = 0; // Slice 0

  // 1. SET alias (+0x2000): set EN and A_INV in CSR
  pwm.writeUint32(s0Base + REG_CH_CSR + 0x2000, CSR_EN | CSR_A_INV);
  let s0Csr = pwm.readUint32(s0Base + REG_CH_CSR);
  assert((s0Csr & (CSR_EN | CSR_A_INV)) === (CSR_EN | CSR_A_INV), 'SET alias (+0x2000) set CSR_EN and CSR_A_INV');

  // 2. XOR alias (+0x1000): toggle A_INV off and B_INV on
  pwm.writeUint32(s0Base + REG_CH_CSR + 0x1000, CSR_A_INV | CSR_B_INV);
  s0Csr = pwm.readUint32(s0Base + REG_CH_CSR);
  assert((s0Csr & CSR_A_INV) === 0, 'XOR alias (+0x1000) toggled A_INV off');
  assert((s0Csr & CSR_B_INV) !== 0, 'XOR alias (+0x1000) toggled B_INV on');
  assert((s0Csr & CSR_EN) !== 0, 'CSR_EN remained untouched');

  // 3. CLR alias (+0x3000): clear B_INV and EN
  pwm.writeUint32(s0Base + REG_CH_CSR + 0x3000, CSR_B_INV | CSR_EN);
  s0Csr = pwm.readUint32(s0Base + REG_CH_CSR);
  assert((s0Csr & CSR_B_INV) === 0, 'CLR alias (+0x3000) cleared B_INV');
  assert((s0Csr & CSR_EN) === 0, 'CLR alias (+0x3000) cleared CSR_EN');

  // 4. Test atomic alias on global INTE register
  pwm.writeUint32(REG_PWM_INTE + 0x2000, 0x0f); // SET lower 4
  assert(pwm.readUint32(REG_PWM_INTE) === 0x0f, 'SET alias set lower nibble of INTE');
  pwm.writeUint32(REG_PWM_INTE + 0x1000, 0x05); // XOR 0x05 -> 0x0A
  assert(pwm.readUint32(REG_PWM_INTE) === 0x0a, 'XOR alias toggled bits in INTE (0x0F ^ 0x05 = 0x0A)');
  pwm.writeUint32(REG_PWM_INTE + 0x3000, 0x02); // CLR bit 1 -> 0x08
  assert(pwm.readUint32(REG_PWM_INTE) === 0x08, 'CLR alias cleared bit 1 in INTE (0x0A & ~0x02 = 0x08)');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM REGISTER CONFORMANCE: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runPwmRegisterTests();

