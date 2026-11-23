/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 / ARM PrimeCell PL011 UART Peripheral Emulation
 * 
 * Implements genuine PL011 register behavior, 32-deep FIFOs, fractional baud rate
 * generator, cycle-accurate bit timing, GPIO multiplexing, and NVIC interrupt integration.
 * 
 * Hardware Reference:
 * - Raspberry Pi RP2040 Datasheet Section 4.2 "UART"
 * - ARM PrimeCell UART (PL011) Technical Reference Manual (ARM DDI 0183G)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040 } from 'rp2040js';
import { BasePeripheral, type Peripheral } from 'rp2040js';

// ─── Register Offsets (RP2040 Datasheet Section 4.2.8) ───────────────────────────────

export const REG_UARTDR     = 0x000; // Data Register (Read: RX + errors, Write: TX)
export const REG_UARTRSR    = 0x004; // Read: Receive Status Register
export const REG_UARTECR    = 0x004; // Write: Error Clear Register
export const REG_UARTFR     = 0x018; // Flag Register
export const REG_UARTILPR   = 0x020; // IrDA Low-Power Counter Register
export const REG_UARTIBRD   = 0x024; // Integer Baud Rate Divisor Register
export const REG_UARTFBRD   = 0x028; // Fractional Baud Rate Divisor Register
export const REG_UARTLCR_H  = 0x02c; // Line Control Register
export const REG_UARTCR     = 0x030; // Control Register
export const REG_UARTIFLS   = 0x034; // Interrupt FIFO Level Select Register
export const REG_UARTIMSC   = 0x038; // Interrupt Mask Set/Clear Register
export const REG_UARTRIS    = 0x03c; // Raw Interrupt Status Register
export const REG_UARTMIS    = 0x040; // Masked Interrupt Status Register
export const REG_UARTICR    = 0x044; // Interrupt Clear Register
export const REG_UARTDMACR  = 0x048; // DMA Control Register

// PrimeCell Identification Registers
export const REG_UARTPERIPHID0 = 0xfe0; // 0x11
export const REG_UARTPERIPHID1 = 0xfe4; // 0x10
export const REG_UARTPERIPHID2 = 0xfe8; // 0x34
export const REG_UARTPERIPHID3 = 0xfec; // 0x00
export const REG_UARTPCELLID0  = 0xff0; // 0x0D
export const REG_UARTPCELLID1  = 0xff4; // 0xF0
export const REG_UARTPCELLID2  = 0xff8; // 0x05
export const REG_UARTPCELLID3  = 0xffc; // 0xB1

// ─── Register Bit Masks ───────────────────────────────────────────────────────────────

// UARTFR (Flag Register)
export const FR_RI    = 1 << 8; // Ring indicator
export const FR_TXFE  = 1 << 7; // Transmit FIFO empty
export const FR_RXFF  = 1 << 6; // Receive FIFO full
export const FR_TXFF  = 1 << 5; // Transmit FIFO full
export const FR_RXFE  = 1 << 4; // Receive FIFO empty
export const FR_BUSY  = 1 << 3; // UART busy transmitting
export const FR_DCD   = 1 << 2; // Data Carrier Detect
export const FR_DSR   = 1 << 1; // Data Set Ready
export const FR_CTS   = 1 << 0; // Clear To Send

// UARTLCR_H (Line Control Register)
export const LCR_SPS   = 1 << 7; // Stick Parity Select
export const LCR_WLEN  = 3 << 5; // Word Length mask (5 to 8 bits)
export const LCR_FEN   = 1 << 4; // Enable FIFOs (16-deep vs 1-deep)
export const LCR_STP2  = 1 << 3; // Two Stop Bits Select
export const LCR_EPS   = 1 << 2; // Even Parity Select
export const LCR_PEN   = 1 << 1; // Parity Enable
export const LCR_BRK   = 1 << 0; // Send Break

// UARTCR (Control Register)
export const CR_CTSEN  = 1 << 15; // CTS hardware flow control enable
export const CR_RTSEN  = 1 << 14; // RTS hardware flow control enable
export const CR_OUT2   = 1 << 13;
export const CR_OUT1   = 1 << 12;
export const CR_RTS    = 1 << 11; // Request To Send
export const CR_DTR    = 1 << 10; // Data Terminal Ready
export const CR_RXE    = 1 << 9;  // Receive Enable
export const CR_TXE    = 1 << 8;  // Transmit Enable
export const CR_LBE    = 1 << 7;  // Loopback Enable
export const CR_SIRLP  = 1 << 2;  // SIR low-power
export const CR_SIREN  = 1 << 1;  // SIR enable
export const CR_UARTEN = 1 << 0;  // UART Enable

