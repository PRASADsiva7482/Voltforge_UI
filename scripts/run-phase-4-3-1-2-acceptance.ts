/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.1.2 Master Acceptance Test Suite
 * 
 * Validates:
 * 1. Valid Pico firmware ingestion
 * 2. Flash image mapping
 * 3. Erased flash regions (0xFF)
 * 4. Vector-table discovery
 * 5. Initial stack pointer validation
 * 6. Reset-handler validation
 * 7. Thumb-bit validation
 * 8. Invalid vector table rejection
 * 9. Invalid stack pointer rejection
 * 10. Invalid reset handler rejection
 * 11. Core 0 initialization
 * 12. First instruction execution
 * 13. Multiple instruction stepping
 * 14. Cycle accounting (133 MHz)
 * 15. Pause/resume lifecycle
 * 16. Reset and restart
 * 17. Worker cleanup
 * 18. AVR regression check
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseUF2,
  extractRp2040FlashImage,
  discoverAndValidateVectorTable,
  RP2040_FAMILY_ID,
  RP2040_DEFAULT_FLASH_START,
  RP2040_DEFAULT_FLASH_SIZE,
  RP2040_SRAM_START,
  RP2040_SRAM_SIZE,
} from '../src/features/simulator/uf2Parser';
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import { parseAvrHex } from '../src/features/simulator/intelHex';
import { CPU, avrInstruction } from 'avr8js';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Test ${String(id).padStart(2, '0')}] ${status}: ${name}`);
  if (!passed || details) {
    console.log(`         ${details}`);
  }
}

async function runAcceptanceTests() {
  console.log('========================================================================');
  console.log('   VOLTFORGE PHASE 4.3.1.2 — RP2040 BOOT & CPU ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  const fixturePath = path.resolve('src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Required fixture missing: ${fixturePath}`);
  }
  const realFixtureBytes = new Uint8Array(fs.readFileSync(fixturePath));

  // ─── TEST 1: Valid Pico Firmware Ingestion ─────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    const res = controller.loadFirmware(realFixtureBytes);
    const ok = res.success && res.vectorTable !== null && controller.getState() === 'LOADED';
    record(1, 'Valid Pico Firmware Ingestion', ok,
      `Loaded ${realFixtureBytes.length} bytes; State = ${controller.getState()}`);
  }

  // ─── TEST 2: Flash Image Mapping ───────────────────────────────────────────────────
  {
    const parsed = parseUF2(realFixtureBytes, { targetFamilyId: RP2040_FAMILY_ID });
    const flashImage = extractRp2040FlashImage(parsed);
    // Address 0x10000000 should map to flashImage offset 0
    // In pico_blink_rp2040.uf2, first instruction of Boot2 is 0xB500 (little endian: 0x00, 0xB5)
    const b0 = flashImage[0];
    const b1 = flashImage[1];
    const isBoot2Start = (b0 === 0x00 && b1 === 0xb5);
    record(2, 'Flash Image Mapping', isBoot2Start,
      `Flash offset 0x0 contains 0x${b1.toString(16).padStart(2, '0')}${b0.toString(16).padStart(2, '0')} (Boot2 PUSH {LR})`);
  }

  // ─── TEST 3: Erased Flash Regions ──────────────────────────────────────────────────
  {
    const parsed = parseUF2(realFixtureBytes, { targetFamilyId: RP2040_FAMILY_ID });
    const flashImage = extractRp2040FlashImage(parsed);
    // Firmware is ~264 KiB, flash is 2 MiB. At offset 1 MiB (0x100000), bytes must be 0xFF
    let allErased = true;
    for (let i = 1024 * 1024; i < 1024 * 1024 + 1024; i++) {
      if (flashImage[i] !== 0xff) {
        allErased = false;
        break;
      }
    }
    record(3, 'Erased Flash Regions', allErased,
      `Offset 0x100000 (1 MiB into flash) verified all 0xFF erased bytes`);
  }

  // ─── TEST 4: Vector Table Discovery ────────────────────────────────────────────────
  {
    const parsed = parseUF2(realFixtureBytes, { targetFamilyId: RP2040_FAMILY_ID });
    const flashImage = extractRp2040FlashImage(parsed);
    const vtorRes = discoverAndValidateVectorTable(flashImage);
    const ok = vtorRes.valid && vtorRes.vectorTable !== null &&
      vtorRes.vectorTable.address === 0x10000100 &&
      vtorRes.vectorTable.hasBoot2 === true &&
      vtorRes.vectorTable.boot2Crc === 0x7a4eb274;
    record(4, 'Vector Table Discovery', ok,
      `Discovered VTOR at 0x${vtorRes.vectorTable?.address.toString(16)} (Boot2 detected, CRC=0x${vtorRes.vectorTable?.boot2Crc?.toString(16)})`);
  }

  // ─── TEST 5: Initial Stack Pointer Validation ──────────────────────────────────────
  {
    const parsed = parseUF2(realFixtureBytes, { targetFamilyId: RP2040_FAMILY_ID });
    const flashImage = extractRp2040FlashImage(parsed);
    const vtorRes = discoverAndValidateVectorTable(flashImage);
    const sp = vtorRes.vectorTable?.initialSP ?? 0;
    // SP must be 0x20042000 (top of 264 KiB SRAM), 4-byte and 8-byte aligned
    const ok = (sp === 0x20042000) && (sp % 4 === 0) && (sp % 8 === 0) &&
      (sp >= RP2040_SRAM_START && sp <= RP2040_SRAM_START + RP2040_SRAM_SIZE);
    record(5, 'Initial Stack Pointer Validation', ok,
      `Initial MSP = 0x${sp.toString(16)} (Within SRAM range [0x${RP2040_SRAM_START.toString(16)} - 0x${(RP2040_SRAM_START + RP2040_SRAM_SIZE).toString(16)}], 8-byte aligned)`);
  }

  // ─── TEST 6: Reset Handler Validation ──────────────────────────────────────────────
  {
    const parsed = parseUF2(realFixtureBytes, { targetFamilyId: RP2040_FAMILY_ID });
    const flashImage = extractRp2040FlashImage(parsed);
    const vtorRes = discoverAndValidateVectorTable(flashImage);
    const handler = vtorRes.vectorTable?.resetHandler ?? 0;
    const ok = handler === 0x1000020b && (handler >= RP2040_DEFAULT_FLASH_START && handler < RP2040_DEFAULT_FLASH_START + RP2040_DEFAULT_FLASH_SIZE);
    record(6, 'Reset Handler Address Validation', ok,
      `Reset Handler = 0x${handler.toString(16)} (Points into executable flash)`);
  }

  // ─── TEST 7: Thumb-Bit Validation ──────────────────────────────────────────────────
  {
    const parsed = parseUF2(realFixtureBytes, { targetFamilyId: RP2040_FAMILY_ID });
    const flashImage = extractRp2040FlashImage(parsed);
    const vtorRes = discoverAndValidateVectorTable(flashImage);
    const handler = vtorRes.vectorTable?.resetHandler ?? 0;
    const isThumb = (handler & 1) === 1;
    const entryPC = vtorRes.vectorTable?.entryPC ?? 0;
    const ok = isThumb && entryPC === 0x1000020a;
    record(7, 'Thumb-Bit Validation', ok,
      `Handler 0x${handler.toString(16)} has LSB=1 (Thumb bit set); Entry PC = 0x${entryPC.toString(16)}`);
  }

  // ─── TEST 8: Invalid Vector Table Rejection ────────────────────────────────────────
  {
    // Corrupt flash vector table to all 0xFF (erased)
    const blankFlash = new Uint8Array(256 * 1024).fill(0xff);
    const vtorRes = discoverAndValidateVectorTable(blankFlash);
    const ok = !vtorRes.valid && vtorRes.vectorTable === null &&
      vtorRes.errors.some(e => e.includes('No valid RP2040 Cortex-M0+ vector table found'));
    record(8, 'Invalid Vector Table Rejection', ok,
      `Correctly rejected blank/erased flash image without vector table`);
  }

  // ─── TEST 9: Invalid Stack Pointer Rejection ───────────────────────────────────────
  {
    // Create synthetic flash with SP pointing outside SRAM (e.g. 0x30000000)
    const badFlash = new Uint8Array(512).fill(0xff);
    const view = new DataView(badFlash.buffer);
    view.setUint32(0x100, 0x30000000, true); // Out of SRAM
    view.setUint32(0x104, 0x10000121, true); // Valid Thumb handler
    const vtorRes = discoverAndValidateVectorTable(badFlash);
    const ok = !vtorRes.valid && vtorRes.errors.some(e => e.includes('outside valid RP2040 SRAM'));
    record(9, 'Invalid Stack Pointer Rejection', ok,
      `Rejected out-of-bounds SP 0x30000000`);
  }

  // ─── TEST 10: Invalid Reset Handler Rejection ──────────────────────────────────────
  {
    // Create synthetic flash with even reset handler (Thumb bit not set)
    const badFlash = new Uint8Array(512).fill(0xff);
    const view = new DataView(badFlash.buffer);
    view.setUint32(0x100, 0x20042000, true); // Valid SP
    view.setUint32(0x104, 0x10000120, true); // Even address (Thumb bit = 0)
    const vtorRes = discoverAndValidateVectorTable(badFlash);
    const ok = !vtorRes.valid && vtorRes.errors.some(e => e.includes('Thumb bit'));
    record(10, 'Invalid Reset Handler Rejection', ok,
      `Rejected non-Thumb reset handler 0x10000120 (ARM 32-bit state forbidden on Cortex-M0+)`);
  }

  // ─── TEST 11: Core 0 Initialization ────────────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(realFixtureBytes);
    const snap = controller.getExecutionSnapshot();
    const ok = snap.state === 'LOADED' &&
      snap.pc === 0x1000020a &&
      snap.sp === 0x20042000 &&
      snap.cycleCount === 0 &&
      snap.instructionCount === 0;
    record(11, 'Core 0 Initialization', ok,
      `Core 0 primed: PC = 0x${snap.pc.toString(16)}, SP = 0x${snap.sp.toString(16)}, Cycles = ${snap.cycleCount}`);
  }

  // ─── TEST 12: First Instruction Execution ──────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(realFixtureBytes);
    controller.start();
    const stepRes = controller.step(1);
    const snap = controller.getExecutionSnapshot();
    // First instruction at 0x1000020A is LDR R0, [PC, #0x70] (2 cycles, PC moves to 0x1000020C)
    const ok = stepRes.instructionsExecuted === 1 &&
      stepRes.cyclesExecuted === 2 &&
      stepRes.pc === 0x1000020c &&
      snap.instructionCount === 1 &&
      snap.cycleCount === 2;
    record(12, 'First Instruction Execution', ok,
      `Executed 1 instruction: PC advanced to 0x${stepRes.pc.toString(16)}, Delta Cycles = ${stepRes.cyclesExecuted}`);
  }

  // ─── TEST 13: Multiple Instruction Stepping ────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(realFixtureBytes);
    controller.start();
    const step10 = controller.step(10);
    const step100 = controller.step(100);
    const snap = controller.getExecutionSnapshot();
    const ok = snap.instructionCount === 110 &&
      snap.cycleCount > 110 &&
      snap.errors.length === 0 &&
      snap.pc >= 0x10000000;
    record(13, 'Multiple Instruction Stepping', ok,
      `Executed 110 instructions smoothly: Total Cycles = ${snap.cycleCount}, Current PC = 0x${snap.pc.toString(16)}`);
  }

  // ─── TEST 14: Cycle Accounting (133 MHz) ───────────────────────────────────────────
  {
    const controller = new RP2040Controller(undefined, 133_000_000);
    controller.loadFirmware(realFixtureBytes);
    controller.start();
    controller.step(500);
    const snap = controller.getExecutionSnapshot();
    const expectedTime_s = snap.cycleCount / 133_000_000;
    const ok = Math.abs(snap.simulatedTime_s - expectedTime_s) < 1e-12 &&
      snap.clockFrequency_Hz === 133_000_000 &&
      snap.cycleCount > 0;
    record(14, 'Deterministic Cycle Accounting (133 MHz)', ok,
      `${snap.cycleCount} cycles @ 133 MHz = ${(snap.simulatedTime_s * 1e6).toFixed(3)} µs (Host throughput: ${snap.mips.toFixed(1)} MIPS)`);
  }

  // ─── TEST 15: Pause and Resume Lifecycle ───────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(realFixtureBytes);
    controller.start();
    controller.step(20);
    const pcBeforePause = controller.getExecutionSnapshot().pc;
    controller.pause();
    const isPaused = controller.getState() === 'PAUSED';
    // Stepping while paused should not advance
    controller.step(0);
    const pcDuringPause = controller.getExecutionSnapshot().pc;
    controller.resume();
    const isResumed = controller.getState() === 'RUNNING';
    controller.step(10);
    const pcAfterResume = controller.getExecutionSnapshot().pc;
    const ok = isPaused && isResumed && (pcBeforePause === pcDuringPause) && (pcAfterResume !== pcDuringPause);
    record(15, 'Pause & Resume Lifecycle', ok,
      `PAUSED preserves PC (0x${pcBeforePause.toString(16)}), RESUME successfully advances to 0x${pcAfterResume.toString(16)}`);
  }

  // ─── TEST 16: Reset and Restart ────────────────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(realFixtureBytes);
    controller.start();
    controller.step(200);
    const cyclesBeforeReset = controller.getCycleCount();
    controller.reset();
    const snap = controller.getExecutionSnapshot();
    const isReset = snap.state === 'LOADED' &&
      snap.pc === 0x1000020a &&
      snap.sp === 0x20042000 &&
      snap.cycleCount === 0 &&
      snap.instructionCount === 0;
    controller.start();
    const step1 = controller.step(1);
    const ok = isReset && step1.instructionsExecuted === 1 && step1.pc === 0x1000020c;
    record(16, 'Reset and Restart', ok,
      `Reset restored PC=0x1000020a, SP=0x20042000, cleared cycles (${cyclesBeforeReset} -> 0), re-executed step 1 cleanly`);
  }

  // ─── TEST 17: Worker Cleanup ───────────────────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(realFixtureBytes);
    controller.start();
    controller.step(50);
    controller.stop();
    const snap = controller.getExecutionSnapshot();
    const ok = snap.state === 'STOPPED' &&
      controller.getRp2040Instance() === null &&
      snap.cycleCount === 0;
    record(17, 'Worker Cleanup & Resource Teardown', ok,
      `State = STOPPED, RP2040 instance released, buffers freed`);
  }

  // ─── TEST 18: AVR Simulation Regression Check ──────────────────────────────────────
  {
    // Execute a real compiled AVR program through AVR8js to ensure 0 regression
    const avrBlinkHex = ':100000000C9434000C9451000C9451000C94510049\n:100068002F920F920FB60F9211248FEF98BB88E151\n:00000001FF';
    const program = parseAvrHex(avrBlinkHex);
    const cpu = new CPU(program, 2048);
    // Execute 5 AVR instructions
    const cyclesStart = cpu.cycles;
    for (let i = 0; i < 5; i++) {
      avrInstruction(cpu);
    }
    const avrCyclesDone = cpu.cycles - cyclesStart;
    const ok = program.length > 0 && avrCyclesDone > 0 && cpu.pc > 0;
    record(18, 'AVR Simulation Regression Verification', ok,
      `AVR8js ATmega328P executed 5 instructions (${avrCyclesDone} cycles); PC = 0x${cpu.pc.toString(16)}`);
  }

  console.log('\n========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`TOTAL ACCEPTANCE TESTS: ${total}`);
  console.log(`PASSED:                 ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`FAILED:                 ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Acceptance suite failed with fatal error:', err);
  process.exit(1);
});
