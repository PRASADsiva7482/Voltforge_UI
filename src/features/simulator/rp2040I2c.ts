/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 Synopsys DesignWare DW_apb_i2c Controller Peripheral Emulation
 * 
 * Implements genuine DW_apb_i2c register interface, 16-entry TX/RX FIFOs, open-drain
 * bus physics, cycle-accurate SCL/SDA bit timing, clock stretching, interrupt masking,
 * atomic aliases, and DMA DREQ integration for I2C0 and I2C1.
 * 
 * Hardware Reference:
 * - Raspberry Pi RP2040 Datasheet Section 4.3 "I2C"
 * - Synopsys DesignWare DW_apb_i2c Databook
 * - Raspberry Pi Pico SDK: hardware/regs/i2c.h
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040, BasePeripheral, type Peripheral } from 'rp2040js';
import type { I2cVirtualDevice } from './rp2040I2cDevice';

// ─── Register Offsets (RP2040 Datasheet Section 4.3.16) ───────────────────────────────

export const REG_IC_CON                = 0x00;
export const REG_IC_TAR                = 0x04;
export const REG_IC_SAR                = 0x08;
export const REG_IC_DATA_CMD           = 0x10;
export const REG_IC_SS_SCL_HCNT        = 0x14;
export const REG_IC_SS_SCL_LCNT        = 0x18;
export const REG_IC_FS_SCL_HCNT        = 0x1c;
export const REG_IC_FS_SCL_LCNT        = 0x20;
export const REG_IC_INTR_STAT          = 0x2c;
export const REG_IC_INTR_MASK          = 0x30;
export const REG_IC_RAW_INTR_STAT      = 0x34;
export const REG_IC_RX_TL              = 0x38;
export const REG_IC_TX_TL              = 0x3c;
export const REG_IC_CLR_INTR           = 0x40;
export const REG_IC_CLR_RX_UNDER       = 0x44;
export const REG_IC_CLR_RX_OVER        = 0x48;
export const REG_IC_CLR_TX_OVER        = 0x4c;
export const REG_IC_CLR_RD_REQ         = 0x50;
export const REG_IC_CLR_TX_ABRT        = 0x54;
export const REG_IC_CLR_RX_DONE        = 0x58;
export const REG_IC_CLR_ACTIVITY       = 0x5c;
export const REG_IC_CLR_STOP_DET       = 0x60;
export const REG_IC_CLR_START_DET      = 0x64;
export const REG_IC_CLR_GEN_CALL       = 0x68;
export const REG_IC_ENABLE             = 0x6c;
export const REG_IC_STATUS             = 0x70;
export const REG_IC_TXFLR              = 0x74;
export const REG_IC_RXFLR              = 0x78;
export const REG_IC_SDA_HOLD           = 0x7c;
export const REG_IC_TX_ABRT_SOURCE     = 0x80;
export const REG_IC_SLV_DATA_NACK_ONLY = 0x84;
export const REG_IC_DMA_CR             = 0x88;
export const REG_IC_DMA_TDLR           = 0x8c;
export const REG_IC_DMA_RDLR           = 0x90;
export const REG_IC_SDA_SETUP          = 0x94;
export const REG_IC_ACK_GENERAL_CALL   = 0x98;
export const REG_IC_ENABLE_STATUS      = 0x9c;
export const REG_IC_FS_SPKLEN          = 0xa0;
export const REG_IC_CLR_RESTART_DET    = 0xa8;
export const REG_IC_COMP_PARAM_1       = 0xf4;
export const REG_IC_COMP_VERSION       = 0xf8;
export const REG_IC_COMP_TYPE          = 0xfc;

// ─── Bitfield Masks ──────────────────────────────────────────────────────────────────

// IC_CON
export const CON_MASTER_MODE              = 1 << 0;
export const CON_SPEED_SHIFT              = 1;
export const CON_SPEED_MASK               = 0x3;
export const CON_10BITADDR_SLAVE          = 1 << 3;
export const CON_10BITADDR_MASTER         = 1 << 4;
export const CON_RESTART_EN               = 1 << 5;
export const CON_SLAVE_DISABLE            = 1 << 6;
export const CON_STOP_DET_IFADDRESSED     = 1 << 7;
export const CON_TX_EMPTY_CTRL            = 1 << 8;
export const CON_RX_FIFO_FULL_HLD_CTRL    = 1 << 9;

// IC_DATA_CMD
export const CMD_DAT_MASK                 = 0xff;
export const CMD_READ                     = 1 << 8;
export const CMD_STOP                     = 1 << 9;
export const CMD_RESTART                  = 1 << 10;
export const CMD_FIRST_DATA_BYTE          = 1 << 11;

// IC_ENABLE
export const ENABLE_ENABLE                = 1 << 0;
export const ENABLE_ABORT                 = 1 << 1;
export const ENABLE_TX_CMD_BLOCK          = 1 << 2;

// IC_STATUS
export const STATUS_ACTIVITY              = 1 << 0;
export const STATUS_TFNF                  = 1 << 1; // Transmit FIFO Not Full
export const STATUS_TFE                   = 1 << 2; // Transmit FIFO Empty
export const STATUS_RFNE                  = 1 << 3; // Receive FIFO Not Empty
export const STATUS_RFF                   = 1 << 4; // Receive FIFO Full
export const STATUS_MST_ACTIVITY          = 1 << 5; // Master FSM Activity
export const STATUS_SLV_ACTIVITY          = 1 << 6; // Slave FSM Activity