// Interrupt Bits (IMSC, RIS, MIS, ICR)
export const INT_OE   = 1 << 10; // Overrun Error
export const INT_BE   = 1 << 9;  // Break Error
export const INT_PE   = 1 << 8;  // Parity Error
export const INT_FE   = 1 << 7;  // Framing Error
export const INT_RT   = 1 << 6;  // Receive Timeout
export const INT_TX   = 1 << 5;  // Transmit Interrupt
export const INT_RX   = 1 << 4;  // Receive Interrupt
export const INT_DSR  = 1 << 3;
export const INT_DCD  = 1 << 2;
export const INT_CTS  = 1 << 1;  // CTS modem interrupt
export const INT_RI   = 1 << 0;

// Error flags in DR and RSR
export const ERR_FE   = 1 << 0; // Framing Error
export const ERR_PE   = 1 << 1; // Parity Error
export const ERR_BE   = 1 << 2; // Break Error
export const ERR_OE   = 1 << 3; // Overrun Error

export interface IUARTDMAChannels {
  rx: number;
  tx: number;
}

export interface UartDiagnostics {
  name: string;
  enabled: boolean;
  txEnabled: boolean;
  rxEnabled: boolean;
  fifosEnabled: boolean;
  baudRate: number;
  wordLength: 5 | 6 | 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
  txFifoCount: number;
  rxFifoCount: number;
  txBusy: boolean;
  cts: boolean;
  rts: boolean;
  txBytesTotal: number;
  rxBytesTotal: number;
  overrunErrors: number;
  framingErrors: number;
  parityErrors: number;
  breakErrors: number;
}

/**
 * High-fidelity emulation of the RP2040 ARM PrimeCell PL011 UART peripheral.
 */
export class RP2040Uart extends BasePeripheral implements Peripheral {
  readonly irq: number;
  readonly dreq: IUARTDMAChannels;
  readonly uartIndex: number;

  // ── Registers ──────────────────────────────────────────────────────────────────────
  private intDivisor: number = 0;      // UARTIBRD (16-bit)
  private fracDivisor: number = 0;     // UARTFBRD (6-bit, 0-63)
  private lineCtrlRegister: number = 0;// UARTLCR_H
  private ctrlRegister: number = CR_TXE | CR_RXE; // UARTCR (Reset default: TXE=1, RXE=1)
  private iflsRegister: number = 0x12; // UARTIFLS (Reset default: 1/2 TX, 1/2 RX = 0b010010 = 0x12)
  private interruptMask: number = 0;   // UARTIMSC
  private rawInterrupts: number = 0;   // UARTRIS
  private rsrErrors: number = 0;       // UARTRSR (FE, PE, BE, OE)
  private ilprRegister: number = 0;    // UARTILPR
  private dmacrRegister: number = 0;   // UARTDMACR

  // ── 32-Entry FIFOs ─────────────────────────────────────────────────────────────────
  // PL011 TX FIFO: 32 entries x 8 bits
  // PL011 RX FIFO: 32 entries x 12 bits: [7:0] Data, [8] FE, [9] PE, [10] BE, [11] OE
  private rxFifo: number[] = [];
  private txFifo: number[] = [];
  public static readonly FIFO_DEPTH = 32;

  // ── Bit Timing & Shift Registers ───────────────────────────────────────────────────
  private txBusy: boolean = false;
  private txShiftBits: boolean[] = [];
  private txBitIndex: number = 0;
  private txCycleAccumulator: number = 0;
  private txPinState: boolean = true; // Idle UART line is logical HIGH (mark)
  private currentTxByte: number = 0;

  // Receiver bit-level demodulation
  private rxPinState: boolean = true; // Idle line is HIGH
  private rxReceiving: boolean = false;
  private rxCycleAccumulator: number = 0;
  private rxSampledBits: boolean[] = [];

  // Receiver 32-bit timeout tracking
  private rxTimeoutCycles: number = 0;

  // CTS / RTS Modem Lines
  private ctsLineState: boolean = false; // Reset default: external CTS unasserted (UARTFR.CTS = 0)

