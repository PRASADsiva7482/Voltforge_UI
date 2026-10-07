// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Board Pin Registry
// Defines exact pin layouts for each board/component type with
// precise positions matching SVG geometry.
// ═══════════════════════════════════════════════════════════════════════════

import type { PinPosition } from '../../types/domain';
import { BOARD_CATALOG, createBoardPins } from './boardCatalog';

type PinType = PinPosition['type'];

function pin(id: string, name: string, x: number, y: number, type: PinType = 'bidirectional'): PinPosition {
  return { id, name, x, y, type };
}

// Arduino Nano (100x160 SVG viewport)
const ARDUINO_NANO_PINS: PinPosition[] = (() => {
  const pins: PinPosition[] = [];
  for (let i = 0; i <= 13; i++) {
    pins.push(pin(`d${i}`, `D${i}`, 0, 28 + i * 8.5, 'bidirectional'));
  }
  pins.push(pin('gnd1', 'GND', 0, 151, 'ground'));

  const rightPins: Array<[string, string, PinType]> = [
    ['vin', 'VIN', 'power'], ['5v', '5V', 'power'], ['3v3', '3.3V', 'power'],
    ['rst', 'RESET', 'input'], ['gnd2', 'GND', 'ground'], ['aref', 'AREF', 'input'],
    ['a0', 'A0', 'bidirectional'], ['a1', 'A1', 'bidirectional'],
    ['a2', 'A2', 'bidirectional'], ['a3', 'A3', 'bidirectional'],
    ['a4', 'A4/SDA', 'bidirectional'], ['a5', 'A5/SCL', 'bidirectional'],
    ['a6', 'A6', 'input'], ['a7', 'A7', 'input'],
  ];
  rightPins.forEach(([id, name, type], i) => pins.push(pin(id, name, 100, 28 + i * 9.4, type)));
  return pins;
})();

// ── ESP32 DevKit (100×160) ──
const ESP32_PINS: PinPosition[] = (() => {
  const pins: PinPosition[] = [];
  const leftPins = ['3V3', 'EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'GND', 'D13'];
  const rightPins = ['VIN', 'GND', 'D23', 'D22', 'TX', 'RX', 'D21', 'D19', 'D18', 'D5', 'D17', 'D16', 'D4', 'D2', 'D15'];
  leftPins.forEach((name, i) => {
    const type: PinType = name === 'GND' ? 'ground'
      : name === '3V3' ? 'power'
        : name === 'EN' || name === 'VP' || name === 'VN' ? 'input'
          : 'bidirectional';
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

const INDUCTOR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 0, 12, 'bidirectional'),
  pin('p2', 'Pin 2', 90, 12, 'bidirectional'),
];

// TRANSFORMER: isolated primary and secondary winding terminals
const TRANSFORMER_PINS: PinPosition[] = [
  pin('primary1', 'P1', 0, 18, 'bidirectional'),
  pin('primary2', 'P2', 0, 52, 'bidirectional'),
  pin('secondary1', 'S1', 100, 18, 'bidirectional'),
  pin('secondary2', 'S2', 100, 52, 'bidirectional'),
];

// CAPACITOR: SVG viewBox 44×60 (ceramic disc package with bottom leads)
const CAPACITOR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 16, 60, 'bidirectional'),
  pin('p2', 'Pin 2', 28, 60, 'bidirectional'),
];

// VARIABLE_CAPACITOR: SVG viewBox 44×60 (trimmer capacitor with top/bottom leads)
const VARIABLE_CAPACITOR_PINS: PinPosition[] = [
  pin('pos', '+', 20, 0, 'bidirectional'),
  pin('neg', '−', 20, 60, 'bidirectional'),
];

// LED_STANDARD: SVG viewBox 40×80, leads end at y≈74-80
const CERAMIC_CAPACITOR_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 16, 60, 'bidirectional'),
  pin('p2', 'Pin 2', 28, 60, 'bidirectional'),
];

const ELECTROLYTIC_CAPACITOR_PINS: PinPosition[] = [
  pin('pos', '+', 16, 70, 'power'),
  pin('neg', '-', 30, 70, 'bidirectional'),
];

const DIODE_PINS: PinPosition[] = [
  pin('anode', 'A', 0, 14, 'input'),
  pin('cathode', 'K', 72, 14, 'output'),
];

const NPN_TRANSISTOR_PINS: PinPosition[] = [
  pin('collector', 'C', 14, 70, 'output'),
  pin('base', 'B', 28, 70, 'input'),
  pin('emitter', 'E', 42, 70, 'bidirectional'),
];

const PNP_TRANSISTOR_PINS: PinPosition[] = [
  pin('emitter', 'E', 14, 70, 'power'),
  pin('base', 'B', 28, 70, 'input'),
  pin('collector', 'C', 42, 70, 'output'),
];

const VOLTAGE_REGULATOR_PINS: PinPosition[] = [
  pin('vin', 'VIN', 16, 72, 'power'),
  pin('gnd', 'GND', 32, 72, 'ground'),
  pin('vout', '5V', 48, 72, 'power'),
];

