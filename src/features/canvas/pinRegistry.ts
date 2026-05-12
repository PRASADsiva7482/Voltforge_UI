// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Board Pin Registry
// Defines exact pin layouts for each board/component type with
// precise positions matching SVG geometry.
// ═══════════════════════════════════════════════════════════════════════════

import type { PinPosition } from '../../types';

type PinType = PinPosition['type'];

function pin(id: string, name: string, x: number, y: number, type: PinType = 'bidirectional'): PinPosition {
  return { id, name, x, y, type };
}

// ── Arduino Uno (200×150 SVG viewport) ──
const ARDUINO_UNO_PINS: PinPosition[] = [
  // Digital pins (top side)
  pin('d0', 'D0/RX', 168, 0, 'bidirectional'),
  pin('d1', 'D1/TX', 156, 0, 'bidirectional'),
  pin('d2', 'D2', 144, 0, 'bidirectional'),
  pin('d3', 'D3~', 132, 0, 'bidirectional'),
  pin('d4', 'D4', 120, 0, 'bidirectional'),
  pin('d5', 'D5~', 108, 0, 'bidirectional'),
  pin('d6', 'D6~', 96, 0, 'bidirectional'),
  pin('d7', 'D7', 84, 0, 'bidirectional'),
  pin('d8', 'D8', 72, 0, 'bidirectional'),
  pin('d9', 'D9~', 60, 0, 'bidirectional'),
  pin('d10', 'D10~', 48, 0, 'bidirectional'),
  pin('d11', 'D11~', 36, 0, 'bidirectional'),
  pin('d12', 'D12', 24, 0, 'bidirectional'),
  pin('d13', 'D13', 12, 0, 'bidirectional'),
  // Power pins (bottom-left)
  pin('5v', '5V', 24, 150, 'power'),
  pin('3v3', '3.3V', 36, 150, 'power'),
  pin('gnd1', 'GND', 48, 150, 'ground'),
  pin('gnd2', 'GND', 60, 150, 'ground'),
  pin('vin', 'VIN', 72, 150, 'power'),
  pin('rst', 'RESET', 12, 150, 'input'),
  // Analog pins (bottom-right)
  pin('a0', 'A0', 108, 150, 'bidirectional'),
  pin('a1', 'A1', 120, 150, 'bidirectional'),
  pin('a2', 'A2', 132, 150, 'bidirectional'),
  pin('a3', 'A3', 144, 150, 'bidirectional'),
  pin('a4', 'A4/SDA', 156, 150, 'bidirectional'),
  pin('a5', 'A5/SCL', 168, 150, 'bidirectional'),
  pin('aref', 'AREF', 180, 150, 'input'),
];

// ── Arduino Mega (340×170) ──
const ARDUINO_MEGA_PINS: PinPosition[] = (() => {
  const pins: PinPosition[] = [];
  // Digital 0-21 top (22 pins, 14px spacing across 340px width)
  for (let i = 0; i <= 21; i++) {
    pins.push(pin(`d${i}`, `D${i}`, 14 + i * 14, 0, 'bidirectional'));
  }
  // Digital 22-53 bottom (32 pins, 10px spacing)
  for (let i = 22; i <= 53; i++) {
    pins.push(pin(`d${i}`, `D${i}`, 10 + (i - 22) * 10, 170, 'bidirectional'));
  }
  // Analog 0-15 right (16 pins, 10px spacing)
  for (let i = 0; i <= 15; i++) {
    pins.push(pin(`a${i}`, `A${i}`, 340, 10 + i * 10, 'bidirectional'));
  }
  // Power (left side)
  pins.push(pin('5v', '5V', 0, 20, 'power'));
  pins.push(pin('3v3', '3.3V', 0, 40, 'power'));
  pins.push(pin('gnd1', 'GND', 0, 60, 'ground'));
  pins.push(pin('gnd2', 'GND', 0, 80, 'ground'));
  pins.push(pin('vin', 'VIN', 0, 100, 'power'));
  pins.push(pin('rst', 'RESET', 0, 120, 'input'));
  return pins;
})();