  // Clock configuration
  private peripheralClock_Hz: number = 125_000_000; // clk_peri (default 125 MHz)

  // Counters for diagnostics
  private txBytesTotal: number = 0;
  private rxBytesTotal: number = 0;
  private overrunErrors: number = 0;
  private framingErrors: number = 0;
  private parityErrors: number = 0;
  private breakErrors: number = 0;

  // Callbacks
  public onByteTransmit?: (byte: number, simulatedTime_s: number, uartIndex: number) => void;
  public onBaudRateChange?: (baudRate: number) => void;
  public onTxPinStateChange?: (pinHigh: boolean) => void;
  public onRtsPinStateChange?: (rtsAsserted: boolean) => void;

  constructor(
    rp2040: RP2040,
    name: string,
    irq: number,
    dreq: IUARTDMAChannels,
    uartIndex = 0
  ) {
    super(rp2040, name);
    this.irq = irq;
    this.dreq = dreq;
    this.uartIndex = uartIndex;

    // Reset default: Transmit interrupt (TXIM) raw status is set when TX FIFO is below threshold
    this.updateTxInterrupt();
  }

  // ─── Configuration Getters ─────────────────────────────────────────────────────────

  public get enabled(): boolean {
    return !!(this.ctrlRegister & CR_UARTEN);
  }

  public get txEnabled(): boolean {
    return !!(this.ctrlRegister & CR_TXE) && this.enabled;
  }

  public get rxEnabled(): boolean {
    return !!(this.ctrlRegister & CR_RXE) && this.enabled;
  }

  public get fifosEnabled(): boolean {
    return !!(this.lineCtrlRegister & LCR_FEN);
  }

  public get loopbackEnabled(): boolean {
    return !!(this.ctrlRegister & CR_LBE);
  }

  public get wordLength(): 5 | 6 | 7 | 8 {
    switch ((this.lineCtrlRegister >>> 5) & 0x3) {
      case 0b00: return 5;
      case 0b01: return 6;
      case 0b10: return 7;
      case 0b11: return 8;
      default: return 8;
    }
  }

  public get parity(): 'none' | 'even' | 'odd' {
    if (!(this.lineCtrlRegister & LCR_PEN)) return 'none';
    return (this.lineCtrlRegister & LCR_EPS) ? 'even' : 'odd';
  }

  public get stopBits(): 1 | 2 {
    return (this.lineCtrlRegister & LCR_STP2) ? 2 : 1;
  }

  public get baudDivider(): number {
    return this.intDivisor + this.fracDivisor / 64;
  }

  public get baudRate(): number {
    const divider = this.baudDivider;
    if (divider <= 0) return 0;
    return Math.round(this.peripheralClock_Hz / (divider * 16));
  }

  public get peripheralClock(): number {
    return this.peripheralClock_Hz;
  }

  public setPeripheralClock(freq_Hz: number): void {
    if (freq_Hz > 0) {
      this.peripheralClock_Hz = freq_Hz;
      this.clkPeriChanged();
    }
  }

  public getEffectiveFifoCapacity(): number {
    return this.fifosEnabled ? RP2040Uart.FIFO_DEPTH : 1;
  }

  public get rtsLineState(): boolean {
    if (this.ctrlRegister & CR_RTSEN) {
      // Auto-RTS: asserted (true) when RX FIFO is below programmed trigger threshold
      const threshold = this.getRxFifoTriggerThreshold();
      return this.rxFifo.length < threshold;
    } else {
      // Manual RTS bit from CR (bit 11)
      return !!(this.ctrlRegister & CR_RTS);
    }
  }

  // ─── Flag Register (UARTFR) ────────────────────────────────────────────────────────

  public get flags(): number {
    const capacity = this.getEffectiveFifoCapacity();
    const txEmpty = this.txFifo.length === 0 && !this.txBusy;
    const txFull = this.txFifo.length >= capacity;
    const rxEmpty = this.rxFifo.length === 0;
    const rxFull = this.rxFifo.length >= capacity;

    let fr = 0;
    if (txEmpty) fr |= FR_TXFE;
    if (txFull)  fr |= FR_TXFF;
    if (rxEmpty) fr |= FR_RXFE;
    if (rxFull)  fr |= FR_RXFF;
    if (this.txBusy) fr |= FR_BUSY;
    if (this.ctsLineState) fr |= FR_CTS;
    return fr;
  }

