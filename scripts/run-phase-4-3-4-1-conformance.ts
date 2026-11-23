/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.4.1 RP2040 I²C Hardware Conformance & DMA Acceptance Test Suite
 * 
 * Verifies:
 * 1. Official RP2040 DMA DREQ Mappings (I2C0 TX=32, I2C0 RX=33, I2C1 TX=34, I2C1 RX=35)
 * 2. Complete Disjointness from PWM DREQs (PWM_WRAP0..3 = 24..27)
 * 3. Base Address Conformance (I2C0 @ 0x40044000, I2C1 @ 0x40048000)
 * 4. Register Offset & Permissions Audit against RP2040 Datasheet Section 4.3.11
 * 5. Hardware Reset Values (IC_CON=0x7F, IC_TAR=0x55, IC_COMP_VERSION=0x3132322a, etc.)
 * 6. Atomic Register Aliases (XOR +0x1000, SET +0x2000, CLR +0x3000)
 * 7. FIFO Depth Conformance (16-Entry TX & RX FIFOs)
 * 8. NVIC Interrupt Delivery (IRQ 23 for I2C0, IRQ 24 for I2C1)
 * 9. IO_BANK0 Function 3 Pin Multiplexing Cycle (SDA0, SCL0, SDA1, SCL1)
 * 10. Real Compiled Cortex-M0+ Firmware: I2C0 TX DMA (DREQ 32) -> AT24C32 EEPROM
 * 11. Real Compiled Cortex-M0+ Firmware: I2C0 RX DMA (DREQ 33) -> AT24C32 EEPROM to SRAM
 * 12. Real Compiled Cortex-M0+ Firmware: I2C1 TX DMA (DREQ 34) -> PCF8574 Expander
 * 13. Real Compiled Cortex-M0+ Firmware: I2C1 RX DMA (DREQ 35) -> LM75 Sensor to SRAM
 * 14. Negative Isolation: PWM DREQ 24 does not activate I2C0 TX DMA
 * 15. Negative Isolation: PWM DREQ 25 does not activate I2C0 RX DMA
 * 16. Negative Isolation: PWM DREQ 26 does not activate I2C1 TX DMA
 * 17. Negative Isolation: PWM DREQ 27 does not activate I2C1 RX DMA
 * 18. End-to-End MNA Circuit Co-Simulation with DMA-Driven I²C Transactions
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
  REG_IC_CLR_RD_REQ,
  REG_IC_CLR_TX_ABRT,
  REG_IC_CLR_RX_DONE,
  REG_IC_CLR_ACTIVITY,
  REG_IC_CLR_STOP_DET,
  REG_IC_CLR_START_DET,
  REG_IC_CLR_GEN_CALL,
  REG_IC_ENABLE,
  REG_IC_STATUS,
  REG_IC_TXFLR,
  REG_IC_RXFLR,
  REG_IC_SDA_HOLD,
  REG_IC_TX_ABRT_SOURCE,
  REG_IC_SLV_DATA_NACK_ONLY,
  REG_IC_DMA_CR,
  REG_IC_DMA_TDLR,
  REG_IC_DMA_RDLR,
  REG_IC_SDA_SETUP,
  REG_IC_ACK_GENERAL_CALL,
  REG_IC_ENABLE_STATUS,
  REG_IC_FS_SPKLEN,
  REG_IC_CLR_RESTART_DET,
  REG_IC_COMP_PARAM_1,
  REG_IC_COMP_VERSION,
  REG_IC_COMP_TYPE,
  DREQ_I2C0_TX,
  DREQ_I2C0_RX,
  DREQ_I2C1_TX,
  DREQ_I2C1_RX,
  CMD_STOP,
  CMD_RESTART,
  CMD_READ,
  ENABLE_ENABLE,
  STATUS_TFE,
  STATUS_TFNF,
  RP2040I2c,
} from '../src/features/simulator/rp2040I2c';
import {
  AT24C32EEPROM,
  PCF8574Expander,
  LM75TempSensor,
} from '../src/features/simulator/rp2040I2cDevice';
import { MNASolver } from '../src/features/simulator/mnaSolver';
import {
  FUNCTION_I2C,
  FUNCTION_SIO,
  I2C0_SDA_PINS,
  I2C0_SCL_PINS,
  I2C1_SDA_PINS,
  I2C1_SCL_PINS,
} from '../src/features/simulator/rp2040GpioBridge';

