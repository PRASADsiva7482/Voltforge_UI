import type { BoardType } from '../types/domain'
import { getBoardProfile } from '../features/canvas/boardCatalog'

/**
 * Get the correct default baud rate for a board type.
 *
 * Modern boards (ESP32, STM32, RP2040, Teensy, etc.) typically use 115200.
 * Classic AVR Arduino boards use 9600 by convention.
 */
function getDefaultBaud(boardType: BoardType): number {
  const type = boardType as string

  // Classic AVR Arduino boards — 9600 by convention
  if (
    type === 'ARDUINO_UNO' ||
    type === 'ARDUINO_NANO' ||
    type === 'ARDUINO_MEGA' ||
    type === 'ARDUINO_LEONARDO' ||
    type === 'ARDUINO_MICRO' ||
    type === 'ATMEL_AVR_ATMEGA328P' ||
    type === 'ATMEL_AVR_ATTINY'
  ) {
    return 9600
  }

  // Everything modern defaults to 115200
  return 115200
}

/**
 * Generate the default `main.ino` starter code for a new project.
 *
 * Includes platform-specific hints for WiFi, Pico, Teensy, etc.
 */
export function generateDefaultCode(boardType: BoardType, projectName: string): string {
  const profile = getBoardProfile(boardType)
  const boardLabel = profile?.name || boardType.replace(/_/g, ' ')
  const baud = getDefaultBaud(boardType)
  const type = boardType as string

  const isEsp = type.startsWith('ESP')
  const isPico = type.startsWith('RASPBERRY_PI_PICO')
  const isTeensy = type.startsWith('TEENSY')
  const isNordic = type === 'SEEED_XIAO_NRF52840' || type === 'ADAFRUIT_FEATHER_NRF52840'

  const hints: string[] = []

  if (isEsp) {
    hints.push(`\n  // WiFi.begin("SSID", "password");`)
    hints.push(`  // WiFi is available on ${boardLabel}`)
  }
  if (isPico) {
    hints.push(`\n  // Pico note: also supports MicroPython and C/C++ SDK.`)
    hints.push(`  // PIO (Programmable I/O) is available for custom protocols.`)
  }
  if (isTeensy) {
    hints.push(`\n  // Teensy USB serial runs at native speed regardless of baud setting.`)
  }
  if (isNordic) {
    hints.push(`\n  // BLE (Bluetooth Low Energy) is available on ${boardLabel}.`)
  }

  const hintBlock = hints.length > 0 ? hints.join('\n') : ''

  return [
    `// ${projectName}`,
    `// Board: ${boardLabel}`,
    '',
    'void setup() {',
    `  Serial.begin(${baud});`,
    `  Serial.println("VoltForge — ${projectName}");`,
    hintBlock,
    '}',
    '',
    'void loop() {',
    '  // Your code here',
    '  delay(1000);',
    '}',
    '',
  ].join('\n')
}

