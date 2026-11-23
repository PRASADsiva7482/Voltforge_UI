/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 Virtual SPI Device Models
 * 
 * Implements standard SPI slave peripherals adhering to authentic manufacturer datasheets:
 * 1. EEPROM_25LC256 (Microchip 25LC256 32 KiB SPI EEPROM, 64-byte page write, status reg)
 * 2. ADC_MCP3008 (Microchip MCP3008 10-bit 8-channel SPI ADC with MNA analog tie-in)
 * 3. ShiftRegister_74HC595 (Texas Instruments 74HC595 8-bit serial-in parallel-out latch)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

export interface RP2040SpiDevice {
  /** Descriptive name of the device */
  readonly name: string;
  /** Whether the device is currently selected (active LOW CS received) */
  readonly isSelected: boolean;
  /** Optional: whether device auto-binds to controller internal CSn line (default true) */
  bindToControllerCs?: boolean;
  /** Chip Select line transition (true = Chip Selected / CSn active LOW, false = Deselected / CSn HIGH) */
  select(csActiveLow: boolean): void;
  /** Full-duplex synchronous byte transfer */
  transferByte(mosiByte: number): number;
  /** Reset peripheral internal state */
  reset(): void;
}

// ─── 1. Microchip 25LC256 32 KiB SPI EEPROM ──────────────────────────────────────────

export const CMD_EEPROM_WREN  = 0x06; // Set Write Enable Latch
export const CMD_EEPROM_WRDI  = 0x04; // Reset Write Enable Latch
export const CMD_EEPROM_RDSR  = 0x05; // Read Status Register
export const CMD_EEPROM_WRSR  = 0x01; // Write Status Register
export const CMD_EEPROM_READ  = 0x03; // Read Data from Memory
export const CMD_EEPROM_WRITE = 0x02; // Write Data to Memory

export const EEPROM_STATUS_WIP = 1 << 0; // Write In Progress
export const EEPROM_STATUS_WEL = 1 << 1; // Write Enable Latch
export const EEPROM_STATUS_BP0 = 1 << 2; // Block Protection Bit 0
export const EEPROM_STATUS_BP1 = 1 << 3; // Block Protection Bit 1
export const EEPROM_STATUS_WPEN = 1 << 7; // Write Protect Enable

export class EEPROM_25LC256 implements RP2040SpiDevice {
  public readonly name = '25LC256-EEPROM';
  public static readonly CAPACITY_BYTES = 32768; // 32 KiB
  public static readonly PAGE_SIZE = 64;         // 64 Bytes per page

  private memory: Uint8Array;
  private statusReg: number = 0;
  public isSelected: boolean = false;
  public bindToControllerCs: boolean = true;

  private state: 'IDLE' | 'CMD' | 'ADDR_HI' | 'ADDR_LO' | 'DATA_READ' | 'DATA_WRITE' | 'WRSR' = 'IDLE';
  private currentCommand: number = 0;
  private currentAddress: number = 0;
  private pageBuffer: number[] = [];
  private pageStartAddress: number = 0;

  constructor(initialData?: Uint8Array) {
    this.memory = new Uint8Array(EEPROM_25LC256.CAPACITY_BYTES);
    if (initialData) {
      this.memory.set(initialData.subarray(0, EEPROM_25LC256.CAPACITY_BYTES));
    } else {
      this.memory.fill(0xff); // Erased state
    }
  }

  public reset(): void {
    this.statusReg = 0;
    this.isSelected = false;
    this.state = 'IDLE';
    this.currentCommand = 0;
    this.currentAddress = 0;
    this.pageBuffer = [];
  }

  public select(csActiveLow: boolean): void {
    if (csActiveLow && !this.isSelected) {
      // CS asserted LOW: begin transaction
      this.isSelected = true;
      this.state = 'CMD';
      this.pageBuffer = [];
    } else if (!csActiveLow && this.isSelected) {
      // CS de-asserted HIGH: commit write if applicable
      if (this.state === 'DATA_WRITE' && (this.statusReg & EEPROM_STATUS_WEL)) {
        this.commitPageWrite();
      }
      this.isSelected = false;
      this.state = 'IDLE';
    }
  }

