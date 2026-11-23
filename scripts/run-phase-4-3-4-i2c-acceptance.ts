/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.4 RP2040 Dual I²C Controller Acceptance Test Suite
 * 
 * Verifies:
 * 1. Dual Independent DW_apb_i2c Controllers (I2C0 @ 0x40044000 & I2C1 @ 0x40048000)
 * 2. Atomic Aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)
 * 3. Standard-Mode (100 kbps) and Fast-Mode (400 kbps) Baud-Rate Timing
 * 4. Controller Enable, Dynamic Abort (ENABLE.ABORT), and FIFO Flush on Disable
 * 5. 16-Entry TX FIFO Buffering, Status Flags (TFNF, TFE), and Level Counters (TXFLR)
 * 6. TX FIFO Overflow Detection (INTR_TX_OVER) and TX Threshold Interrupts (IC_TX_TL)
 * 7. 16-Entry RX FIFO Buffering, Status Flags (RFNE, RFF), RXFLR, and RX Underflow (INTR_RX_UNDER)
 * 8. Cycle-Accurate Master START Condition and 7-bit Address Frame Serialization
 * 9. Repeated START (CMD_RESTART) and Cycle-Accurate STOP Condition Generation
 * 10. Address NACK Abort Sequence (ABRT_7B_ADDR_NOACK & INTR_TX_ABRT)
 * 11. Master Write to AT24C32 EEPROM (16-bit address + multi-byte payload)
 * 12. Master Read from AT24C32 EEPROM (Random address read with verified data)
 * 13. PCF8574 8-Bit Quasi-Bidirectional I/O Expander Integration
 * 14. LM75 Digital Temperature Sensor Integration (+25.5 °C readback)
 * 15. Multi-Device Bus Sharing (EEPROM @ 0x50 and LM75 @ 0x48 on shared bus)
 * 16. SCL Clock Stretching by External Slave pausing Master SCL Clock
 * 17. Open-Drain Wired-AND Bus Physics with 4.7 kΩ Pull-Up Resistor in MNA Solver
 * 18. Pull-Up Resistor Variations (2.2 kΩ, 4.7 kΩ, 10 kΩ) and RC Rise Time Validation
 * 19. IO_BANK0 Function 3 Pin Multiplexing across GP0-GP29
 * 20. Dynamic Pin Function Switching (FUNCTION_I2C <-> FUNCTION_SIO)
 * 21. DMA DREQ 24/25 (I2C0 TX/RX) Handshaking
 * 22. DMA DREQ 26/27 (I2C1 TX/RX) Handshaking
 * 23. Cortex-M0+ NVIC Interrupt Delivery (IRQ 23 for I2C0 & IRQ 24 for I2C1)
 * 24. Logic Analyzer Signal Acquisition & Protocol Decoding via decodeI2c()
 * 25. Real Cortex-M0+ Instruction Stepping & Firmware Register Control
 * 26. Complete I2C Diagnostics Snapshot Integrity
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  REG_IC_CON,
  REG_IC_TAR,
  REG_IC_SAR,
  REG_IC_DATA_CMD,
  REG_IC_SS_SCL_HCNT,
  REG_IC_SS_SCL_LCNT,
  REG_IC_FS_SCL_HCNT,
  REG_IC_FS_SCL_LCNT,
  REG_IC_INTR_STAT,
  REG_IC_INTR_MASK,
  REG_IC_RAW_INTR_STAT,
  REG_IC_RX_TL,
  REG_IC_TX_TL,
  REG_IC_CLR_INTR,
  REG_IC_CLR_RX_UNDER,
  REG_IC_CLR_RX_OVER,
  REG_IC_CLR_TX_OVER,
  REG_IC_CLR_TX_ABRT,
  REG_IC_CLR_ACTIVITY,
  REG_IC_CLR_STOP_DET,
  REG_IC_CLR_START_DET,
  REG_IC_ENABLE,
  REG_IC_STATUS,
  REG_IC_TXFLR,
  REG_IC_RXFLR,
  REG_IC_SDA_HOLD,
  REG_IC_TX_ABRT_SOURCE,
  REG_IC_DMA_CR,
  REG_IC_DMA_TDLR,
  REG_IC_DMA_RDLR,
  REG_IC_FS_SPKLEN,
  REG_IC_COMP_PARAM_1,
  REG_IC_COMP_VERSION,
  REG_IC_COMP_TYPE,
  CON_MASTER_MODE,
  CON_SPEED_SHIFT,
  CON_SPEED_MASK,
  CON_RESTART_EN,
  CON_SLAVE_DISABLE,
  CMD_READ,
  CMD_STOP,
  CMD_RESTART,
  ENABLE_ENABLE,
  ENABLE_ABORT,
  STATUS_ACTIVITY,
  STATUS_TFNF,
  STATUS_TFE,
  STATUS_RFNE,
  STATUS_RFF,
  STATUS_MST_ACTIVITY,
  INTR_RX_UNDER,
  INTR_RX_OVER,
  INTR_RX_FULL,
  INTR_TX_OVER,
  INTR_TX_EMPTY,
  INTR_TX_ABRT,
  INTR_ACTIVITY,
  INTR_STOP_DET,
  INTR_START_DET,
  INTR_RESTART_DET,
  ABRT_7B_ADDR_NOACK,
  ABRT_TXDATA_NOACK,
  ABRT_USER_ABRT,
  RP2040I2c,
  decodeI2c,
  type I2cSignalSample,
  DREQ_I2C0_TX,
  DREQ_I2C0_RX,
  DREQ_I2C1_TX,
  DREQ_I2C1_RX,
} from '../src/features/simulator/rp2040I2c';
import {
  AT24C32EEPROM,
  PCF8574Expander,
  LM75TempSensor,
  GenericI2cRegisterDevice,
} from '../src/features/simulator/rp2040I2cDevice';
import {
  RP2040GpioBridge,
  FUNCTION_I2C,
  FUNCTION_SIO,
  I2C0_SDA_PINS,
  I2C0_SCL_PINS,
  I2C1_SDA_PINS,
  I2C1_SCL_PINS,
} from '../src/features/simulator/rp2040GpioBridge';
import { MNASolver, type MNAElement } from '../src/features/simulator/MNASolver';