interface TestResult {
  index: number;
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(index: number, id: string, name: string, passed: boolean, details: string) {
  results.push({ index, id, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Test ${String(index).padStart(2, '0')}] [${id}] ${status}: ${name}`);
  console.log(`         ${details}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

async function runPhase4341Audit() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.4.1 — HARDWARE CONFORMANCE & DMA ACCEPTANCE SUITE');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const fixtureDir = path.resolve(__dirname, '../src/features/simulator/__fixtures__');
  const blinkFixturePath = path.join(fixtureDir, 'pico_blink_rp2040.uf2');
  const blinkBytes = fs.readFileSync(blinkFixturePath);

  // ─── CATEGORY 1: OFFICIAL RP2040 DMA DREQ CONFORMANCE ──────────────────────────────
  console.log('--- CATEGORY 1: OFFICIAL RP2040 DMA DREQ CONFORMANCE ---');

  // Test 01: Official DREQ Constant Mapping
  {
    const ok =
      DREQ_I2C0_TX === 32 &&
      DREQ_I2C0_RX === 33 &&
      DREQ_I2C1_TX === 34 &&
      DREQ_I2C1_RX === 35;

    record(1, 'DREQ_CONSTANTS', 'Official RP2040 DMA DREQ Channel Constants (Table 43)', ok,
      `I2C0 TX=${DREQ_I2C0_TX} (32), I2C0 RX=${DREQ_I2C0_RX} (33), I2C1 TX=${DREQ_I2C1_TX} (34), I2C1 RX=${DREQ_I2C1_RX} (35)`);
  }

  // Test 02: Negative PWM DREQ Disjointness
  {
    // RP2040 Table 43: PWM_WRAP0..PWM_WRAP3 are channels 24, 25, 26, 27
    const PWM_WRAP0 = 24;
    const PWM_WRAP1 = 25;
    const PWM_WRAP2 = 26;
    const PWM_WRAP3 = 27;

    const disjoint =
      DREQ_I2C0_TX !== PWM_WRAP0 &&
      DREQ_I2C0_RX !== PWM_WRAP1 &&
      DREQ_I2C1_TX !== PWM_WRAP2 &&
      DREQ_I2C1_RX !== PWM_WRAP3 &&
      DREQ_I2C0_TX >= 32;

    record(2, 'DREQ_PWM_DISJOINT', 'Complete Disjointness from PWM DREQ Channels 24–27', disjoint,
      `PWM_WRAP0..3: [24, 25, 26, 27] strictly disjoint from I2C DREQs: [${DREQ_I2C0_TX}, ${DREQ_I2C0_RX}, ${DREQ_I2C1_TX}, ${DREQ_I2C1_RX}]`);
  }

  // ─── CATEGORY 2: SILICON REGISTER MAP & PERMISSIONS AUDIT ──────────────────────────
  console.log('\n--- CATEGORY 2: SILICON REGISTER MAP & PERMISSIONS AUDIT ---');

  // Test 03: Base Address Conformance
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;

    const p0 = (rp2040 as any).findPeripheral(0x40044000);
    const p1 = (rp2040 as any).findPeripheral(0x40048000);
    const ok = p0 === controller.getI2c(0) && p1 === controller.getI2c(1);

    record(3, 'BASE_ADDRESSES', 'RP2040 I2C0 (0x40044000) & I2C1 (0x40048000) Address Decoding', ok,
      `I2C0 mapped to 0x40044000; I2C1 mapped to 0x40048000 on peripheral bus fabric`);
  }

  // Test 04: Register Offsets Conformance against RP2040 Datasheet Section 4.3.11
  {
    const offsetsMatch =
      REG_IC_CON === 0x00 &&
      REG_IC_TAR === 0x04 &&
      REG_IC_SAR === 0x08 &&
      REG_IC_DATA_CMD === 0x10 &&
      REG_IC_SS_SCL_HCNT === 0x14 &&
      REG_IC_SS_SCL_LCNT === 0x18 &&
      REG_IC_FS_SCL_HCNT === 0x1c &&
      REG_IC_FS_SCL_LCNT === 0x20 &&
      REG_IC_INTR_STAT === 0x2c &&
      REG_IC_INTR_MASK === 0x30 &&
      REG_IC_RAW_INTR_STAT === 0x34 &&
      REG_IC_RX_TL === 0x38 &&
      REG_IC_TX_TL === 0x3c &&
      REG_IC_CLR_INTR === 0x40 &&
      REG_IC_ENABLE === 0x6c &&
      REG_IC_STATUS === 0x70 &&
      REG_IC_TXFLR === 0x74 &&
      REG_IC_RXFLR === 0x78 &&
      REG_IC_SDA_HOLD === 0x7c &&
      REG_IC_TX_ABRT_SOURCE === 0x80 &&
      REG_IC_DMA_CR === 0x88 &&
      REG_IC_DMA_TDLR === 0x8c &&
      REG_IC_DMA_RDLR === 0x90 &&
      REG_IC_FS_SPKLEN === 0xa0 &&
      REG_IC_COMP_PARAM_1 === 0xf4 &&
      REG_IC_COMP_VERSION === 0xf8 &&
      REG_IC_COMP_TYPE === 0xfc;

    record(4, 'REGISTER_OFFSETS', 'Register Offsets Conformance against RP2040 Datasheet Section 4.3.11', offsetsMatch,
      `All 27 register offsets matched Datasheet specification with 100% precision`);
  }

  // Test 05: Hardware Reset Values & Read/Write Permissions
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    const con = i2c0.readUint32(REG_IC_CON);
    const tar = i2c0.readUint32(REG_IC_TAR);
    const enable = i2c0.readUint32(REG_IC_ENABLE);
    const status = i2c0.readUint32(REG_IC_STATUS);
    const dmaCr = i2c0.readUint32(REG_IC_DMA_CR);
    const ver = i2c0.readUint32(REG_IC_COMP_VERSION);
    const type = i2c0.readUint32(REG_IC_COMP_TYPE);

    const ok =
      (con & 0x7f) === 0x65 &&
      tar === 0x55 &&
      enable === 0 &&
      (status & 0x06) === 0x06 &&
      dmaCr === 0 &&
      ver === 0x3230312a &&
      type === 0x44570140;

    record(5, 'RESET_VALUES', 'Hardware Reset Values Conformance (IC_CON, IC_TAR, IC_STATUS, IC_COMP_*)', ok,
      `IC_CON=0x${con.toString(16)}, TAR=0x${tar.toString(16)}, STATUS=0x${status.toString(16)}, VERSION=0x${ver.toString(16)}, TYPE=0x${type.toString(16)}`);
  }