  public transferByte(mosiByte: number): number {
    if (!this.isSelected) {
      return 0xff; // High-Z floating bus returns 0xFF
    }

    const byteIn = mosiByte & 0xff;

    switch (this.state) {
      case 'CMD': {
        this.currentCommand = byteIn;
        switch (byteIn) {
          case CMD_EEPROM_WREN:
            this.statusReg |= EEPROM_STATUS_WEL;
            this.state = 'IDLE';
            return 0x00;

          case CMD_EEPROM_WRDI:
            this.statusReg &= ~EEPROM_STATUS_WEL;
            this.state = 'IDLE';
            return 0x00;

          case CMD_EEPROM_RDSR:
            this.state = 'IDLE';
            return this.statusReg;

          case CMD_EEPROM_WRSR:
            this.state = 'WRSR';
            return 0x00;

          case CMD_EEPROM_READ:
          case CMD_EEPROM_WRITE:
            this.state = 'ADDR_HI';
            return 0x00;

          default:
            this.state = 'IDLE';
            return 0x00;
        }
      }

      case 'WRSR': {
        if (this.statusReg & EEPROM_STATUS_WEL) {
          // Update status register (only BP0, BP1, WPEN writable)
          const mask = EEPROM_STATUS_BP0 | EEPROM_STATUS_BP1 | EEPROM_STATUS_WPEN;
          this.statusReg = (this.statusReg & ~mask) | (byteIn & mask);
          // Writing status register clears WEL
          this.statusReg &= ~EEPROM_STATUS_WEL;
        }
        this.state = 'IDLE';
        return 0x00;
      }

      case 'ADDR_HI': {
        this.currentAddress = (byteIn & 0x7f) << 8; // 15-bit address for 32 KiB
        this.state = 'ADDR_LO';
        return 0x00;
      }

      case 'ADDR_LO': {
        this.currentAddress |= byteIn;
        this.pageStartAddress = this.currentAddress;
        if (this.currentCommand === CMD_EEPROM_READ) {
          this.state = 'DATA_READ';
        } else {
          this.state = 'DATA_WRITE';
          this.pageBuffer = [];
        }
        return 0x00;
      }

      case 'DATA_READ': {
        const data = this.memory[this.currentAddress];
        // Sequential read auto-increments address across 32 KiB boundary
        this.currentAddress = (this.currentAddress + 1) % EEPROM_25LC256.CAPACITY_BYTES;
        return data;
      }

      case 'DATA_WRITE': {
        if (this.statusReg & EEPROM_STATUS_WEL) {
          if (this.pageBuffer.length < EEPROM_25LC256.PAGE_SIZE) {
            this.pageBuffer.push(byteIn);
          } else {
            // Overwrite within the 64-byte page buffer (page roll-over)
            const pageOffset = (this.pageBuffer.length) % EEPROM_25LC256.PAGE_SIZE;
            this.pageBuffer[pageOffset] = byteIn;
          }
        }
        return 0x00;
      }

      default:
        if (this.currentCommand === CMD_EEPROM_RDSR) {
          return this.statusReg;
        }
        return 0x00;
    }
  }

  private commitPageWrite(): void {
    const pageBase = this.pageStartAddress & ~(EEPROM_25LC256.PAGE_SIZE - 1);
    const startOffset = this.pageStartAddress % EEPROM_25LC256.PAGE_SIZE;

    for (let i = 0; i < this.pageBuffer.length; i++) {
      const targetOffset = (startOffset + i) % EEPROM_25LC256.PAGE_SIZE;
      const targetAddr = pageBase + targetOffset;
      if (targetAddr < EEPROM_25LC256.CAPACITY_BYTES) {
        this.memory[targetAddr] = this.pageBuffer[i];
      }
    }

    // Write finishes: WEL is automatically reset
    this.statusReg &= ~EEPROM_STATUS_WEL;
    this.pageBuffer = [];
  }

  // Inspection & Testing API
  public readMemory(address: number): number {
    return this.memory[address % EEPROM_25LC256.CAPACITY_BYTES];
  }

  public writeMemory(address: number, val: number): void {
    this.memory[address % EEPROM_25LC256.CAPACITY_BYTES] = val & 0xff;
  }

  public getRawMemory(): Uint8Array {
    return this.memory;
  }

  public getStatusRegister(): number {
    return this.statusReg;
  }
}

// ─── 2. Microchip MCP3008 10-Bit 8-Channel SPI ADC ──────────────────────────────────

export class ADC_MCP3008 implements RP2040SpiDevice {
  public readonly name = 'MCP3008-ADC';
  public static readonly NUM_CHANNELS = 8;

  private vref_V: number = 3.3;
  private channelVoltages: Float64Array = new Float64Array(ADC_MCP3008.NUM_CHANNELS);
  public isSelected: boolean = false;
  public bindToControllerCs: boolean = true;

  private rxByteIndex: number = 0;
  private isSingleEnded: boolean = true;
  private selectedChannel: number = 0;
  private conversionResult: number = 0;

  constructor(vref_V = 3.3) {
    this.vref_V = vref_V > 0 ? vref_V : 3.3;
  }

  public reset(): void {
    this.isSelected = false;
    this.rxByteIndex = 0;
    this.isSingleEnded = true;
    this.selectedChannel = 0;
    this.conversionResult = 0;
  }