// Interrupt Bits (RAW_INTR_STAT, INTR_MASK, INTR_STAT)
export const INTR_RX_UNDER                = 1 << 0;
export const INTR_RX_OVER                 = 1 << 1;
export const INTR_RX_FULL                 = 1 << 2;
export const INTR_TX_OVER                 = 1 << 3;
export const INTR_TX_EMPTY                = 1 << 4;
export const INTR_RD_REQ                  = 1 << 5;
export const INTR_TX_ABRT                 = 1 << 6;
export const INTR_RX_DONE                 = 1 << 7;
export const INTR_ACTIVITY                = 1 << 8;
export const INTR_STOP_DET                = 1 << 9;
export const INTR_START_DET               = 1 << 10;
export const INTR_GEN_CALL                = 1 << 11;
export const INTR_RESTART_DET             = 1 << 12;

// IC_TX_ABRT_SOURCE
export const ABRT_7B_ADDR_NOACK           = 1 << 0;
export const ABRT_10ADDR1_NOACK           = 1 << 1;
export const ABRT_10ADDR2_NOACK           = 1 << 2;
export const ABRT_TXDATA_NOACK            = 1 << 3;
export const ABRT_GCALL_NOACK             = 1 << 4;
export const ABRT_GCALL_READ              = 1 << 5;
export const ABRT_HS_ACKDET               = 1 << 6;
export const ABRT_SBYTE_ACKDET            = 1 << 7;
export const ABRT_HS_NORSTRT              = 1 << 8;
export const ABRT_SBYTE_NORSTRT           = 1 << 9;
export const ABRT_10B_RD_NORSTRT          = 1 << 10;
export const ABRT_MASTER_DIS              = 1 << 11;
export const ABRT_ARB_LOST                = 1 << 12;
export const ABRT_SLVFLUSH_TXFIFO         = 1 << 13;
export const ABRT_SLV_ARBLOST             = 1 << 14;
export const ABRT_SLVRD_INTX              = 1 << 15;
export const ABRT_USER_ABRT               = 1 << 16;

// IC_DMA_CR
export const DMA_RDMAE                    = 1 << 0;
export const DMA_TDMAE                    = 1 << 1;

// Official RP2040 DMA DREQ channels (RP2040 Datasheet Table 43)
export const DREQ_I2C0_TX                 = 32;
export const DREQ_I2C0_RX                 = 33;
export const DREQ_I2C1_TX                 = 34;
export const DREQ_I2C1_RX                 = 35;

export interface II2cDMAChannels {
  rx: number;
  tx: number;
}

export interface I2cDiagnostics {
  name: string;
  controllerIndex: number;
  enabled: boolean;
  masterMode: boolean;
  speed: 'standard' | 'fast' | 'unknown';
  targetAddress: number;
  txFifoCount: number;
  rxFifoCount: number;
  busy: boolean;
  sdaLow: boolean;
  sclLow: boolean;
  rawInterrupts: number;
  maskedInterrupts: number;
  abortSource: number;
  devicesAttached: string[];
}

enum MasterPhase {
  IDLE = 0,
  START_SETUP = 1,
  START_HOLD = 2,
  BIT_LOW = 3,
  BIT_HIGH = 4,
  STOP_SETUP = 5,
  STOP_HOLD = 6,
}

/**
 * High-fidelity emulation of the RP2040 Synopsys DesignWare DW_apb_i2c controller.
 */
export class RP2040I2c extends BasePeripheral implements Peripheral {
  public static readonly FIFO_DEPTH = 16;

  readonly irq: number;
  readonly dreq: II2cDMAChannels;
  readonly controllerIndex: number;

  // ── Registers ──────────────────────────────────────────────────────────────────────
  private control: number = 0x65;             // IC_CON (Reset: MASTER=1, SPEED=2 (Fast), RESTART_EN=1, SLAVE_DIS=1)
  private targetAddress: number = 0x55;       // IC_TAR (Reset: 0x55)
  private slaveAddress: number = 0x55;        // IC_SAR (Reset: 0x55)
  private ssClockHighPeriod: number = 40;     // IC_SS_SCL_HCNT
  private ssClockLowPeriod: number = 47;      // IC_SS_SCL_LCNT
  private fsClockHighPeriod: number = 6;      // IC_FS_SCL_HCNT
  private fsClockLowPeriod: number = 13;      // IC_FS_SCL_LCNT
  private interruptMask: number = 0x08ff;     // IC_INTR_MASK (Reset: 0x08ff)
  private rawInterrupts: number = INTR_TX_EMPTY; // IC_RAW_INTR_STAT (TX_EMPTY set at reset)
  private rxThreshold: number = 0;            // IC_RX_TL
  private txThreshold: number = 0;            // IC_TX_TL
  private enableReg: number = 0;              // IC_ENABLE (Reset: 0)
  private sdaHold: number = 0x01;             // IC_SDA_HOLD (Reset: 1)
  private abortSource: number = 0;            // IC_TX_ABRT_SOURCE
  private slvDataNackOnly: number = 0;        // IC_SLV_DATA_NACK_ONLY
  private dmaCr: number = 0;                  // IC_DMA_CR
  private dmaTdlr: number = 0;                // IC_DMA_TDLR
  private dmaRdlr: number = 0;                // IC_DMA_RDLR
  private sdaSetup: number = 100;             // IC_SDA_SETUP (Reset: 100)
  private ackGeneralCall: number = 1;         // IC_ACK_GENERAL_CALL (Reset: 1)
  private fsSpklen: number = 7;               // IC_FS_SPKLEN (Reset: 7)

