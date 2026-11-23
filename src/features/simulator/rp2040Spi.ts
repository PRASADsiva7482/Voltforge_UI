/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 ARM PrimeCell PL022 Synchronous Serial Port (SPI) Emulation
 * 
 * Implements genuine PL022 SPI register map, 8-entry 16-bit TX/RX FIFOs, cycle-accurate
 * full-duplex bit timing, Motorola SPI Modes 0..3, data sizes 4..16 bits, interrupt masking,
 * atomic aliases (+0x1000, +0x2000, +0x3000), and DMA DREQ pacing for SPI0 and SPI1.
 * 
 * Hardware Reference:
 * - Raspberry Pi RP2040 Datasheet Section 4.4 "SPI"
 * - ARM PrimeCell Synchronous Serial Port (PL022) Technical Reference Manual (ARM DDI 0194H)
 * - Raspberry Pi Pico SDK: hardware/regs/spi.h & hardware/spi.h
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040, BasePeripheral, type Peripheral } from 'rp2040js';
import type { RP2040SpiDevice } from './rp2040SpiDevice';

// ─── Register Offsets (RP2040 Datasheet Section 4.4.4 / ARM PL022) ───────────────────

export const REG_SSPCR0        = 0x000; // Control register 0
export const REG_SSPCR1        = 0x004; // Control register 1
export const REG_SSPDR         = 0x008; // Receive/transmit data register
export const REG_SSPSR         = 0x00c; // Status register (RO)
export const REG_SSPCPSR       = 0x010; // Clock prescale register
export const REG_SSPIMSC       = 0x014; // Interrupt mask set or clear register
export const REG_SSPRIS        = 0x018; // Raw interrupt status register (RO)
export const REG_SSPMIS        = 0x01c; // Masked interrupt status register (RO)
export const REG_SSPICR        = 0x020; // Interrupt clear register (WO)
export const REG_SSPDMACR      = 0x024; // DMA control register

// PrimeCell & Peripheral ID Registers
export const REG_SSPPERIPHID0  = 0xfe0;
export const REG_SSPPERIPHID1  = 0xfe4;
export const REG_SSPPERIPHID2  = 0xfe8;
export const REG_SSPPERIPHID3  = 0xfec;
export const REG_SSPPCELLID0   = 0xff0;
export const REG_SSPPCELLID1   = 0xff4;
export const REG_SSPPCELLID2   = 0xff8;
export const REG_SSPPCELLID3   = 0xffc;

// ─── Bitfield Definitions & Masks ────────────────────────────────────────────────────

// SSPCR0
export const CR0_DSS_MASK      = 0x000f; // Data size select: 0011 (4-bit) to 1111 (16-bit)
export const CR0_FRF_MASK      = 0x0030; // Frame format: 00 = Motorola SPI
export const CR0_FRF_MOTOROLA  = 0x0000;
export const CR0_SPO           = 1 << 6; // Clock polarity (CPOL): 0 = low idle, 1 = high idle
export const CR0_SPH           = 1 << 7; // Clock phase (CPHA): 0 = first edge, 1 = second edge
export const CR0_SCR_SHIFT     = 8;
export const CR0_SCR_MASK      = 0xff00; // Serial clock rate divisor: 0..255

// SSPCR1
export const CR1_LBM           = 1 << 0; // Loop back mode
export const CR1_SSE           = 1 << 1; // Synchronous serial port enable
export const CR1_MS            = 1 << 2; // Master/slave select: 0 = Master, 1 = Slave
export const CR1_SOD           = 1 << 3; // Slave-mode output disable

// SSPSR
export const SR_TFE            = 1 << 0; // Transmit FIFO empty
export const SR_TNF            = 1 << 1; // Transmit FIFO not full
export const SR_RNE            = 1 << 2; // Receive FIFO not empty
export const SR_RFF            = 1 << 3; // Receive FIFO full
export const SR_BSY            = 1 << 4; // PrimeCell SSP busy flag

// Interrupts (SSPIMSC, SSPRIS, SSPMIS, SSPICR)
export const INT_ROR           = 1 << 0; // Receive overrun interrupt
export const INT_RT            = 1 << 1; // Receive timeout interrupt
export const INT_RX            = 1 << 2; // Receive FIFO interrupt (>= half full)
export const INT_TX            = 1 << 3; // Transmit FIFO interrupt (<= half empty)

