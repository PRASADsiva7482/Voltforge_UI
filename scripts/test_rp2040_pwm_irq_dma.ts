/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge Phase 4.3.6 — Milestone 4: RP2040 PWM Shared IRQ 4 & DMA Pacing Test
 * 
 * Verifies:
 * 1. Shared NVIC IRQ 4 delivery across all 8 PWM slices
 * 2. Raw interrupt capture in INTR on counter wrap (period limit reached)
 * 3. Interrupt masking via INTE and status reporting via INTS
 * 4. Write-1-to-Clear (W1C) semantics on INTR clearing NVIC IRQ 4 line
 * 5. Software interrupt forcing via INTF independent of counter wrap
 * 6. Multi-slice concurrent interrupt delivery and resolution
 * 7. Dedicated DMA pacing via DREQ 24..31 (DREQ_PWM_WRAP0..7)
 * 8. Real DMA controller channel pacing conditioned on PWM wrap events
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Pwm,
  PWM_IRQ_WRAP,
  DREQ_PWM_WRAP0,
  CSR_EN,
  REG_CH_CSR,
  REG_CH_TOP,
  REG_CH_CTR,
  REG_PWM_EN,
  REG_PWM_INTR,
  REG_PWM_INTE,
  REG_PWM_INTF,
  REG_PWM_INTS,
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
  console.log('   VOLTFORGE PHASE 4.3.6 — PWM IRQ 4 & DMA PACING TEST                 ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const rp2040 = new RP2040();
  const pwm = new RP2040Pwm(rp2040, 'PWM', PWM_IRQ_WRAP);

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: RAW WRAP INTERRUPT GENERATION & IRQ 4 MASKING ---');
  // ─────────────────────────────────────────────────────────────────────────────
  assert(PWM_IRQ_WRAP === 4, 'RP2040 PWM interrupt vector is IRQ 4 (PWM_IRQ_WRAP)');
  assert(
    (rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) === 0,
    'NVIC IRQ 4 is de-asserted at reset'
  );

  // Configure Slice 0 to wrap at TOP = 3
  pwm.writeUint32(0x00 + REG_CH_TOP, 3);
  pwm.writeUint32(0x00 + REG_CH_CTR, 0);
  pwm.writeUint32(REG_PWM_INTE, 0x00); // Interrupts disabled
  pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);

  // Advance 3 cycles -> CTR=3 (TOP)
  pwm.tickCycles(3);
  assert(pwm.slices[0].ctr === 3, 'CTR reached 3');
  assert((pwm.readUint32(REG_PWM_INTR) & 0x01) === 0, 'INTR[0] not yet asserted before wrap');

  // Next cycle wraps 3 -> 0
  pwm.tickCycles(1);
  assert(pwm.slices[0].ctr === 0, 'CTR wrapped to 0');
  assert((pwm.readUint32(REG_PWM_INTR) & 0x01) === 1, 'INTR[0] asserted on wrap');
  assert((pwm.readUint32(REG_PWM_INTS) & 0x01) === 0, 'INTS[0] is 0 because INTE[0] is 0');
  assert(
    (rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) === 0,
    'NVIC IRQ 4 line remains LOW while masked in INTE'
  );

  // Enable interrupt for Slice 0 (INTE[0] = 1)
  pwm.writeUint32(REG_PWM_INTE, 0x01);
  assert((pwm.readUint32(REG_PWM_INTS) & 0x01) === 1, 'INTS[0] is 1 after enabling INTE[0]');
  assert(
    (rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) !== 0,
    'NVIC IRQ 4 line is asserted HIGH'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: WRITE-1-TO-CLEAR (W1C) SEMANTICS ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Write 1 to clear bit 0 of INTR
  pwm.writeUint32(REG_PWM_INTR, 0x01);
  assert((pwm.readUint32(REG_PWM_INTR) & 0x01) === 0, 'INTR[0] cleared by writing 1');
  assert((pwm.readUint32(REG_PWM_INTS) & 0x01) === 0, 'INTS[0] de-asserted');
  assert(
    (rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) === 0,
    'NVIC IRQ 4 line de-asserted after W1C'
  );

  // Writing 0 to INTR must not affect flags
  pwm.writeUint32(REG_PWM_INTR, 0x00);
  assert(pwm.readUint32(REG_PWM_INTR) === 0x00, 'Writing 0 does not set or change INTR');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: MULTI-SLICE CONCURRENT INTERRUPTS ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Slices 2, 4, 7 wrap concurrently
  pwm.writeUint32(REG_PWM_INTE, 0b10010100); // Enable slices 2, 4, 7 (bits 2, 4, 7)
  pwm.assertRawInterrupt(2);
  pwm.assertRawInterrupt(4);
  pwm.assertRawInterrupt(7);

  assert(pwm.readUint32(REG_PWM_INTR) === 0b10010100, 'INTR reflects concurrent flags for slices 2, 4, 7');
  assert(pwm.readUint32(REG_PWM_INTS) === 0b10010100, 'INTS reflects all enabled concurrent slices');
  assert((rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) !== 0, 'NVIC IRQ 4 line asserted');

  // Clear Slice 2 only
  pwm.writeUint32(REG_PWM_INTR, 1 << 2);
  assert(pwm.readUint32(REG_PWM_INTR) === 0b10010000, 'Slice 2 cleared, Slices 4 and 7 remain');
  assert((rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) !== 0, 'NVIC IRQ 4 line still asserted for remaining slices');

  // Clear Slices 4 and 7 together
  pwm.writeUint32(REG_PWM_INTR, (1 << 4) | (1 << 7));
  assert(pwm.readUint32(REG_PWM_INTR) === 0x00, 'All slices cleared in INTR');
  assert((rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) === 0, 'NVIC IRQ 4 line de-asserted');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: SOFTWARE FORCED INTERRUPTS (INTF) ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Force interrupt on Slice 3 without INTE or INTR
  pwm.writeUint32(REG_PWM_INTE, 0x00);
  pwm.writeUint32(REG_PWM_INTR, 0x00);
  pwm.writeUint32(REG_PWM_INTF, 1 << 3);

  assert((pwm.readUint32(REG_PWM_INTS) & (1 << 3)) !== 0, 'INTS reflects forced bit 3');
  assert((rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) !== 0, 'NVIC IRQ 4 line asserted by INTF');

  // Clear INTF
  pwm.writeUint32(REG_PWM_INTF, 0x00);
  assert(pwm.readUint32(REG_PWM_INTS) === 0x00, 'INTS cleared after clearing INTF');
  assert((rp2040.core.pendingInterrupts & (1 << PWM_IRQ_WRAP)) === 0, 'NVIC IRQ 4 line de-asserted');

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: DMA DREQ 24..31 PER-SLICE PACING ---');
  // ─────────────────────────────────────────────────────────────────────────────
  for (let sliceIdx = 0; sliceIdx < 8; sliceIdx++) {
    const expectedDreq = DREQ_PWM_WRAP0 + sliceIdx;
    assert(
      expectedDreq >= 24 && expectedDreq <= 31,
      `Slice ${sliceIdx} mapped to DREQ ${expectedDreq} (24..31)`
    );

    // Initial state: DREQ de-asserted
    pwm.clearDreq(sliceIdx);
    assert(!rp2040.dma.dreq[expectedDreq], `DREQ ${expectedDreq} is initially LOW`);

    // Trigger DREQ assertion on wrap
    pwm.assertDreq(sliceIdx);
    assert(rp2040.dma.dreq[expectedDreq] === true, `DREQ ${expectedDreq} asserted on Slice ${sliceIdx} wrap`);

    // Clear DREQ
    pwm.clearDreq(sliceIdx);
    assert(!rp2040.dma.dreq[expectedDreq], `DREQ ${expectedDreq} cleared after DMA service`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: REAL DMA CONTROLLER TRANSFER PACED BY DREQ_PWM_WRAP0 ---');
  // ─────────────────────────────────────────────────────────────────────────────
  // Configure RP2040 DMA Channel 0:
  // Transfer words from source array to destination array, paced by DREQ 24 (1 transfer per wrap)
  const srcBuf = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444]);
  const srcAddr = 0x20000000;
  const dstAddr = 0x20000100;
  for (let i = 0; i < 4; i++) {
    rp2040.writeUint32(srcAddr + i * 4, srcBuf[i]);
    rp2040.writeUint32(dstAddr + i * 4, 0);
  }

  const TREQ_PWM0 = 24;
  const CTRL_VAL = (TREQ_PWM0 << 15) | (2 << 2) | (1 << 4) | (1 << 5) | (1 << 0);

  // Configure Slice 0 to wrap at TOP = 1, DIV = 1.0
  pwm.writeUint32(0x00 + REG_CH_CSR, 0);
  pwm.writeUint32(0x00 + REG_CH_TOP, 1);
  pwm.writeUint32(0x00 + REG_CH_CTR, 0);

  // Test word-by-word paced transfers across 4 successive wraps
  for (let w = 0; w < 4; w++) {
    // Prime DMA for 1 word
    rp2040.writeUint32(0x50000000 + 0x00, srcAddr + w * 4); // READ_ADDR
    rp2040.writeUint32(0x50000000 + 0x04, dstAddr + w * 4); // WRITE_ADDR
    rp2040.writeUint32(0x50000000 + 0x08, 1);               // TRANS_COUNT = 1
    rp2040.writeUint32(0x50000000 + 0x0c, CTRL_VAL);         // CTRL_TRIG

    assert(rp2040.readUint32(dstAddr + w * 4) === 0, `Word ${w} waiting for wrap DREQ`);

    // Enable and advance PWM by 2 cycles -> wrap occurs -> DREQ asserts
    pwm.writeUint32(0x00 + REG_CH_CSR, CSR_EN);
    pwm.tickCycles(2);
    rp2040.clock.tick(1000);

    assert(
      rp2040.readUint32(dstAddr + w * 4) === srcBuf[w],
      `Wrap ${w + 1}: transferred word ${w} (0x${srcBuf[w].toString(16)})`
    );
    assert(rp2040.readUint32(0x50000000 + 0x08) === 0, `Wrap ${w + 1}: TRANS_COUNT reached 0`);
    pwm.clearDreq(0);
    pwm.writeUint32(0x00 + REG_CH_CSR, 0);
  }

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM IRQ 4 & DMA PACING: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runTests();