  // ── 16-Entry FIFOs ─────────────────────────────────────────────────────────────────
  private txFifo: number[] = [];              // Stores 12-bit command entries
  private rxFifo: number[] = [];              // Stores 8-bit received bytes

  // ── Open-Drain Bus Pins ────────────────────────────────────────────────────────────
  // In I2C, true = actively driving LOW (0.0 V, 50 Ω); false = released HIGH (High-Z)
  private sdaLow: boolean = false;
  private sclLow: boolean = false;

  // External bus state sensed via MNA / pull-ups
  private sdaInputState: boolean = true;      // Logical high if pulled up
  private sclInputState: boolean = true;      // Logical high if pulled up

  // ── Master State Machine ───────────────────────────────────────────────────────────
  private phase: MasterPhase = MasterPhase.IDLE;
  private phaseCyclesLeft: number = 0;
  private currentCmd: number = 0;
  private currentByteToShift: number = 0;
  private currentBitIndex: number = 0;        // 0 to 8 (bits 7..0 + ACK bit)
  private isReadTransaction: boolean = false;
  private isAddressPhase: boolean = false;
  private isAckBit: boolean = false;
  private pendingRestart: boolean = false;
  private busHasStart: boolean = false;
  private receivedShiftByte: number = 0;
  private slaveReadByte: number = 0;
  private activeSlave: I2cVirtualDevice | null = null;

  // Clock configuration
  private peripheralClock_Hz: number = 125_000_000;

  // Attached Virtual Devices
  private attachedDevices: Map<number, I2cVirtualDevice> = new Map();

  // Callbacks for GPIO bridge & instruments
  public onSdaPinChange?: (sdaLow: boolean) => void;
  public onSclPinChange?: (sclLow: boolean) => void;
  public onTransactionComplete?: (addr: number, read: boolean, bytes: number[], ack: boolean) => void;

  constructor(
    rp2040: RP2040,
    name: string,
    irq: number,
    dreq: II2cDMAChannels,
    controllerIndex: number = 0
  ) {
    super(rp2040, name);
    this.irq = irq;
    this.dreq = dreq;
    this.controllerIndex = controllerIndex;
    this.updateInterrupts();
  }

  // ─── Virtual Device Management ─────────────────────────────────────────────────────

  public attachDevice(device: I2cVirtualDevice): void {
    this.attachedDevices.set(device.address & 0x7f, device);
  }

  public detachDevice(address: number): void {
    this.attachedDevices.delete(address & 0x7f);
  }

  public getAttachedDevices(): I2cVirtualDevice[] {
    return Array.from(this.attachedDevices.values());
  }

  // ─── Configuration Getters ─────────────────────────────────────────────────────────

  public get enabled(): boolean {
    return !!(this.enableReg & ENABLE_ENABLE);
  }

  public get isMaster(): boolean {
    return !!(this.control & CON_MASTER_MODE);
  }

  public get speedMode(): number {
    return (this.control >>> CON_SPEED_SHIFT) & CON_SPEED_MASK;
  }

  public get sclHighPeriodCycles(): number {
    return this.speedMode === 1 ? this.ssClockHighPeriod : this.fsClockHighPeriod;
  }

  public get sclLowPeriodCycles(): number {
    return this.speedMode === 1 ? this.ssClockLowPeriod : this.fsClockLowPeriod;
  }

  public get baudRate(): number {
    const totalCycles = this.sclHighPeriodCycles + this.sclLowPeriodCycles;
    if (totalCycles <= 0) return 100_000;
    return Math.round(this.peripheralClock_Hz / totalCycles);
  }

  public setPeripheralClock(freq_Hz: number): void {
    if (freq_Hz > 0) {
      this.peripheralClock_Hz = freq_Hz;
    }
  }

  public get isSdaLineDrivenLow(): boolean {
    return this.sdaLow;
  }

  public get isSclLineDrivenLow(): boolean {
    return this.sclLow;
  }

  public get sdaDriveHigh(): boolean {
    return !this.sdaLow;
  }

  public get sclDriveHigh(): boolean {
    return !this.sclLow;
  }

  // ─── Status Register & Interrupts ──────────────────────────────────────────────────

  public get status(): number {
    let stat = 0;
    const isBusy = this.phase !== MasterPhase.IDLE || this.txFifo.length > 0;
    if (isBusy) {
      stat |= STATUS_ACTIVITY;
      stat |= STATUS_MST_ACTIVITY;
    }
    if (this.txFifo.length < RP2040I2c.FIFO_DEPTH) stat |= STATUS_TFNF;
    if (this.txFifo.length === 0 && this.phase === MasterPhase.IDLE) stat |= STATUS_TFE;
    if (this.rxFifo.length > 0) stat |= STATUS_RFNE;
    if (this.rxFifo.length >= RP2040I2c.FIFO_DEPTH) stat |= STATUS_RFF;
    return stat;
  }