// SSPDMACR
export const DMACR_RXDMAE      = 1 << 0; // Receive DMA enable
export const DMACR_TXDMAE      = 1 << 1; // Transmit DMA enable

// Official RP2040 DMA DREQ channels (RP2040 Datasheet Table 43)
export const DREQ_SPI0_TX      = 16;
export const DREQ_SPI0_RX      = 17;
export const DREQ_SPI1_TX      = 18;
export const DREQ_SPI1_RX      = 19;

export interface ISpiDMAChannels {
  rx: number;
  tx: number;
}

export interface SpiDiagnostics {
  name: string;
  controllerIndex: number;
  enabled: boolean;
  isMaster: boolean;
  cpol: number;
  cpha: number;
  dataBits: number;
  baudRate_Hz: number;
  txFifoDepth: number;
  rxFifoDepth: number;
  busy: boolean;
  interruptMask: number;
  rawInterrupts: number;
  maskedInterrupts: number;
  txDmaEnabled: boolean;
  rxDmaEnabled: boolean;
}

export interface SpiSignalSample {
  timestamp: number;
  sck: boolean;
  mosi: boolean;
  miso: boolean;
  cs: boolean;
}

export interface SpiDecodedPacket {
  startTime: number;
  endTime: number;
  mosiData: number;
  misoData: number;
  bits: number;
}

export class RP2040Spi extends BasePeripheral implements Peripheral {
  public static readonly FIFO_DEPTH = 8; // 8 entries deep (16 bits wide)

  public readonly irq: number;
  public readonly dreq: ISpiDMAChannels;
  public readonly controllerIndex: number;

  // ─── Register States ───────────────────────────────────────────────────────────────
  private cr0: number = 0x0000;         // SSPCR0
  private cr1: number = 0x0000;         // SSPCR1
  private cpsr: number = 0x0000;        // SSPCPSR (Clock prescale divisor: even 2..254)
  private imsc: number = 0x0000;        // SSPIMSC
  private dmacr: number = 0x0000;       // SSPDMACR

  // Interrupt flags
  private rorRaw: boolean = false;      // Receive Overrun Raw Flag
  private rtRaw: boolean = false;       // Receive Timeout Raw Flag
  private rxTimeoutTimerCycles: number = 0; // Tracks cycles since last RX read for timeout

  // ─── 8-Entry 16-Bit FIFOs ──────────────────────────────────────────────────────────
  private txFifo: number[] = [];
  private rxFifo: number[] = [];

  // ─── Output Line States (Push-Pull CMOS) ───────────────────────────────────────────
  private sckOutput: boolean = false;
  private mosiOutput: boolean = false;
  private csnOutput: boolean = true;    // Active LOW; idle HIGH

  // Sensed external MISO line state (from MNA / external circuit)
  private misoInputState: boolean = true;
  private slaveShiftTxWord: number = 0xff; // Response byte from selected slave device for bit-accurate MISO driving

  // ─── Cycle-Accurate Shifter Engine ─────────────────────────────────────────────────
  private isShifting: boolean = false;
  private shiftTxWord: number = 0;
  private shiftRxWord: number = 0;
  private shiftBitsTotal: number = 8;
  private shiftBitsLeft: number = 0;
  private shiftSubCycle: number = 0;    // 0 = first half of bit, 1 = second half of bit
  private halfBitPeriodCycles: number = 62;
  private phaseCyclesLeft: number = 0;

  // Clock configuration
  private peripheralClock_Hz: number = 125_000_000;

  // Attached Virtual SPI Slaves
  private attachedDevices: RP2040SpiDevice[] = [];

  // Callbacks for GPIO bridge & instruments
  public onPinChange?: () => void;
  public onFrameComplete?: (mosiWord: number, misoWord: number, bitLength: number) => void;

  constructor(
    rp2040: RP2040,
    name: string,
    irq: number,
    dreq: ISpiDMAChannels,
    controllerIndex: number = 0
  ) {
    super(rp2040, name);
    this.irq = irq;
    this.dreq = dreq;
    this.controllerIndex = controllerIndex;

    this.sckOutput = this.cpol;
    this.csnOutput = true;
    this.mosiOutput = false;

    this.updateInterrupts();
    this.updateDma();
  }

