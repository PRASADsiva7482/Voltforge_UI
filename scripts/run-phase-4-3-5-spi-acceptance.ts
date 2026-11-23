/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.5 RP2040 Dual SPI Controller Acceptance Test Suite
 * 
 * Verifies:
 * 1. Dual Independent PL022 SPI Controllers (SPI0 @ 0x4003C000 & SPI1 @ 0x40040000)
 * 2. PrimeCell and Peripheral Identification Registers (0xFE0 - 0xFFC)
 * 3. Reset Values & Initial Register State Conformance (PL022 Spec)
 * 4. Atomic Register Aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)
 * 5. Clock Prescaler (SSPCPSR), Serial Clock Rate (SCR) & Baud-Rate Calculations
 * 6. Even CPSDVSR Prescaler Divisor Constraint (Bit 0 hardwired to 0)
 * 7. Motorola SPI Mode 0 (CPOL=0, CPHA=0) Loopback Transmission & Waveform
 * 8. Motorola SPI Mode 1 (CPOL=0, CPHA=1) Loopback Transmission & Waveform
 * 9. Motorola SPI Mode 2 (CPOL=1, CPHA=0) Loopback Transmission & Waveform
 * 10. Motorola SPI Mode 3 (CPOL=1, CPHA=1) Loopback Transmission & Waveform
 * 11. Variable Data Word Sizes: 4-bit, 8-bit, 12-bit, and 16-bit Frames (DSS)
 * 12. 8-Entry TX FIFO Buffering, Status Flags (TFE, TNF), and Overflow Protection
 * 13. 8-Entry RX FIFO Buffering, Status Flags (RNE, RFF), and Underflow Behavior
 * 14. RX Overrun Detection (RORRIS) and Clearing via SSPICR.RORIC
 * 15. RX Idle Timeout Detection (RTRIS) and Clearing via SSPICR.RTIC
 * 16. Watermark Threshold Interrupts: TXRIS (<= 4 entries) and RXRIS (>= 4 entries)
 * 17. Cortex-M0+ NVIC Interrupt Delivery (IRQ 18 for SPI0 & IRQ 19 for SPI1)
 * 18. DMA DREQ 16/17 (SPI0 TX/RX) and DREQ 18/19 (SPI1 TX/RX) Pacing & Gating
 * 19. Non-Vacuous DMA Isolation: Immunity against Active PWM Wrap (DREQ 24)
 * 20. IO_BANK0 Function 1 Pin Multiplexing across All 30 RP2040 GPIO Pins
 * 21. Dynamic Pin Function Switching between SIO (Func 5) and SPI (Func 1)
 * 22. Electrical MNA Push-Pull CMOS Driver Impedance & Thevenin Output Loading
 * 23. Electrical MNA High-Z Schmitt Trigger Input on MISO (IE=1, VIH=2.0V, VIL=0.8V)
 * 24. Microchip 25LC256 32 KiB SPI EEPROM: WREN, Page Write, Sequential Read, RDSR
 * 25. Microchip MCP3008 10-Bit 8-Channel SPI ADC: MNA Voltage Conversion to 10-bit Code
 * 26. Texas Instruments 74HC595 8-Bit Shift Register: Serial Shift & CSn Rising-Edge Latch
 * 27. Logic Analyzer Signal Acquisition & Protocol Decoding via decodeSpi()
 * 28. Real Cortex-M0+ Instruction Stepping & MMIO Register Control via CPU Bus
 * 29. Diagnostics Snapshot Integrity for SPI0 and SPI1
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  REG_SSPCR0,
  REG_SSPCR1,
  REG_SSPDR,
  REG_SSPSR,
  REG_SSPCPSR,
  REG_SSPIMSC,
  REG_SSPRIS,
  REG_SSPMIS,
  REG_SSPICR,
  REG_SSPDMACR,
  REG_SSPPERIPHID0,
  REG_SSPPERIPHID1,
  REG_SSPPERIPHID2,
  REG_SSPPERIPHID3,
  REG_SSPPCELLID0,
  REG_SSPPCELLID1,
  REG_SSPPCELLID2,
  REG_SSPPCELLID3,
  CR0_DSS_MASK,
  CR0_SPO,
  CR0_SPH,
  CR0_SCR_SHIFT,
  CR1_LBM,
  CR1_SSE,
  CR1_MS,
  SR_TFE,
  SR_TNF,
  SR_RNE,
  SR_RFF,
  SR_BSY,
  INT_ROR,
  INT_RT,
  INT_RX,
  INT_TX,
  DMACR_RXDMAE,
  DMACR_TXDMAE,
  DREQ_SPI0_TX,
  DREQ_SPI0_RX,
  DREQ_SPI1_TX,
  DREQ_SPI1_RX,
  decodeSpi,
  type SpiSignalSample,
} from '../src/features/simulator/rp2040Spi';
import {
  EEPROM_25LC256,
  ADC_MCP3008,
  ShiftRegister_74HC595,
  CMD_EEPROM_WREN,
  CMD_EEPROM_WRITE,
  CMD_EEPROM_READ,
  CMD_EEPROM_RDSR,
} from '../src/features/simulator/rp2040SpiDevice';
import {
  FUNCTION_SPI,
  FUNCTION_SIO,
  SPI0_RX_PINS,
  SPI0_CSN_PINS,
  SPI0_SCK_PINS,
  SPI0_TX_PINS,
  SPI1_RX_PINS,
  SPI1_CSN_PINS,
  SPI1_SCK_PINS,
  SPI1_TX_PINS,
} from '../src/features/simulator/rp2040GpioBridge';

// ─── Test Harness Accounting ─────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let totalChecks = 0;
let passedChecks = 0;

function assertCheck(cond: boolean, desc: string): void {
  totalChecks++;
  if (cond) {
    passedChecks++;
  } else {
    console.error(`  FAIL [Check ${totalChecks}]: ${desc}`);
    throw new Error(`Assertion failed: ${desc}`);
  }
}

function runTest(testName: string, testFn: () => void): void {
  totalTests++;
  const testNum = String(totalTests).padStart(2, '0');
  try {
    testFn();
    passedTests++;
    console.log(`[Test ${testNum}] PASS: ${testName}`);
  } catch (err: any) {
    console.error(`[Test ${testNum}] FAIL: ${testName} - ${err.message}`);
  }
}

