import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  REG_IC_CON, REG_IC_TAR, REG_IC_DATA_CMD, REG_IC_ENABLE, REG_IC_STATUS,
  REG_IC_DMA_CR, REG_IC_DMA_TDLR, REG_IC_TXFLR,
  CMD_STOP, DREQ_I2C0_TX, DREQ_I2C0_RX, DREQ_I2C1_TX, DREQ_I2C1_RX
} from '../src/features/simulator/rp2040I2c';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DREQ_PWM_WRAP0 = 24;

function runPwmIsolationTest() {
  console.log('========================================================================');
  console.log('   VOLTFORGE PHASE 4.3.4.2 — NON-VACUOUS PWM DREQ ISOLATION TEST');
  console.log('========================================================================\n');

  const fixtureDir = path.resolve(__dirname, '../src/features/simulator/__fixtures__');
  const blinkBytes = fs.readFileSync(path.join(fixtureDir, 'pico_blink_rp2040.uf2'));

  const controller = new RP2040Controller();
  controller.loadFirmware(blinkBytes);
  const rp2040 = controller.getRp2040Instance()!;
  const i2c0 = controller.getI2c(0)!;
  const dma = rp2040.dma;
  const pwm = rp2040.pwm;

  const DMA_CH0_BASE = 0x50000000;
  const SRAM_TX = 0x20001000;
  const I2C0_DATA_CMD = 0x40044010;

  // Pre-load SRAM TX buffer
  rp2040.writeUint32(SRAM_TX, 0x42 | CMD_STOP);

  // -----------------------------------------------------------------------------------
  // SCENARIO 1: Real PWM_WRAP0 asserts DREQ 24; I2C DMA configured with TREQ_SEL=32 (Correct)
  // -----------------------------------------------------------------------------------
  console.log('--- SCENARIO 1: ACTIVE PWM_WRAP0 WITH CORRECT TREQ_SEL=32 ---');
  // Configure DMA Channel 0 for I2C0 TX: TREQ_SEL=32 (DREQ_I2C0_TX), 32-bit, INCR_R
  rp2040.writeUint32(DMA_CH0_BASE + 0x00, SRAM_TX);
  rp2040.writeUint32(DMA_CH0_BASE + 0x04, I2C0_DATA_CMD);
  rp2040.writeUint32(DMA_CH0_BASE + 0x08, 1); // 1 transfer
  // EN | 32-bit (0x8) | INCR_R (0x10) | (32 << 15)
  const ctrlTrig32 = 0x1 | 0x8 | 0x10 | (32 << 15);
  rp2040.writeUint32(DMA_CH0_BASE + 0x0c, ctrlTrig32);

  // Ensure I2C0 DMA is NOT enabled yet (DREQ 32 is false)
  i2c0.writeUint32(REG_IC_DMA_CR, 0x00);

  const initialDreq24 = dma.dreq[DREQ_PWM_WRAP0];
  const initialDreq32 = dma.dreq[DREQ_I2C0_TX];
  const initialTransCount = rp2040.readUint32(DMA_CH0_BASE + 0x08);
  const initialTxFlr = i2c0.readUint32(REG_IC_TXFLR);

  console.log(`Initial States: DREQ[24]=${initialDreq24}, DREQ[32]=${initialDreq32}, CH0_TRANS_COUNT=${initialTransCount}, I2C0_TXFLR=${initialTxFlr}`);

  // Now fire real PWM_WRAP0 event!
  console.log('Triggering real PWM_WRAP0 wrap event via pwm.channelInterrupt(0)...');
  pwm.channelInterrupt(0);

  const afterPwmDreq24 = dma.dreq[DREQ_PWM_WRAP0];
  const afterPwmDreq32 = dma.dreq[DREQ_I2C0_TX];

  // Step simulation clock to allow any pending alarms to fire
  controller.stepCycles(100);

  const afterPwmTransCount = rp2040.readUint32(DMA_CH0_BASE + 0x08);
  const afterPwmTxFlr = i2c0.readUint32(REG_IC_TXFLR);

  console.log(`After PWM Event: DREQ[24]=${afterPwmDreq24}, DREQ[32]=${afterPwmDreq32}, CH0_TRANS_COUNT=${afterPwmTransCount}, I2C0_TXFLR=${afterPwmTxFlr}`);

  const scenario1Passed = (afterPwmDreq24 === true) &&
                          (afterPwmDreq32 === false) &&
                          (afterPwmTransCount === 1) &&
                          (afterPwmTxFlr === 0);

  console.log(`[SCENARIO 1 RESULT] ${scenario1Passed ? 'PASS' : 'FAIL'}: PWM DREQ 24 did NOT trigger I2C DMA (TRANS_COUNT preserved at 1, TXFLR=0)`);

  // Clear PWM DREQ 24
  dma.clearDREQ(DREQ_PWM_WRAP0);

  // -----------------------------------------------------------------------------------
  // SCENARIO 2: Misconfigured I2C DMA with TREQ_SEL=24 (Old Bug) during active I2C transfer
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: ACTIVE I2C TRANSFER WITH MISCONFIGURED TREQ_SEL=24 ---');
  // Reconfigure DMA Channel 0 with TREQ_SEL=24 (PWM_WRAP0)
  rp2040.writeUint32(DMA_CH0_BASE + 0x00, SRAM_TX);
  rp2040.writeUint32(DMA_CH0_BASE + 0x04, I2C0_DATA_CMD);
  rp2040.writeUint32(DMA_CH0_BASE + 0x08, 1);
  const ctrlTrig24 = 0x1 | 0x8 | 0x10 | (24 << 15);
  rp2040.writeUint32(DMA_CH0_BASE + 0x0c, ctrlTrig24);

  // Now activate I2C0 DMA Transmit (TDMAE=1)
  console.log('Enabling I2C0 Transmit DMA (TDMAE=1 in IC_DMA_CR)...');
  i2c0.writeUint32(REG_IC_DMA_CR, 0x02); // TDMAE = 1

  const i2cActiveDreq24 = dma.dreq[DREQ_PWM_WRAP0];
  const i2cActiveDreq32 = dma.dreq[DREQ_I2C0_TX];

  // Step clock
  controller.stepCycles(100);

  const i2cActiveTransCount = rp2040.readUint32(DMA_CH0_BASE + 0x08);
  const i2cActiveTxFlr = i2c0.readUint32(REG_IC_TXFLR);

  console.log(`During I2C Request: DREQ[24]=${i2cActiveDreq24}, DREQ[32]=${i2cActiveDreq32}, CH0_TRANS_COUNT=${i2cActiveTransCount}, I2C0_TXFLR=${i2cActiveTxFlr}`);

  const scenario2Passed = (i2cActiveDreq24 === false) &&
                          (i2cActiveDreq32 === true) &&
                          (i2cActiveTransCount === 1) &&
                          (i2cActiveTxFlr === 0);

  console.log(`[SCENARIO 2 RESULT] ${scenario2Passed ? 'PASS' : 'FAIL'}: Misconfigured TREQ=24 stalls because I2C asserts DREQ 32, NOT 24!`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 3: Configure Channel with Correct TREQ_SEL=32 -> Transfer occurs!
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: CORRECT TREQ_SEL=32 WITH ACTIVE I2C DREQ 32 ---');
  // Reconfigure DMA Channel 0 with TREQ_SEL=32
  rp2040.writeUint32(DMA_CH0_BASE + 0x00, SRAM_TX);
  rp2040.writeUint32(DMA_CH0_BASE + 0x04, I2C0_DATA_CMD);
  rp2040.writeUint32(DMA_CH0_BASE + 0x08, 1);
  rp2040.writeUint32(DMA_CH0_BASE + 0x0c, ctrlTrig32);

  console.log('Stepping clock with TREQ_SEL=32 and active I2C DREQ 32...');
  controller.stepCycles(100);

  const finalTransCount = rp2040.readUint32(DMA_CH0_BASE + 0x08);
  const finalTxFlr = i2c0.readUint32(REG_IC_TXFLR);
  const finalBusy = (rp2040.readUint32(DMA_CH0_BASE + 0x0c) & (1 << 24)) !== 0;

  console.log(`Final State: CH0_TRANS_COUNT=${finalTransCount}, I2C0_TXFLR=${finalTxFlr}, BUSY=${finalBusy}`);

  const scenario3Passed = (finalTransCount === 0) &&
                          (finalTxFlr === 1) &&
                          (finalBusy === false);

  console.log(`[SCENARIO 3 RESULT] ${scenario3Passed ? 'PASS' : 'FAIL'}: DMA transfer completed successfully (TRANS_COUNT=0, TXFLR=1, BUSY=0)!`);

  console.log('\n========================================================================');
  if (scenario1Passed && scenario2Passed && scenario3Passed) {
    console.log('   ALL 3 NON-VACUOUS PWM DREQ ISOLATION SCENARIOS PASSED (100.0%)');
  } else {
    console.error('   ISOLATION AUDIT FAILED');
    process.exit(1);
  }
  console.log('========================================================================');
}

runPwmIsolationTest();