  // ─── Configuration Properties ──────────────────────────────────────────────────────

  public get enabled(): boolean {
    return !!(this.cr1 & CR1_SSE);
  }

  public get isMaster(): boolean {
    return !(this.cr1 & CR1_MS);
  }

  public get loopback(): boolean {
    return !!(this.cr1 & CR1_LBM);
  }

  public get cpol(): boolean {
    return !!(this.cr0 & CR0_SPO);
  }

  public get cpha(): boolean {
    return !!(this.cr0 & CR0_SPH);
  }

  /** Motorola SPI Mode 0, 1, 2, or 3 */
  public get mode(): number {
    return (this.cpol ? 2 : 0) | (this.cpha ? 1 : 0);
  }

  /** Data word size in bits (4 to 16, default 8) */
  public get dataSizeBits(): number {
    const dss = this.cr0 & CR0_DSS_MASK;
    return Math.max(4, Math.min(16, dss + 1));
  }

  public get scr(): number {
    return (this.cr0 & CR0_SCR_MASK) >>> CR0_SCR_SHIFT;
  }

  public get cpsdvsr(): number {
    return this.cpsr & 0xfe; // Even divisor 2..254
  }

  /**
   * Bit Rate = F_SSPINCLK / (CPSDVSR * (1 + SCR))
   */
  public get baudRate(): number {
    const divisor = this.cpsdvsr * (1 + this.scr);
    if (divisor <= 0) return 0;
    return Math.round(this.peripheralClock_Hz / divisor);
  }

  public setPeripheralClock(freq_Hz: number): void {
    if (freq_Hz > 0) {
      this.peripheralClock_Hz = freq_Hz;
      this.recalculateBitTiming();
    }
  }

  private recalculateBitTiming(): void {
    const divisor = this.cpsdvsr * (1 + this.scr);
    if (divisor >= 2) {
      this.halfBitPeriodCycles = Math.max(1, Math.floor(divisor / 2));
    } else {
      this.halfBitPeriodCycles = 1;
    }
  }

  // ─── Hardware Pin Line States ──────────────────────────────────────────────────────

  public get sckLineState(): boolean {
    return this.sckOutput;
  }

  public get mosiLineState(): boolean {
    return this.mosiOutput;
  }

  public get csnLineState(): boolean {
    return this.csnOutput;
  }

  public get misoLineState(): boolean {
    return this.misoInputState;
  }

  public feedMisoPinState(pinHigh: boolean): void {
    this.misoInputState = pinHigh;
  }

  // ─── Virtual Device Management ─────────────────────────────────────────────────────

  public attachDevice(device: RP2040SpiDevice): void {
    if (!this.attachedDevices.includes(device)) {
      this.attachedDevices.push(device);
    }
  }

  public detachDevice(device: RP2040SpiDevice): void {
    const idx = this.attachedDevices.indexOf(device);
    if (idx !== -1) {
      this.attachedDevices.splice(idx, 1);
    }
  }

  public getAttachedDevices(): RP2040SpiDevice[] {
    return [...this.attachedDevices];
  }

  // ─── Status Register & Interrupts ──────────────────────────────────────────────────

  public get status(): number {
    let stat = 0;
    if (this.txFifo.length === 0) stat |= SR_TFE;
    if (this.txFifo.length < RP2040Spi.FIFO_DEPTH) stat |= SR_TNF;
    if (this.rxFifo.length > 0) stat |= SR_RNE;
    if (this.rxFifo.length >= RP2040Spi.FIFO_DEPTH) stat |= SR_RFF;
    if (this.isShifting || this.txFifo.length > 0) stat |= SR_BSY;
    return stat;
  }

  public get rawInterrupts(): number {
    let ris = 0;
    if (this.rorRaw) ris |= INT_ROR;
    if (this.rtRaw) ris |= INT_RT;
    // RXRIS is asserted when RX FIFO is at least half full (>= 4 entries)
    if (this.rxFifo.length >= 4) ris |= INT_RX;
    // TXRIS is asserted when TX FIFO is at most half full (<= 4 entries)
    if (this.txFifo.length <= 4) ris |= INT_TX;
    return ris;
  }