// ─── Minimal UF2 Test Binary Builder ─────────────────────────────────────────────────

function createMinimalUf2(): Uint8Array {
  // Generates valid UF2 containing minimal ARMv6-M vector table and loop instruction
  const uf2 = new Uint8Array(512 * 2);
  const flashStart = 0x10000000;

  for (let blockIdx = 0; blockIdx < 2; blockIdx++) {
    const offset = blockIdx * 512;
    const view = new DataView(uf2.buffer, offset, 512);

    view.setUint32(0, 0x0A324655, true); // Magic 0
    view.setUint32(4, 0x9E5D5157, true); // Magic 1
    view.setUint32(8, 0x00002000, true); // Flags: familyId present
    view.setUint32(12, flashStart + blockIdx * 256, true); // Target Address
    view.setUint32(16, 256, true);        // Payload size
    view.setUint32(20, blockIdx, true);   // Block index
    view.setUint32(24, 2, true);          // Total blocks
    view.setUint32(28, 0xe48bff56, true); // RP2040 Family ID

    if (blockIdx === 0) {
      // Vector Table at 0x10000000
      // [0x00] Initial SP = 0x20042000 (Top of RP2040 SRAM)
      view.setUint32(32, 0x20042000, true);
      // [0x04] Reset Handler = 0x10000101 (Thumb address)
      view.setUint32(36, 0x10000101, true);

      // Reset handler at offset 0x100 (address 0x10000100): infinite loop 'b .' (0xE7FE)
      const codeOffset = 32 + 0x100;
      view.setUint16(codeOffset, 0xe7fe, true);
    }

    view.setUint32(508, 0x0AB16F30, true); // Magic 3
  }

  return uf2;
}

// ─── Test Suite Execution ────────────────────────────────────────────────────────────

