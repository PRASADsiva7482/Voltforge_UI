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

// ── Arduino Mega (280×120 SVG viewBox) ──
const ARDUINO_MEGA_PINS: PinPosition[] = (() => {
  const pins: PinPosition[] = [];
  // Digital 0-13 top (14 pins, 18px spacing)
  for (let i = 0; i <= 13; i++) {
    pins.push(pin(`d${i}`, `D${i}`, 14 + i * 18, 0, 'bidirectional'));
  }
  // Digital 22-53 bottom (32 pins, 8px spacing)
  for (let i = 22; i <= 53; i++) {
    pins.push(pin(`d${i}`, `D${i}`, 8 + (i - 22) * 8, 120, 'bidirectional'));
  }
  // Analog 0-15 right (16 pins, 7px spacing)
  for (let i = 0; i <= 15; i++) {
    pins.push(pin(`a${i}`, `A${i}`, 280, 6 + i * 7, 'bidirectional'));
  }
  // Power (left side)
  pins.push(pin('5v', '5V', 0, 15, 'power'));
  pins.push(pin('3v3', '3.3V', 0, 30, 'power'));
  pins.push(pin('gnd1', 'GND', 0, 45, 'ground'));
  pins.push(pin('gnd2', 'GND', 0, 60, 'ground'));
  pins.push(pin('vin', 'VIN', 0, 75, 'power'));
  pins.push(pin('rst', 'RESET', 0, 90, 'input'));
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
// RESISTOR: SVG viewBox 90×24
const RESISTOR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 0, 12, 'bidirectional'),
  pin('p2', 'Pin 2', 90, 12, 'bidirectional'),
];

// CAPACITOR: SVG viewBox 40×50
const CAPACITOR_PINS: PinPosition[] = [
  pin('pos', '+', 20, 0, 'bidirectional'),
  pin('neg', '−', 20, 50, 'bidirectional'),
];

// LED_STANDARD: SVG viewBox 40×80, leads end at y≈74-80
const LED_PINS: PinPosition[] = [
  pin('anode', 'Anode (+)', 16, 80, 'input'),
  pin('cathode', 'Cathode (−)', 25, 80, 'input'),
];

// LED_RGB: SVG viewBox 50×80, leads end at y≈74-78
const LED_RGB_PINS: PinPosition[] = [
  pin('r', 'Red', 14, 80, 'input'),
  pin('gnd', 'GND', 21, 80, 'ground'),
  pin('g', 'Green', 28, 80, 'input'),
  pin('b', 'Blue', 35, 80, 'input'),
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

// SERVO_MOTOR: SVG viewBox 70×50, wire leads exit bottom at y≈41-49
const SERVO_PINS: PinPosition[] = [
  pin('sig', 'Signal', 11, 50, 'input'),
  pin('vcc', 'VCC', 21, 50, 'power'),
  pin('gnd', 'GND', 31, 50, 'ground'),
];

const MULTIMETER_PINS: PinPosition[] = [
  pin('v_probe', 'VCC', 24, 70, 'input'),
  pin('com', 'COM', 66, 70, 'ground'),
];

// MOTOR_DC: SVG viewBox 70×50, terminals on left side
const DC_MOTOR_PINS: PinPosition[] = [
  pin('m1', 'M+', 5, 20, 'input'),
  pin('m2', 'M−', 5, 30, 'input'),
];

// RELAY: SVG viewBox 70×50
const RELAY_PINS: PinPosition[] = [
  pin('coil1', 'Coil+', 0, 15, 'input'),
  pin('coil2', 'Coil−', 0, 35, 'ground'),
  pin('com', 'COM', 70, 10, 'bidirectional'),
  pin('no', 'NO', 70, 25, 'bidirectional'),
  pin('nc', 'NC', 70, 40, 'bidirectional'),
];

// DHT22/TEMP_SENSOR: SVG viewBox 60×80, pads at y≈76-80
const DHT_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 16, 80, 'power'),
  pin('data', 'DATA', 26, 80, 'output'),
  pin('nc', 'NC', 36, 80, 'bidirectional'),
  pin('gnd', 'GND', 46, 80, 'ground'),
];