  public get maskedInterrupts(): number {
    return this.rawInterrupts & (this.imsc & 0x0f);
  }

  public updateInterrupts(): void {
    const mis = this.maskedInterrupts;
    this.rp2040.setInterrupt(this.irq, mis !== 0);
  }

  public updateDma(): void {
    // Transmit DMA Request (DREQ_SPIx_TX)
    // Conditioned on SSPDMACR.TXDMAE AND TX FIFO having space (<= 4 entries per PL022 threshold)
    if ((this.dmacr & DMACR_TXDMAE) && this.txFifo.length <= 4) {
      this.rp2040.dma?.setDREQ(this.dreq.tx);
    } else {
      this.rp2040.dma?.clearDREQ(this.dreq.tx);
    }

    // Receive DMA Request (DREQ_SPIx_RX)
    // Conditioned on SSPDMACR.RXDMAE AND RX FIFO not empty (or >= 4 entries)
    if ((this.dmacr & DMACR_RXDMAE) && this.rxFifo.length > 0) {
      this.rp2040.dma?.setDREQ(this.dreq.rx);
    } else {
      this.rp2040.dma?.clearDREQ(this.dreq.rx);
    }
  }

  // ─── Cycle-Accurate Stepping ───────────────────────────────────────────────────────

  /**
   * Advances the SPI peripheral by deltaCycles CPU clock cycles.
   */
  public tickCycles(deltaCycles: number): void {
    if (deltaCycles <= 0) return;

    // Receive timeout counter evaluation (PL022: timeout after 32 bit periods with data in RX FIFO and no read)
    if (this.rxFifo.length > 0) {
      const bitPeriod = Math.max(2, this.halfBitPeriodCycles * 2);
      this.rxTimeoutTimerCycles += deltaCycles;
      if (this.rxTimeoutTimerCycles >= bitPeriod * 32) {
        this.rtRaw = true;
      }
    } else {
      this.rxTimeoutTimerCycles = 0;
    }

    if (!this.enabled || !this.isMaster || this.cpsdvsr < 2) {
      this.updateInterrupts();
      this.updateDma();
      return;
    }

    let remainingCycles = deltaCycles;

    while (remainingCycles > 0) {
      // If idle, check if a new transmission should start
      if (!this.isShifting) {
        if (this.txFifo.length > 0) {
          this.startNextFrame();
        } else {
          // Bus is idle: CSn returns HIGH, SCLK returns idle CPOL
          if (!this.csnOutput) {
            this.csnOutput = true;
            this.sckOutput = this.cpol;
            this.notifySlavesCs(false);
            this.onPinChange?.();
          }
          break;
        }
      }

      const step = Math.min(remainingCycles, this.phaseCyclesLeft);
      this.phaseCyclesLeft -= step;
      remainingCycles -= step;

      if (this.phaseCyclesLeft <= 0) {
        this.advanceShiftPhase();
      }
    }

    this.updateInterrupts();
    this.updateDma();
  }