// ── ESP32 DevKit (100×160) ──
const ESP32_PINS: PinPosition[] = (() => {
  const pins: PinPosition[] = [];
  const leftPins = ['3V3', 'EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'GND', 'D13'];
  const rightPins = ['VIN', 'GND', 'D23', 'D22', 'TX', 'RX', 'D21', 'D19', 'D18', 'D5', 'D17', 'D16', 'D4', 'D2', 'D15'];
  leftPins.forEach((name, i) => {
    const type: PinType = name === 'GND' ? 'ground' : name.includes('V') || name === 'EN' ? 'power' : 'bidirectional';
    pins.push(pin(`l${i}`, name, 0, 10 + i * 10, type));
  });
  rightPins.forEach((name, i) => {
    const type: PinType = name === 'GND' ? 'ground' : name === 'VIN' ? 'power' : 'bidirectional';
    pins.push(pin(`r${i}`, name, 100, 10 + i * 10, type));
  });
  return pins;
})();

// ── Simple component pins ──
const RESISTOR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 0, 20, 'bidirectional'),
  pin('p2', 'Pin 2', 80, 20, 'bidirectional'),
];

const CAPACITOR_PINS: PinPosition[] = [
  pin('pos', '+', 0, 25, 'bidirectional'),
  pin('neg', '−', 60, 25, 'bidirectional'),
];

const LED_PINS: PinPosition[] = [
  pin('anode', 'Anode (+)', 15, 50, 'input'),
  pin('cathode', 'Cathode (−)', 35, 50, 'input'),
];

const LED_RGB_PINS: PinPosition[] = [
  pin('r', 'Red', 10, 60, 'input'),
  pin('gnd', 'GND', 22, 60, 'ground'),
  pin('g', 'Green', 34, 60, 'input'),
  pin('b', 'Blue', 46, 60, 'input'),
];

const BUTTON_PINS: PinPosition[] = [
  pin('p1a', '1A', 0, 10, 'bidirectional'),
  pin('p1b', '1B', 0, 30, 'bidirectional'),
  pin('p2a', '2A', 40, 10, 'bidirectional'),
  pin('p2b', '2B', 40, 30, 'bidirectional'),
];

const POTENTIOMETER_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 10, 50, 'bidirectional'),
  pin('wiper', 'Wiper', 25, 0, 'output'),
  pin('p2', 'Pin 2', 40, 50, 'bidirectional'),
];

const BUZZER_PINS: PinPosition[] = [
  pin('pos', '+', 15, 50, 'input'),
  pin('neg', '−', 35, 50, 'ground'),
];

const SERVO_PINS: PinPosition[] = [
  pin('sig', 'Signal', 0, 20, 'input'),
  pin('vcc', 'VCC', 0, 30, 'power'),
  pin('gnd', 'GND', 0, 40, 'ground'),
];

const MULTIMETER_PINS: PinPosition[] = [
  pin('v_probe', 'VCC', 24, 70, 'input'),
  pin('com', 'COM', 66, 70, 'ground'),
];

const DC_MOTOR_PINS: PinPosition[] = [
  pin('m1', 'M+', 0, 25, 'input'),
  pin('m2', 'M−', 0, 45, 'input'),
];

const RELAY_PINS: PinPosition[] = [
  pin('coil1', 'Coil+', 0, 15, 'input'),
  pin('coil2', 'Coil−', 0, 45, 'ground'),
  pin('com', 'COM', 60, 15, 'bidirectional'),
  pin('no', 'NO', 60, 30, 'bidirectional'),
  pin('nc', 'NC', 60, 45, 'bidirectional'),
];

const DHT_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 8, 50, 'power'),
  pin('data', 'DATA', 18, 50, 'output'),
  pin('nc', 'NC', 28, 50, 'bidirectional'),
  pin('gnd', 'GND', 38, 50, 'ground'),
];

const DHT11_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 12, 80, 'power'),
  pin('data', 'DATA', 24, 80, 'bidirectional'),
  pin('nc', 'NC', 36, 80, 'bidirectional'),
  pin('gnd', 'GND', 48, 80, 'ground'),
];