  public get intStatus(): number {
    return this.rawInterrupts & this.interruptMask;
  }

  public updateInterrupts(): void {
    // TX_EMPTY interrupt
    if (this.txFifo.length <= this.txThreshold) {
      this.rawInterrupts |= INTR_TX_EMPTY;
    } else {
      this.rawInterrupts &= ~INTR_TX_EMPTY;
    }

    // RX_FULL interrupt
    if (this.rxFifo.length >= (this.rxThreshold + 1)) {
      this.rawInterrupts |= INTR_RX_FULL;
    } else {
      this.rawInterrupts &= ~INTR_RX_FULL;
    }

    // Activity flag
    if (this.phase !== MasterPhase.IDLE) {
      this.rawInterrupts |= INTR_ACTIVITY;
    }

    // Dispatch to Cortex-M0+ NVIC
    const hasIrq = (this.rawInterrupts & this.interruptMask) !== 0;
    this.rp2040.setInterrupt(this.irq, hasIrq);

    // Update DMA DREQ signals
    if (this.dreq) {
      const txThreshold = this.dmaTdlr > 0 ? this.dmaTdlr : (RP2040I2c.FIFO_DEPTH - 1);
      if ((this.dmaCr & DMA_TDMAE) && this.txFifo.length <= txThreshold) {
        this.rp2040.dma?.setDREQ(this.dreq.tx);
      } else {
        this.rp2040.dma?.clearDREQ(this.dreq.tx);
      }

      if ((this.dmaCr & DMA_RDMAE) && this.rxFifo.length > this.dmaRdlr) {
        this.rp2040.dma?.setDREQ(this.dreq.rx);
      } else {
        this.rp2040.dma?.clearDREQ(this.dreq.rx);
      }
    }
  }

  // ─── Input Line Sensing from GPIO Bridge / MNA ─────────────────────────────────────

  public feedSdaPinState(pinHigh: boolean): void {
    this.sdaInputState = pinHigh;
  }

  public feedSclPinState(pinHigh: boolean): void {
    this.sclInputState = pinHigh;
  }

  private setSda(driveLow: boolean): void {
    if (this.sdaLow !== driveLow) {
      this.sdaLow = driveLow;
      this.onSdaPinChange?.(driveLow);
    }
  }

  private setScl(driveLow: boolean): void {
    if (this.sclLow !== driveLow) {
      this.sclLow = driveLow;
      this.onSclPinChange?.(driveLow);
    }
  }

  // ─── Master State Machine Step ─────────────────────────────────────────────────────

  /**
   * Advances the I²C state machine by deltaCycles CPU cycles.
   */
  public tickCycles(deltaCycles: number, clkPeri?: number, clkSys?: number): void {
    if (clkPeri && clkPeri > 0) {
      this.peripheralClock_Hz = clkPeri;
    }

    if (!this.enabled || !this.isMaster) {
      return;
    }

    // Step clock stretching on attached devices
    for (const dev of this.attachedDevices.values()) {
      if ((dev as any).stepStretch) {
        (dev as any).stepStretch(deltaCycles);
      }
    }

    let remaining = deltaCycles;
    while (remaining > 0) {
      // If idle, check if there are pending commands in TX FIFO
      if (this.phase === MasterPhase.IDLE) {
        if (this.txFifo.length > 0 && !(this.enableReg & ENABLE_TX_CMD_BLOCK)) {
          this.startNextCommand();
        } else {
          break;
        }
      }

      // Check Clock Stretching: if SCL is released (sclLow == false) but SCL line is pulled low externally
      if (!this.sclLow && (!this.sclInputState || this.activeSlave?.isClockStretching?.())) {
        // Paused by clock stretching: cannot advance high phase timer
        break;
      }

      const step = Math.min(remaining, this.phaseCyclesLeft);
      this.phaseCyclesLeft -= step;
      remaining -= step;

      if (this.phaseCyclesLeft <= 0) {
        this.advancePhase();
      }
    }

    this.updateInterrupts();
  }

  private startNextCommand(): void {
    this.currentCmd = this.txFifo.shift()!;
    this.updateInterrupts();

    const isRestart = !!(this.currentCmd & CMD_RESTART);
    const readMode = !!(this.currentCmd & CMD_READ);

    if (!this.busHasStart || isRestart) {
      // Initiate START condition: SDA pulled low while SCL is high
      this.phase = MasterPhase.START_SETUP;
      this.phaseCyclesLeft = Math.max(2, Math.floor(this.sclHighPeriodCycles / 2));
      this.setSda(false); // Released
      this.setScl(false); // Released
      this.rawInterrupts |= isRestart ? INTR_RESTART_DET : INTR_START_DET;
      this.pendingRestart = isRestart;
      this.busHasStart = true;
    } else {
      // Continue previous transaction directly with next data byte
      this.setupNextByte();
    }
  }

