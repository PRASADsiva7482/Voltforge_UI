/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 Virtual I²C Device Models
 * 
 * Implements real virtual slave devices adhering to standard I²C protocols:
 * 1. AT24C32 EEPROM (16-bit memory addressing, byte & page writes, sequential reads)
 * 2. PCF8574 8-Bit I/O Expander (Quasi-bidirectional I/O, registerless read/write)
 * 3. LM75 Digital Temperature Sensor (Pointer-based registers, 16-bit temperature data)
 * 4. GenericI2cRegisterDevice (Configurable address, register map & clock stretching)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

export interface I2cVirtualDevice {
  /** 7-bit I2C slave address (0x08 - 0x77) */
  readonly address: number;
  /** Name of the peripheral model */
  readonly name: string;

  /** Called when master issues START or RESTART addressed to this device */
  onStart(readMode: boolean, restart: boolean): boolean;
  /** Called when master writes a data byte to this device; returns true if ACKed, false if NACKed */
  onWriteByte(byte: number): boolean;
  /** Called when master reads a data byte from this device */
  onReadByte(isLast: boolean): number;
  /** Called when master issues a STOP condition */
  onStop(): void;
  /** Returns true if this device is currently stretching SCL low */
  isClockStretching?(): boolean;
  /** Reset device internal state */
  reset(): void;
}

// ─── 1. AT24C32 / AT24C08 EEPROM Model ───────────────────────────────────────────────

export class AT24C32EEPROM implements I2cVirtualDevice {
  public readonly address: number;
  public readonly name: string = 'AT24C32-EEPROM';
  private memory: Uint8Array;
  private memoryAddress: number = 0;
  private addressBytesReceived: number = 0;
  private is16Bit: boolean;

  constructor(address = 0x50, sizeBytes = 4096, is16Bit = true) {
    this.address = address & 0x7f;
    this.memory = new Uint8Array(sizeBytes);
    this.is16Bit = is16Bit;
    // Default erased EEPROM contains 0xFF
    this.memory.fill(0xff);
  }

  public onStart(readMode: boolean, restart: boolean): boolean {
    if (!readMode) {
      this.addressBytesReceived = 0;
    }
    return true; // ACK address
  }

  public onWriteByte(byte: number): boolean {
    if (this.is16Bit) {
      if (this.addressBytesReceived === 0) {
        this.memoryAddress = (byte & 0x0f) << 8;
        this.addressBytesReceived = 1;
        return true; // ACK address high byte
      } else if (this.addressBytesReceived === 1) {
        this.memoryAddress |= (byte & 0xff);
        this.addressBytesReceived = 2;
        return true; // ACK address low byte
      }
    } else {
      if (this.addressBytesReceived === 0) {
        this.memoryAddress = byte & 0xff;
        this.addressBytesReceived = 1;
        return true;
      }
    }

    // Data byte write
    if (this.memoryAddress < this.memory.length) {
      this.memory[this.memoryAddress] = byte & 0xff;
      this.memoryAddress = (this.memoryAddress + 1) % this.memory.length;
    }
    return true; // ACK data byte
  }

  public onReadByte(isLast: boolean): number {
    const val = this.memory[this.memoryAddress % this.memory.length];
    this.memoryAddress = (this.memoryAddress + 1) % this.memory.length;
    return val;
  }

  public onStop(): void {
    this.addressBytesReceived = 0;
  }

  public reset(): void {
    this.memoryAddress = 0;
    this.addressBytesReceived = 0;
  }

  public readRaw(addr: number): number {
    return this.memory[addr % this.memory.length];
  }

  public writeRaw(addr: number, val: number): void {
    this.memory[addr % this.memory.length] = val & 0xff;
  }
}

// ─── 2. PCF8574 8-Bit I/O Expander Model ─────────────────────────────────────────────

export class PCF8574Expander implements I2cVirtualDevice {
  public readonly address: number;
  public readonly name: string = 'PCF8574-IO-Expander';
  private portOutput: number = 0xff; // Quasi-bidirectional default high
  private portInput: number = 0xff;

  constructor(address = 0x27) {
    this.address = address & 0x7f;
  }

  public onStart(readMode: boolean, restart: boolean): boolean {
    return true; // ACK address
  }

  public onWriteByte(byte: number): boolean {
    this.portOutput = byte & 0xff;
    return true; // ACK write
  }

  public onReadByte(isLast: boolean): number {
    // Port input ANDed with quasi-bidirectional output latches
    return (this.portInput & this.portOutput) & 0xff;
  }

  public onStop(): void {}

  public reset(): void {
    this.portOutput = 0xff;
    this.portInput = 0xff;
  }