const ULTRASONIC_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 12, 60, 'power'),
  pin('trig', 'TRIG', 24, 60, 'input'),
  pin('echo', 'ECHO', 36, 60, 'output'),
  pin('gnd', 'GND', 48, 60, 'ground'),
];

const LCD_16X2_PINS: PinPosition[] = (() => {
  const names = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
  return names.map((name, i) => {
    const type: PinType = name === 'VSS' || name === 'K' ? 'ground' : name === 'VDD' || name === 'A' ? 'power' : 'bidirectional';
    return pin(`lcd${i}`, name, 10 + i * 10, 60, type);
  });
})();

const LCD_I2C_PINS: PinPosition[] = [
  pin('gnd', 'GND', 18, 60, 'ground'),
  pin('vcc', 'VCC', 36, 60, 'power'),
  pin('sda', 'SDA', 54, 60, 'bidirectional'),
  pin('scl', 'SCL', 72, 60, 'bidirectional'),
];

const OLED_PINS: PinPosition[] = [
  pin('gnd', 'GND', 12, 60, 'ground'),
  pin('vcc', 'VCC', 24, 60, 'power'),
  pin('scl', 'SCL', 36, 60, 'bidirectional'),
  pin('sda', 'SDA', 48, 60, 'bidirectional'),
];

const PIR_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 10, 50, 'power'),
  pin('out', 'OUT', 25, 50, 'output'),
  pin('gnd', 'GND', 40, 50, 'ground'),
];

const LDR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 0, 15, 'bidirectional'),
  pin('p2', 'Pin 2', 40, 15, 'bidirectional'),
];

const SOIL_MOISTURE_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 10, 50, 'power'),
  pin('gnd', 'GND', 20, 50, 'ground'),
  pin('sig', 'SIG', 30, 50, 'output'),
];

const IR_RECEIVER_PINS: PinPosition[] = [
  pin('out', 'OUT', 10, 40, 'output'),
  pin('gnd', 'GND', 20, 40, 'ground'),
  pin('vcc', 'VCC', 30, 40, 'power'),
];

const BT_MODULE_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 0, 10, 'power'),
  pin('gnd', 'GND', 0, 22, 'ground'),
  pin('tx', 'TX', 0, 34, 'output'),
  pin('rx', 'RX', 0, 46, 'input'),
  pin('en', 'EN', 60, 20, 'input'),
  pin('state', 'STATE', 60, 35, 'output'),
];

const WIFI_MODULE_PINS: PinPosition[] = [
  pin('vcc', '3V3', 0, 10, 'power'),
  pin('gnd', 'GND', 0, 20, 'ground'),
  pin('tx', 'TX', 0, 30, 'output'),
  pin('rx', 'RX', 0, 40, 'input'),
  pin('rst', 'RST', 60, 15, 'input'),
  pin('ch_pd', 'CH_PD', 60, 30, 'input'),
];

const STEPPER_MOTOR_PINS: PinPosition[] = [
  pin('a1', 'A+', 0, 15, 'input'),
  pin('a2', 'A−', 0, 30, 'input'),
  pin('b1', 'B+', 0, 45, 'input'),
  pin('b2', 'B−', 0, 60, 'input'),
];

const IC_555_PINS: PinPosition[] = [
  pin('gnd', 'GND', 8, 50, 'ground'),
  pin('trig', 'TRIG', 20, 50, 'input'),
  pin('out', 'OUT', 32, 50, 'output'),
  pin('reset', 'RESET', 44, 50, 'input'),
  pin('ctrl', 'CTRL', 56, 0, 'input'),
  pin('thresh', 'THRESH', 44, 0, 'input'),
  pin('disch', 'DISCH', 32, 0, 'output'),
  pin('vcc', 'VCC', 20, 0, 'power'),
];