const DHT11_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 12, 80, 'power'),
  pin('data', 'DATA', 24, 80, 'bidirectional'),
  pin('nc', 'NC', 36, 80, 'bidirectional'),
  pin('gnd', 'GND', 48, 80, 'ground'),
];

// ULTRASONIC: SVG viewBox 80×60 (was 80×50 mapped to 60×60), pads at bottom
const ULTRASONIC_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 9, 60, 'power'),
  pin('trig', 'TRIG', 21, 60, 'input'),
  pin('echo', 'ECHO', 59, 60, 'output'),
  pin('gnd', 'GND', 71, 60, 'ground'),
];

const LCD_16X2_PINS: PinPosition[] = (() => {
  const names = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
  return names.map((name, i) => {
    const type: PinType = name === 'VSS' || name === 'K' ? 'ground' : name === 'VDD' || name === 'A' ? 'power' : 'bidirectional';
    return pin(`lcd${i}`, name, 10 + i * 10, 60, type);
  });
})();

// LCD_I2C: SVG viewBox 120×60, 4 pads at bottom
const LCD_I2C_PINS: PinPosition[] = [
  pin('gnd', 'GND', 14, 60, 'ground'),
  pin('vcc', 'VCC', 28, 60, 'power'),
  pin('sda', 'SDA', 42, 60, 'bidirectional'),
  pin('scl', 'SCL', 56, 60, 'bidirectional'),
];

// OLED: SVG viewBox 80×60, 4 pads at bottom
const OLED_PINS: PinPosition[] = [
  pin('gnd', 'GND', 19, 60, 'ground'),
  pin('vcc', 'VCC', 33, 60, 'power'),
  pin('scl', 'SCL', 47, 60, 'bidirectional'),
  pin('sda', 'SDA', 61, 60, 'bidirectional'),
];

// PIR: SVG viewBox 60×70, pads at y≈64-70
const PIR_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 17, 70, 'power'),
  pin('out', 'OUT', 30, 70, 'output'),
  pin('gnd', 'GND', 43, 70, 'ground'),
];

// LDR: SVG viewBox 40×40, leads at bottom
const LDR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 10, 40, 'bidirectional'),
  pin('p2', 'Pin 2', 30, 40, 'bidirectional'),
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

// STEPPER_MOTOR: SVG viewBox 70×70, wires exit bottom
const STEPPER_MOTOR_PINS: PinPosition[] = [
  pin('a1', 'A+', 15, 70, 'input'),
  pin('a2', 'A−', 27, 70, 'input'),
  pin('b1', 'B+', 43, 70, 'input'),
  pin('b2', 'B−', 55, 70, 'input'),
];

// IC_555: SVG viewBox 90×50, leads: left at x=8 (y=12,20,28,36), right at x=82 (y=12,20,28,36)
const IC_555_PINS: PinPosition[] = [
  pin('gnd', 'GND', 8, 36, 'ground'),
  pin('trig', 'TRIG', 8, 28, 'input'),
  pin('out', 'OUT', 8, 20, 'output'),
  pin('reset', 'RESET', 8, 12, 'input'),
  pin('ctrl', 'CTRL', 82, 12, 'input'),
  pin('thresh', 'THRESH', 82, 20, 'input'),
  pin('disch', 'DISCH', 82, 28, 'output'),
  pin('vcc', 'VCC', 82, 36, 'power'),
];

// IC_74HC595: SVG viewBox 120×50, leads: left at x=7 (y=11,17,23,29,35), right at x=113
const IC_74HC595_PINS: PinPosition[] = [
  pin('qb', 'QB', 7, 11, 'output'),
  pin('qc', 'QC', 7, 17, 'output'),
  pin('qd', 'QD', 7, 23, 'output'),
  pin('qe', 'QE', 7, 29, 'output'),
  pin('qf', 'QF', 7, 35, 'output'),
  pin('gnd', 'GND', 7, 41, 'ground'),
  pin('qhp', 'QH_OUT', 113, 11, 'output'),
  pin('srclr', 'SRCLR', 113, 17, 'input'),
  pin('srclk', 'SRCLK', 113, 23, 'input'),
  pin('rclk', 'RCLK', 113, 29, 'input'),
  pin('oe', 'OE', 113, 35, 'input'),
  pin('ser', 'SER', 113, 41, 'input'),
  pin('qa', 'QA', 113, 47, 'output'),
  pin('vcc', 'VCC', 7, 47, 'power'),
];

