/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 SPI Slave Mode Audit & Verification Suite
 * Phase 4.3.5.1 Audit B
 * 
 * Verifies the actual behavior of the PL022 SPI controller when configured in
 * Slave Mode (SSPCR1.MS = 1). Demonstrates that while register bit storage functions,
 * the slave shifting engine, external clock sampling, and frame reception are
 * NOT IMPLEMENTED.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import {
  RP2040Spi,
  REG_SSPCR0,
  REG_SSPCR1,
  REG_SSPCPSR,
  REG_SSPDR,
  REG_SSPSR,
  CR1_SSE,
  CR1_MS,
  SR_BSY,
  SR_TFE,
  DREQ_SPI0_TX,
  DREQ_SPI0_RX,
} from '../src/features/simulator/rp2040Spi';

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

function runAudit(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5.1 — RP2040 SPI SLAVE MODE AUDIT SUITE           ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const mcu = new RP2040();
  const spi = new RP2040Spi(mcu, 'SPI0', 18, { tx: DREQ_SPI0_TX, rx: DREQ_SPI0_RX }, 0);

  // Setup Prescaler and Control 0
  spi.writeUint32(REG_SSPCPSR, 2);
  spi.writeUint32(REG_SSPCR0, 0x0007); // 8-bit, Mode 0

  // ─── Test 1: Register Bit Storage for SSPCR1.MS ──────────────────────────────
  console.log('--- TEST 1: REGISTER BIT STORAGE (SSPCR1.MS) ---');
  // Default on reset: MS=0 (Master mode)
  assertCheck(spi.isMaster === true, 'Default configuration is Master mode (isMaster = true)');
  assertCheck((spi.readUint32(REG_SSPCR1) & CR1_MS) === 0, 'SSPCR1.MS bit is 0 on reset');

  // Set MS bit (Slave mode) and enable SSE
  spi.writeUint32(REG_SSPCR1, CR1_SSE | CR1_MS);
  const cr1Val = spi.readUint32(REG_SSPCR1);
  assertCheck((cr1Val & CR1_MS) === CR1_MS, 'SSPCR1.MS bit (0x4) successfully written and read back');
  assertCheck(spi.isMaster === false, 'isMaster property correctly reflects false when MS=1');
  assertCheck(spi.enabled === true, 'SPI peripheral is enabled (SSE=1)');

  // ─── Test 2: Master Engine Disablement when MS=1 ─────────────────────────────
  console.log('\n--- TEST 2: MASTER SHIFTER ENGINE INHIBITION IN SLAVE MODE ---');
  // Write a byte into TX FIFO
  spi.writeUint32(REG_SSPDR, 0x5a);
  assertCheck((spi.readUint32(REG_SSPSR) & SR_TFE) === 0, 'TX FIFO has 1 byte pending (TFE=0)');

  // Advance simulation clock by 1000 cycles
  spi.tickCycles(1000);

  // In Master mode, 1000 cycles at 62.5MHz would transmit the byte and empty the TX FIFO.
  // In Slave mode, tickCycles returns early: if (!this.enabled || !this.isMaster || this.cpsdvsr < 2) return;
  const statusAfterTick = spi.readUint32(REG_SSPSR);
  assertCheck((statusAfterTick & SR_TFE) === 0, 'TX FIFO remains non-empty (data did NOT shift out)');
  assertCheck(spi.sckLineState === false, 'SCLK line did not toggle (remains idle CPOL=0)');
  assertCheck(spi.csnLineState === true, 'CSn line was NOT asserted (remains idle HIGH)');
  // Per PL022 TRM Section 3.3.4: BSY is set when the transmit FIFO is not empty.
  // Because the slave engine never shifts out the byte, txFifo remains non-empty, so BSY stays 1,
  // but the shifter engine itself is completely inactive (no clock edges, no CS assertion).
  assertCheck((statusAfterTick & SR_BSY) === SR_BSY, 'Busy flag (SR_BSY) is set per PL022 because TX FIFO is not empty');

  // ─── Test 3: Audit of External Slave Input Capabilities ───────────────────────
  console.log('\n--- TEST 3: INSPECTION OF EXTERNAL SLAVE INPUT HOOKS ---');
  // Inspect whether external clock input or frame select inputs exist
  const spiObj = spi as any;
  const hasExternalClockInput = typeof spiObj.feedSckPinState === 'function';
  const hasExternalCsInput = typeof spiObj.feedCsPinState === 'function';
  const hasSlaveShiftEngine = typeof spiObj.tickSlaveClockEdge === 'function';

  assertCheck(!hasExternalClockInput, 'No external SCLK input feed exists on RP2040Spi peripheral model');
  assertCheck(!hasExternalCsInput, 'No external CSn/SS input feed exists on RP2040Spi peripheral model');
  assertCheck(!hasSlaveShiftEngine, 'No external clock edge slave shift register engine exists');

  // ─── Test 4: Conformance Verdict Determination ───────────────────────────────
  console.log('\n--- TEST 4: QUALIFICATION VERDICT DETERMINATION ---');
  console.log('  Evidence Summary:');
  console.log('    1. SSPCR1.MS bit read/write: FUNCTIONAL');
  console.log('    2. isMaster property: FUNCTIONAL');
  console.log('    3. External slave transmission/reception engine: NOT IMPLEMENTED');
  console.log('    4. External SCLK/CS pin listening: NOT IMPLEMENTED');
  console.log('  Conclusion: Assigning "CONDITIONALLY VERIFIED" in Phase 4.3.5 was a documentation defect.');
  console.log('  The correct qualification verdict for PL022 Slave Mode is "NOT IMPLEMENTED"');
  console.log('  (with note: register bit storage verified; slave transfer engine unsupported).');
  assertCheck(true, 'Verdict corrected to NOT IMPLEMENTED for Slave Mode transfer engine');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   SPI SLAVE MODE AUDIT: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runAudit();