  // ─── FIFO Level Trigger Thresholds (UARTIFLS) ──────────────────────────────────────

  private getTxFifoTriggerThreshold(): number {
    const capacity = this.getEffectiveFifoCapacity();
    if (!this.fifosEnabled) return 0;
    const sel = this.iflsRegister & 0x7;
    switch (sel) {
      case 0b000: return Math.floor(capacity * 1 / 8); // 4 bytes (when capacity=32)
      case 0b001: return Math.floor(capacity * 1 / 4); // 8 bytes (when capacity=32)
      case 0b010: return Math.floor(capacity * 1 / 2); // 16 bytes (when capacity=32)
      case 0b011: return Math.floor(capacity * 3 / 4); // 24 bytes (when capacity=32)
      case 0b100: return Math.floor(capacity * 7 / 8); // 28 bytes (when capacity=32)
      default: return Math.floor(capacity * 1 / 2);
    }
  }

  private getRxFifoTriggerThreshold(): number {
    const capacity = this.getEffectiveFifoCapacity();
    if (!this.fifosEnabled) return 1;
    const sel = (this.iflsRegister >>> 3) & 0x7;
    switch (sel) {
      case 0b000: return Math.max(1, Math.floor(capacity * 1 / 8)); // 4 bytes (when capacity=32)
      case 0b001: return Math.max(1, Math.floor(capacity * 1 / 4)); // 8 bytes (when capacity=32)
      case 0b010: return Math.max(1, Math.floor(capacity * 1 / 2)); // 16 bytes (when capacity=32)
      case 0b011: return Math.max(1, Math.floor(capacity * 3 / 4)); // 24 bytes (when capacity=32)
      case 0b100: return Math.max(1, Math.floor(capacity * 7 / 8)); // 28 bytes (when capacity=32)
      default: return Math.max(1, Math.floor(capacity * 1 / 2));
    }
  }

  // ─── Interrupt Controller & NVIC Dispatch ──────────────────────────────────────────

  private updateTxInterrupt(): void {
    const threshold = this.getTxFifoTriggerThreshold();
    if (this.txFifo.length <= threshold) {
      this.rawInterrupts |= INT_TX;
    } else {
      this.rawInterrupts &= ~INT_TX;
    }
    this.checkInterrupts();
  }

  private updateRxInterrupt(): void {
    const threshold = this.getRxFifoTriggerThreshold();
    if (this.rxFifo.length >= threshold) {
      this.rawInterrupts |= INT_RX;
    } else {
      this.rawInterrupts &= ~INT_RX;
    }
    this.checkInterrupts();
  }

  public checkInterrupts(): void {
    const mis = this.rawInterrupts & this.interruptMask;
    this.rp2040.setInterrupt(this.irq, mis !== 0);

    // Update DMA DREQ flags
    if (this.dreq) {
      if ((this.dmacrRegister & 0x2) && this.txFifo.length < this.getEffectiveFifoCapacity()) {
        this.rp2040.dma?.setDREQ(this.dreq.tx);
      } else {
        this.rp2040.dma?.clearDREQ(this.dreq.tx);
      }

      if ((this.dmacrRegister & 0x1) && this.rxFifo.length > 0) {
        this.rp2040.dma?.setDREQ(this.dreq.rx);
      } else {
        this.rp2040.dma?.clearDREQ(this.dreq.rx);
      }
    }
  }

  // ─── Byte & Bit Transmission Engine ────────────────────────────────────────────────

  /**
   * Pushes a data byte into the TX FIFO.
   */
  public writeDataByte(value: number): void {
    if (!this.enabled) return;

    const capacity = this.getEffectiveFifoCapacity();
    if (this.txFifo.length < capacity) {
      this.txFifo.push(value & 0xff);
    } else {
      // FIFO full: character is dropped in PL011
      return;
    }

    this.updateTxInterrupt();

    // If transmitter is idle and enabled, start transmitting immediately
    if (!this.txBusy && this.txEnabled) {
      this.startNextTransmission();
    }
  }