const IC_74HC595_PINS: PinPosition[] = [
  pin('qb', 'QB', 8, 50, 'output'),
  pin('qc', 'QC', 20, 50, 'output'),
  pin('qd', 'QD', 32, 50, 'output'),
  pin('qe', 'QE', 44, 50, 'output'),
  pin('qf', 'QF', 56, 50, 'output'),
  pin('qg', 'QG', 68, 50, 'output'),
  pin('qh', 'QH', 80, 50, 'output'),
  pin('gnd', 'GND', 92, 50, 'ground'),
  pin('qhp', 'QH_OUT', 92, 0, 'output'),
  pin('srclr', 'SRCLR', 80, 0, 'input'),
  pin('srclk', 'SRCLK', 68, 0, 'input'),
  pin('rclk', 'RCLK', 56, 0, 'input'),
  pin('oe', 'OE', 44, 0, 'input'),
  pin('ser', 'SER', 32, 0, 'input'),
  pin('qa', 'QA', 20, 0, 'output'),
  pin('vcc', 'VCC', 8, 0, 'power'),
];

// ── Registry ──
export const boardPinRegistry: Record<string, PinPosition[]> = {
  ARDUINO_UNO: ARDUINO_UNO_PINS,
  ARDUINO_MEGA: ARDUINO_MEGA_PINS,
  ARDUINO_NANO: ARDUINO_UNO_PINS, // Nano shares Uno pin layout with different form factor
  ESP32: ESP32_PINS,
  ESP32_S3: ESP32_PINS,
  ESP8266: ESP32_PINS.slice(0, 20), // Subset of ESP32 pins

  // Passives
  RESISTOR: RESISTOR_PINS,
  CAPACITOR: CAPACITOR_PINS,
  MULTIMETER: MULTIMETER_PINS,
  IC_555_TIMER: IC_555_PINS,
  IC_74HC595: IC_74HC595_PINS,

  // LEDs
  LED_STANDARD: LED_PINS,
  LED_RGB: LED_RGB_PINS,

  // Input
  PUSH_BUTTON: BUTTON_PINS,
  POTENTIOMETER: POTENTIOMETER_PINS,

  // Output
  BUZZER: BUZZER_PINS,
  SERVO_MOTOR: SERVO_PINS,
  MOTOR_SERVO: SERVO_PINS,
  MOTOR_DC: DC_MOTOR_PINS,
  STEPPER_MOTOR: STEPPER_MOTOR_PINS,
  RELAY_SPDT: RELAY_PINS,

  // Sensors
  TEMP_SENSOR: DHT_PINS,
  SENSOR_DHT11: DHT11_PINS,
  SENSOR_DHT22: DHT_PINS,
  ULTRASONIC_SENSOR: ULTRASONIC_PINS,
  SENSOR_ULTRASONIC: ULTRASONIC_PINS,
  PIR_SENSOR: PIR_PINS,
  SENSOR_PIR: PIR_PINS,
  LDR: LDR_PINS,
  SOIL_MOISTURE: SOIL_MOISTURE_PINS,
  IR_RECEIVER: IR_RECEIVER_PINS,

  // Displays
  LCD_16X2: LCD_16X2_PINS,
  DISPLAY_LCD_I2C: LCD_I2C_PINS,
  OLED_DISPLAY: OLED_PINS,

  // Communication
  BLUETOOTH_MODULE: BT_MODULE_PINS,
  WIFI_MODULE: WIFI_MODULE_PINS,
};

/**
 * Get pins for a component type. If a type-specific layout exists, use it.
 * Otherwise, generate simple pin positions from pinConfig keys.
 */
export function getPinsForComponent(type: string, pinConfig?: Record<string, unknown>, width = 100, height = 60): PinPosition[] {
  // Use registry if available
  if (boardPinRegistry[type]) {
    return boardPinRegistry[type].map((p, i) => ({
      ...p,
      id: `${type.toLowerCase()}_pin_${i}`,
    }));
  }

  // Fallback: generate from pinConfig
  if (!pinConfig) return [];
  const keys = Object.keys(pinConfig);
  return keys.map((name, idx) => ({
    id: `gen_pin_${idx}`,
    name,
    x: (width / (keys.length + 1)) * (idx + 1),
    y: height,
    type: 'bidirectional' as PinType,
  }));
}

export { analyzeCircuitSafety, buildCircuitNetlist } from './netlist';