  public setPinInput(pin: number, high: boolean): void {
    if (high) {
      this.portInput |= (1 << pin);
    } else {
      this.portInput &= ~(1 << pin);
    }
  }

  public getPortOutput(): number {
    return this.portOutput;
  }
}

// ─── 3. LM75 Digital Temperature Sensor Model ───────────────────────────────────────

export class LM75TempSensor implements I2cVirtualDevice {
  public readonly address: number;
  public readonly name: string = 'LM75-Temperature-Sensor';
  private pointer: number = 0;
  private pointerSet: boolean = false;
  private temperatureRaw: number = 0x1980; // 25.5 °C (0x19 = 25, 0x80 = 0.5)
  private configReg: number = 0;
  private thystRaw: number = 0x4b00; // 75 °C
  private tosRaw: number = 0x5000;   // 80 °C
  private readByteIndex: number = 0;

  constructor(address = 0x48) {
    this.address = address & 0x7f;
  }

  public onStart(readMode: boolean, restart: boolean): boolean {
    this.readByteIndex = 0;
    if (!readMode) {
      this.pointerSet = false;
    }
    return true; // ACK address
  }

  public onWriteByte(byte: number): boolean {
    if (!this.pointerSet) {
      this.pointer = byte & 0x03;
      this.pointerSet = true;
      return true; // ACK pointer byte
    }

    if (this.pointer === 1) {
      this.configReg = byte & 0xff;
      return true;
    }
    return true;
  }

  public onReadByte(isLast: boolean): number {
    let regVal = 0;
    switch (this.pointer) {
      case 0: regVal = this.temperatureRaw; break;
      case 1: regVal = this.configReg << 8; break;
      case 2: regVal = this.thystRaw; break;
      case 3: regVal = this.tosRaw; break;
    }

    let byteOut = 0;
    if (this.readByteIndex === 0) {
      byteOut = (regVal >>> 8) & 0xff;
      this.readByteIndex = 1;
    } else {
      byteOut = regVal & 0xff;
      this.readByteIndex = 0;
    }
    return byteOut;
  }

  public onStop(): void {
    this.readByteIndex = 0;
  }

  public reset(): void {
    this.pointer = 0;
    this.pointerSet = false;
    this.temperatureRaw = 0x1980;
    this.configReg = 0;
    this.readByteIndex = 0;
  }

  public setTemperature(celsius: number): void {
    const raw = Math.round(celsius / 0.125) << 5;
    this.temperatureRaw = raw & 0xffe0;
  }
}

// ─── 4. Generic Configurable I2C Register Device with Clock Stretching ───────────────

export class GenericI2cRegisterDevice implements I2cVirtualDevice {
  public readonly address: number;
  public readonly name: string;
  public registers: Uint8Array = new Uint8Array(256);
  private currentRegister: number = 0;
  private registerPointerSet: boolean = false;
  private stretchCyclesRemaining: number = 0;
  private configuredStretchCycles: number = 0;

  constructor(address = 0x3c, name = 'Generic-I2C-Device') {
    this.address = address & 0x7f;
    this.name = name;
  }

  public setClockStretchingCycles(cycles: number): void {
    this.configuredStretchCycles = cycles;
  }

  public isClockStretching(): boolean {
    return this.stretchCyclesRemaining > 0;
  }

  public stepStretch(deltaCycles: number): void {
    if (this.stretchCyclesRemaining > 0) {
      this.stretchCyclesRemaining = Math.max(0, this.stretchCyclesRemaining - deltaCycles);
    }
  }

  public onStart(readMode: boolean, restart: boolean): boolean {
    if (!readMode) {
      this.registerPointerSet = false;
    }
    if (this.configuredStretchCycles > 0) {
      this.stretchCyclesRemaining = this.configuredStretchCycles;
    }
    return true; // ACK address
  }

  public onWriteByte(byte: number): boolean {
    if (!this.registerPointerSet) {
      this.currentRegister = byte & 0xff;
      this.registerPointerSet = true;
      return true; // ACK register address
    }

    this.registers[this.currentRegister] = byte & 0xff;
    this.currentRegister = (this.currentRegister + 1) & 0xff;
    return true; // ACK data write
  }

  public onReadByte(isLast: boolean): number {
    const val = this.registers[this.currentRegister];
    this.currentRegister = (this.currentRegister + 1) & 0xff;
    return val;
  }

  public onStop(): void {
    this.registerPointerSet = false;
    this.stretchCyclesRemaining = 0;
  }

  public reset(): void {
    this.registers.fill(0);
    this.currentRegister = 0;
    this.registerPointerSet = false;
    this.stretchCyclesRemaining = 0;
  }
}