  /**
   * Constructs the serialized bit stream for the character at the head of the TX FIFO.
   */
  private startNextTransmission(): void {
    if (this.txFifo.length === 0 || !this.txEnabled) {
      this.txBusy = false;
      this.txPinState = true; // Mark (idle)
      this.onTxPinStateChange?.(this.txPinState);
      return;
    }

    // CTS hardware flow control: if CTSEN is enabled, pause transmission while CTS is de-asserted (false)
    if ((this.ctrlRegister & CR_CTSEN) && !this.ctsLineState) {
      this.txBusy = false;
      return;
    }

    this.currentTxByte = this.txFifo.shift()!;
    this.txBusy = true;
    this.txBitIndex = 0;
    this.txCycleAccumulator = 0;
    this.updateTxInterrupt();

    // Check Send Break bit
    if (this.lineCtrlRegister & LCR_BRK) {
      this.txShiftBits = [false]; // Continuous low
      this.txPinState = false;
      this.onTxPinStateChange?.(false);
      return;
    }

    const dataBits = this.wordLength;
    const bits: boolean[] = [];

    // 1. Start bit: always 0 (space)
    bits.push(false);

    // 2. Data bits (LSB first)
    let onesCount = 0;
    for (let b = 0; b < dataBits; b++) {
      const bitVal = ((this.currentTxByte >>> b) & 1) === 1;
      bits.push(bitVal);
      if (bitVal) onesCount++;
    }

    // 3. Parity bit (optional)
    if (this.lineCtrlRegister & LCR_PEN) {
      let parityBit: boolean;
      if (this.lineCtrlRegister & LCR_SPS) {
        // Sticky parity
        parityBit = !(this.lineCtrlRegister & LCR_EPS);
      } else {
        const isEven = (onesCount % 2) === 0;
        parityBit = (this.lineCtrlRegister & LCR_EPS) ? !isEven : isEven;
      }
      bits.push(parityBit);
    }

    // 4. Stop bits (1 or 2 stop bits, always 1 / mark)
    const stopCount = this.stopBits;
    for (let s = 0; s < stopCount; s++) {
      bits.push(true);
    }

    this.txShiftBits = bits;
    this.txPinState = bits[0]; // Start bit is immediately placed on line
    this.onTxPinStateChange?.(this.txPinState);
  }

  /**
   * Advances transmitter and receiver timing by `deltaCycles` emulated CPU clock cycles.
   */
  public tickCycles(deltaCycles: number, clkPeri?: number, clkSys?: number): void {
    if (clkPeri && clkPeri > 0) {
      this.peripheralClock_Hz = clkPeri;
    }
    const baud = this.baudRate;
    if (baud <= 0) return;

    const activeSys = (clkSys !== undefined && clkSys > 0)
      ? clkSys
      : (this.rp2040?.clkSys || this.peripheralClock_Hz);
    const cyclesPerBit = activeSys / baud;

    // ─── Advance Transmitter ─────────────────────────────────────────────────────────
    if (this.txBusy) {
      this.txCycleAccumulator += deltaCycles;

      while (this.txCycleAccumulator >= cyclesPerBit && this.txBusy) {
        this.txCycleAccumulator -= cyclesPerBit;
        this.txBitIndex++;

        if (this.txBitIndex < this.txShiftBits.length) {
          const nextBit = this.txShiftBits[this.txBitIndex];
          if (nextBit !== this.txPinState) {
            this.txPinState = nextBit;
            this.onTxPinStateChange?.(this.txPinState);
          }
        } else {
          // Transmission complete!
          this.txBytesTotal++;
          const sentByte = this.currentTxByte;
          const simTime = (this.rp2040 as any).core?.cycles / activeSys || 0;

          // Dispatch byte to callback (for Serial Monitor & tests)
          this.onByteTransmit?.(sentByte, simTime, this.uartIndex);

          // If loopback is enabled (CR.LBE), feed back to receiver
          if (this.loopbackEnabled) {
            this.feedByte(sentByte);
          }

          // Line returns to idle HIGH (mark)
          this.txPinState = true;
          this.onTxPinStateChange?.(true);

          // Start next transmission or transition to idle
          this.startNextTransmission();
        }
      }
    }

    // ─── Advance Receiver Bit Sampling ───────────────────────────────────────────────
    if (this.rxReceiving) {
      this.rxCycleAccumulator += deltaCycles;

      while (this.rxCycleAccumulator >= cyclesPerBit && this.rxReceiving) {
        this.rxCycleAccumulator -= cyclesPerBit;
        this.rxSampledBits.push(this.rxPinState);

        const dataBits = this.wordLength;
        const totalExpectedBits = 1 + dataBits + (this.lineCtrlRegister & LCR_PEN ? 1 : 0) + this.stopBits;

        if (this.rxSampledBits.length >= totalExpectedBits) {
          this.finishReceivedFrame();
        }
      }
    }

    // ─── Receiver 32-Bit Period Timeout (RTIS) ───────────────────────────────────────
    if (this.rxFifo.length > 0) {
      this.rxTimeoutCycles += deltaCycles;
      if (this.rxTimeoutCycles >= (32 * cyclesPerBit)) {
        this.rawInterrupts |= INT_RT;
        this.checkInterrupts();
      }
    } else {
      this.rxTimeoutCycles = 0;
    }
  }