// ── Additional missing component pins ──

// LED_NEOPIXEL: SVG viewBox 60×20
const NEOPIXEL_PINS: PinPosition[] = [
  pin('din', 'DIN', 0, 10, 'input'),
  pin('vcc', 'VCC', 30, 20, 'power'),
  pin('gnd', 'GND', 30, 0, 'ground'),
  pin('dout', 'DOUT', 60, 10, 'output'),
];

// DISPLAY_7SEG: SVG viewBox 50×70
const SEG7_PINS: PinPosition[] = [
  pin('a', 'A', 5, 70, 'input'),
  pin('b', 'B', 12, 70, 'input'),
  pin('c', 'C', 19, 70, 'input'),
  pin('d', 'D', 26, 70, 'input'),
  pin('e', 'E', 33, 70, 'input'),
  pin('f', 'F', 40, 70, 'input'),
  pin('g', 'G', 47, 70, 'input'),
  pin('com', 'COM', 25, 0, 'ground'),
];

// SENSOR_IMU: SVG viewBox 60×60
const IMU_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 10, 60, 'power'),
  pin('gnd', 'GND', 22, 60, 'ground'),
  pin('scl', 'SCL', 38, 60, 'bidirectional'),
  pin('sda', 'SDA', 50, 60, 'bidirectional'),
];

// BREADBOARD: SVG viewBox 200×80 — power rails + rows
const BREADBOARD_PINS: PinPosition[] = [
  pin('vcc_top', '+', 10, 8, 'power'),
  pin('gnd_top', '−', 10, 18, 'ground'),
  pin('vcc_bot', '+', 10, 62, 'power'),
  pin('gnd_bot', '−', 10, 72, 'ground'),
];

// MOTOR_STEPPER: SVG viewBox 70×70
const STEPPER_V2_PINS: PinPosition[] = [
  pin('a1', 'A+', 15, 70, 'input'),
  pin('a2', 'A−', 27, 70, 'input'),
  pin('b1', 'B+', 39, 70, 'input'),
  pin('b2', 'B−', 51, 70, 'input'),
];

// RELAY_SINGLE: SVG viewBox 70×50
const RELAY_SINGLE_PINS: PinPosition[] = [
  pin('coil1', 'Coil+', 0, 15, 'input'),
  pin('coil2', 'Coil−', 0, 35, 'ground'),
  pin('com', 'COM', 70, 15, 'bidirectional'),
  pin('no', 'NO', 70, 35, 'bidirectional'),
];

// ESC_MODULE: SVG viewBox 120×60, input left (Signal/VCC/GND), output right (Phase A/B/C)
const ESC_PINS: PinPosition[] = [
  pin('sig', 'Signal', 0, 15, 'input'),
  pin('vcc', 'VCC', 0, 30, 'power'),
  pin('gnd', 'GND', 0, 45, 'ground'),
  pin('phase_a', 'Phase A', 120, 15, 'output'),
  pin('phase_b', 'Phase B', 120, 30, 'output'),
  pin('phase_c', 'Phase C', 120, 45, 'output'),
];

// MOTOR_BLDC: SVG viewBox 80×80, 3 phase input pins at bottom
const MOTOR_BLDC_PINS: PinPosition[] = [
  pin('phase_a', 'Phase A', 15, 80, 'input'),
  pin('phase_b', 'Phase B', 40, 80, 'input'),
  pin('phase_c', 'Phase C', 65, 80, 'input'),
];

// RC_RECEIVER: SVG viewBox 80×60, 3 output pins
const RC_RECEIVER_PINS: PinPosition[] = [
  pin('gnd', 'GND', 20, 60, 'ground'),
  pin('vcc', 'VCC', 40, 60, 'power'),
  pin('ppm', 'PPM Signal', 60, 60, 'output'),
];