  private setupNextByte(): void {
    const readMode = !!(this.currentCmd & CMD_READ);
    this.isReadTransaction = readMode;

    if (this.isAddressPhase) {
      // Address byte: 7-bit target address + R/W bit
      const rwBit = readMode ? 1 : 0;
      this.currentByteToShift = ((this.targetAddress & 0x7f) << 1) | rwBit;
      this.currentBitIndex = 0;
      this.isAckBit = false;

      // Identify active slave
      this.activeSlave = this.attachedDevices.get(this.targetAddress & 0x7f) || null;
      if (this.activeSlave) {
        this.activeSlave.onStart(readMode, this.pendingRestart);
      }
    } else if (!readMode) {
      // Master Write data byte
      this.currentByteToShift = this.currentCmd & CMD_DAT_MASK;
      this.currentBitIndex = 0;
      this.isAckBit = false;
    } else {
      // Master Read data byte
      if (this.activeSlave) {
        this.slaveReadByte = this.activeSlave.onReadByte(!!(this.currentCmd & CMD_STOP));
      } else {
        this.slaveReadByte = 0xff;
      }
      this.currentByteToShift = this.slaveReadByte;
      this.receivedShiftByte = 0;
      this.currentBitIndex = 0;
      this.isAckBit = false;
    }

    this.phase = MasterPhase.BIT_LOW;
    this.phaseCyclesLeft = this.sclLowPeriodCycles;
    this.setScl(true); // Pull SCL low to begin bit transmission
    this.driveBitLevel();
  }

  private driveBitLevel(): void {
    if (this.isAddressPhase || !this.isReadTransaction) {
      // Master transmitting address or data
      if (this.currentBitIndex < 8) {
        // Transmit bit (MSB first)
        const bitVal = ((this.currentByteToShift >>> (7 - this.currentBitIndex)) & 1) === 1;
        this.setSda(!bitVal); // true = drive low (0), false = release (1)
      } else {
        // ACK bit: if slave attached, slave drives ACK (low), otherwise released (high=NACK)
        if (this.activeSlave) {
          this.setSda(true); // Slave pulls SDA low to ACK
        } else {
          this.setSda(false); // Released
        }
      }
    } else {
      // Master receiving data from slave
      if (this.currentBitIndex < 8) {
        if (this.activeSlave) {
          const bitVal = ((this.slaveReadByte >>> (7 - this.currentBitIndex)) & 1) === 1;
          this.setSda(!bitVal);
        } else {
          this.setSda(false);
        }
      } else {
        // Master ACK/NACK bit:
        // In I2C, master drives ACK (low) for multi-byte, NACK (high) on final byte / STOP
        const isStop = !!(this.currentCmd & CMD_STOP) || this.txFifo.length === 0;
        this.setSda(!isStop); // If not stop, drive ACK (low=true); if stop, NACK (release=false)
      }
    }
  }

  private advancePhase(): void {
    switch (this.phase) {
      case MasterPhase.START_SETUP:
        // Pull SDA low while SCL is high (START condition!)
        this.setSda(true);
        this.phase = MasterPhase.START_HOLD;
        this.phaseCyclesLeft = Math.max(2, Math.floor(this.sclHighPeriodCycles / 2));
        break;

      case MasterPhase.START_HOLD:
        // Pull SCL low to finish START
        this.setScl(true);
        this.isAddressPhase = true;
        this.setupNextByte();
        break;

      case MasterPhase.BIT_LOW:
        // SCL Low period complete: release SCL to High
        this.setScl(false);
        this.phase = MasterPhase.BIT_HIGH;
        this.phaseCyclesLeft = this.sclHighPeriodCycles;
        break;

      case MasterPhase.BIT_HIGH: {
        // Sample SDA at end of SCL High period
        const sampledSdaHigh = this.sampleSda();

        if (this.currentBitIndex < 8) {
          if (this.isReadTransaction && !this.isAddressPhase) {
            // Receive bit from slave
            if (sampledSdaHigh) {
              this.receivedShiftByte |= (1 << (7 - this.currentBitIndex));
            }
          }
          this.currentBitIndex++;
          // Prepare next bit low phase
          this.setScl(true);
          this.phase = MasterPhase.BIT_LOW;
          this.phaseCyclesLeft = this.sclLowPeriodCycles;
          this.driveBitLevel();
        } else {
          // 9th bit: ACK/NACK verification!
          const ackReceived = !sampledSdaHigh; // Low = ACK, High = NACK

          if (this.isAddressPhase) {
            this.isAddressPhase = false;
            if (!ackReceived) {
              // Address NACK!
              this.abortTransaction(ABRT_7B_ADDR_NOACK);
              return;
            }
            // Address ACKed: proceed to transmit or receive data byte in this.currentCmd
            this.setupNextByte();
          } else if (!this.isReadTransaction) {
            // Data byte write complete: check slave ACK
            if (!ackReceived) {
              // Data NACK!
              this.abortTransaction(ABRT_TXDATA_NOACK);
              return;
            }
            if (this.activeSlave) {
              this.activeSlave.onWriteByte(this.currentCmd & CMD_DAT_MASK);
            }
            this.checkWriteDataOrStop();
          } else {
            // Data byte read complete: push to RX FIFO
            const byteReceived = this.activeSlave ? this.slaveReadByte : this.receivedShiftByte;
            this.pushRxByte(byteReceived);
            this.checkWriteDataOrStop();
          }
        }
        break;
      }

      case MasterPhase.STOP_SETUP:
        // Release SDA while SCL is high (STOP condition!)
        this.setSda(false);
        this.phase = MasterPhase.STOP_HOLD;
        this.phaseCyclesLeft = Math.max(2, Math.floor(this.sclHighPeriodCycles / 2));
        break;

      case MasterPhase.STOP_HOLD:
        // STOP condition complete!
        this.setScl(false);
        this.setSda(false);
        this.busHasStart = false;
        this.phase = MasterPhase.IDLE;
        this.rawInterrupts |= INTR_STOP_DET;
        if (this.activeSlave) {
          this.activeSlave.onStop();
          this.activeSlave = null;
        }
        this.updateInterrupts();
        break;
    }
  }