  /**
   * Decodes and validates a fully sampled frame from the RX pin.
   */
  private finishReceivedFrame(): void {
    this.rxReceiving = false;
    const bits = this.rxSampledBits;
    this.rxSampledBits = [];

    const dataBits = this.wordLength;
    let errorFlags = 0;

    // Check Start bit (should have been 0)
    // Checked at falling edge

    // Extract Data bits
    let byteVal = 0;
    let onesCount = 0;
    for (let i = 0; i < dataBits; i++) {
      const bit = bits[1 + i];
      if (bit) {
        byteVal |= (1 << i);
        onesCount++;
      }
    }

    let nextBitIdx = 1 + dataBits;

    // Check Parity
    if (this.lineCtrlRegister & LCR_PEN) {
      const sampledParity = bits[nextBitIdx++];
      let expectedParity: boolean;
      if (this.lineCtrlRegister & LCR_SPS) {
        expectedParity = !(this.lineCtrlRegister & LCR_EPS);
      } else {
        const isEven = (onesCount % 2) === 0;
        expectedParity = (this.lineCtrlRegister & LCR_EPS) ? !isEven : isEven;
      }

      if (sampledParity !== expectedParity) {
        errorFlags |= ERR_PE;
        this.parityErrors++;
        this.rawInterrupts |= INT_PE;
      }
    }

    // Check Stop bit(s) (must be 1 / mark)
    const stopCount = this.stopBits;
    for (let s = 0; s < stopCount; s++) {
      if (!bits[nextBitIdx + s]) {
        errorFlags |= ERR_FE;
        this.framingErrors++;
        this.rawInterrupts |= INT_FE;
        break;
      }
    }

    this.feedByte(byteVal, errorFlags);
  }

  // ─── Receiver Input Feeding ────────────────────────────────────────────────────────

  /**
   * Ingests an incoming character (with optional error flags) into the RX FIFO.
   * Used by Serial Monitor, external virtual peripherals, loopback, or test suites.
   */
  public feedByte(value: number, errorFlags = 0): void {
    if (!this.enabled || !this.rxEnabled) return;

    this.rxBytesTotal++;
    this.rxTimeoutCycles = 0; // Reset receive timeout counter

    const capacity = this.getEffectiveFifoCapacity();

    if (this.rxFifo.length < capacity) {
      // Pack error flags into bits [11:8]
      const packed = (value & 0xff) | ((errorFlags & 0xf) << 8);
      this.rxFifo.push(packed);
      this.rsrErrors |= (errorFlags & 0xf);
    } else {
      // Overrun Error: RX FIFO is full and another character arrived
      this.overrunErrors++;
      this.rawInterrupts |= INT_OE;
      this.rsrErrors |= ERR_OE;
    }

    this.updateRxInterrupt();
    this.onRtsPinStateChange?.(this.rtsLineState);
  }

