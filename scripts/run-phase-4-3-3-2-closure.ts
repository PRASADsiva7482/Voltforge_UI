/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.3.2 RP2040 UART Final Conformance Closure & Evidence Audit Suite
 * 
 * Verifies all closure mandates:
 * - Mandatory Audit A: RTS/CTS Hardware Flow Control
 *     * Independent CTS on UART0 / UART1
 *     * Block transmission when CTS de-asserted
 *     * De-assert CTS mid-character: active character completes, next is blocked
 *     * Re-assert CTS: transmission resumes
 *     * CTS disabled (CR_CTSEN=0): unblocked
 *     * CTS driven through physical GPIO / MNA node
 *     * Auto-RTS below, at, and above all 5 IFLS thresholds (1/8, 1/4, 1/2, 3/4, 7/8)
 *     * RTS polarity: 0.0 V asserted, 3.3 V de-asserted
 *     * RTS FIFO disabled mode (FEN=0, threshold 1)
 *     * Draining RX FIFO updates RTS
 *     * Independent UART0 (GP3) and UART1 (GP7) RTS routing
 * - Mandatory Audit B: DMA vs DREQ
 *     * DREQ channel mapping (UART0 TX:20, RX:21; UART1 TX:22, RX:23)
 *     * UARTDMACR gating & FIFO occupancy handshaking
 *     * Memory-to-UARTDR DMA channel transfer execution
 * - Mandatory Audit C: Complete 16-Register PL011 Map
 *     * Register offsets, reset values (UARTFR=0x90, UARTCR=0x0300, UARTIFLS=0x12)
 *     * UARTILPR (0x020) storage compliance & IrDA SIR unsupported status
 *     * RP2040 atomic aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)
 * - Mandatory Audit D: Dual Clock Domain Matrix
 *     * Config 1: 125M sys / 125M peri
 *     * Config 2: 133M sys / 125M peri
 *     * Config 3: 125M sys / 48M peri
 * - Mandatory Audit F: End-to-End Data Paths
 *     * Firmware TX to Serial Monitor
 *     * Host Injection to Firmware RX
 *     * Closed-loop MNA physical loopback
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
  mandate: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, mandate: string, name: string, passed: boolean, details: string) {
  results.push({ id, mandate, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Test ${String(id).padStart(2, '0')}] [${mandate}] ${status}: ${name}`);
  console.log(`       ${details}`);
}

async function runPhase4332ClosureTests() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.3.2 — RP2040 UART CONFORMANCE CLOSURE SUITE      ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const blinkUf2Path = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const blinkBytes = fs.readFileSync(blinkUf2Path);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MANDATORY AUDIT A: RTS / CTS HARDWARE FLOW CONTROL
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('--- MANDATORY AUDIT A: RTS/CTS HARDWARE FLOW CONTROL ---');

  // Test 01: CTS Transmission Gating — Blocked When CTS Unasserted
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN); // 8-N-1
    // Enable UART, TX, and Auto-CTS
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);

    // Initial state: CTS unasserted (ctsLineState = false)
    uart0.setCts(false);
    uart0.writeUint32(REG_UARTDR, 0x55);

    // Step cycles while CTS is false
    for (let i = 0; i < 5000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }

    const blocked = !uart0.getDiagnostics().txBusy && uart0.getDiagnostics().txFifoCount === 1;
    const pinHigh = uart0.getTxPinState() === true; // Remains Mark (high)

    const ok = blocked && pinHigh;
    record(1, 'MANDATE_A_CTS', 'Transmission Blocked When CTS De-asserted (UART0 Auto-CTS)', ok,
      `CTS=false, CTSEN=1 -> txBusy=${uart0.getDiagnostics().txBusy}, FIFO=${uart0.getDiagnostics().txFifoCount}, Pin=${pinHigh}`);
  }

  // Test 02: De-assert CTS During Active Character Transmission
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN); // 8-N-1
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);

    // Assert CTS so transmission starts
    uart0.setCts(true);

    const txBytes: number[] = [];
    uart0.onByteTransmit = (b) => txBytes.push(b);

    // Queue TWO characters: 0x41 ('A') and 0x42 ('B')
    uart0.writeUint32(REG_UARTDR, 0x41);
    uart0.writeUint32(REG_UARTDR, 0x42);

    // Character 0x41 is now actively transmitting in shift register (bit index 0)
    const initialBusy = uart0.getDiagnostics().txBusy;

    // Advance 3 bit periods (Start bit + bits 0 and 1 = ~3255 cycles)
    uart0.tickCycles(3255, clkPeri);

    // DE-ASSERT CTS MID-CHARACTER
    uart0.setCts(false);

    // Finish remaining cycles of 1st frame (~8500 cycles)
    for (let i = 0; i < 9000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }

    // 1st character ('A') MUST have finished transmitting to completion
    const char1Completed = txBytes.length === 1 && txBytes[0] === 0x41;

    // 2nd character ('B') MUST remain paused in FIFO and NOT transmitted
    const char2Paused = uart0.getDiagnostics().txFifoCount === 1 && !uart0.getDiagnostics().txBusy;

    // Advance another 20,000 cycles with CTS deasserted: verify 'B' is NEVER sent
    for (let i = 0; i < 20000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }
    const char2StillBlocked = txBytes.length === 1;

    const ok = initialBusy && char1Completed && char2Paused && char2StillBlocked;
    record(2, 'MANDATE_A_CTS', 'Mid-Character CTS Deassertion: Active Character Completes, Next Pauses', ok,
      `Active 'A' completed=${char1Completed}, Next 'B' paused in FIFO=${char2Paused}, txBytes=${txBytes.length}`);
  }

  // Test 03: Re-assert CTS: Paused Transmission Resumes
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);

    uart0.setCts(false);
    const txBytes: number[] = [];
    uart0.onByteTransmit = (b) => txBytes.push(b);

    uart0.writeUint32(REG_UARTDR, 0x5a); // 'Z'
    // Step while CTS false
    uart0.tickCycles(2000, clkPeri);
    const wasPaused = txBytes.length === 0;

    // RE-ASSERT CTS
    uart0.setCts(true);
    // Step cycles to transmit 'Z' (10 bits * 1085 = 10850 cycles)
    for (let i = 0; i < 12000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }

    const resumedAndCompleted = txBytes.length === 1 && txBytes[0] === 0x5a;
    const ok = wasPaused && resumedAndCompleted;
    record(3, 'MANDATE_A_CTS', 'Re-asserting CTS Resumes Paused Transmission', ok,
      `Paused while CTS=0: ${wasPaused}, Completed after CTS=1: ${resumedAndCompleted} (byte=0x${(txBytes[0] || 0).toString(16)})`);
  }

  // Test 04: CTS Flow Control Disabled (CR_CTSEN = 0) Unblocks Transmission
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);

    // Auto-CTS enabled, CTS line unasserted
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);
    uart0.setCts(false);

    const txBytes: number[] = [];
    uart0.onByteTransmit = (b) => txBytes.push(b);

    uart0.writeUint32(REG_UARTDR, 0x33);
    uart0.tickCycles(2000, clkPeri);
    const blockedBefore = txBytes.length === 0;

    // Disable auto-CTS via CR write
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE); // CTSEN cleared
    for (let i = 0; i < 12000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }

    const sentWithoutCts = txBytes.length === 1 && txBytes[0] === 0x33;
    const ok = blockedBefore && sentWithoutCts;
    record(4, 'MANDATE_A_CTS', 'Clearing CR_CTSEN Immediately Unblocks Pending Transmission', ok,
      `Blocked before: ${blockedBefore}, Transmitted when CTSEN=0: ${sentWithoutCts}`);
  }

  // Test 05: Independent UART1 Auto-CTS & GP6 CTS Routing
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const uart1 = controller.getUart(1)!;
    const clkPeri = 125_000_000;
    uart1.setPeripheralClock(clkPeri);

    // GP4 = UART1 TX, GP6 = UART1 CTS
    rp2040.gpio[4].ctrl = (rp2040.gpio[4].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[6].ctrl = (rp2040.gpio[6].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[6].padValue |= (1 << 6); // IE=1
    bridge.recomputeDriverState(4);
    bridge.recomputeDriverState(6);

    uart1.writeUint32(REG_UARTIBRD, 67);
    uart1.writeUint32(REG_UARTFBRD, 52);
    uart1.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart1.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);

    const txBytes: number[] = [];
    uart1.onByteTransmit = (b) => txBytes.push(b);

    // Feed GP6 high (3.3V) -> nUARTCTS unasserted (CTS = false)
    bridge.updateFromMnaResult([0, 3.3], new Map([[6, 1]]));
    const ctsDeasserted = (uart1.readUint32(REG_UARTFR) & FR_CTS) === 0;

    uart1.writeUint32(REG_UARTDR, 0x88);
    uart1.tickCycles(2000, clkPeri);
    const blockedUart1 = txBytes.length === 0;

    // Feed GP6 low (0.0V) -> nUARTCTS asserted (CTS = true)
    bridge.updateFromMnaResult([0, 0.0], new Map([[6, 1]]));
    const ctsAsserted = (uart1.readUint32(REG_UARTFR) & FR_CTS) !== 0;

    for (let i = 0; i < 12000; i += 100) {
      uart1.tickCycles(100, clkPeri);
    }
    const completedUart1 = txBytes.length === 1 && txBytes[0] === 0x88;

    const ok = ctsDeasserted && blockedUart1 && ctsAsserted && completedUart1;
    record(5, 'MANDATE_A_CTS', 'Independent UART1 Auto-CTS via GP6 Physical GPIO Pin Routing', ok,
      `GP6 3.3V (CTS=0): blocked=${blockedUart1}; GP6 0V (CTS=1): sent=${completedUart1}`);
  }

  // Test 06: CTS Controlled via Physical MNA Node Voltage
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    // GP2 is UART0 CTS
    rp2040.gpio[2].ctrl = (rp2040.gpio[2].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[2].padValue |= (1 << 6); // IE=1
    bridge.recomputeDriverState(2);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_CTSEN);

    // MNA Circuit: Node 1 = 3.3V VCC, Node 2 = GP2 CTS pad
    const elements: MNAElement[] = [
      { id: 'v_ctrl', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 3.3 },
      { id: 'r_pull', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 100 },
      { id: bridge.getMnaResistorId(2), type: 'RESISTOR', nodeA: 2, nodeB: 0, value: 10_000_000 },
    ];
    const solver = new MNASolver(2, 0.000001);
    solver.setElements(elements);

    // Solve at 3.3V -> GP2 = 3.3V -> CTS de-asserted
    const solHigh = solver.solve();
    bridge.updateFromMnaResult(solHigh.nodeVoltages, new Map([[2, 2]]));
    const ctsHigh = (uart0.readUint32(REG_UARTFR) & FR_CTS) === 0;

    // Change MNA source to 0.0V (active-low CTS asserted)
    elements.find(e => e.id === 'v_ctrl')!.value = 0.0;
    const solLow = solver.solve();
    bridge.updateFromMnaResult(solLow.nodeVoltages, new Map([[2, 2]]));
    const ctsLow = (uart0.readUint32(REG_UARTFR) & FR_CTS) !== 0;

    const ok = ctsHigh && ctsLow;
    record(6, 'MANDATE_A_CTS', 'Physical MNA Node Voltage Gating UART0 CTS (GP2)', ok,
      `MNA 3.3V -> FR_CTS=0: ${ctsHigh}; MNA 0.0V -> FR_CTS=1: ${ctsLow}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MANDATORY AUDIT A: RTS WATERMARKS & POLARITY
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- MANDATORY AUDIT A: RTS WATERMARKS & POLARITY ---');

  // Test 07: Watermark 1/8 (threshold = 4 bytes)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b000_000); // RX 1/8 = 4 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    for (let i = 0; i < 3; i++) uart0.feedByte(0x30 + i);
    const rtsBelow = uart0.rtsLineState === true; // 3 < 4: asserted

    uart0.feedByte(0x33);
    const rtsAt = uart0.rtsLineState === false; // 4 < 4: deasserted

    uart0.feedByte(0x34);
    const rtsAbove = uart0.rtsLineState === false; // 5 < 4: deasserted

    const ok = rtsBelow && rtsAt && rtsAbove;
    record(7, 'MANDATE_A_RTS', 'Watermark 1/8 (Threshold = 4 Bytes): Below, At, and Above', ok,
      `3 bytes: asserted=${rtsBelow}; 4 bytes: deasserted=${rtsAt}; 5 bytes: deasserted=${rtsAbove}`);
  }

  // Test 08: Watermark 1/4 (threshold = 8 bytes)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b001_000); // RX 1/4 = 8 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    for (let i = 0; i < 7; i++) uart0.feedByte(0x40 + i);
    const rtsBelow = uart0.rtsLineState === true; // 7 < 8

    uart0.feedByte(0x47);
    const rtsAt = uart0.rtsLineState === false; // 8 < 8

    uart0.feedByte(0x48);
    const rtsAbove = uart0.rtsLineState === false; // 9 < 8

    const ok = rtsBelow && rtsAt && rtsAbove;
    record(8, 'MANDATE_A_RTS', 'Watermark 1/4 (Threshold = 8 Bytes): Below, At, and Above', ok,
      `7 bytes: asserted=${rtsBelow}; 8 bytes: deasserted=${rtsAt}; 9 bytes: deasserted=${rtsAbove}`);
  }

  // Test 09: Watermark 1/2 (threshold = 16 bytes)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b010_000); // RX 1/2 = 16 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    for (let i = 0; i < 15; i++) uart0.feedByte(0x50 + i);
    const rtsBelow = uart0.rtsLineState === true; // 15 < 16

    uart0.feedByte(0x5f);
    const rtsAt = uart0.rtsLineState === false; // 16 < 16

    uart0.feedByte(0x60);
    const rtsAbove = uart0.rtsLineState === false; // 17 < 16

    const ok = rtsBelow && rtsAt && rtsAbove;
    record(9, 'MANDATE_A_RTS', 'Watermark 1/2 (Threshold = 16 Bytes): Below, At, and Above', ok,
      `15 bytes: asserted=${rtsBelow}; 16 bytes: deasserted=${rtsAt}; 17 bytes: deasserted=${rtsAbove}`);
  }

  // Test 10: Watermark 3/4 (threshold = 24 bytes)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b011_000); // RX 3/4 = 24 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    for (let i = 0; i < 23; i++) uart0.feedByte(0x60 + i);
    const rtsBelow = uart0.rtsLineState === true; // 23 < 24

    uart0.feedByte(0x77);
    const rtsAt = uart0.rtsLineState === false; // 24 < 24

    uart0.feedByte(0x78);
    const rtsAbove = uart0.rtsLineState === false; // 25 < 24

    const ok = rtsBelow && rtsAt && rtsAbove;
    record(10, 'MANDATE_A_RTS', 'Watermark 3/4 (Threshold = 24 Bytes): Below, At, and Above', ok,
      `23 bytes: asserted=${rtsBelow}; 24 bytes: deasserted=${rtsAt}; 25 bytes: deasserted=${rtsAbove}`);
  }

  // Test 11: Watermark 7/8 (threshold = 28 bytes)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b100_000); // RX 7/8 = 28 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    for (let i = 0; i < 27; i++) uart0.feedByte(0x70 + i);
    const rtsBelow = uart0.rtsLineState === true; // 27 < 28

    uart0.feedByte(0x8b);
    const rtsAt = uart0.rtsLineState === false; // 28 < 28

    uart0.feedByte(0x8c);
    const rtsAbove = uart0.rtsLineState === false; // 29 < 28

    const ok = rtsBelow && rtsAt && rtsAbove;
    record(11, 'MANDATE_A_RTS', 'Watermark 7/8 (Threshold = 28 Bytes): Below, At, and Above', ok,
      `27 bytes: asserted=${rtsBelow}; 28 bytes: deasserted=${rtsAt}; 29 bytes: deasserted=${rtsAbove}`);
  }

  // Test 12: FIFO Disabled Mode (FEN = 0, Capacity = 1)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    // FEN = 0
    uart0.writeUint32(REG_UARTLCR_H, 0x60);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    const rtsEmpty = uart0.rtsLineState === true; // 0 < 1: asserted

    uart0.feedByte(0xAA);
    const rtsFull = uart0.rtsLineState === false; // 1 < 1: de-asserted

    uart0.readUint32(REG_UARTDR);
    const rtsDrained = uart0.rtsLineState === true; // 0 < 1: re-asserted

    const ok = rtsEmpty && rtsFull && rtsDrained;
    record(12, 'MANDATE_A_RTS', 'Auto-RTS with FIFOs Disabled (FEN=0, 1-Byte Holding Register)', ok,
      `0 bytes: asserted=${rtsEmpty}; 1 byte: deasserted=${rtsFull}; Drained: asserted=${rtsDrained}`);
  }

  // Test 13: Draining RX FIFO Restores RTS to Asserted State
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b001_000); // 1/4 = 8 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    for (let i = 0; i < 10; i++) uart0.feedByte(0x10 + i);
    const deasserted10 = uart0.rtsLineState === false;

    // Drain 2 bytes -> 8 bytes remain: still false (8 < 8 is false)
    uart0.readUint32(REG_UARTDR);
    uart0.readUint32(REG_UARTDR);
    const at8 = uart0.rtsLineState === false;

    // Drain 1 more byte -> 7 bytes remain: becomes true (7 < 8 is true)
    uart0.readUint32(REG_UARTDR);
    const below8 = uart0.rtsLineState === true;

    const ok = deasserted10 && at8 && below8;
    record(13, 'MANDATE_A_RTS', 'Draining RX FIFO Restores RTS Assertion (Hysteresis-Free Transition)', ok,
      `10 bytes: deasserted=${deasserted10}; 8 bytes: deasserted=${at8}; 7 bytes: asserted=${below8}`);
  }

  // Test 14: Independent RTS Pin Routing & Voltages (GP3 UART0, GP7 UART1)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;
    const uart1 = controller.getUart(1)!;

    // Configure GP3 as UART0 RTS, GP7 as UART1 RTS
    rp2040.gpio[3].ctrl = (rp2040.gpio[3].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[7].ctrl = (rp2040.gpio[7].ctrl & ~0x1f) | FUNCTION_UART;
    bridge.recomputeDriverState(3);
    bridge.recomputeDriverState(7);

    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTIFLS, 0b001_000); // 8 bytes
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    uart1.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart1.writeUint32(REG_UARTIFLS, 0b001_000); // 8 bytes
    uart1.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE | CR_RTSEN);

    // Initial state: both FIFOs empty -> both RTS asserted
    // Active low output: asserted = 0.0 V (logical output 0)
    bridge.recomputeDriverState(3);
    bridge.recomputeDriverState(7);
    const vG3_init = bridge.getDriverState(3)!.electricalTargetVoltage_V;
    const vG7_init = bridge.getDriverState(7)!.electricalTargetVoltage_V;

    // Fill UART0 RX FIFO to 10 bytes -> UART0 RTS de-asserts (3.3 V)
    for (let i = 0; i < 10; i++) uart0.feedByte(0x10 + i);
    bridge.recomputeDriverState(3);
    bridge.recomputeDriverState(7);
    const vG3_full = bridge.getDriverState(3)!.electricalTargetVoltage_V;
    const vG7_unaffected = bridge.getDriverState(7)!.electricalTargetVoltage_V;

    // Fill UART1 RX FIFO to 10 bytes -> UART1 RTS de-asserts (3.3 V)
    for (let i = 0; i < 10; i++) uart1.feedByte(0x20 + i);
    bridge.recomputeDriverState(3);
    bridge.recomputeDriverState(7);
    const vG3_stillFull = bridge.getDriverState(3)!.electricalTargetVoltage_V;
    const vG7_full = bridge.getDriverState(7)!.electricalTargetVoltage_V;

    const ok = (vG3_init === 0.0) && (vG7_init === 0.0) &&
               (vG3_full === 3.3) && (vG7_unaffected === 0.0) &&
               (vG3_stillFull === 3.3) && (vG7_full === 3.3);

    record(14, 'MANDATE_A_RTS', 'Independent RTS Pin Voltages: GP3 (UART0) & GP7 (UART1)', ok,
      `Init: GP3=${vG3_init}V, GP7=${vG7_init}V; U0 Full: GP3=${vG3_full}V, GP7=${vG7_unaffected}V; Both Full: GP3=${vG3_stillFull}V, GP7=${vG7_full}V`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MANDATORY AUDIT B: DMA VS DREQ
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- MANDATORY AUDIT B: DMA VS DREQ ---');

  // Test 15: DREQ Channel Identification & Mapping
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const uart1 = controller.getUart(1)!;

    const u0_tx = uart0.dreq.tx === 20;
    const u0_rx = uart0.dreq.rx === 21;
    const u1_tx = uart1.dreq.tx === 22;
    const u1_rx = uart1.dreq.rx === 23;

    const ok = u0_tx && u0_rx && u1_tx && u1_rx;
    record(15, 'MANDATE_B_DMA', 'RP2040 UART DREQ Hardware Channel Numbers (20, 21, 22, 23)', ok,
      `UART0: TX=${uart0.dreq.tx}, RX=${uart0.dreq.rx}; UART1: TX=${uart1.dreq.tx}, RX=${uart1.dreq.rx}`);
  }

  // Test 16: UARTDMACR Gating & DREQ Flag Dispatch
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;
    const uart1 = controller.getUart(1)!;

    // Initially UARTDMACR = 0: DREQs must be false
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);
    uart1.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);
    uart0.writeUint32(REG_UARTDMACR, 0);
    uart1.writeUint32(REG_UARTDMACR, 0);
    const dreqInit = !rp2040.dma.dreq[20] && !rp2040.dma.dreq[21] && !rp2040.dma.dreq[22] && !rp2040.dma.dreq[23];

    // Enable TXDMAE (bit 1) on UART0: TX FIFO is empty -> DREQ 20 becomes true
    uart0.writeUint32(REG_UARTDMACR, 0x02);
    const dreqU0Tx = !!rp2040.dma.dreq[20];

    // Feed a byte into UART0 RX FIFO and enable RXDMAE (bit 0): DREQ 21 becomes true
    uart0.feedByte(0x77);
    uart0.writeUint32(REG_UARTDMACR, 0x03);
    const dreqU0Rx = !!rp2040.dma.dreq[21];

    // Read byte: RX FIFO empty -> DREQ 21 clears
    uart0.readUint32(REG_UARTDR);
    const dreqU0RxCleared = !rp2040.dma.dreq[21];

    // Test UART1 TXDMAE & RXDMAE
    uart1.writeUint32(REG_UARTDMACR, 0x02);
    const dreqU1Tx = !!rp2040.dma.dreq[22];
    uart1.feedByte(0x88);
    uart1.writeUint32(REG_UARTDMACR, 0x03);
    const dreqU1Rx = !!rp2040.dma.dreq[23];

    const ok = dreqInit && dreqU0Tx && dreqU0Rx && dreqU0RxCleared && dreqU1Tx && dreqU1Rx;
    record(16, 'MANDATE_B_DMA', 'UARTDMACR TXDMAE/RXDMAE Signaling Handshake to rp2040.dma.dreq', ok,
      `Init all false: ${dreqInit}; U0 TX=20(${dreqU0Tx}), RX=21(${dreqU0Rx}), RX clear(${dreqU0RxCleared}); U1 TX=22(${dreqU1Tx}), RX=23(${dreqU1Rx})`);
  }

  // Test 17: DMA Controller Memory-to-Peripheral (UARTDR) Transfer Execution
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN);
    uart0.writeUint32(REG_UARTDMACR, 0x02); // TXDMAE
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    // Write source byte 'K' (0x4B) into SRAM at offset 0x2000
    const sramAddr = 0x20000000 + 0x2000;
    rp2040.sram[0x2000] = 0x4b;

    // Configure DMA Channel 0: read from SRAM, write to UART0 DR (0x40034000)
    const ch0 = rp2040.dma.channels[0];
    ch0.readAddr = sramAddr;
    ch0.writeAddr = 0x40034000;
    ch0.transCount = 1;
    // ctrl: EN=1, DATA_SIZE=0 (byte), TREQ=20 (UART0 TX), INCR_READ=1, INCR_WRITE=0
    ch0.ctrl = 1 | (0 << 2) | (1 << 4) | (20 << 15);

    const initialTransCount = ch0.transCount;
    // Execute transfer
    ch0.transfer();

    const finalTransCount = ch0.transCount;
    const uartBusy = uart0.getDiagnostics().txBusy;
    const txFifoCount = uart0.getDiagnostics().txFifoCount;

    // Step to complete character transmission
    let transmittedByte = -1;
    uart0.onByteTransmit = (b) => { transmittedByte = b; };
    for (let i = 0; i < 12000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }

    const ok = (initialTransCount === 1) && (finalTransCount === 0) &&
               uartBusy && (transmittedByte === 0x4b);

    record(17, 'MANDATE_B_DMA', 'DMA Channel Memory-to-UARTDR Transfer Integration (SRAM -> UART0 DR)', ok,
      `DMA transCount ${initialTransCount} -> ${finalTransCount}, UART became busy=${uartBusy}, Serialized=0x${transmittedByte.toString(16)} ('K')`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MANDATORY AUDIT C: COMPLETE 16-REGISTER MAP & ATOMIC ACCESS
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- MANDATORY AUDIT C: COMPLETE 16-REGISTER MAP ---');

  // Test 18: Full 16-Register Map Reset Values & Access
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    // Audit offsets and resets
    const dr = uart0.readUint32(REG_UARTDR);         // 0x000: 0
    const rsr = uart0.readUint32(REG_UARTRSR);       // 0x004: 0
    const fr = uart0.readUint32(REG_UARTFR);         // 0x018: 0x90 (TXFE|RXFE, CTS=0)
    const ilpr = uart0.readUint32(REG_UARTILPR);     // 0x020: 0
    const ibrd = uart0.readUint32(REG_UARTIBRD);     // 0x024: 0
    const fbrd = uart0.readUint32(REG_UARTFBRD);     // 0x028: 0
    const lcr_h = uart0.readUint32(REG_UARTLCR_H);   // 0x02c: 0
    const cr = uart0.readUint32(REG_UARTCR);         // 0x030: 0x0300 (TXE|RXE)
    const ifls = uart0.readUint32(REG_UARTIFLS);     // 0x034: 0x12 (1/2 TX, 1/2 RX)
    const imsc = uart0.readUint32(REG_UARTIMSC);     // 0x038: 0
    const ris = uart0.readUint32(REG_UARTRIS);       // 0x03c: 0x20 (TXIS set because TX FIFO empty)
    const mis = uart0.readUint32(REG_UARTMIS);       // 0x040: 0 (IMSC=0)
    const icr = uart0.readUint32(REG_UARTICR);       // 0x044: 0 (write-only)
    const dmacr = uart0.readUint32(REG_UARTDMACR);   // 0x048: 0
    const pid0 = uart0.readUint32(REG_UARTPERIPHID0);// 0xfe0: 0x11
    const pid1 = uart0.readUint32(REG_UARTPERIPHID1);// 0xfe4: 0x10
    const pid2 = uart0.readUint32(REG_UARTPERIPHID2);// 0xfe8: 0x34
    const pid3 = uart0.readUint32(REG_UARTPERIPHID3);// 0xfec: 0x00
    const cid0 = uart0.readUint32(REG_UARTPCELLID0); // 0xff0: 0x0D
    const cid1 = uart0.readUint32(REG_UARTPCELLID1); // 0xff4: 0xF0
    const cid2 = uart0.readUint32(REG_UARTPCELLID2); // 0xff8: 0x05
    const cid3 = uart0.readUint32(REG_UARTPCELLID3); // 0xffc: 0xB1

    const ok = (dr === 0) && (rsr === 0) && (fr === 0x90) && (ilpr === 0) &&
               (ibrd === 0) && (fbrd === 0) && (lcr_h === 0) && (cr === 0x0300) &&
               (ifls === 0x12) && (imsc === 0) && (ris === 0x20) && (mis === 0) &&
               (icr === 0) && (dmacr === 0) &&
               (pid0 === 0x11) && (pid1 === 0x10) && (pid2 === 0x34) && (pid3 === 0x00) &&
               (cid0 === 0x0d) && (cid1 === 0xf0) && (cid2 === 0x05) && (cid3 === 0xb1);

    record(18, 'MANDATE_C_REG', 'Complete 16-Register Map Reset Values & PrimeCell Identification', ok,
      `FR=0x${fr.toString(16)}, CR=0x${cr.toString(16)}, IFLS=0x${ifls.toString(16)}, RIS=0x${ris.toString(16)}, PID=[${pid0},${pid1},${pid2},${pid3}], CID=[${cid0},${cid1},${cid2},${cid3}]`);
  }

  // Test 19: UARTILPR (0x020) Storage Compliance & IrDA Unsupported Status
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    // UARTILPR is an 8-bit low-power counter divisor
    uart0.writeUint32(REG_UARTILPR, 0x5a);
    const readVal = uart0.readUint32(REG_UARTILPR);

    // Overwrite with 16-bit value: bits [15:8] must be masked to 8-bit
    uart0.writeUint32(REG_UARTILPR, 0x1ff);
    const readMasked = uart0.readUint32(REG_UARTILPR);

    // Reset peripheral
    uart0.reset();
    const resetVal = uart0.readUint32(REG_UARTILPR);

    const ok = (readVal === 0x5a) && (readMasked === 0xff) && (resetVal === 0);
    record(19, 'MANDATE_C_REG', 'UARTILPR (0x020) 8-Bit Storage Compliance & IrDA Scope Boundary', ok,
      `Written 0x5a -> ${readVal}; Written 0x1ff -> 8-bit masked ${readMasked}; Reset -> ${resetVal} (IrDA SIR hardware unsupported)`);
  }

  // Test 20: RP2040 Atomic Register Alias Operators (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    // Test on UARTIMSC (0x038)
    uart0.writeUint32(REG_UARTIMSC, 0x050); // Set bits 4 and 6
    const base = uart0.readUint32(REG_UARTIMSC);

    // SET alias (+0x2000): set bit 5 (0x020)
    uart0.writeUint32(REG_UARTIMSC + 0x2000, 0x020);
    const afterSet = uart0.readUint32(REG_UARTIMSC);

    // CLEAR alias (+0x3000): clear bit 4 (0x010)
    uart0.writeUint32(REG_UARTIMSC + 0x3000, 0x010);
    const afterClr = uart0.readUint32(REG_UARTIMSC);

    // XOR alias (+0x1000): toggle bit 6 (0x040)
    uart0.writeUint32(REG_UARTIMSC + 0x1000, 0x040);
    const afterXor = uart0.readUint32(REG_UARTIMSC);

    const ok = (base === 0x050) && (afterSet === 0x070) && (afterClr === 0x060) && (afterXor === 0x020);
    record(20, 'MANDATE_C_REG', 'RP2040 Hardware Atomic Register Aliases (SET/CLEAR/XOR)', ok,
      `Base=0x${base.toString(16)}, After SET(+0x2000)=0x${afterSet.toString(16)}, After CLR(+0x3000)=0x${afterClr.toString(16)}, After XOR(+0x1000)=0x${afterXor.toString(16)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MANDATORY AUDIT D: DUAL CLOCK DOMAINS & TIMING MATRIX
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- MANDATORY AUDIT D: DUAL CLOCK DOMAIN MATRIX ---');

  // Test 21: Configuration 1: 125 MHz clk_sys / 125 MHz clk_peri (Standard Nominal Pico)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    const clkSys = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    // 115200: IBRD=67, FBRD=52 -> 115207.37 Baud
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x70); // 8-N-1, FEN=1
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    let startBitCycles = 0;
    let inStartBit = false;
    let startBitMeasured = 0;
    uart0.onTxPinStateChange = (high) => {
      if (!high && !inStartBit) {
        inStartBit = true;
      } else if (high && inStartBit) {
        startBitMeasured = startBitCycles;
        inStartBit = false;
      }
    };

    uart0.writeUint32(REG_UARTDR, 0x01); // LSB=1 -> transitions high after start bit
    for (let c = 0; c < 3000; c++) {
      if (inStartBit) startBitCycles++;
      uart0.tickCycles(1, clkPeri, clkSys);
    }

    const baud = uart0.baudRate;
    const expectedCycles = 1085;
    const bitErrPercent = ((startBitMeasured - expectedCycles) / expectedCycles) * 100;
    const ok = (baud === 115207) && (Math.abs(startBitMeasured - expectedCycles) <= 1);

    record(21, 'MANDATE_D_CLK', 'Timing Config 1: 125M sys / 125M peri (115207 Baud, 1085 cycles/bit)', ok,
      `Baud=${baud} Bd, Measured start bit=${startBitMeasured} cycles (Expected ${expectedCycles}, Error ${bitErrPercent.toFixed(4)}%)`);
  }

  // Test 22: Configuration 2: 133 MHz clk_sys / 125 MHz clk_peri (Overclocked CPU)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    const clkSys = 133_000_000;
    uart0.setPeripheralClock(clkPeri);

    // Baud is generated strictly from clk_peri (125 MHz) -> 115207 Baud
    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x70);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    let startBitCycles = 0;
    let inStartBit = false;
    let startBitMeasured = 0;
    uart0.onTxPinStateChange = (high) => {
      if (!high && !inStartBit) {
        inStartBit = true;
      } else if (high && inStartBit) {
        startBitMeasured = startBitCycles;
        inStartBit = false;
      }
    };

    uart0.writeUint32(REG_UARTDR, 0x01);
    for (let c = 0; c < 3000; c++) {
      if (inStartBit) startBitCycles++;
      uart0.tickCycles(1, clkPeri, clkSys);
    }

    // At 133 MHz clk_sys, 1 bit at 115207 baud takes: 133e6 / 115207.37 = 1154.44 cycles -> 1154 cycles
    const expectedCycles = 1154;
    const baud = uart0.baudRate;
    const ok = (baud === 115207) && (Math.abs(startBitMeasured - expectedCycles) <= 1);

    record(22, 'MANDATE_D_CLK', 'Timing Config 2: 133M sys / 125M peri (115207 Baud, 1154 CPU cycles/bit)', ok,
      `Baud=${baud} Bd, Measured start bit=${startBitMeasured} CPU cycles (Expected ${expectedCycles}, Exact wall time=8.680 µs)`);
  }

  // Test 23: Configuration 3: 125 MHz clk_sys / 48 MHz clk_peri (USB PLL Clocked Peripheral)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 48_000_000;
    const clkSys = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    // At 48 MHz peri: 48e6 / (16 * 115200) = 26.041667 -> IBRD=26, FBRD=round(0.041667*64)=3
    // Baud = 48e6 / (16 * 26.046875) = 115177 Baud (error 0.02%)
    uart0.writeUint32(REG_UARTIBRD, 26);
    uart0.writeUint32(REG_UARTFBRD, 3);
    uart0.writeUint32(REG_UARTLCR_H, 0x70);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    let startBitCycles = 0;
    let inStartBit = false;
    let startBitMeasured = 0;
    uart0.onTxPinStateChange = (high) => {
      if (!high && !inStartBit) {
        inStartBit = true;
      } else if (high && inStartBit) {
        startBitMeasured = startBitCycles;
        inStartBit = false;
      }
    };

    uart0.writeUint32(REG_UARTDR, 0x01);
    for (let c = 0; c < 3000; c++) {
      if (inStartBit) startBitCycles++;
      uart0.tickCycles(1, clkPeri, clkSys);
    }

    const baud = uart0.baudRate;
    // 125e6 / 115177 = 1085 CPU cycles
    const expectedCycles = 1085;
    const ok = (baud === 115177) && (Math.abs(startBitMeasured - expectedCycles) <= 1);

    record(23, 'MANDATE_D_CLK', 'Timing Config 3: 125M sys / 48M peri (115177 Baud, IBRD=26, FBRD=3)', ok,
      `Baud=${baud} Bd (err -0.020%), Measured start bit=${startBitMeasured} CPU cycles (Expected ${expectedCycles})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MANDATORY AUDIT F: END-TO-END DATA PATHS
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log('\n--- MANDATORY AUDIT F: END-TO-END DATA PATHS ---');

  // Test 24: Cortex-M0+ Firmware Transmission Reaching Serial Monitor
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    const capturedBytes: number[] = [];
    controller.onSerialTransmit((b) => capturedBytes.push(b));

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x70);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    const message = 'CLOSURE_OK\r\n';
    for (let i = 0; i < message.length; i++) {
      uart0.writeUint32(REG_UARTDR, message.charCodeAt(i));
    }

    // Step until all characters are serialized
    for (let i = 0; i < message.length * 12000; i += 100) {
      uart0.tickCycles(100, clkPeri);
    }

    const receivedStr = String.fromCharCode(...capturedBytes);
    const ok = receivedStr === message;
    record(24, 'MANDATE_F_E2E', 'Firmware Serial Transmission Callback Reaching Serial Monitor UI', ok,
      `Sent: "${message.trim()}", Captured: "${receivedStr.trim()}", Match=${ok}`);
  }

  // Test 25: Serial Monitor Host Input Injection Reaching Firmware UARTDR
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const uart0 = controller.getUart(0)!;

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x70);
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    // Inject from Host
    const hostCommand = 'SET_VOLTAGE 3.3\n';
    controller.sendSerialString(hostCommand, 0);

    const readChars: string[] = [];
    while ((uart0.readUint32(REG_UARTFR) & FR_RXFE) === 0) {
      const charVal = uart0.readUint32(REG_UARTDR) & 0xff;
      readChars.push(String.fromCharCode(charVal));
    }
    const readString = readChars.join('');
    const ok = readString === hostCommand;

    record(25, 'MANDATE_F_E2E', 'Bidirectional Serial Monitor Host Input Injected into UART0 DR', ok,
      `Host Injected: "${hostCommand.trim()}", Read from UARTDR: "${readString.trim()}", Match=${ok}`);
  }

  // Test 26: Closed-Loop MNA Physical Loopback (GP0 TX -> Wire -> GP1 RX)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const uart0 = controller.getUart(0)!;
    const clkPeri = 125_000_000;
    uart0.setPeripheralClock(clkPeri);

    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[1].ctrl = (rp2040.gpio[1].ctrl & ~0x1f) | FUNCTION_UART;
    rp2040.gpio[1].padValue |= (1 << 6); // IE=1
    bridge.recomputeDriverState(0);
    bridge.recomputeDriverState(1);

    uart0.writeUint32(REG_UARTIBRD, 67);
    uart0.writeUint32(REG_UARTFBRD, 52);
    uart0.writeUint32(REG_UARTLCR_H, 0x60 | LCR_FEN); // 115200 8-N-1
    uart0.writeUint32(REG_UARTCR, CR_UARTEN | CR_TXE | CR_RXE);

    const elements: MNAElement[] = [
      { id: bridge.getMnaVoltageSourceId(0), type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 3.3 },
      { id: bridge.getMnaResistorId(0), type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 50 },
      { id: 'jumper_wire', type: 'RESISTOR', nodeA: 2, nodeB: 3, value: 100 },
      { id: bridge.getMnaResistorId(1), type: 'RESISTOR', nodeA: 3, nodeB: 0, value: 10_000_000 },
    ];
    const solver = new MNASolver(3, 0.000001);
    solver.setElements(elements);

    // Transmit 0x96 (0b10010110)
    uart0.writeUint32(REG_UARTDR, 0x96);

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

    const ok = rxHasData && (rxByte === 0x96);
    record(26, 'MANDATE_F_E2E', 'Closed-Loop MNA Physical Loopback (GP0 TX -> Wire -> GP1 RX)', ok,
      `Sent: 0x96, Solved via MNA 100Ω wire, Received in UARTDR: 0x${rxByte.toString(16)} (Match=${ok})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SUMMARY OF TEST RESULTS
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`TOTAL PHASE 4.3.3.2 CLOSURE CHECKS: ${total}`);
  console.log(`PASSED:                            ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`FAILED:                            ${failed}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4332ClosureTests().catch((err) => {
  console.error('Fatal error in closure suite:', err);
  process.exit(1);
});