  private startNextFrame(): void {
    const rawWord = this.txFifo.shift()!;
    this.shiftBitsTotal = this.dataSizeBits;
    const mask = (1 << this.shiftBitsTotal) - 1;
    this.shiftTxWord = rawWord & mask;
    this.shiftRxWord = 0;
    this.shiftBitsLeft = this.shiftBitsTotal;
    this.shiftSubCycle = 0;
    this.isShifting = true;

    // Assert CSn LOW
    const wasCsnHigh = this.csnOutput;
    this.csnOutput = false;
    if (wasCsnHigh) {
      this.notifySlavesCs(true);
    }

    // Obtain full-duplex response byte from selected virtual slave device
    this.slaveShiftTxWord = 0xff;
    if (this.attachedDevices.length > 0 && !this.loopback) {
      let selectedDevice: RP2040SpiDevice | null = null;
      let selectedCount = 0;
      for (const dev of this.attachedDevices) {
        if (dev.isSelected) {
          selectedCount++;
          selectedDevice = dev;
        }
      }
      if (selectedCount === 1 && selectedDevice) {
        this.slaveShiftTxWord = selectedDevice.transferByte(this.shiftTxWord & 0xff);
      } else if (selectedCount > 1) {
        let contended = 0xff;
        for (const dev of this.attachedDevices) {
          if (dev.isSelected) contended &= dev.transferByte(this.shiftTxWord & 0xff);
        }
        this.slaveShiftTxWord = contended;
      }
    }

    // Set initial MOSI and MISO bits
    // In CPHA=0: MOSI and MISO are driven before the first clock edge
    // In CPHA=1: MOSI and MISO are driven on the first clock edge
    if (!this.cpha) {
      const msb = (this.shiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
      this.mosiOutput = msb === 1;
      if (this.attachedDevices.length > 0 && !this.loopback) {
        const misoMsb = (this.slaveShiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
        this.misoInputState = misoMsb === 1;
      }
    }

    this.sckOutput = this.cpol;
    this.recalculateBitTiming();
    this.phaseCyclesLeft = this.halfBitPeriodCycles;
    this.onPinChange?.();
  }

  private advanceShiftPhase(): void {
    if (this.shiftSubCycle === 0) {
      // First edge transition
      this.shiftSubCycle = 1;
      this.phaseCyclesLeft = this.halfBitPeriodCycles;

      // Toggle SCLK to active state
      this.sckOutput = !this.cpol;

      if (!this.cpha) {
        // CPHA = 0: Sample on first edge!
        this.sampleMisoBit();
      } else {
        // CPHA = 1: Drive MOSI on first edge!
        const msb = (this.shiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
        this.mosiOutput = msb === 1;
        if (this.attachedDevices.length > 0 && !this.loopback) {
          const misoMsb = (this.slaveShiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
          this.misoInputState = misoMsb === 1;
        }
      }
      this.onPinChange?.();
    } else {
      // Second edge transition
      this.shiftSubCycle = 0;
      this.phaseCyclesLeft = this.halfBitPeriodCycles;

      // Return SCLK to idle state
      this.sckOutput = this.cpol;

      if (!this.cpha) {
        // CPHA = 0: Shift next MOSI bit on trailing edge
        this.shiftBitsLeft--;
        if (this.shiftBitsLeft > 0) {
          const nextMsb = (this.shiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
          this.mosiOutput = nextMsb === 1;
          if (this.attachedDevices.length > 0 && !this.loopback) {
            const nextMisoMsb = (this.slaveShiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
            this.misoInputState = nextMisoMsb === 1;
          }
        }
      } else {
        // CPHA = 1: Sample on second edge!
        this.sampleMisoBit();
        this.shiftBitsLeft--;
        if (this.shiftBitsLeft > 0) {
          const nextMsb = (this.shiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
          this.mosiOutput = nextMsb === 1;
          if (this.attachedDevices.length > 0 && !this.loopback) {
            const nextMisoMsb = (this.slaveShiftTxWord >>> (this.shiftBitsLeft - 1)) & 1;
            this.misoInputState = nextMisoMsb === 1;
          }
        }
      }

      this.onPinChange?.();

      if (this.shiftBitsLeft <= 0) {
        // Complete current frame transfer
        this.finalizeFrame();
      }
    }
  }

  private sampleMisoBit(): void {
    let bit = false;
    if (this.loopback) {
      bit = this.mosiOutput;
    } else {
      bit = this.misoInputState;
    }

    this.shiftRxWord = ((this.shiftRxWord << 1) | (bit ? 1 : 0)) & 0xffff;
  }

  private finalizeFrame(): void {
    this.isShifting = false;

    // Push final received word into RX FIFO
    let finalRxWord = this.shiftRxWord;
    if (this.attachedDevices.length > 0 && !this.loopback && this.shiftBitsTotal === 8) {
      finalRxWord = this.slaveShiftTxWord;
    }

    if (this.rxFifo.length < RP2040Spi.FIFO_DEPTH) {
      this.rxFifo.push(finalRxWord);
    } else {
      // RX FIFO Overrun!
      this.rorRaw = true;
    }

    this.onFrameComplete?.(this.shiftTxWord, finalRxWord, this.shiftBitsTotal);

    // If TX FIFO is empty, CSn will return high on next tick
    if (this.txFifo.length === 0) {
      this.csnOutput = true;
      this.sckOutput = this.cpol;
      this.misoInputState = true;
      this.notifySlavesCs(false);
      this.onPinChange?.();
    }
  }

  private notifySlavesCs(active: boolean): void {
    for (const dev of this.attachedDevices) {
      if (dev.bindToControllerCs !== false) {
        dev.select(active);
      }
    }
  }

  // ─── Register Read / Write Interface ───────────────────────────────────────────────

  public override readUint32(offset: number): number {
    const regOffset = offset & 0xfff;

    switch (regOffset) {
      case REG_SSPCR0:
        return this.cr0;

      case REG_SSPCR1:
        return this.cr1;

      case REG_SSPDR: {
        if (this.rxFifo.length === 0) {
          return 0x0000;
        }
        const val = this.rxFifo.shift()!;
        this.rxTimeoutTimerCycles = 0;
        this.rtRaw = false; // Reading pops data, clearing timeout condition
        this.updateInterrupts();
        this.updateDma();
        return val;
      }

      case REG_SSPSR:
        return this.status;

      case REG_SSPCPSR:
        return this.cpsr;

      case REG_SSPIMSC:
        return this.imsc;

      case REG_SSPRIS:
        return this.rawInterrupts;

      case REG_SSPMIS:
        return this.maskedInterrupts;

      case REG_SSPICR:
        // Read-as-zero
        return 0x0000;

      case REG_SSPDMACR:
        return this.dmacr;

      // Peripheral / PrimeCell Identification Registers
      case REG_SSPPERIPHID0: return 0x22;
      case REG_SSPPERIPHID1: return 0x10;
      case REG_SSPPERIPHID2: return 0x04;
      case REG_SSPPERIPHID3: return 0x00;
      case REG_SSPPCELLID0:  return 0x0d;
      case REG_SSPPCELLID1:  return 0xf0;
      case REG_SSPPCELLID2:  return 0x05;
      case REG_SSPPCELLID3:  return 0xb1;

      default:
        return super.readUint32(offset);
    }
  }

  public override writeUint32(offset: number, value: number): void {
    const atomicOp = (offset >>> 12) & 0x3;
    const regOffset = offset & 0xfff;

    if (atomicOp !== 0) {
      const curVal = this.readUint32(regOffset);
      let newVal = curVal;
      switch (atomicOp) {
        case 1: newVal = curVal ^ value; break; // XOR
        case 2: newVal = curVal | value; break; // SET
        case 3: newVal = curVal & ~value; break; // CLR
      }
      this.writeUint32(regOffset, newVal);
      return;
    }

    switch (regOffset) {
      case REG_SSPCR0: {
        this.cr0 = value & 0xffff;
        this.recalculateBitTiming();
        // Update idle clock polarity
        if (!this.isShifting) {
          this.sckOutput = this.cpol;
          this.onPinChange?.();
        }
        break;
      }

      case REG_SSPCR1: {
        const oldSse = this.enabled;
        this.cr1 = value & 0x000f;
        if (!this.enabled && oldSse) {
          // Disabling flushes active shift state
          this.isShifting = false;
          this.csnOutput = true;
          this.sckOutput = this.cpol;
          this.notifySlavesCs(false);
          this.onPinChange?.();
        }
        this.updateInterrupts();
        this.updateDma();
        break;
      }

      case REG_SSPDR: {
        const mask = (1 << this.dataSizeBits) - 1;
        const wordToWrite = value & mask;
        if (this.txFifo.length < RP2040Spi.FIFO_DEPTH) {
          this.txFifo.push(wordToWrite);
        } else {
          // Transmit FIFO Full: write is discarded / ignored
        }
        this.updateInterrupts();
        this.updateDma();
        break;
      }

      case REG_SSPSR:
        // Status register is Read-Only; writes ignored
        break;

      case REG_SSPCPSR:
        // CPSDVSR: Even divisor 2..254. Bit 0 is hardwired to 0.
        this.cpsr = (value & 0xfe);
        this.recalculateBitTiming();
        break;

      case REG_SSPIMSC:
        this.imsc = value & 0x000f;
        this.updateInterrupts();
        break;

      case REG_SSPICR:
        if (value & INT_ROR) {
          this.rorRaw = false;
        }
        if (value & INT_RT) {
          this.rtRaw = false;
          this.rxTimeoutTimerCycles = 0;
        }
        this.updateInterrupts();
        break;

      case REG_SSPDMACR:
        this.dmacr = value & 0x0003;
        this.updateDma();
        break;

      default:
        super.writeUint32(offset, value);
        break;
    }
  }

  // ─── Diagnostics & Inspection API ──────────────────────────────────────────────────

  public getDiagnostics(): SpiDiagnostics {
    return {
      name: this.name,
      controllerIndex: this.controllerIndex,
      enabled: this.enabled,
      isMaster: this.isMaster,
      cpol: this.cpol ? 1 : 0,
      cpha: this.cpha ? 1 : 0,
      dataBits: this.dataSizeBits,
      baudRate_Hz: this.baudRate,
      txFifoDepth: this.txFifo.length,
      rxFifoDepth: this.rxFifo.length,
      busy: !!(this.status & SR_BSY),
      interruptMask: this.imsc & 0x0f,
      rawInterrupts: this.rawInterrupts,
      maskedInterrupts: this.maskedInterrupts,
      txDmaEnabled: !!(this.dmacr & DMACR_TXDMAE),
      rxDmaEnabled: !!(this.dmacr & DMACR_RXDMAE),
    };
  }

  public getTxFifo(): number[] {
    return [...this.txFifo];
  }

  public getRxFifo(): number[] {
    return [...this.rxFifo];
  }

  public clearFifos(): void {
    this.txFifo = [];
    this.rxFifo = [];
    this.isShifting = false;
    this.csnOutput = true;
    this.sckOutput = this.cpol;
    this.updateInterrupts();
    this.updateDma();
  }
}

// ─── Logic Analyzer Protocol Decoder (`decodeSpi`) ───────────────────────────────────

/**
 * Protocol decoder for logic analyzer traces of SPI transactions.
 * Decodes captured digital samples into discrete data words based on CPOL, CPHA, and word size.
 */
export function decodeSpi(
  samples: SpiSignalSample[],
  cpol = 0,
  cpha = 0,
  wordSize = 8
): SpiDecodedPacket[] {
  const packets: SpiDecodedPacket[] = [];
  if (samples.length < 2) return packets;

  let activePacket: {
    startTime: number;
    mosiBits: number[];
    misoBits: number[];
  } | null = null;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];

    // CSn active LOW
    const csActive = !curr.cs;
    const csTransitionedLow = prev.cs && !curr.cs;
    const csTransitionedHigh = !prev.cs && curr.cs;

    if (csTransitionedLow || (!activePacket && csActive)) {
      activePacket = {
        startTime: curr.timestamp,
        mosiBits: [],
        misoBits: [],
      };
    }

    if (csActive && activePacket) {
      // Determine sampling clock edge based on CPOL and CPHA:
      // Mode 0 (CPOL=0, CPHA=0): Rising edge
      // Mode 1 (CPOL=0, CPHA=1): Falling edge
      // Mode 2 (CPOL=1, CPHA=0): Falling edge
      // Mode 3 (CPOL=1, CPHA=1): Rising edge
      const isRisingEdge = !prev.sck && curr.sck;
      const isFallingEdge = prev.sck && !curr.sck;

      const isSampleEdge = (cpol === 0 && cpha === 0 && isRisingEdge) ||
                           (cpol === 0 && cpha === 1 && isFallingEdge) ||
                           (cpol === 1 && cpha === 0 && isFallingEdge) ||
                           (cpol === 1 && cpha === 1 && isRisingEdge);

      if (isSampleEdge) {
        activePacket.mosiBits.push(curr.mosi ? 1 : 0);
        activePacket.misoBits.push(curr.miso ? 1 : 0);

        if (activePacket.mosiBits.length === wordSize) {
          // Assemble word
          let mosiVal = 0;
          let misoVal = 0;
          for (let b = 0; b < wordSize; b++) {
            mosiVal = (mosiVal << 1) | activePacket.mosiBits[b];
            misoVal = (misoVal << 1) | activePacket.misoBits[b];
          }

          packets.push({
            startTime: activePacket.startTime,
            endTime: curr.timestamp,
            mosiData: mosiVal,
            misoData: misoVal,
            bits: wordSize,
          });

          // Reset for next word if CS stays low
          activePacket = {
            startTime: curr.timestamp,
            mosiBits: [],
            misoBits: [],
          };
        }
      }
    }

    if (csTransitionedHigh) {
      activePacket = null;
    }
  }

  return packets;
}