// ── Registry ──
export const boardPinRegistry: Record<string, PinPosition[]> = {
  ARDUINO_UNO: ARDUINO_UNO_PINS,
  ARDUINO_MEGA: ARDUINO_MEGA_PINS,
  ARDUINO_NANO: ARDUINO_UNO_PINS,
  ESP32: ESP32_PINS,
  ESP32_S3: ESP32_PINS,
  ESP8266: ESP32_PINS.slice(0, 20),

  // Passives
  RESISTOR: RESISTOR_PINS,
  CAPACITOR: CAPACITOR_PINS,
  MULTIMETER: MULTIMETER_PINS,
  IC_555_TIMER: IC_555_PINS,
  IC_74HC595: IC_74HC595_PINS,

  // LEDs
  LED_STANDARD: LED_PINS,
  LED_RGB: LED_RGB_PINS,
  LED_NEOPIXEL: NEOPIXEL_PINS,

  // Input
  PUSH_BUTTON: BUTTON_PINS,
  BUTTON: BUTTON_PINS,
  POTENTIOMETER: POTENTIOMETER_PINS,

  // Output
  BUZZER: BUZZER_PINS,
  SERVO_MOTOR: SERVO_PINS,
  MOTOR_SERVO: SERVO_PINS,
  MOTOR_DC: DC_MOTOR_PINS,
  STEPPER_MOTOR: STEPPER_MOTOR_PINS,
  MOTOR_STEPPER: STEPPER_V2_PINS,
  RELAY_SPDT: RELAY_PINS,
  RELAY_SINGLE: RELAY_SINGLE_PINS,

  // Sensors
  TEMP_SENSOR: DHT_PINS,
  SENSOR_DHT11: DHT11_PINS,
  SENSOR_DHT22: DHT_PINS,
  ULTRASONIC_SENSOR: ULTRASONIC_PINS,
  SENSOR_ULTRASONIC: ULTRASONIC_PINS,
  PIR_SENSOR: PIR_PINS,
  SENSOR_PIR: PIR_PINS,
  LDR: LDR_PINS,
  SENSOR_LDR: LDR_PINS,
  SOIL_MOISTURE: SOIL_MOISTURE_PINS,
  IR_RECEIVER: IR_RECEIVER_PINS,
  SENSOR_IMU: IMU_PINS,

  // Displays
  LCD_16X2: LCD_16X2_PINS,
  DISPLAY_LCD_I2C: LCD_I2C_PINS,
  OLED_DISPLAY: OLED_PINS,
  DISPLAY_OLED: OLED_PINS,
  DISPLAY_7SEG: SEG7_PINS,

  // Communication
  BLUETOOTH_MODULE: BT_MODULE_PINS,
  WIFI_MODULE: WIFI_MODULE_PINS,

  // Drone / ESC
  ESC_MODULE: ESC_PINS,
  MOTOR_BLDC: MOTOR_BLDC_PINS,
  RC_RECEIVER: RC_RECEIVER_PINS,

  // Other
  BREADBOARD: BREADBOARD_PINS,
};

/**
 * Get pins for a component type. If a type-specific layout exists, use it.
 * Otherwise, generate simple pin positions from pinConfig keys.
 */
export function getPinsForComponent(type: string, pinConfig?: Record<string, unknown>, width = 100, height = 60): PinPosition[] {
  // Use registry if available — preserve original pin IDs so wires can reference them
  if (boardPinRegistry[type]) {
    return boardPinRegistry[type].map((p) => ({ ...p }));
  }

  const configuredPins = pinConfig?.pins;
  if (Array.isArray(configuredPins)) {
    return configuredPins.map((raw, idx) => {
      const item = raw as Partial<PinPosition>;
      return {
        id: item.id || `custom_pin_${idx}`,
        name: item.name || `Pin ${idx + 1}`,
        x: Number(item.x ?? (width / (configuredPins.length + 1)) * (idx + 1)),
        y: Number(item.y ?? height),
        type: (item.type || 'bidirectional') as PinType,
        electrical: item.electrical,
      };
    });
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
