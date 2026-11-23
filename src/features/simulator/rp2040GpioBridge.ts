/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — RP2040 GPIO Electrical Bridge & MNA Circuit Co-Simulation
 * 
 * Bridges emulated RP2040 GPIO hardware registers (SIO, IO_BANK0, PADS_BANK0) to
 * VoltForge's Modified Nodal Analysis (MNA) circuit solver.
 * 
 * Features:
 * 1. Complete RP2040 GPIO Register Model:
 *    - SIO: SIO_GPIO_IN (0x04), SIO_GPIO_OUT (0x10), OUT_SET (0x14), OUT_CLR (0x18), OUT_XOR (0x1c),
 *           SIO_GPIO_OE (0x20), OE_SET (0x24), OE_CLR (0x28), OE_XOR (0x2c).
 *    - IO_BANK0: Function select (FUNCSEL=5 for SIO, 4 for PWM, 1 for SPI, 2 for UART, 3 for I2C),
 *                output overrides, input overrides.
 *    - PADS_BANK0: Input enable (IE), Output disable (OD), Drive strength (2, 4, 8, 12 mA),
 *                  pull-up (PUE), pull-down (PDE), Schmitt trigger hysteresis.
 *    - Pin boundaries: RP2040 chip GPIOs 0-29 vs Raspberry Pi Pico board exposed pins (GP0-GP22, GP26-GP28)
 *      and internal pins (GP23: SMPS mode, GP24: VBUS sense, GP25: User LED, GP29: VSYS/3 ADC).
 * 
 * 2. Realistic Electrical Output Driver (Thevenin Equivalent):
 *    - Logic HIGH target: ~3.3V (VDD_IO).
 *    - Logic LOW target: ~0.0V (GND).
 *    - Finite output impedance (Ron):
 *        * 2 mA drive:  Ron ≈ 100 Ω
 *        * 4 mA drive:  Ron ≈ 50 Ω (RP2040 reset default)
 *        * 8 mA drive:  Ron ≈ 25 Ω
 *        * 12 mA drive: Ron ≈ 17 Ω
 *    - Input mode impedance:
 *        * Pull-up:     Rpull ≈ 50 kΩ (target 3.3V)
 *        * Pull-down:   Rpull ≈ 50 kΩ (target 0.0V)
 *        * Bus keeper:  Rpull ≈ 50 kΩ (target retains previous logic state)
 *        * High-Z:      Roff  = 100 MΩ (1e8 Ω, target 0.0V)
 * 
 * 3. MNA-to-GPIO Input Feedback:
 *    - Guaranteed LOW threshold:  Vin ≤ 0.8V
 *    - Guaranteed HIGH threshold: Vin ≥ 2.0V
 *    - Schmitt trigger hysteresis (default): Vt+ ≈ 1.55V, Vt- ≈ 1.15V
 *    - Undefined / indeterminate region detection
 *    - Live feedback to SIO_GPIO_IN via rp2040.gpio[i].setInputValue()
 * 
 * 4. Comprehensive Safety & Fault Detection:
 *    - Absolute maximum rating: 16 mA per pin
 *    - Short-to-GND, Short-to-3.3V, Contention between conflicting drivers
 *    - Floating input detection
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { RP2040, GPIOPin, GPIOPinState } from 'rp2040js';
import type { RP2040Uart } from './rp2040Uart';
import type { RP2040I2c } from './rp2040I2c';
import type { RP2040Spi } from './rp2040Spi';
import type { RP2040Pwm } from './rp2040Pwm';

export const FUNCTION_SPI = 1;
export const FUNCTION_UART = 2;
export const FUNCTION_I2C = 3;
export const FUNCTION_PWM = 4;
export const FUNCTION_SIO = 5;

// RP2040 Pinout Multiplexing for SPI (RP2040 Datasheet Section 1.4.3 Table 2)
// Function 1 is SPI.
export const SPI0_RX_PINS  = [0, 4, 16, 20];
export const SPI0_CSN_PINS = [1, 5, 17, 21];
export const SPI0_SCK_PINS = [2, 6, 18, 22];
export const SPI0_TX_PINS  = [3, 7, 19, 23];

export const SPI1_RX_PINS  = [8, 12, 24, 28];
export const SPI1_CSN_PINS = [9, 13, 25, 29];
export const SPI1_SCK_PINS = [10, 14, 26];
export const SPI1_TX_PINS  = [11, 15, 27];

// RP2040 Pinout Multiplexing for UART (RP2040 Datasheet Section 1.4.3 Table 2)
export const UART0_TX_PINS = [0, 12, 16, 28];
export const UART0_RX_PINS = [1, 13, 17, 29];
export const UART0_CTS_PINS = [2, 14, 18];
export const UART0_RTS_PINS = [3, 15, 19];

export const UART1_TX_PINS = [4, 8, 20, 24];
export const UART1_RX_PINS = [5, 9, 21, 25];
export const UART1_CTS_PINS = [6, 10, 22, 26];
export const UART1_RTS_PINS = [7, 11, 23, 27];

// RP2040 Pinout Multiplexing for I2C (RP2040 Datasheet Section 1.4.3 Table 2)
// Function 3 is I2C.
// I2C0: SDA on GP0, 4, 8, 12, 16, 20, 24, 28; SCL on GP1, 5, 9, 13, 17, 21, 25, 29
// I2C1: SDA on GP2, 6, 10, 14, 18, 22, 26; SCL on GP3, 7, 11, 15, 19, 23, 27
export const I2C0_SDA_PINS = [0, 4, 8, 12, 16, 20, 24, 28];
export const I2C0_SCL_PINS = [1, 5, 9, 13, 17, 21, 25, 29];
export const I2C1_SDA_PINS = [2, 6, 10, 14, 18, 22, 26];
export const I2C1_SCL_PINS = [3, 7, 11, 15, 19, 23, 27];

export const RP2040_NUM_GPIOS = 30;
export const RP2040_NUM_QSPI_PINS = 6;
export const RP2040_DEFAULT_VDD_IO = 3.3; // Volts
export const RP2040_MAX_PIN_CURRENT_A = 0.016; // 16 mA configurable engineering policy threshold
export const RP2040_MAX_BANK_CURRENT_A = 0.050; // 50 mA configurable engineering warning threshold (application guideline for IOVDD/IOVSS rail limits; not a guaranteed silicon clamp in RP2040 chip datasheet Table 627)
export const RP2040_VIL_MAX = 0.8; // Guaranteed LOW threshold (V)
export const RP2040_VIH_MIN = 2.0; // Guaranteed HIGH threshold (V)
export const RP2040_SCHMITT_VT_POS = 1.55; // Schmitt positive threshold (V, default)
export const RP2040_SCHMITT_VT_NEG = 1.15; // Schmitt negative threshold (V, default)
export const RP2040_PULL_RESISTANCE_MIN_OHMS = 50_000; // 50 kΩ minimum
export const RP2040_PULL_RESISTANCE_TYP_OHMS = 64_000; // 64 kΩ typical (RP2040 datasheet Table 628)
export const RP2040_PULL_RESISTANCE_MAX_OHMS = 80_000; // 80 kΩ maximum
export const RP2040_PULL_RESISTANCE_OHMS = 50_000; // Backward compatible default
export const RP2040_HIGH_Z_RESISTANCE_OHMS = 1e8; // 100 MΩ

export type Rp2040PinFunction =
  | 'XIP'
  | 'SPI'
  | 'UART'
  | 'I2C'
  | 'PWM'
  | 'SIO'
  | 'PIO0'
  | 'PIO1'
  | 'CLK'
  | 'USB'
  | 'RESERVED';

export type Rp2040InputLogicLevel =
  | 'FLOATING'
  | 'WEAKLY_BIASED'
  | 'DEFINED_LOW'
  | 'DEFINED_HIGH'
  | 'UNDEFINED_REGION';