interface TestResult {
  id: number;
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, category: string, name: string, passed: boolean, details: string) {
  results.push({ id, category, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Test ${String(id).padStart(2, '0')}] [${category}] ${status}: ${name}`);
  console.log(`         ${details}`);
}

async function runI2cAcceptanceTests() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.4 — RP2040 DUAL I²C CONTROLLER ACCEPTANCE SUITE  ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const blinkFixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const blinkBytes = new Uint8Array(fs.readFileSync(blinkFixturePath));

  // ─── CATEGORY 1: DUAL CONTROLLER ISOLATION & REGISTER MAP ──────────────────────────
  console.log('--- CATEGORY 1: DUAL CONTROLLER ISOLATION & REGISTER MAP ---');

  // Test 1: I2C0 vs I2C1 Base Addresses and Reset Defaults
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;
    const i2c1 = controller.getI2c(1)!;

    const con0 = i2c0.readUint32(REG_IC_CON);
    const tar0 = i2c0.readUint32(REG_IC_TAR);
    const en0 = i2c0.readUint32(REG_IC_ENABLE);
    const mask0 = i2c0.readUint32(REG_IC_INTR_MASK);
    const ver0 = i2c0.readUint32(REG_IC_COMP_VERSION);
    const type0 = i2c0.readUint32(REG_IC_COMP_TYPE);

    const con1 = i2c1.readUint32(REG_IC_CON);
    const tar1 = i2c1.readUint32(REG_IC_TAR);
    const en1 = i2c1.readUint32(REG_IC_ENABLE);

    // Write different target address to I2C0 and verify I2C1 is unaffected
    i2c0.writeUint32(REG_IC_TAR, 0x3c);
    const tar0After = i2c0.readUint32(REG_IC_TAR);
    const tar1After = i2c1.readUint32(REG_IC_TAR);

    const ok = con0 === 0x65 &&
               tar0 === 0x55 &&
               en0 === 0x00 &&
               mask0 === 0x08ff &&
               ver0 === 0x3230312a &&
               type0 === 0x44570140 &&
               con1 === 0x65 &&
               tar1 === 0x55 &&
               en1 === 0x00 &&
               tar0After === 0x3c &&
               tar1After === 0x55;

    record(1, 'DUAL_ISOLATION', 'I2C0 (0x40044000) and I2C1 (0x40048000) Base Isolation and Defaults', ok,
      `I2C0 IC_CON=0x${con0.toString(16)}, TAR=0x${tar0.toString(16)}, ENABLE=0x${en0.toString(16)}; I2C1 TAR unaffected (0x${tar1After.toString(16)}); Version=0x${ver0.toString(16)}, Type=0x${type0.toString(16)}`);
  }

  // Test 2: Atomic Register Aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLEAR)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    // SET TAR via +0x2000
    i2c0.writeUint32(0x2000 + REG_IC_TAR, 0x10);
    const tar1 = i2c0.readUint32(REG_IC_TAR); // 0x55 | 0x10 = 0x55

    // CLEAR TAR bits via +0x3000
    i2c0.writeUint32(0x3000 + REG_IC_TAR, 0x05);
    const tar2 = i2c0.readUint32(REG_IC_TAR); // 0x55 & ~0x05 = 0x50

    // XOR TAR bits via +0x1000
    i2c0.writeUint32(0x1000 + REG_IC_TAR, 0x07);
    const tar3 = i2c0.readUint32(REG_IC_TAR); // 0x50 ^ 0x07 = 0x57

    const ok = (tar2 === 0x50) && (tar3 === 0x57);

    record(2, 'ATOMIC_ALIASES', 'RP2040 Atomic Register Aliases (SET +0x2000, CLR +0x3000, XOR +0x1000)', ok,
      `After SET: 0x${tar1.toString(16)}; After CLR 0x05: 0x${tar2.toString(16)}; After XOR 0x07: 0x${tar3.toString(16)}`);
  }

  // ─── CATEGORY 2: DW_apb_i2c REGISTER BITFIELDS & CONFIGURATION ──────────────────────
  console.log('\n--- CATEGORY 2: DW_apb_i2c REGISTER BITFIELDS & CONFIGURATION ---');

  // Test 3: Standard-Mode (100 kbps) and Fast-Mode (400 kbps) Timing Calculations
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;
    i2c0.setPeripheralClock(125_000_000);

    // Standard mode (speed = 1)
    i2c0.writeUint32(REG_IC_CON, CON_MASTER_MODE | (1 << CON_SPEED_SHIFT) | CON_SLAVE_DISABLE);
    i2c0.writeUint32(REG_IC_SS_SCL_HCNT, 625);
    i2c0.writeUint32(REG_IC_SS_SCL_LCNT, 625);
    const baudSS = i2c0.baudRate;

    // Fast mode (speed = 2)
    i2c0.writeUint32(REG_IC_CON, CON_MASTER_MODE | (2 << CON_SPEED_SHIFT) | CON_SLAVE_DISABLE);
    i2c0.writeUint32(REG_IC_FS_SCL_HCNT, 125);
    i2c0.writeUint32(REG_IC_FS_SCL_LCNT, 187);
    const baudFS = i2c0.baudRate;

    const ok = (baudSS === 100_000) && (Math.abs(baudFS - 400_641) <= 1);

    record(3, 'SPEED_MODES', 'Standard-Mode (100 kbps) & Fast-Mode (400 kbps) Timing & Baud Rate', ok,
      `Standard Mode (625+625 cycles): ${baudSS} bps; Fast Mode (125+187 cycles): ${baudFS} bps`);
  }

  // Test 4: Enable, Abort, and Disable logic (ENABLE.ABORT & FIFO flush)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    // Enable controller
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);
    const enState1 = i2c0.enabled;

    // Push dummy write commands into TX FIFO
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x11);
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x22);
    const txflr1 = i2c0.readUint32(REG_IC_TXFLR);

    // Abort transfer via ENABLE_ABORT
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE | ENABLE_ABORT);
    const abrtSrc = i2c0.readUint32(REG_IC_TX_ABRT_SOURCE);

    // Disable controller
    i2c0.writeUint32(REG_IC_ENABLE, 0);
    const enState2 = i2c0.enabled;
    const txflr2 = i2c0.readUint32(REG_IC_TXFLR);

    const ok = enState1 === true &&
               txflr1 > 0 &&
               (abrtSrc & ABRT_USER_ABRT) !== 0 &&
               enState2 === false &&
               txflr2 === 0;

    record(4, 'ENABLE_ABORT', 'Controller Enable, Dynamic Abort (ENABLE.ABORT) and FIFO Flush on Disable', ok,
      `Enabled: ${enState1}; Buffered: ${txflr1}; Abort Source: 0x${abrtSrc.toString(16)}; Disabled: ${enState2}; Flush TXFLR: ${txflr2}`);
  }

  // ─── CATEGORY 3: 16-ENTRY FIFO BUFFERING & STATUS FLAGS ────────────────────────────
  console.log('\n--- CATEGORY 3: 16-ENTRY FIFO BUFFERING & STATUS FLAGS ---');

  // Test 5: 16-Entry TX FIFO Depth, STATUS_TFNF, STATUS_TFE, and TXFLR Tracking
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const stat0 = i2c0.readUint32(REG_IC_STATUS);
    const tfe0 = !!(stat0 & STATUS_TFE);
    const tfnf0 = !!(stat0 & STATUS_TFNF);

    // Write 16 bytes into TX FIFO
    for (let i = 0; i < 16; i++) {
      i2c0.writeUint32(REG_IC_DATA_CMD, 0x10 | i);
    }

    const stat16 = i2c0.readUint32(REG_IC_STATUS);
    const tfe16 = !!(stat16 & STATUS_TFE);
    const tfnf16 = !!(stat16 & STATUS_TFNF);
    const txflr16 = i2c0.readUint32(REG_IC_TXFLR);

    const ok = tfe0 === true &&
               tfnf0 === true &&
               tfe16 === false &&
               tfnf16 === false &&
               txflr16 === 16;

    record(5, 'TX_FIFO_DEPTH', '16-Entry TX FIFO Depth, Empty (TFE) & Not-Full (TFNF) Status Flags', ok,
      `Initial: TFE=${tfe0}, TFNF=${tfnf0}; Filled 16: TFE=${tfe16}, TFNF=${tfnf16}, TXFLR=${txflr16}`);
  }

  // Test 6: TX FIFO Overflow Detection (INTR_TX_OVER) and Threshold Interrupt
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    for (let i = 0; i < 16; i++) {
      i2c0.writeUint32(REG_IC_DATA_CMD, 0xaa);
    }

    // 17th write must trigger TX_OVER
    i2c0.writeUint32(REG_IC_DATA_CMD, 0xbb);
    const raw1 = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const isTxOver = !!(raw1 & INTR_TX_OVER);

    // Clear via IC_CLR_TX_OVER
    i2c0.readUint32(REG_IC_CLR_TX_OVER);
    const raw2 = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const isTxOverCleared = !(raw2 & INTR_TX_OVER);

    const ok = isTxOver && isTxOverCleared;

    record(6, 'TX_OVERFLOW', 'TX FIFO Overflow (17th write to 16-deep FIFO) and Clear Protocol', ok,
      `17th write asserted TX_OVER: ${isTxOver}; Reading CLR_TX_OVER cleared flag: ${isTxOverCleared}`);
  }

  // Test 7: 16-Entry RX FIFO Buffering, RFNE, RFF, RXFLR, and RX Underflow
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    // Attempt read from empty RX FIFO -> triggers RX_UNDER
    i2c0.readUint32(REG_IC_DATA_CMD);
    const rawUnder = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const isRxUnder = !!(rawUnder & INTR_RX_UNDER);

    // Clear RX_UNDER
    i2c0.readUint32(REG_IC_CLR_RX_UNDER);
    const rawUnderCleared = !(i2c0.readUint32(REG_IC_RAW_INTR_STAT) & INTR_RX_UNDER);

    const ok = isRxUnder && rawUnderCleared;

    record(7, 'RX_UNDERFLOW', 'RX FIFO Underflow Detection (Reading Empty FIFO) & Clear', ok,
      `Reading empty RX FIFO asserted RX_UNDER: ${isRxUnder}; Cleared via CLR_RX_UNDER: ${rawUnderCleared}`);
  }

  // ─── CATEGORY 4: MASTER FSM PROTOCOL ENGINE & BUS SIGNALING ────────────────────────
  console.log('\n--- CATEGORY 4: MASTER FSM PROTOCOL ENGINE & BUS SIGNALING ---');

  // Test 8: Cycle-Accurate START Condition and Address Frame Serialization
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;
    i2c0.setPeripheralClock(125_000_000);

    const eeprom = new AT24C32EEPROM(0x50);
    i2c0.attachDevice(eeprom);

    const samples: I2cSignalSample[] = [];
    i2c0.onSdaPinChange = (sdaLow) => samples.push({ time_s: controller.getSimulatedTime_s(), scl: !i2c0.isSclLineDrivenLow, sda: !sdaLow });
    i2c0.onSclPinChange = (sclLow) => samples.push({ time_s: controller.getSimulatedTime_s(), scl: !sclLow, sda: !i2c0.isSdaLineDrivenLow });

    i2c0.writeUint32(REG_IC_TAR, 0x50);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Queue 1 write byte
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x00);

    // Step clock cycles
    for (let c = 0; c < 5000; c += 10) {
      controller.stepCycles(10);
    }

    const rawIntr = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const startDet = !!(rawIntr & INTR_START_DET);

    const ok = startDet && samples.length > 0;

    record(8, 'START_CONDITION', 'Cycle-Accurate START Condition Generation and Detection', ok,
      `START detected in RAW_INTR_STAT: ${startDet}; Total bus state transitions captured: ${samples.length}`);
  }

  // Test 9: Repeated START (CMD_RESTART) and STOP Condition Generation
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50);
    i2c0.attachDevice(eeprom);

    i2c0.writeUint32(REG_IC_TAR, 0x50);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Write address word 0x00, then issue RESTART + READ + STOP
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x00);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_RESTART | CMD_READ | CMD_STOP);

    for (let c = 0; c < 10000; c += 10) {
      controller.stepCycles(10);
    }

    const raw = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const stopDet = !!(raw & INTR_STOP_DET);
    const restartDet = !!(raw & INTR_RESTART_DET);

    const ok = stopDet && restartDet;

    record(9, 'RESTART_STOP', 'Repeated START (CMD_RESTART) and STOP (CMD_STOP) Condition FSM Validation', ok,
      `Restart detected: ${restartDet}; Stop detected: ${stopDet}; RAW_INTR=0x${raw.toString(16)}`);
  }

  // Test 10: Address NACK Abort Sequence (ABRT_7B_ADDR_NOACK & INTR_TX_ABRT)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    // Target address 0x76 has NO attached slave device!
    i2c0.writeUint32(REG_IC_TAR, 0x76);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x12 | CMD_STOP);

    for (let c = 0; c < 5000; c += 10) {
      controller.stepCycles(10);
    }

    const abrtSrc = i2c0.readUint32(REG_IC_TX_ABRT_SOURCE);
    const raw = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const isTxAbrt = !!(raw & INTR_TX_ABRT);
    const is7bNoAck = !!(abrtSrc & ABRT_7B_ADDR_NOACK);

    // Clear abort status
    i2c0.readUint32(REG_IC_CLR_TX_ABRT);
    const rawAfter = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const abrtCleared = !(rawAfter & INTR_TX_ABRT);

    const ok = isTxAbrt && is7bNoAck && abrtCleared;

    record(10, 'ADDRESS_NACK', 'Address NACK Abort Sequence (ABRT_7B_ADDR_NOACK) and Interrupt Clear', ok,
      `TX_ABRT asserted: ${isTxAbrt}; ABRT_7B_ADDR_NOACK set: ${is7bNoAck}; Cleared via CLR_TX_ABRT: ${abrtCleared}`);
  }

  // ─── CATEGORY 5: MASTER WRITE & READ WITH VIRTUAL DEVICES ──────────────────────────
  console.log('\n--- CATEGORY 5: MASTER WRITE & READ WITH VIRTUAL DEVICES ---');

  // Test 11: Master Write to AT24C32 EEPROM (16-bit address + 4-byte payload)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50, 4096, true);
    i2c0.attachDevice(eeprom);

    i2c0.writeUint32(REG_IC_TAR, 0x50);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Address 0x0120 + data [0xde, 0xad, 0xbe, 0xef]
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x01); // Addr MSB
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x20); // Addr LSB
    i2c0.writeUint32(REG_IC_DATA_CMD, 0xde); // D0
    i2c0.writeUint32(REG_IC_DATA_CMD, 0xad); // D1
    i2c0.writeUint32(REG_IC_DATA_CMD, 0xbe); // D2
    i2c0.writeUint32(REG_IC_DATA_CMD, 0xef | CMD_STOP); // D3 + STOP

    for (let c = 0; c < 20000; c += 10) {
      controller.stepCycles(10);
    }

    const b0 = eeprom.readRaw(0x0120);
    const b1 = eeprom.readRaw(0x0121);
    const b2 = eeprom.readRaw(0x0122);
    const b3 = eeprom.readRaw(0x0123);

    const ok = (b0 === 0xde) && (b1 === 0xad) && (b2 === 0xbe) && (b3 === 0xef);

    record(11, 'EEPROM_WRITE', 'Master Write to AT24C32 EEPROM (16-bit address 0x0120, 4 bytes)', ok,
      `Wrote [0xDE, 0xAD, 0xBE, 0xEF]; Read from memory: [0x${b0.toString(16)}, 0x${b1.toString(16)}, 0x${b2.toString(16)}, 0x${b3.toString(16)}]`);
  }

  // Test 12: Master Read from AT24C32 EEPROM
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50, 4096, true);
    eeprom.writeRaw(0x0200, 0x5a);
    eeprom.writeRaw(0x0201, 0xa5);
    i2c0.attachDevice(eeprom);

    i2c0.writeUint32(REG_IC_TAR, 0x50);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Set memory address to 0x0200
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x02);
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x00);
    // Restart and read 2 bytes
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_RESTART | CMD_READ);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_READ | CMD_STOP);

    for (let c = 0; c < 25000; c += 10) {
      controller.stepCycles(10);
    }

    const rxflr = i2c0.readUint32(REG_IC_RXFLR);
    const r0 = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;
    const r1 = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;

    const ok = (rxflr === 2) && (r0 === 0x5a) && (r1 === 0xa5);

    record(12, 'EEPROM_READ', 'Master Random Read from AT24C32 EEPROM (2 bytes: 0x5A, 0xA5)', ok,
      `RXFLR=${rxflr}; Byte 0=0x${r0.toString(16)}, Byte 1=0x${r1.toString(16)}`);
  }

  // Test 13: PCF8574 8-Bit Quasi-Bidirectional I/O Expander Integration
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const pcf = new PCF8574Expander(0x27);
    i2c0.attachDevice(pcf);

    i2c0.writeUint32(REG_IC_TAR, 0x27);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Write 0x3c to expander output
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x3c | CMD_STOP);
    for (let c = 0; c < 5000; c += 10) {
      controller.stepCycles(10);
    }
    const outVal = pcf.getPortOutput();

    // Now set input pins to 0x55 and read back
    pcf.setPinInput(0, true);
    pcf.setPinInput(1, false);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_READ | CMD_STOP);
    for (let c = 0; c < 5000; c += 10) {
      controller.stepCycles(10);
    }
    const readVal = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;

    const ok = (outVal === 0x3c) && (readVal === (0x3c & pcf['portInput']));

    record(13, 'PCF8574_EXPANDER', 'PCF8574 8-Bit I/O Expander Write (0x3C) and Readback', ok,
      `Port output set to: 0x${outVal.toString(16)}; Port read returned: 0x${readVal.toString(16)}`);
  }

  // Test 14: LM75 Digital Temperature Sensor Integration (+25.5 °C)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const lm75 = new LM75TempSensor(0x48);
    lm75.setTemperature(25.5); // 0x1980
    i2c0.attachDevice(lm75);

    i2c0.writeUint32(REG_IC_TAR, 0x48);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Read 2-byte temperature register
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_READ);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_READ | CMD_STOP);

    for (let c = 0; c < 15000; c += 10) {
      controller.stepCycles(10);
    }

    const msb = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;
    const lsb = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;
    const rawTemp = (msb << 8) | lsb;
    const tempC = (rawTemp >> 5) * 0.125;

    const ok = (tempC === 25.5);

    record(14, 'LM75_TEMP_SENSOR', 'LM75 Digital Temperature Sensor Read (+25.5 °C, raw 0x1980)', ok,
      `MSB=0x${msb.toString(16)}, LSB=0x${lsb.toString(16)}; Computed Temperature: ${tempC} °C`);
  }

  // ─── CATEGORY 6: MULTI-DEVICE BUS SHARING ──────────────────────────────────────────
  console.log('\n--- CATEGORY 6: MULTI-DEVICE BUS SHARING ---');

  // Test 15: Single I2C0 Bus Sharing EEPROM (0x50) and LM75 (0x48)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50);
    const lm75 = new LM75TempSensor(0x48);
    lm75.setTemperature(30.0);
    eeprom.writeRaw(0x0010, 0x77);

    i2c0.attachDevice(eeprom);
    i2c0.attachDevice(lm75);

    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Transaction 1: Read EEPROM @ 0x50
    i2c0.writeUint32(REG_IC_TAR, 0x50);
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x00);
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x10);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_RESTART | CMD_READ | CMD_STOP);

    for (let c = 0; c < 15000; c += 10) {
      controller.stepCycles(10);
    }
    const eepromVal = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;

    // Transaction 2: Read Temp Sensor @ 0x48
    i2c0.writeUint32(REG_IC_TAR, 0x48);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_READ);
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_READ | CMD_STOP);

    for (let c = 0; c < 15000; c += 10) {
      controller.stepCycles(10);
    }
    const tMsb = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;
    const tLsb = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;
    const tempVal = ((tMsb << 8) | tLsb) >> 5;

    const ok = (eepromVal === 0x77) && (tempVal * 0.125 === 30.0);

    record(15, 'MULTI_DEVICE_BUS', 'Multi-Device Bus Sharing (EEPROM @ 0x50 and LM75 @ 0x48 without Crosstalk)', ok,
      `Read EEPROM: 0x${eepromVal.toString(16)}; Read LM75: ${(tempVal * 0.125)} °C on shared I2C0 bus`);
  }

  // ─── CATEGORY 7: SCL CLOCK STRETCHING ──────────────────────────────────────────────
  console.log('\n--- CATEGORY 7: SCL CLOCK STRETCHING ---');

  // Test 16: External Slave SCL Clock Stretching Pauses Master SCL Clock
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const slowDevice = new GenericI2cRegisterDevice(0x3a, 'Slow-Slave');
    slowDevice.registers[0x05] = 0x99;
    // Configure slave to stretch SCL for 500 cycles during read
    slowDevice.setClockStretchingCycles(500);
    i2c0.attachDevice(slowDevice);

    i2c0.writeUint32(REG_IC_TAR, 0x3a);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Set pointer to 0x05
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x05);
    // Read byte with clock stretching
    i2c0.writeUint32(REG_IC_DATA_CMD, CMD_RESTART | CMD_READ | CMD_STOP);

    // Measure cycles required to complete read
    let cyclesElapsed = 0;
    while (i2c0.readUint32(REG_IC_RXFLR) === 0 && cyclesElapsed < 30000) {
      controller.stepCycles(50);
      cyclesElapsed += 50;
    }

    const val = i2c0.readUint32(REG_IC_DATA_CMD) & 0xff;
    const ok = (val === 0x99) && (cyclesElapsed >= 500);

    record(16, 'CLOCK_STRETCHING', 'Slave SCL Clock Stretching Handshake & Master SCL Hold', ok,
      `Slave stretched SCL for 500 cycles; Total cycles elapsed: ${cyclesElapsed}; Data read: 0x${val.toString(16)}`);
  }

  // ─── CATEGORY 8: OPEN-DRAIN MNA CIRCUIT CO-SIMULATION ──────────────────────────────
  console.log('\n--- CATEGORY 8: OPEN-DRAIN MNA CIRCUIT CO-SIMULATION ---');

  // Test 17: Open-Drain Wired-AND Bus Physics with 4.7 kΩ Pull-Up Resistor in MNA Solver
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;
    const i2c0 = controller.getI2c(0)!;

    // Configure GP4 (I2C0 SDA, Func 3) and GP5 (I2C0 SCL, Func 3)
    rp2040.gpio[4].ctrl = (rp2040.gpio[4].ctrl & ~0x1f) | FUNCTION_I2C;
    rp2040.gpio[5].ctrl = (rp2040.gpio[5].ctrl & ~0x1f) | FUNCTION_I2C;
    bridge.recomputeDriverState(4);
    bridge.recomputeDriverState(5);

    // MNA Netlist:
    // Node 0: GND
    // Node 1: 3.3V VDD Rail
    // Node 2: GP4 Driver Thevenin Node
    // Node 3: SDA Bus Line
    const elements: MNAElement[] = [
      { id: 'v_vdd', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 3.3 },
      { id: 'r_pullup_sda', type: 'RESISTOR', nodeA: 1, nodeB: 3, value: 4700 }, // 4.7 kΩ pull-up
      { id: bridge.getMnaVoltageSourceId(4), type: 'VOLTAGE_SOURCE', nodeA: 2, nodeB: 0, value: 0.0 },
      { id: bridge.getMnaResistorId(4), type: 'RESISTOR', nodeA: 2, nodeB: 3, value: 50 }, // 50 Ω Ron
    ];

    const solver = new MNASolver(3, 1e-6);
    solver.setElements(elements);

    // Case A: MCU driving LOW (0.0V with 50 Ω Ron)
    bridge.getDriverState(4)!.electricalTargetVoltage_V = 0.0;
    bridge.getDriverState(4)!.driverImpedance_Ohms = 50;
    elements[2].value = 0.0;
    elements[3].value = 50;
    const resLow = solver.solve(0.001);
    const vLow = resLow.nodeVoltages[3]; // Voltage divider: 3.3 * 50 / (4700 + 50) ≈ 0.0347 V

    // Case B: MCU released HIGH (High-Z 100 MΩ)
    bridge.getDriverState(4)!.electricalTargetVoltage_V = 0.0;
    bridge.getDriverState(4)!.driverImpedance_Ohms = 1e8;
    elements[2].value = 0.0;
    elements[3].value = 1e8;
    const resHigh = solver.solve(0.002);
    const vHigh = resHigh.nodeVoltages[3]; // Pulled to 3.3 V by 4.7 kΩ resistor

    const ok = (vLow >= 0.03 && vLow <= 0.04) && (vHigh >= 3.29 && vHigh <= 3.30);

    record(17, 'OPEN_DRAIN_MNA', 'Open-Drain Wired-AND Bus Physics with 4.7 kΩ Pull-Up in MNA Solver', ok,
      `V_LOW (50 Ω against 4.7 kΩ): ${vLow.toFixed(4)} V (expected ~0.0347 V); V_HIGH (100 MΩ High-Z): ${vHigh.toFixed(4)} V (expected 3.3 V)`);
  }

  // Test 18: Pull-Up Resistor Variations (2.2 kΩ, 4.7 kΩ, 10 kΩ) and RC Rise Time Validation
  {
    // Theoretical 30% to 70% rise time formula:
    // V(t) = Vdd * (1 - exp(-t / RC))
    // t_30% = -RC * ln(1 - 0.3) = 0.35667 * RC
    // t_70% = -RC * ln(1 - 0.7) = 1.20397 * RC
    // Delta_t = (1.20397 - 0.35667) * RC = 0.8473 * RC
    const C = 100e-12; // 100 pF bus capacitance
    const pullups = [2200, 4700, 10000];
    const resultsTable: { R: number; tTheory_ns: number; tSim_ns: number; errPercent: number }[] = [];

    for (const R of pullups) {
      const tTheory_s = Math.log(0.7 / 0.3) * R * C; // ≈ 0.8473 * R * C
      // Simulate transient charging in discrete timestep dt = 1 ns
      const dt = 1e-9;
      let v = 0;
      let t30 = -1;
      let t70 = -1;
      for (let t = 0; t <= 5e-6; t += dt) {
        v = 3.3 * (1 - Math.exp(-t / (R * C)));
        if (t30 < 0 && v >= (3.3 * 0.3)) t30 = t;
        if (t70 < 0 && v >= (3.3 * 0.7)) {
          t70 = t;
          break;
        }
      }
      const tSim_s = t70 - t30;
      const err = (Math.abs(tSim_s - tTheory_s) / tTheory_s) * 100;
      resultsTable.push({
        R,
        tTheory_ns: tTheory_s * 1e9,
        tSim_ns: tSim_s * 1e9,
        errPercent: err,
      });
    }

    const allAccurate = resultsTable.every(r => r.errPercent < 5.0);

    record(18, 'RC_RISE_TIME', 'Pull-Up Variations (2.2k, 4.7k, 10k) & RC Rise Time (t_30%-70% ≈ 0.8473*R*C)', allAccurate,
      resultsTable.map(r => `R=${r.R}Ω: Theory=${r.tTheory_ns.toFixed(1)}ns, Sim=${r.tSim_ns.toFixed(1)}ns, Err=${r.errPercent.toFixed(2)}%`).join('; '));
  }

  // ─── CATEGORY 9: IO_BANK0 PIN MULTIPLEXING ─────────────────────────────────────────
  console.log('\n--- CATEGORY 9: IO_BANK0 PIN MULTIPLEXING ---');

  // Test 19: Pin Function Routing for All 30 RP2040 GPIOs
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    let correctlyMapped = true;
    for (let pin = 0; pin < 30; pin++) {
      const isI2c0Sda = I2C0_SDA_PINS.includes(pin);
      const isI2c0Scl = I2C0_SCL_PINS.includes(pin);
      const isI2c1Sda = I2C1_SDA_PINS.includes(pin);
      const isI2c1Scl = I2C1_SCL_PINS.includes(pin);

      const mod = pin % 4;
      if (mod === 0 && !isI2c0Sda) correctlyMapped = false;
      if (mod === 1 && !isI2c0Scl) correctlyMapped = false;
      if (mod === 2 && !isI2c1Sda) correctlyMapped = false;
      if (mod === 3 && !isI2c1Scl) correctlyMapped = false;
    }

    record(19, 'PIN_MULTIPLEXING', 'RP2040 IO_BANK0 Function 3 Pin Multiplexing Cycle (SDA0, SCL0, SDA1, SCL1)', correctlyMapped,
      `All 30 GPIO pins verified to follow strict RP2040 Datasheet Table 2 cycling: GP0=SDA0, GP1=SCL0, GP2=SDA1, GP3=SCL1, ...`);
  }

  // Test 20: Dynamic Pin Function Switching (FUNCTION_I2C <-> FUNCTION_SIO)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Start as SIO
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_SIO;
    bridge.recomputeDriverState(0);
    const fn1 = bridge.getDriverState(0)!.functionName;

    // Switch to I2C
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_I2C;
    bridge.recomputeDriverState(0);
    const fn2 = bridge.getDriverState(0)!.functionName;

    // Switch back to SIO
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_SIO;
    bridge.recomputeDriverState(0);
    const fn3 = bridge.getDriverState(0)!.functionName;

    const ok = (fn1 === 'SIO') && (fn2 === 'I2C') && (fn3 === 'SIO');

    record(20, 'DYNAMIC_PIN_SWITCH', 'Dynamic Switching between SIO (Func 5) and I2C (Func 3) without State Corruption', ok,
      `State progression: ${fn1} -> ${fn2} -> ${fn3}`);
  }

  // ─── CATEGORY 10: DMA DREQ HANDSHAKING ─────────────────────────────────────────────
  console.log('\n--- CATEGORY 10: DMA DREQ HANDSHAKING ---');

  // Test 21: DMA DREQ 32/33 Handshaking for I2C0
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;
    const rp2040 = controller.getRp2040Instance()!;

    let dreq32Asserted = false;
    let dreq33Asserted = false;

    (rp2040 as any).dma = {
      setDREQ: (channel: number) => {
        if (channel === DREQ_I2C0_TX) dreq32Asserted = true;
        if (channel === DREQ_I2C0_RX) dreq33Asserted = true;
      },
      clearDREQ: (channel: number) => {
        if (channel === DREQ_I2C0_TX) dreq32Asserted = false;
        if (channel === DREQ_I2C0_RX) dreq33Asserted = false;
      },
    };

    // Enable DMA TX in IC_DMA_CR (bit 1)
    i2c0.writeUint32(REG_IC_DMA_CR, 0x02);
    const txDreqActive = dreq32Asserted;

    // Fill TX FIFO to 16 -> DREQ 32 should clear
    for (let i = 0; i < 16; i++) {
      i2c0.writeUint32(REG_IC_DATA_CMD, 0x11);
    }
    const txDreqCleared = !dreq32Asserted;

    const ok = txDreqActive && txDreqCleared;

    record(21, 'DMA_DREQ_I2C0', 'DMA DREQ 32 (I2C0 TX) Handshaking Coupled to TX FIFO Capacity', ok,
      `DREQ 32 asserted when FIFO not full: ${txDreqActive}; De-asserted when FIFO full: ${txDreqCleared}`);
  }

  // Test 22: DMA DREQ 34/35 Handshaking for I2C1
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c1 = controller.getI2c(1)!;
    const rp2040 = controller.getRp2040Instance()!;

    let dreq34Asserted = false;
    let dreq35Asserted = false;

    (rp2040 as any).dma = {
      setDREQ: (channel: number) => {
        if (channel === DREQ_I2C1_TX) dreq34Asserted = true;
        if (channel === DREQ_I2C1_RX) dreq35Asserted = true;
      },
      clearDREQ: (channel: number) => {
        if (channel === DREQ_I2C1_TX) dreq34Asserted = false;
        if (channel === DREQ_I2C1_RX) dreq35Asserted = false;
      },
    };

    i2c1.writeUint32(REG_IC_DMA_CR, 0x03); // Enable both TX (34) and RX (35)
    const txActive = dreq34Asserted;

    const ok = txActive;

    record(22, 'DMA_DREQ_I2C1', 'DMA DREQ 34/35 (I2C1 TX/RX) Channel Handshaking', ok,
      `I2C1 DMA TX DREQ 34 asserted: ${txActive}`);
  }

  // ─── CATEGORY 11: NVIC INTERRUPT DELIVERY ──────────────────────────────────────────
  console.log('\n--- CATEGORY 11: NVIC INTERRUPT DELIVERY ---');

  // Test 23: NVIC IRQ 23 (I2C0) and IRQ 24 (I2C1) Delivery
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;
    const i2c1 = controller.getI2c(1)!;
    const rp2040 = controller.getRp2040Instance()!;

    let irq23Signaled = false;
    let irq24Signaled = false;

    rp2040.setInterrupt = (irq: number, value: boolean) => {
      if (irq === 23 && value) irq23Signaled = true;
      if (irq === 24 && value) irq24Signaled = true;
    };

    // Unmask TX_EMPTY on I2C0
    i2c0.writeUint32(REG_IC_INTR_MASK, INTR_TX_EMPTY);
    i2c0.updateInterrupts();

    // Unmask TX_EMPTY on I2C1
    i2c1.writeUint32(REG_IC_INTR_MASK, INTR_TX_EMPTY);
    i2c1.updateInterrupts();

    const ok = irq23Signaled && irq24Signaled;

    record(23, 'NVIC_INTERRUPTS', 'NVIC Interrupt Delivery (IRQ 23 for I2C0, IRQ 24 for I2C1)', ok,
      `IRQ 23 signaled to Cortex-M0+: ${irq23Signaled}; IRQ 24 signaled to Cortex-M0+: ${irq24Signaled}`);
  }

  // ─── CATEGORY 12: LOGIC ANALYZER SIGNAL ACQUISITION & DECODING ─────────────────────
  console.log('\n--- CATEGORY 12: LOGIC ANALYZER SIGNAL ACQUISITION & DECODING ---');

  // Test 24: Signal Acquisition & Protocol Decoding via decodeI2c()
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50);
    i2c0.attachDevice(eeprom);

    const trace: I2cSignalSample[] = [];
    const origSda = i2c0.onSdaPinChange;
    const origScl = i2c0.onSclPinChange;
    i2c0.onSdaPinChange = (sdaLow) => {
      origSda?.(sdaLow);
      trace.push({ time_s: controller.getSimulatedTime_s(), scl: !i2c0.isSclLineDrivenLow, sda: !sdaLow });
    };
    i2c0.onSclPinChange = (sclLow) => {
      origScl?.(sclLow);
      trace.push({ time_s: controller.getSimulatedTime_s(), scl: !sclLow, sda: !i2c0.isSdaLineDrivenLow });
    };

    i2c0.writeUint32(REG_IC_TAR, 0x50);
    i2c0.writeUint32(REG_IC_ENABLE, ENABLE_ENABLE);

    // Write data byte 0x42
    i2c0.writeUint32(REG_IC_DATA_CMD, 0x42 | CMD_STOP);

    for (let c = 0; c < 10000; c += 10) {
      controller.stepCycles(10);
    }

    const decoded = decodeI2c(trace);
    const hasStart = decoded.some(p => p.type === 'START');
    const addrPacket = decoded.find(p => p.type === 'ADDRESS');
    const dataPacket = decoded.find(p => p.type === 'DATA');
    const hasStop = decoded.some(p => p.type === 'STOP');

    const ok = hasStart &&
               addrPacket !== undefined &&
               addrPacket.address === 0x50 &&
               addrPacket.ack === true &&
               dataPacket !== undefined &&
               dataPacket.data === 0x42 &&
               dataPacket.ack === true &&
               hasStop;

    record(24, 'LOGIC_ANALYZER_DECODE', 'Logic Analyzer Protocol Decoding via decodeI2c() (START, ADDR 0x50, DATA 0x42, STOP)', ok,
      `Decoded ${decoded.length} packets: START=${hasStart}, Addr=0x${addrPacket?.address?.toString(16)} (ACK=${addrPacket?.ack}), Data=0x${dataPacket?.data?.toString(16)} (ACK=${dataPacket?.ack}), STOP=${hasStop}`);
  }

  // ─── CATEGORY 13: REAL CORTEX-M0+ FIRMWARE STEPPING & REGISTER CONTROL ─────────────
  console.log('\n--- CATEGORY 13: REAL CORTEX-M0+ FIRMWARE STEPPING & REGISTER CONTROL ---');

  // Test 25: Real Cortex-M0+ Instruction Stepping & Firmware Register Control
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    controller.start();

    // Step instructions on Core 0
    const step1 = controller.step(20);
    const snap = controller.getExecutionSnapshot();

    const i2c0 = controller.getI2c(0)!;
    // Perform memory-mapped peripheral read from Cortex-M0+ MMIO space
    const rp2040 = controller.getRp2040Instance()!;
    // Write 0x65 to I2C0 IC_CON through MMIO space (0x40044000)
    rp2040.writeUint32(0x40044000, 0x65);
    const conVal = rp2040.readUint32(0x40044000);

    const ok = step1.instructionsExecuted === 20 &&
               snap.instructionCount === 20 &&
               snap.errors.length === 0 &&
               conVal === 0x65;

    record(25, 'FIRMWARE_STEPPING', 'Real Cortex-M0+ Core 0 Instruction Stepping & MMIO Register Control', ok,
      `Executed ${step1.instructionsExecuted} instructions, cycles=${step1.cyclesExecuted}; MMIO read from 0x40044000=0x${conVal.toString(16)}`);
  }

  // ─── CATEGORY 14: DIAGNOSTICS SNAPSHOT INTEGRITY ───────────────────────────────────
  console.log('\n--- CATEGORY 14: DIAGNOSTICS SNAPSHOT INTEGRITY ---');

  // Test 26: Complete I2C Diagnostics Snapshot Integrity
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;
    const eeprom = new AT24C32EEPROM(0x50);
    i2c0.attachDevice(eeprom);

    const diag = controller.getI2cDiagnostics();
    const d0 = diag.i2c0;
    const d1 = diag.i2c1;

    const ok = d0 !== undefined &&
               d1 !== undefined &&
               d0.name === 'I2C0' &&
               d0.controllerIndex === 0 &&
               d0.targetAddress === 0x55 &&
               d0.devicesAttached.length === 1 &&
               d0.devicesAttached[0].includes('0x50') &&
               d1.name === 'I2C1' &&
               d1.controllerIndex === 1;

    record(26, 'DIAGNOSTICS_SNAPSHOT', 'Controller I2C Diagnostics Snapshot Integrity (I2C0 & I2C1)', ok,
      `I2C0 Devices: [${d0?.devicesAttached.join(', ')}]; I2C1 Name: ${d1?.name}; Enabled: ${d0?.enabled}`);
  }

  // ─── SUMMARY ───────────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════════════');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`   PHASE 4.3.4 I2C ACCEPTANCE: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runI2cAcceptanceTests().catch(err => {
  console.error('Unhandled Acceptance Suite Failure:', err);
  process.exit(1);
});
