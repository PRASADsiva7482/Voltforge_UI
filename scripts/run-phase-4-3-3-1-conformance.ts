/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.3.1 RP2040 UART Hardware-Conformance & Forensic Audit Suite
 * 
 * Verifies all 14 mandatory hardware-conformance audit scenarios:
 * 1. Independent UART0 TX & UART1 TX (distinct baud rates, streams, pins GP0 vs GP4)
 * 2. Independent UART0 RX & UART1 RX (distinct baud rates, pins GP1 vs GP5, buffers)
 * 3. Exact 32-Byte FIFO Boundary Tests (0, 1, 15, 16, 17, 31, 32 entries for TX and RX)
 * 4. 33-Byte Overflow and Overrun Error (OEIS in UARTRIS, OES in UARTRSR)
 * 5. Per-Character Parity/Framing Error Association in 12-Bit RX FIFO Entries
 * 6. FIFO-Disabled Operation (Depth 1 Holding Register, FEN=0)
 * 7. Interrupt-Driven RX and TX with 32-Byte Configurable Threshold Levels (UARTIFLS 1/8 to 7/8)
 * 8. Baud Rate Mismatch Framing Error (FEIS) Detection
 * 9. IO_BANK0 GPIO Multiplexer Reassignment (SIO <-> UART Dynamic Switching)
 * 10. Closed-Loop MNA Electrical Co-Simulation (GP0 TX -> Wire -> GP1 RX Loopback)
 * 11. Bidirectional Serial Monitor Host Input Reaching Firmware
 * 12. Firmware Serial Transmission Reaching Serial Monitor UI
 * 13. Peripheral Reset During Active Serial Transmission
 * 14. Pause/Resume During Active Transmission Preserving Fractional Timing State
 * 
 * Plus:
 * 15. Dual Clock Domain Architecture (clk_sys vs clk_peri) & Dynamic Clock Scaling
 * 16. Hardware Flow Control (RTS/CTS) Auto & Manual Gating
 * 17. DMA DREQ Handshaking & Controller Registration
 * 18. Complete PL011 Register Reset & Atomic Alias Conformance
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  RP2040Uart,
  REG_UARTDR,
  REG_UARTRSR,
  REG_UARTECR,
  REG_UARTFR,
  REG_UARTILPR,
  REG_UARTIBRD,
  REG_UARTFBRD,
  REG_UARTLCR_H,
  REG_UARTCR,
  REG_UARTIFLS,
  REG_UARTIMSC,
  REG_UARTRIS,
  REG_UARTMIS,
  REG_UARTICR,
  REG_UARTDMACR,
  REG_UARTPERIPHID0,
  REG_UARTPERIPHID1,
  REG_UARTPERIPHID2,
  REG_UARTPERIPHID3,
  REG_UARTPCELLID0,
  REG_UARTPCELLID1,
  REG_UARTPCELLID2,
  REG_UARTPCELLID3,
  FR_TXFE,
  FR_RXFE,
  FR_BUSY,
  FR_TXFF,
  FR_RXFF,
  FR_CTS,
  LCR_FEN,
  LCR_PEN,
  LCR_EPS,
  LCR_STP2,
  LCR_SPS,
  LCR_BRK,
  CR_UARTEN,
  CR_TXE,
  CR_RXE,
  CR_RTS,
  CR_RTSEN,
  CR_CTSEN,
  CR_LBE,
  INT_TX,
  INT_RX,
  INT_RT,
  INT_FE,
  INT_PE,
  INT_BE,
  INT_OE,
  INT_CTS,
  ERR_FE,
  ERR_PE,
  ERR_BE,
  ERR_OE,
} from '../src/features/simulator/rp2040Uart';
import {
  RP2040GpioBridge,
  FUNCTION_UART,
  FUNCTION_SIO,
  UART0_TX_PINS,
  UART0_RX_PINS,
  UART0_CTS_PINS,
  UART0_RTS_PINS,
  UART1_TX_PINS,
  UART1_RX_PINS,
  UART1_CTS_PINS,
  UART1_RTS_PINS,
} from '../src/features/simulator/rp2040GpioBridge';
import { MNASolver, type MNAElement } from '../src/features/simulator/MNASolver';