const LED_PINS: PinPosition[] = [
  pin('anode', 'Anode (+)', 16, 80, 'input'),
  pin('cathode', 'Cathode (−)', 24, 80, 'input'),
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
  pin('com', 'COM', 66, 70, 'bidirectional'),
];

// MOTOR_DC: SVG viewBox 70×50, terminals on left side
const DC_MOTOR_PINS: PinPosition[] = [
  pin('m1', 'M+', 4, 14, 'input'),
  pin('m2', 'M−', 4, 36, 'input'),
];

// RELAY: SVG viewBox 70×50
const RELAY_PINS: PinPosition[] = [
  pin('coil1', 'Coil+', 0, 15, 'input'),
  pin('coil2', 'Coil-', 0, 35, 'bidirectional'),
  pin('com', 'COM', 70, 10, 'bidirectional'),
  pin('no', 'NO', 70, 25, 'bidirectional'),
  pin('nc', 'NC', 70, 40, 'bidirectional'),
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

// STEPPER_MOTOR: SVG viewBox 70×70, wires exit bottom
const STEPPER_MOTOR_PINS: PinPosition[] = [
  pin('a1', 'A+', 15, 70, 'input'),
  pin('a2', 'A−', 27, 70, 'input'),
  pin('b1', 'B+', 43, 70, 'input'),
  pin('b2', 'B−', 55, 70, 'input'),
];

const MOSFET_PINS: PinPosition[] = [
  pin('gate', 'G', 0, 35, 'input'),
  pin('drain', 'D', 28, 0, 'bidirectional'),
  pin('source', 'S', 28, 70, 'bidirectional'),
];

const OPAMP_PINS: PinPosition[] = [
  pin('in_plus', '+', 0, 20, 'input'),
  pin('in_minus', '−', 0, 50, 'input'),
  pin('out', 'OUT', 70, 35, 'output'),
  pin('vcc', 'VCC', 35, 0, 'power'),
  pin('gnd', 'GND', 35, 70, 'ground'),
];

const BRIDGE_RECTIFIER_PINS: PinPosition[] = [
  pin('ac1', '~', 0, 15, 'bidirectional'),
  pin('ac2', '~', 0, 45, 'bidirectional'),
  pin('positive', '+', 70, 15, 'power'),
  pin('negative', '−', 70, 45, 'ground'),
];

// IC_555: SVG viewBox 90×50 (DIP-8)
// Pins 1-4 along bottom (y=50), pins 5-8 along top (y=0)
const IC_555_PINS: PinPosition[] = [
  pin('gnd', 'GND', 23, 50, 'ground'),
  pin('trig', 'TRIG', 35, 50, 'input'),
  pin('out', 'OUT', 47, 50, 'output'),
  pin('reset', 'RESET', 59, 50, 'input'),
  pin('ctrl', 'CTRL', 59, 0, 'input'),
  pin('thresh', 'THRESH', 47, 0, 'input'),
  pin('disch', 'DISCH', 35, 0, 'output'),
  pin('vcc', 'VCC', 23, 0, 'power'),
];

// IC_74HC595: SVG viewBox 120×50 (DIP-16)
// Pins 1-8 along bottom (y=50), pins 9-16 along top (y=0)
const IC_74HC595_PINS: PinPosition[] = [
  pin('qb', 'QB', 16, 50, 'output'),
  pin('qc', 'QC', 28.5, 50, 'output'),
  pin('qd', 'QD', 41, 50, 'output'),
  pin('qe', 'QE', 53.5, 50, 'output'),
  pin('qf', 'QF', 66, 50, 'output'),
  pin('qg', 'QG', 78.5, 50, 'output'),
  pin('qh', 'QH', 91, 50, 'output'),
  pin('gnd', 'GND', 103.5, 50, 'ground'),
  pin('qhp', 'QH_OUT', 103.5, 0, 'output'),
  pin('srclr', 'SRCLR', 91, 0, 'input'),
  pin('srclk', 'SRCLK', 78.5, 0, 'input'),
  pin('rclk', 'RCLK', 66, 0, 'input'),
  pin('oe', 'OE', 53.5, 0, 'input'),
  pin('ser', 'SER', 41, 0, 'input'),
  pin('qa', 'QA', 28.5, 0, 'output'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

// IC_74HC165: 8-bit PISO Shift Register (DIP-16)
const IC_74HC165_PINS: PinPosition[] = [
  pin('pl', 'PL', 16, 50, 'input'),
  pin('clk', 'CLK', 28.5, 50, 'input'),
  pin('d4', 'D4', 41, 50, 'input'),
  pin('d5', 'D5', 53.5, 50, 'input'),
  pin('d6', 'D6', 66, 50, 'input'),
  pin('d7', 'D7', 78.5, 50, 'input'),
  pin('q7_bar', 'Q7_BAR', 91, 50, 'output'),
  pin('gnd', 'GND', 103.5, 50, 'ground'),
  pin('q7', 'Q7', 103.5, 0, 'output'),
  pin('ser', 'SER', 91, 0, 'input'),
  pin('d0', 'D0', 78.5, 0, 'input'),
  pin('d1', 'D1', 66, 0, 'input'),
  pin('d2', 'D2', 53.5, 0, 'input'),
  pin('d3', 'D3', 41, 0, 'input'),
  pin('ce', 'CE', 28.5, 0, 'input'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

// IC_74HC138: 3-to-8 Line Decoder/Demux (DIP-16)
const IC_74HC138_PINS: PinPosition[] = [
  pin('a0', 'A0', 16, 50, 'input'),
  pin('a1', 'A1', 28.5, 50, 'input'),
  pin('a2', 'A2', 41, 50, 'input'),
  pin('e1_bar', 'E1_BAR', 53.5, 50, 'input'),
  pin('e2_bar', 'E2_BAR', 66, 50, 'input'),
  pin('e3', 'E3', 78.5, 50, 'input'),
  pin('y7', 'Y7', 91, 50, 'output'),
  pin('gnd', 'GND', 103.5, 50, 'ground'),
  pin('y6', 'Y6', 103.5, 0, 'output'),
  pin('y5', 'Y5', 91, 0, 'output'),
  pin('y4', 'Y4', 78.5, 0, 'output'),
  pin('y3', 'Y3', 66, 0, 'output'),
  pin('y2', 'Y2', 53.5, 0, 'output'),
  pin('y1', 'Y1', 41, 0, 'output'),
  pin('y0', 'Y0', 28.5, 0, 'output'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

// IC_74HC151: 8-to-1 Multiplexer (DIP-16)
const IC_74HC151_PINS: PinPosition[] = [
  pin('d3', 'D3', 16, 50, 'input'),
  pin('d2', 'D2', 28.5, 50, 'input'),
  pin('d1', 'D1', 41, 50, 'input'),
  pin('d0', 'D0', 53.5, 50, 'input'),
  pin('y', 'Y', 66, 50, 'output'),
  pin('w', 'W', 78.5, 50, 'output'),
  pin('e_bar', 'E_BAR', 91, 50, 'input'),
  pin('gnd', 'GND', 103.5, 50, 'ground'),
  pin('c', 'C', 103.5, 0, 'input'),
  pin('b', 'B', 91, 0, 'input'),
  pin('a', 'A', 78.5, 0, 'input'),
  pin('d7', 'D7', 66, 0, 'input'),
  pin('d6', 'D6', 53.5, 0, 'input'),
  pin('d5', 'D5', 41, 0, 'input'),
  pin('d4', 'D4', 28.5, 0, 'input'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

// IC_CD4017: Johnson Decade Counter (DIP-16)
const IC_CD4017_PINS: PinPosition[] = [
  pin('q5', 'Q5', 16, 50, 'output'),
  pin('q1', 'Q1', 28.5, 50, 'output'),
  pin('q0', 'Q0', 41, 50, 'output'),
  pin('q2', 'Q2', 53.5, 50, 'output'),
  pin('q6', 'Q6', 66, 50, 'output'),
  pin('q7', 'Q7', 78.5, 50, 'output'),
  pin('q3', 'Q3', 91, 50, 'output'),
  pin('gnd', 'GND', 103.5, 50, 'ground'),
  pin('q8', 'Q8', 103.5, 0, 'output'),
  pin('q4', 'Q4', 91, 0, 'output'),
  pin('q9', 'Q9', 78.5, 0, 'output'),
  pin('co', 'CO', 66, 0, 'output'),
  pin('clk_inh', 'CLK_INH', 53.5, 0, 'input'),
  pin('clk', 'CLK', 41, 0, 'input'),
  pin('reset', 'RESET', 28.5, 0, 'input'),
  pin('vcc', 'VDD', 16, 0, 'power'),
];

// DISPLAY_7SEG: SVG viewBox 50×70 (Standard 10-pin DIP layout)
// Top row: Pins 10 (G), 9 (F), 8 (COM1), 7 (A), 6 (B) at y=0
// Bottom row: Pins 1 (E), 2 (D), 3 (COM2), 4 (C), 5 (DP) at y=70
const SEG7_PINS: PinPosition[] = [
  pin('g', 'G', 5, 0, 'input'),
  pin('f', 'F', 15, 0, 'input'),
  pin('com', 'COM', 25, 0, 'bidirectional'),
  pin('a', 'A', 35, 0, 'input'),
  pin('b', 'B', 45, 0, 'input'),
  pin('e', 'E', 5, 70, 'input'),
  pin('d', 'D', 15, 70, 'input'),
  pin('com2', 'COM2', 25, 70, 'bidirectional'),
  pin('c', 'C', 35, 70, 'input'),
  pin('dp', 'DP', 45, 70, 'input'),
];

// BREADBOARD: SVG viewBox 220x120 - power rails + terminal strips
const BREADBOARD_PINS: PinPosition[] = (() => {
  const pins: PinPosition[] = [];
  const columns = 30;
  const xFor = (col: number) => 15 + col * 6.55;

  for (let col = 0; col < columns; col++) {
    const x = xFor(col);
    pins.push(pin(`vcc_top_${col + 1}`, '+', x, 10, 'power'));
    pins.push(pin(`gnd_top_${col + 1}`, '-', x, 22, 'ground'));
    pins.push(pin(`vcc_bottom_${col + 1}`, '+', x, 98, 'power'));
    pins.push(pin(`gnd_bottom_${col + 1}`, '-', x, 110, 'ground'));
  }

  ['A', 'B', 'C', 'D', 'E'].forEach((row, rowIndex) => {
    for (let col = 0; col < columns; col++) {
      pins.push(pin(`${row.toLowerCase()}${col + 1}`, `${row}${col + 1}`, xFor(col), 40 + rowIndex * 6, 'bidirectional'));
    }
  });

  ['F', 'G', 'H', 'I', 'J'].forEach((row, rowIndex) => {
    for (let col = 0; col < columns; col++) {
      pins.push(pin(`${row.toLowerCase()}${col + 1}`, `${row}${col + 1}`, xFor(col), 78 + rowIndex * 6, 'bidirectional'));
    }
  });

  return pins;
})();

// MOTOR_STEPPER: SVG viewBox 70×70
const STEPPER_V2_PINS: PinPosition[] = [
  pin('in1', 'IN1', 7, 70, 'input'),
  pin('in2', 'IN2', 18, 70, 'input'),
  pin('in3', 'IN3', 29, 70, 'input'),
  pin('in4', 'IN4', 40, 70, 'input'),
  pin('vcc', 'VCC', 51, 70, 'power'),
  pin('gnd', 'GND', 62, 70, 'ground'),
];

// RELAY_SINGLE: SVG viewBox 70×50
const RELAY_SINGLE_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 0, 8, 'power'),
  pin('gnd', 'GND', 0, 25, 'ground'),
  pin('in', 'IN', 0, 42, 'input'),
  pin('com', 'COM', 70, 8, 'bidirectional'),
  pin('no', 'NO', 70, 25, 'bidirectional'),
  pin('nc', 'NC', 70, 42, 'bidirectional'),
];

// RELAY_2CH: SVG viewBox 90×50
const RELAY_2CH_PINS: PinPosition[] = [
  pin('in1', 'IN1', 0, 10, 'input'),
  pin('in2', 'IN2', 0, 20, 'input'),
  pin('gnd', 'GND', 0, 25, 'ground'),
  pin('vcc', 'VCC', 0, 40, 'power'),
  pin('com1', 'COM1', 90, 12, 'bidirectional'),
  pin('no1', 'NO1', 90, 25, 'bidirectional'),
  pin('com2', 'COM2', 90, 38, 'bidirectional'),
  pin('no2', 'NO2', 90, 48, 'bidirectional'),
];

// RELAY_4CH: SVG viewBox 120×50
const RELAY_4CH_PINS: PinPosition[] = [
  pin('in1', 'IN1', 0, 10, 'input'),
  pin('in2', 'IN2', 0, 18, 'input'),
  pin('gnd', 'GND', 0, 25, 'ground'),
  pin('in3', 'IN3', 0, 32, 'input'),
  pin('in4', 'IN4', 0, 40, 'input'),
  pin('vcc', 'VCC', 0, 47, 'power'),
  pin('com1', 'COM1', 120, 6, 'bidirectional'),
  pin('no1', 'NO1', 120, 11, 'bidirectional'),
  pin('com2', 'COM2', 120, 18, 'bidirectional'),
  pin('no2', 'NO2', 120, 23, 'bidirectional'),
  pin('com3', 'COM3', 120, 30, 'bidirectional'),
  pin('no3', 'NO3', 120, 35, 'bidirectional'),
  pin('com4', 'COM4', 120, 42, 'bidirectional'),
  pin('no4', 'NO4', 120, 47, 'bidirectional'),
];

// SWITCH_SPST: SVG viewBox 60×30
const SWITCH_SPST_PINS: PinPosition[] = [
  pin('p1', 'Pin 1', 6, 15, 'bidirectional'),
  pin('p2', 'Pin 2', 54, 15, 'bidirectional'),
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

// AMMETER: SVG viewBox 90×70, two terminal pins
const AMMETER_PINS: PinPosition[] = [
  pin('in', 'IN (+)', 24, 70, 'input'),
  pin('out', 'OUT (−)', 66, 70, 'output'),
];

// Standalone power sources and ground symbols
const POWER_SOURCE_PINS: PinPosition[] = [
  pin('positive', '+', 15, 60, 'power'),
  pin('negative', '−', 45, 60, 'ground'),
];

const GROUND_PINS: PinPosition[] = [
  pin('gnd', 'GND', 20, 24, 'ground'),
];

// OSCILLOSCOPE: up to eight digital channels + GND. CH1/CH2 retain the
// original analog probe positions for backwards-compatible saved diagrams.
const OSCILLOSCOPE_PINS: PinPosition[] = [
  pin('ch1', 'CH1', 20, 80, 'input'),
  pin('ch2', 'CH2', 50, 80, 'input'),
  pin('ch3', 'CH3', 20, 10, 'input'),
  pin('ch4', 'CH4', 35, 10, 'input'),
  pin('ch5', 'CH5', 50, 10, 'input'),
  pin('ch6', 'CH6', 65, 10, 'input'),
  pin('ch7', 'CH7', 80, 10, 'input'),
  pin('ch8', 'CH8', 95, 10, 'input'),
  pin('gnd', 'GND', 95, 80, 'ground'),
];

// ── Child Component Pin Definitions ──
// DIP-14 Logic Gates
const IC_74HC00_PINS: PinPosition[] = [
  pin('1a', '1A', 16, 50, 'input'),
  pin('1b', '1B', 30, 50, 'input'),
  pin('1y', '1Y', 44, 50, 'output'),
  pin('2a', '2A', 58, 50, 'input'),
  pin('2b', '2B', 72, 50, 'input'),
  pin('2y', '2Y', 86, 50, 'output'),
  pin('gnd', 'GND', 100, 50, 'ground'),
  pin('3y', '3Y', 100, 0, 'output'),
  pin('3a', '3A', 86, 0, 'input'),
  pin('3b', '3B', 72, 0, 'input'),
  pin('4y', '4Y', 58, 0, 'output'),
  pin('4a', '4A', 44, 0, 'input'),
  pin('4b', '4B', 30, 0, 'input'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

const IC_74HC04_PINS: PinPosition[] = [
  pin('1a', '1A', 16, 50, 'input'),
  pin('1y', '1Y', 30, 50, 'output'),
  pin('2a', '2A', 44, 50, 'input'),
  pin('2y', '2Y', 58, 50, 'output'),
  pin('3a', '3A', 72, 50, 'input'),
  pin('3y', '3Y', 86, 50, 'output'),
  pin('gnd', 'GND', 100, 50, 'ground'),
  pin('4y', '4Y', 100, 0, 'output'),
  pin('4a', '4A', 86, 0, 'input'),
  pin('5y', '5Y', 72, 0, 'output'),
  pin('5a', '5A', 58, 0, 'input'),
  pin('6y', '6Y', 44, 0, 'output'),
  pin('6a', '6A', 30, 0, 'input'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

const IC_74HC02_PINS: PinPosition[] = [
  pin('1y', '1Y', 16, 50, 'output'),
  pin('1a', '1A', 30, 50, 'input'),
  pin('1b', '1B', 44, 50, 'input'),
  pin('2y', '2Y', 58, 50, 'output'),
  pin('2a', '2A', 72, 50, 'input'),
  pin('2b', '2B', 86, 50, 'input'),
  pin('gnd', 'GND', 100, 50, 'ground'),
  pin('3a', '3A', 100, 0, 'input'),
  pin('3b', '3B', 86, 0, 'input'),
  pin('3y', '3Y', 72, 0, 'output'),
  pin('4a', '4A', 58, 0, 'input'),
  pin('4b', '4B', 44, 0, 'input'),
  pin('4y', '4Y', 30, 0, 'output'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

const IC_74HC74_PINS: PinPosition[] = [
  pin('1clr', '1CLR', 16, 50, 'input'),
  pin('1d', '1D', 30, 50, 'input'),
  pin('1clk', '1CLK', 44, 50, 'input'),
  pin('1pre', '1PRE', 58, 50, 'input'),
  pin('1q', '1Q', 86, 50, 'output'),
  pin('1q_bar', '1Q_BAR', 72, 50, 'output'),
  pin('gnd', 'GND', 100, 50, 'ground'),
  pin('2q_bar', '2Q_BAR', 100, 0, 'output'),
  pin('2q', '2Q', 86, 0, 'output'),
  pin('2pre', '2PRE', 72, 0, 'input'),
  pin('2clk', '2CLK', 58, 0, 'input'),
  pin('2d', '2D', 44, 0, 'input'),
  pin('2clr', '2CLR', 30, 0, 'input'),
  pin('vcc', 'VCC', 16, 0, 'power'),
];

// Switches
const SWITCH_SPDT_PINS: PinPosition[] = [
  pin('p1', '1', 54, 8, 'bidirectional'),
  pin('com', 'COM', 54, 15, 'bidirectional'),
  pin('p2', '2', 54, 22, 'bidirectional'),
];

const TOGGLE_SWITCH_PINS: PinPosition[] = [
  pin('p1', '1', 16, 40, 'bidirectional'),
  pin('com', 'COM', 30, 40, 'bidirectional'),
  pin('p2', '2', 44, 40, 'bidirectional'),
];

const DIP_SWITCH_4_PINS: PinPosition[] = [
  pin('in1', '1', 16, 0, 'bidirectional'),
  pin('in2', '2', 28, 0, 'bidirectional'),
  pin('in3', '3', 40, 0, 'bidirectional'),
  pin('in4', '4', 52, 0, 'bidirectional'),
  pin('out1', '1\'', 16, 40, 'bidirectional'),
  pin('out2', '2\'', 28, 40, 'bidirectional'),
  pin('out3', '3\'', 40, 40, 'bidirectional'),
  pin('out4', '4\'', 52, 40, 'bidirectional'),
];

// Instruments
const VOLTMETER_PINS: PinPosition[] = [
  pin('v_pos', 'V+', 24, 70, 'input'),
  pin('com', 'COM', 66, 70, 'ground'),
];

const LOGIC_ANALYZER_PINS: PinPosition[] = [
  pin('ch0', 'CH0', 15, 60, 'input'),
  pin('ch1', 'CH1', 24, 60, 'input'),
  pin('ch2', 'CH2', 33, 60, 'input'),
  pin('ch3', 'CH3', 42, 60, 'input'),
  pin('ch4', 'CH4', 51, 60, 'input'),
  pin('ch5', 'CH5', 60, 60, 'input'),
  pin('ch6', 'CH6', 69, 60, 'input'),
  pin('ch7', 'CH7', 78, 60, 'input'),
  pin('gnd', 'GND', 88, 60, 'ground'),
];

// Power Sources & Regulators
const BATTERY_18650_PINS: PinPosition[] = [
  pin('positive', '+', 15, 60, 'power'),
  pin('negative', '−', 45, 60, 'ground'),
];

const BATTERY_CR2032_PINS: PinPosition[] = [
  pin('positive', '+', 15, 50, 'power'),
  pin('negative', '−', 35, 50, 'ground'),
];

const BATTERY_LIPO_PINS: PinPosition[] = [
  pin('positive', '+', 20, 60, 'power'),
  pin('negative', '−', 40, 60, 'ground'),
];

const BATTERY_AAA_PINS: PinPosition[] = [
  pin('positive', '+', 15, 60, 'power'),
  pin('negative', '−', 45, 60, 'ground'),
];

const AMS1117_PINS: PinPosition[] = [
  pin('vin', 'VIN', 0, 15, 'power'),
  pin('gnd_in', 'GND', 0, 35, 'ground'),
  pin('vout', '3.3V', 60, 15, 'power'),
  pin('gnd_out', 'GND', 60, 35, 'ground'),
];

// Sensors
const ULTRASONIC_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 20, 60, 'power'),
  pin('trig', 'TRIG', 33, 60, 'input'),
  pin('echo', 'ECHO', 47, 60, 'output'),
  pin('gnd', 'GND', 60, 60, 'ground'),
];

const DHT11_PINS: PinPosition[] = [
  pin('vcc', 'VCC (+)', 12, 60, 'power'),
  pin('data', 'DATA (S)', 25, 60, 'bidirectional'),
  pin('gnd', 'GND (−)', 38, 60, 'ground'),
];

const TMP36_PINS: PinPosition[] = [
  pin('vcc', 'Vs (+)', 16, 70, 'power'),
  pin('vout', 'Vout', 28, 70, 'output'),
  pin('gnd', 'GND', 40, 70, 'ground'),
];

const MQ2_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 12, 60, 'power'),
  pin('gnd', 'GND', 24, 60, 'ground'),
  pin('dout', 'DO', 36, 60, 'output'),
  pin('aout', 'AO', 48, 60, 'output'),
];

// Motors
const VIBRATION_MOTOR_PINS: PinPosition[] = [
  pin('pos', '+', 18, 50, 'power'),
  pin('neg', '−', 32, 50, 'ground'),
];

const GEAR_MOTOR_PINS: PinPosition[] = [
  pin('m_pos', 'Motor +', 0, 20, 'bidirectional'),
  pin('m_neg', 'Motor −', 0, 40, 'bidirectional'),
];

const SOLENOID_PINS: PinPosition[] = [
  pin('coil1', 'Coil 1', 12, 50, 'bidirectional'),
  pin('coil2', 'Coil 2', 32, 50, 'bidirectional'),
];

// Displays
const TM1637_PINS: PinPosition[] = [
  pin('clk', 'CLK', 25, 50, 'input'),
  pin('dio', 'DIO', 40, 50, 'bidirectional'),
  pin('vcc', 'VCC', 55, 50, 'power'),
  pin('gnd', 'GND', 70, 50, 'ground'),
];

const LED_BAR_GRAPH_PINS: PinPosition[] = [
  ...Array.from({ length: 10 }, (_, i) => pin(`a${i + 1}`, `A${i + 1}`, 7.5 + i * 5, 0, 'input')),
  ...Array.from({ length: 10 }, (_, i) => pin(`k${i + 1}`, `K${i + 1}`, 7.5 + i * 5, 60, 'input')),
];

const MAX7219_MATRIX_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 15, 80, 'power'),
  pin('gnd', 'GND', 27, 80, 'ground'),
  pin('din', 'DIN', 39, 80, 'input'),
  pin('cs', 'CS', 51, 80, 'input'),
  pin('clk', 'CLK', 63, 80, 'input'),
];

// Passives & Relays
const TRIMPOT_PINS: PinPosition[] = [
  pin('p1', '1', 12, 50, 'bidirectional'),
  pin('wiper', 'Wiper', 25, 50, 'bidirectional'),
  pin('p2', '2', 38, 50, 'bidirectional'),
];

const PHOTO_DIODE_PINS: PinPosition[] = [
  pin('anode', 'A', 16, 70, 'bidirectional'),
  pin('cathode', 'K', 24, 70, 'bidirectional'),
];

const RELAY_8CH_PINS: PinPosition[] = [
  pin('vcc', 'VCC', 12, 9, 'power'),
  pin('gnd', 'GND', 12, 13.5, 'ground'),
  ...Array.from({ length: 8 }, (_, i) => pin(`in${i + 1}`, `IN${i + 1}`, 12, 18 + i * 4.5, 'input')),
  ...Array.from({ length: 8 }, (_, i) => [
    pin(`no${i + 1}`, `NO${i + 1}`, 24 + i * 16 + 3.5, 60, 'bidirectional'),
    pin(`com${i + 1}`, `COM${i + 1}`, 24 + i * 16 + 7, 60, 'bidirectional'),
    pin(`nc${i + 1}`, `NC${i + 1}`, 24 + i * 16 + 10.5, 60, 'bidirectional'),
  ]).flat(),
];

const RELAY_SSR_PINS: PinPosition[] = [
  pin('load1', '1 (~)', 20, 0, 'bidirectional'),
  pin('load2', '2 (~)', 50, 0, 'bidirectional'),
  pin('ctrl_pos', '3 (+)', 20, 70, 'input'),
  pin('ctrl_neg', '4 (−)', 50, 70, 'ground'),
];

// ── Registry ──
const catalogBoardPinRegistry = Object.fromEntries(
  BOARD_CATALOG.map((boardItem) => [boardItem.type, createBoardPins(boardItem.footprint, boardItem.type)]),
);

export const boardPinRegistry: Record<string, PinPosition[]> = {
  ...catalogBoardPinRegistry,

  ARDUINO_NANO: ARDUINO_NANO_PINS,
  ESP32: ESP32_PINS,
  ESP32_S3: ESP32_PINS,

  // Passives & Discrete
  RESISTOR: RESISTOR_PINS,
  INDUCTOR: INDUCTOR_PINS,
  TRANSFORMER: TRANSFORMER_PINS,
  CAPACITOR: CAPACITOR_PINS,
  VARIABLE_CAPACITOR: VARIABLE_CAPACITOR_PINS,
  CERAMIC_CAPACITOR: CERAMIC_CAPACITOR_PINS,
  ELECTROLYTIC_CAPACITOR: ELECTROLYTIC_CAPACITOR_PINS,
  DIODE: DIODE_PINS,
  ZENER_DIODE: DIODE_PINS,
  SCHOTTKY_DIODE: DIODE_PINS,
  NPN_TRANSISTOR: NPN_TRANSISTOR_PINS,
  PNP_TRANSISTOR: PNP_TRANSISTOR_PINS,
  NMOS: MOSFET_PINS,
  PMOS: MOSFET_PINS,
  OPAMP_IDEAL: OPAMP_PINS,
  OPAMP_LM358: OPAMP_PINS,
  BRIDGE_RECTIFIER: BRIDGE_RECTIFIER_PINS,
  THERMISTOR: RESISTOR_PINS,
  THERMISTOR_NTC: RESISTOR_PINS,
  MULTIMETER: MULTIMETER_PINS,
  IC_555_TIMER: IC_555_PINS,

  // Digital Logic ICs (74xx / CD4000)
  IC_74HC595: IC_74HC595_PINS,
  '74HC595': IC_74HC595_PINS,
  IC_74HC165: IC_74HC165_PINS,
  '74HC165': IC_74HC165_PINS,
  IC_74HC138: IC_74HC138_PINS,
  '74HC138': IC_74HC138_PINS,
  IC_74HC151: IC_74HC151_PINS,
  '74HC151': IC_74HC151_PINS,
  IC_CD4017: IC_CD4017_PINS,
  'CD4017': IC_CD4017_PINS,
  IC_74HC00: IC_74HC00_PINS,
  '74HC00': IC_74HC00_PINS,
  IC_74HC04: IC_74HC04_PINS,
  '74HC04': IC_74HC04_PINS,
  IC_74HC08: IC_74HC00_PINS,
  '74HC08': IC_74HC00_PINS,
  IC_74HC32: IC_74HC00_PINS,
  '74HC32': IC_74HC00_PINS,
  IC_74HC86: IC_74HC00_PINS,
  '74HC86': IC_74HC00_PINS,
  IC_74HC14: IC_74HC04_PINS,
  '74HC14': IC_74HC04_PINS,
  IC_74HC74: IC_74HC74_PINS,
  '74HC74': IC_74HC74_PINS,
  IC_74HC02: IC_74HC02_PINS,
  '74HC02': IC_74HC02_PINS,

  // Power
  VOLTAGE_REGULATOR_7805: VOLTAGE_REGULATOR_PINS,
  VOLTAGE_REGULATOR_AMS1117: AMS1117_PINS,
  AMS1117_3V3: AMS1117_PINS,
  BATTERY_9V: POWER_SOURCE_PINS,
  BATTERY_AA: POWER_SOURCE_PINS,
  BATTERY_18650: BATTERY_18650_PINS,
  BATTERY_CR2032: BATTERY_CR2032_PINS,
  BATTERY_LIPO: BATTERY_LIPO_PINS,
  BATTERY_AAA: BATTERY_AAA_PINS,
  POWER_SUPPLY: POWER_SOURCE_PINS,
  DC_SOURCE_3V3: POWER_SOURCE_PINS,
  DC_SOURCE_5V: POWER_SOURCE_PINS,
  DC_SOURCE_12V: POWER_SOURCE_PINS,
  AC_FUNCTION_GENERATOR: POWER_SOURCE_PINS,
  GROUND: GROUND_PINS,

  // LEDs
  LED_STANDARD: LED_PINS,
  LED_RGB: LED_RGB_PINS,
  LED_RED: LED_PINS,
  LED_GREEN: LED_PINS,
  LED_BLUE: LED_PINS,
  LED_YELLOW: LED_PINS,
  LED_WHITE: LED_PINS,
  LED_ORANGE: LED_PINS,
  LED_PURPLE: LED_PINS,

  // Input
  PUSH_BUTTON: BUTTON_PINS,
  BUTTON: BUTTON_PINS,
  SWITCH_SPST: SWITCH_SPST_PINS,
  SWITCH_SPDT: SWITCH_SPDT_PINS,
  TOGGLE_SWITCH: TOGGLE_SWITCH_PINS,
  DIP_SWITCH_4: DIP_SWITCH_4_PINS,
  POTENTIOMETER: POTENTIOMETER_PINS,
  TRIMPOT: TRIMPOT_PINS,

  // Output / Actuators
  BUZZER: BUZZER_PINS,
  SERVO_MOTOR: SERVO_PINS,
  MOTOR_SERVO: SERVO_PINS,
  MOTOR_DC: DC_MOTOR_PINS,
  STEPPER_MOTOR: STEPPER_MOTOR_PINS,
  MOTOR_STEPPER: STEPPER_V2_PINS,
  VIBRATION_MOTOR: VIBRATION_MOTOR_PINS,
  GEAR_MOTOR: GEAR_MOTOR_PINS,
  SOLENOID: SOLENOID_PINS,
  RELAY_SPDT: RELAY_PINS,
  RELAY_SINGLE: RELAY_SINGLE_PINS,
  RELAY_2CH: RELAY_2CH_PINS,
  RELAY_4CH: RELAY_4CH_PINS,
  RELAY_8CH: RELAY_8CH_PINS,
  RELAY_SSR: RELAY_SSR_PINS,

  // Sensors
  PIR_SENSOR: PIR_PINS,
  SENSOR_PIR: PIR_PINS,
  LDR: LDR_PINS,
  SENSOR_LDR: LDR_PINS,
  PHOTO_DIODE: PHOTO_DIODE_PINS,
  SOIL_MOISTURE: SOIL_MOISTURE_PINS,
  ULTRASONIC_SENSOR: ULTRASONIC_PINS,
  HC_SR04: ULTRASONIC_PINS,
  TEMPERATURE_SENSOR: DHT11_PINS,
  DHT11: DHT11_PINS,
  TMP36: TMP36_PINS,
  GAS_SENSOR: MQ2_PINS,
  MQ2: MQ2_PINS,

  // Displays
  LCD_16X2: LCD_16X2_PINS,
  DISPLAY_LCD_I2C: LCD_I2C_PINS,
  OLED_DISPLAY: OLED_PINS,
  DISPLAY_OLED: OLED_PINS,
  DISPLAY_7SEG: SEG7_PINS,
  DISPLAY_7SEG_4DIGIT: TM1637_PINS,
  TM1637: TM1637_PINS,
  LED_BAR_GRAPH: LED_BAR_GRAPH_PINS,
  DISPLAY_MAX7219_MATRIX: MAX7219_MATRIX_PINS,

  // Communication

  // Drone / ESC
  ESC_MODULE: ESC_PINS,
  MOTOR_BLDC: MOTOR_BLDC_PINS,

  // Instruments
  AMMETER: AMMETER_PINS,
  VOLTMETER: VOLTMETER_PINS,
  LOGIC_ANALYZER: LOGIC_ANALYZER_PINS,
  OSCILLOSCOPE: OSCILLOSCOPE_PINS,

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