  public setVRef(voltage_V: number): void {
    if (voltage_V > 0) this.vref_V = voltage_V;
  }

  public getVRef(): number {
    return this.vref_V;
  }

  public setChannelVoltage(channel: number, voltage_V: number): void {
    if (channel >= 0 && channel < ADC_MCP3008.NUM_CHANNELS) {
      this.channelVoltages[channel] = Math.max(0, Math.min(this.vref_V, voltage_V));
    }
  }

  public getChannelVoltage(channel: number): number {
    if (channel >= 0 && channel < ADC_MCP3008.NUM_CHANNELS) {
      return this.channelVoltages[channel];
    }
    return 0;
  }

  public select(csActiveLow: boolean): void {
    if (csActiveLow && !this.isSelected) {
      this.isSelected = true;
      this.rxByteIndex = 0;
    } else if (!csActiveLow && this.isSelected) {
      this.isSelected = false;
      this.rxByteIndex = 0;
    }
  }

  /**
   * MCP3008 3-Byte Protocol:
   * Byte 1: Start Bit [0, 0, 0, 0, 0, 0, 0, 1] (0x01)
   * Byte 2: [SGL/DIFF, D2, D1, D0, X, X, X, X]
   *         Returns: [X, X, X, X, X, NULL(0), B9, B8]
   * Byte 3: Don't care
   *         Returns: [B7, B6, B5, B4, B3, B2, B1, B0]
   */
  public transferByte(mosiByte: number): number {
    if (!this.isSelected) {
      return 0x00;
    }

    const byteIn = mosiByte & 0xff;

    if (this.rxByteIndex === 0) {
      // Waiting for start bit (0x01)
      if (byteIn === 0x01) {
        this.rxByteIndex = 1;
      }
      return 0x00;
    } else if (this.rxByteIndex === 1) {
      // Config byte
      this.isSingleEnded = (byteIn & 0x80) !== 0;
      this.selectedChannel = (byteIn >>> 4) & 0x07;

      // Sample analog voltage
      let analogV = 0;
      if (this.isSingleEnded) {
        analogV = this.channelVoltages[this.selectedChannel];
      } else {
        // Differential pair: 0-1, 2-3, 4-5, 6-7
        const posCh = (this.selectedChannel & ~1);
        const negCh = posCh + 1;
        const polarity = (this.selectedChannel & 1) === 0 ? 1 : -1;
        analogV = polarity * (this.channelVoltages[posCh] - this.channelVoltages[negCh]);
        if (analogV < 0) analogV = 0;
      }

      // Compute 10-bit integer digital code (0..1023)
      const ratio = Math.max(0, Math.min(1.0, analogV / this.vref_V));
      this.conversionResult = Math.floor(ratio * 1023);

      this.rxByteIndex = 2;
      // Return: Bits [1:0] are B9, B8. Bit 2 is NULL bit (0).
      const b9_b8 = (this.conversionResult >>> 8) & 0x03;
      return b9_b8;
    } else if (this.rxByteIndex === 2) {
      // Byte 3: Returns B7..B0
      const b7_b0 = this.conversionResult & 0xff;
      this.rxByteIndex = 3;
      return b7_b0;
    }

    return 0x00;
  }
}

// ─── 3. Texas Instruments 74HC595 8-Bit Shift Register with Output Latch ─────────────

export class ShiftRegister_74HC595 implements RP2040SpiDevice {
  public readonly name = '74HC595-ShiftRegister';

  public isSelected: boolean = false;
  public bindToControllerCs: boolean = true;

  private shiftRegister: number = 0;
  private outputLatch: number = 0;
  private outputEnableActiveLow: boolean = true; // /OE pin 13 (true = LOW/driving, false = HIGH/disabled/Hi-Z)
  private masterResetActiveLow: boolean = true;  // /SRCLR pin 10 (true = HIGH/normal, false = LOW/cleared)

  /**
   * Optional SPI CS Latch Adapter Mode.
   * In native 74HC595 hardware, there is NO Chip Select pin. Latching requires an STCP pulse (pin 12).
   * When this adapter mode is enabled, CS rising edge (deassertion) pulses STCP, emulating the
   * common microcontroller external circuit wiring where SPI CS is tied to STCP.
   * Default: FALSE (Standard hardware conformance).
   */
  public autoLatchOnCsRising: boolean = false;

  public reset(): void {
    this.isSelected = false;
    this.shiftRegister = 0;
    this.outputLatch = 0;
    this.outputEnableActiveLow = true;
    this.masterResetActiveLow = true;
    this.autoLatchOnCsRising = false;
  }

  /**
   * Configure optional SPI CS-to-STCP latch adapter behavior.
   * @param enable If true, CS rising edge automatically latches shift register into output storage.
   */
  public enableSpiCsLatchAdapter(enable: boolean = true): void {
    this.autoLatchOnCsRising = enable;
  }