  private sampleSda(): boolean {
    if (this.isAddressPhase || !this.isReadTransaction) {
      if (this.currentBitIndex === 8) {
        // Sampling slave ACK
        if (this.activeSlave) return false; // Slave drives ACK (low)
        return this.sdaInputState; // External line state
      }
      return !this.sdaLow && this.sdaInputState;
    } else {
      // Reading from slave
      if (this.currentBitIndex < 8) {
        if (this.activeSlave) {
          return ((this.slaveReadByte >>> (7 - this.currentBitIndex)) & 1) === 1;
        }
        return this.sdaInputState;
      } else {
        // Master drives ACK
        return !this.sdaLow;
      }
    }
  }

  private checkWriteDataOrStop(): void {
    const isStop = !!(this.currentCmd & CMD_STOP);

    if (isStop || this.txFifo.length === 0) {
      // Issue STOP condition:
      // While SCL is low, drive SDA low, then release SCL high
      this.setSda(true);
      this.setScl(false);
      this.phase = MasterPhase.STOP_SETUP;
      this.phaseCyclesLeft = Math.max(2, Math.floor(this.sclHighPeriodCycles / 2));
    } else {
      // Immediately start next command in FIFO
      this.startNextCommand();
    }
  }

  private abortTransaction(source: number): void {
    this.abortSource |= source;
    this.rawInterrupts |= INTR_TX_ABRT;
    this.setScl(false);
    this.setSda(false);
    this.busHasStart = false;
    this.phase = MasterPhase.STOP_SETUP;
    this.phaseCyclesLeft = this.sclHighPeriodCycles;
    if (this.activeSlave) {
      this.activeSlave.onStop();
      this.activeSlave = null;
    }
    this.updateInterrupts();
  }

  private pushRxByte(byte: number): void {
    if (this.rxFifo.length < RP2040I2c.FIFO_DEPTH) {
      this.rxFifo.push(byte & 0xff);
    } else {
      // RX Overflow
      this.rawInterrupts |= INTR_RX_OVER;
    }
    this.updateInterrupts();
  }

  // ─── Register Read / Write Interface ───────────────────────────────────────────────

  public override readUint32(offset: number): number {
    const regOffset = offset & 0xfff;

    switch (regOffset) {
      case REG_IC_CON:
        return this.control;

      case REG_IC_TAR:
        return this.targetAddress;

      case REG_IC_SAR:
        return this.slaveAddress;

      case REG_IC_DATA_CMD:
        if (this.rxFifo.length === 0) {
          this.rawInterrupts |= INTR_RX_UNDER;
          this.updateInterrupts();
          return 0;
        }
        const val = this.rxFifo.shift()!;
        this.updateInterrupts();
        return val;

      case REG_IC_SS_SCL_HCNT:
        return this.ssClockHighPeriod;

      case REG_IC_SS_SCL_LCNT:
        return this.ssClockLowPeriod;

      case REG_IC_FS_SCL_HCNT:
        return this.fsClockHighPeriod;

      case REG_IC_FS_SCL_LCNT:
        return this.fsClockLowPeriod;

      case REG_IC_INTR_STAT:
        return this.intStatus;

      case REG_IC_INTR_MASK:
        return this.interruptMask;

      case REG_IC_RAW_INTR_STAT:
        return this.rawInterrupts;

      case REG_IC_RX_TL:
        return this.rxThreshold;

      case REG_IC_TX_TL:
        return this.txThreshold;

      case REG_IC_CLR_INTR: {
        const prev = this.intStatus;
        this.abortSource &= ABRT_SBYTE_NORSTRT;
        this.rawInterrupts &= ~(INTR_RX_UNDER | INTR_RX_OVER | INTR_TX_OVER | INTR_RD_REQ |
                                INTR_TX_ABRT | INTR_RX_DONE | INTR_ACTIVITY | INTR_STOP_DET |
                                INTR_START_DET | INTR_GEN_CALL | INTR_RESTART_DET);
        this.updateInterrupts();
        return prev;
      }

      case REG_IC_CLR_RX_UNDER:
        this.rawInterrupts &= ~INTR_RX_UNDER;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_RX_OVER:
        this.rawInterrupts &= ~INTR_RX_OVER;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_TX_OVER:
        this.rawInterrupts &= ~INTR_TX_OVER;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_RD_REQ:
        this.rawInterrupts &= ~INTR_RD_REQ;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_TX_ABRT: {
        const src = this.abortSource;
        this.abortSource &= ABRT_SBYTE_NORSTRT;
        this.rawInterrupts &= ~INTR_TX_ABRT;
        this.updateInterrupts();
        return src;
      }

      case REG_IC_CLR_RX_DONE:
        this.rawInterrupts &= ~INTR_RX_DONE;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_ACTIVITY:
        this.rawInterrupts &= ~INTR_ACTIVITY;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_STOP_DET:
        this.rawInterrupts &= ~INTR_STOP_DET;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_START_DET:
        this.rawInterrupts &= ~INTR_START_DET;
        this.updateInterrupts();
        return 0;

      case REG_IC_CLR_GEN_CALL:
        this.rawInterrupts &= ~INTR_GEN_CALL;
        this.updateInterrupts();
        return 0;

      case REG_IC_ENABLE:
        return this.enableReg;

      case REG_IC_STATUS:
        return this.status;

      case REG_IC_TXFLR:
        return this.txFifo.length;

      case REG_IC_RXFLR:
        return this.rxFifo.length;

      case REG_IC_SDA_HOLD:
        return this.sdaHold;

      case REG_IC_TX_ABRT_SOURCE:
        return this.abortSource;

      case REG_IC_SLV_DATA_NACK_ONLY:
        return this.slvDataNackOnly;

      case REG_IC_DMA_CR:
        return this.dmaCr;

      case REG_IC_DMA_TDLR:
        return this.dmaTdlr;

      case REG_IC_DMA_RDLR:
        return this.dmaRdlr;

      case REG_IC_SDA_SETUP:
        return this.sdaSetup;

      case REG_IC_ACK_GENERAL_CALL:
        return this.ackGeneralCall;

      case REG_IC_ENABLE_STATUS:
        return this.enableReg & ENABLE_ENABLE;

      case REG_IC_FS_SPKLEN:
        return this.fsSpklen;

      case REG_IC_CLR_RESTART_DET:
        this.rawInterrupts &= ~INTR_RESTART_DET;
        this.updateInterrupts();
        return 0;

      case REG_IC_COMP_PARAM_1:
        return 0x00000000;

      case REG_IC_COMP_VERSION:
        return 0x3230312a; // ASCII "201*"

      case REG_IC_COMP_TYPE:
        return 0x44570140; // ASCII "DW\x01@"

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
        case 1: newVal = curVal ^ value; break;
        case 2: newVal = curVal | value; break;
        case 3: newVal = curVal & ~value; break;
      }
      this.writeUint32(regOffset, newVal);
      return;
    }