export function getFunctionSelectName(funcsel: number): Rp2040PinFunction {
  switch (funcsel) {
    case 0: return 'XIP';
    case 1: return 'SPI';
    case 2: return 'UART';
    case 3: return 'I2C';
    case 4: return 'PWM';
    case 5: return 'SIO';
    case 6: return 'PIO0';
    case 7: return 'PIO1';
    case 8: return 'CLK';
    case 9: return 'USB';
    default: return 'RESERVED';
  }
}

export interface Rp2040PinDriverState {
  gpioIndex: number;
  pinName: string;
  isPicoHeaderPin: boolean;
  headerPinLabel: string;
  functionSelect: number;
  functionName: Rp2040PinFunction;
  outputEnable: boolean;
  outputDisable: boolean;
  inputEnable: boolean;
  pullupEnabled: boolean;
  pulldownEnabled: boolean;
  driveStrength_mA: number;
  schmittEnabled: boolean;
  logicalOutput: boolean;
  logicalInput: boolean;
  inputLogicLevel: Rp2040InputLogicLevel;
  electricalTargetVoltage_V: number;
  driverImpedance_Ohms: number;
  measuredVoltage_V: number;
  measuredCurrent_A: number;
  powerDissipation_W: number;
  faults: {
    overcurrent: boolean;
    contention: boolean;
    shortToGround: boolean;
    shortToVdd: boolean;
    floating: boolean;
    indeterminateVoltage: boolean;
    bankOvercurrentSourcing?: boolean;
    bankOvercurrentSinking?: boolean;
    perPinOvercurrentPolicy?: boolean;
  };
}

export interface Rp2040GpioDiagnostics {
  bankCurrentLimit_A: number;
  perPinPolicyLimit_A: number;
  totalSourcingCurrent_A: number;
  totalSinkingCurrent_A: number;
  gpioSourcingCurrent_A: number;
  gpioSinkingCurrent_A: number;
  qspiSourcingCurrent_A: number;
  qspiSinkingCurrent_A: number;
  isBankSourcingOvercurrent: boolean;
  isBankSinkingOvercurrent: boolean;
  overcurrentPins: number[];
}

export interface Rp2040DriverUpdateEvent {
  gpioIndex: number;
  sourceId: string;
  resistorId: string;
  targetVoltage_V: number;
  resistance_Ohms: number;
}

export interface Rp2040GpioTransitionEvent {
  gpioIndex: number;
  oldLogicalOutput: boolean;
  newLogicalOutput: boolean;
  oldOutputEnable: boolean;
  newOutputEnable: boolean;
  cycle: number;
  simulatedTime_s: number;
  sourceId: string;
  resistorId: string;
  targetVoltage_V: number;
  resistance_Ohms: number;
}

export interface Rp2040BridgeConfig {
  boardComponentId?: string;
  vddIo?: number;
  pullResistance_Ohms?: number;
  schmittVtPos_V?: number;
  schmittVtNeg_V?: number;
  perPinPolicyLimit_A?: number;
  bankCurrentLimit_A?: number;
}

export class RP2040GpioBridge {
  private rp2040: RP2040;
  private boardComponentId: string;
  private vddIo: number;
  private pullResistance_Ohms: number = RP2040_PULL_RESISTANCE_OHMS;
  private schmittVtPos_V: number = RP2040_SCHMITT_VT_POS;
  private schmittVtNeg_V: number = RP2040_SCHMITT_VT_NEG;
  private perPinPolicyLimit_A: number = RP2040_MAX_PIN_CURRENT_A;
  private bankCurrentLimit_A: number = RP2040_MAX_BANK_CURRENT_A;
  private totalBankSourcingCurrent_A = 0;
  private totalBankSinkingCurrent_A = 0;
  private gpioSourcingCurrent_A = 0;
  private gpioSinkingCurrent_A = 0;
  private qspiSourcingCurrent_A = 0;
  private qspiSinkingCurrent_A = 0;
  private transitionEventQueue: Rp2040GpioTransitionEvent[] = [];
  private timingProvider?: () => { cycle: number; simulatedTime_s: number };
  private driverStates: Rp2040PinDriverState[] = [];
  private qspiDriverStates: Rp2040PinDriverState[] = [];
  private pinListeners: (() => void)[] = [];
  private onDriverChangeCallbacks: ((event: Rp2040DriverUpdateEvent) => void)[] = [];
  private uart0: RP2040Uart | null = null;
  private uart1: RP2040Uart | null = null;
  private i2c0: RP2040I2c | null = null;
  private i2c1: RP2040I2c | null = null;
  private spi0: RP2040Spi | null = null;
  private spi1: RP2040Spi | null = null;
  private pwm: RP2040Pwm | null = null;

  // Map Pico header pin numbers (e.g., '0' for GP0, '15' for GP15, 'A0' for GP26)
  private static readonly PICO_PIN_MAP: Record<number, string> = {
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
    8: '8', 9: '9', 10: '10', 11: '11', 12: '12', 13: '13', 14: '14', 15: '15',
    16: '16', 17: '17', 18: '18', 19: '19', 20: '20', 21: '21', 22: '22',
    23: 'INTERNAL_SMPS_MODE',
    24: 'INTERNAL_VBUS_SENSE',
    25: 'INTERNAL_LED',
    26: 'A0', // GP26 = ADC0
    27: 'A1', // GP27 = ADC1
    28: 'A2', // GP28 = ADC2
    29: 'INTERNAL_VSYS_SENSE', // GP29 = ADC3 / VSYS_DIV3
  };

  constructor(
    rp2040: RP2040,
    boardComponentId = 'pico_0',
    vddIo = RP2040_DEFAULT_VDD_IO,
    config?: Rp2040BridgeConfig
  ) {
    this.rp2040 = rp2040;
    this.boardComponentId = boardComponentId;
    this.vddIo = vddIo;
    if (config) {
      if (config.pullResistance_Ohms !== undefined) this.pullResistance_Ohms = config.pullResistance_Ohms;
      if (config.schmittVtPos_V !== undefined) this.schmittVtPos_V = config.schmittVtPos_V;
      if (config.schmittVtNeg_V !== undefined) this.schmittVtNeg_V = config.schmittVtNeg_V;
      if (config.perPinPolicyLimit_A !== undefined) this.perPinPolicyLimit_A = config.perPinPolicyLimit_A;
      if (config.bankCurrentLimit_A !== undefined) this.bankCurrentLimit_A = config.bankCurrentLimit_A;
    }

    this.initializeDriverStates();
    this.attachHardwareListeners();
  }

  // ─── Initialization & Listeners ────────────────────────────────────────────────────

  private initializeDriverStates(): void {
    this.driverStates = [];
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      const isHeader = i <= 22 || (i >= 26 && i <= 28);
      const headerLabel = RP2040GpioBridge.PICO_PIN_MAP[i] ?? `GP${i}`;

      const state: Rp2040PinDriverState = {
        gpioIndex: i,
        pinName: `GP${i}`,
        isPicoHeaderPin: isHeader,
        headerPinLabel: headerLabel,
        functionSelect: 5, // SIO default
        functionName: 'SIO',
        outputEnable: false,
        outputDisable: false,
        inputEnable: false,
        pullupEnabled: false,
        pulldownEnabled: false,
        driveStrength_mA: 4,
        schmittEnabled: true,
        logicalOutput: false,
        logicalInput: false,
        inputLogicLevel: 'UNDEFINED_REGION',
        electricalTargetVoltage_V: 0,
        driverImpedance_Ohms: RP2040_HIGH_Z_RESISTANCE_OHMS,
        measuredVoltage_V: 0,
        measuredCurrent_A: 0,
        powerDissipation_W: 0,
        faults: {
          overcurrent: false,
          contention: false,
          shortToGround: false,
          shortToVdd: false,
          floating: false,
          indeterminateVoltage: false,
          bankOvercurrentSourcing: false,
          bankOvercurrentSinking: false,
          perPinOvercurrentPolicy: false,
        },
      };

      this.driverStates.push(state);
      this.recomputeDriverState(i);
    }