  /**
   * Ingests a string of characters sequentially.
   */
  public feedString(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.feedByte(text.charCodeAt(i));
    }
  }

  /**
   * Ingests digital line levels from an electrical circuit node / RX pin.
   */
  public feedRxPinState(pinHigh: boolean, deltaCycles = 0): void {
    const prev = this.rxPinState;
    this.rxPinState = pinHigh;

    // Detect falling edge (Start bit: 1 -> 0) when receiver is idle
    if (!this.rxReceiving && prev && !pinHigh && this.rxEnabled) {
      this.rxReceiving = true;
      const baud = this.baudRate;
      const curFreq = this.peripheralClock_Hz;
      const cyclesPerBit = curFreq / (baud || 115200);

      // Align sample phase to bit center (+0.5 bit period offset)
      this.rxCycleAccumulator = -cyclesPerBit / 2;
      this.rxSampledBits = [false]; // Record start bit
    }
  }

  public getTxPinState(): boolean {
    return this.txPinState;
  }

  public setCts(asserted: boolean): void {
    if (this.ctsLineState !== asserted) {
      this.ctsLineState = asserted;
      // Modem status interrupt (INT_CTS)
      this.rawInterrupts |= INT_CTS;
      this.checkInterrupts();
      // If CTS became asserted and CTSEN is enabled, check if pending transmission can start
      if (asserted && (this.ctrlRegister & CR_CTSEN) && !this.txBusy && this.txFifo.length > 0 && this.txEnabled) {
        this.startNextTransmission();
      }
    }
  }

  public clkPeriChanged(): void {
    if (this.baudDivider > 0) {
      this.onBaudRateChange?.(this.baudRate);
    }
  }

  // ─── Register Read / Write Interface ───────────────────────────────────────────────

  public override readUint32(offset: number): number {
    const regOffset = offset & 0xfff;
    switch (regOffset) {
      case REG_UARTDR: {
        if (this.rxFifo.length === 0) {
          // Read from empty FIFO: return 0
          this.updateRxInterrupt();
          this.onRtsPinStateChange?.(this.rtsLineState);
          return 0;
        }

        const packed = this.rxFifo.shift()!;
        this.updateRxInterrupt();
        this.onRtsPinStateChange?.(this.rtsLineState);

        // If FIFO emptied, clear RTIS timeout interrupt
        if (this.rxFifo.length === 0) {
          this.rawInterrupts &= ~INT_RT;
          this.rxTimeoutCycles = 0;
          this.checkInterrupts();
        }

        return packed;
      }

      case REG_UARTRSR:
        if (this.rxFifo.length > 0) {
          const topError = (this.rxFifo[0] >>> 8) & 0x7;
          return (this.rsrErrors & ERR_OE) | topError;
        }
        return this.rsrErrors;

      case REG_UARTFR:
        return this.flags;

      case REG_UARTILPR:
        return this.ilprRegister;

      case REG_UARTIBRD:
        return this.intDivisor;

      case REG_UARTFBRD:
        return this.fracDivisor;

      case REG_UARTLCR_H:
        return this.lineCtrlRegister;

      case REG_UARTCR:
        return this.ctrlRegister;

      case REG_UARTIFLS:
        return this.iflsRegister;

      case REG_UARTIMSC:
        return this.interruptMask;

      case REG_UARTRIS:
        return this.rawInterrupts;

      case REG_UARTMIS:
        return this.rawInterrupts & this.interruptMask;

      case REG_UARTICR:
        return 0; // Write-only register, reads 0

      case REG_UARTDMACR:
        return this.dmacrRegister;

      // PrimeCell Identification Registers
      case REG_UARTPERIPHID0: return 0x11;
      case REG_UARTPERIPHID1: return 0x10;
      case REG_UARTPERIPHID2: return 0x34;
      case REG_UARTPERIPHID3: return 0x00;
      case REG_UARTPCELLID0:  return 0x0D;
      case REG_UARTPCELLID1:  return 0xF0;
      case REG_UARTPCELLID2:  return 0x05;
      case REG_UARTPCELLID3:  return 0xB1;

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
        case 1: // Atomic XOR
          newVal = curVal ^ value;
          break;
        case 2: // Atomic SET
          newVal = curVal | value;
          break;
        case 3: // Atomic CLEAR
          newVal = curVal & ~value;
          break;
      }
      this.writeUint32(regOffset, newVal);
      return;
    }

    switch (regOffset) {
      case REG_UARTDR:
        this.writeDataByte(value & 0xff);
        break;

      case REG_UARTECR:
        // Any write to UARTECR clears all error bits in UARTRSR
        this.rsrErrors = 0;
        break;

      case REG_UARTILPR:
        this.ilprRegister = value & 0xff;
        break;

      case REG_UARTIBRD:
        this.intDivisor = value & 0xffff;
        this.clkPeriChanged();
        break;

      case REG_UARTFBRD:
        this.fracDivisor = value & 0x3f;
        this.clkPeriChanged();
        break;

      case REG_UARTLCR_H: {
        const prevFen = (this.lineCtrlRegister & LCR_FEN) !== 0;
        this.lineCtrlRegister = value & 0xff;
        const newFen = (this.lineCtrlRegister & LCR_FEN) !== 0;

        // If FIFO enable changed, reset FIFOs
        if (prevFen !== newFen) {
          if (!newFen) {
            if (this.rxFifo.length > 1) this.rxFifo = this.rxFifo.slice(0, 1);
            if (this.txFifo.length > 1) this.txFifo = this.txFifo.slice(0, 1);
          }
        }

        // LCR_H latching also triggers baud rate change notification in hardware
        this.clkPeriChanged();
        this.updateTxInterrupt();
        this.updateRxInterrupt();
        this.onRtsPinStateChange?.(this.rtsLineState);
        break;
      }

      case REG_UARTCR: {
        const prevEn = this.enabled;
        const prevCtsEn = (this.ctrlRegister & CR_CTSEN) !== 0;
        this.ctrlRegister = value & 0xffff;
        const newEn = this.enabled;
        const newCtsEn = (this.ctrlRegister & CR_CTSEN) !== 0;

        if (!newEn && prevEn) {
          // Disable UART: abort active transmission
          this.txBusy = false;
          this.txPinState = true;
          this.onTxPinStateChange?.(true);
        } else if (newEn && !prevEn && this.txFifo.length > 0 && !this.txBusy) {
          this.startNextTransmission();
        } else if (newEn && prevCtsEn && !newCtsEn && this.txFifo.length > 0 && !this.txBusy) {
          // CTS flow control disabled while bytes queued: resume immediately
          this.startNextTransmission();
        }

        this.onRtsPinStateChange?.(this.rtsLineState);
        this.checkInterrupts();
        break;
      }

      case REG_UARTIFLS:
        this.iflsRegister = value & 0x3f;
        this.updateTxInterrupt();
        this.updateRxInterrupt();
        this.onRtsPinStateChange?.(this.rtsLineState);
        break;

      case REG_UARTIMSC:
        this.interruptMask = value & 0x7ff;
        this.checkInterrupts();
        break;

      case REG_UARTICR:
        // Writing 1 clears the corresponding raw interrupt bit
        this.rawInterrupts &= ~(value & 0x7ff);
        this.checkInterrupts();
        break;

      case REG_UARTDMACR:
        this.dmacrRegister = value & 0x7;
        this.checkInterrupts();
        break;

      default:
        super.writeUint32(offset, value);
    }
  }

  // ─── Diagnostics Snapshot ──────────────────────────────────────────────────────────

  public getDiagnostics(): UartDiagnostics {
    return {
      name: this.name,
      enabled: this.enabled,
      txEnabled: this.txEnabled,
      rxEnabled: this.rxEnabled,
      fifosEnabled: this.fifosEnabled,
      baudRate: this.baudRate,
      wordLength: this.wordLength,
      parity: this.parity,
      stopBits: this.stopBits,
      txFifoCount: this.txFifo.length,
      rxFifoCount: this.rxFifo.length,
      txBusy: this.txBusy,
      cts: this.ctsLineState,
      rts: this.rtsLineState,
      txBytesTotal: this.txBytesTotal,
      rxBytesTotal: this.rxBytesTotal,
      overrunErrors: this.overrunErrors,
      framingErrors: this.framingErrors,
      parityErrors: this.parityErrors,
      breakErrors: this.breakErrors,
    };
  }

  public reset(): void {
    this.intDivisor = 0;
    this.fracDivisor = 0;
    this.lineCtrlRegister = 0;
    this.ctrlRegister = CR_TXE | CR_RXE;
    this.iflsRegister = 0x12;
    this.interruptMask = 0;
    this.rawInterrupts = 0;
    this.rsrErrors = 0;
    this.ilprRegister = 0;
    this.dmacrRegister = 0;
    this.rxFifo = [];
    this.txFifo = [];
    this.txBusy = false;
    this.txShiftBits = [];
    this.txBitIndex = 0;
    this.txCycleAccumulator = 0;
    this.txPinState = true;
    this.rxPinState = true;
    this.rxReceiving = false;
    this.rxCycleAccumulator = 0;
    this.rxSampledBits = [];
    this.rxTimeoutCycles = 0;
    this.ctsLineState = false;
    this.updateTxInterrupt();
    this.onRtsPinStateChange?.(this.rtsLineState);
  }
}
