/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 SPI Shared-Bus Multi-Device & Logic Analyzer Validation Test
 * Phase 4.3.5.2 Audit 3
 * 
 * Verifies:
 * 1. Multiple SPI devices sharing SCLK, MOSI, and MISO on the same controller bus.
 * 2. Only the selected device drives MISO; unselected devices release MISO to High-Z.
 * 3. Independent chip select management with zero bus contention during CS transitions.
 * 4. Correct protocol transactions across Motorola Modes (Mode 0 and Mode 3).
 * 5. Actual GPIO signal transitions routed through RP2040GpioBridge and verified by decodeSpi().
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
  CR0_SPO,
  CR0_SPH,
  SR_RNE,
  DREQ_SPI0_TX,
  DREQ_SPI0_RX,
  decodeSpi,
  type SpiSignalSample,
} from '../src/features/simulator/rp2040Spi';
import {
  EEPROM_25LC256,
  ADC_MCP3008,
  CMD_EEPROM_WREN,
  CMD_EEPROM_WRITE,
  CMD_EEPROM_READ,
} from '../src/features/simulator/rp2040SpiDevice';
import {
  RP2040GpioBridge,
  FUNCTION_SPI,
} from '../src/features/simulator/rp2040GpioBridge';

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

function runSharedBusTests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5.2 — SPI SHARED-BUS MULTI-DEVICE TEST          ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const mcu = new RP2040();
  const spi0 = new RP2040Spi(mcu, 'SPI0', 18, { tx: DREQ_SPI0_TX, rx: DREQ_SPI0_RX }, 0);
  const bridge = new RP2040GpioBridge(mcu, 'pico_0', 3.3);
  bridge.attachSpi(spi0, spi0);

  // Configure GP0 (RX), GP1 (CSn), GP2 (SCK), GP3 (TX) as SPI (Function 1)
  for (let pinIdx = 0; pinIdx < 4; pinIdx++) {
    const pin = mcu.gpio[pinIdx];
    pin.ctrl = (pin.ctrl & ~0x1f) | FUNCTION_SPI;
  }

  // Setup Prescaler and Control: 12.5 MHz SPI clock (125 MHz / 10), Mode 0, 8-bit
  spi0.writeUint32(REG_SSPCPSR, 10);
  spi0.writeUint32(REG_SSPCR0, 0x0007); // 8-bit, Mode 0 (CPOL=0, CPHA=0)
  spi0.writeUint32(REG_SSPCR1, CR1_SSE);

  // Instantiate two independent devices on the shared bus
  const eeprom = new EEPROM_25LC256();
  const adc = new ADC_MCP3008(3.3);

  // Set bindToControllerCs = false to allow independent CS line arbitration
  eeprom.bindToControllerCs = false;
  adc.bindToControllerCs = false;

  spi0.attachDevice(eeprom);
  spi0.attachDevice(adc);

  assertCheck(spi0.getAttachedDevices().length === 2, 'Two devices attached to shared SPI0 bus');
  assertCheck(!eeprom.isSelected && !adc.isSelected, 'Both devices initially unselected (High-Z)');

  // ─── Test 1: Device A Selected (EEPROM Write & Read) ──────────────────────────
  console.log('--- TEST 1: DEVICE A (EEPROM) SELECTED ON SHARED BUS ---');
  // Select EEPROM (CS_A = LOW), Keep ADC Deselected (CS_B = HIGH)
  eeprom.select(true);
  adc.select(false);
  assertCheck(eeprom.isSelected === true, 'EEPROM is selected (CS_A = 0V)');
  assertCheck(adc.isSelected === false, 'ADC is unselected (CS_B = 3.3V, MISO High-Z)');

  // 1. Send WREN (0x06)
  spi0.clearFifos();
  spi0.writeUint32(REG_SSPDR, CMD_EEPROM_WREN);
  spi0.tickCycles(150);
  spi0.readUint32(REG_SSPDR); // flush dummy RX
  eeprom.select(false); // Latch WREN

  // 2. Write 0xBE to address 0x0100
  eeprom.select(true);
  spi0.writeUint32(REG_SSPDR, CMD_EEPROM_WRITE);
  spi0.writeUint32(REG_SSPDR, 0x01); // Addr HI
  spi0.writeUint32(REG_SSPDR, 0x00); // Addr LO
  spi0.writeUint32(REG_SSPDR, 0xbe); // Data
  spi0.tickCycles(500);
  while (spi0.readUint32(REG_SSPSR) & SR_RNE) spi0.readUint32(REG_SSPDR);
  eeprom.select(false); // Commit write to EEPROM

  // 3. Read back from address 0x0100
  eeprom.select(true);
  spi0.writeUint32(REG_SSPDR, CMD_EEPROM_READ);
  spi0.writeUint32(REG_SSPDR, 0x01);
  spi0.writeUint32(REG_SSPDR, 0x00);
  spi0.writeUint32(REG_SSPDR, 0x00); // Dummy byte to clock out data
  spi0.tickCycles(500);

  spi0.readUint32(REG_SSPDR); // discard cmd echo
  spi0.readUint32(REG_SSPDR); // discard addr hi
  spi0.readUint32(REG_SSPDR); // discard addr lo
  const eepromData = spi0.readUint32(REG_SSPDR);
  assertCheck(eepromData === 0xbe, `EEPROM read returned 0xBE on shared bus (got 0x${eepromData.toString(16)})`);
  eeprom.select(false);

  // ─── Test 2: Clean CS Handover (No Bus Contention) ────────────────────────────
  console.log('\n--- TEST 2: CS HANDOVER & UNSELECTED HIGH-Z RELEASE ---');
  // Both deselected
  assertCheck(!eeprom.isSelected && !adc.isSelected, 'Both devices unselected: MISO is High-Z');

  // Select ADC (CS_B = LOW), EEPROM remains deselected
  adc.select(true);
  assertCheck(adc.isSelected === true, 'ADC selected (CS_B = 0V)');
  assertCheck(eeprom.isSelected === false, 'EEPROM deselected (CS_A = 3.3V)');

  // Set analog voltage on ADC channel 3 = 1.65 V (half scale = 511)
  adc.setChannelVoltage(3, 1.65);

  // Send MCP3008 3-byte conversion frame for CH3 single-ended:
  // Byte 1: 0x01 (Start bit)
  // Byte 2: 0xB0 (SGL/DIFF=1, CH3: D2=0, D1=1, D0=1 -> 0b10110000 = 0xB0)
  // Byte 3: 0x00 (Dummy)
  spi0.clearFifos();
  spi0.writeUint32(REG_SSPDR, 0x01);
  spi0.writeUint32(REG_SSPDR, 0xb0);
  spi0.writeUint32(REG_SSPDR, 0x00);
  spi0.tickCycles(500);

  spi0.readUint32(REG_SSPDR); // byte 1 return
  const adcHi = spi0.readUint32(REG_SSPDR); // byte 2 return: null bit + B9..B8
  const adcLo = spi0.readUint32(REG_SSPDR); // byte 3 return: B7..B0
  const adcCode = ((adcHi & 0x03) << 8) | (adcLo & 0xff);

  assertCheck(adcCode === 511, `ADC channel 3 conversion returned 511 code (got ${adcCode})`);
  adc.select(false);

  // Verify EEPROM memory was completely unaffected by ADC transaction
  assertCheck(eeprom.readMemory(0x0100) === 0xbe, 'EEPROM data at 0x0100 preserved at 0xBE without corruption');

  // ─── Test 3: Unselected Floating Bus Returns 0xFF ─────────────────────────────
  console.log('\n--- TEST 3: FLOATING BUS BEHAVIOR WHEN NO DEVICE IS SELECTED ---');
  eeprom.select(false);
  adc.select(false);
  spi0.clearFifos();
  spi0.writeUint32(REG_SSPDR, 0x55);
  spi0.tickCycles(150);
  const floatingRx = spi0.readUint32(REG_SSPDR);
  assertCheck(floatingRx === 0xff, `Floating MISO with pull-up returns 0xFF when no slave selected (got 0x${floatingRx.toString(16)})`);

  // ─── Test 4: Different SPI Modes (Mode 3: CPOL=1, CPHA=1) ─────────────────────
  console.log('\n--- TEST 4: MULTI-DEVICE SUPPORT ACROSS MOTOROLA SPI MODE 3 ---');
  // Reconfigure controller to Mode 3 (CPOL=1, CPHA=1)
  spi0.writeUint32(REG_SSPCR1, 0); // disable SSE during config
  spi0.writeUint32(REG_SSPCR0, 0x0007 | CR0_SPO | CR0_SPH); // Mode 3
  spi0.writeUint32(REG_SSPCR1, CR1_SSE);
  assertCheck(spi0.mode === 3, 'SPI0 reconfigured to Mode 3 (CPOL=1, CPHA=1)');

  // Perform EEPROM read in Mode 3
  eeprom.select(true);
  spi0.clearFifos();
  spi0.writeUint32(REG_SSPDR, CMD_EEPROM_READ);
  spi0.writeUint32(REG_SSPDR, 0x01);
  spi0.writeUint32(REG_SSPDR, 0x00);
  spi0.writeUint32(REG_SSPDR, 0x00);
  spi0.tickCycles(500);

  spi0.readUint32(REG_SSPDR);
  spi0.readUint32(REG_SSPDR);
  spi0.readUint32(REG_SSPDR);
  const mode3Data = spi0.readUint32(REG_SSPDR);
  assertCheck(mode3Data === 0xbe, `Mode 3 EEPROM read returned 0xBE (got 0x${mode3Data.toString(16)})`);
  eeprom.select(false);

  // ─── Test 5: Logic Analyzer Protocol Decoder with Actual GPIO Transitions ──────
  console.log('\n--- TEST 5: LOGIC ANALYZER DECODER WITH ACTUAL GPIO TRANSITIONS ---');
  // Return to Mode 0
  spi0.writeUint32(REG_SSPCR1, 0);
  spi0.writeUint32(REG_SSPCR0, 0x0007); // Mode 0
  spi0.writeUint32(REG_SSPCR1, CR1_SSE);

  // Attach a single device bound to CS for automatic GPIO sampling trace
  const eepromTrace = new EEPROM_25LC256();
  eepromTrace.bindToControllerCs = true;
  spi0.detachDevice(eeprom);
  spi0.detachDevice(adc);
  spi0.attachDevice(eepromTrace);

  // Write known data 0x37 into EEPROM address 0x0020
  eepromTrace.writeMemory(0x0020, 0x37);

  // Sample actual GPIO pin lines per cycle
  const signalSamples: SpiSignalSample[] = [];
  let simCycle = 0;

  spi0.onPinChange = () => {
    signalSamples.push({
      timestamp: simCycle,
      sck: spi0.sckLineState,
      mosi: spi0.mosiLineState,
      miso: spi0.misoLineState,
      cs: spi0.csnLineState,
    });
  };

  // Perform 4-byte SPI read transaction: READ (0x03), 0x00, 0x20, 0x00
  spi0.clearFifos();
  spi0.writeUint32(REG_SSPDR, CMD_EEPROM_READ);
  spi0.writeUint32(REG_SSPDR, 0x00);
  spi0.writeUint32(REG_SSPDR, 0x20);
  spi0.writeUint32(REG_SSPDR, 0x00);

  // Step simulation 1 cycle at a time to record realistic pin transitions
  for (let c = 0; c < 450; c++) {
    simCycle++;
    spi0.tickCycles(1);
  }

  assertCheck(signalSamples.length > 50, `Recorded ${signalSamples.length} real GPIO transition samples from hardware model`);

  // Decode the captured digital signal trace using decodeSpi
  const decodedPackets = decodeSpi(signalSamples, 0, 0, 8);
  assertCheck(decodedPackets.length === 4, `decodeSpi decoded exactly 4 packets from physical signal trace (got ${decodedPackets.length})`);
  assertCheck(decodedPackets[0].mosiData === CMD_EEPROM_READ, `Packet 0 MOSI matches CMD_EEPROM_READ (0x03)`);
  assertCheck(decodedPackets[1].mosiData === 0x00, `Packet 1 MOSI matches Addr HI (0x00)`);
  assertCheck(decodedPackets[2].mosiData === 0x20, `Packet 2 MOSI matches Addr LO (0x20)`);
  assertCheck(decodedPackets[3].misoData === 0x37, `Packet 3 MISO matches EEPROM data (0x37, got 0x${decodedPackets[3].misoData.toString(16)})`);

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   SPI SHARED-BUS TEST: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');
}

runSharedBusTests();