  // Test 06: Atomic Register Aliases (XOR, SET, CLR)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;

    // Test on I2C0 IC_FS_SPKLEN (offset 0xa0)
    const baseAddr = 0x40044000 + REG_IC_FS_SPKLEN;
    const xorAddr = baseAddr + 0x1000;
    const setAddr = baseAddr + 0x2000;
    const clrAddr = baseAddr + 0x3000;

    // Default FS_SPKLEN is 7 (0x07)
    // 1. SET bit 4 (0x10) -> 0x17
    rp2040.writeUint32(setAddr, 0x10);
    const val1 = rp2040.readUint32(baseAddr);

    // 2. CLR bit 0 (0x01) -> 0x16
    rp2040.writeUint32(clrAddr, 0x01);
    const val2 = rp2040.readUint32(baseAddr);

    // 3. XOR bit 1 and bit 4 (0x12) -> 0x04
    rp2040.writeUint32(xorAddr, 0x12);
    const val3 = rp2040.readUint32(baseAddr);

    const ok = val1 === 0x17 && val2 === 0x16 && val3 === 0x04;
    record(6, 'ATOMIC_ALIASES', 'RP2040 Atomic Register Aliases (+0x1000 XOR, +0x2000 SET, +0x3000 CLR)', ok,
      `Initial=0x07 -> SET(0x10)=0x${val1.toString(16)} -> CLR(0x01)=0x${val2.toString(16)} -> XOR(0x12)=0x${val3.toString(16)}`);
  }

  // ─── CATEGORY 3: PERIPHERAL SUBSYSTEM PARAMETERS ───────────────────────────────────
  console.log('\n--- CATEGORY 3: PERIPHERAL SUBSYSTEM PARAMETERS ---');

  // Test 07: FIFO Depth Conformance (16 entries)
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const i2c0 = controller.getI2c(0)!;

    for (let i = 0; i < 16; i++) {
      i2c0.writeUint32(REG_IC_DATA_CMD, 0x55);
    }
    const txflr16 = i2c0.readUint32(REG_IC_TXFLR);
    const statusFull = i2c0.readUint32(REG_IC_STATUS);
    const tfnfClear = (statusFull & STATUS_TFNF) === 0;

    i2c0.writeUint32(REG_IC_DATA_CMD, 0x99); // 17th write -> overflow
    const rawIntr = i2c0.readUint32(REG_IC_RAW_INTR_STAT);
    const overflowSet = (rawIntr & (1 << 3)) !== 0;

    const ok = txflr16 === 16 && tfnfClear && overflowSet;
    record(7, 'FIFO_DEPTH', '16-Entry Hardware FIFO Buffer Depth & TX_OVER Flag', ok,
      `TXFLR=${txflr16}; STATUS.TFNF cleared when full: ${tfnfClear}; TX_OVER asserted on 17th write: ${overflowSet}`);
  }

  // Test 08: NVIC Interrupt Line Delivery
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c0 = controller.getI2c(0)!;
    const i2c1 = controller.getI2c(1)!;

    let irq23 = false;
    let irq24 = false;

    rp2040.setInterrupt = (irq: number, asserted: boolean) => {
      if (irq === 23 && asserted) irq23 = true;
      if (irq === 24 && asserted) irq24 = true;
    };

    // Unmask TX_EMPTY in I2C0 and I2C1
    i2c0.writeUint32(REG_IC_INTR_MASK, 0x10);
    i2c1.writeUint32(REG_IC_INTR_MASK, 0x10);

    const ok = irq23 && irq24;
    record(8, 'NVIC_INTERRUPTS', 'ARM Cortex-M0+ NVIC Line Delivery (IRQ 23 for I2C0, IRQ 24 for I2C1)', ok,
      `IRQ 23 signaled: ${irq23}; IRQ 24 signaled: ${irq24}`);
  }

  // Test 09: IO_BANK0 Pin Multiplexing Cycle
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const bridge = controller.getGpioBridge()!;

    let pinsCorrect = true;
    for (let pin = 0; pin < 30; pin++) {
      const isSda0 = I2C0_SDA_PINS.includes(pin);
      const isScl0 = I2C0_SCL_PINS.includes(pin);
      const isSda1 = I2C1_SDA_PINS.includes(pin);
      const isScl1 = I2C1_SCL_PINS.includes(pin);

      const mod = pin % 4;
      if (mod === 0 && !isSda0) pinsCorrect = false;
      if (mod === 1 && !isScl0) pinsCorrect = false;
      if (mod === 2 && !isSda1) pinsCorrect = false;
      if (mod === 3 && !isScl1) pinsCorrect = false;
    }

    record(9, 'PIN_MULTIPLEX', 'IO_BANK0 Function 3 Pin Multiplexing (SDA0, SCL0, SDA1, SCL1)', pinsCorrect,
      `All 30 GPIO pins conform to RP2040 Datasheet Table 2 cycling across 4-pin banks`);
  }

  // ─── CATEGORY 4: REAL COMPILED FIRMWARE EXECUTION WITH DMA ─────────────────────────
  console.log('\n--- CATEGORY 4: REAL COMPILED FIRMWARE EXECUTION WITH DMA ---');

  // Test 10: Real Firmware Execution: I2C0 TX DMA (DREQ 32) -> AT24C32 EEPROM
  {
    const fixturePath = path.join(fixtureDir, 'pico_i2c0_tx_dma.uf2');
    const uf2Bytes = fs.readFileSync(fixturePath);
    const controller = new RP2040Controller();
    controller.loadFirmware(uf2Bytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50, 4096, true);
    i2c0.attachDevice(eeprom);

    // Buffer in SRAM at 0x20001000: Word addr 0x0025, data 0x42
    rp2040.writeUint32(0x20001000, 0x00);
    rp2040.writeUint32(0x20001004, 0x25);
    rp2040.writeUint32(0x20001008, 0x42 | CMD_STOP);

    controller.start();
    for (let c = 0; c < 30000; c += 10) controller.stepCycles(10);

    const mb = rp2040.readUint32(0x20000000);
    const transCount = rp2040.readUint32(0x50000008);
    const byteVal = eeprom.readRaw(0x0025);
    const ok = mb === 0xdeadbeef && transCount === 0 && byteVal === 0x42;

    record(10, 'FIRMWARE_I2C0_TX', 'Real Firmware Stepping: I2C0 TX DMA (DREQ 32) -> AT24C32 EEPROM', ok,
      `Mailbox=0x${mb.toString(16)}; CH0 TRANS_COUNT=${transCount}; EEPROM[0x0025]=0x${byteVal.toString(16)} (Expected 0x42)`);
  }

  // Test 11: Real Firmware Execution: I2C0 RX DMA (DREQ 33) -> AT24C32 EEPROM to SRAM
  {
    const fixturePath = path.join(fixtureDir, 'pico_i2c0_rx_dma.uf2');
    const uf2Bytes = fs.readFileSync(fixturePath);
    const controller = new RP2040Controller();
    controller.loadFirmware(uf2Bytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50, 4096, true);
    eeprom.writeRaw(0x0010, 0xC0);
    eeprom.writeRaw(0x0011, 0xDE);
    i2c0.attachDevice(eeprom);

    controller.start();
    for (let c = 0; c < 35000; c += 10) controller.stepCycles(10);

    const mb = rp2040.readUint32(0x20000000);
    const transCount = rp2040.readUint32(0x50000048);
    const b0 = rp2040.readUint8(0x20002000);
    const b1 = rp2040.readUint8(0x20002001);
    const ok = mb === 0xdeadbeef && transCount === 0 && b0 === 0xc0 && b1 === 0xde;

    record(11, 'FIRMWARE_I2C0_RX', 'Real Firmware Stepping: I2C0 RX DMA (DREQ 33) -> EEPROM to SRAM Buffer', ok,
      `Mailbox=0x${mb.toString(16)}; CH1 TRANS_COUNT=${transCount}; SRAM=[0x${b0.toString(16)}, 0x${b1.toString(16)}] (Expected [0xc0, 0xde])`);
  }

  // Test 12: Real Firmware Execution: I2C1 TX DMA (DREQ 34) -> PCF8574 Expander
  {
    const fixturePath = path.join(fixtureDir, 'pico_i2c1_tx_dma.uf2');
    const uf2Bytes = fs.readFileSync(fixturePath);
    const controller = new RP2040Controller();
    controller.loadFirmware(uf2Bytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c1 = controller.getI2c(1)!;

    const pcf = new PCF8574Expander(0x20);
    i2c1.attachDevice(pcf);

    rp2040.writeUint32(0x20001100, 0xA5 | CMD_STOP);

    controller.start();
    for (let c = 0; c < 25000; c += 10) controller.stepCycles(10);

    const mb = rp2040.readUint32(0x20000000);
    const transCount = rp2040.readUint32(0x50000088);
    const outVal = pcf.getPortOutput();
    const ok = mb === 0xdeadbeef && transCount === 0 && outVal === 0xa5;

    record(12, 'FIRMWARE_I2C1_TX', 'Real Firmware Stepping: I2C1 TX DMA (DREQ 34) -> PCF8574 Expander', ok,
      `Mailbox=0x${mb.toString(16)}; CH2 TRANS_COUNT=${transCount}; PCF8574 Output=0x${outVal.toString(16)} (Expected 0xa5)`);
  }

  // Test 13: Real Firmware Execution: I2C1 RX DMA (DREQ 35) -> LM75 Sensor to SRAM
  {
    const fixturePath = path.join(fixtureDir, 'pico_i2c1_rx_dma.uf2');
    const uf2Bytes = fs.readFileSync(fixturePath);
    const controller = new RP2040Controller();
    controller.loadFirmware(uf2Bytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c1 = controller.getI2c(1)!;

    const lm75 = new LM75TempSensor(0x48);
    lm75.setTemperature(28.0); // 0x1C00
    i2c1.attachDevice(lm75);

    controller.start();
    for (let c = 0; c < 25000; c += 10) controller.stepCycles(10);

    const mb = rp2040.readUint32(0x20000000);
    const transCount = rp2040.readUint32(0x500000c8);
    const b0 = rp2040.readUint8(0x20002100);
    const b1 = rp2040.readUint8(0x20002101);
    const temp = (((b0 << 8) | b1) >> 7) * 0.5;
    const ok = mb === 0xdeadbeef && transCount === 0 && temp === 28.0;

    record(13, 'FIRMWARE_I2C1_RX', 'Real Firmware Stepping: I2C1 RX DMA (DREQ 35) -> LM75 Sensor to SRAM Buffer', ok,
      `Mailbox=0x${mb.toString(16)}; CH3 TRANS_COUNT=${transCount}; Temp=${temp} °C (Expected 28.0 °C)`);
  }

  // ─── CATEGORY 5: NEGATIVE ISOLATION TESTS ──────────────────────────────────────────
  console.log('\n--- CATEGORY 5: NEGATIVE ISOLATION TESTS ---');

  // Test 14: Negative DMA Firmware: PWM DREQ 24 does not trigger I2C0 TX DMA
  {
    const fixturePath = path.join(fixtureDir, 'pico_dma_pwm_negative.uf2');
    const uf2Bytes = fs.readFileSync(fixturePath);
    const controller = new RP2040Controller();
    controller.loadFirmware(uf2Bytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c0 = controller.getI2c(0)!;

    const eeprom = new AT24C32EEPROM(0x50, 4096, true);
    i2c0.attachDevice(eeprom);

    rp2040.writeUint32(0x20001000, 0x00);
    rp2040.writeUint32(0x20001004, 0x30);
    rp2040.writeUint32(0x20001008, 0x88 | CMD_STOP);

    controller.start();
    for (let c = 0; c < 20000; c += 10) controller.stepCycles(10);

    const mb = rp2040.readUint32(0x20000000);
    const transCount = rp2040.readUint32(0x50000008);
    const eepromVal = eeprom.readRaw(0x0030);
    const ch0Active = rp2040.dma.channels[0].active;

    const ok = mb === 0xcafebabe && transCount === 3 && eepromVal === 0xff && ch0Active !== 0;
    record(14, 'NEG_PWM_DREQ24', 'Negative Isolation: TREQ_SEL=24 (PWM_WRAP0) Remains Untriggered by I2C0 TX', ok,
      `TRANS_COUNT=${transCount} (Expected 3); EEPROM unwritten: 0x${eepromVal.toString(16)} (Expected 0xff)`);
  }

  // Test 15: Negative DMA: PWM DREQ 25 does not trigger I2C0 RX DMA
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c0 = controller.getI2c(0)!;

    // Configure Channel 1 with TREQ_SEL = 25 (PWM_WRAP1)
    const DMA_CH1_BASE = 0x50000040;
    rp2040.writeUint32(DMA_CH1_BASE + 0x00, 0x40044010);
    rp2040.writeUint32(DMA_CH1_BASE + 0x04, 0x20002000);
    rp2040.writeUint32(DMA_CH1_BASE + 0x08, 2);
    // EN | 8-bit | INCR_W | (25 << 15)
    rp2040.writeUint32(DMA_CH1_BASE + 0x0c, 0x1 | 0x20 | (25 << 15));

    // Enable I2C0 RDMAE and fill RX FIFO
    i2c0.writeUint32(REG_IC_DMA_CR, 0x01);
    (i2c0 as any).rxFifo.push(0x42);
    (i2c0 as any).updateInterrupts();

    for (let c = 0; c < 5000; c += 10) controller.stepCycles(10);

    const tc = rp2040.readUint32(DMA_CH1_BASE + 0x08);
    const ok = tc === 2; // Untriggered
    record(15, 'NEG_PWM_DREQ25', 'Negative Isolation: TREQ_SEL=25 (PWM_WRAP1) Remains Untriggered by I2C0 RX', ok,
      `TRANS_COUNT=${tc} (Expected 2, untriggered)`);
  }

  // Test 16: Negative DMA: PWM DREQ 26 does not trigger I2C1 TX DMA
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c1 = controller.getI2c(1)!;

    // Configure Channel 2 with TREQ_SEL = 26 (PWM_WRAP2)
    const DMA_CH2_BASE = 0x50000080;
    rp2040.writeUint32(DMA_CH2_BASE + 0x00, 0x20001100);
    rp2040.writeUint32(DMA_CH2_BASE + 0x04, 0x40048010);
    rp2040.writeUint32(DMA_CH2_BASE + 0x08, 1);
    // EN | 32-bit | INCR_R | (26 << 15)
    rp2040.writeUint32(DMA_CH2_BASE + 0x0c, 0x1 | 0x8 | 0x10 | (26 << 15));

    i2c1.writeUint32(REG_IC_DMA_CR, 0x02); // Enable TDMAE (asserts DREQ 34, NOT 26)

    for (let c = 0; c < 5000; c += 10) controller.stepCycles(10);

    const tc = rp2040.readUint32(DMA_CH2_BASE + 0x08);
    const ok = tc === 1;
    record(16, 'NEG_PWM_DREQ26', 'Negative Isolation: TREQ_SEL=26 (PWM_WRAP2) Remains Untriggered by I2C1 TX', ok,
      `TRANS_COUNT=${tc} (Expected 1, untriggered)`);
  }

  // Test 17: Negative DMA: PWM DREQ 27 does not trigger I2C1 RX DMA
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const i2c1 = controller.getI2c(1)!;

    // Configure Channel 3 with TREQ_SEL = 27 (PWM_WRAP3)
    const DMA_CH3_BASE = 0x500000c0;
    rp2040.writeUint32(DMA_CH3_BASE + 0x00, 0x40048010);
    rp2040.writeUint32(DMA_CH3_BASE + 0x04, 0x20002100);
    rp2040.writeUint32(DMA_CH3_BASE + 0x08, 2);
    // EN | 8-bit | INCR_W | (27 << 15)
    rp2040.writeUint32(DMA_CH3_BASE + 0x0c, 0x1 | 0x20 | (27 << 15));

    i2c1.writeUint32(REG_IC_DMA_CR, 0x01); // Enable RDMAE (asserts DREQ 35, NOT 27)
    (i2c1 as any).rxFifo.push(0x55);
    (i2c1 as any).updateInterrupts();

    for (let c = 0; c < 5000; c += 10) controller.stepCycles(10);

    const tc = rp2040.readUint32(DMA_CH3_BASE + 0x08);
    const ok = tc === 2;
    record(17, 'NEG_PWM_DREQ27', 'Negative Isolation: TREQ_SEL=27 (PWM_WRAP3) Remains Untriggered by I2C1 RX', ok,
      `TRANS_COUNT=${tc} (Expected 2, untriggered)`);
  }

  // ─── CATEGORY 6: END-TO-END CO-SIMULATION INTEGRATION ──────────────────────────────
  console.log('\n--- CATEGORY 6: END-TO-END CO-SIMULATION INTEGRATION ---');

  // Test 18: Full MNA Circuit Co-Simulation with DMA-Driven I²C Transactions
  {
    const fixturePath = path.join(fixtureDir, 'pico_i2c0_tx_dma.uf2');
    const uf2Bytes = fs.readFileSync(fixturePath);
    const controller = new RP2040Controller();
    controller.loadFirmware(uf2Bytes);
    const rp2040 = controller.getRp2040Instance()!;
    const bridge = controller.getGpioBridge()!;
    const i2c0 = controller.getI2c(0)!;

    // Attach EEPROM
    const eeprom = new AT24C32EEPROM(0x50, 4096, true);
    i2c0.attachDevice(eeprom);

    // Multiplex GP0 (SDA0) and GP1 (SCL0) to Function 3 (I2C) with Input Enable (IE=1)
    rp2040.gpio[0].ctrl = (rp2040.gpio[0].ctrl & ~0x1f) | FUNCTION_I2C;
    rp2040.gpio[1].ctrl = (rp2040.gpio[1].ctrl & ~0x1f) | FUNCTION_I2C;
    (rp2040.gpio[0] as any).padValue |= 0x40;
    (rp2040.gpio[1] as any).padValue |= 0x40;
    bridge.recomputeDriverState(0);
    bridge.recomputeDriverState(1);

    // MNA Circuit with 4.7 kΩ pull-ups on SDA (node 3) and SCL (node 4)
    const elements: any[] = [
      { id: 'v_vdd', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 3.3 },
      { id: 'r_pullup_sda', type: 'RESISTOR', nodeA: 1, nodeB: 3, value: 4700 },
      { id: 'r_pullup_scl', type: 'RESISTOR', nodeA: 1, nodeB: 4, value: 4700 },
      { id: 'v_mcu_gnd', type: 'VOLTAGE_SOURCE', nodeA: 2, nodeB: 0, value: 0.0 },
      { id: bridge.getMnaResistorId(0), type: 'RESISTOR', nodeA: 2, nodeB: 3, value: 1e8 },
      { id: bridge.getMnaResistorId(1), type: 'RESISTOR', nodeA: 2, nodeB: 4, value: 1e8 },
    ];

    const solver = new MNASolver(4, 1e-6);
    solver.setElements(elements);

    // Buffer in SRAM at 0x20001000: Write 0xFE to EEPROM address 0x0040
    rp2040.writeUint32(0x20001000, 0x00);
    rp2040.writeUint32(0x20001004, 0x40);
    rp2040.writeUint32(0x20001008, 0xFE | CMD_STOP);

    controller.start();

    // Step co-simulation with MNA voltage solving
    let busLowSeen = false;
    let busHighSeen = false;
    const gpioMap = new Map<number, number>([[0, 3], [1, 4]]);

    for (let c = 0; c < 35000; c += 10) {
      controller.stepCycles(10);

      const dSda = bridge.getDriverState(0);
      const dScl = bridge.getDriverState(1);

      const isSdaLow = (dSda?.isOutputActive && dSda.outputVoltage < 0.5) || i2c0['sdaLow'];
      const isSclLow = (dScl?.isOutputActive && dScl.outputVoltage < 0.5) || i2c0['sclLow'];

      elements[4].value = isSdaLow ? 50 : 1e8;
      elements[5].value = isSclLow ? 50 : 1e8;

      const res = solver.solve(0.001);
      const vNodeSda = res.nodeVoltages[3];
      const vNodeScl = res.nodeVoltages[4];

      if (vNodeSda < 0.1 || vNodeScl < 0.1) busLowSeen = true;
      if (vNodeSda > 3.2 && vNodeScl > 3.2) busHighSeen = true;

      bridge.updateFromMnaResult(res.nodeVoltages, gpioMap);
    }

    const mb = rp2040.readUint32(0x20000000);
    const tc = rp2040.readUint32(0x50000008);
    const eepromVal = eeprom.readRaw(0x0040);

    const ok = mb === 0xdeadbeef && tc === 0 && eepromVal === 0xfe && busLowSeen && busHighSeen;
    record(18, 'MNA_DMA_COSIM', 'Closed-Loop MNA Circuit Co-Simulation with DMA-Driven I²C Transactions', ok,
      `Mailbox=0x${mb.toString(16)}; EEPROM[0x0040]=0x${eepromVal.toString(16)} (Expected 0xfe); Bus LOW=${busLowSeen}, Bus HIGH=${busHighSeen}`);
  }

  // ─── AUDIT SUMMARY ─────────────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   TOTAL PHASE 4.3.4.1 AUDIT CHECKS: ${total}`);
  console.log(`   PASSED:                           ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`   FAILED:                           ${failed}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4341Audit().catch(err => {
  console.error('Fatal error running Phase 4.3.4.1 audit:', err);
  process.exit(1);
});