    switch (regOffset) {
      case REG_IC_CON:
        this.control = value & 0x3ff;
        break;

      case REG_IC_TAR:
        this.targetAddress = value & 0x3ff;
        break;

      case REG_IC_SAR:
        this.slaveAddress = value & 0x3ff;
        break;

      case REG_IC_DATA_CMD:
        if (this.txFifo.length >= RP2040I2c.FIFO_DEPTH) {
          this.rawInterrupts |= INTR_TX_OVER;
          this.updateInterrupts();
        } else {
          this.txFifo.push(value & 0xfff);
          this.updateInterrupts();
        }
        break;

      case REG_IC_SS_SCL_HCNT:
        this.ssClockHighPeriod = value & 0xffff;
        break;

      case REG_IC_SS_SCL_LCNT:
        this.ssClockLowPeriod = value & 0xffff;
        break;

      case REG_IC_FS_SCL_HCNT:
        this.fsClockHighPeriod = value & 0xffff;
        break;

      case REG_IC_FS_SCL_LCNT:
        this.fsClockLowPeriod = value & 0xffff;
        break;

      case REG_IC_INTR_MASK:
        this.interruptMask = value & 0x1fff;
        this.updateInterrupts();
        break;

      case REG_IC_RX_TL:
        this.rxThreshold = Math.min(15, value & 0xff);
        this.updateInterrupts();
        break;

      case REG_IC_TX_TL:
        this.txThreshold = Math.min(15, value & 0xff);
        this.updateInterrupts();
        break;

      case REG_IC_ENABLE: {
        const prevEn = (this.enableReg & ENABLE_ENABLE) !== 0;
        this.enableReg = value & 0x07;
        const newEn = (this.enableReg & ENABLE_ENABLE) !== 0;

        if (value & ENABLE_ABORT) {
          this.abortTransaction(ABRT_USER_ABRT);
          this.enableReg &= ~ENABLE_ABORT;
        }

        if (prevEn && !newEn) {
          // Disable: flush FIFOs and return bus to idle
          this.txFifo = [];
          this.rxFifo = [];
          this.phase = MasterPhase.IDLE;
          this.setSda(false);
          this.setScl(false);
          this.busHasStart = false;
        }
        this.updateInterrupts();
        break;
      }

      case REG_IC_SDA_HOLD:
        this.sdaHold = value & 0xffffff;
        break;

      case REG_IC_SLV_DATA_NACK_ONLY:
        this.slvDataNackOnly = value & 0x01;
        break;

      case REG_IC_DMA_CR:
        this.dmaCr = value & 0x03;
        this.updateInterrupts();
        break;

      case REG_IC_DMA_TDLR:
        this.dmaTdlr = value & 0x0f;
        break;

      case REG_IC_DMA_RDLR:
        this.dmaRdlr = value & 0x0f;
        break;

      case REG_IC_SDA_SETUP:
        this.sdaSetup = value & 0xff;
        break;

      case REG_IC_ACK_GENERAL_CALL:
        this.ackGeneralCall = value & 0x01;
        break;

      case REG_IC_FS_SPKLEN:
        this.fsSpklen = value & 0xff;
        break;

      default:
        super.writeUint32(offset, value);
    }
  }

  // ─── Diagnostics Snapshot ──────────────────────────────────────────────────────────

  public getDiagnostics(): I2cDiagnostics {
    return {
      name: this.name,
      controllerIndex: this.controllerIndex,
      enabled: this.enabled,
      masterMode: this.isMaster,
      speed: this.speedMode === 1 ? 'standard' : this.speedMode === 2 ? 'fast' : 'unknown',
      targetAddress: this.targetAddress,
      txFifoCount: this.txFifo.length,
      rxFifoCount: this.rxFifo.length,
      busy: this.phase !== MasterPhase.IDLE || this.txFifo.length > 0,
      sdaLow: this.sdaLow,
      sclLow: this.sclLow,
      rawInterrupts: this.rawInterrupts,
      maskedInterrupts: this.intStatus,
      abortSource: this.abortSource,
      devicesAttached: Array.from(this.attachedDevices.values()).map(d => `${d.name}@0x${d.address.toString(16)}`),
    };
  }

  public reset(): void {
    this.control = 0x65;
    this.targetAddress = 0x55;
    this.slaveAddress = 0x55;
    this.ssClockHighPeriod = 40;
    this.ssClockLowPeriod = 47;
    this.fsClockHighPeriod = 6;
    this.fsClockLowPeriod = 13;
    this.interruptMask = 0x08ff;
    this.rawInterrupts = INTR_TX_EMPTY;
    this.rxThreshold = 0;
    this.txThreshold = 0;
    this.enableReg = 0;
    this.sdaHold = 0x01;
    this.abortSource = 0;
    this.slvDataNackOnly = 0;
    this.dmaCr = 0;
    this.dmaTdlr = 0;
    this.dmaRdlr = 0;
    this.sdaSetup = 100;
    this.ackGeneralCall = 1;
    this.fsSpklen = 7;
    this.txFifo = [];
    this.rxFifo = [];
    this.phase = MasterPhase.IDLE;
    this.phaseCyclesLeft = 0;
    this.currentCmd = 0;
    this.currentByteToShift = 0;
    this.currentBitIndex = 0;
    this.isReadTransaction = false;
    this.isAddressPhase = false;
    this.isAckBit = false;
    this.pendingRestart = false;
    this.busHasStart = false;
    this.receivedShiftByte = 0;
    this.activeSlave = null;
    this.setSda(false);
    this.setScl(false);
    this.updateInterrupts();
  }
}

