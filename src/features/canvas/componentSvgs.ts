// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Realistic SVG Component Library
// Maps component TYPE from DB seed to inline SVG data URIs
// ═══════════════════════════════════════════════════════════════════════════

const svg = (vb: string, body: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

export const componentSvgs: Record<string, string> = {
  // ── Boards ──
  ARDUINO_UNO: svg('0 0 200 150',
    '<rect width="200" height="150" rx="8" fill="%230d6ebd"/>' +
    '<rect x="8" y="8" width="28" height="28" rx="2" fill="%23c0c0c0"/>' +
    '<rect x="160" y="8" width="32" height="14" rx="2" fill="%23c0c0c0"/>' +
    '<rect x="8" y="130" width="184" height="12" rx="2" fill="%23111"/>' +
    '<rect x="8" y="44" width="184" height="4" rx="1" fill="%23111"/>' +
    '<circle cx="16" cy="130" r="4" fill="%23222"/><circle cx="184" cy="130" r="4" fill="%23222"/>' +
    '<rect x="52" y="60" width="16" height="16" fill="%23333"/>' +
    '<text x="100" y="90" font-size="18" fill="white" font-weight="bold" text-anchor="middle" font-family="Arial">Arduino UNO</text>'
  ),
  ARDUINO_MEGA: svg('0 0 280 120',
    '<rect width="280" height="120" rx="6" fill="%230d6ebd"/>' +
    '<rect x="6" y="6" width="24" height="24" rx="2" fill="%23c0c0c0"/>' +
    '<rect x="6" y="100" width="268" height="12" rx="2" fill="%23111"/>' +
    '<rect x="6" y="36" width="268" height="4" rx="1" fill="%23111"/>' +
    '<text x="140" y="72" font-size="14" fill="white" font-weight="bold" text-anchor="middle" font-family="Arial">Arduino MEGA 2560</text>'
  ),
  ARDUINO_NANO: svg('0 0 100 160',
    '<rect width="100" height="160" rx="4" fill="%230d6ebd"/>' +
    '<rect x="30" y="4" width="40" height="16" rx="2" fill="%23c0c0c0"/>' +
    '<rect x="4" y="26" width="6" height="120" fill="%23111"/>' +
    '<rect x="90" y="26" width="6" height="120" fill="%23111"/>' +
    '<text x="50" y="90" font-size="11" fill="white" font-weight="bold" text-anchor="middle" font-family="Arial">NANO</text>'
  ),
  ESP32: svg('0 0 100 160',
    '<rect width="100" height="160" rx="4" fill="%231a1a2e"/>' +
    '<rect x="15" y="8" width="70" height="44" rx="2" fill="%23c0c0c0"/>' +
    '<rect x="4" y="60" width="6" height="90" fill="%23b8860b"/>' +
    '<rect x="90" y="60" width="6" height="90" fill="%23b8860b"/>' +
    '<text x="50" y="120" font-size="14" fill="%2310b981" font-weight="bold" text-anchor="middle" font-family="Arial">ESP32</text>'
  ),
  ESP32_S3: svg('0 0 100 160',
    '<rect width="100" height="160" rx="4" fill="%231a1a2e"/>' +
    '<rect x="15" y="8" width="70" height="44" rx="2" fill="%23c0c0c0"/>' +
    '<rect x="4" y="60" width="6" height="90" fill="%23b8860b"/>' +
    '<rect x="90" y="60" width="6" height="90" fill="%23b8860b"/>' +
    '<text x="50" y="115" font-size="12" fill="%2310b981" font-weight="bold" text-anchor="middle" font-family="Arial">ESP32-S3</text>' +
    '<text x="50" y="135" font-size="8" fill="%238b5cf6" text-anchor="middle" font-family="Arial">USB-OTG</text>'
  ),

  // ── LEDs ──
  LED_STANDARD: svg('0 0 40 80',
    '<defs><radialGradient id="lg"><stop offset="0%25" stop-color="white" stop-opacity="0.6"/><stop offset="100%25" stop-color="%23ef4444" stop-opacity="0.9"/></radialGradient></defs>' +
    '<ellipse cx="20" cy="22" rx="14" ry="18" fill="url(%23lg)"/>' +
    '<rect x="6" y="36" width="28" height="8" rx="2" fill="%23991b1b"/>' +
    '<rect x="14" y="44" width="3" height="30" fill="%23a0a0a0"/>' +
    '<rect x="23" y="44" width="3" height="36" fill="%23a0a0a0"/>'
  ),
  LED_RGB: svg('0 0 50 80',
    '<defs><radialGradient id="rg"><stop offset="0%25" stop-color="white" stop-opacity="0.8"/><stop offset="100%25" stop-color="%23e0e0e0" stop-opacity="0.3"/></radialGradient></defs>' +
    '<ellipse cx="25" cy="20" rx="16" ry="18" fill="url(%23rg)" stroke="%23ccc" stroke-width="0.5"/>' +
    '<rect x="9" y="34" width="32" height="8" rx="2" fill="%239ca3af"/>' +
    '<rect x="13" y="42" width="2" height="32" fill="%23ef4444"/>' +
    '<rect x="20" y="42" width="2" height="36" fill="%2322c55e"/>' +
    '<rect x="27" y="42" width="2" height="32" fill="%233b82f6"/>' +
    '<rect x="34" y="42" width="2" height="28" fill="%23666"/>'
  ),
  LED_NEOPIXEL: svg('0 0 60 20',
    '<rect width="60" height="20" rx="3" fill="%23111"/>' +
    '<circle cx="10" cy="10" r="6" fill="%23ef4444" opacity="0.8"/>' +
    '<circle cx="30" cy="10" r="6" fill="%2322c55e" opacity="0.8"/>' +
    '<circle cx="50" cy="10" r="6" fill="%233b82f6" opacity="0.8"/>'
  ),

  // ── Sensors ──
  SENSOR_DHT22: svg('0 0 60 80',
    '<rect width="60" height="80" rx="4" fill="white" stroke="%23ddd" stroke-width="1"/>' +
    '<rect x="8" y="8" width="44" height="44" rx="2" fill="%23e5e7eb"/>' +
    '<circle cx="30" cy="30" r="12" fill="%23f0f0f0" stroke="%23999" stroke-width="1"/>' +
    '<text x="30" y="70" font-size="8" fill="%23333" text-anchor="middle" font-family="Arial" font-weight="bold">DHT22</text>' +
    '<rect x="14" y="76" width="4" height="4" fill="%23b8860b"/>' +
    '<rect x="24" y="76" width="4" height="4" fill="%23b8860b"/>' +
    '<rect x="34" y="76" width="4" height="4" fill="%23b8860b"/>'
  ),
  SENSOR_DHT11: svg('0 0 60 80',
    '<rect width="60" height="80" rx="5" fill="%232563eb" stroke="%231e3a8a" stroke-width="1"/>' +
    '<rect x="9" y="10" width="42" height="42" rx="3" fill="%233b82f6"/>' +
    '<path d="M16 18h28M16 26h28M16 34h28M16 42h28" stroke="%23bfdbfe" stroke-width="3" stroke-linecap="round"/>' +
    '<text x="30" y="68" font-size="8" fill="white" text-anchor="middle" font-family="Arial" font-weight="bold">DHT11</text>' +
    '<rect x="12" y="76" width="5" height="4" fill="%23b8860b"/>' +
    '<rect x="23" y="76" width="5" height="4" fill="%23b8860b"/>' +
    '<rect x="34" y="76" width="5" height="4" fill="%23b8860b"/>' +
    '<rect x="45" y="76" width="5" height="4" fill="%23b8860b"/>'
  ),
  SENSOR_ULTRASONIC: svg('0 0 80 50',
    '<rect width="80" height="50" rx="4" fill="%230ea5e9"/>' +
    '<circle cx="22" cy="22" r="12" fill="%23c0c0c0" stroke="%23888" stroke-width="1"/>' +
    '<circle cx="58" cy="22" r="12" fill="%23c0c0c0" stroke="%23888" stroke-width="1"/>' +
    '<rect x="6" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="18" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="56" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="68" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<text x="40" y="48" font-size="6" fill="white" text-anchor="middle" font-family="Arial">HC-SR04</text>'
  ),
  ULTRASONIC_SENSOR: svg('0 0 80 50',
    '<rect width="80" height="50" rx="4" fill="%230ea5e9"/>' +
    '<circle cx="22" cy="22" r="12" fill="%23c0c0c0" stroke="%23888" stroke-width="1"/>' +
    '<circle cx="58" cy="22" r="12" fill="%23c0c0c0" stroke="%23888" stroke-width="1"/>' +
    '<circle cx="22" cy="22" r="7" fill="%2394a3b8"/>' +
    '<circle cx="58" cy="22" r="7" fill="%2394a3b8"/>' +
    '<rect x="6" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="18" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="56" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="68" y="42" width="6" height="6" fill="%23b8860b"/>' +
    '<text x="40" y="48" font-size="6" fill="white" text-anchor="middle" font-family="Arial">HC-SR04</text>'
  ),
  SENSOR_PIR: svg('0 0 60 70',
    '<rect x="5" y="20" width="50" height="50" rx="4" fill="%23059669"/>' +
    '<circle cx="30" cy="28" r="18" fill="%23f8fafc" opacity="0.9"/>' +
    '<circle cx="30" cy="28" r="10" fill="%23e2e8f0" opacity="0.7"/>' +
    '<rect x="14" y="64" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="27" y="64" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="40" y="64" width="6" height="6" fill="%23b8860b"/>'
  ),
  PIR_SENSOR: svg('0 0 60 70',
    '<rect x="5" y="20" width="50" height="50" rx="4" fill="%23059669"/>' +
    '<circle cx="30" cy="28" r="18" fill="%23f8fafc" opacity="0.9"/>' +
    '<path d="M18 28a12 12 0 0 1 24 0M22 28a8 8 0 0 1 16 0M26 28a4 4 0 0 1 8 0" stroke="%23cbd5e1" stroke-width="1.5" fill="none"/>' +
    '<rect x="14" y="64" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="27" y="64" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="40" y="64" width="6" height="6" fill="%23b8860b"/>'
  ),
  SENSOR_LDR: svg('0 0 40 40',
    '<circle cx="20" cy="20" r="16" fill="%23d97706" stroke="%23a16207" stroke-width="2"/>' +
    '<path d="M12 12 L28 28 M12 28 L28 12" stroke="%23fbbf24" stroke-width="2"/>' +
    '<rect x="8" y="34" width="4" height="6" fill="%23a0a0a0"/>' +
    '<rect x="28" y="34" width="4" height="6" fill="%23a0a0a0"/>'
  ),
  SENSOR_IMU: svg('0 0 60 60',
    '<rect width="60" height="60" rx="4" fill="%23581c87"/>' +
    '<rect x="8" y="8" width="44" height="44" rx="2" fill="%231e1b4b"/>' +
    '<circle cx="30" cy="30" r="4" fill="%238b5cf6"/>' +
    '<text x="30" y="18" font-size="7" fill="%238b5cf6" text-anchor="middle" font-family="Arial">MPU</text>' +
    '<text x="30" y="48" font-size="6" fill="%23a78bfa" text-anchor="middle" font-family="Arial">6050</text>'
  ),

  // ── Displays ──
  DISPLAY_LCD_I2C: svg('0 0 120 60',
    '<rect width="120" height="60" rx="4" fill="%230369a1"/>' +
    '<rect x="6" y="6" width="108" height="36" rx="2" fill="%2364d475"/>' +
    '<rect x="10" y="12" width="100" height="6" rx="1" fill="%23006400" opacity="0.4"/>' +
    '<rect x="10" y="28" width="100" height="6" rx="1" fill="%23006400" opacity="0.4"/>' +
    '<rect x="10" y="48" width="8" height="6" fill="%23b8860b"/>' +
    '<rect x="24" y="48" width="8" height="6" fill="%23b8860b"/>' +
    '<rect x="38" y="48" width="8" height="6" fill="%23b8860b"/>' +
    '<rect x="52" y="48" width="8" height="6" fill="%23b8860b"/>'
  ),
  LCD_16X2: svg('0 0 170 60',
    '<rect width="170" height="60" rx="4" fill="%230369a1"/>' +
    '<circle cx="8" cy="8" r="3" fill="%23111827"/><circle cx="162" cy="8" r="3" fill="%23111827"/>' +
    '<rect x="12" y="10" width="146" height="34" rx="2" fill="%2384cc16"/>' +
    '<text x="85" y="25" font-size="8" fill="%23365f07" text-anchor="middle" font-family="monospace">VoltForge</text>' +
    '<text x="85" y="38" font-size="8" fill="%23365f07" text-anchor="middle" font-family="monospace">LCD 16x2</text>' +
    '<rect x="8" y="52" width="154" height="4" fill="%23b8860b" opacity="0.6"/>'
  ),
  DISPLAY_OLED: svg('0 0 80 60',
    '<rect width="80" height="60" rx="4" fill="%23111827"/>' +
    '<rect x="6" y="6" width="68" height="38" rx="2" fill="%23000" stroke="%23333" stroke-width="1"/>' +
    '<text x="40" y="28" font-size="8" fill="%230ea5e9" text-anchor="middle" font-family="Arial">OLED 128x64</text>' +
    '<rect x="16" y="50" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="30" y="50" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="44" y="50" width="6" height="6" fill="%23b8860b"/>' +
    '<rect x="58" y="50" width="6" height="6" fill="%23b8860b"/>'
  ),
  DISPLAY_7SEG: svg('0 0 50 70',
    '<rect width="50" height="70" rx="2" fill="%23111"/>' +
    '<path d="M12 8 h26 l-4 4 h-18 Z" fill="%23ef4444" opacity="0.8"/>' +
    '<path d="M40 12 l4 4 v18 l-4 4 l-4-4 v-18 Z" fill="%23ef4444" opacity="0.8"/>' +
    '<path d="M40 40 l4 4 v18 l-4 4 l-4-4 v-18 Z" fill="%23ef4444" opacity="0.2"/>' +
    '<path d="M12 62 h26 l-4-4 h-18 Z" fill="%23ef4444" opacity="0.2"/>' +
    '<path d="M10 40 l-4 4 v18 l4 4 l4-4 v-18 Z" fill="%23ef4444" opacity="0.2"/>' +
    '<path d="M10 12 l-4 4 v18 l4 4 l4-4 v-18 Z" fill="%23ef4444" opacity="0.8"/>' +
    '<path d="M12 35 h26 l-4 4 h-18 Z" fill="%23ef4444" opacity="0.8"/>' +
    '<circle cx="44" cy="62" r="2" fill="%23ef4444" opacity="0.8"/>'
  ),

  // ── Relays ──
  RELAY_SINGLE: svg('0 0 70 50',
    '<rect width="70" height="50" rx="4" fill="%232563eb"/>' +
    '<rect x="4" y="4" width="62" height="28" rx="2" fill="%231e40af"/>' +
    '<rect x="8" y="8" width="14" height="20" rx="1" fill="%23c0c0c0"/>' +
    '<circle cx="45" cy="18" r="6" fill="%23fbbf24" opacity="0.6"/>' +
    '<text x="35" y="44" font-size="7" fill="white" text-anchor="middle" font-family="Arial">RELAY</text>'
  ),
  RELAY_4CH: svg('0 0 120 50',
    '<rect width="120" height="50" rx="4" fill="%232563eb"/>' +
    '<rect x="4" y="6" width="20" height="24" rx="2" fill="%231e40af"/>' +
    '<rect x="30" y="6" width="20" height="24" rx="2" fill="%231e40af"/>' +
    '<rect x="56" y="6" width="20" height="24" rx="2" fill="%231e40af"/>' +
    '<rect x="82" y="6" width="20" height="24" rx="2" fill="%231e40af"/>' +
    '<text x="60" y="44" font-size="7" fill="white" text-anchor="middle" font-family="Arial">4-CH RELAY</text>'
  ),

  // ── Motors ──
  MOTOR_DC: svg('0 0 70 50',
    '<rect x="5" y="8" width="50" height="34" rx="17" fill="%234b5563"/>' +
    '<rect x="55" y="20" width="12" height="10" rx="2" fill="%23c0c0c0"/>' +
    '<circle cx="30" cy="25" r="12" fill="%231f2937"/>' +
    '<circle cx="30" cy="25" r="4" fill="%23c0c0c0"/>' +
    '<text x="30" y="48" font-size="6" fill="%239ca3af" text-anchor="middle" font-family="Arial">DC MOTOR</text>'
  ),
  MOTOR_SERVO: svg('0 0 60 50',
    '<rect x="0" y="10" width="50" height="30" rx="3" fill="%231e40af"/>' +
    '<rect x="50" y="18" width="10" height="14" rx="2" fill="%23c0c0c0"/>' +
    '<circle cx="54" cy="25" r="5" fill="%23333"/>' +
    '<rect x="8" y="40" width="6" height="8" fill="%23ef4444"/>' +
    '<rect x="18" y="40" width="6" height="8" fill="%23a16207"/>' +
    '<rect x="28" y="40" width="6" height="8" fill="%23f97316"/>' +
    '<text x="25" y="30" font-size="7" fill="white" text-anchor="middle" font-family="Arial">SG90</text>'
  ),
  SERVO_MOTOR: svg('0 0 70 50',
    '<rect x="0" y="9" width="52" height="32" rx="4" fill="%231d4ed8"/>' +
    '<rect x="52" y="17" width="14" height="16" rx="2" fill="%23cbd5e1"/>' +
    '<circle cx="58" cy="25" r="7" fill="%23334155"/>' +
    '<rect x="8" y="41" width="6" height="8" fill="%23ef4444"/>' +
    '<rect x="20" y="41" width="6" height="8" fill="%23a16207"/>' +
    '<rect x="32" y="41" width="6" height="8" fill="%23f97316"/>' +
    '<text x="26" y="29" font-size="8" fill="white" text-anchor="middle" font-family="Arial" font-weight="bold">SG90</text>'
  ),
  MOTOR_STEPPER: svg('0 0 70 70',
    '<circle cx="35" cy="35" r="30" fill="%234b5563"/>' +
    '<circle cx="35" cy="35" r="20" fill="%231f2937"/>' +
    '<circle cx="35" cy="35" r="6" fill="%23c0c0c0"/>' +
    '<rect x="12" y="62" width="6" height="8" fill="%23b8860b"/>' +
    '<rect x="24" y="62" width="6" height="8" fill="%23b8860b"/>' +
    '<rect x="36" y="62" width="6" height="8" fill="%23b8860b"/>' +
    '<rect x="48" y="62" width="6" height="8" fill="%23b8860b"/>'
  ),

  // ── Passives ──
  RESISTOR: svg('0 0 90 24',
    '<rect x="0" y="10" width="18" height="4" fill="%23a0a0a0"/>' +
    '<rect x="72" y="10" width="18" height="4" fill="%23a0a0a0"/>' +
    '<rect x="18" y="2" width="54" height="20" rx="4" fill="%23d4a574"/>' +
    '<rect x="26" y="2" width="5" height="20" fill="%23a16207"/>' +
    '<rect x="36" y="2" width="5" height="20" fill="%23000"/>' +
    '<rect x="46" y="2" width="5" height="20" fill="%23dc2626"/>' +
    '<rect x="58" y="2" width="3" height="20" fill="%23b8860b"/>'
  ),
  CAPACITOR: svg('0 0 40 50',
    '<rect x="17" y="0" width="6" height="16" fill="%23a0a0a0"/>' +
    '<rect x="17" y="34" width="6" height="16" fill="%23a0a0a0"/>' +
    '<rect x="6" y="16" width="28" height="6" fill="%230369a1"/>' +
    '<rect x="6" y="28" width="28" height="6" fill="%230369a1"/>'
  ),
  POTENTIOMETER: svg('0 0 50 50',
    '<circle cx="25" cy="25" r="20" fill="%230369a1"/>' +
    '<circle cx="25" cy="25" r="14" fill="%231e40af"/>' +
    '<line x1="25" y1="25" x2="25" y2="8" stroke="white" stroke-width="2"/>' +
    '<circle cx="25" cy="25" r="4" fill="%23c0c0c0"/>' +
    '<rect x="6" y="44" width="4" height="6" fill="%23a0a0a0"/>' +
    '<rect x="22" y="44" width="4" height="6" fill="%23a0a0a0"/>' +
    '<rect x="40" y="44" width="4" height="6" fill="%23a0a0a0"/>'
  ),
  BUTTON: svg('0 0 40 40',
    '<rect width="40" height="40" rx="4" fill="%23374151"/>' +
    '<circle cx="20" cy="20" r="10" fill="%23ef4444"/>' +
    '<circle cx="20" cy="20" r="8" fill="%23dc2626"/>' +
    '<rect x="0" y="8" width="4" height="6" fill="%23a0a0a0"/>' +
    '<rect x="36" y="8" width="4" height="6" fill="%23a0a0a0"/>' +
    '<rect x="0" y="26" width="4" height="6" fill="%23a0a0a0"/>' +
    '<rect x="36" y="26" width="4" height="6" fill="%23a0a0a0"/>'
  ),
  BREADBOARD: svg('0 0 200 80',
    '<rect width="200" height="80" rx="4" fill="%23f5f0e0"/>' +
    '<rect x="4" y="4" width="192" height="8" fill="%23dc2626" opacity="0.3"/>' +
    '<rect x="4" y="14" width="192" height="8" fill="%230369a1" opacity="0.3"/>' +
    '<rect x="4" y="58" width="192" height="8" fill="%23dc2626" opacity="0.3"/>' +
    '<rect x="4" y="68" width="192" height="8" fill="%230369a1" opacity="0.3"/>' +
    '<rect x="4" y="28" width="192" height="24" fill="%23e2e0d4"/>' +
    '<line x1="4" y1="40" x2="196" y2="40" stroke="%23d0cec0" stroke-width="2"/>'
  ),
  BUZZER: svg('0 0 50 50',
    '<circle cx="25" cy="25" r="22" fill="%231f2937"/>' +
    '<circle cx="25" cy="25" r="16" fill="%23111827"/>' +
    '<circle cx="25" cy="25" r="6" fill="%23374151"/>' +
    '<text x="25" y="8" font-size="5" fill="%239ca3af" text-anchor="middle" font-family="Arial">+</text>' +
    '<rect x="18" y="46" width="4" height="4" fill="%23a0a0a0"/>' +
    '<rect x="28" y="46" width="4" height="4" fill="%23a0a0a0"/>'
  ),
  MULTIMETER: svg('0 0 90 70',
    '<rect x="4" y="2" width="82" height="66" rx="8" fill="%23f59e0b" stroke="%23b45309" stroke-width="2"/>' +
    '<rect x="14" y="14" width="62" height="28" rx="3" fill="%23111827" stroke="%23222" stroke-width="1"/>' +
    '<circle cx="45" cy="55" r="8" fill="%23374151" stroke="%23111827" stroke-width="2"/>' +
    '<path d="M45 49v12M39 55h12" stroke="%239ca3af" stroke-width="1.5"/>' +
    '<circle cx="24" cy="64" r="3" fill="%23ef4444"/>' +
    '<circle cx="66" cy="64" r="3" fill="%23111827"/>'
  ),
  IC_555_TIMER: svg('0 0 90 50',
    '<rect x="12" y="6" width="66" height="38" rx="4" fill="%23111827" stroke="%23374151" stroke-width="2"/>' +
    '<circle cx="45" cy="6" r="3" fill="%23374151"/>' +
    '<text x="45" y="29" font-size="13" fill="%23e5e7eb" text-anchor="middle" font-family="Arial" font-weight="bold">NE555</text>' +
    '<path d="M8 12h8M8 20h8M8 28h8M8 36h8M74 12h8M74 20h8M74 28h8M74 36h8" stroke="%23cbd5e1" stroke-width="3"/>'
  ),
  IC_74HC595: svg('0 0 120 50',
    '<rect x="12" y="6" width="96" height="38" rx="4" fill="%23111827" stroke="%23374151" stroke-width="2"/>' +
    '<circle cx="60" cy="6" r="3" fill="%23374151"/>' +
    '<text x="60" y="29" font-size="12" fill="%23e5e7eb" text-anchor="middle" font-family="Arial" font-weight="bold">74HC595</text>' +
    '<path d="M7 11h8M7 17h8M7 23h8M7 29h8M7 35h8M105 11h8M105 17h8M105 23h8M105 29h8M105 35h8" stroke="%23cbd5e1" stroke-width="3"/>'
  ),
};

// Default dimensions for each component type (width x height)
// These MUST match the SVG viewBox and pin coordinates in pinRegistry.ts
export const componentDimensions: Record<string, { w: number; h: number }> = {
  // Boards
  ARDUINO_UNO: { w: 200, h: 150 },
  ARDUINO_MEGA: { w: 340, h: 170 },
  ARDUINO_NANO: { w: 100, h: 160 },
  ESP32: { w: 100, h: 160 },
  ESP32_S3: { w: 100, h: 160 },
  ESP8266: { w: 100, h: 160 },

  // Passives
  RESISTOR: { w: 80, h: 40 },
  CAPACITOR: { w: 60, h: 50 },
  POTENTIOMETER: { w: 50, h: 50 },
  MULTIMETER: { w: 90, h: 70 },
  IC_555_TIMER: { w: 90, h: 50 },
  IC_74HC595: { w: 120, h: 50 },

  // LEDs
  LED_STANDARD: { w: 50, h: 50 },
  LED_RGB: { w: 56, h: 60 },
  LED_NEOPIXEL: { w: 60, h: 20 },

  // Input
  PUSH_BUTTON: { w: 40, h: 40 },
  BUTTON: { w: 40, h: 40 },

  // Output
  BUZZER: { w: 50, h: 50 },
  SERVO_MOTOR: { w: 70, h: 50 },
  MOTOR_SERVO: { w: 70, h: 50 },
  MOTOR_DC: { w: 70, h: 50 },
  STEPPER_MOTOR: { w: 70, h: 70 },
  MOTOR_STEPPER: { w: 70, h: 70 },
  RELAY_SPDT: { w: 60, h: 60 },
  RELAY_SINGLE: { w: 60, h: 60 },
  RELAY_4CH: { w: 120, h: 50 },

  // Sensors
  TEMP_SENSOR: { w: 50, h: 50 },
  SENSOR_DHT11: { w: 60, h: 80 },
  SENSOR_DHT22: { w: 50, h: 50 },
  ULTRASONIC_SENSOR: { w: 60, h: 60 },
  SENSOR_ULTRASONIC: { w: 60, h: 60 },
  PIR_SENSOR: { w: 50, h: 50 },
  SENSOR_PIR: { w: 50, h: 50 },
  LDR: { w: 40, h: 30 },
  SENSOR_LDR: { w: 40, h: 30 },
  SOIL_MOISTURE: { w: 40, h: 50 },
  IR_RECEIVER: { w: 40, h: 40 },
  SENSOR_IMU: { w: 60, h: 60 },

  // Displays
  LCD_16X2: { w: 170, h: 60 },
  DISPLAY_LCD_I2C: { w: 170, h: 60 },
  OLED_DISPLAY: { w: 60, h: 60 },
  DISPLAY_OLED: { w: 60, h: 60 },
  DISPLAY_7SEG: { w: 50, h: 70 },

  // Communication
  BLUETOOTH_MODULE: { w: 60, h: 50 },
  WIFI_MODULE: { w: 60, h: 50 },

  // Other
  BREADBOARD: { w: 300, h: 100 },
};