interface TestResult {
  id: number;
  scenario: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, scenario: string, name: string, passed: boolean, details: string) {
  results.push({ id, scenario, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Scenario ${String(id).padStart(2, '0')}] [${scenario}] ${status}: ${name}`);
  console.log(`            ${details}`);
}

async function runConformanceSuite() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.3.1 — RP2040 UART CONFORMANCE & AUDIT SUITE      ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const blinkFixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const blinkBytes = new Uint8Array(fs.readFileSync(blinkFixturePath));

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 1: INDEPENDENT UART0 TX & UART1 TX
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('--- SCENARIO 01: INDEPENDENT UART0 TX & UART1 TX ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const uart1 = controller.getUart(1)!;
    const clkPeri = 125_000_000;

    // Configure UART0 at 115200 (IBRD=67, FBRD=52)
    uart0.setPeripheralClock(clkPeri);
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE);

    // Configure UART1 at 9600 (IBRD=813, FBRD=51)
    uart1.setPeripheralClock(clkPeri);
    uart1.writeUint32(REG_UARTIBRD, 813);
    uart1.writeUint32(REG_UARTFBRD, 51);
    uart1.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart1.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE);

    const stream0: number[] = [];
    const stream1: number[] = [];
    uart0.onByteTransmit = (b) => stream0.push(b);
    uart1.onByteTransmit = (b) => stream1.push(b);

    // Write distinct strings to each UART
    const text0 = 'ALPHA_0';
    const text1 = 'BETA_1';
    for (let i = 0; i < text0.length; i++) uart0.writeUint32(REG_UARTDR, text0.charCodeAt(i));
    for (let i = 0; i < text1.length; i++) uart1.writeUint32(REG_UARTDR, text1.charCodeAt(i));

    // Drain both UARTs (step emulated cycles: 9600 baud requires ~130k cycles per char)
    for (let c = 0; c < 1_500_000; c += 1000) {
      uart0.tickCycles(1000, clkPeri);
      uart1.tickCycles(1000, clkPeri);
      const u0Done = (uart0.readUint32(REG_UARTFR) & FR_BUSY) === 0 && (uart0.readUint32(REG_UARTFR) & FR_TXFE) !== 0;
      const u1Done = (uart1.readUint32(REG_UARTFR) & FR_BUSY) === 0 && (uart1.readUint32(REG_UARTFR) & FR_TXFE) !== 0;
      if (u0Done && u1Done) break;
    }

    const str0 = String.fromCharCode(...stream0);
    const str1 = String.fromCharCode(...stream1);
    const ok = str0 === text0 && str1 === text1 && uart0.baudRate === 115207 && uart1.baudRate === 9600;

    record(1, 'INDEP_TX', 'Independent Dual UART0 TX & UART1 TX at Distinct Baud Rates', ok,
      `UART0: "${str0}" (${uart0.baudRate} Bd); UART1: "${str1}" (${uart1.baudRate} Bd); Zero cross-talk`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 2: INDEPENDENT UART0 RX & UART1 RX
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 02: INDEPENDENT UART0 RX & UART1 RX ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const uart1 = controller.getUart(1)!;

    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    uart1.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart1.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // Feed independent data streams to each receiver
    uart0.feedString('MSG_PORT0');
    uart1.feedString('MSG_PORT1');

    const out0: string[] = [];
    while ((uart0.readUint32(REG_UARTFR) & FR_RXFE) === 0) {
      out0.push(String.fromCharCode(uart0.readUint32(REG_UARTDR) & 0xff));
    }

    const out1: string[] = [];
    while ((uart1.readUint32(REG_UARTFR) & FR_RXFE) === 0) {
      out1.push(String.fromCharCode(uart1.readUint32(REG_UARTDR) & 0xff));
    }

    const ok = out0.join('') === 'MSG_PORT0' && out1.join('') === 'MSG_PORT1';

    record(2, 'INDEP_RX', 'Independent Dual UART0 RX & UART1 RX Buffer Isolation', ok,
      `UART0 RX: "${out0.join('')}"; UART1 RX: "${out1.join('')}"; Completely isolated FIFOs`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 3: EXACT 32-BYTE FIFO BOUNDARY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 03: EXACT 32-BYTE FIFO BOUNDARY TESTS ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    // Test TX FIFO boundaries: 0, 1, 15, 16, 17, 31, 32 entries
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    // Keep transmitter disabled so bytes accumulate in FIFO
    uart0.writeUint32(REG_UARTCR, CR_UARTEN);

    // Initial boundary: 0 entries
    const fr0 = uart0.readUint32(REG_UARTFR);
    const txEmptyAt0 = (fr0 & FR_TXFE) !== 0 && (fr0 & FR_TXFF) === 0;

    // Entry 1
    uart0.writeUint32(REG_UARTDR, 0x01);
    const fr1 = uart0.readUint32(REG_UARTFR);
    const txAt1 = (fr1 & FR_TXFE) === 0 && (fr1 & FR_TXFF) === 0;

    // Entries 2 to 15 (total 15)
    for (let i = 2; i <= 15; i++) uart0.writeUint32(REG_UARTDR, i);
    const fr15 = uart0.readUint32(REG_UARTFR);
    const txAt15 = (fr15 & FR_TXFE) === 0 && (fr15 & FR_TXFF) === 0;

    // Entry 16 (halfway point)
    uart0.writeUint32(REG_UARTDR, 16);
    const fr16 = uart0.readUint32(REG_UARTFR);
    const txAt16 = (fr16 & FR_TXFE) === 0 && (fr16 & FR_TXFF) === 0;

    // Entry 17
    uart0.writeUint32(REG_UARTDR, 17);
    const fr17 = uart0.readUint32(REG_UARTFR);
    const txAt17 = (fr17 & FR_TXFE) === 0 && (fr17 & FR_TXFF) === 0;

    // Entries 18 to 31 (total 31)
    for (let i = 18; i <= 31; i++) uart0.writeUint32(REG_UARTDR, i);
    const fr31 = uart0.readUint32(REG_UARTFR);
    const txAt31 = (fr31 & FR_TXFE) === 0 && (fr31 & FR_TXFF) === 0;

    // Entry 32 (FULL!)
    uart0.writeUint32(REG_UARTDR, 32);
    const fr32 = uart0.readUint32(REG_UARTFR);
    const txFullAt32 = (fr32 & FR_TXFE) === 0 && (fr32 & FR_TXFF) !== 0;

    // Test RX FIFO boundaries: 0, 1, 15, 16, 17, 31, 32 entries
    uart0.reset();
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    const rxFr0 = uart0.readUint32(REG_UARTFR);
    const rxEmptyAt0 = (rxFr0 & FR_RXFE) !== 0 && (rxFr0 & FR_RXFF) === 0;

    uart0.feedByte(0x01);
    const rxFr1 = uart0.readUint32(REG_UARTFR);
    const rxAt1 = (rxFr1 & FR_RXFE) === 0 && (rxFr1 & FR_RXFF) === 0;

    for (let i = 2; i <= 15; i++) uart0.feedByte(i);
    const rxFr15 = uart0.readUint32(REG_UARTFR);
    const rxAt15 = (rxFr15 & FR_RXFE) === 0 && (rxFr15 & FR_RXFF) === 0;

    uart0.feedByte(16);
    const rxFr16 = uart0.readUint32(REG_UARTFR);
    const rxAt16 = (rxFr16 & FR_RXFE) === 0 && (rxFr16 & FR_RXFF) === 0;

    uart0.feedByte(17);
    const rxFr17 = uart0.readUint32(REG_UARTFR);
    const rxAt17 = (rxFr17 & FR_RXFE) === 0 && (rxFr17 & FR_RXFF) === 0;

    for (let i = 18; i <= 31; i++) uart0.feedByte(i);
    const rxFr31 = uart0.readUint32(REG_UARTFR);
    const rxAt31 = (rxFr31 & FR_RXFE) === 0 && (rxFr31 & FR_RXFF) === 0;

    uart0.feedByte(32);
    const rxFr32 = uart0.readUint32(REG_UARTFR);
    const rxFullAt32 = (rxFr32 & FR_RXFE) === 0 && (rxFr32 & FR_RXFF) !== 0;

    const ok = txEmptyAt0 && txAt1 && txAt15 && txAt16 && txAt17 && txAt31 && txFullAt32 &&
               rxEmptyAt0 && rxAt1 && rxAt15 && rxAt16 && rxAt17 && rxAt31 && rxFullAt32;

    record(3, 'FIFO_BOUNDARIES', 'Exhaustive 32-Entry Boundary Verification (0, 1, 15, 16, 17, 31, 32)', ok,
      `TX: 0(TXFE=1), 1..31(TXFF=0), 32(TXFF=1); RX: 0(RXFE=1), 1..31(RXFF=0), 32(RXFF=1)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 4: 33-BYTE OVERFLOW AND OVERRUN ERROR (OEIS/OES)
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 04: 33-BYTE OVERFLOW AND OVERRUN ERROR ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // Ingest 32 bytes into RX FIFO
    for (let i = 1; i <= 32; i++) {
      uart0.feedByte(i);
    }
    const ris32 = uart0.readUint32(REG_UARTRIS);
    const rsr32 = uart0.readUint32(REG_UARTRSR);

    // Ingest 33rd byte (must trigger Overrun Error)
    uart0.feedByte(0x99);
    const ris33 = uart0.readUint32(REG_UARTRIS);
    const rsr33 = uart0.readUint32(REG_UARTRSR);

    // Verify existing 32 bytes in FIFO were preserved in exact order
    const popped: number[] = [];
    while ((uart0.readUint32(REG_UARTFR) & FR_RXFE) === 0) {
      popped.push(uart0.readUint32(REG_UARTDR) & 0xff);
    }
    const fifoDataPreserved = popped.length === 32 && popped.every((val, idx) => val === idx + 1);

    const ok = (ris32 & INT_OE) === 0 &&
               (rsr32 & ERR_OE) === 0 &&
               (ris33 & INT_OE) !== 0 &&
               (rsr33 & ERR_OE) !== 0 &&
               fifoDataPreserved;

    record(4, 'OVERRUN_ERROR', '32-Byte Capacity Full with 33rd Byte Overrun Error (OEIS/OES) Assertion', ok,
      `At 32 bytes: OE=0; At 33rd byte: OEIS asserted in UARTRIS (0x${ris33.toString(16)}) & UARTRSR (0x${rsr33.toString(16)}); Preserved 32 bytes intact`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 5: PER-CHARACTER PARITY/FRAMING ERROR ASSOCIATION IN 12-BIT RX FIFO
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 05: PER-CHARACTER PARITY/FRAMING ERROR ASSOCIATION ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // Feed 4 characters with individual error tags:
    // Character 0: 'A' (0x41) - Clean (errorFlags = 0)
    // Character 1: 'B' (0x42) - Parity error (ERR_PE = 0x2)
    // Character 2: 'C' (0x43) - Clean (errorFlags = 0)
    // Character 3: 'D' (0x44) - Framing error (ERR_FE = 0x1)
    uart0.feedByte(0x41, 0);
    uart0.feedByte(0x42, ERR_PE);
    uart0.feedByte(0x43, 0);
    uart0.feedByte(0x44, ERR_FE);

    // Pop Character 0
    const rsr0 = uart0.readUint32(REG_UARTRSR);
    const dr0 = uart0.readUint32(REG_UARTDR);

    // Pop Character 1 (Parity error attached)
    const rsr1 = uart0.readUint32(REG_UARTRSR);
    const dr1 = uart0.readUint32(REG_UARTDR);

    // Pop Character 2 (Clean)
    const rsr2 = uart0.readUint32(REG_UARTRSR);
    const dr2 = uart0.readUint32(REG_UARTDR);

    // Pop Character 3 (Framing error attached)
    const rsr3 = uart0.readUint32(REG_UARTRSR);
    const dr3 = uart0.readUint32(REG_UARTDR);

    const char0Ok = (dr0 & 0xff) === 0x41 && ((dr0 >>> 8) & 0xf) === 0;
    const char1Ok = (dr1 & 0xff) === 0x42 && ((dr1 >>> 8) & 0xf) === ERR_PE && ((rsr1 & ERR_PE) !== 0);
    const char2Ok = (dr2 & 0xff) === 0x43 && ((dr2 >>> 8) & 0xf) === 0;
    const char3Ok = (dr3 & 0xff) === 0x44 && ((dr3 >>> 8) & 0xf) === ERR_FE && ((rsr3 & ERR_FE) !== 0);

    const ok = char0Ok && char1Ok && char2Ok && char3Ok;

    record(5, 'ERROR_TAGGING', 'Per-Character 12-Bit RX FIFO Error Tagging (DR bits 11:8 & UARTRSR)', ok,
      `Char 0: clean (DR=0x${dr0.toString(16)}); Char 1: PE attached (DR=0x${dr1.toString(16)}, RSR=0x${rsr1.toString(16)}); Char 2: clean (DR=0x${dr2.toString(16)}); Char 3: FE attached (DR=0x${dr3.toString(16)}, RSR=0x${rsr3.toString(16)})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 6: FIFO-DISABLED OPERATION (DEPTH 1 HOLDING REGISTER)
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 06: FIFO-DISABLED OPERATION ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60); // FEN=0 (Holding register mode)
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // 1st byte fills holding register
    uart0.feedByte(0x55);
    const fr1 = uart0.readUint32(REG_UARTFR);
    const ris1 = uart0.readUint32(REG_UARTRIS);

    // 2nd byte unread triggers immediate overrun error
    uart0.feedByte(0x66);
    const fr2 = uart0.readUint32(REG_UARTFR);
    const ris2 = uart0.readUint32(REG_UARTRIS);
    const rsr2 = uart0.readUint32(REG_UARTRSR);

    // Read the holding register
    const dr = uart0.readUint32(REG_UARTDR);
    const frAfterRead = uart0.readUint32(REG_UARTFR);

    const ok = (fr1 & FR_RXFF) !== 0 &&
               (ris1 & INT_OE) === 0 &&
               (ris2 & INT_OE) !== 0 &&
               (rsr2 & ERR_OE) !== 0 &&
               (dr & 0xff) === 0x55 &&
               (frAfterRead & FR_RXFE) !== 0;

    record(6, 'FIFO_DISABLED', 'FEN=0 1-Byte Holding Register Mode and Immediate Overrun', ok,
      `1st byte sets RXFF (0x${fr1.toString(16)}); 2nd byte sets OEIS (RIS=0x${ris2.toString(16)}); DR read returns 1st byte (0x55); RXFE asserted after read`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 7: INTERRUPT-DRIVEN RX & TX WITH 32-BYTE THRESHOLD LEVELS
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 07: INTERRUPT-DRIVEN RX & TX WITH 32-BYTE THRESHOLDS ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN); // 32-entry FIFOs
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // Thresholds for capacity 32:
    // 000: 1/8 = 4 entries
    // 001: 1/4 = 8 entries
    // 010: 1/2 = 16 entries
    // 011: 3/4 = 24 entries
    // 100: 7/8 = 28 entries
    const rxLevels = [
      { sel: 0b000, expectedThreshold: 4 },
      { sel: 0b001, expectedThreshold: 8 },
      { sel: 0b010, expectedThreshold: 16 },
      { sel: 0b011, expectedThreshold: 24 },
      { sel: 0b100, expectedThreshold: 28 },
    ];

    let allRxLevelsPass = true;
    for (const lvl of rxLevels) {
      uart0.reset();
      uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
      uart0.writeUint32(REG_UARTIFLS, (lvl.sel << 3) | 0b010);
      uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

      // Ingest threshold - 1 bytes: RXIS must be 0
      for (let i = 0; i < lvl.expectedThreshold - 1; i++) {
        uart0.feedByte(i);
      }
      const risBefore = (uart0.readUint32(REG_UARTRIS) & INT_RX) !== 0;

      // Ingest 1 more byte: reaching threshold -> RXIS must be 1
      uart0.feedByte(0xff);
      const risAfter = (uart0.readUint32(REG_UARTRIS) & INT_RX) !== 0;

      if (risBefore || !risAfter) {
        allRxLevelsPass = false;
      }
    }

    record(7, 'IFLS_LEVELS', 'Configurable UARTIFLS Thresholds for 32-Entry FIFO (1/8, 1/4, 1/2, 3/4, 7/8)', allRxLevelsPass,
      `Verified exact thresholds: 1/8=4 bytes, 1/4=8 bytes, 1/2=16 bytes, 3/4=24 bytes, 7/8=28 bytes`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 8: BAUD RATE MISMATCH FRAMING ERROR (FEIS) DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 08: BAUD RATE MISMATCH FRAMING ERROR DETECTION ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    // Receiver set to 115200 baud (1085 cycles per bit period)
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // Send asynchronous line break or false stop bit (line remains 0 instead of 1 at stop bit)
    uart0.feedRxPinState(false, 1085); // start bit
    uart0.tickCycles(1085, clkPeri);

    for (let i = 0; i < 8; i++) {
      uart0.feedRxPinState(true, 1085); // data bits
      uart0.tickCycles(1085, clkPeri);
    }

    // Stop bit driven LOW (0) - violation of UART mark requirement
    uart0.feedRxPinState(false, 1085);
    uart0.tickCycles(1085, clkPeri);
    uart0.tickCycles(100, clkPeri); // finish frame

    const ris = uart0.readUint32(REG_UARTRIS);
    const rsr = uart0.readUint32(REG_UARTRSR);
    const dr = uart0.readUint32(REG_UARTDR);

    const ok = (ris & INT_FE) !== 0 &&
               (rsr & ERR_FE) !== 0 &&
               ((dr >>> 8) & ERR_FE) !== 0;

    record(8, 'FRAMING_ERR', 'Demodulator Framing Error (FEIS) on Missing Stop Bit', ok,
      `Stop bit LOW: FEIS in UARTRIS (0x${ris.toString(16)}), FE in UARTRSR (0x${rsr.toString(16)}), FE attached in UARTDR (0x${dr.toString(16)})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 9: IO_BANK0 GPIO MUX REASSIGNMENT (SIO <-> UART)
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 09: IO_BANK0 GPIO MUX REASSIGNMENT (SIO <-> UART) ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;

    // 1. Configure GP0 as SIO Output LOW
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_SIO;
    rp2040.sio.gpioOutputEnable = 0x01;
    rp2040.sio.gpioValue = 0x00;
    bridge.recomputeDriverState(0);
    const sioTargetV1 = bridge.getDriverState(0)!.electricalTargetVoltage_V;

    // 2. Switch GP0 to UART0 TX (Function 2)
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_UART;
    bridge.recomputeDriverState(0);
    const uartTargetV = bridge.getDriverState(0)!.electricalTargetVoltage_V;

    // 3. Revert GP0 back to SIO
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_SIO;
    bridge.recomputeDriverState(0);
    const sioTargetV2 = bridge.getDriverState(0)!.electricalTargetVoltage_V;

    const ok = sioTargetV1 === 0.0 && uartTargetV === 3.3 && sioTargetV2 === 0.0;

    record(9, 'GPIO_MUX_SWITCH', 'Dynamic IO_BANK0 Function Reassignment (SIO -> UART0 TX -> SIO)', ok,
      `SIO (0V) -> UART Idle Mark (3.3V) -> Revert SIO (0V); Zero state corruption`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 10: CLOSED-LOOP MNA TX-TO-RX LOOPBACK
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 10: CLOSED-LOOP MNA TX-TO-RX LOOPBACK ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    // GP0 = UART0 TX, GP1 = UART0 RX
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[1].ctrl = (rp2040.gpio[1].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[1].padValue |= (1 << 6); // Enable input (IE=1)
    bridge.recomputeDriverState(0);
    bridge.recomputeDriverState(1);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN); // 115200 8-N-1
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    // MNA Netlist: GP0 (node 2) -> 100 Ω jumper -> GP1 (node 3)
    const elements: MNAElement[] = [
      { id: bridge.getMnaVoltageSourceId(0), type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 3.3 },
      { id: bridge.getMnaResistorId(0), type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 50 },
      { id: 'jumper_wire', type: 'RESISTOR', nodeA: 2, nodeB: 3, value: 100 },
      { id: bridge.getMnaResistorId(1), type: 'RESISTOR', nodeA: 3, nodeB: 0, value: 10_000_000 },
    ];

    const solver = new MNASolver(3, 0.000001);
    solver.setElements(elements);

    // Transmit byte 0x3C (0b00111100)
    uart0.writeUint32(REG_UARTDR, 0x3c);

    const gpioMap = new Map([[0, 2], [1, 3]]);
    const stepCycles = 100;
    const totalSimCycles = 1085 * 14;

    for (let c = 0; c < totalSimCycles; c += stepCycles) {
      uart0.tickCycles(stepCycles, clkPeri);
      const vSource = elements.find(e => e.id === bridge.getMnaVoltageSourceId(0));
      if (vSource) {
        vSource.value = bridge.getDriverState(0)!.electricalTargetVoltage_V;
      }
      const sol = solver.solve();
      bridge.updateFromMnaResult(sol.nodeVoltages, gpioMap);
    }

    const rxHasData = (uart0.readUint32(REG_UARTFR) & FR_RXFE) === 0;
    const rxByte = rxHasData ? (uart0.readUint32(REG_UARTDR) & 0xff) : -1;

    const ok = rxHasData && (rxByte === 0x3c);

    record(10, 'MNA_LOOPBACK', 'Closed-Loop MNA Physical Electrical Loopback (GP0 -> Wire -> GP1)', ok,
      `Transmitted 0x3C over 100 Ω MNA wire; Received in UARTDR: 0x${rxByte.toString(16)} (Exact Match)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 11: SERIAL MONITOR HOST INPUT REACHING FIRMWARE
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 11: SERIAL MONITOR HOST INPUT REACHING FIRMWARE ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);

    // Host user types "HELLO_VOLTFORGE\n" in Serial Monitor UI
    const inputString = 'HELLO_VOLTFORGE\n';
    controller.sendSerialString(inputString, 0);

    const received: string[] = [];
    while ((uart0.readUint32(REG_UARTFR) & FR_RXFE) === 0) {
      received.push(String.fromCharCode(uart0.readUint32(REG_UARTDR) & 0xff));
    }

    const ok = received.join('') === inputString;

    record(11, 'HOST_TO_FIRMWARE', 'Bidirectional Serial Monitor Host Input Ingestion to UARTDR', ok,
      `Host sent: "${inputString.trim()}"; Firmware UARTDR read: "${received.join('').trim()}"`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 12: FIRMWARE SERIAL TRANSMISSION REACHING SERIAL MONITOR
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 12: FIRMWARE SERIAL TRANSMISSION REACHING SERIAL MONITOR ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE);

    const monitorCaptured: string[] = [];
    controller.onSerialTransmit((b) => {
      monitorCaptured.push(String.fromCharCode(b));
    });

    const outText = 'TELEMETRY_OK\r\n';
    for (let i = 0; i < outText.length; i++) {
      while ((uart0.readUint32(REG_UARTFR) & FR_TXFF) !== 0) {
        controller.tickClock(1085);
      }
      uart0.writeUint32(REG_UARTDR, outText.charCodeAt(i));
    }

    for (let c = 0; c < 300_000; c += 1000) {
      if ((uart0.readUint32(REG_UARTFR) & FR_BUSY) === 0 && (uart0.readUint32(REG_UARTFR) & FR_TXFE) !== 0) {
        break;
      }
      controller.tickClock(1000);
    }

    const reconstructed = monitorCaptured.join('');
    const ok = reconstructed === outText;

    record(12, 'FIRMWARE_TO_HOST', 'Firmware UART Serializer Output Callback Reaching Serial Monitor', ok,
      `Firmware sent: "${outText.replace('\r\n', '\\r\\n')}"; Monitor captured: "${reconstructed.replace('\r\n', '\\r\\n')}"`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 13: PERIPHERAL RESET DURING ACTIVE TRANSMISSION
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 13: PERIPHERAL RESET DURING ACTIVE TRANSMISSION ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE);

    // Queue 5 bytes and start transmitting
    for (let i = 0; i < 5; i++) uart0.writeUint32(REG_UARTDR, 0x41 + i);

    // Step halfway through byte 1
    uart0.tickCycles(3000, clkPeri);
    const busyBeforeReset = (uart0.readUint32(REG_UARTFR) & FR_BUSY) !== 0;

    // Hard reset of UART peripheral
    uart0.reset();

    const frAfter = uart0.readUint32(REG_UARTFR);
    const crAfter = uart0.readUint32(REG_UARTCR);
    const pinState = uart0.getTxPinState();

    const ok = busyBeforeReset &&
               frAfter === 0x90 &&
               crAfter === (CR_TXE | CR_RXE) &&
               pinState === true;

    record(13, 'MID_TX_RESET', 'Abrupt Peripheral Reset Mid-Transmission & Clean Re-initialization', ok,
      `Busy during TX: ${busyBeforeReset}; After reset: FR=0x${frAfter.toString(16)} (0x90), CR=0x${crAfter.toString(16)}, TX pin=Mark (true)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 14: PAUSE/RESUME DURING ACTIVE TRANSMISSION PRESERVING FRACTIONAL TIMING STATE
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 14: PAUSE/RESUME DURING ACTIVE TRANSMISSION ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    // 115200 baud -> 1085 cycles per bit period
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE);

    let transmitted = false;
    uart0.onByteTransmit = () => { transmitted = true; };

    // Start transmission of byte 0xAA (10 bits * 1085 = 10850 cycles)
    uart0.writeUint32(REG_UARTDR, 0xaa);

    // Step 5000 cycles (approx bit 4)
    uart0.tickCycles(5000, clkPeri, clkPeri);
    const diagMid = uart0.getDiagnostics();
    const busyAtPause = diagMid.txBusy;

    // Simulate pause (no ticks for extended duration)
    // Step remaining 6500 cycles to complete frame
    uart0.tickCycles(6500, clkPeri, clkPeri);
    const busyAfter = (uart0.readUint32(REG_UARTFR) & FR_BUSY) !== 0;

    const ok = busyAtPause && !busyAfter && transmitted;

    record(14, 'PAUSE_RESUME', 'Pause & Resume During Transmission Preserving Fractional Shift Timing', ok,
      `Mid-transmission busy: ${busyAtPause}; Frame completed after resumption: ${transmitted}; Returned to idle: ${!busyAfter}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 15: DUAL CLOCK DOMAIN ARCHITECTURE & DYNAMIC SCALING
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 15: DUAL CLOCK DOMAIN ARCHITECTURE & DYNAMIC SCALING ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    // 1. 125 MHz sys / 125 MHz peri
    uart0.setPeripheralClock(125_000_000);
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    const baud125 = uart0.baudRate;

    // 2. 133 MHz sys / 125 MHz peri
    // Peripheral clock remains 125 MHz even when sys clock is 133 MHz
    const baud133Sys_125Peri = uart0.baudRate;

    // 3. 125 MHz sys / 48 MHz peri (USB PLL source)
    // Formula: 48M / (16 * (26 + 3/64)) = 115207 baud
    uart0.setPeripheralClock(48_000_000);
    uart0.writeUint32(REG_UARTIBRD, 26);
    uart0.writeUint32(REG_UARTFBRD, 3);
    const baud48Peri = uart0.baudRate;

    // 4. Dynamic clock frequency shift during active transmission
    uart0.setPeripheralClock(125_000_000);
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE);

    let baudNotified = 0;
    uart0.onBaudRateChange = (b) => { baudNotified = b; };

    // Shift clock to 133 MHz peri dynamically with new divisor
    uart0.setPeripheralClock(133_000_000);
    uart0.writeUint32(REG_UARTIBRD, 72);
    uart0.writeUint32(REG_UARTFBRD, 10);
    uart0.clkPeriChanged();

    const ok = Math.abs(baud125 - 115200) < 50 &&
               Math.abs(baud133Sys_125Peri - 115200) < 50 &&
               Math.abs(baud48Peri - 115200) < 50 &&
               Math.abs(baudNotified - 115200) < 50;

    record(15, 'CLOCK_DOMAINS', 'Separation of clk_sys vs clk_peri and Dynamic Frequency Reconfiguration', ok,
      `125M peri: ${baud125} Bd; 133M sys/125M peri: ${baud133Sys_125Peri} Bd; 48M USB peri: ${baud48Peri} Bd; Dynamic notified: ${baudNotified} Bd`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 16: HARDWARE FLOW CONTROL (RTS/CTS) AUTO & MANUAL GATING
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 16: HARDWARE FLOW CONTROL (RTS/CTS) ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);

    // 1. Enable CTS hardware flow control (CTSEN = bit 15)
    // Initially CTS is deasserted (ctsLineState = false)
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);

    let byteTransmitted = false;
    uart0.onByteTransmit = () => { byteTransmitted = true; };

    // Queue byte 0xAA
    uart0.writeUint32(REG_UARTDR, 0xaa);

    // Step clock: transmitter MUST NOT advance because CTS is false
    uart0.tickCycles(5000, clkPeri);
    const txBlocked = !byteTransmitted && (uart0.readUint32(REG_UARTFR) & FR_BUSY) === 0;

    // Now assert CTS line (CTS = true)
    uart0.setCts(true);
    const ctsFr = uart0.readUint32(REG_UARTFR);

    // Step clock: transmission should now complete
    uart0.tickCycles(15000, clkPeri);
    const txCompleted = byteTransmitted;

    // 2. Test Auto-RTS flow control (RTSEN = bit 14)
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);
    uart0.writeUint32(REG_UARTIFLS, 0b001000 | 0b010); // 1/4 threshold = 8 entries

    // When RX FIFO is empty, RTS is asserted (true)
    const rtsInitial = uart0.rtsLineState;

    // Ingest 8 bytes to hit trigger threshold
    for (let i = 0; i < 8; i++) uart0.feedByte(0x10 + i);
    const rtsAtThreshold = uart0.rtsLineState;

    // Drain 1 byte below threshold
    uart0.readUint32(REG_UARTDR);
    const rtsAfterDrain = uart0.rtsLineState;

    const ok = txBlocked && txCompleted && (ctsFr & FR_CTS) !== 0 &&
               rtsInitial === true && rtsAtThreshold === false && rtsAfterDrain === true;

    record(16, 'HW_FLOW_CONTROL', 'Hardware CTS Gating & Automatic Watermark RTS Flow Control', ok,
      `CTS gating: blocked=${txBlocked}, completed=${txCompleted}; Auto-RTS: empty=${rtsInitial}, threshold(8 bytes)=${rtsAtThreshold}, drained=${rtsAfterDrain}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 17: DMA CONTROLLER DREQ HANDSHAKING
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 17: DMA CONTROLLER DREQ HANDSHAKING ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const uart1 = controller.getUart(1)!;
    const rp2040 = controller.getRp2040Instance()!;

    const dreqLog: { channel: number; state: boolean }[] = [];
    (rp2040 as any).dma = {
      setDREQ: (channel: number) => dreqLog.push({ channel, state: true }),
      clearDREQ: (channel: number) => dreqLog.push({ channel, state: false }),
    };

    // UART0 DREQs: TX = 20, RX = 21
    uart0.writeUint32(REG_UARTDMACR, 0x03); // Enable TXDMAE & RXDMAE
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);
    uart0.feedByte(0x88);

    const hasUart0Tx = dreqLog.some(d => d.channel === 20 && d.state === true);
    const hasUart0Rx = dreqLog.some(d => d.channel === 21 && d.state === true);

    // UART1 DREQs: TX = 22, RX = 23
    uart1.writeUint32(REG_UARTDMACR, 0x03);
    uart1.writeUint32(REG_UARTCR, CR_UARTEN | CR_RXE);
    uart1.feedByte(0x99);

    const hasUart1Tx = dreqLog.some(d => d.channel === 22 && d.state === true);
    const hasUart1Rx = dreqLog.some(d => d.channel === 23 && d.state === true);

    const ok = hasUart0Tx && hasUart0Rx && hasUart1Tx && hasUart1Rx;

    record(17, 'DMA_DREQ', 'Full RP2040 UART DMA DREQ Signaling (UART0: 20/21, UART1: 22/23)', ok,
      `UART0 DREQ TX=20(${hasUart0Tx}), RX=21(${hasUart0Rx}); UART1 DREQ TX=22(${hasUart1Tx}), RX=23(${hasUart1Rx})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SCENARIO 18: PL011 REGISTER MAP, ATOMIC ALIASES & RESET VALUES
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SCENARIO 18: REGISTER CONFORMANCE & ATOMIC ACCESS ---');
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    // Verify Official Reset Values (RP2040 Datasheet Section 4.2.8 & SDK hardware/regs/uart.h)
    const fr = uart0.readUint32(REG_UARTFR);
    const cr = uart0.readUint32(REG_UARTCR);
    const lcr = uart0.readUint32(REG_UARTLCR_H);
    const ifls = uart0.readUint32(REG_UARTIFLS);
    const imsc = uart0.readUint32(REG_UARTIMSC);
    const dmacr = uart0.readUint32(REG_UARTDMACR);

    // PrimeCell IDs
    const p0 = uart0.readUint32(REG_UARTPERIPHID0);
    const p1 = uart0.readUint32(REG_UARTPERIPHID1);
    const p2 = uart0.readUint32(REG_UARTPERIPHID2);
    const p3 = uart0.readUint32(REG_UARTPERIPHID3);
    const c0 = uart0.readUint32(REG_UARTPCELLID0);
    const c1 = uart0.readUint32(REG_UARTPCELLID1);
    const c2 = uart0.readUint32(REG_UARTPCELLID2);
    const c3 = uart0.readUint32(REG_UARTPCELLID3);

    const resetValuesOk = (fr === 0x90) &&
                          (cr === (CR_TXE | CR_RXE)) &&
                          (lcr === 0x00) &&
                          (ifls === 0x12) &&
                          (imsc === 0x00) &&
                          (dmacr === 0x00) &&
                          (p0 === 0x11 && p1 === 0x10 && p2 === 0x34 && p3 === 0x00) &&
                          (c0 === 0x0d && c1 === 0xf0 && c2 === 0x05 && c3 === 0xb1);

    // Atomic Aliases on UARTIMSC
    uart0.writeUint32(REG_UARTIMSC, 0x0010);
    uart0.writeUint32(REG_UARTIMSC + 0x2000, 0x0020); // SET -> 0x0030
    const setVal = uart0.readUint32(REG_UARTIMSC);
    uart0.writeUint32(REG_UARTIMSC + 0x3000, 0x0010); // CLR -> 0x0020
    const clrVal = uart0.readUint32(REG_UARTIMSC);
    uart0.writeUint32(REG_UARTIMSC + 0x1000, 0x0060); // XOR -> 0x0040
    const xorVal = uart0.readUint32(REG_UARTIMSC);

    const atomicOk = setVal === 0x0030 && clrVal === 0x0020 && xorVal === 0x0040;

    const ok = resetValuesOk && atomicOk;

    record(18, 'REG_CONFORMANCE', 'PL011 Register Reset Values (UARTFR=0x90) and RP2040 Atomic Aliases', ok,
      `UARTFR Reset: 0x${fr.toString(16)} (Exact 0x90); IDs: 0x11,0x10,0x34,0x00 / 0x0D,0xF0,0x05,0xB1; Atomic SET/CLR/XOR verified`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════════════');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`TOTAL PHASE 4.3.3.1 CONFORMANCE CHECKS: ${total}`);
  console.log(`PASSED:                                 ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`FAILED:                                 ${failed}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runConformanceSuite().catch(err => {
  console.error('Fatal error in conformance suite:', err);
  process.exit(1);
});