    this.qspiDriverStates = [];
    const qspiLabels = ['QSPI_SCLK', 'QSPI_SS', 'QSPI_SD0', 'QSPI_SD1', 'QSPI_SD2', 'QSPI_SD3'];
    for (let i = 0; i < RP2040_NUM_QSPI_PINS; i++) {
      const qspiPin = this.rp2040.qspi ? this.rp2040.qspi[i] : undefined;
      const state: Rp2040PinDriverState = {
        gpioIndex: 30 + i,
        pinName: qspiLabels[i],
        isPicoHeaderPin: false,
        headerPinLabel: qspiLabels[i],
        functionSelect: qspiPin ? qspiPin.functionSelect : 0,
        functionName: 'XIP',
        outputEnable: qspiPin ? qspiPin.outputEnable : false,
        outputDisable: qspiPin ? qspiPin.outputDisable : false,
        inputEnable: qspiPin ? qspiPin.inputEnable : true,
        pullupEnabled: qspiPin ? qspiPin.pullupEnabled : false,
        pulldownEnabled: qspiPin ? qspiPin.pulldownEnabled : false,
        driveStrength_mA: 12,
        schmittEnabled: qspiPin ? qspiPin.schmittEnabled : true,
        logicalOutput: qspiPin ? qspiPin.outputValue : false,
        logicalInput: qspiPin ? qspiPin.inputValue : false,
        inputLogicLevel: 'DEFINED_HIGH',
        electricalTargetVoltage_V: this.vddIo,
        driverImpedance_Ohms: 17,
        measuredVoltage_V: this.vddIo,
        measuredCurrent_A: 0,
        powerDissipation_W: 0,
        faults: {
          overcurrent: false,
          contention: false,
          shortToGround: false,
          shortToVdd: false,
          floating: false,
          indeterminateVoltage: false,
          bankOvercurrentSourcing: false,
          bankOvercurrentSinking: false,
          perPinOvercurrentPolicy: false,
        },
      };
      this.qspiDriverStates.push(state);
    }
  }

  private attachHardwareListeners(): void {
    this.detachHardwareListeners();

    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      const pin = this.rp2040.gpio[i];
      if (!pin) continue;

      const unsubscribe = pin.addListener(() => {
        const prevLogicalOutput = this.driverStates[i]?.logicalOutput ?? false;
        const prevOutputEnable = this.driverStates[i]?.outputEnable ?? false;
        const prevTargetV = this.driverStates[i]?.electricalTargetVoltage_V ?? 0;

        this.recomputeDriverState(i);
        const curr = this.driverStates[i];

        if (pin.functionSelect === FUNCTION_PWM && (i % 2 === 1) && this.pwm) {
          const slice = (i >> 1) & 0x7;
          this.pwm.setPinBLevel(slice, pin.inputValue);
        }

        if (curr && (prevLogicalOutput !== curr.logicalOutput ||
            prevOutputEnable !== curr.outputEnable ||
            prevTargetV !== curr.electricalTargetVoltage_V)) {
          const timing = this.timingProvider
            ? this.timingProvider()
            : {
                cycle: this.rp2040.core.cycles,
                simulatedTime_s: this.rp2040.core.cycles / (this.rp2040.clkSys || 133_000_000),
              };
          this.transitionEventQueue.push({
            gpioIndex: i,
            oldLogicalOutput: prevLogicalOutput,
            newLogicalOutput: curr.logicalOutput,
            oldOutputEnable: prevOutputEnable,
            newOutputEnable: curr.outputEnable,
            cycle: timing.cycle,
            simulatedTime_s: timing.simulatedTime_s,
            sourceId: this.getMnaVoltageSourceId(i),
            resistorId: this.getMnaResistorId(i),
            targetVoltage_V: curr.electricalTargetVoltage_V,
            resistance_Ohms: curr.driverImpedance_Ohms,
          });
        }

        this.emitDriverUpdate(i);
      });
      this.pinListeners.push(unsubscribe);
    }
  }

  public detachHardwareListeners(): void {
    for (const unsub of this.pinListeners) {
      unsub();
    }
    this.pinListeners = [];
  }

  // ─── Electrical Driver Computation ─────────────────────────────────────────────────

  /**
   * Translates drive strength register setting (0-3) to finite output impedance.
   * Drive strength in RP2040 PADS_BANK0:
   * 0 -> 2 mA  (Ron ≈ 100 Ω)
   * 1 -> 4 mA  (Ron ≈ 50 Ω, default)
   * 2 -> 8 mA  (Ron ≈ 25 Ω)
   * 3 -> 12 mA (Ron ≈ 17 Ω)
   */
  public static driveStrengthToImpedance(strengthCode: number): { resistance: number; mA: number } {
    switch (strengthCode & 0x3) {
      case 0: return { resistance: 100, mA: 2 };
      case 1: return { resistance: 50, mA: 4 };
      case 2: return { resistance: 25, mA: 8 };
      case 3: return { resistance: 17, mA: 12 };
      default: return { resistance: 50, mA: 4 };
    }
  }

  public attachUart(uart0: RP2040Uart, uart1: RP2040Uart): void {
    this.uart0 = uart0;
    this.uart1 = uart1;
    uart0.onTxPinStateChange = () => this.handleUartTxPinChange(0);
    uart1.onTxPinStateChange = () => this.handleUartTxPinChange(1);
    uart0.onRtsPinStateChange = () => this.handleUartRtsPinChange(0);
    uart1.onRtsPinStateChange = () => this.handleUartRtsPinChange(1);
  }

  private handleUartTxPinChange(uartIndex: number): void {
    const pins = uartIndex === 0 ? UART0_TX_PINS : UART1_TX_PINS;
    for (const pinIdx of pins) {
      const pin = this.rp2040.gpio[pinIdx];
      if (pin && pin.functionSelect === FUNCTION_UART) {
        const prevLogicalOutput = this.driverStates[pinIdx]?.logicalOutput ?? false;
        const prevTargetV = this.driverStates[pinIdx]?.electricalTargetVoltage_V ?? 0;
        this.recomputeDriverState(pinIdx);
        const curr = this.driverStates[pinIdx];
        if (curr && (prevLogicalOutput !== curr.logicalOutput || prevTargetV !== curr.electricalTargetVoltage_V)) {
          const timing = this.timingProvider
            ? this.timingProvider()
            : {
                cycle: this.rp2040.core.cycles,
                simulatedTime_s: this.rp2040.core.cycles / (this.rp2040.clkSys || 133_000_000),
              };
          this.transitionEventQueue.push({
            gpioIndex: pinIdx,
            oldLogicalOutput: prevLogicalOutput,
            newLogicalOutput: curr.logicalOutput,
            oldOutputEnable: curr.outputEnable,
            newOutputEnable: curr.outputEnable,
            cycle: timing.cycle,
            simulatedTime_s: timing.simulatedTime_s,
            sourceId: this.getMnaVoltageSourceId(pinIdx),
            resistorId: this.getMnaResistorId(pinIdx),
            targetVoltage_V: curr.electricalTargetVoltage_V,
            resistance_Ohms: curr.driverImpedance_Ohms,
          });
          this.emitDriverUpdate(pinIdx);
        }
      }
    }
  }

  private handleUartRtsPinChange(uartIndex: number): void {
    const pins = uartIndex === 0 ? UART0_RTS_PINS : UART1_RTS_PINS;
    for (const pinIdx of pins) {
      const pin = this.rp2040.gpio[pinIdx];
      if (pin && pin.functionSelect === FUNCTION_UART) {
        const prevLogicalOutput = this.driverStates[pinIdx]?.logicalOutput ?? false;
        const prevTargetV = this.driverStates[pinIdx]?.electricalTargetVoltage_V ?? 0;
        this.recomputeDriverState(pinIdx);
        const curr = this.driverStates[pinIdx];
        if (curr && (prevLogicalOutput !== curr.logicalOutput || prevTargetV !== curr.electricalTargetVoltage_V)) {
          const timing = this.timingProvider
            ? this.timingProvider()
            : {
                cycle: this.rp2040.core.cycles,
                simulatedTime_s: this.rp2040.core.cycles / (this.rp2040.clkSys || 133_000_000),
              };
          this.transitionEventQueue.push({
            gpioIndex: pinIdx,
            oldLogicalOutput: prevLogicalOutput,
            newLogicalOutput: curr.logicalOutput,
            oldOutputEnable: curr.outputEnable,
            newOutputEnable: curr.outputEnable,
            cycle: timing.cycle,
            simulatedTime_s: timing.simulatedTime_s,
            sourceId: this.getMnaVoltageSourceId(pinIdx),
            resistorId: this.getMnaResistorId(pinIdx),
            targetVoltage_V: curr.electricalTargetVoltage_V,
            resistance_Ohms: curr.driverImpedance_Ohms,
          });
          this.emitDriverUpdate(pinIdx);
        }
      }
    }
  }

  public attachI2c(i2c0: RP2040I2c, i2c1: RP2040I2c): void {
    this.i2c0 = i2c0;
    this.i2c1 = i2c1;
    i2c0.onSdaPinChange = () => this.handleI2cPinChange(0, 'SDA');
    i2c0.onSclPinChange = () => this.handleI2cPinChange(0, 'SCL');
    i2c1.onSdaPinChange = () => this.handleI2cPinChange(1, 'SDA');
    i2c1.onSclPinChange = () => this.handleI2cPinChange(1, 'SCL');
  }

  private handleI2cPinChange(i2cIndex: number, line: 'SDA' | 'SCL'): void {
    const pins = i2cIndex === 0
      ? (line === 'SDA' ? I2C0_SDA_PINS : I2C0_SCL_PINS)
      : (line === 'SDA' ? I2C1_SDA_PINS : I2C1_SCL_PINS);

    for (const pinIdx of pins) {
      const pin = this.rp2040.gpio[pinIdx];
      if (pin && pin.functionSelect === FUNCTION_I2C) {
        const prevLogicalOutput = this.driverStates[pinIdx]?.logicalOutput ?? false;
        const prevTargetV = this.driverStates[pinIdx]?.electricalTargetVoltage_V ?? 0;
        const prevImpedance = this.driverStates[pinIdx]?.driverImpedance_Ohms ?? RP2040_HIGH_Z_RESISTANCE_OHMS;
        this.recomputeDriverState(pinIdx);
        const curr = this.driverStates[pinIdx];
        if (curr && (prevLogicalOutput !== curr.logicalOutput ||
            prevTargetV !== curr.electricalTargetVoltage_V ||
            prevImpedance !== curr.driverImpedance_Ohms)) {
          const timing = this.timingProvider
            ? this.timingProvider()
            : {
                cycle: this.rp2040.core.cycles,
                simulatedTime_s: this.rp2040.core.cycles / (this.rp2040.clkSys || 133_000_000),
              };
          this.transitionEventQueue.push({
            gpioIndex: pinIdx,
            oldLogicalOutput: prevLogicalOutput,
            newLogicalOutput: curr.logicalOutput,
            oldOutputEnable: curr.outputEnable,
            newOutputEnable: curr.outputEnable,
            cycle: timing.cycle,
            simulatedTime_s: timing.simulatedTime_s,
            sourceId: this.getMnaVoltageSourceId(pinIdx),
            resistorId: this.getMnaResistorId(pinIdx),
            targetVoltage_V: curr.electricalTargetVoltage_V,
            resistance_Ohms: curr.driverImpedance_Ohms,
          });
          this.emitDriverUpdate(pinIdx);
        }
      }
    }
  }

  public attachSpi(spi0: RP2040Spi, spi1: RP2040Spi): void {
    this.spi0 = spi0;
    this.spi1 = spi1;
    spi0.onPinChange = () => this.handleSpiPinChange(0);
    spi1.onPinChange = () => this.handleSpiPinChange(1);
  }

  private handleSpiPinChange(spiIndex: number): void {
    const pins = spiIndex === 0
      ? [...SPI0_SCK_PINS, ...SPI0_TX_PINS, ...SPI0_CSN_PINS]
      : [...SPI1_SCK_PINS, ...SPI1_TX_PINS, ...SPI1_CSN_PINS];

    for (const pinIdx of pins) {
      const pin = this.rp2040.gpio[pinIdx];
      if (pin && pin.functionSelect === FUNCTION_SPI) {
        const prevLogicalOutput = this.driverStates[pinIdx]?.logicalOutput ?? false;
        const prevTargetV = this.driverStates[pinIdx]?.electricalTargetVoltage_V ?? 0;
        const prevImpedance = this.driverStates[pinIdx]?.driverImpedance_Ohms ?? RP2040_HIGH_Z_RESISTANCE_OHMS;
        this.recomputeDriverState(pinIdx);
        const curr = this.driverStates[pinIdx];
        if (curr && (prevLogicalOutput !== curr.logicalOutput ||
            prevTargetV !== curr.electricalTargetVoltage_V ||
            prevImpedance !== curr.driverImpedance_Ohms)) {
          const timing = this.timingProvider
            ? this.timingProvider()
            : {
                cycle: this.rp2040.core.cycles,
                simulatedTime_s: this.rp2040.core.cycles / (this.rp2040.clkSys || 133_000_000),
              };
          this.transitionEventQueue.push({
            gpioIndex: pinIdx,
            oldLogicalOutput: prevLogicalOutput,
            newLogicalOutput: curr.logicalOutput,
            oldOutputEnable: curr.outputEnable,
            newOutputEnable: curr.outputEnable,
            cycle: timing.cycle,
            simulatedTime_s: timing.simulatedTime_s,
            sourceId: this.getMnaVoltageSourceId(pinIdx),
            resistorId: this.getMnaResistorId(pinIdx),
            targetVoltage_V: curr.electricalTargetVoltage_V,
            resistance_Ohms: curr.driverImpedance_Ohms,
          });
          this.emitDriverUpdate(pinIdx);
        }
      }
    }
  }

  public attachPwm(pwm: RP2040Pwm): void {
    this.pwm = pwm;
    pwm.onPinChange = () => this.handlePwmPinChange();
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      const pin = this.rp2040.gpio[i];
      if (pin && pin.functionSelect === FUNCTION_PWM) {
        if (i % 2 === 1) {
          const slice = (i >> 1) & 0x7;
          pwm.setPinBLevel(slice, pin.inputValue);
        }
        this.recomputeDriverState(i);
        this.emitDriverUpdate(i);
      }
    }
  }

  private handlePwmPinChange(): void {
    for (let pinIdx = 0; pinIdx < RP2040_NUM_GPIOS; pinIdx++) {
      const pin = this.rp2040.gpio[pinIdx];
      if (pin && pin.functionSelect === FUNCTION_PWM) {
        const prevLogicalOutput = this.driverStates[pinIdx]?.logicalOutput ?? false;
        const prevTargetV = this.driverStates[pinIdx]?.electricalTargetVoltage_V ?? 0;
        const prevImpedance = this.driverStates[pinIdx]?.driverImpedance_Ohms ?? RP2040_HIGH_Z_RESISTANCE_OHMS;
        this.recomputeDriverState(pinIdx);
        const curr = this.driverStates[pinIdx];
        if (curr && (prevLogicalOutput !== curr.logicalOutput ||
            prevTargetV !== curr.electricalTargetVoltage_V ||
            prevImpedance !== curr.driverImpedance_Ohms)) {
          const timing = this.timingProvider
            ? this.timingProvider()
            : {
                cycle: this.rp2040.core.cycles,
                simulatedTime_s: this.rp2040.core.cycles / (this.rp2040.clkSys || 133_000_000),
              };
          this.transitionEventQueue.push({
            gpioIndex: pinIdx,
            oldLogicalOutput: prevLogicalOutput,
            newLogicalOutput: curr.logicalOutput,
            oldOutputEnable: curr.outputEnable,
            newOutputEnable: curr.outputEnable,
            cycle: timing.cycle,
            simulatedTime_s: timing.simulatedTime_s,
            sourceId: this.getMnaVoltageSourceId(pinIdx),
            resistorId: this.getMnaResistorId(pinIdx),
            targetVoltage_V: curr.electricalTargetVoltage_V,
            resistance_Ohms: curr.driverImpedance_Ohms,
          });
          this.emitDriverUpdate(pinIdx);
        }
      }
    }
  }

  /**
   * Recomputes the Thevenin equivalent voltage and series resistance for pin `i`
   * based on SIO, IO_BANK0 and PADS_BANK0 emulated registers.
   */
  public recomputeDriverState(gpioIndex: number): void {
    const pin = this.rp2040.gpio[gpioIndex];
    const state = this.driverStates[gpioIndex];
    if (!pin || !state) return;

    state.functionSelect = pin.functionSelect;
    state.functionName = getFunctionSelectName(pin.functionSelect);
    state.outputEnable = pin.outputEnable;
    state.outputDisable = pin.outputDisable;
    state.inputEnable = pin.inputEnable;
    state.pullupEnabled = pin.pullupEnabled;
    state.pulldownEnabled = pin.pulldownEnabled;
    state.schmittEnabled = pin.schmittEnabled;

    const driveInfo = RP2040GpioBridge.driveStrengthToImpedance(pin.driveStrength);
    state.driveStrength_mA = driveInfo.mA;

    let isOutputActive = false;
    let logicalOutputVal = false;

    if (pin.functionSelect === FUNCTION_SIO) {
      isOutputActive = pin.outputEnable && !pin.outputDisable;
      logicalOutputVal = pin.outputValue;
    } else if (pin.functionSelect === FUNCTION_UART) {
      const isUart0Tx = UART0_TX_PINS.includes(gpioIndex);
      const isUart1Tx = UART1_TX_PINS.includes(gpioIndex);
      const isUart0Rts = UART0_RTS_PINS.includes(gpioIndex);
      const isUart1Rts = UART1_RTS_PINS.includes(gpioIndex);
      if (isUart0Tx && this.uart0) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.uart0.getTxPinState();
      } else if (isUart1Tx && this.uart1) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.uart1.getTxPinState();
      } else if (isUart0Rts && this.uart0) {
        isOutputActive = !pin.outputDisable;
        // nUARTRTS is active low: asserted = 0V (LOW), de-asserted = 3.3V (HIGH)
        logicalOutputVal = !this.uart0.rtsLineState;
      } else if (isUart1Rts && this.uart1) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = !this.uart1.rtsLineState;
      }
    } else if (pin.functionSelect === FUNCTION_I2C) {
      const isI2c0Sda = I2C0_SDA_PINS.includes(gpioIndex);
      const isI2c0Scl = I2C0_SCL_PINS.includes(gpioIndex);
      const isI2c1Sda = I2C1_SDA_PINS.includes(gpioIndex);
      const isI2c1Scl = I2C1_SCL_PINS.includes(gpioIndex);

      let pinDriveLow = false;
      if (isI2c0Sda && this.i2c0) {
        pinDriveLow = this.i2c0.isSdaLineDrivenLow;
      } else if (isI2c0Scl && this.i2c0) {
        pinDriveLow = this.i2c0.isSclLineDrivenLow;
      } else if (isI2c1Sda && this.i2c1) {
        pinDriveLow = this.i2c1.isSdaLineDrivenLow;
      } else if (isI2c1Scl && this.i2c1) {
        pinDriveLow = this.i2c1.isSclLineDrivenLow;
      }

      if (pinDriveLow && !pin.outputDisable) {
        // Actively pulling line LOW to 0.0V (wired-AND FET conduct)
        isOutputActive = true;
        logicalOutputVal = false;
      } else {
        // Released HIGH (open-drain floating / external pull-up)
        isOutputActive = false;
        logicalOutputVal = true;
      }
    } else if (pin.functionSelect === FUNCTION_SPI) {
      const isSpi0Rx  = SPI0_RX_PINS.includes(gpioIndex);
      const isSpi0Csn = SPI0_CSN_PINS.includes(gpioIndex);
      const isSpi0Sck = SPI0_SCK_PINS.includes(gpioIndex);
      const isSpi0Tx  = SPI0_TX_PINS.includes(gpioIndex);

      const isSpi1Rx  = SPI1_RX_PINS.includes(gpioIndex);
      const isSpi1Csn = SPI1_CSN_PINS.includes(gpioIndex);
      const isSpi1Sck = SPI1_SCK_PINS.includes(gpioIndex);
      const isSpi1Tx  = SPI1_TX_PINS.includes(gpioIndex);

      if (isSpi0Rx || isSpi1Rx) {
        // MISO is high-impedance Schmitt input
        isOutputActive = false;
        logicalOutputVal = false;
      } else if (isSpi0Sck && this.spi0) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.spi0.sckLineState;
      } else if (isSpi0Tx && this.spi0) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.spi0.mosiLineState;
      } else if (isSpi0Csn && this.spi0) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.spi0.csnLineState;
      } else if (isSpi1Sck && this.spi1) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.spi1.sckLineState;
      } else if (isSpi1Tx && this.spi1) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.spi1.mosiLineState;
      } else if (isSpi1Csn && this.spi1) {
        isOutputActive = !pin.outputDisable;
        logicalOutputVal = this.spi1.csnLineState;
      }
    } else if (pin.functionSelect === FUNCTION_PWM) {
      const slice = (gpioIndex >> 1) & 0x7;
      const channel = (gpioIndex % 2 === 0) ? 'A' : 'B';
      if (this.pwm) {
        const isChannelBInput = (channel === 'B' && this.pwm.getSliceDivMode(slice) !== 0);
        if (isChannelBInput) {
          isOutputActive = false;
          logicalOutputVal = false;
          this.pwm.setPinBLevel(slice, pin.inputValue);
        } else {
          isOutputActive = !pin.outputDisable;
          logicalOutputVal = this.pwm.getChannelOutput(slice, channel);
        }
      } else {
        isOutputActive = false;
        logicalOutputVal = false;
      }
    }

    if (pin.functionSelect !== FUNCTION_PWM && (gpioIndex % 2 === 1) && this.pwm) {
      const slice = (gpioIndex >> 1) & 0x7;
      const otherGpio = (gpioIndex + 16) % 32;
      const otherPin = otherGpio < RP2040_NUM_GPIOS ? this.rp2040.gpio[otherGpio] : undefined;
      const otherActive = otherPin && otherPin.functionSelect === FUNCTION_PWM;
      if (!otherActive) {
        this.pwm.setPinBLevel(slice, false);
      }
    }

    if (isOutputActive) {
      state.logicalOutput = logicalOutputVal;
      state.electricalTargetVoltage_V = logicalOutputVal ? this.vddIo : 0.0;
      state.driverImpedance_Ohms = driveInfo.resistance;
    } else {
      // Input mode or non-SIO output disabled / open-drain released
      state.logicalOutput = (pin.functionSelect === FUNCTION_I2C) ? logicalOutputVal : false;

      if (pin.pullupEnabled && pin.pulldownEnabled) {
        // Physical silicon: both pull-up and pull-down connected simultaneously form a 1:1 voltage divider!
        // Thevenin equivalent: Vth = VDD / 2 = 1.65V, Rth = Rpull / 2
        state.electricalTargetVoltage_V = this.vddIo / 2;
        state.driverImpedance_Ohms = this.pullResistance_Ohms / 2;
      } else if (pin.pullupEnabled) {
        state.electricalTargetVoltage_V = this.vddIo;
        state.driverImpedance_Ohms = this.pullResistance_Ohms;
      } else if (pin.pulldownEnabled) {
        state.electricalTargetVoltage_V = 0.0;
        state.driverImpedance_Ohms = this.pullResistance_Ohms;
      } else {
        // High-Z input / released open-drain line
        state.electricalTargetVoltage_V = 0.0;
        state.driverImpedance_Ohms = RP2040_HIGH_Z_RESISTANCE_OHMS;
      }
    }
  }

  // ─── MNA Naming Helpers ────────────────────────────────────────────────────────────

  public getMnaPinSuffix(gpioIndex: number): string {
    const headerLabel = RP2040GpioBridge.PICO_PIN_MAP[gpioIndex];
    if (headerLabel && headerLabel.startsWith('A')) {
      return `a${headerLabel.slice(1)}`;
    }
    return `d${gpioIndex}`;
  }

  public getMnaVoltageSourceId(gpioIndex: number): string {
    const suffix = this.getMnaPinSuffix(gpioIndex);
    return `vs_mcu_${this.boardComponentId}_${suffix}_src`;
  }

  public getMnaResistorId(gpioIndex: number): string {
    const suffix = this.getMnaPinSuffix(gpioIndex);
    return `r_mcu_pin_${this.boardComponentId}_${suffix}`;
  }

  // ─── Event Callbacks ───────────────────────────────────────────────────────────────

  public onDriverChange(callback: (event: Rp2040DriverUpdateEvent) => void): () => void {
    this.onDriverChangeCallbacks.push(callback);
    return () => {
      const idx = this.onDriverChangeCallbacks.indexOf(callback);
      if (idx >= 0) this.onDriverChangeCallbacks.splice(idx, 1);
    };
  }

  private emitDriverUpdate(gpioIndex: number): void {
    const state = this.driverStates[gpioIndex];
    if (!state) return;

    const event: Rp2040DriverUpdateEvent = {
      gpioIndex,
      sourceId: this.getMnaVoltageSourceId(gpioIndex),
      resistorId: this.getMnaResistorId(gpioIndex),
      targetVoltage_V: state.electricalTargetVoltage_V,
      resistance_Ohms: state.driverImpedance_Ohms,
    };

    for (const cb of this.onDriverChangeCallbacks) {
      cb(event);
    }
  }

  // ─── MNA Result Feedback & Input Sensing ───────────────────────────────────────────

  /**
   * Applies the solved nodal voltages and branch currents from an MNA solve to each GPIO.
   * Updates pin input state (with Schmitt hysteresis), computes branch currents, and checks safety faults.
   */
  public updateFromMnaResult(
    nodeVoltages: number[] | Float64Array,
    gpioToNodeMap: Map<number, number>
  ): void {
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      const state = this.driverStates[i];
      const pin = this.rp2040.gpio[i];
      if (!state || !pin) continue;

      const mnaNode = gpioToNodeMap.get(i);
      const measuredV = (mnaNode !== undefined && mnaNode > 0 && mnaNode < nodeVoltages.length)
        ? (nodeVoltages[mnaNode] ?? 0)
        : 0;

      state.measuredVoltage_V = measuredV;

      // Current flowing OUT of the MCU pin into the circuit (positive = sourcing):
      // I = (Vtarget - Vmeasured) / Ron
      const current_A = (state.electricalTargetVoltage_V - measuredV) / state.driverImpedance_Ohms;
      state.measuredCurrent_A = current_A;
      state.powerDissipation_W = (current_A * current_A) * state.driverImpedance_Ohms;

      // ─── Digital Input Sensing ─────────────────────────────────────────────────────
      let logicalIn = false;
      state.faults.indeterminateVoltage = false;

      if (state.schmittEnabled) {
        if (measuredV >= this.schmittVtPos_V) {
          logicalIn = true;
        } else if (measuredV <= this.schmittVtNeg_V) {
          logicalIn = false;
        } else {
          // Hysteresis window: retain previous digital state
          logicalIn = state.logicalInput;
        }
      } else {
        // Without Schmitt trigger (comparator mode)
        if (measuredV >= RP2040_VIH_MIN) {
          logicalIn = true;
        } else if (measuredV <= RP2040_VIL_MAX) {
          logicalIn = false;
        } else {
          // Indeterminate region (0.8V < V < 2.0V)
          state.faults.indeterminateVoltage = true;
          logicalIn = measuredV >= (this.vddIo / 2); // Best-effort resolution with warning
        }
      }

      // If inputEnable is false in PADS_BANK0 (IE=0), input is masked to 0
      if (!pin.inputEnable) {
        logicalIn = false;
      }

      state.logicalInput = logicalIn;

      // Classify digital input state
      let isOutputActive = false;
      if (pin.functionSelect === FUNCTION_SIO) {
        isOutputActive = pin.outputEnable && !pin.outputDisable;
      } else if (pin.functionSelect === FUNCTION_UART) {
        const isUart0Out = UART0_TX_PINS.includes(i) || UART0_RTS_PINS.includes(i);
        const isUart1Out = UART1_TX_PINS.includes(i) || UART1_RTS_PINS.includes(i);
        isOutputActive = (isUart0Out || isUart1Out) && !pin.outputDisable;
      } else if (pin.functionSelect === FUNCTION_I2C) {
        const isI2c0Pin = I2C0_SDA_PINS.includes(i) || I2C0_SCL_PINS.includes(i);
        const isI2c1Pin = I2C1_SDA_PINS.includes(i) || I2C1_SCL_PINS.includes(i);
        if (isI2c0Pin && this.i2c0) {
          isOutputActive = I2C0_SDA_PINS.includes(i) ? this.i2c0.isSdaLineDrivenLow : this.i2c0.isSclLineDrivenLow;
        } else if (isI2c1Pin && this.i2c1) {
          isOutputActive = I2C1_SDA_PINS.includes(i) ? this.i2c1.isSdaLineDrivenLow : this.i2c1.isSclLineDrivenLow;
        }
      } else if (pin.functionSelect === FUNCTION_SPI) {
        const isSpi0Out = (SPI0_SCK_PINS.includes(i) || SPI0_TX_PINS.includes(i) || SPI0_CSN_PINS.includes(i)) && !!this.spi0;
        const isSpi1Out = (SPI1_SCK_PINS.includes(i) || SPI1_TX_PINS.includes(i) || SPI1_CSN_PINS.includes(i)) && !!this.spi1;
        isOutputActive = (isSpi0Out || isSpi1Out) && !pin.outputDisable;
      } else if (pin.functionSelect === FUNCTION_PWM) {
        const slice = (i >> 1) & 0x7;
        const channel = (i % 2 === 0) ? 'A' : 'B';
        const isChannelBInput = (channel === 'B' && !!this.pwm && this.pwm.getSliceDivMode(slice) !== 0);
        isOutputActive = !pin.outputDisable && (this.pwm !== null) && !isChannelBInput;
      }

      if (isOutputActive) {
        state.inputLogicLevel = state.logicalOutput ? 'DEFINED_HIGH' : 'DEFINED_LOW';
      } else if (measuredV <= RP2040_VIL_MAX) {
        state.inputLogicLevel = 'DEFINED_LOW';
      } else if (measuredV >= RP2040_VIH_MIN) {
        state.inputLogicLevel = 'DEFINED_HIGH';
      } else if (!state.schmittEnabled) {
        state.inputLogicLevel = 'UNDEFINED_REGION';
      } else if (!pin.pullupEnabled && !pin.pulldownEnabled && state.driverImpedance_Ohms >= 1e6) {
        state.inputLogicLevel = 'FLOATING';
      } else if (pin.pullupEnabled || pin.pulldownEnabled) {
        state.inputLogicLevel = 'WEAKLY_BIASED';
      } else {
        state.inputLogicLevel = 'UNDEFINED_REGION';
      }

      // Feed voltage back into RP2040 digital input path
      // Note: If inputEnable is false in PADS_BANK0, rp2040js internally masks it to 0
      pin.setInputValue(logicalIn);

      // If pin is configured for UART and is an RX or CTS pin, feed into the UART
      if (pin.functionSelect === FUNCTION_UART) {
        if (UART0_RX_PINS.includes(i) && this.uart0) {
          this.uart0.feedRxPinState(logicalIn, 0);
        } else if (UART1_RX_PINS.includes(i) && this.uart1) {
          this.uart1.feedRxPinState(logicalIn, 0);
        } else if (UART0_CTS_PINS.includes(i) && this.uart0) {
          // nUARTCTS is active-low: 0V (LOW) = asserted (true), 3.3V (HIGH) = de-asserted (false)
          this.uart0.setCts(!logicalIn);
        } else if (UART1_CTS_PINS.includes(i) && this.uart1) {
          this.uart1.setCts(!logicalIn);
        }
      } else if (pin.functionSelect === FUNCTION_I2C) {
        if (I2C0_SDA_PINS.includes(i) && this.i2c0) {
          this.i2c0.feedSdaPinState(logicalIn);
        } else if (I2C0_SCL_PINS.includes(i) && this.i2c0) {
          this.i2c0.feedSclPinState(logicalIn);
        } else if (I2C1_SDA_PINS.includes(i) && this.i2c1) {
          this.i2c1.feedSdaPinState(logicalIn);
        } else if (I2C1_SCL_PINS.includes(i) && this.i2c1) {
          this.i2c1.feedSclPinState(logicalIn);
        }
      } else if (pin.functionSelect === FUNCTION_SPI) {
        if (SPI0_RX_PINS.includes(i) && this.spi0) {
          this.spi0.feedMisoPinState(logicalIn);
        } else if (SPI1_RX_PINS.includes(i) && this.spi1) {
          this.spi1.feedMisoPinState(logicalIn);
        }
      } else if (pin.functionSelect === FUNCTION_PWM) {
        if ((i % 2 === 1) && this.pwm) {
          const slice = (i >> 1) & 0x7;
          this.pwm.setPinBLevel(slice, logicalIn);
        }
      }

      // ─── Safety & Fault Analysis ───────────────────────────────────────────────────
      const absCurrent = Math.abs(current_A);
      state.faults.overcurrent = absCurrent > this.perPinPolicyLimit_A;

      if (isOutputActive) {
        // Contention / Short checks
        if (state.logicalOutput && measuredV < RP2040_VIL_MAX && absCurrent >= this.perPinPolicyLimit_A) {
          state.faults.shortToGround = true;
        } else {
          state.faults.shortToGround = false;
        }

        if (!state.logicalOutput && measuredV > RP2040_VIH_MIN && absCurrent >= this.perPinPolicyLimit_A) {
          state.faults.shortToVdd = true;
        } else {
          state.faults.shortToVdd = false;
        }

        // Active driver driving against external voltage
        state.faults.contention = (state.faults.shortToGround || state.faults.shortToVdd) &&
          absCurrent > (this.perPinPolicyLimit_A * 0.75);
      } else {
        state.faults.shortToGround = false;
        state.faults.shortToVdd = false;
        state.faults.contention = false;

        // Floating input check: no pulls, high impedance, connected to no active source
        const hasPull = pin.pullupEnabled || pin.pulldownEnabled;
        const isFloatingVoltage = measuredV > 0.1 && measuredV < (this.vddIo - 0.1);
        state.faults.floating = !hasPull && isFloatingVoltage && state.driverImpedance_Ohms >= 1e6;
      }
    }

    // ─── Bank Level Current Accounting ───────────────────────────────────────────────
    let gpioSourcing = 0;
    let gpioSinking = 0;
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      const st = this.driverStates[i];
      if (!st) continue;
      if (st.measuredCurrent_A > 0) {
        gpioSourcing += st.measuredCurrent_A;
      } else if (st.measuredCurrent_A < 0) {
        gpioSinking += Math.abs(st.measuredCurrent_A);
      }
    }

    let qspiSourcing = 0;
    let qspiSinking = 0;
    for (let i = 0; i < this.qspiDriverStates.length; i++) {
      const qst = this.qspiDriverStates[i];
      if (!qst) continue;
      if (qst.measuredCurrent_A > 0) {
        qspiSourcing += qst.measuredCurrent_A;
      } else if (qst.measuredCurrent_A < 0) {
        qspiSinking += Math.abs(qst.measuredCurrent_A);
      }
    }

    this.gpioSourcingCurrent_A = gpioSourcing;
    this.gpioSinkingCurrent_A = gpioSinking;
    this.qspiSourcingCurrent_A = qspiSourcing;
    this.qspiSinkingCurrent_A = qspiSinking;

    const totalSourcing_A = gpioSourcing + qspiSourcing;
    const totalSinking_A = gpioSinking + qspiSinking;
    this.totalBankSourcingCurrent_A = totalSourcing_A;
    this.totalBankSinkingCurrent_A = totalSinking_A;

    const bankSourceOver = totalSourcing_A > this.bankCurrentLimit_A;
    const bankSinkOver = totalSinking_A > this.bankCurrentLimit_A;

    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      const st = this.driverStates[i];
      if (st) {
        st.faults.bankOvercurrentSourcing = bankSourceOver;
        st.faults.bankOvercurrentSinking = bankSinkOver;
        st.faults.perPinOvercurrentPolicy = Math.abs(st.measuredCurrent_A) > this.perPinPolicyLimit_A;
      }
    }
    for (let i = 0; i < this.qspiDriverStates.length; i++) {
      const qst = this.qspiDriverStates[i];
      if (qst) {
        qst.faults.bankOvercurrentSourcing = bankSourceOver;
        qst.faults.bankOvercurrentSinking = bankSinkOver;
        qst.faults.perPinOvercurrentPolicy = Math.abs(qst.measuredCurrent_A) > this.perPinPolicyLimit_A;
      }
    }
  }

  // ─── State Inspection & Snapshot ───────────────────────────────────────────────────

  public getDriverState(gpioIndex: number): Rp2040PinDriverState | null {
    return this.driverStates[gpioIndex] ? { ...this.driverStates[gpioIndex] } : null;
  }

  public getAllDriverStates(): Rp2040PinDriverState[] {
    return this.driverStates.map((s) => ({ ...s }));
  }

  public getVddIo(): number {
    return this.vddIo;
  }

  public setVddIo(volts: number): void {
    this.vddIo = Math.max(1.8, Math.min(3.6, volts));
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      this.recomputeDriverState(i);
      this.emitDriverUpdate(i);
    }
  }

  public getBoardComponentId(): string {
    return this.boardComponentId;
  }

  public setBoardComponentId(id: string): void {
    this.boardComponentId = id;
  }

  // ─── Transition Event Queue ────────────────────────────────────────────────────────

  public hasTransitionEvents(): boolean {
    return this.transitionEventQueue.length > 0;
  }

  public peekTransitionEvents(): Rp2040GpioTransitionEvent[] {
    return [...this.transitionEventQueue];
  }

  public drainTransitionEvents(): Rp2040GpioTransitionEvent[] {
    const events = this.transitionEventQueue;
    this.transitionEventQueue = [];
    return events;
  }

  public clearTransitionEvents(): void {
    this.transitionEventQueue = [];
  }

  public queueTransitionEvent(event: Rp2040GpioTransitionEvent): void {
    this.transitionEventQueue.push(event);
  }

  public setTimingProvider(provider: () => { cycle: number; simulatedTime_s: number }): void {
    this.timingProvider = provider;
  }

  // ─── Configuration & Calibration Helpers ───────────────────────────────────────────

  public setPullResistance(ohms: number): void {
    this.pullResistance_Ohms = Math.max(1000, Math.min(1e6, ohms));
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      this.recomputeDriverState(i);
      this.emitDriverUpdate(i);
    }
  }

  public getPullResistance(): number {
    return this.pullResistance_Ohms;
  }

  public setSchmittThresholds(vtPos: number, vtNeg: number): void {
    this.schmittVtPos_V = vtPos;
    this.schmittVtNeg_V = vtNeg;
  }

  public getSchmittThresholds(): { vtPos: number; vtNeg: number } {
    return { vtPos: this.schmittVtPos_V, vtNeg: this.schmittVtNeg_V };
  }

  public setPerPinPolicyLimit_A(amperes: number): void {
    this.perPinPolicyLimit_A = Math.max(0.001, amperes);
  }

  public getPerPinPolicyLimit_A(): number {
    return this.perPinPolicyLimit_A;
  }

  public setBankCurrentLimit_A(amperes: number): void {
    this.bankCurrentLimit_A = Math.max(0.010, amperes);
  }

  public getBankCurrentLimit_A(): number {
    return this.bankCurrentLimit_A;
  }

  public getTotalBankSourcingCurrent_A(): number {
    return this.totalBankSourcingCurrent_A;
  }

  public getTotalBankSinkingCurrent_A(): number {
    return this.totalBankSinkingCurrent_A;
  }

  public getGpioSourcingCurrent_A(): number {
    return this.gpioSourcingCurrent_A;
  }

  public getGpioSinkingCurrent_A(): number {
    return this.gpioSinkingCurrent_A;
  }

  public getQspiSourcingCurrent_A(): number {
    return this.qspiSourcingCurrent_A;
  }

  public getQspiSinkingCurrent_A(): number {
    return this.qspiSinkingCurrent_A;
  }

  public getAggregateDiagnostics(): Rp2040GpioDiagnostics {
    const overcurrentPins: number[] = [];
    for (let i = 0; i < RP2040_NUM_GPIOS; i++) {
      if (this.driverStates[i]?.faults.overcurrent) {
        overcurrentPins.push(i);
      }
    }
    return {
      bankCurrentLimit_A: this.bankCurrentLimit_A,
      perPinPolicyLimit_A: this.perPinPolicyLimit_A,
      totalSourcingCurrent_A: this.totalBankSourcingCurrent_A,
      totalSinkingCurrent_A: this.totalBankSinkingCurrent_A,
      gpioSourcingCurrent_A: this.gpioSourcingCurrent_A,
      gpioSinkingCurrent_A: this.gpioSinkingCurrent_A,
      qspiSourcingCurrent_A: this.qspiSourcingCurrent_A,
      qspiSinkingCurrent_A: this.qspiSinkingCurrent_A,
      isBankSourcingOvercurrent: this.totalBankSourcingCurrent_A > this.bankCurrentLimit_A,
      isBankSinkingOvercurrent: this.totalBankSinkingCurrent_A > this.bankCurrentLimit_A,
      overcurrentPins,
    };
  }

  public getQspiDriverStates(): Rp2040PinDriverState[] {
    return this.qspiDriverStates.map((s) => ({ ...s }));
  }

  public updateQspiCurrent(pinIndex: number, current_A: number): void {
    if (this.qspiDriverStates[pinIndex]) {
      this.qspiDriverStates[pinIndex].measuredCurrent_A = current_A;
      let qspiSourcing = 0;
      let qspiSinking = 0;
      for (const qst of this.qspiDriverStates) {
        if (qst.measuredCurrent_A > 0) qspiSourcing += qst.measuredCurrent_A;
        else if (qst.measuredCurrent_A < 0) qspiSinking += Math.abs(qst.measuredCurrent_A);
      }
      this.qspiSourcingCurrent_A = qspiSourcing;
      this.qspiSinkingCurrent_A = qspiSinking;
      this.totalBankSourcingCurrent_A = this.gpioSourcingCurrent_A + qspiSourcing;
      this.totalBankSinkingCurrent_A = this.gpioSinkingCurrent_A + qspiSinking;

      const bankSourceOver = this.totalBankSourcingCurrent_A > this.bankCurrentLimit_A;
      const bankSinkOver = this.totalBankSinkingCurrent_A > this.bankCurrentLimit_A;

      for (const st of this.driverStates) {
        if (st) {
          st.faults.bankOvercurrentSourcing = bankSourceOver;
          st.faults.bankOvercurrentSinking = bankSinkOver;
        }
      }
      for (const qst of this.qspiDriverStates) {
        if (qst) {
          qst.faults.bankOvercurrentSourcing = bankSourceOver;
          qst.faults.bankOvercurrentSinking = bankSinkOver;
        }
      }
    }
  }

  /**
   * Evaluates the datasheet-derived piecewise nonlinear I-V characteristic for an RP2040 pad driver.
   * Compares the linear Thevenin triode model against velocity/channel saturation.
   * 
   * @param vOut Voltage at pad pin (V)
   * @param driveStrength_mA Drive strength rating (2, 4, 8, 12 mA)
   * @param isHigh Whether output is driving logic HIGH (VDD rail) or LOW (GND rail)
   * @param vdd Supply voltage (default 3.3V)
   * @returns Current flowing OUT of the pin in Amperes (positive = sourcing, negative = sinking)
   */
  public static calculatePiecewiseCurrent(
    vOut: number,
    driveStrength_mA: number,
    isHigh: boolean,
    vdd = RP2040_DEFAULT_VDD_IO
  ): { theveninCurrent_A: number; saturatedCurrent_A: number; modelUsed: 'LINEAR_TRIODE' | 'SATURATION'; error_percent: number } {
    let ron = 50;
    let iSat = 0.038; // 38 mA typical saturation current for 4 mA setting
    switch (driveStrength_mA) {
      case 2: ron = 100; iSat = 0.025; break;
      case 4: ron = 50;  iSat = 0.038; break;
      case 8: ron = 25;  iSat = 0.052; break;
      case 12: ron = 17; iSat = 0.068; break;
      default: ron = 50; iSat = 0.038; break;
    }

    if (isHigh) {
      const deltaV = Math.max(0, vdd - vOut);
      const theveninI = deltaV / ron;
      const isSaturated = theveninI > iSat;
      const actualI = isSaturated ? iSat : theveninI;
      const err = theveninI !== 0 ? (Math.abs(theveninI - actualI) / theveninI) * 100 : 0;
      return {
        theveninCurrent_A: theveninI,
        saturatedCurrent_A: actualI,
        modelUsed: isSaturated ? 'SATURATION' : 'LINEAR_TRIODE',
        error_percent: err,
      };
    } else {
      const deltaV = Math.max(0, vOut);
      const theveninI = -(deltaV / ron);
      const isSaturated = Math.abs(theveninI) > iSat;
      const actualI = isSaturated ? -iSat : theveninI;
      const err = theveninI !== 0 ? (Math.abs(theveninI - actualI) / Math.abs(theveninI)) * 100 : 0;
      return {
        theveninCurrent_A: theveninI,
        saturatedCurrent_A: actualI,
        modelUsed: isSaturated ? 'SATURATION' : 'LINEAR_TRIODE',
        error_percent: err,
      };
    }
  }
}