// ─── Logic Analyzer Protocol Decoder ─────────────────────────────────────────────────

export interface I2cDecodedPacket {
  type: 'START' | 'RESTART' | 'ADDRESS' | 'DATA' | 'STOP';
  address?: number;
  isRead?: boolean;
  data?: number;
  ack?: boolean;
  simulatedTime_s?: number;
}

export interface I2cSignalSample {
  time_s: number;
  scl: boolean;
  sda: boolean;
}

/**
 * Decodes a stream of sampled physical or digital I2C bus levels (SCL and SDA)
 * into high-level protocol transactions.
 */
export function decodeI2c(samples: I2cSignalSample[]): I2cDecodedPacket[] {
  const packets: I2cDecodedPacket[] = [];
  if (samples.length === 0) return packets;

  let busStarted = false;
  let isAddressPhase = false;
  let bitBuffer: number[] = [];
  let prevScl = true; // Bus idle high
  let prevSda = true;

  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i];
    const scl = cur.scl;
    const sda = cur.sda;

    // Detect START / RESTART: SDA falling edge while SCL is HIGH
    if (scl && prevSda && !sda) {
      if (!busStarted) {
        busStarted = true;
        packets.push({ type: 'START', simulatedTime_s: cur.time_s });
      } else {
        packets.push({ type: 'RESTART', simulatedTime_s: cur.time_s });
      }
      isAddressPhase = true;
      bitBuffer = [];
    }
    // Detect STOP: SDA rising edge while SCL is HIGH
    else if (scl && !prevSda && sda) {
      if (busStarted) {
        busStarted = false;
        packets.push({ type: 'STOP', simulatedTime_s: cur.time_s });
        isAddressPhase = false;
        bitBuffer = [];
      }
    }
    // Sample SDA on SCL rising edge (LOW -> HIGH)
    else if (!prevScl && scl && busStarted) {
      bitBuffer.push(sda ? 1 : 0);

      if (bitBuffer.length === 9) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          byteVal = (byteVal << 1) | bitBuffer[b];
        }
        const ack = bitBuffer[8] === 0; // Low = ACK, High = NACK

        if (isAddressPhase) {
          const address = byteVal >>> 1;
          const isRead = (byteVal & 1) === 1;
          packets.push({
            type: 'ADDRESS',
            address,
            isRead,
            ack,
            simulatedTime_s: cur.time_s,
          });
          isAddressPhase = false;
        } else {
          packets.push({
            type: 'DATA',
            data: byteVal,
            ack,
            simulatedTime_s: cur.time_s,
          });
        }
        bitBuffer = [];
      }
    }

    prevScl = scl;
    prevSda = sda;
  }

  return packets;
}