  /**
   * Standard SPI bus selection handler (RP2040SpiDevice interface).
   * In standard hardware mode, asserting or deasserting CS does NOT alter the output storage register.
   */
  public select(csActiveLow: boolean): void {
    if (csActiveLow && !this.isSelected) {
      this.isSelected = true;
    } else if (!csActiveLow && this.isSelected) {
      if (this.autoLatchOnCsRising) {
        // Optional external adapter convenience only: CS rising edge pulses STCP
        this.pulseSTCP();
      }
      this.isSelected = false;
    }
  }

  /**
   * Full-duplex byte transfer via SPI (RP2040SpiDevice interface).
   * Emulates 8 clock cycles on SHCP with MOSI data clocked into SER.
   * Returns the 8 bits shifted out through QH' (pin 9).
   * Does NOT alter the output storage register in native mode!
   */
  public transferByte(mosiByte: number): number {
    if (!this.isSelected) {
      return 0x00;
    }

    if (!this.masterResetActiveLow) {
      this.shiftRegister = 0;
      return 0x00;
    }

    // Cascade output QH' (pin 9): previous contents shifted out
    const cascadeOut = this.shiftRegister;
    this.shiftRegister = mosiByte & 0xff;
    return cascadeOut;
  }

  /**
   * Clock Shift Register (SHCP / SRCLK, Pin 11, Rising Edge).
   * Shifts in one serial bit from SER (Pin 14).
   * Does NOT modify outputLatch (STCP is required for that).
   */
  public pulseSHCP(serBit: boolean): void {
    if (!this.masterResetActiveLow) {
      this.shiftRegister = 0;
      return;
    }
    this.shiftRegister = ((this.shiftRegister << 1) | (serBit ? 1 : 0)) & 0xff;
  }

  /** Alias for pulseSHCP */
  public clockShift(serBit: boolean): void {
    this.pulseSHCP(serBit);
  }

  /**
   * Storage Register Clock (STCP / RCLK, Pin 12, Rising Edge).
   * Transfers contents of shift register into parallel output storage latch.
   */
  public pulseSTCP(): void {
    this.outputLatch = this.shiftRegister;
  }

  /** Alias for pulseSTCP / RCLK */
  public pulseRCLK(): void {
    this.pulseSTCP();
  }

  /** Alias for pulseSTCP / latchOutputs */
  public latchOutputs(): void {
    this.pulseSTCP();
  }

  /** Alias for pulseSTCP */
  public pulseStorageClock(): void {
    this.pulseSTCP();
  }

  /**
   * Serial Output (QH', Pin 9).
   * Returns current MSB (bit 7) of the shift register for daisy chaining.
   */
  public getSerialOutputQHPrime(): boolean {
    return ((this.shiftRegister >>> 7) & 1) === 1;
  }

  /**
   * Control /OE (Output Enable, Pin 13, Active-LOW).
   * @param oeActiveLow When true (0V/GND), outputs QA-QH are actively driven.
   *                    When false (3.3V/VCC), outputs QA-QH are high-impedance (3-state).
   */
  public setOE(oeActiveLow: boolean): void {
    this.outputEnableActiveLow = oeActiveLow;
  }

  /**
   * Control /SRCLR (Shift Register Clear, Pin 10, Active-LOW).
   * Asynchronous master reset: when LOW (0V), resets shift register to 0.
   * Does NOT affect the storage register (outputLatch).
   * @param srclrActiveLow When false (0V/GND), shift register is asynchronously cleared.
   *                       When true (3.3V/VCC), normal shift operation is enabled.
   */
  public setSRCLR(srclrActiveLow: boolean): void {
    this.masterResetActiveLow = srclrActiveLow;
    if (!this.masterResetActiveLow) {
      this.shiftRegister = 0;
    }
  }

  public isOutputHighZ(): boolean {
    return !this.outputEnableActiveLow;
  }

  public getOutputLatch(): number {
    return this.outputLatch;
  }

  public getShiftRegister(): number {
    return this.shiftRegister;
  }

  public getOutputPin(pinIndex: number): boolean | null {
    if (!this.outputEnableActiveLow) {
      return null; // High-Z state
    }
    if (pinIndex >= 0 && pinIndex < 8) {
      return ((this.outputLatch >>> pinIndex) & 1) === 1;
    }
    return false;
  }

  public getOutputPinState(pinIndex: number): 'HIGH' | 'LOW' | 'HIGH_Z' {
    if (!this.outputEnableActiveLow) {
      return 'HIGH_Z';
    }
    if (pinIndex >= 0 && pinIndex < 8) {
      return ((this.outputLatch >>> pinIndex) & 1) === 1 ? 'HIGH' : 'LOW';
    }
    return 'LOW';
  }
}

