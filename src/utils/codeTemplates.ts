import type { BoardType } from '../types/domain'

/** Baud rates matching each board's typical default. */
const BOARD_BAUD_RATE: Record<BoardType, number> = {
  ARDUINO_MEGA: 9600,
  ARDUINO_NANO: 9600,
  ARDUINO_UNO: 9600,
  ESP32: 115200,
  ESP32_S3: 115200,
  ESP8266: 115200,
}

/**
 * Generate the default `main.ino` starter code for a new project.
 *
 * ESP boards use 115200 baud and include a WiFi placeholder comment;
 * Arduino boards default to 9600 baud.
 */
export function generateDefaultCode(boardType: BoardType, projectName: string): string {
  const boardLabel = boardType.replace(/_/g, ' ')
  const baud = BOARD_BAUD_RATE[boardType] ?? 9600
  const isEsp = boardType.startsWith('ESP')

  const wifiHint = isEsp
    ? `\n  // WiFi.begin("SSID", "password");\n  // WiFi is available on ${boardLabel}`
    : ''

  return [
    `// ${projectName}`,
    `// Board: ${boardLabel}`,
    '',
    'void setup() {',
    `  Serial.begin(${baud});`,
    `  Serial.println("VoltForge — ${projectName}");`,
    wifiHint,
    '}',
    '',
    'void loop() {',
    '  // Your code here',
    '  delay(1000);',
    '}',
    '',
  ].join('\n')
}