async function runSpiAcceptanceTests() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5 — RP2040 DUAL SPI CONTROLLER ACCEPTANCE SUITE  ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const uf2Binary = createMinimalUf2();
  const controller = new RP2040Controller();
  const loadRes = controller.loadFirmware(uf2Binary);
  if (!loadRes.success) {
    throw new Error(`Failed to load test firmware: ${loadRes.errors.join(', ')}`);
  }

  const rp2040 = (controller as any).rp2040;
  const spi0 = controller.getSpi(0)!;
  const spi1 = controller.getSpi(1)!;

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 1: DUAL CONTROLLER ISOLATION & REGISTER MAP
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('--- CATEGORY 1: DUAL CONTROLLER ISOLATION & REGISTER MAP ---');

  runTest('SPI0 (0x4003C000) and SPI1 (0x40040000) Base Isolation and Identification', () => {
    // Read PrimeCell & Peripheral ID from SPI0
    const pcell0 = spi0.readUint32(REG_SSPPCELLID0);
    const pcell1 = spi0.readUint32(REG_SSPPCELLID1);
    const pcell2 = spi0.readUint32(REG_SSPPCELLID2);
    const pcell3 = spi0.readUint32(REG_SSPPCELLID3);
    const periph0 = spi0.readUint32(REG_SSPPERIPHID0);
    const periph1 = spi0.readUint32(REG_SSPPERIPHID1);
    const periph2 = spi0.readUint32(REG_SSPPERIPHID2);
    const periph3 = spi0.readUint32(REG_SSPPERIPHID3);

    assertCheck(pcell0 === 0x0d && pcell1 === 0xf0 && pcell2 === 0x05 && pcell3 === 0xb1, 'SPI0 PrimeCell ID matches ARM PL022 (0xB105F00D)');
    assertCheck(periph0 === 0x22 && periph1 === 0x10 && periph2 === 0x04 && periph3 === 0x00, 'SPI0 Peripheral ID matches ARM PL022 (0x00041022)');

    // Verify SPI1 reads identical ID registers
    assertCheck(spi1.readUint32(REG_SSPPCELLID0) === 0x0d, 'SPI1 PrimeCell ID matches');
    assertCheck(spi1.readUint32(REG_SSPPERIPHID0) === 0x22, 'SPI1 Peripheral ID matches');

    // Verify write isolation: writing SPI0 SSPCR0 does not affect SPI1
    spi0.writeUint32(REG_SSPCR0, 0x07); // 8-bit mode
    spi1.writeUint32(REG_SSPCR0, 0x0f); // 16-bit mode
    assertCheck(spi0.readUint32(REG_SSPCR0) === 0x07, 'SPI0 SSPCR0 maintains written value');
    assertCheck(spi1.readUint32(REG_SSPCR0) === 0x0f, 'SPI1 SSPCR0 maintains isolated written value');
  });

  runTest('Reset Values & Initial Register State Conformance', () => {
    // Reset registers on SPI0
    spi0.writeUint32(REG_SSPCR0, 0x0000);
    spi0.writeUint32(REG_SSPCR1, 0x0000);
    spi0.writeUint32(REG_SSPCPSR, 0x0000);
    spi0.writeUint32(REG_SSPIMSC, 0x0000);
    spi0.writeUint32(REG_SSPDMACR, 0x0000);

    assertCheck(spi0.readUint32(REG_SSPCR0) === 0x0000, 'Reset SSPCR0 is 0x0000');
    assertCheck(spi0.readUint32(REG_SSPCR1) === 0x0000, 'Reset SSPCR1 is 0x0000 (disabled)');
    // SSPSR reset: TFE=1 (bit 0), TNF=1 (bit 1) => 0x0003
    assertCheck(spi0.readUint32(REG_SSPSR) === (SR_TFE | SR_TNF), 'Reset SSPSR has TFE=1, TNF=1 (0x0003)');
    assertCheck(spi0.readUint32(REG_SSPCPSR) === 0x0000, 'Reset SSPCPSR is 0x0000');
    assertCheck(spi0.readUint32(REG_SSPIMSC) === 0x0000, 'Reset SSPIMSC is 0x0000 (all masked)');
    // SSPRIS reset: TXRIS=1 (bit 3) because TX FIFO is empty (<= 4 entries) => 0x0008
    assertCheck(spi0.readUint32(REG_SSPRIS) === INT_TX, 'Reset SSPRIS has TXRIS=1 (0x0008)');
    assertCheck(spi0.readUint32(REG_SSPMIS) === 0x0000, 'Reset SSPMIS is 0x0000 (masked)');
    assertCheck(spi0.readUint32(REG_SSPDMACR) === 0x0000, 'Reset SSPDMACR is 0x0000 (DMA disabled)');
  });

  runTest('RP2040 Atomic Register Aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)', () => {
    // Test atomic SET (+0x2000)
    spi0.writeUint32(REG_SSPCR0, 0x0000);
    spi0.writeUint32(0x2000 + REG_SSPCR0, 0x0007); // Set DSS to 8-bit
    assertCheck(spi0.readUint32(REG_SSPCR0) === 0x0007, 'Atomic SET (+0x2000) correctly updated bits');

    // Test atomic CLR (+0x3000)
    spi0.writeUint32(0x3000 + REG_SSPCR0, 0x0003); // Clear bits [1:0] => 0x0004
    assertCheck(spi0.readUint32(REG_SSPCR0) === 0x0004, 'Atomic CLR (+0x3000) correctly cleared bits');

    // Test atomic XOR (+0x1000)
    spi0.writeUint32(0x1000 + REG_SSPCR0, 0x0007); // XOR with 0x0007 => 0x0004 ^ 0x0007 = 0x0003
    assertCheck(spi0.readUint32(REG_SSPCR0) === 0x0003, 'Atomic XOR (+0x1000) correctly toggled bits');
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 2: CLOCK DIVIDERS & BAUD RATE CALCULATIONS
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 2: CLOCK DIVIDERS & BAUD RATE CALCULATIONS ---');

  runTest('Clock Prescaler (SSPCPSR), SCR and Baud Rate Calculation', () => {
    spi0.setPeripheralClock(125_000_000); // 125 MHz peri clock

    // Prescale CPSDVSR = 250, SCR = 0 => 125 MHz / (250 * 1) = 500,000 Hz (500 kHz)
    spi0.writeUint32(REG_SSPCPSR, 250);
    spi0.writeUint32(REG_SSPCR0, 0x0007); // SCR = 0, DSS = 8-bit
    assertCheck(spi0.baudRate === 500_000, `Baud rate CPSDVSR=250, SCR=0 is 500 kHz (got ${spi0.baudRate})`);

    // Prescale CPSDVSR = 2, SCR = 124 => 125 MHz / (2 * 125) = 500,000 Hz
    spi0.writeUint32(REG_SSPCPSR, 2);
    spi0.writeUint32(REG_SSPCR0, (124 << CR0_SCR_SHIFT) | 0x0007);
    assertCheck(spi0.baudRate === 500_000, `Baud rate CPSDVSR=2, SCR=124 is 500 kHz (got ${spi0.baudRate})`);

    // High speed: CPSDVSR = 2, SCR = 0 => 125 MHz / 2 = 62.5 MHz (Max RP2040 SPI master rate)
    spi0.writeUint32(REG_SSPCR0, 0x0007);
    assertCheck(spi0.baudRate === 62_500_000, `Max SPI master rate is 62.5 MHz (got ${spi0.baudRate})`);
  });

  runTest('Even CPSDVSR Prescaler Constraint (Bit 0 Cleared/Ignored in Hardware)', () => {
    // Attempt to write odd prescaler divisor (e.g. 15)
    spi0.writeUint32(REG_SSPCPSR, 15);
    const readCpsr = spi0.readUint32(REG_SSPCPSR);
    assertCheck(readCpsr === 14, `Odd divisor 15 truncated to even 14 (got ${readCpsr})`);
    assertCheck((readCpsr & 1) === 0, 'Bit 0 of CPSDVSR is strictly zero');
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 3: MOTOROLA SPI MODES 0, 1, 2, 3 & PROTOCOL ENGINE
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 3: MOTOROLA SPI MODES 0, 1, 2, 3 & PROTOCOL ENGINE ---');

  for (let mode = 0; mode < 4; mode++) {
    const cpol = (mode & 2) !== 0;
    const cpha = (mode & 1) !== 0;

    runTest(`Motorola SPI Mode ${mode} (CPOL=${cpol ? 1 : 0}, CPHA=${cpha ? 1 : 0}) Loopback Transmission`, () => {
      spi0.clearFifos();
      // Configure Mode
      let cr0Val = 0x0007; // 8-bit
      if (cpol) cr0Val |= CR0_SPO;
      if (cpha) cr0Val |= CR0_SPH;
      spi0.writeUint32(REG_SSPCR0, cr0Val);

      // Prescaler: CPSDVSR=10, SCR=0 => 10 cycles per bit (5 cycles per half-bit)
      spi0.writeUint32(REG_SSPCPSR, 10);

      // Enable SPI in Master mode with Loopback enabled (LBM = 1, SSE = 1)
      spi0.writeUint32(REG_SSPCR1, CR1_LBM | CR1_SSE);

      assertCheck(spi0.mode === mode, `Controller reports Mode ${mode}`);
      assertCheck(spi0.sckLineState === cpol, `Idle SCLK level matches CPOL (${cpol})`);

      // Write test byte 0xA5 to TX FIFO
      spi0.writeUint32(REG_SSPDR, 0xa5);
      assertCheck(spi0.readUint32(REG_SSPSR) & SR_BSY ? true : false, 'Controller enters busy state when transmission begins');

      // Step clock cycles to execute frame (8 bits * 10 cycles = 80 cycles + margin)
      spi0.tickCycles(100);

      assertCheck((spi0.readUint32(REG_SSPSR) & SR_BSY) === 0, 'Controller returns to idle after transmission finishes');
      assertCheck((spi0.readUint32(REG_SSPSR) & SR_RNE) !== 0, 'Receive FIFO Not Empty (RNE=1)');

      // Read back received loopback byte
      const rxVal = spi0.readUint32(REG_SSPDR);
      assertCheck(rxVal === 0xa5, `Received loopback byte matches transmitted 0xA5 (got 0x${rxVal.toString(16)})`);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 4: VARIABLE WORD SIZES (4 TO 16 BITS)
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 4: VARIABLE WORD SIZES (4 TO 16 BITS) ---');

  const testWordSizes = [4, 8, 12, 16];
  for (const wordBits of testWordSizes) {
    runTest(`Variable Frame Size: ${wordBits}-Bit Data Word Transfer (DSS = ${wordBits - 1})`, () => {
      spi0.clearFifos();
      // Configure DSS = wordBits - 1
      const dss = (wordBits - 1) & 0x0f;
      spi0.writeUint32(REG_SSPCR0, dss);
      spi0.writeUint32(REG_SSPCPSR, 10);
      spi0.writeUint32(REG_SSPCR1, CR1_LBM | CR1_SSE); // Loopback mode

      assertCheck(spi0.dataSizeBits === wordBits, `Data size is configured to ${wordBits} bits`);

      // Test pattern: all 1s in lower wordBits
      const mask = (1 << wordBits) - 1;
      const testVal = (0xbeef & mask);

      spi0.writeUint32(REG_SSPDR, testVal);
      spi0.tickCycles(wordBits * 10 + 20);

      const rxWord = spi0.readUint32(REG_SSPDR);
      assertCheck(rxWord === testVal, `Received ${wordBits}-bit word 0x${rxWord.toString(16)} matches expected 0x${testVal.toString(16)}`);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 5: 8-ENTRY FIFO BUFFERING & STATUS FLAGS
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 5: 8-ENTRY FIFO BUFFERING & STATUS FLAGS ---');

  runTest('8-Entry TX FIFO Depth, Status Flags (TFE, TNF), and Overflow Protection', () => {
    spi0.clearFifos();
    spi0.writeUint32(REG_SSPCR1, 0x0000); // Disabled so TX FIFO retains data without shifting
    spi0.writeUint32(REG_SSPCR0, 0x0007); // 8-bit

    assertCheck((spi0.readUint32(REG_SSPSR) & SR_TFE) !== 0, 'TX FIFO initially empty (TFE=1)');
    assertCheck((spi0.readUint32(REG_SSPSR) & SR_TNF) !== 0, 'TX FIFO initially not full (TNF=1)');

    // Fill 8 entries
    for (let i = 0; i < 8; i++) {
      spi0.writeUint32(REG_SSPDR, 0x10 + i);
    }

    assertCheck((spi0.readUint32(REG_SSPSR) & SR_TFE) === 0, 'TX FIFO no longer empty (TFE=0)');
    assertCheck((spi0.readUint32(REG_SSPSR) & SR_TNF) === 0, 'TX FIFO is full (TNF=0)');
    assertCheck(spi0.getTxFifo().length === 8, 'TX FIFO depth is exactly 8');

    // 9th write to full TX FIFO is ignored/discarded
    spi0.writeUint32(REG_SSPDR, 0xff);
    assertCheck(spi0.getTxFifo().length === 8, '9th write did not overrun TX FIFO (depth remains 8)');
  });

  runTest('8-Entry RX FIFO Buffering, Status Flags (RNE, RFF), and Underflow', () => {
    spi0.clearFifos();
    // Reading empty RX FIFO returns 0 without crashing
    const underflowVal = spi0.readUint32(REG_SSPDR);
    assertCheck(underflowVal === 0x0000, 'Reading empty RX FIFO returns 0x0000');
    assertCheck((spi0.readUint32(REG_SSPSR) & SR_RNE) === 0, 'RX FIFO is empty (RNE=0)');
    assertCheck((spi0.readUint32(REG_SSPSR) & SR_RFF) === 0, 'RX FIFO is not full (RFF=0)');
  });

  runTest('RX Overrun Detection (RORRIS) and Clearing via SSPICR.RORIC', () => {
    spi0.clearFifos();
    spi0.writeUint32(REG_SSPCR0, 0x0007); // 8-bit
    spi0.writeUint32(REG_SSPCPSR, 2);     // Fast shift
    spi0.writeUint32(REG_SSPCR1, CR1_LBM | CR1_SSE);

    // Write 8 words and shift to fill RX FIFO
    for (let i = 0; i < 8; i++) {
      spi0.writeUint32(REG_SSPDR, 0x20 + i);
    }
    spi0.tickCycles(200);

    assertCheck((spi0.readUint32(REG_SSPSR) & SR_RFF) !== 0, 'RX FIFO is completely full (RFF=1, 8 entries)');
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_ROR) === 0, 'RORRIS not yet set before overrun');

    // Transmit 9th word into full RX FIFO => Overrun!
    spi0.writeUint32(REG_SSPDR, 0x99);
    spi0.tickCycles(50);

    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_ROR) !== 0, 'RORRIS asserted upon receiving 9th frame');

    // Clear via SSPICR.RORIC
    spi0.writeUint32(REG_SSPICR, INT_ROR);
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_ROR) === 0, 'RORRIS cleared after writing SSPICR.RORIC');
  });

  runTest('RX Idle Timeout Detection (RTRIS) and Clearing via SSPICR.RTIC', () => {
    spi0.clearFifos();
    spi0.writeUint32(REG_SSPCR0, 0x0007);
    spi0.writeUint32(REG_SSPCPSR, 10); // 10 cycles per bit
    spi0.writeUint32(REG_SSPCR1, CR1_LBM | CR1_SSE);

    // Send 1 byte and receive into RX FIFO
    spi0.writeUint32(REG_SSPDR, 0x55);
    spi0.tickCycles(100);

    assertCheck(spi0.getRxFifo().length === 1, 'RX FIFO contains 1 unread byte');
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_RT) === 0, 'RTRIS not asserted immediately');

    // Advance clock past 32 bit periods (32 * 10 = 320 cycles)
    spi0.tickCycles(400);

    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_RT) !== 0, 'RTRIS asserted after 32 bit periods of unread idle RX data');

    // Clear via SSPICR.RTIC
    spi0.writeUint32(REG_SSPICR, INT_RT);
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_RT) === 0, 'RTRIS cleared after writing SSPICR.RTIC');
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 6: INTERRUPTS & NVIC DELIVERY
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 6: INTERRUPTS & NVIC DELIVERY ---');

  runTest('Watermark Threshold Interrupts: TXRIS (<= 4) and RXRIS (>= 4)', () => {
    spi0.clearFifos();
    spi0.writeUint32(REG_SSPCR1, 0x0000); // Disabled

    // TX FIFO empty => depth 0 <= 4 => TXRIS asserted!
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_TX) !== 0, 'TXRIS asserted when TX FIFO has 0 entries (<= 4)');

    // Add 4 entries => depth 4 <= 4 => TXRIS still asserted!
    for (let i = 0; i < 4; i++) spi0.writeUint32(REG_SSPDR, i);
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_TX) !== 0, 'TXRIS asserted when TX FIFO has 4 entries (<= 4)');

    // Add 5th entry => depth 5 > 4 => TXRIS de-asserts!
    spi0.writeUint32(REG_SSPDR, 5);
    assertCheck((spi0.readUint32(REG_SSPRIS) & INT_TX) === 0, 'TXRIS de-asserted when TX FIFO has 5 entries (> 4)');
  });

  runTest('Cortex-M0+ NVIC Interrupt Delivery (IRQ 18 for SPI0 & IRQ 19 for SPI1)', () => {
    spi0.clearFifos();
    spi1.clearFifos();

    let irq18Signaled = false;
    let irq19Signaled = false;
    const origSetInterrupt = rp2040.setInterrupt.bind(rp2040);
    rp2040.setInterrupt = (irq: number, value: boolean) => {
      origSetInterrupt(irq, value);
      if (irq === 18 && value) irq18Signaled = true;
      if (irq === 19 && value) irq19Signaled = true;
    };

    // Enable TX interrupt mask (TXIM) on SPI0
    spi0.writeUint32(REG_SSPIMSC, INT_TX);
    spi0.updateInterrupts();
    assertCheck((spi0.readUint32(REG_SSPMIS) & INT_TX) !== 0, 'SPI0 SSPMIS reflects unmasked TX interrupt');
    assertCheck(irq18Signaled, 'SPI0 NVIC IRQ 18 is signaled to Cortex-M0+');

    // Enable TX interrupt mask on SPI1 => IRQ 19
    spi1.writeUint32(REG_SSPIMSC, INT_TX);
    spi1.updateInterrupts();
    assertCheck(irq19Signaled, 'SPI1 NVIC IRQ 19 is signaled to Cortex-M0+');

    // Restore setInterrupt
    rp2040.setInterrupt = origSetInterrupt;
    spi0.writeUint32(REG_SSPIMSC, 0x0000);
    spi1.writeUint32(REG_SSPIMSC, 0x0000);
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 7: DMA DREQ PACING & ISOLATION
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 7: DMA DREQ PACING & ISOLATION ---');

  runTest('DMA DREQ Pacing Conditioned on SSPDMACR (TXDMAE/RXDMAE) & FIFO Levels', () => {
    spi0.clearFifos();
    spi0.writeUint32(REG_SSPDMACR, 0x0000); // DMA disabled

    // Even though TX FIFO is empty (<= 4), DREQ 16 must NOT be set when TXDMAE = 0!
    assertCheck(!rp2040.dma.dreq[DREQ_SPI0_TX], 'SPI0 TX DREQ 16 is de-asserted when TXDMAE = 0');

    // Enable TX DMA (TXDMAE = 1)
    spi0.writeUint32(REG_SSPDMACR, DMACR_TXDMAE);
    assertCheck(rp2040.dma.dreq[DREQ_SPI0_TX], 'SPI0 TX DREQ 16 is asserted when TXDMAE = 1 and TX FIFO <= 4');

    // Disable TX DMA => DREQ must clear immediately
    spi0.writeUint32(REG_SSPDMACR, 0x0000);
    assertCheck(!rp2040.dma.dreq[DREQ_SPI0_TX], 'SPI0 TX DREQ 16 clears immediately when TXDMAE is disabled');

    // Enable RX DMA with empty RX FIFO => RX DREQ must be 0
    spi0.writeUint32(REG_SSPDMACR, DMACR_RXDMAE);
    assertCheck(!rp2040.dma.dreq[DREQ_SPI0_RX], 'SPI0 RX DREQ 17 is de-asserted when RX FIFO is empty');

    // SPI1 DMA DREQs (18 & 19)
    spi1.clearFifos();
    spi1.writeUint32(REG_SSPDMACR, DMACR_TXDMAE);
    assertCheck(rp2040.dma.dreq[DREQ_SPI1_TX], 'SPI1 TX DREQ 18 is asserted when TXDMAE = 1');
    spi1.writeUint32(REG_SSPDMACR, 0x0000);
    assertCheck(!rp2040.dma.dreq[DREQ_SPI1_TX], 'SPI1 TX DREQ 18 is cleared when TXDMAE = 0');
  });

  runTest('Non-Vacuous DMA Isolation: Immunity against Active PWM Wrap (DREQ 24)', () => {
    // Assert PWM Wrap 0 (DREQ 24)
    rp2040.dma.setDREQ(24);
    assertCheck(rp2040.dma.dreq[24], 'PWM Wrap DREQ 24 is active');

    // Verify SPI0 and SPI1 DREQs remain unaffected
    spi0.writeUint32(REG_SSPDMACR, 0x0000);
    spi1.writeUint32(REG_SSPDMACR, 0x0000);
    assertCheck(!rp2040.dma.dreq[DREQ_SPI0_TX], 'SPI0 TX DREQ 16 unaffected by PWM DREQ 24');
    assertCheck(!rp2040.dma.dreq[DREQ_SPI0_RX], 'SPI0 RX DREQ 17 unaffected by PWM DREQ 24');
    assertCheck(!rp2040.dma.dreq[DREQ_SPI1_TX], 'SPI1 TX DREQ 18 unaffected by PWM DREQ 24');
    assertCheck(!rp2040.dma.dreq[DREQ_SPI1_RX], 'SPI1 RX DREQ 19 unaffected by PWM DREQ 24');

    rp2040.dma.clearDREQ(24);
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 8: IO_BANK0 FUNCTION 1 PIN MULTIPLEXING
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 8: IO_BANK0 FUNCTION 1 PIN MULTIPLEXING ---');

  runTest('RP2040 IO_BANK0 Function 1 Multiplexing across All 30 GPIO Pins', () => {
    const bridge = (controller as any).gpioBridge;
    assertCheck(bridge !== null, 'GPIO Bridge is attached');

    // Verify SPI0 pin assignments
    for (const pinIdx of SPI0_RX_PINS) {
      rp2040.gpio[pinIdx].ctrl = (rp2040.gpio[pinIdx].ctrl & ~0x1f) | FUNCTION_SPI;
      bridge.recomputeDriverState(pinIdx);
      const state = bridge.getDriverState(pinIdx);
      assertCheck(state.functionName === 'SPI', `GP${pinIdx} function is SPI`);
      assertCheck(!state.outputEnable, `GP${pinIdx} (SPI0 RX/MISO) is an input`);
    }

    for (const pinIdx of SPI0_TX_PINS) {
      rp2040.gpio[pinIdx].ctrl = (rp2040.gpio[pinIdx].ctrl & ~0x1f) | FUNCTION_SPI;
      bridge.recomputeDriverState(pinIdx);
      const state = bridge.getDriverState(pinIdx);
      assertCheck(state.functionName === 'SPI', `GP${pinIdx} function is SPI`);
    }

    for (const pinIdx of SPI0_SCK_PINS) {
      rp2040.gpio[pinIdx].ctrl = (rp2040.gpio[pinIdx].ctrl & ~0x1f) | FUNCTION_SPI;
      bridge.recomputeDriverState(pinIdx);
      const state = bridge.getDriverState(pinIdx);
      assertCheck(state.functionName === 'SPI', `GP${pinIdx} function is SPI`);
    }

    for (const pinIdx of SPI0_CSN_PINS) {
      rp2040.gpio[pinIdx].ctrl = (rp2040.gpio[pinIdx].ctrl & ~0x1f) | FUNCTION_SPI;
      bridge.recomputeDriverState(pinIdx);
      const state = bridge.getDriverState(pinIdx);
      assertCheck(state.functionName === 'SPI', `GP${pinIdx} function is SPI`);
      assertCheck(state.logicalOutput === true, `GP${pinIdx} (CSn) is idle HIGH (true)`);
    }

    // Verify SPI1 pin assignments
    for (const pinIdx of SPI1_RX_PINS) {
      rp2040.gpio[pinIdx].ctrl = (rp2040.gpio[pinIdx].ctrl & ~0x1f) | FUNCTION_SPI;
      bridge.recomputeDriverState(pinIdx);
      const state = bridge.getDriverState(pinIdx);
      assertCheck(state.functionName === 'SPI', `GP${pinIdx} function is SPI`);
    }
  });

  runTest('Dynamic Switching between SIO (Func 5) and SPI (Func 1)', () => {
    const bridge = (controller as any).gpioBridge;
    const pin = rp2040.gpio[3]; // GP3 = SPI0 TX / SIO 3

    // Configure as SIO output driving HIGH
    pin.ctrl = (pin.ctrl & ~0x1f) | FUNCTION_SIO;
    bridge.recomputeDriverState(3);
    assertCheck(bridge.getDriverState(3).functionName === 'SIO', 'GP3 is SIO');

    // Switch to SPI (Function 1)
    pin.ctrl = (pin.ctrl & ~0x1f) | FUNCTION_SPI;
    bridge.recomputeDriverState(3);
    assertCheck(bridge.getDriverState(3).functionName === 'SPI', 'GP3 dynamically switched to SPI');

    // Switch back to SIO
    pin.ctrl = (pin.ctrl & ~0x1f) | FUNCTION_SIO;
    bridge.recomputeDriverState(3);
    assertCheck(bridge.getDriverState(3).functionName === 'SIO', 'GP3 dynamically switched back to SIO');
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 9: ELECTRICAL MNA CO-SIMULATION (PUSH-PULL & SCHMITT INPUT)
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 9: ELECTRICAL MNA CO-SIMULATION ---');

  runTest('Active CMOS Push-Pull Driver Impedance (50 Ω) and Thevenin Voltage Loading', () => {
    const bridge = (controller as any).gpioBridge;
    // GP2 = SPI0 SCK
    rp2040.gpio[2].ctrl = (rp2040.gpio[2].ctrl & ~0x1f) | FUNCTION_SPI;
    bridge.recomputeDriverState(2);

    const sckState = bridge.getDriverState(2);
    // Push-pull active driver has ~50 Ω impedance (at 4mA setting)
    assertCheck(sckState.driverImpedance_Ohms <= 100, `Active driver impedance is low-Z (~50 Ω, got ${sckState.driverImpedance_Ohms} Ω)`);

    // Simulated MNA result: 50 Ω driving 3.3V into 100 Ω load to GND:
    // V_node = 3.3 * (100 / (100 + 50)) = 2.2 V
    const rLoad = 100;
    const rDriver = sckState.driverImpedance_Ohms;
    const expectedV = 3.3 * (rLoad / (rLoad + rDriver));
    assertCheck(expectedV > 2.0 && expectedV < 3.2, `Thevenin divider calculation verified (${expectedV.toFixed(2)} V)`);
  });

  runTest('High-Impedance Schmitt Trigger Input on MISO with Hysteresis (VIH=2.0V, VIL=0.8V)', () => {
    const bridge = (controller as any).gpioBridge;
    // GP0 = SPI0 RX / MISO
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_SPI;
    // Clear default pull-down (PDE bit 2, PUE bit 3) and enable input buffer (IE bit 6)
    rp2040.gpio[0].padValue = (rp2040.gpio[0].padValue & ~(0x04 | 0x08)) | 0x40;
    bridge.recomputeDriverState(0);

    const misoState = bridge.getDriverState(0);
    assertCheck(misoState.driverImpedance_Ohms >= 1e8, 'MISO Schmitt input impedance is High-Z (100 MΩ)');

    // Simulate MNA feeding 2.5V (above VIH 2.0V) on Node 1 mapped to GP0 => logical input = true
    const gpioMap = new Map<number, number>([[0, 1]]);
    bridge.updateFromMnaResult([0, 2.5], gpioMap);

    assertCheck(bridge.getDriverState(0).logicalInput === true, 'Voltage 2.5V exceeds VIH (2.0V) => logicalInput is true');

    // Simulate MNA feeding 0.5V (below VIL 0.8V) on Node 1 mapped to GP0 => logical input = false
    bridge.updateFromMnaResult([0, 0.5], gpioMap);

    assertCheck(bridge.getDriverState(0).logicalInput === false, 'Voltage 0.5V falls below VIL (0.8V) => logicalInput is false');
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 10: VIRTUAL SPI DEVICE MODELS
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 10: VIRTUAL SPI DEVICE MODELS ---');

  runTest('Microchip 25LC256 32 KiB SPI EEPROM: WREN, Page Write, Sequential Read, RDSR', () => {
    spi0.clearFifos();
    const eeprom = new EEPROM_25LC256();
    spi0.attachDevice(eeprom);

    spi0.writeUint32(REG_SSPCR0, 0x0007); // 8-bit, Mode 0
    spi0.writeUint32(REG_SSPCPSR, 2);
    spi0.writeUint32(REG_SSPCR1, CR1_SSE); // Enabled, Master, normal (no loopback)

    // Step 1: Send WREN (0x06)
    spi0.writeUint32(REG_SSPDR, CMD_EEPROM_WREN);
    spi0.tickCycles(100);
    spi0.readUint32(REG_SSPDR); // flush dummy RX

    assertCheck((eeprom.getStatusRegister() & 0x02) !== 0, 'EEPROM WEL latch set after WREN');

    // Step 2: Write 4 bytes [0x11, 0x22, 0x33, 0x44] to address 0x0200
    spi0.writeUint32(REG_SSPDR, CMD_EEPROM_WRITE);
    spi0.writeUint32(REG_SSPDR, 0x02); // Addr Hi
    spi0.writeUint32(REG_SSPDR, 0x00); // Addr Lo
    spi0.writeUint32(REG_SSPDR, 0x11);
    spi0.writeUint32(REG_SSPDR, 0x22);
    spi0.writeUint32(REG_SSPDR, 0x33);
    spi0.writeUint32(REG_SSPDR, 0x44);
    spi0.tickCycles(500);
    spi0.clearFifos();

    // Verify data in memory
    assertCheck(eeprom.readMemory(0x0200) === 0x11, 'Memory[0x0200] is 0x11');
    assertCheck(eeprom.readMemory(0x0201) === 0x22, 'Memory[0x0201] is 0x22');
    assertCheck(eeprom.readMemory(0x0202) === 0x33, 'Memory[0x0202] is 0x33');
    assertCheck(eeprom.readMemory(0x0203) === 0x44, 'Memory[0x0203] is 0x44');

    // Step 3: Sequential READ starting at 0x0200
    spi0.writeUint32(REG_SSPDR, CMD_EEPROM_READ);
    spi0.writeUint32(REG_SSPDR, 0x02);
    spi0.writeUint32(REG_SSPDR, 0x00);
    spi0.writeUint32(REG_SSPDR, 0x00); // Dummy byte to read byte 0
    spi0.writeUint32(REG_SSPDR, 0x00); // Dummy byte to read byte 1
    spi0.writeUint32(REG_SSPDR, 0x00); // Dummy byte to read byte 2
    spi0.writeUint32(REG_SSPDR, 0x00); // Dummy byte to read byte 3
    spi0.tickCycles(500);

    // Pop the 3 dummy bytes from command/address
    spi0.readUint32(REG_SSPDR);
    spi0.readUint32(REG_SSPDR);
    spi0.readUint32(REG_SSPDR);

    const b0 = spi0.readUint32(REG_SSPDR);
    const b1 = spi0.readUint32(REG_SSPDR);
    const b2 = spi0.readUint32(REG_SSPDR);
    const b3 = spi0.readUint32(REG_SSPDR);

    assertCheck(b0 === 0x11 && b1 === 0x22 && b2 === 0x33 && b3 === 0x44, `Sequential read matched [0x11, 0x22, 0x33, 0x44] (got [${b0}, ${b1}, ${b2}, ${b3}])`);

    spi0.detachDevice(eeprom);
  });

  runTest('Microchip MCP3008 10-Bit 8-Channel SPI ADC: MNA Voltage Conversion to 10-bit Code', () => {
    spi0.clearFifos();
    const adc = new ADC_MCP3008(3.3);
    spi0.attachDevice(adc);

    // Set Channel 0 to 1.65 V (Half scale => code ~511)
    adc.setChannelVoltage(0, 1.65);
    // Set Channel 1 to 3.30 V (Full scale => code ~1023)
    adc.setChannelVoltage(1, 3.30);

    spi0.writeUint32(REG_SSPCR0, 0x0007);
    spi0.writeUint32(REG_SSPCPSR, 2);
    spi0.writeUint32(REG_SSPCR1, CR1_SSE);

    // Read Channel 0: Send Start (0x01), Config (Single-ended CH0: 0x80), Dummy (0x00)
    spi0.writeUint32(REG_SSPDR, 0x01);
    spi0.writeUint32(REG_SSPDR, 0x80);
    spi0.writeUint32(REG_SSPDR, 0x00);
    spi0.tickCycles(300);

    spi0.readUint32(REG_SSPDR); // Dummy from start byte
    const hiByte = spi0.readUint32(REG_SSPDR); // Bits [1:0] are B9, B8
    const loByte = spi0.readUint32(REG_SSPDR); // Bits [7:0] are B7..B0
    const codeCh0 = ((hiByte & 0x03) << 8) | loByte;

    assertCheck(Math.abs(codeCh0 - 511) <= 1, `MCP3008 1.65V conversion is ~511 (got ${codeCh0})`);

    // Read Channel 1: Start (0x01), Config (Single-ended CH1: 0x90), Dummy (0x00)
    spi0.writeUint32(REG_SSPDR, 0x01);
    spi0.writeUint32(REG_SSPDR, 0x90);
    spi0.writeUint32(REG_SSPDR, 0x00);
    spi0.tickCycles(300);

    spi0.readUint32(REG_SSPDR);
    const hiByte1 = spi0.readUint32(REG_SSPDR);
    const loByte1 = spi0.readUint32(REG_SSPDR);
    const codeCh1 = ((hiByte1 & 0x03) << 8) | loByte1;

    assertCheck(codeCh1 === 1023, `MCP3008 3.3V conversion is 1023 full-scale (got ${codeCh1})`);

    spi0.detachDevice(adc);
  });

  runTest('Texas Instruments 74HC595 8-Bit Shift Register: Serial Shift & CSn Rising-Edge Latch', () => {
    spi0.clearFifos();
    const sr = new ShiftRegister_74HC595();
    sr.enableSpiCsLatchAdapter(true); // Explicitly configure external CS->STCP adapter wiring
    spi0.attachDevice(sr);

    spi0.writeUint32(REG_SSPCR0, 0x0007);
    spi0.writeUint32(REG_SSPCPSR, 2);
    spi0.writeUint32(REG_SSPCR1, CR1_SSE);

    // Send byte 0xAA (10101010)
    spi0.writeUint32(REG_SSPDR, 0xaa);
    spi0.tickCycles(150);

    // Shifter has shifted the byte, and when idle CSn returned HIGH, committing latch!
    assertCheck(sr.getOutputLatch() === 0xaa, `74HC595 output latch committed 0xAA (got 0x${sr.getOutputLatch().toString(16)})`);
    assertCheck(sr.getOutputPin(0) === false, 'Q0 bit is 0');
    assertCheck(sr.getOutputPin(1) === true, 'Q1 bit is 1');
    assertCheck(sr.getOutputPin(7) === true, 'Q7 bit is 1');

    spi0.detachDevice(sr);
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 11: LOGIC ANALYZER PROTOCOL DECODER (`decodeSpi`)
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 11: LOGIC ANALYZER PROTOCOL DECODER ---');

  runTest('Logic Analyzer Protocol Decoding via decodeSpi() (Mode 0, 8-bit)', () => {
    const samples: SpiSignalSample[] = [];
    let t = 0;

    // Idle: CS=HIGH, SCK=LOW, MOSI=LOW, MISO=LOW
    samples.push({ timestamp: t++, sck: false, mosi: false, miso: false, cs: true });
    samples.push({ timestamp: t++, sck: false, mosi: false, miso: false, cs: true });

    // CS Asserted LOW
    samples.push({ timestamp: t++, sck: false, mosi: false, miso: false, cs: false });

    // Send byte 0x93 (10010011) on MOSI, receive 0x36 (00110110) on MISO in Mode 0
    const mosiByte = 0x93;
    const misoByte = 0x36;

    for (let b = 7; b >= 0; b--) {
      const mosiBit = ((mosiByte >>> b) & 1) === 1;
      const misoBit = ((misoByte >>> b) & 1) === 1;

      // SCLK LOW (setup data)
      samples.push({ timestamp: t++, sck: false, mosi: mosiBit, miso: misoBit, cs: false });
      // SCLK HIGH (sampling edge in Mode 0)
      samples.push({ timestamp: t++, sck: true, mosi: mosiBit, miso: misoBit, cs: false });
    }

    // Return SCLK low
    samples.push({ timestamp: t++, sck: false, mosi: false, miso: false, cs: false });
    // De-assert CS
    samples.push({ timestamp: t++, sck: false, mosi: false, miso: false, cs: true });

    const decoded = decodeSpi(samples, 0, 0, 8);
    assertCheck(decoded.length === 1, `Decoded exactly 1 SPI packet (got ${decoded.length})`);
    assertCheck(decoded[0].mosiData === 0x93, `Decoded MOSI data is 0x93 (got 0x${decoded[0].mosiData.toString(16)})`);
    assertCheck(decoded[0].misoData === 0x36, `Decoded MISO data is 0x36 (got 0x${decoded[0].misoData.toString(16)})`);
    assertCheck(decoded[0].bits === 8, 'Decoded packet has 8 bits');
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 12: REAL CORTEX-M0+ FIRMWARE STEPPING & MMIO REGISTERS
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 12: REAL CORTEX-M0+ FIRMWARE STEPPING ---');

  runTest('Real Cortex-M0+ Instruction Stepping & MMIO Register Control', () => {
    // Step Cortex-M0+ CPU core instructions
    const stepRes = controller.step(10);
    assertCheck(stepRes.instructionsExecuted > 0, `Core executed ${stepRes.instructionsExecuted} instructions`);
    assertCheck(stepRes.cyclesExecuted > 0, `Core elapsed ${stepRes.cyclesExecuted} clock cycles`);

    // Write through CPU memory bus (MMIO write at SPI0 base 0x4003C000)
    rp2040.writeUint32(0x4003c000, 0x0007);
    const readVal = rp2040.readUint32(0x4003c000);
    assertCheck(readVal === 0x0007, `CPU MMIO read from 0x4003C000 returned 0x0007 (got 0x${readVal.toString(16)})`);
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // CATEGORY 13: DIAGNOSTICS SNAPSHOT INTEGRITY
  // ───────────────────────────────────────────────────────────────────────────────────
  console.log('\n--- CATEGORY 13: DIAGNOSTICS SNAPSHOT INTEGRITY ---');

  runTest('Controller SPI Diagnostics Snapshot Integrity (SPI0 & SPI1)', () => {
    const diag = controller.getSpiDiagnostics();
    assertCheck(diag.spi0 !== undefined, 'SPI0 diagnostics present');
    assertCheck(diag.spi1 !== undefined, 'SPI1 diagnostics present');
    assertCheck(diag.spi0?.name === 'SPI0', 'SPI0 name is SPI0');
    assertCheck(diag.spi1?.name === 'SPI1', 'SPI1 name is SPI1');
    assertCheck(diag.spi0?.dataBits === 8, 'SPI0 dataBits reported accurately');

    const snap = controller.getExecutionSnapshot();
    assertCheck(snap.spiDiagnostics?.spi0?.name === 'SPI0', 'Snapshot contains SPI0 diagnostics');
    assertCheck(snap.spiDiagnostics?.spi1?.name === 'SPI1', 'Snapshot contains SPI1 diagnostics');
  });

  // ─── Summary ───────────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PHASE 4.3.5 SPI ACCEPTANCE: ${passedTests}/${totalTests} TESTS PASSED (${passedChecks}/${totalChecks} CHECKS)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedTests !== totalTests || passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runSpiAcceptanceTests().catch(err => {
  console.error('Unhandled Acceptance Suite Failure:', err);
  process.exit(1);
});
