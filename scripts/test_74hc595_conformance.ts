/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Texas Instruments 74HC595 Hardware Conformance Test
 * Phase 4.3.5.2 Audit & Verification
 * 
 * Verifies pin-level adherence to Texas Instruments SN74HC595 specification:
 * 1. Native standard mode: separate SHCP (shift clock) and STCP (storage clock)
 * 2. SHCP does NOT directly update output pins
 * 3. STCP updates output pins
 * 4. CS rising alone does NOT latch in standard mode (native hardware conformance)
 * 5. Optional SPI CS latch adapter behavior (explicit opt-in)
 * 6. OE active-low controls output enable and 3-state High-Z output state
 * 7. SRCLR active-low asynchronously clears shift register without clearing output storage
 * 8. QH' serial cascade supports genuine two-device daisy chaining
 * 9. Repeated SPI transactions across multiple frames
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { ShiftRegister_74HC595 } from '../src/features/simulator/rp2040SpiDevice';

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

function run74HC595Tests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5.2 — 74HC595 HARDWARE CONFORMANCE TEST         ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ─── Test 1: Native Mode: SHCP Shifting & Independence from Output Latch ─────────
  console.log('--- TEST 1: NATIVE SHCP CLOCKING (OUTPUT LATCH UNCHANGED) ---');
  const sr1 = new ShiftRegister_74HC595();
  assertCheck(sr1.autoLatchOnCsRising === false, 'Default hardware model has autoLatchOnCsRising = false (Native 74HC595)');

  // Clock 8 individual bits via pulseSHCP: bit pattern 10100101 (0xA5)
  // Shift MSB first: 1, 0, 1, 0, 0, 1, 0, 1
  const bits = [true, false, true, false, false, true, false, true];
  for (const b of bits) {
    sr1.pulseSHCP(b);
    assertCheck(sr1.getOutputLatch() === 0x00, `Output latch unaffected by SHCP pulse (remains 0x00)`);
    assertCheck(sr1.getOutputPin(0) === false, 'Parallel output Q0 remains 0 during SHCP shifting');
  }
  assertCheck(sr1.getShiftRegister() === 0xA5, `Shift register assembled 0xA5 via SHCP (got 0x${sr1.getShiftRegister().toString(16)})`);
  assertCheck(sr1.getOutputLatch() === 0x00, 'Output storage register remains untouched (0x00) after 8 SHCP pulses');

  // ─── Test 2: Native Mode: CS Rising Alone Does NOT Latch ───────────────────────
  console.log('\n--- TEST 2: CS RISING ALONE DOES NOT LATCH IN STANDARD MODE ---');
  sr1.select(true); // Select device on SPI bus
  sr1.transferByte(0x5A); // Shift in 0x5A
  sr1.select(false); // CS transitions HIGH (rising edge)
  assertCheck(sr1.getShiftRegister() === 0x5A, 'Shift register received 0x5A');
  assertCheck(sr1.getOutputLatch() === 0x00, 'CS rising edge alone did NOT latch into storage register in standard mode');
  assertCheck(sr1.getOutputPin(1) === false, 'Output pin Q1 remains LOW (unlatched)');

  // ─── Test 3: STCP Rising Edge Commits to Output Latch ──────────────────────────
  console.log('\n--- TEST 3: STCP (PIN 12) COMMITS TO STORAGE REGISTER ---');
  sr1.pulseSTCP(); // Pulse pin 12 (Storage Register Clock)
  assertCheck(sr1.getOutputLatch() === 0x5A, 'STCP rising edge latched 0x5A into storage register');
  assertCheck(sr1.getOutputPin(1) === true, 'Parallel output Q1 is now HIGH (0x5A bit 1)');
  assertCheck(sr1.getOutputPin(0) === false, 'Parallel output Q0 is LOW (0x5A bit 0)');

  // ─── Test 4: Optional SPI CS Latch Adapter Mode ────────────────────────────────
  console.log('\n--- TEST 4: OPTIONAL SPI CS LATCH ADAPTER MODE ---');
  const srAdapter = new ShiftRegister_74HC595();
  srAdapter.enableSpiCsLatchAdapter(true); // Explicitly enable adapter wiring
  assertCheck(srAdapter.autoLatchOnCsRising === true, 'Adapter mode active: autoLatchOnCsRising = true');
  srAdapter.select(true);
  srAdapter.transferByte(0xAA);
  assertCheck(srAdapter.getOutputLatch() === 0x00, 'Output latch untouched while CS is LOW in adapter mode');
  srAdapter.select(false); // CS rising edge
  assertCheck(srAdapter.getOutputLatch() === 0xAA, 'CS rising edge automatically pulsed STCP in adapter mode (latched 0xAA)');
  assertCheck(srAdapter.getOutputPin(7) === true, 'Parallel output Q7 is HIGH (0xAA bit 7)');

  // ─── Test 5: Output Enable (/OE Pin 13) 3-State High-Z ─────────────────────────
  console.log('\n--- TEST 5: OUTPUT ENABLE (/OE PIN 13) 3-STATE HIGH-Z ---');
  const sr3 = new ShiftRegister_74HC595();
  sr3.select(true);
  sr3.transferByte(0xFF);
  sr3.select(false);
  sr3.pulseSTCP();
  assertCheck(sr3.getOutputPin(0) === true, 'Outputs actively HIGH when /OE is LOW (enabled)');
  assertCheck(!sr3.isOutputHighZ(), 'isOutputHighZ() is false when /OE is LOW');

  // De-assert /OE (pull to HIGH / 3.3V)
  sr3.setOE(false);
  assertCheck(sr3.isOutputHighZ(), 'isOutputHighZ() is true when /OE is HIGH (disabled)');
  assertCheck(sr3.getOutputPin(0) === null, 'getOutputPin(0) returns null (High-Z) when /OE is HIGH');
  assertCheck(sr3.getOutputPinState(0) === 'HIGH_Z', 'getOutputPinState(0) returns "HIGH_Z"');
  assertCheck(sr3.getOutputLatch() === 0xFF, 'Internal storage register remains 0xFF while outputs are High-Z');

  // Re-enable /OE (pull to LOW / 0V)
  sr3.setOE(true);
  assertCheck(!sr3.isOutputHighZ(), 'Outputs restored from High-Z');
  assertCheck(sr3.getOutputPin(0) === true, 'getOutputPin(0) again returns true');

  // ─── Test 6: Asynchronous Shift Register Clear (/SRCLR Pin 10) ────────────────
  console.log('\n--- TEST 6: ASYNCHRONOUS SHIFT REGISTER CLEAR (/SRCLR PIN 10) ---');
  const sr4 = new ShiftRegister_74HC595();
  sr4.select(true);
  sr4.transferByte(0xAA);
  sr4.pulseSTCP(); // Latches 0xAA
  assertCheck(sr4.getOutputLatch() === 0xAA, 'Output latch holds 0xAA');
  assertCheck(sr4.getShiftRegister() === 0xAA, 'Shift register holds 0xAA');

  // Assert /SRCLR LOW (active-low clear)
  sr4.setSRCLR(false);
  assertCheck(sr4.getShiftRegister() === 0x00, 'Shift register asynchronously cleared to 0x00');
  assertCheck(sr4.getOutputLatch() === 0xAA, 'Output storage latch unaffected by /SRCLR (remains 0xAA)');

  // Attempting to shift while /SRCLR is LOW keeps shift register cleared
  sr4.pulseSHCP(true);
  assertCheck(sr4.getShiftRegister() === 0x00, 'Shift register remains 0x00 while /SRCLR is held LOW');

  // Release /SRCLR HIGH
  sr4.setSRCLR(true);
  sr4.pulseSTCP();
  assertCheck(sr4.getOutputLatch() === 0x00, 'Subsequent STCP pulse commits cleared 0x00 to output latch');

  // ─── Test 7: Daisy-Chain Cascading (2x 74HC595 via QH\' Pin 9) ────────────────
  console.log('\n--- TEST 7: DAISY-CHAIN CASCADING (2x 74HC595 VIA QH\') ---');
  const chip1 = new ShiftRegister_74HC595();
  const chip2 = new ShiftRegister_74HC595();

  chip1.select(true);
  chip2.select(true);

  // Send first byte 0x12:
  // Enters chip1, chip1 outputs previous 0x00 via QH' into chip2
  const qh1_byte1 = chip1.transferByte(0x12);
  chip2.transferByte(qh1_byte1);

  // Send second byte 0x34:
  // 0x34 enters chip1, chip1 shifts out 0x12 via QH' into chip2!
  const qh1_byte2 = chip1.transferByte(0x34);
  chip2.transferByte(qh1_byte2);

  chip1.pulseSTCP();
  chip2.pulseSTCP();

  assertCheck(chip1.getOutputLatch() === 0x34, 'Chip 1 holds latest byte (0x34)');
  assertCheck(chip2.getOutputLatch() === 0x12, 'Chip 2 holds cascaded first byte (0x12)');
  assertCheck(chip1.getShiftRegister() === 0x34, 'Chip 1 shift register is 0x34');
  assertCheck(chip2.getShiftRegister() === 0x12, 'Chip 2 shift register is 0x12');

  // ─── Test 8: Repeated SPI Transactions Across Multiple Frames ─────────────────
  console.log('\n--- TEST 8: REPEATED SPI TRANSACTIONS ACROSS MULTIPLE FRAMES ---');
  const srRepeat = new ShiftRegister_74HC595();
  const testBytes = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];

  for (let f = 0; f < testBytes.length; f++) {
    const expected = testBytes[f];
    srRepeat.select(true);
    srRepeat.transferByte(expected);
    assertCheck(srRepeat.getShiftRegister() === expected, `Frame ${f + 1}: Shift register has 0x${expected.toString(16)}`);
    srRepeat.select(false);
    srRepeat.pulseSTCP();
    assertCheck(srRepeat.getOutputLatch() === expected, `Frame ${f + 1}: STCP latched 0x${expected.toString(16)}`);
  }

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   74HC595 CONFORMANCE TEST: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

run74HC595Tests();
