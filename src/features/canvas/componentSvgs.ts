// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Realistic SVG Component Library
// Maps component TYPE from DB seed to inline SVG data URIs
// ═══════════════════════════════════════════════════════════════════════════

import { BOARD_CATALOG, BOARD_FOOTPRINT_DIMENSIONS } from './boardCatalog';

const svg = (vb: string, body: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

const svgText = (value: string) => encodeURIComponent(value);

const familyPalette: Record<string, { body: string; accent: string; text: string }> = {
  Arduino: { body: '0d6ebd', accent: 'e5f6fb', text: 'ffffff' },
  ESP8266: { body: '1f2937', accent: 'f59e0b', text: 'd1fae5' },
  ESP32: { body: '111827', accent: '10b981', text: 'd1fae5' },
  'Raspberry Pi Pico': { body: '047857', accent: 'f8fafc', text: 'ecfdf5' },
  'Raspberry Pi SBC': { body: 'be123c', accent: 'facc15', text: 'ffffff' },
  STM32: { body: '1d4ed8', accent: 'dbeafe', text: 'ffffff' },
  Teensy: { body: '7c3aed', accent: 'fef3c7', text: 'ffffff' },
  'BBC micro:bit': { body: '111827', accent: 'fbbf24', text: 'ffffff' },
  'Seeed XIAO': { body: '0f766e', accent: 'ccfbf1', text: 'ffffff' },
  'Adafruit Feather': { body: 'b91c1c', accent: 'fde68a', text: 'ffffff' },
  'SparkFun Thing Plus': { body: 'c2410c', accent: 'fed7aa', text: 'ffffff' },
  Particle: { body: '0284c7', accent: 'e0f2fe', text: 'ffffff' },
  BeagleBone: { body: '334155', accent: 'fbbf24', text: 'ffffff' },
  ODROID: { body: '991b1b', accent: 'bfdbfe', text: 'ffffff' },
  'Orange Pi': { body: 'ea580c', accent: 'ffedd5', text: 'ffffff' },
  'Banana Pi': { body: 'ca8a04', accent: 'fef3c7', text: '111827' },
  NanoPi: { body: '475569', accent: 'bae6fd', text: 'ffffff' },
  Jetson: { body: '166534', accent: 'bbf7d0', text: 'ffffff' },
  Coral: { body: '0e7490', accent: 'cffafe', text: 'ffffff' },
  Intel: { body: '1e40af', accent: 'dbeafe', text: 'ffffff' },
  'Texas Instruments': { body: 'b91c1c', accent: 'fecaca', text: 'ffffff' },
  NXP: { body: '0f766e', accent: 'ccfbf1', text: 'ffffff' },
  Microchip: { body: '7f1d1d', accent: 'fee2e2', text: 'ffffff' },
  'Atmel AVR': { body: '374151', accent: 'facc15', text: 'ffffff' },
  Nordic: { body: '1d4ed8', accent: 'bfdbfe', text: 'ffffff' },
  'Silicon Labs': { body: '0f172a', accent: '93c5fd', text: 'ffffff' },
  Infineon: { body: '0369a1', accent: 'bae6fd', text: 'ffffff' },
  Renesas: { body: '4338ca', accent: 'ddd6fe', text: 'ffffff' },
  CH32: { body: '155e75', accent: 'a5f3fc', text: 'ffffff' },
  'RISC-V': { body: '7c2d12', accent: 'fed7aa', text: 'ffffff' },
};

const boardSvg = (type: string, name: string, family: string, footprint: string) => {
  const dim = BOARD_FOOTPRINT_DIMENSIONS[footprint as keyof typeof BOARD_FOOTPRINT_DIMENSIONS] || { w: 120, h: 80 };

  // Solder mask theme
  let pcbTop = '008184';
  let pcbBottom = '005f63';
  let pcbBorder = '004649';
  let silkColor = 'ffffff';

  if (type.includes('R4') || type === 'ARDUINO_PORTENTA_H7' || type.includes('GIGA')) {
    pcbTop = '0f172a';
    pcbBottom = '090d16';
    pcbBorder = '1e293b';
    silkColor = '38bdf8';
  } else if (family === 'ESP32') {
    pcbTop = '18181b';
    pcbBottom = '09090b';
    pcbBorder = '27272a';
    silkColor = '10b981';
  } else if (family === 'ESP8266') {
    pcbTop = '1e293b';
    pcbBottom = '0f172a';
    pcbBorder = '334155';
    silkColor = '38bdf8';
  } else if (family === 'Raspberry Pi Pico') {
    pcbTop = '047857';
    pcbBottom = '064e3b';
    pcbBorder = '065f46';
    silkColor = 'ffffff';
  } else if (family === 'STM32') {
    if (type.includes('BLACK')) {
      pcbTop = '18181b';
      pcbBottom = '09090b';
      pcbBorder = '27272a';
      silkColor = 'facc15';
    } else {
      pcbTop = '1d4ed8';
      pcbBottom = '1e3a8a';
      pcbBorder = '172554';
      silkColor = 'ffffff';
    }
  } else if (family === 'Teensy') {
    pcbTop = '581c87';
    pcbBottom = '3b0764';
    pcbBorder = '4c1d95';
    silkColor = 'fef08a';
  } else if (family === 'Seeed XIAO') {
    pcbTop = '0f766e';
    pcbBottom = '115e59';
    pcbBorder = '134e4a';
    silkColor = 'ffffff';
  } else if (family === 'Adafruit Feather') {
    pcbTop = '18181b';
    pcbBottom = '09090b';
    pcbBorder = '27272a';
    silkColor = 'fde68a';
  } else if (family === 'SparkFun Thing Plus') {
    pcbTop = 'b91c1c';
    pcbBottom = '7f1d1d';
    pcbBorder = '991b1b';
    silkColor = 'ffffff';
  } else if (family === 'Atmel AVR') {
    pcbTop = '1e293b';
    pcbBottom = '0f172a';
    pcbBorder = '334155';
    silkColor = 'd4d4d8';
  }

  // DIP packages (avr28, attiny8)
  if (footprint === 'avr28' || footprint === 'attiny8') {
    const isAvr28 = footprint === 'avr28';
    const numPinsPerSide = isAvr28 ? 14 : 4;
    const bodyW = dim.w - 16;
    const bodyH = dim.h - 16;
    const pinStep = bodyW / (numPinsPerSide + 0.5);
    const pinStartX = 8 + pinStep * 0.75;
    const pinW = 3;
    const topPins = Array.from({ length: numPinsPerSide }, (_, i) => {
      const px = pinStartX + i * pinStep;
      return `<rect x="${(px - pinW / 2).toFixed(1)}" y="0" width="${pinW}" height="8" rx="0.5" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.3"/><circle cx="${px.toFixed(1)}" cy="1.5" r="1.1" fill="%230f172a"/>`;
    }).join('');
    const bottomPins = Array.from({ length: numPinsPerSide }, (_, i) => {
      const px = pinStartX + i * pinStep;
      return `<rect x="${(px - pinW / 2).toFixed(1)}" y="${dim.h - 8}" width="${pinW}" height="8" rx="0.5" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.3"/><circle cx="${px.toFixed(1)}" cy="${dim.h - 1.5}" r="1.1" fill="%230f172a"/>`;
    }).join('');

    const labelName = isAvr28 ? 'ATMEGA328P-PU' : 'ATTINY85-20PU';
    return svg(`0 0 ${dim.w} ${dim.h}`,
      '<defs>' +
        `<linearGradient id="dip_${type}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23${pcbTop}"/><stop offset="100%25" stop-color="%23${pcbBottom}"/></linearGradient>` +
      '</defs>' +
      topPins +
      bottomPins +
      `<rect x="8" y="8" width="${bodyW}" height="${bodyH}" rx="2" fill="url(%23dip_${type})" stroke="%23${pcbBorder}" stroke-width="0.8"/>` +
      `<path d="M 8 ${dim.h / 2 - 5} A 5 5 0 0 1 8 ${dim.h / 2 + 5} Z" fill="%2309090b"/>` +
      `<circle cx="16" cy="${dim.h - 14}" r="1.6" fill="%2309090b" stroke="%23475569" stroke-width="0.3"/>` +
      `<text x="${dim.w / 2}" y="${dim.h / 2 - 2}" font-size="${isAvr28 ? 6.5 : 5.5}" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">${labelName}</text>` +
      `<text x="${dim.w / 2}" y="${dim.h / 2 + 8}" font-size="${isAvr28 ? 4 : 3.5}" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ATMEL AVR MCU</text>`
    );
  }

  const isUnoShield = footprint === 'uno' || footprint === 'mega';
  const isUsbC = type.includes('R4') || type.includes('C3') || type.includes('S3') || type.includes('S2') || type.includes('RP2040') || type.includes('BLACK') || footprint === 'xiao';
  const isMicroUsb = !isUsbC && (type === 'ARDUINO_LEONARDO' || type === 'ARDUINO_MICRO' || type.includes('NANO') || type === 'ARDUINO_DUE' || footprint === 'esp8266' || family === 'Teensy' || footprint === 'feather' || type === 'STM32_BLUE_PILL');
  const isRFShield = family === 'ESP32' || family === 'ESP8266' || type.includes('PICO_W') || type.includes('33_IOT');

  // Multi-layer ground plane traces
  const copperTraces = `<rect x="5" y="5" width="${dim.w - 10}" height="${dim.h - 10}" rx="3.5" fill="none" stroke="%23${silkColor}" stroke-width="0.5" opacity="0.18"/>` +
    `<rect x="9" y="9" width="${dim.w - 18}" height="${dim.h - 18}" rx="2.5" fill="none" stroke="%23${silkColor}" stroke-width="0.35" opacity="0.12"/>`;

  // Annular ENIG mounting holes
  const mHoles = footprint === 'xiao' || (footprint === 'esp8266' && type === 'ESP8266_ESP01') ? '' :
    `<circle cx="12" cy="12" r="4.2" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.5"/><circle cx="12" cy="12" r="2.2" fill="%230f172a"/>` +
    `<circle cx="${dim.w - 12}" cy="12" r="4.2" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.5"/><circle cx="${dim.w - 12}" cy="12" r="2.2" fill="%230f172a"/>` +
    `<circle cx="12" cy="${dim.h - 12}" r="4.2" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.5"/><circle cx="12" cy="${dim.h - 12}" r="2.2" fill="%230f172a"/>` +
    `<circle cx="${dim.w - 12}" cy="${dim.h - 12}" r="4.2" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.5"/><circle cx="${dim.w - 12}" cy="${dim.h - 12}" r="2.2" fill="%230f172a"/>`;

  // Connectors
  let connectorSvg = '';
  if (isUnoShield) {
    if (isUsbC) {
      connectorSvg = `<rect x="0" y="24" width="24" height="15" rx="3" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.8"/>` +
        `<rect x="0" y="26.5" width="14" height="10" rx="2" fill="%23090d16"/>` +
        `<rect x="2" y="30.5" width="8" height="2" fill="%23f59e0b"/>` +
        `<rect x="0" y="85" width="28" height="26" rx="2.5" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>` +
        `<circle cx="6" cy="98" r="4.5" fill="%2394a3b8"/><circle cx="6" cy="98" r="2" fill="%230f172a"/>`;
    } else if (isMicroUsb) {
      connectorSvg = `<rect x="0" y="25" width="20" height="13" rx="1.5" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.8"/>` +
        `<rect x="0" y="27.5" width="11" height="8" rx="1" fill="%23090d16"/>` +
        `<rect x="2" y="30.5" width="6" height="2" fill="%23f59e0b"/>` +
        `<rect x="0" y="85" width="28" height="26" rx="2.5" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>` +
        `<circle cx="6" cy="98" r="4.5" fill="%2394a3b8"/><circle cx="6" cy="98" r="2" fill="%230f172a"/>`;
    } else {
      connectorSvg = `<rect x="0" y="22" width="26" height="24" rx="2" fill="%23cbd5e1" stroke="%23475569" stroke-width="0.8"/>` +
        `<rect x="0" y="25" width="15" height="18" rx="1.5" fill="%23090d16"/>` +
        `<rect x="2" y="29" width="8" height="2" fill="%23f59e0b"/><rect x="2" y="33" width="8" height="2" fill="%23f59e0b"/><rect x="2" y="37" width="8" height="2" fill="%23f59e0b"/>` +
        `<rect x="0" y="85" width="28" height="26" rx="2.5" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>` +
        `<circle cx="6" cy="98" r="4.5" fill="%2394a3b8"/><circle cx="6" cy="98" r="2" fill="%230f172a"/>`;
    }
  } else {
    const cx = (dim.w - (isUsbC ? 26 : 20)) / 2;
    if (isUsbC) {
      connectorSvg = `<rect x="${cx.toFixed(1)}" y="0" width="26" height="12" rx="3" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.8"/>` +
        `<rect x="${(cx + 3).toFixed(1)}" y="0" width="20" height="5" rx="1.5" fill="%23090d16"/>` +
        `<rect x="${(cx + 6).toFixed(1)}" y="2" width="14" height="1.5" rx="0.5" fill="%23f59e0b"/>`;
    } else {
      connectorSvg = `<rect x="${cx.toFixed(1)}" y="0" width="20" height="10" rx="1.5" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.8"/>` +
        `<rect x="${(cx + 3).toFixed(1)}" y="0" width="14" height="4.5" rx="1" fill="%23090d16"/>` +
        `<rect x="${(cx + 5).toFixed(1)}" y="1.5" width="10" height="1.5" rx="0.5" fill="%23f59e0b"/>`;
    }
  }

  // Specific IC and module artwork
  let icSvg = '';
  if (type.includes('R4')) {
    // Uno R4: Renesas RA4M1 LQFP-64 + 12x8 LED Matrix area
    icSvg = `<rect x="92" y="66" width="34" height="34" rx="2" fill="%2318181b" stroke="%23334155" stroke-width="0.8"/>` +
      `<circle cx="96" cy="70" r="1.2" fill="%233f3f46"/>` +
      Array.from({ length: 8 }, (_, i) => {
        const px = 94 + i * 4;
        return `<rect x="${px}" y="63" width="1.5" height="3" fill="%23cbd5e1"/><rect x="${px}" y="100" width="1.5" height="3" fill="%23cbd5e1"/>`;
      }).join('') +
      Array.from({ length: 8 }, (_, i) => {
        const py = 68 + i * 4;
        return `<rect x="89" y="${py}" width="3" height="1.5" fill="%23cbd5e1"/><rect x="126" y="${py}" width="3" height="1.5" fill="%23cbd5e1"/>`;
      }).join('') +
      `<text x="109" y="81" font-size="4.5" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">RA4M1</text>` +
      `<text x="109" y="87" font-size="2.8" fill="%2338bdf8" font-family="Arial" text-anchor="middle">RENESAS</text>` +
      // 12x8 LED Matrix grid (iconic to Uno R4!)
      `<rect x="140" y="44" width="48" height="34" rx="1.5" fill="%23090d16" stroke="%23334155" stroke-width="0.6"/>` +
      Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 12 }, (_, c) =>
          `<rect x="${142 + c * 3.8}" y="${46 + r * 4}" width="2.4" height="2.2" rx="0.3" fill="%23ca8a04"/><circle cx="${143.2 + c * 3.8}" cy="${47.1 + r * 4}" r="0.4" fill="%23fef08a"/>`
        ).join('')
      ).join('') +
      `<text x="164" y="84" font-size="3" fill="%2338bdf8" font-family="Arial" font-weight="bold" text-anchor="middle">12x8 MATRIX</text>`;
  } else if (type === 'ARDUINO_LEONARDO') {
    // Leonardo: ATmega32U4 rotated 45 degrees
    icSvg = `<g transform="translate(130, 75) rotate(45)">` +
      `<rect x="-18" y="-18" width="36" height="36" rx="2" fill="%2318181b" stroke="%23334155" stroke-width="0.8"/>` +
      `<circle cx="-14" cy="-14" r="1.2" fill="%233f3f46"/>` +
      Array.from({ length: 6 }, (_, i) => {
        const p = -12 + i * 5;
        return `<rect x="${p}" y="-21" width="2" height="3" fill="%23cbd5e1"/><rect x="${p}" y="18" width="2" height="3" fill="%23cbd5e1"/>` +
          `<rect x="-21" y="${p}" width="3" height="2" fill="%23cbd5e1"/><rect x="18" y="${p}" width="3" height="2" fill="%23cbd5e1"/>`;
      }).join('') +
      `<text x="0" y="-2" font-size="4.2" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">32U4</text>` +
      `<text x="0" y="5" font-size="2.6" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ATMEL</text>` +
      `</g>` +
      // ICSP 6-pin header
      `<rect x="176" y="70" width="10" height="15" rx="1" fill="%2318181b"/>` +
      Array.from({ length: 6 }, (_, i) => `<circle cx="${179 + (i % 2) * 4}" cy="${73 + Math.floor(i / 2) * 4.5}" r="1.2" fill="%23f59e0b"/>`).join('');
  } else if (type === 'ESP8266_ESP01') {
    // ESP-01: Black PCB, gold antenna at top, 2x4 pin header at bottom
    icSvg = `<rect x="8" y="10" width="${dim.w - 16}" height="32" rx="1" fill="%230f172a"/>` +
      // Golden meander antenna trace
      `<path d="M 12 14 L 30 14 L 30 20 L 16 20 L 16 26 L 40 26 L 40 14 L 60 14 L 60 26 L 75 26" fill="none" stroke="%23ca8a04" stroke-width="1.8" stroke-linecap="round"/>` +
      // ESP8266EX chip
      `<rect x="16" y="50" width="28" height="28" rx="1.5" fill="%2318181b" stroke="%23334155" stroke-width="0.6"/>` +
      `<text x="30" y="65" font-size="4" fill="%23e2e8f0" font-family="Arial" font-weight="bold" text-anchor="middle">ESP8266</text>` +
      // 25Q40 flash chip
      `<rect x="52" y="52" width="22" height="18" rx="1" fill="%2318181b" stroke="%23334155" stroke-width="0.6"/>` +
      `<text x="63" y="63" font-size="3" fill="%2394a3b8" font-family="Arial" text-anchor="middle">25Q40</text>` +
      // 2x4 male header at bottom
      `<rect x="25" y="${dim.h - 32}" width="45" height="22" rx="1.5" fill="%2309090b" stroke="%2327272a" stroke-width="0.8"/>` +
      Array.from({ length: 8 }, (_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return `<rect x="${29 + col * 10}" y="${dim.h - 28 + row * 10}" width="4" height="4" fill="%23ca8a04"/><circle cx="${31 + col * 10}" cy="${dim.h - 26 + row * 10}" r="1.2" fill="%23fef08a"/>`;
      }).join('');
  } else if (isRFShield) {
    // RF Shield module
    const rw = Math.min(64, dim.w - 24);
    const rh = Math.min(46, dim.h * 0.32);
    const rx = (dim.w - rw) / 2;
    const ry = isUnoShield ? 48 : 22;
    icSvg = `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="2" fill="%23374151" stroke="%234b5563" stroke-width="0.8"/>` +
      `<rect x="${rx + 4}" y="${ry + 3}" width="${rw - 8}" height="8" rx="1" fill="%23111827"/>` +
      `<path d="M ${rx + 10} ${ry + 5} L ${rx + rw - 10} ${ry + 5}" stroke="%23eab308" stroke-width="0.8" stroke-dasharray="2,2"/>` +
      `<text x="${dim.w / 2}" y="${ry + 22}" font-size="4.5" fill="%23e5e7eb" font-family="Arial" font-weight="bold" text-anchor="middle">${svgText(name)}</text>` +
      `<text x="${dim.w / 2}" y="${ry + 30}" font-size="3" fill="%239ca3af" font-family="Arial" text-anchor="middle">Wi-Fi / Espressif</text>`;
  } else {
    const qw = Math.min(48, Math.round(dim.w * 0.38));
    const qh = qw;
    const qx = isUnoShield ? 90 : (dim.w - qw) / 2;
    const qy = isUnoShield ? 52 : Math.round(dim.h * 0.36);
    icSvg = `<rect x="${qx}" y="${qy}" width="${qw}" height="${qh}" rx="2" fill="%2318181b" stroke="%23334155" stroke-width="0.8"/>` +
      `<circle cx="${qx + 4}" cy="${qy + 4}" r="1.2" fill="%233f3f46"/>` +
      Array.from({ length: 6 }, (_, i) => {
        const step = (qw - 8) / 5;
        const px = qx + 4 + i * step;
        return `<rect x="${(px - 0.7).toFixed(1)}" y="${qy - 2}" width="1.4" height="2" fill="%23cbd5e1"/><rect x="${(px - 0.7).toFixed(1)}" y="${qy + qh}" width="1.4" height="2" fill="%23cbd5e1"/>`;
      }).join('') +
      Array.from({ length: 6 }, (_, i) => {
        const step = (qh - 8) / 5;
        const py = qy + 4 + i * step;
        return `<rect x="${qx - 2}" y="${(py - 0.7).toFixed(1)}" width="2" height="1.4" fill="%23cbd5e1"/><rect x="${qx + qw}" y="${(py - 0.7).toFixed(1)}" width="2" height="1.4" fill="%23cbd5e1"/>`;
      }).join('') +
      `<text x="${qx + qw / 2}" y="${qy + qh / 2 - 2}" font-size="${Math.max(3.2, Math.min(5, qw / 8))}" fill="%23e2e8f0" font-family="Arial" font-weight="bold" text-anchor="middle">${svgText(name.replace(/^Arduino\s+/i, ''))}</text>` +
      `<text x="${qx + qw / 2}" y="${qy + qh / 2 + 6}" font-size="2.8" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ARM / MCU</text>`;
  }

  // Header sockets
  let headersSvg = '';
  if (isUnoShield) {
    const numTop = Math.round(dim.w / 11);
    const numBot = Math.round(dim.w / 13);
    headersSvg = `<rect x="8" y="2" width="${dim.w - 16}" height="8.5" rx="1.2" fill="%2318181b" stroke="%2327272a" stroke-width="0.7"/>` +
      Array.from({ length: numTop }, (_, i) => {
        const hx = 14 + i * ((dim.w - 28) / (numTop - 1));
        return `<rect x="${(hx - 1.5).toFixed(1)}" y="3.5" width="3" height="3.5" rx="0.4" fill="%2309090b"/><circle cx="${hx.toFixed(1)}" cy="5.25" r="0.8" fill="%23f59e0b" opacity="0.6"/>`;
      }).join('') +
      `<rect x="8" y="${dim.h - 10.5}" width="${dim.w - 16}" height="8.5" rx="1.2" fill="%2318181b" stroke="%2327272a" stroke-width="0.7"/>` +
      Array.from({ length: numBot }, (_, i) => {
        const hx = 14 + i * ((dim.w - 28) / (numBot - 1));
        return `<rect x="${(hx - 1.5).toFixed(1)}" y="${dim.h - 9}" width="3" height="3.5" rx="0.4" fill="%2309090b"/><circle cx="${hx.toFixed(1)}" cy="${dim.h - 7.25}" r="0.8" fill="%23f59e0b" opacity="0.6"/>`;
      }).join('');
  } else if (type !== 'ESP8266_ESP01') {
    const pinCount = Math.max(7, Math.min(22, Math.round((dim.h - 32) / 8.5)));
    const step = (dim.h - 32) / (pinCount - 1);
    headersSvg = `<rect x="1" y="10" width="8" height="${dim.h - 20}" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.7"/>` +
      Array.from({ length: pinCount }, (_, i) => {
        const hy = 16 + i * step;
        return `<rect x="2.5" y="${(hy - 1.5).toFixed(1)}" width="3.5" height="3" rx="0.4" fill="%2309090b"/><circle cx="4.25" cy="${hy.toFixed(1)}" r="0.8" fill="%23f59e0b" opacity="0.6"/>`;
      }).join('') +
      `<rect x="${dim.w - 9}" y="10" width="8" height="${dim.h - 20}" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.7"/>` +
      Array.from({ length: pinCount }, (_, i) => {
        const hy = 16 + i * step;
        return `<rect x="${dim.w - 6}" y="${(hy - 1.5).toFixed(1)}" width="3.5" height="3" rx="0.4" fill="%23090b"/><circle cx="${dim.w - 4.25}" cy="${hy.toFixed(1)}" r="0.8" fill="%23f59e0b" opacity="0.6"/>`;
      }).join('');
  }

  // Reset button, status LEDs, and quartz crystal
  const rstX = isUnoShield ? 38 : 16;
  const rstY = isUnoShield ? 16 : (dim.h - 24);
  const miscComponents = `<rect x="${rstX}" y="${rstY}" width="8" height="8" rx="1.5" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/>` +
    `<circle cx="${rstX + 4}" cy="${rstY + 4}" r="2.2" fill="%23ef4444"/>` +
    `<rect x="${rstX + 10}" y="${rstY + 2}" width="3" height="2" rx="0.4" fill="%23ef4444"/><circle cx="${rstX + 11.5}" cy="${rstY + 3}" r="0.5" fill="%23fca5a5"/>` +
    `<rect x="${rstX + 15}" y="${rstY + 2}" width="3" height="2" rx="0.4" fill="%2322c55e"/><circle cx="${rstX + 16.5}" cy="${rstY + 3}" r="0.5" fill="%2386efac"/>` +
    `<rect x="${rstX + 22}" y="${rstY + 1}" width="12" height="6" rx="3" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>` +
    `<text x="${rstX + 28}" y="${rstY + 5}" font-size="2.4" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">16.0</text>`;

  return svg(`0 0 ${dim.w} ${dim.h}`,
    '<defs>' +
      `<linearGradient id="pcb_${type}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23${pcbTop}"/><stop offset="100%25" stop-color="%23${pcbBottom}"/></linearGradient>` +
    '</defs>' +
    `<rect width="${dim.w}" height="${dim.h}" rx="5" fill="url(%23pcb_${type})" stroke="%23${pcbBorder}" stroke-width="1.2"/>` +
    copperTraces +
    mHoles +
    connectorSvg +
    icSvg +
    headersSvg +
    miscComponents +
    `<text x="${dim.w / 2}" y="${dim.h - 10}" font-size="${Math.max(5, Math.min(8.5, dim.w / 14))}" fill="%23${silkColor}" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="0.5">${svgText(name)}</text>`
  );
};

const boardComponentSvgs = Object.fromEntries(
  BOARD_CATALOG.map((boardItem) => [
    boardItem.type,
    boardSvg(boardItem.type, boardItem.name, boardItem.family, boardItem.footprint),
  ]),
);

const boardComponentDimensions = Object.fromEntries(
  BOARD_CATALOG.map((boardItem) => [
    boardItem.type,
    BOARD_FOOTPRINT_DIMENSIONS[boardItem.footprint],
  ]),
);

const ledSvg = (gradientId: string, s1: string, s2: string, s3: string) => svg('0 0 40 80',
  '<defs>' +
    '<linearGradient id="led_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    `<linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23${s1}" stop-opacity="0.95"/><stop offset="35%25" stop-color="%23${s2}" stop-opacity="0.85"/><stop offset="100%25" stop-color="%23${s3}" stop-opacity="0.95"/></linearGradient>` +
  '</defs>' +
  '<path d="M 15 42 L 15 50 L 14 53 L 14 57 L 15 60 L 15 80 L 17.2 80 L 17.2 60 L 16.2 57 L 16.2 53 L 17.2 50 L 17.2 42 Z" fill="url(%23led_lead)"/>' +
  '<path d="M 23 42 L 23 80 L 25.2 80 L 25.2 42 Z" fill="url(%23led_lead)"/>' +
  '<rect x="15" y="27" width="2.2" height="15" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.4"/>' +
  '<path d="M 22.8 42 L 22.8 28 L 20 24 L 25.5 24 L 25 42 Z" fill="%23e2e8f0" stroke="%2394a3b8" stroke-width="0.4"/>' +
  '<rect x="21.5" y="24" width="2" height="1.8" fill="%23fbbf24"/>' +
  '<path d="M 16.5 27 Q 18.5 20.5 22 24" fill="none" stroke="%23f59e0b" stroke-width="0.6" stroke-linecap="round"/>' +
  `<path d="M 7 38 L 7 42 L 31 42 L 31 38 Z" fill="url(%23${gradientId})" stroke="%23${s3}" stroke-width="0.6"/>` +
  `<line x1="31" y1="38" x2="31" y2="42" stroke="%23${s1}" stroke-width="1.2"/>` +
  `<path d="M 9 24 C 9 13.5 13.5 8 20 8 C 26.5 8 31 13.5 31 24 L 31 38 L 9 38 Z" fill="url(%23${gradientId})" stroke="%23${s3}" stroke-width="0.8"/>` +
  '<path d="M 13 15 C 15 11 18 9.5 22 9.5" fill="none" stroke="%23ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>' +
  '<ellipse cx="14" cy="22" rx="1.5" ry="5" fill="%23ffffff" opacity="0.4"/>'
);

const dip14Svg = (partNumber: string, subtitle: string) => svg('0 0 110 50',
  '<defs>' +
    '<linearGradient id="dip14_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '<linearGradient id="dip14_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
  '</defs>' +
  [16, 30, 44, 58, 72, 86, 100].map((x) =>
    `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip14_lead)"/>` +
    `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
    `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
  ).join('') +
  [16, 30, 44, 58, 72, 86, 100].map((x) =>
    `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip14_lead)"/>` +
    `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
    `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
  ).join('') +
  '<rect x="8" y="11" width="94" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
  '<rect x="8" y="10" width="94" height="30" rx="2.5" fill="url(%23dip14_body)" stroke="%23334155" stroke-width="0.75"/>' +
  '<line x1="10" y1="11" x2="100" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
  '<line x1="10" y1="39" x2="100" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
  '<path d="M 8 20 A 5 5 0 0 1 8 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
  '<circle cx="15" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/><circle cx="15" cy="33" r="0.9" fill="%231e293b"/>' +
  '<text x="20" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">TI</text>' +
  `<text x="55" y="26" font-size="8.5" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.8">${partNumber}</text>` +
  `<text x="55" y="34" font-size="4" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">${subtitle}</text>`
);

const additionalComponentSvgs: Record<string, string> = {
  INDUCTOR: svg('0 0 90 24',
    '<defs>' +
      '<linearGradient id="ind_lead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="ind_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%235eead4"/><stop offset="35%25" stop-color="%2314b8a6"/><stop offset="85%25" stop-color="%230f766e"/><stop offset="100%25" stop-color="%23115e59"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="10.5" width="23" height="3" rx="0.5" fill="url(%23ind_lead)"/>' +
    '<rect x="67" y="10.5" width="23" height="3" rx="0.5" fill="url(%23ind_lead)"/>' +
    '<circle cx="0.5" cy="12" r="1.5" fill="%2364748b"/><circle cx="89.5" cy="12" r="1.5" fill="%2364748b"/>' +
    '<path d="M 23 7 C 23 4.5 25 3.5 27 3.5 L 63 3.5 C 65 3.5 67 4.5 67 7 L 67 17 C 67 19.5 65 20.5 63 20.5 L 27 20.5 C 25 20.5 23 19.5 23 17 Z" fill="url(%23ind_body)" stroke="%23042f2e" stroke-width="0.75"/>' +
    '<rect x="21" y="4" width="6" height="16" rx="2" fill="url(%23ind_body)" stroke="%23042f2e" stroke-width="0.6"/>' +
    '<rect x="63" y="4" width="6" height="16" rx="2" fill="url(%23ind_body)" stroke="%23042f2e" stroke-width="0.6"/>' +
    '<rect x="29" y="3.5" width="4.5" height="17" fill="%2378350f"/>' +
    '<rect x="39" y="3.5" width="4.5" height="17" fill="%230f172a"/>' +
    '<rect x="49" y="3.5" width="4.5" height="17" fill="%23dc2626"/>' +
    '<rect x="59" y="3.5" width="3.5" height="17" fill="%23cbd5e1"/>' +
    '<path d="M 24 5.5 L 66 5.5" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>'
  ),
  TRANSFORMER: svg('0 0 100 70',
    '<defs>' +
      '<linearGradient id="trans_iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2364748b"/><stop offset="50%25" stop-color="%23334155"/><stop offset="100%25" stop-color="%231e293b"/></linearGradient>' +
      '<linearGradient id="trans_tape" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23fef08a"/><stop offset="50%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23ca8a04"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="16.5" width="22" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="18" r="1.5" fill="%23475569"/>' +
    '<rect x="0" y="50.5" width="22" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="52" r="1.5" fill="%23475569"/>' +
    '<rect x="78" y="16.5" width="22" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="99.5" cy="18" r="1.5" fill="%23475569"/>' +
    '<rect x="78" y="50.5" width="22" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="99.5" cy="52" r="1.5" fill="%23475569"/>' +
    '<rect x="18" y="6" width="64" height="58" rx="4" fill="url(%23trans_iron)" stroke="%231e293b" stroke-width="1"/>' +
    '<rect x="26" y="12" width="48" height="46" rx="3" fill="url(%23trans_tape)" stroke="%23854d0e" stroke-width="0.8"/>' +
    '<rect x="34" y="8" width="32" height="54" rx="2" fill="url(%23trans_iron)" stroke="%230f172a" stroke-width="0.8"/>' +
    '<line x1="38" y1="12" x2="62" y2="12" stroke="%23475569" stroke-width="0.8"/>' +
    '<line x1="38" y1="58" x2="62" y2="58" stroke="%23475569" stroke-width="0.8"/>' +
    '<text x="50" y="32" font-size="6" fill="%23451a03" font-family="Arial" font-weight="bold" text-anchor="middle">PRI 230V</text>' +
    '<text x="50" y="42" font-size="6" fill="%23451a03" font-family="Arial" font-weight="bold" text-anchor="middle">SEC 12V</text>'
  ),
  ZENER_DIODE: svg('0 0 72 28',
    '<defs>' +
      '<linearGradient id="zen_lead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="zen_glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23fdba74" stop-opacity="0.9"/><stop offset="35%25" stop-color="%23fb923c" stop-opacity="0.85"/><stop offset="100%25" stop-color="%23c2410c" stop-opacity="0.95"/></linearGradient>' +
      '<linearGradient id="zen_slug" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23fed7aa"/><stop offset="50%25" stop-color="%23f97316"/><stop offset="100%25" stop-color="%239a3412"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="12.5" width="22" height="3" rx="0.5" fill="url(%23zen_lead)"/>' +
    '<circle cx="0.5" cy="14" r="1.5" fill="%2364748b"/>' +
    '<rect x="50" y="12.5" width="22" height="3" rx="0.5" fill="url(%23zen_lead)"/>' +
    '<circle cx="71.5" cy="14" r="1.5" fill="%2364748b"/>' +
    '<rect x="23" y="10" width="7" height="8" rx="1" fill="url(%23zen_slug)"/>' +
    '<rect x="42" y="10" width="7" height="8" rx="1" fill="url(%23zen_slug)"/>' +
    '<rect x="33" y="12" width="6" height="4" rx="0.5" fill="%231e293b"/>' +
    '<rect x="20" y="7" width="32" height="14" rx="4" fill="url(%23zen_glass)" stroke="%23ea580c" stroke-width="0.75"/>' +
    '<rect x="43" y="7" width="4.5" height="14" fill="%230f172a" opacity="0.9"/>' +
    '<text x="32" y="16.5" font-size="5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle" opacity="0.85">5V1</text>' +
    '<line x1="22" y1="8.5" x2="50" y2="8.5" stroke="%23ffffff" stroke-width="0.8" opacity="0.6"/>'
  ),
  SCHOTTKY_DIODE: svg('0 0 72 28',
    '<defs>' +
      '<linearGradient id="sch_lead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="sch_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="50%25" stop-color="%2318181b"/><stop offset="100%25" stop-color="%2309090b"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="12.5" width="20" height="3" rx="0.5" fill="url(%23sch_lead)"/>' +
    '<circle cx="0.5" cy="14" r="1.5" fill="%2364748b"/>' +
    '<rect x="52" y="12.5" width="20" height="3" rx="0.5" fill="url(%23sch_lead)"/>' +
    '<circle cx="71.5" cy="14" r="1.5" fill="%2364748b"/>' +
    '<rect x="18" y="6" width="36" height="16" rx="2.5" fill="url(%23sch_body)" stroke="%233f3f46" stroke-width="0.75"/>' +
    '<rect x="43" y="6" width="3" height="16" fill="%23cbd5e1"/>' +
    '<rect x="48" y="6" width="2" height="16" fill="%23cbd5e1"/>' +
    '<text x="31" y="16.5" font-size="6" fill="%23facc15" font-family="Arial" font-weight="bold" text-anchor="middle">1N5819</text>' +
    '<line x1="20" y1="7.5" x2="52" y2="7.5" stroke="%23ffffff" stroke-width="0.8" opacity="0.4"/>'
  ),
  NMOS: svg('0 0 56 70',
    '<defs>' +
      '<linearGradient id="nmos_tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="nmos_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="33.5" width="16" height="3" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="0.5" cy="35" r="1.5" fill="%23475569"/>' +
    '<rect x="26.5" y="0" width="3" height="15" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="28" cy="0.5" r="1.5" fill="%23475569"/>' +
    '<rect x="26.5" y="55" width="3" height="15" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="28" cy="69.5" r="1.5" fill="%23475569"/>' +
    '<rect x="12" y="8" width="32" height="20" rx="2" fill="url(%23nmos_tab)" stroke="%2364748b" stroke-width="0.75"/>' +
    '<circle cx="28" cy="18" r="4.2" fill="%23475569"/><circle cx="28" cy="18" r="2.8" fill="%230f172a"/>' +
    '<rect x="8" y="24" width="40" height="32" rx="3" fill="url(%23nmos_body)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="10" y="26" width="36" height="4" rx="1" fill="%230f172a" opacity="0.4"/>' +
    '<text x="28" y="42" font-size="7" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">IRF540N</text>' +
    '<text x="28" y="50" font-size="4.5" fill="%2338bdf8" font-family="Arial" text-anchor="middle">N-CH MOSFET</text>' +
    '<text x="6" y="32" font-size="4" fill="%2394a3b8" font-family="Arial">G</text>' +
    '<text x="33" y="10" font-size="4" fill="%2394a3b8" font-family="Arial">D</text>' +
    '<text x="33" y="66" font-size="4" fill="%2394a3b8" font-family="Arial">S</text>'
  ),
  PMOS: svg('0 0 56 70',
    '<defs>' +
      '<linearGradient id="pmos_tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="pmos_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="33.5" width="16" height="3" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="0.5" cy="35" r="1.5" fill="%23475569"/>' +
    '<rect x="26.5" y="0" width="3" height="15" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="28" cy="0.5" r="1.5" fill="%23475569"/>' +
    '<rect x="26.5" y="55" width="3" height="15" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="28" cy="69.5" r="1.5" fill="%23475569"/>' +
    '<rect x="12" y="8" width="32" height="20" rx="2" fill="url(%23pmos_tab)" stroke="%2364748b" stroke-width="0.75"/>' +
    '<circle cx="28" cy="18" r="4.2" fill="%23475569"/><circle cx="28" cy="18" r="2.8" fill="%230f172a"/>' +
    '<rect x="8" y="24" width="40" height="32" rx="3" fill="url(%23pmos_body)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="10" y="26" width="36" height="4" rx="1" fill="%230f172a" opacity="0.4"/>' +
    '<text x="28" y="42" font-size="7" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">IRF9540</text>' +
    '<text x="28" y="50" font-size="4.5" fill="%23f472b6" font-family="Arial" text-anchor="middle">P-CH MOSFET</text>' +
    '<text x="6" y="32" font-size="4" fill="%2394a3b8" font-family="Arial">G</text>' +
    '<text x="33" y="10" font-size="4" fill="%2394a3b8" font-family="Arial">D</text>' +
    '<text x="33" y="66" font-size="4" fill="%2394a3b8" font-family="Arial">S</text>'
  ),
  OPAMP_IDEAL: svg('0 0 70 70',
    '<rect x="0" y="18.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="20" r="1.5" fill="%23475569"/>' +
    '<rect x="0" y="48.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="50" r="1.5" fill="%23475569"/>' +
    '<rect x="33.5" y="0" width="3" height="16" rx="0.5" fill="%2394a3b8"/><circle cx="35" cy="0.5" r="1.5" fill="%23475569"/>' +
    '<rect x="33.5" y="54" width="3" height="16" rx="0.5" fill="%2394a3b8"/><circle cx="35" cy="69.5" r="1.5" fill="%23475569"/>' +
    '<rect x="52" y="33.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="69.5" cy="35" r="1.5" fill="%23475569"/>' +
    '<polygon points="18,10 18,60 54,35" fill="%231e293b" stroke="%2338bdf8" stroke-width="1.5"/>' +
    '<text x="24" y="24" font-size="10" fill="%2338bdf8" font-family="Arial" font-weight="bold">+</text>' +
    '<text x="24" y="52" font-size="10" fill="%2338bdf8" font-family="Arial" font-weight="bold">−</text>' +
    '<text x="35" y="40" font-size="6" fill="%23e2e8f0" font-family="Arial" font-weight="bold" text-anchor="middle">OPAMP</text>'
  ),
  OPAMP_LM358: svg('0 0 70 70',
    '<rect x="0" y="18.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="20" r="1.5" fill="%23475569"/>' +
    '<rect x="0" y="48.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="50" r="1.5" fill="%23475569"/>' +
    '<rect x="33.5" y="0" width="3" height="16" rx="0.5" fill="%2394a3b8"/><circle cx="35" cy="0.5" r="1.5" fill="%23475569"/>' +
    '<rect x="33.5" y="54" width="3" height="16" rx="0.5" fill="%2394a3b8"/><circle cx="35" cy="69.5" r="1.5" fill="%23475569"/>' +
    '<rect x="52" y="33.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="69.5" cy="35" r="1.5" fill="%23475569"/>' +
    '<polygon points="18,10 18,60 54,35" fill="%230f766e" stroke="%232dd4bf" stroke-width="1.5"/>' +
    '<text x="24" y="24" font-size="10" fill="%23ffffff" font-family="Arial" font-weight="bold">+</text>' +
    '<text x="24" y="52" font-size="10" fill="%23ffffff" font-family="Arial" font-weight="bold">−</text>' +
    '<text x="35" y="40" font-size="6" fill="%23ccfbf1" font-family="Arial" font-weight="bold" text-anchor="middle">LM358</text>'
  ),
  BRIDGE_RECTIFIER: svg('0 0 70 60',
    '<defs>' +
      '<linearGradient id="br_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="13.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="15" r="1.5" fill="%23475569"/>' +
    '<rect x="0" y="43.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="45" r="1.5" fill="%23475569"/>' +
    '<rect x="52" y="13.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="69.5" cy="15" r="1.5" fill="%23475569"/>' +
    '<rect x="52" y="43.5" width="18" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="69.5" cy="45" r="1.5" fill="%23475569"/>' +
    '<rect x="12" y="8" width="46" height="44" rx="5" fill="url(%23br_body)" stroke="%23475569" stroke-width="1"/>' +
    '<path d="M 12 14 L 18 8 L 12 8 Z" fill="%23475569"/>' +
    '<text x="17" y="18" font-size="8" fill="%23facc15" font-family="Arial" font-weight="bold">~</text>' +
    '<text x="17" y="48" font-size="8" fill="%23facc15" font-family="Arial" font-weight="bold">~</text>' +
    '<text x="50" y="18" font-size="8" fill="%23ef4444" font-family="Arial" font-weight="bold">+</text>' +
    '<text x="50" y="48" font-size="8" fill="%2394a3b8" font-family="Arial" font-weight="bold">−</text>' +
    '<text x="35" y="32" font-size="7" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">W04M</text>' +
    '<text x="35" y="40" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">1.5A 400V</text>'
  ),
  THERMISTOR_NTC: svg('0 0 90 24',
    '<defs>' +
      '<radialGradient id="ntc_bead" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%2338bdf8"/><stop offset="35%25" stop-color="%230284c7"/><stop offset="85%25" stop-color="%230369a1"/><stop offset="100%25" stop-color="%230c4a6e"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="10.5" width="30" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="12" r="1.5" fill="%23475569"/>' +
    '<rect x="60" y="10.5" width="30" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="89.5" cy="12" r="1.5" fill="%2364748b"/>' +
    '<ellipse cx="45" cy="12" rx="16" ry="10" fill="url(%23ntc_bead)" stroke="%230c4a6e" stroke-width="0.8"/>' +
    '<text x="45" y="14" font-size="6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">NTC 10k</text>' +
    '<path d="M 35 7 Q 45 4 55 7" fill="none" stroke="%23ffffff" stroke-width="1" opacity="0.5"/>'
  ),
  VARIABLE_CAPACITOR: svg('0 0 44 60',
    '<defs>' +
      '<radialGradient id="trim_base" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23e2e8f0"/><stop offset="100%25" stop-color="%2394a3b8"/></radialGradient>' +
      '<radialGradient id="trim_rotor" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%2367e8f9"/><stop offset="50%25" stop-color="%2306b6d4"/><stop offset="100%25" stop-color="%230e7490"/></radialGradient>' +
      '<linearGradient id="trim_screw" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23fef08a"/><stop offset="45%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23a16207"/></linearGradient>' +
    '</defs>' +
    '<rect x="18.5" y="0" width="3" height="15" rx="0.5" fill="%2394a3b8"/><circle cx="20" cy="1" r="1.5" fill="%23475569"/>' +
    '<rect x="18.5" y="35" width="3" height="25" rx="0.5" fill="%2394a3b8"/><circle cx="20" cy="59" r="1.5" fill="%23475569"/>' +
    '<rect x="6" y="9" width="32" height="32" rx="4" fill="url(%23trim_base)" stroke="%2364748b" stroke-width="0.8"/>' +
    '<circle cx="22" cy="25" r="12" fill="url(%23trim_rotor)" stroke="%230e7490" stroke-width="0.75"/>' +
    '<circle cx="22" cy="25" r="5.5" fill="url(%23trim_screw)" stroke="%23854d0e" stroke-width="0.6"/>' +
    '<line x1="18" y1="21" x2="26" y2="29" stroke="%23451a03" stroke-width="1.4" stroke-linecap="round"/>' +
    '<text x="22" y="39" font-size="4.5" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">TRIMMER</text>'
  ),
  THERMISTOR: svg('0 0 90 24',
    '<defs>' +
      '<radialGradient id="ntc_bead2" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%2338bdf8"/><stop offset="35%25" stop-color="%230284c7"/><stop offset="85%25" stop-color="%230369a1"/><stop offset="100%25" stop-color="%230c4a6e"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="10.5" width="30" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="0.5" cy="12" r="1.5" fill="%23475569"/>' +
    '<rect x="60" y="10.5" width="30" height="3" rx="0.5" fill="%2394a3b8"/><circle cx="89.5" cy="12" r="1.5" fill="%2364748b"/>' +
    '<ellipse cx="45" cy="12" rx="16" ry="10" fill="url(%23ntc_bead2)" stroke="%230c4a6e" stroke-width="0.8"/>' +
    '<text x="45" y="14" font-size="6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">NTC 10k</text>' +
    '<path d="M 35 7 Q 45 4 55 7" fill="none" stroke="%23ffffff" stroke-width="1" opacity="0.5"/>'
  ),

  // ── Child Component Family Variants ──
  // LEDs
  LED_RED: ledSvg('led_r', 'fca5a5', 'ef4444', '991b1b'),
  LED_GREEN: ledSvg('led_g', '86efac', '22c55e', '15803d'),
  LED_BLUE: ledSvg('led_b', '93c5fd', '3b82f6', '1d4ed8'),
  LED_YELLOW: ledSvg('led_y', 'fef08a', 'eab308', 'a16207'),
  LED_WHITE: ledSvg('led_w', 'ffffff', 'f1f5f9', '94a3b8'),
  LED_ORANGE: ledSvg('led_o', 'fed7aa', 'f97316', 'c2410c'),
  LED_PURPLE: ledSvg('led_p', 'f3e8ff', 'a855f7', '7e22ce'),

  // Logic Gates (DIP-14)
  IC_74HC00: dip14Svg('SN74HC00N', 'QUAD 2-INPUT NAND'),
  IC_74HC04: dip14Svg('SN74HC04N', 'HEX INVERTER'),
  IC_74HC08: dip14Svg('SN74HC08N', 'QUAD 2-INPUT AND'),
  IC_74HC32: dip14Svg('SN74HC32N', 'QUAD 2-INPUT OR'),
  IC_74HC86: dip14Svg('SN74HC86N', 'QUAD 2-INPUT XOR'),
  IC_74HC14: dip14Svg('SN74HC14N', 'HEX SCHMITT INV'),
  IC_74HC74: dip14Svg('SN74HC74N', 'DUAL D FLIP-FLOP'),
  IC_74HC02: dip14Svg('SN74HC02N', 'QUAD 2-INPUT NOR'),

  // Switches
  SWITCH_SPDT: svg('0 0 60 30',
    '<defs>' +
      '<linearGradient id="spdt_plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="35%25" stop-color="%23e2e8f0"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="spdt_lug" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="spdt_bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%23090d16"/></linearGradient>' +
    '</defs>' +
    // Terminal 1 solder lug (p1 at x=54, y=8)
    '<rect x="36" y="5.5" width="22" height="5" rx="1" fill="url(%23spdt_lug)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="54" cy="8" r="2.4" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/><circle cx="54" cy="8" r="1.2" fill="%230f172a"/>' +
    // Common terminal solder lug (com at x=54, y=15)
    '<rect x="36" y="12.5" width="22" height="5" rx="1" fill="url(%23spdt_lug)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="54" cy="15" r="2.4" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/><circle cx="54" cy="15" r="1.2" fill="%230f172a"/>' +
    // Terminal 2 solder lug (p2 at x=54, y=22)
    '<rect x="36" y="19.5" width="22" height="5" rx="1" fill="url(%23spdt_lug)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="54" cy="22" r="2.4" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/><circle cx="54" cy="22" r="1.2" fill="%230f172a"/>' +
    // Switch chassis body
    '<rect x="3" y="3" width="37" height="24" rx="3" fill="%230f172a" stroke="%231e293b" stroke-width="0.8"/>' +
    // Brushed metallic top plate
    '<rect x="4.5" y="4.5" width="34" height="21" rx="2" fill="url(%23spdt_plate)" stroke="%2364748b" stroke-width="0.6"/>' +
    // Mounting rivets
    '<circle cx="9" cy="7.5" r="1.6" fill="%23475569" stroke="%23cbd5e1" stroke-width="0.4"/><circle cx="9" cy="7.5" r="0.8" fill="%230f172a"/>' +
    '<circle cx="9" cy="22.5" r="1.6" fill="%23475569" stroke="%23cbd5e1" stroke-width="0.4"/><circle cx="9" cy="22.5" r="0.8" fill="%230f172a"/>' +
    // Recessed switch slot well
    '<rect x="20" y="4" width="15" height="22" rx="2.5" fill="url(%23spdt_bezel)" stroke="%23334155" stroke-width="0.6"/>' +
    '<rect x="21.5" y="5" width="12" height="20" rx="1.5" fill="%23020617"/>' +
    // Position labels
    '<text x="14" y="9.5" font-size="3.2" fill="%23334155" font-family="Arial" font-weight="900" text-anchor="middle">1</text>' +
    '<text x="14" y="16.5" font-size="3.2" fill="%23334155" font-family="Arial" font-weight="900" text-anchor="middle">C</text>' +
    '<text x="14" y="23.5" font-size="3.2" fill="%23334155" font-family="Arial" font-weight="900" text-anchor="middle">2</text>' +
    // Terminal lug pin numbers
    '<text x="46" y="9" font-size="2.2" fill="%23475569" font-family="Arial" font-weight="bold" text-anchor="middle">1</text>' +
    '<text x="46" y="16" font-size="2.2" fill="%23475569" font-family="Arial" font-weight="bold" text-anchor="middle">C</text>' +
    '<text x="46" y="23" font-size="2.2" fill="%23475569" font-family="Arial" font-weight="bold" text-anchor="middle">2</text>'
  ),
  TOGGLE_SWITCH: svg('0 0 60 40',
    '<defs>' +
      '<linearGradient id="tgl_metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="40%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="tgl_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e3a8a"/><stop offset="100%25" stop-color="%23172554"/></linearGradient>' +
      '<linearGradient id="tgl_bat" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23e2e8f0"/><stop offset="35%25" stop-color="%23ffffff"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    [16, 30, 44].map((x) =>
      `<rect x="${x - 2}" y="32" width="4" height="8" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="38" r="1.5" fill="%230f172a"/>`
    ).join('') +
    '<rect x="8" y="14" width="44" height="20" rx="2" fill="url(%23tgl_body)" stroke="%230f172a" stroke-width="0.8"/>' +
    '<text x="30" y="27" font-size="4" fill="%2393c5fd" font-family="Arial" font-weight="bold" text-anchor="middle">6A 125VAC</text>' +
    '<rect x="22" y="7" width="16" height="7" fill="url(%23tgl_metal)" stroke="%23475569" stroke-width="0.5"/>' +
    '<polygon points="19,14 22,11 38,11 41,14 38,17 22,17" fill="url(%23tgl_metal)" stroke="%23475569" stroke-width="0.5"/>' +
    '<polygon points="27,11 25,2 35,2 33,11" fill="url(%23tgl_bat)" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="30" cy="2" r="3.5" fill="url(%23tgl_bat)" stroke="%23475569" stroke-width="0.5"/>'
  ),
  DIP_SWITCH_4: svg('0 0 70 40',
    '<defs>' +
      '<linearGradient id="dipsw_red" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23dc2626"/><stop offset="100%25" stop-color="%23991b1b"/></linearGradient>' +
    '</defs>' +
    [16, 28, 40, 52].map((x) =>
      `<rect x="${x - 1.5}" y="0" width="3" height="8" rx="0.5" fill="%23e2e8f0"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    [16, 28, 40, 52].map((x) =>
      `<rect x="${x - 1.5}" y="32" width="3" height="8" rx="0.5" fill="%23e2e8f0"/>` +
      `<circle cx="${x}" cy="38.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<rect x="8" y="7" width="54" height="26" rx="2" fill="url(%23dipsw_red)" stroke="%237f1d1d" stroke-width="0.8"/>' +
    '<text x="12" y="13" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold">ON</text>' +
    '<path d="M 12 15 L 14 15 L 13 17 Z" fill="%23ffffff"/>' +
    [16, 28, 40, 52].map((x, i) =>
      `<rect x="${x - 4}" y="12" width="8" height="18" rx="1" fill="%2318181b"/>` +
      `<rect x="${x - 3}" y="${i % 2 === 0 ? 13 : 21}" width="6" height="8" rx="0.8" fill="%23f8fafc" stroke="%23cbd5e1" stroke-width="0.4"/>` +
      `<line x1="${x - 2}" y1="${i % 2 === 0 ? 17 : 25}" x2="${x + 2}" y2="${i % 2 === 0 ? 17 : 25}" stroke="%2394a3b8" stroke-width="0.6"/>` +
      `<text x="${x}" y="32" font-size="2.6" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">${i + 1}</text>`
    ).join('')
  ),

  // Instruments
  VOLTMETER: svg('0 0 90 70',
    '<defs>' +
      '<linearGradient id="vm_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2309090b"/></linearGradient>' +
      '<linearGradient id="vm_glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23450a0a"/><stop offset="100%25" stop-color="%231c0505"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="86" height="58" rx="4" fill="url(%23vm_case)" stroke="%233f3f46" stroke-width="1"/>' +
    '<circle cx="8" cy="8" r="2" fill="%2318181b" stroke="%2352525b" stroke-width="0.4"/>' +
    '<circle cx="82" cy="8" r="2" fill="%2318181b" stroke="%2352525b" stroke-width="0.4"/>' +
    '<rect x="12" y="10" width="66" height="34" rx="2" fill="url(%23vm_glass)" stroke="%237f1d1d" stroke-width="0.8"/>' +
    '<text x="45" y="34" font-size="18" fill="%23ef4444" font-family="Courier New, monospace" font-weight="bold" text-anchor="middle" letter-spacing="1">0.00</text>' +
    '<text x="68" y="26" font-size="7" fill="%23f87171" font-family="Arial" font-weight="bold">V</text>' +
    '<text x="45" y="54" font-size="4" fill="%2394a3b8" font-family="Arial" text-anchor="middle">DIGITAL VOLTMETER 0-100V</text>' +
    '<rect x="22" y="59" width="4" height="11" rx="1" fill="%23ef4444"/><circle cx="24" cy="69" r="1.5" fill="%23ffffff"/>' +
    '<rect x="64" y="59" width="4" height="11" rx="1" fill="%2318181b"/><circle cx="66" cy="69" r="1.5" fill="%23ffffff"/>' +
    '<text x="24" y="57" font-size="3" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">V+</text>' +
    '<text x="66" y="57" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">COM</text>'
  ),
  LOGIC_ANALYZER: svg('0 0 100 60',
    '<defs>' +
      '<linearGradient id="la_alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2318181b"/><stop offset="50%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2309090b"/></linearGradient>' +
    '</defs>' +
    '<rect x="3" y="3" width="94" height="48" rx="4" fill="url(%23la_alu)" stroke="%233f3f46" stroke-width="1"/>' +
    '<rect x="6" y="6" width="88" height="42" rx="2" fill="none" stroke="%2352525b" stroke-width="0.5"/>' +
    '<circle cx="8" cy="8" r="1.2" fill="%2371717a"/><circle cx="92" cy="8" r="1.2" fill="%2371717a"/>' +
    '<rect x="42" y="0" width="16" height="5" rx="1" fill="%23cbd5e1" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="85" cy="20" r="2" fill="%2322c55e"/><circle cx="85" cy="20" r="0.8" fill="%2386efac"/>' +
    '<text x="85" y="27" font-size="2.6" fill="%23a1a1aa" font-family="Arial" text-anchor="middle">ACT</text>' +
    '<text x="45" y="22" font-size="6" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">LOGIC 8</text>' +
    '<text x="45" y="30" font-size="3" fill="%2394a3b8" font-family="Arial" text-anchor="middle">24MHz 8-CHANNEL ANALYZER</text>' +
    [15, 24, 33, 42, 51, 60, 69, 78, 88].map((x, i) =>
      `<rect x="${x - 1.5}" y="48" width="3" height="12" rx="0.5" fill="%23f59e0b"/>` +
      `<circle cx="${x}" cy="58.5" r="1" fill="%230f172a"/>` +
      `<text x="${x}" y="46" font-size="2.6" fill="${i < 8 ? '%2338bdf8' : '%2394a3b8'}" font-family="Arial" font-weight="bold" text-anchor="middle">${i < 8 ? 'C' + i : 'GND'}</text>`
    ).join('')
  ),

  // Power
  BATTERY_18650: svg('0 0 70 80',
    '<defs>' +
      '<linearGradient id="bat18650_wrap" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23047857"/><stop offset="35%25" stop-color="%2310b981"/><stop offset="70%25" stop-color="%23059669"/><stop offset="100%25" stop-color="%23047857"/></linearGradient>' +
      '<linearGradient id="bat18650_metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2394a3b8"/><stop offset="35%25" stop-color="%23f8fafc"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="18" y="10" width="34" height="60" rx="3" fill="url(%23bat18650_wrap)" stroke="%23064e3b" stroke-width="0.8"/>' +
    '<rect x="24" y="6" width="22" height="4" rx="1" fill="url(%23bat18650_metal)"/>' +
    '<rect x="29" y="3" width="12" height="3" rx="1" fill="url(%23bat18650_metal)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<rect x="21" y="69" width="28" height="3" rx="1" fill="url(%23bat18650_metal)"/>' +
    '<text x="35" y="28" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">INR18650-25R</text>' +
    '<text x="35" y="36" font-size="3.2" fill="%23d1fae5" font-family="Arial" text-anchor="middle">3.7V 2500mAh</text>' +
    '<text x="35" y="44" font-size="2.6" fill="%23a7f3d0" font-family="Arial" text-anchor="middle">LI-ION RECHARGEABLE</text>' +
    '<text x="24" y="18" font-size="5" fill="%23ffffff" font-weight="bold">+</text>' +
    '<text x="24" y="67" font-size="6" fill="%23ffffff" font-weight="bold">−</text>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23ef4444"/><circle cx="15" cy="60" r="1.2" fill="%23ffffff"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%2318181b"/><circle cx="45" cy="60" r="1.2" fill="%23ffffff"/>'
  ),
  BATTERY_CR2032: svg('0 0 50 60',
    '<defs>' +
      '<radialGradient id="cr_metal" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="40%25" stop-color="%23e2e8f0"/><stop offset="80%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></radialGradient>' +
    '</defs>' +
    '<circle cx="25" cy="25" r="20" fill="url(%23cr_metal)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="25" cy="25" r="17.5" fill="none" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<text x="25" y="21" font-size="5" fill="%23475569" font-family="Arial" font-weight="bold" text-anchor="middle">+ CR2032</text>' +
    '<text x="25" y="27" font-size="3.2" fill="%2364748b" font-family="Arial" text-anchor="middle">3V LITHIUM</text>' +
    '<text x="25" y="33" font-size="2.4" fill="%2394a3b8" font-family="Arial" text-anchor="middle">CELL</text>' +
    '<rect x="13.5" y="42" width="3" height="8" rx="0.5" fill="%2394a3b8"/><circle cx="15" cy="49" r="1.2" fill="%230f172a"/>' +
    '<rect x="33.5" y="42" width="3" height="8" rx="0.5" fill="%2394a3b8"/><circle cx="35" cy="49" r="1.2" fill="%230f172a"/>' +
    '<text x="15" y="40" font-size="3" fill="%23ef4444" font-weight="bold" text-anchor="middle">+</text>' +
    '<text x="35" y="40" font-size="4" fill="%2364748b" font-weight="bold" text-anchor="middle">−</text>'
  ),
  BATTERY_LIPO: svg('0 0 70 70',
    '<defs>' +
      '<linearGradient id="lipo_foil" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23cbd5e1"/><stop offset="30%25" stop-color="%23f8fafc"/><stop offset="70%25" stop-color="%23e2e8f0"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    '<rect x="8" y="10" width="54" height="42" rx="3" fill="url(%23lipo_foil)" stroke="%2394a3b8" stroke-width="0.8"/>' +
    '<rect x="10" y="8" width="50" height="2" fill="%23cbd5e1"/><rect x="10" y="52" width="50" height="2" fill="%23cbd5e1"/>' +
    '<rect x="14" y="9" width="42" height="6" fill="%23eab308" opacity="0.6"/>' +
    '<text x="35" y="27" font-size="4" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">3.7V 500mAh</text>' +
    '<text x="35" y="34" font-size="3" fill="%2364748b" font-family="Arial" text-anchor="middle">Li-Polymer 1S</text>' +
    '<text x="35" y="41" font-size="2.4" fill="%2394a3b8" font-family="Arial" text-anchor="middle">WITH PCM PROTECT</text>' +
    '<path d="M 22 15 Q 16 35 20 60" fill="none" stroke="%23ef4444" stroke-width="1.8"/>' +
    '<path d="M 48 15 Q 54 35 40 60" fill="none" stroke="%2318181b" stroke-width="1.8"/>' +
    '<circle cx="20" cy="60" r="2.5" fill="%23ef4444"/><circle cx="20" cy="60" r="1.2" fill="%23ffffff"/>' +
    '<circle cx="40" cy="60" r="2.5" fill="%2318181b"/><circle cx="40" cy="60" r="1.2" fill="%23ffffff"/>'
  ),
  BATTERY_AAA: svg('0 0 50 80',
    '<defs>' +
      '<linearGradient id="aaa_wrap" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23b45309"/><stop offset="35%25" stop-color="%23f59e0b"/><stop offset="70%25" stop-color="%23d97706"/><stop offset="100%25" stop-color="%2392400e"/></linearGradient>' +
      '<linearGradient id="aaa_metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2394a3b8"/><stop offset="35%25" stop-color="%23f8fafc"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="13" y="10" width="24" height="60" rx="2" fill="url(%23aaa_wrap)" stroke="%2378350f" stroke-width="0.8"/>' +
    '<rect x="18" y="5" width="14" height="5" rx="1" fill="url(%23aaa_metal)"/>' +
    '<rect x="21" y="2" width="8" height="3" rx="1" fill="url(%23aaa_metal)"/>' +
    '<rect x="15" y="70" width="20" height="3" rx="1" fill="url(%23aaa_metal)"/>' +
    '<text x="25" y="28" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">AAA</text>' +
    '<text x="25" y="36" font-size="3" fill="%23fef3c7" font-family="Arial" text-anchor="middle">1.5V ALKALINE</text>' +
    '<text x="25" y="44" font-size="2.4" fill="%23fde68a" font-family="Arial" text-anchor="middle">LR03</text>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23ef4444"/><circle cx="15" cy="60" r="1.2" fill="%23ffffff"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%2318181b"/><circle cx="45" cy="60" r="1.2" fill="%23ffffff"/>'
  ),
  VOLTAGE_REGULATOR_AMS1117: svg('0 0 60 50',
    '<defs>' +
      '<linearGradient id="ams_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231d4ed8"/><stop offset="100%25" stop-color="%231e3a8a"/></linearGradient>' +
    '</defs>' +
    '<rect x="6" y="4" width="48" height="42" rx="2" fill="url(%23ams_pcb)" stroke="%23172554" stroke-width="0.8"/>' +
    '<rect x="22" y="16" width="16" height="18" rx="1" fill="%2318181b" stroke="%23334155" stroke-width="0.5"/>' +
    '<rect x="26" y="13" width="8" height="3" fill="%23cbd5e1"/>' +
    '<rect x="23" y="34" width="3" height="3" fill="%23cbd5e1"/><rect x="28.5" y="34" width="3" height="3" fill="%23cbd5e1"/><rect x="34" y="34" width="3" height="3" fill="%23cbd5e1"/>' +
    '<text x="30" y="24" font-size="2.6" fill="%23e2e8f0" font-family="Arial" font-weight="bold" text-anchor="middle">AMS1117</text>' +
    '<text x="30" y="29" font-size="2.4" fill="%2394a3b8" font-family="Arial" text-anchor="middle">3.3</text>' +
    '<circle cx="44" cy="12" r="1.5" fill="%23ef4444"/><circle cx="44" cy="12" r="0.6" fill="%23fca5a5"/>' +
    '<rect x="12" y="18" width="6" height="8" rx="0.5" fill="%23ca8a04"/><line x1="12" y1="18" x2="18" y2="18" stroke="%23fef08a" stroke-width="0.5"/>' +
    '<rect x="42" y="24" width="6" height="8" rx="0.5" fill="%23ca8a04"/><line x1="42" y1="24" x2="48" y2="24" stroke="%23fef08a" stroke-width="0.5"/>' +
    '<rect x="0" y="13" width="7" height="4" rx="0.5" fill="%23cbd5e1"/><circle cx="1" cy="15" r="1.2" fill="%230f172a"/>' +
    '<rect x="0" y="33" width="7" height="4" rx="0.5" fill="%23cbd5e1"/><circle cx="1" cy="35" r="1.2" fill="%230f172a"/>' +
    '<text x="10" y="16" font-size="2.4" fill="%23ffffff" font-family="Arial" font-weight="bold">VIN</text>' +
    '<text x="10" y="36" font-size="2.4" fill="%23ffffff" font-family="Arial" font-weight="bold">GND</text>' +
    '<rect x="53" y="13" width="7" height="4" rx="0.5" fill="%23cbd5e1"/><circle cx="59" cy="15" r="1.2" fill="%230f172a"/>' +
    '<rect x="53" y="33" width="7" height="4" rx="0.5" fill="%23cbd5e1"/><circle cx="59" cy="35" r="1.2" fill="%230f172a"/>' +
    '<text x="50" y="16" font-size="2.4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">3.3V</text>' +
    '<text x="50" y="36" font-size="2.4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">GND</text>'
  ),

  // Sensors
  ULTRASONIC_SENSOR: svg('0 0 80 60',
    '<defs>' +
      '<linearGradient id="us_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%230369a1"/></linearGradient>' +
      '<radialGradient id="us_trans" cx="45%25" cy="45%25" r="55%25"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="30%25" stop-color="%23cbd5e1"/><stop offset="85%25" stop-color="%2364748b"/><stop offset="100%25" stop-color="%23334155"/></radialGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="76" height="48" rx="3" fill="url(%23us_pcb)" stroke="%23075985" stroke-width="0.8"/>' +
    '<circle cx="24" cy="24" r="16" fill="url(%23us_trans)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="24" cy="24" r="13" fill="%231e293b"/>' +
    '<circle cx="24" cy="24" r="12" fill="none" stroke="%2394a3b8" stroke-width="0.6" stroke-dasharray="2,2"/>' +
    '<text x="24" y="26" font-size="6" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">T</text>' +
    '<circle cx="56" cy="24" r="16" fill="url(%23us_trans)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="56" cy="24" r="13" fill="%231e293b"/>' +
    '<circle cx="56" cy="24" r="12" fill="none" stroke="%2394a3b8" stroke-width="0.6" stroke-dasharray="2,2"/>' +
    '<text x="56" y="26" font-size="6" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">R</text>' +
    '<rect x="36" y="20" width="8" height="12" rx="3" fill="%23e2e8f0" stroke="%2364748b" stroke-width="0.4"/>' +
    '<text x="40" y="27" font-size="2.4" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">HC-SR04</text>' +
    [20, 33, 47, 60].map((x) =>
      `<rect x="${x - 1.5}" y="48" width="3" height="12" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="58.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<text x="20" y="46" font-size="2.4" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="33" y="46" font-size="2.4" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">TRIG</text>' +
    '<text x="47" y="46" font-size="2.4" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">ECHO</text>' +
    '<text x="60" y="46" font-size="2.4" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  TEMPERATURE_SENSOR: svg('0 0 50 60',
    '<defs>' +
      '<linearGradient id="dht_blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2338bdf8"/><stop offset="50%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%230369a1"/></linearGradient>' +
    '</defs>' +
    '<rect x="6" y="4" width="38" height="44" rx="2" fill="url(%23dht_blue)" stroke="%230284c7" stroke-width="0.8"/>' +
    [10, 16, 22, 28].map((y) =>
      `<line x1="12" y1="${y}" x2="38" y2="${y}" stroke="%230f172a" stroke-width="1.6" stroke-linecap="round"/>`
    ).join('') +
    '<text x="25" y="38" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">DHT11</text>' +
    '<text x="25" y="44" font-size="2.4" fill="%23bae6fd" font-family="Arial" text-anchor="middle">TEMP / HUMIDITY</text>' +
    [12, 25, 38].map((x) =>
      `<rect x="${x - 1.5}" y="48" width="3" height="12" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="58.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<text x="12" y="55" font-size="2.4" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">+</text>' +
    '<text x="25" y="55" font-size="2.4" fill="%2338bdf8" font-family="Arial" font-weight="bold" text-anchor="middle">S</text>' +
    '<text x="38" y="55" font-size="2.4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">−</text>'
  ),
  TMP36: svg('0 0 56 70',
    '<defs>' +
      '<linearGradient id="to92_body" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2318181b"/><stop offset="35%25" stop-color="%233f3f46"/><stop offset="70%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2309090b"/></linearGradient>' +
    '</defs>' +
    [16, 28, 40].map((x) =>
      `<rect x="${x - 1.2}" y="28" width="2.4" height="42" rx="0.5" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.3"/>` +
      `<circle cx="${x}" cy="68.5" r="1" fill="%230f172a"/>`
    ).join('') +
    '<path d="M 10 12 C 10 4 46 4 46 12 L 46 28 L 10 28 Z" fill="url(%23to92_body)" stroke="%2327272a" stroke-width="0.8"/>' +
    '<rect x="12" y="10" width="32" height="17" rx="1" fill="%2318181b"/>' +
    '<text x="28" y="18" font-size="4" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">TMP36</text>' +
    '<text x="28" y="24" font-size="2.6" fill="%2394a3b8" font-family="Arial" text-anchor="middle">-40 to 125C</text>' +
    '<text x="16" y="34" font-size="2.4" fill="%23ef4444" font-weight="bold" text-anchor="middle">Vs</text>' +
    '<text x="28" y="34" font-size="2.4" fill="%2338bdf8" font-weight="bold" text-anchor="middle">Vout</text>' +
    '<text x="40" y="34" font-size="2.4" fill="%23cbd5e1" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  GAS_SENSOR: svg('0 0 60 60',
    '<defs>' +
      '<radialGradient id="mq_mesh" cx="45%25" cy="45%25" r="55%25"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="35%25" stop-color="%23cbd5e1"/><stop offset="85%25" stop-color="%2364748b"/><stop offset="100%25" stop-color="%23334155"/></radialGradient>' +
    '</defs>' +
    '<rect x="4" y="4" width="52" height="42" rx="3" fill="%230284c7" stroke="%230369a1" stroke-width="0.8"/>' +
    '<circle cx="30" cy="24" r="16" fill="url(%23mq_mesh)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="30" cy="24" r="13" fill="%23334155" stroke="%2394a3b8" stroke-width="0.5" stroke-dasharray="1,1"/>' +
    '<text x="30" y="26" font-size="4.5" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">MQ-2</text>' +
    '<text x="30" y="31" font-size="2.4" fill="%23cbd5e1" font-family="Arial" text-anchor="middle">GAS / SMOKE</text>' +
    [12, 24, 36, 48].map((x) =>
      `<rect x="${x - 1.5}" y="46" width="3" height="14" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="58.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<text x="12" y="44" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="24" y="44" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">GND</text>' +
    '<text x="36" y="44" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">DO</text>' +
    '<text x="48" y="44" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">AO</text>'
  ),

  // Motors
  VIBRATION_MOTOR: svg('0 0 50 50',
    '<defs>' +
      '<radialGradient id="vib_coin" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></radialGradient>' +
    '</defs>' +
    '<rect x="6" y="8" width="38" height="28" rx="2" fill="%230284c7" opacity="0.6"/>' +
    '<circle cx="25" cy="22" r="16" fill="url(%23vib_coin)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="25" cy="22" r="12" fill="none" stroke="%2394a3b8" stroke-width="0.5"/>' +
    '<path d="M 25 10 A 12 12 0 0 1 37 22 L 25 22 Z" fill="%23ca8a04" opacity="0.4"/>' +
    '<text x="25" y="24" font-size="3.2" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">COIN MOTOR</text>' +
    '<path d="M 21 36 Q 16 42 18 50" fill="none" stroke="%23ef4444" stroke-width="1.8"/>' +
    '<path d="M 29 36 Q 34 42 32 50" fill="none" stroke="%233b82f6" stroke-width="1.8"/>' +
    '<circle cx="18" cy="49" r="1.5" fill="%23ef4444"/><circle cx="32" cy="49" r="1.5" fill="%233b82f6"/>'
  ),
  GEAR_MOTOR: svg('0 0 80 60',
    '<defs>' +
      '<linearGradient id="tt_yellow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23fde047"/><stop offset="50%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23ca8a04"/></linearGradient>' +
      '<linearGradient id="tt_metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2394a3b8"/><stop offset="50%25" stop-color="%23f1f5f9"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="14" width="24" height="32" rx="3" fill="url(%23tt_metal)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="0" y="18" width="6" height="4" rx="0.5" fill="%23cbd5e1"/><circle cx="2" cy="20" r="1" fill="%230f172a"/>' +
    '<rect x="0" y="38" width="6" height="4" rx="0.5" fill="%23cbd5e1"/><circle cx="2" cy="40" r="1" fill="%230f172a"/>' +
    '<rect x="24" y="8" width="52" height="44" rx="3" fill="url(%23tt_yellow)" stroke="%23a16207" stroke-width="0.8"/>' +
    '<circle cx="58" cy="30" r="10" fill="%23ca8a04" stroke="%23a16207" stroke-width="0.6"/>' +
    '<rect x="54" y="24" width="8" height="12" rx="1.5" fill="%23ffffff" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<text x="44" y="20" font-size="3.5" fill="%2378350f" font-family="Arial" font-weight="bold">TT MOTOR</text>' +
    '<text x="44" y="44" font-size="2.6" fill="%2378350f" font-family="Arial">1:48 RATIO</text>'
  ),
  SOLENOID: svg('0 0 70 50',
    '<defs>' +
      '<linearGradient id="sol_copper" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f59e0b"/><stop offset="50%25" stop-color="%23b45309"/><stop offset="100%25" stop-color="%2378350f"/></linearGradient>' +
      '<linearGradient id="sol_frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23e2e8f0"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="4" y="8" width="46" height="34" rx="2" fill="url(%23sol_frame)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="8" y="12" width="38" height="26" fill="%2318181b"/>' +
    '<rect x="12" y="13" width="30" height="24" rx="1" fill="url(%23sol_copper)"/>' +
    '<rect x="22" y="21" width="44" height="8" rx="2" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="62" cy="25" r="2" fill="%23cbd5e1" stroke="%23475569" stroke-width="0.4"/>' +
    '<path d="M 46 22 L 48 28 L 50 22 L 52 28 L 54 22" fill="none" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="10" y="38" width="4" height="10" rx="0.5" fill="%23cbd5e1"/><circle cx="12" cy="47" r="1.2" fill="%230f172a"/>' +
    '<rect x="30" y="38" width="4" height="10" rx="0.5" fill="%23cbd5e1"/><circle cx="32" cy="47" r="1.2" fill="%230f172a"/>'
  ),

  // Displays
  DISPLAY_7SEG_4DIGIT: svg('0 0 100 50',
    '<defs>' +
      '<linearGradient id="tm_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2318181b"/><stop offset="100%25" stop-color="%2309090b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="96" height="42" rx="3" fill="url(%23tm_pcb)" stroke="%233f3f46" stroke-width="0.8"/>' +
    '<rect x="8" y="6" width="84" height="28" rx="2" fill="%23300505" stroke="%237f1d1d" stroke-width="0.6"/>' +
    ['1', '2', '0', '0'].map((d, i) => {
      const dx = 12 + i * 20 + (i >= 2 ? 4 : 0);
      return `<text x="${dx + 8}" y="${26}" font-size="16" fill="%23ef4444" font-family="Courier New, monospace" font-weight="bold" text-anchor="middle">${d}</text>`;
    }).join('') +
    '<circle cx="50" cy="16" r="1.5" fill="%23ef4444"/><circle cx="50" cy="24" r="1.5" fill="%23ef4444"/>' +
    [25, 40, 55, 70].map((x) =>
      `<rect x="${x - 1.5}" y="42" width="3" height="8" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="49" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<text x="25" y="39" font-size="2.4" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">CLK</text>' +
    '<text x="40" y="39" font-size="2.4" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle">DIO</text>' +
    '<text x="55" y="39" font-size="2.4" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="70" y="39" font-size="2.4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  LED_BAR_GRAPH: svg('0 0 60 60',
    Array.from({ length: 10 }, (_, i) => {
      const x = 7.5 + i * 5;
      return `<rect x="${x - 1}" y="0" width="2" height="9" fill="%23cbd5e1"/><circle cx="${x}" cy="1.5" r="0.9" fill="%230f172a"/>` +
        `<rect x="${x - 1}" y="51" width="2" height="9" fill="%23cbd5e1"/><circle cx="${x}" cy="58.5" r="0.9" fill="%230f172a"/>`;
    }).join('') +
    '<rect x="4" y="8" width="52" height="44" rx="2" fill="%2309090b" stroke="%2327272a" stroke-width="0.8"/>' +
    Array.from({ length: 10 }, (_, i) => {
      const x = 6.5 + i * 5;
      const color = i < 4 ? '%2322c55e' : i < 7 ? '%23eab308' : '%23ef4444';
      return `<rect x="${x}" y="12" width="4" height="36" rx="0.5" fill="${color}" stroke="%2318181b" stroke-width="0.4"/>`;
    }).join('')
  ),
  DISPLAY_MAX7219_MATRIX: svg('0 0 80 80',
    '<defs>' +
      '<linearGradient id="m72_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e3a8a"/><stop offset="100%25" stop-color="%23172554"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="76" height="70" rx="3" fill="url(%23m72_pcb)" stroke="%231e40af" stroke-width="0.8"/>' +
    '<rect x="8" y="6" width="64" height="54" rx="2" fill="%2309090b" stroke="%23334155" stroke-width="0.8"/>' +
    Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => {
        const cx = 13 + c * 7.7;
        const cy = 10 + r * 6.6;
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.2" fill="%237f1d1d" stroke="%23450a0a" stroke-width="0.3"/>`;
      }).join('')
    ).join('') +
    [15, 27, 39, 51, 63].map((x) =>
      `<rect x="${x - 1.5}" y="70" width="3" height="10" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="78.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<text x="15" y="68" font-size="2.4" fill="%23ef4444" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="27" y="68" font-size="2.4" fill="%23cbd5e1" font-weight="bold" text-anchor="middle">GND</text>' +
    '<text x="39" y="68" font-size="2.4" fill="%2338bdf8" font-weight="bold" text-anchor="middle">DIN</text>' +
    '<text x="51" y="68" font-size="2.4" fill="%23facc15" font-weight="bold" text-anchor="middle">CS</text>' +
    '<text x="63" y="68" font-size="2.4" fill="%234ade80" font-weight="bold" text-anchor="middle">CLK</text>'
  ),

  // Passives & Relays
  TRIMPOT: svg('0 0 50 50',
    '<defs>' +
      '<linearGradient id="tr_blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%230369a1"/></linearGradient>' +
      '<radialGradient id="tr_screw" cx="45%25" cy="45%25" r="55%25"><stop offset="0%25" stop-color="%23fef08a"/><stop offset="50%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23854d0e"/></radialGradient>' +
    '</defs>' +
    '<rect x="4" y="4" width="42" height="36" rx="2" fill="url(%23tr_blue)" stroke="%23075985" stroke-width="0.8"/>' +
    '<circle cx="25" cy="18" r="8" fill="url(%23tr_screw)" stroke="%23a16207" stroke-width="0.6"/>' +
    '<line x1="20" y1="18" x2="30" y2="18" stroke="%2378350f" stroke-width="1.4" stroke-linecap="round"/>' +
    '<text x="25" y="34" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">10k W103</text>' +
    [12, 25, 38].map((x) =>
      `<rect x="${x - 1.5}" y="38" width="3" height="12" rx="0.5" fill="%23cbd5e1"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a"/>`
    ).join('') +
    '<text x="12" y="39" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">1</text>' +
    '<text x="25" y="39" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">W</text>' +
    '<text x="38" y="39" font-size="2.4" fill="%23ffffff" font-weight="bold" text-anchor="middle">2</text>'
  ),
  PHOTO_DIODE: svg('0 0 40 70',
    '<defs>' +
      '<linearGradient id="pd_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="pd_lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23ffffff" stop-opacity="0.8"/><stop offset="40%25" stop-color="%23e2e8f0" stop-opacity="0.5"/><stop offset="100%25" stop-color="%2394a3b8" stop-opacity="0.7"/></linearGradient>' +
    '</defs>' +
    '<rect x="15" y="36" width="2.2" height="34" fill="url(%23pd_lead)"/>' +
    '<rect x="23" y="36" width="2.2" height="34" fill="url(%23pd_lead)"/>' +
    '<circle cx="16" cy="68.5" r="1" fill="%230f172a"/><circle cx="24" cy="68.5" r="1" fill="%230f172a"/>' +
    '<rect x="17" y="18" width="6" height="8" rx="0.5" fill="%230f172a" stroke="%233b82f6" stroke-width="0.5"/>' +
    '<circle cx="20" cy="22" r="1" fill="%23f59e0b"/>' +
    '<path d="M 9 20 C 9 10 13.5 6 20 6 C 26.5 6 31 10 31 20 L 31 34 L 9 34 Z" fill="url(%23pd_lens)" stroke="%23cbd5e1" stroke-width="0.8"/>' +
    '<rect x="7" y="34" width="26" height="4" rx="0.5" fill="url(%23pd_lens)" stroke="%23cbd5e1" stroke-width="0.6"/>' +
    '<path d="M 13 14 C 15 10 18 9 22 9" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>'
  ),
  RELAY_8CH: svg('0 0 160 60',
    '<defs>' +
      '<linearGradient id="r8_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e3a8a"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
      '<linearGradient id="r8_blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%233b82f6"/><stop offset="100%25" stop-color="%231d4ed8"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="156" height="56" rx="3" fill="url(%23r8_pcb)" stroke="%231e40af" stroke-width="0.8"/>' +
    Array.from({ length: 8 }, (_, i) => {
      const rx = 24 + i * 16;
      return `<rect x="${rx}" y="6" width="14" height="28" rx="1.5" fill="url(%23r8_blue)" stroke="%231e40af" stroke-width="0.5"/>` +
        `<text x="${rx + 7}" y="14" font-size="2" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">SONGLE</text>` +
        `<text x="${rx + 7}" y="20" font-size="1.8" fill="%23dbeafe" font-family="Arial" text-anchor="middle">10A 250V</text>` +
        `<circle cx="${rx + 7}" cy="38" r="1.2" fill="%23ef4444"/><circle cx="${rx + 7}" cy="38" r="0.5" fill="%23fca5a5"/>` +
        `<rect x="${rx}" y="42" width="14" height="14" rx="1" fill="%2315803d" stroke="%2314532d" stroke-width="0.4"/>` +
        `<circle cx="${rx + 3.5}" cy="49" r="1.5" fill="%23cbd5e1"/><circle cx="${rx + 7}" cy="49" r="1.5" fill="%23cbd5e1"/><circle cx="${rx + 10.5}" cy="49" r="1.5" fill="%23cbd5e1"/>`;
    }).join('') +
    '<rect x="4" y="6" width="16" height="48" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 10 }, (_, i) => {
      const py = 9 + i * 4.5;
      return `<circle cx="12" cy="${py}" r="1.2" fill="%23f59e0b"/>`;
    }).join('')
  ),
  RELAY_SSR: svg('0 0 70 70',
    '<defs>' +
      '<linearGradient id="ssr_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="35%25" stop-color="%23e2e8f0"/><stop offset="100%25" stop-color="%23cbd5e1"/></linearGradient>' +
    '</defs>' +
    '<rect x="4" y="4" width="62" height="62" rx="3" fill="url(%23ssr_body)" stroke="%2394a3b8" stroke-width="1"/>' +
    '<rect x="14" y="0" width="12" height="12" rx="1.5" fill="%2318181b" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="20" cy="6" r="3" fill="%23cbd5e1"/><line x1="18" y1="6" x2="22" y2="6" stroke="%230f172a" stroke-width="0.8"/>' +
    '<rect x="44" y="0" width="12" height="12" rx="1.5" fill="%2318181b" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="50" cy="6" r="3" fill="%23cbd5e1"/><line x1="48" y1="6" x2="52" y2="6" stroke="%230f172a" stroke-width="0.8"/>' +
    '<text x="20" y="18" font-size="3" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">1 ~</text>' +
    '<text x="50" y="18" font-size="3" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">2 ~</text>' +
    '<text x="35" y="27" font-size="5.5" fill="%23b91c1c" font-family="Arial" font-weight="bold" text-anchor="middle">FOTEK</text>' +
    '<text x="35" y="34" font-size="4" fill="%231e293b" font-family="Arial" font-weight="bold" text-anchor="middle">SSR-40 DA</text>' +
    '<text x="35" y="40" font-size="2.6" fill="%23475569" font-family="Arial" text-anchor="middle">LOAD: 24-380VAC 40A</text>' +
    '<text x="35" y="45" font-size="2.6" fill="%23475569" font-family="Arial" text-anchor="middle">INPUT: 3-32VDC</text>' +
    '<circle cx="35" cy="50" r="1.8" fill="%23ef4444"/><circle cx="35" cy="50" r="0.8" fill="%23fca5a5"/>' +
    '<rect x="14" y="58" width="12" height="12" rx="1.5" fill="%2318181b" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="20" cy="64" r="3" fill="%23cbd5e1"/><line x1="18" y1="64" x2="22" y2="64" stroke="%230f172a" stroke-width="0.8"/>' +
    '<rect x="44" y="58" width="12" height="12" rx="1.5" fill="%2318181b" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="50" cy="64" r="3" fill="%23cbd5e1"/><line x1="48" y1="64" x2="52" y2="64" stroke="%230f172a" stroke-width="0.8"/>' +
    '<text x="20" y="56" font-size="3" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">3 (+)</text>' +
    '<text x="50" y="56" font-size="3" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">4 (−)</text>'
  ),
};

export const componentSvgs: Record<string, string> = {
  ...boardComponentSvgs,
  ...additionalComponentSvgs,

  // ── Boards ──
  ARDUINO_UNO: svg('0 0 200 150',
    '<defs>' +
      '<linearGradient id="uno_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2300979c"/><stop offset="100%25" stop-color="%23008184"/></linearGradient>' +
      '<linearGradient id="uno_usb" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2394a3b8"/><stop offset="35%25" stop-color="%23f8fafc"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="uno_metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="uno_ic" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2318181b"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="200" height="150" rx="7" fill="url(%23uno_pcb)" stroke="%23005f63" stroke-width="1.2"/>' +
    '<path d="M 32 18 L 180 18 L 180 60 L 194 60 L 194 130 L 32 130 Z" fill="none" stroke="%2300a8ad" stroke-width="0.75" opacity="0.35"/>' +
    '<circle cx="28" cy="14" r="4.2" fill="%23cbd5e1"/><circle cx="28" cy="14" r="2.4" fill="%23004649"/>' +
    '<circle cx="28" cy="136" r="4.2" fill="%23cbd5e1"/><circle cx="28" cy="136" r="2.4" fill="%23004649"/>' +
    '<circle cx="186" cy="20" r="4.2" fill="%23cbd5e1"/><circle cx="186" cy="20" r="2.4" fill="%23004649"/>' +
    '<circle cx="186" cy="128" r="4.2" fill="%23cbd5e1"/><circle cx="186" cy="128" r="2.4" fill="%23004649"/>' +
    '<rect x="0" y="23" width="28" height="26" rx="2" fill="url(%23uno_usb)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="0" y="27" width="16" height="18" rx="1.5" fill="%23090d16"/>' +
    '<rect x="2" y="31" width="10" height="2" fill="%23f59e0b"/><rect x="2" y="35" width="10" height="2" fill="%23f59e0b"/><rect x="2" y="39" width="10" height="2" fill="%23f59e0b"/>' +
    '<rect x="18" y="25" width="8" height="22" rx="1" fill="%23475569" opacity="0.4"/>' +
    '<rect x="0" y="85" width="30" height="34" rx="3" fill="%2318181b" stroke="%2327272a" stroke-width="1"/>' +
    '<rect x="0" y="91" width="16" height="22" rx="2" fill="%2309090b"/>' +
    '<rect x="3" y="99" width="9" height="6" rx="3" fill="%2394a3b8"/>' +
    '<rect x="42" y="96" width="16" height="18" rx="1" fill="%2318181b"/>' +
    '<rect x="44" y="93" width="12" height="3" fill="%2394a3b8"/>' +
    '<rect x="44" y="114" width="3" height="5" fill="%23cbd5e1"/><rect x="49" y="114" width="3" height="5" fill="%23cbd5e1"/><rect x="54" y="114" width="3" height="5" fill="%23cbd5e1"/>' +
    '<rect x="38" y="16" width="10" height="10" rx="1.5" fill="url(%23uno_metal)" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="43" cy="21" r="3" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<text x="43" y="12" font-size="5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">RESET</text>' +
    '<rect x="58" y="44" width="18" height="10" rx="5" fill="url(%23uno_metal)" stroke="%2364748b" stroke-width="0.7"/>' +
    '<rect x="54" y="47" width="4" height="4" fill="%23cbd5e1"/><rect x="76" y="47" width="4" height="4" fill="%23cbd5e1"/>' +
    '<text x="67" y="51" font-size="4.5" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">16.000</text>' +
    '<rect x="42" y="34" width="14" height="14" rx="1" fill="%2318181b"/>' +
    '<circle cx="44" cy="36" r="0.8" fill="%233f3f46"/>' +
    '<rect x="94" y="66" width="76" height="24" rx="2" fill="%230f172a" stroke="%23334155" stroke-width="0.8"/>' +
    '<rect x="96" y="68" width="72" height="20" rx="1.5" fill="url(%23uno_ic)" stroke="%233f3f46" stroke-width="0.5"/>' +
    '<path d="M 96 75.5 A 2.5 2.5 0 0 1 96 80.5 Z" fill="%230f172a"/>' +
    '<circle cx="102" cy="83.5" r="1.2" fill="%23090d16"/>' +
    '<text x="132" y="80.5" font-size="6.5" fill="%23d4d4d8" font-family="Arial" font-weight="bold" letter-spacing="0.5" text-anchor="middle">ATMEGA328P-PU</text>' +
    Array.from({ length: 14 }, (_, i) => `<rect x="${97.5 + i * 5}" y="64.5" width="2" height="2" fill="%23cbd5e1"/><rect x="${97.5 + i * 5}" y="89.5" width="2" height="2" fill="%23cbd5e1"/>`).join('') +
    '<rect x="176" y="74" width="10" height="15" rx="1" fill="%2318181b"/>' +
    '<circle cx="179" cy="77" r="1.2" fill="%23f59e0b"/><circle cx="183" cy="77" r="1.2" fill="%23f59e0b"/>' +
    '<circle cx="179" cy="81.5" r="1.2" fill="%23f59e0b"/><circle cx="183" cy="81.5" r="1.2" fill="%23f59e0b"/>' +
    '<circle cx="179" cy="86" r="1.2" fill="%23f59e0b"/><circle cx="183" cy="86" r="1.2" fill="%23f59e0b"/>' +
    '<text x="181" y="71" font-size="4.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">ICSP</text>' +
    '<rect x="33" y="28" width="4" height="3" rx="0.5" fill="%2318181b"/><text x="40" y="31" font-size="4.5" fill="%23ffffff" font-family="Arial" font-weight="bold">ON</text>' +
    '<rect x="33" y="43" width="4" height="3" rx="0.5" fill="%2318181b"/><text x="40" y="46" font-size="4.5" fill="%23ffffff" font-family="Arial" font-weight="bold">L</text>' +
    '<rect x="33" y="57" width="4" height="3" rx="0.5" fill="%2318181b"/><text x="40" y="60" font-size="4.5" fill="%23ffffff" font-family="Arial" font-weight="bold">TX</text>' +
    '<rect x="33" y="68" width="4" height="3" rx="0.5" fill="%2318181b"/><text x="40" y="71" font-size="4.5" fill="%23ffffff" font-family="Arial" font-weight="bold">RX</text>' +
    '<rect x="8" y="2" width="184" height="8.5" rx="1.2" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>' +
    Array.from({ length: 18 }, (_, i) => {
      const x = 10 + i * (180 / 17);
      return `<rect x="${(x - 1.8).toFixed(1)}" y="4.2" width="3.6" height="3.6" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.5"/><circle cx="${x.toFixed(1)}" cy="6" r="0.9" fill="%23f59e0b" opacity="0.6"/>`;
    }).join('') +
    '<text x="100" y="16" font-size="5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">DIGITAL (PWM ~)</text>' +
    '<text x="10" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">SCL</text>' +
    '<text x="21" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">SDA</text>' +
    '<text x="32" y="16" font-size="4" fill="%23ffffff" font-family="Arial">AREF</text>' +
    '<text x="42" y="16" font-size="4" fill="%23ffffff" font-family="Arial">GND</text>' +
    '<text x="53" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">13</text>' +
    '<text x="63" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">12</text>' +
    '<text x="74" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">~11</text>' +
    '<text x="84.5" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">~10</text>' +
    '<text x="95" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">~9</text>' +
    '<text x="106" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">8</text>' +
    '<text x="116.5" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">7</text>' +
    '<text x="127" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">~6</text>' +
    '<text x="137.5" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">~5</text>' +
    '<text x="148" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">4</text>' +
    '<text x="159" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">~3</text>' +
    '<text x="169.5" y="16" font-size="4.2" fill="%23ffffff" font-family="Arial">2</text>' +
    '<text x="180" y="16" font-size="4" fill="%23ffffff" font-family="Arial">TX</text>' +
    '<text x="190.5" y="16" font-size="4" fill="%23ffffff" font-family="Arial">RX</text>' +
    '<rect x="8" y="139.5" width="184" height="8.5" rx="1.2" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>' +
    Array.from({ length: 14 }, (_, i) => {
      const x = 10 + i * (180 / 13);
      return `<rect x="${(x - 1.8).toFixed(1)}" y="142.2" width="3.6" height="3.6" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.5"/><circle cx="${x.toFixed(1)}" cy="144" r="0.9" fill="%23f59e0b" opacity="0.6"/>`;
    }).join('') +
    '<text x="50" y="135" font-size="5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">POWER</text>' +
    '<text x="150" y="135" font-size="5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">ANALOG IN</text>' +
    '<text x="10" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">NC</text>' +
    '<text x="24" y="135" font-size="3.6" fill="%23ffffff" font-family="Arial">IOREF</text>' +
    '<text x="38" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">RST</text>' +
    '<text x="52" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">3.3V</text>' +
    '<text x="66" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">5V</text>' +
    '<text x="79.5" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">GND</text>' +
    '<text x="93.5" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">GND</text>' +
    '<text x="107" y="135" font-size="3.8" fill="%23ffffff" font-family="Arial">VIN</text>' +
    '<text x="121" y="135" font-size="4" fill="%23ffffff" font-family="Arial">A0</text>' +
    '<text x="135" y="135" font-size="4" fill="%23ffffff" font-family="Arial">A1</text>' +
    '<text x="149" y="135" font-size="4" fill="%23ffffff" font-family="Arial">A2</text>' +
    '<text x="162.5" y="135" font-size="4" fill="%23ffffff" font-family="Arial">A3</text>' +
    '<text x="176.5" y="135" font-size="4" fill="%23ffffff" font-family="Arial">A4</text>' +
    '<text x="190.5" y="135" font-size="4" fill="%23ffffff" font-family="Arial">A5</text>' +
    '<text x="132" y="44" font-size="14" fill="%23ffffff" font-family="Arial" font-weight="900" letter-spacing="1">UNO</text>' +
    '<text x="132" y="54" font-size="6.5" fill="%23ffffff" font-family="Arial" font-weight="bold">ARDUINO</text>' +
    '<text x="132" y="104" font-size="5" fill="%23ffffff" font-family="Arial" letter-spacing="0.5">MADE IN ITALY</text>'
  ),
  ARDUINO_MEGA: svg('0 0 280 120',
    '<defs>' +
      '<linearGradient id="mega_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2300979c"/><stop offset="100%25" stop-color="%23008184"/></linearGradient>' +
      '<linearGradient id="mega_usb" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2394a3b8"/><stop offset="35%25" stop-color="%23f8fafc"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="mega_ic" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2318181b"/></linearGradient>' +
    '</defs>' +
    // PCB body
    '<rect width="280" height="120" rx="7" fill="url(%23mega_pcb)" stroke="%23005f63" stroke-width="1.2"/>' +
    // Mounting holes
    '<circle cx="18" cy="10" r="3.8" fill="%23cbd5e1"/><circle cx="18" cy="10" r="2.2" fill="%23004649"/>' +
    '<circle cx="18" cy="110" r="3.8" fill="%23cbd5e1"/><circle cx="18" cy="110" r="2.2" fill="%23004649"/>' +
    '<circle cx="268" cy="10" r="3.8" fill="%23cbd5e1"/><circle cx="268" cy="10" r="2.2" fill="%23004649"/>' +
    '<circle cx="268" cy="110" r="3.8" fill="%23cbd5e1"/><circle cx="268" cy="110" r="2.2" fill="%23004649"/>' +
    // USB-B connector
    '<rect x="0" y="18" width="26" height="24" rx="2" fill="url(%23mega_usb)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="0" y="22" width="14" height="16" rx="1.5" fill="%23090d16"/>' +
    '<rect x="2" y="26" width="8" height="2" fill="%23f59e0b"/><rect x="2" y="30" width="8" height="2" fill="%23f59e0b"/><rect x="2" y="34" width="8" height="2" fill="%23f59e0b"/>' +
    // Barrel jack
    '<rect x="0" y="72" width="28" height="24" rx="3" fill="%2318181b" stroke="%2327272a" stroke-width="1"/>' +
    '<rect x="0" y="78" width="14" height="12" rx="2" fill="%2309090b"/>' +
    '<circle cx="7" cy="84" r="4" fill="%2394a3b8"/><circle cx="7" cy="84" r="2" fill="%230f172a"/>' +
    // Reset button
    '<rect x="36" y="14" width="9" height="9" rx="1.5" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="40.5" cy="18.5" r="2.5" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.4"/>' +
    '<text x="40.5" y="11" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">RST</text>' +
    // Crystal oscillator
    '<rect x="52" y="42" width="16" height="8" rx="4" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.6"/>' +
    '<text x="60" y="48" font-size="3.5" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">16.000</text>' +
    // Status LEDs
    '<rect x="32" y="28" width="3.5" height="2.5" rx="0.5" fill="%2318181b"/><text x="38" y="30.5" font-size="3.5" fill="%23ffffff" font-family="Arial">ON</text>' +
    '<rect x="32" y="36" width="3.5" height="2.5" rx="0.5" fill="%2318181b"/><text x="38" y="38.5" font-size="3.5" fill="%23ffffff" font-family="Arial">L</text>' +
    '<rect x="32" y="44" width="3.5" height="2.5" rx="0.5" fill="%2318181b"/><text x="38" y="46.5" font-size="3.5" fill="%23ffffff" font-family="Arial">TX</text>' +
    '<rect x="32" y="52" width="3.5" height="2.5" rx="0.5" fill="%2318181b"/><text x="38" y="54.5" font-size="3.5" fill="%23ffffff" font-family="Arial">RX</text>' +
    // ATmega2560 main IC
    '<rect x="78" y="44" width="80" height="28" rx="2" fill="%230f172a" stroke="%23334155" stroke-width="0.8"/>' +
    '<rect x="80" y="46" width="76" height="24" rx="1.5" fill="url(%23mega_ic)" stroke="%233f3f46" stroke-width="0.5"/>' +
    '<path d="M 80 55 A 2.5 2.5 0 0 1 80 60 Z" fill="%230f172a"/>' +
    '<text x="118" y="60" font-size="5.5" fill="%23d4d4d8" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.5">ATMEGA2560-16AU</text>' +
    '<text x="118" y="66" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ATMEL 2430</text>' +
    // ICSP header
    '<rect x="264" y="50" width="10" height="14" rx="1" fill="%2318181b"/>' +
    '<circle cx="267" cy="53" r="1" fill="%23f59e0b"/><circle cx="271" cy="53" r="1" fill="%23f59e0b"/>' +
    '<circle cx="267" cy="57" r="1" fill="%23f59e0b"/><circle cx="271" cy="57" r="1" fill="%23f59e0b"/>' +
    '<circle cx="267" cy="61" r="1" fill="%23f59e0b"/><circle cx="271" cy="61" r="1" fill="%23f59e0b"/>' +
    '<text x="269" y="48" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">ICSP</text>' +
    // Top digital pin header (54 pins = long row)
    '<rect x="8" y="2" width="264" height="8" rx="1.2" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>' +
    Array.from({ length: 26 }, (_, i) => {
      const x = 12 + i * (258 / 25);
      return `<rect x="${(x - 1.5).toFixed(1)}" y="3.5" width="3" height="4" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.4"/><circle cx="${x.toFixed(1)}" cy="5.5" r="0.7" fill="%23f59e0b" opacity="0.6"/>`;
    }).join('') +
    '<text x="140" y="16" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">DIGITAL (PWM ~) 0-53</text>' +
    // Bottom analog/power pin header
    '<rect x="8" y="110" width="264" height="8" rx="1.2" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>' +
    Array.from({ length: 18 }, (_, i) => {
      const x = 12 + i * (258 / 17);
      return `<rect x="${(x - 1.5).toFixed(1)}" y="112" width="3" height="4" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.4"/><circle cx="${x.toFixed(1)}" cy="114" r="0.7" fill="%23f59e0b" opacity="0.6"/>`;
    }).join('') +
    '<text x="60" y="108" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">POWER</text>' +
    '<text x="200" y="108" font-size="4" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">ANALOG IN A0-A15</text>' +
    // Board labels
    '<text x="200" y="38" font-size="14" fill="%23ffffff" font-family="Arial" font-weight="900" letter-spacing="1">MEGA</text>' +
    '<text x="200" y="48" font-size="6.5" fill="%23ffffff" font-family="Arial" font-weight="bold">ARDUINO 2560</text>' +
    '<text x="200" y="90" font-size="4.5" fill="%23ffffff" font-family="Arial" letter-spacing="0.5">MADE IN ITALY</text>'
  ),
  ARDUINO_NANO: svg('0 0 100 160',
    '<defs>' +
      '<linearGradient id="nano_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2300979c"/><stop offset="100%25" stop-color="%23008184"/></linearGradient>' +
      '<linearGradient id="nano_usb" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2394a3b8"/><stop offset="35%25" stop-color="%23f8fafc"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect width="100" height="160" rx="4" fill="url(%23nano_pcb)" stroke="%23005f63" stroke-width="1"/>' +
    // USB Mini connector
    '<rect x="28" y="0" width="44" height="16" rx="2" fill="url(%23nano_usb)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="34" y="0" width="32" height="8" rx="1.5" fill="%23090d16"/>' +
    '<rect x="38" y="2" width="6" height="2" fill="%23f59e0b"/><rect x="46" y="2" width="6" height="2" fill="%23f59e0b"/><rect x="54" y="2" width="6" height="2" fill="%23f59e0b"/>' +
    // Mounting holes
    '<circle cx="10" cy="8" r="2.8" fill="%23cbd5e1"/><circle cx="10" cy="8" r="1.6" fill="%23004649"/>' +
    '<circle cx="10" cy="152" r="2.8" fill="%23cbd5e1"/><circle cx="10" cy="152" r="1.6" fill="%23004649"/>' +
    '<circle cx="90" cy="8" r="2.8" fill="%23cbd5e1"/><circle cx="90" cy="8" r="1.6" fill="%23004649"/>' +
    '<circle cx="90" cy="152" r="2.8" fill="%23cbd5e1"/><circle cx="90" cy="152" r="1.6" fill="%23004649"/>' +
    // ATmega328P IC
    '<rect x="30" y="56" width="40" height="32" rx="2" fill="%230f172a" stroke="%23334155" stroke-width="0.7"/>' +
    '<rect x="32" y="58" width="36" height="28" rx="1.5" fill="%2318181b" stroke="%233f3f46" stroke-width="0.4"/>' +
    '<path d="M 32 68 A 2 2 0 0 1 32 74 Z" fill="%230f172a"/>' +
    '<text x="50" y="74" font-size="5.5" fill="%23d4d4d8" font-family="Arial" font-weight="bold" text-anchor="middle">328P</text>' +
    '<text x="50" y="80" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ATMEL</text>' +
    // Crystal
    '<rect x="40" y="44" width="12" height="6" rx="3" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/>' +
    '<text x="46" y="49" font-size="3" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">16M</text>' +
    // Reset button
    '<rect x="72" y="22" width="8" height="8" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/>' +
    '<circle cx="76" cy="26" r="2.5" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.4"/>' +
    // Status LEDs
    '<rect x="18" y="22" width="3" height="2" rx="0.4" fill="%2318181b"/><text x="22" y="24" font-size="3" fill="%23ffffff" font-family="Arial">ON</text>' +
    '<rect x="18" y="28" width="3" height="2" rx="0.4" fill="%2318181b"/><text x="22" y="30" font-size="3" fill="%23ffffff" font-family="Arial">L</text>' +
    '<rect x="18" y="34" width="3" height="2" rx="0.4" fill="%2318181b"/><text x="22" y="36" font-size="3" fill="%23ffffff" font-family="Arial">TX</text>' +
    '<rect x="18" y="40" width="3" height="2" rx="0.4" fill="%2318181b"/><text x="22" y="42" font-size="3" fill="%23ffffff" font-family="Arial">RX</text>' +
    // Left pin header
    '<rect x="2" y="24" width="7" height="122" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 15 }, (_, i) => {
      const y = 28 + i * 8;
      return `<rect x="3.5" y="${y}" width="4" height="3.5" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.3"/><circle cx="5.5" cy="${y + 1.75}" r="0.7" fill="%23f59e0b" opacity="0.6"/>`;
    }).join('') +
    // Right pin header
    '<rect x="91" y="24" width="7" height="122" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 15 }, (_, i) => {
      const y = 28 + i * 8;
      return `<rect x="92.5" y="${y}" width="4" height="3.5" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.3"/><circle cx="94.5" cy="${y + 1.75}" r="0.7" fill="%23f59e0b" opacity="0.6"/>`;
    }).join('') +
    // Labels
    '<text x="50" y="102" font-size="12" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="1">NANO</text>' +
    '<text x="50" y="114" font-size="6" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">ARDUINO</text>' +
    '<text x="50" y="135" font-size="4" fill="%23ffffff" font-family="Arial" text-anchor="middle" letter-spacing="0.5">V3.0 ATmega328P</text>'
  ),
  ESP32: svg('0 0 100 160',
    '<defs>' +
      '<linearGradient id="esp_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23111827"/><stop offset="100%25" stop-color="%230a0f1a"/></linearGradient>' +
      '<linearGradient id="esp_rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23374151"/><stop offset="50%25" stop-color="%231f2937"/><stop offset="100%25" stop-color="%23111827"/></linearGradient>' +
    '</defs>' +
    '<rect width="100" height="160" rx="4" fill="url(%23esp_pcb)" stroke="%23374151" stroke-width="1"/>' +
    // RF shielded module at top
    '<rect x="10" y="6" width="80" height="44" rx="3" fill="url(%23esp_rf)" stroke="%234b5563" stroke-width="0.8"/>' +
    // Antenna pattern
    '<rect x="32" y="2" width="36" height="12" rx="1" fill="%23111827" stroke="%234b5563" stroke-width="0.6"/>' +
    '<path d="M 38 4 L 38 12 M 42 4 L 42 12 M 46 4 L 46 12 M 50 4 L 50 12 M 54 4 L 54 12 M 58 4 L 58 12 M 62 4 L 62 12" stroke="%2310b981" stroke-width="0.6" opacity="0.6"/>' +
    '<path d="M 36 6 L 64 6 M 36 8 L 64 8 M 36 10 L 64 10" stroke="%2310b981" stroke-width="0.4" opacity="0.4"/>' +
    // Module label
    '<text x="50" y="28" font-size="6" fill="%23d1d5db" font-family="Arial" font-weight="bold" text-anchor="middle">ESP-WROOM-32</text>' +
    '<text x="50" y="38" font-size="4" fill="%239ca3af" font-family="Arial" text-anchor="middle">FCC ID: 2AC7Z</text>' +
    '<text x="50" y="46" font-size="3.5" fill="%236b7280" font-family="Arial" text-anchor="middle">Espressif Systems</text>' +
    // USB Micro connector
    '<rect x="33" y="150" width="34" height="10" rx="2" fill="%23c0c0c0" stroke="%23475569" stroke-width="0.7"/>' +
    '<rect x="37" y="152" width="26" height="6" rx="1" fill="%23090d16"/>' +
    // EN & BOOT buttons
    '<rect x="16" y="56" width="10" height="6" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="21" cy="59" r="2" fill="%230f172a"/>' +
    '<text x="21" y="54" font-size="3" fill="%2310b981" font-family="Arial" font-weight="bold" text-anchor="middle">EN</text>' +
    '<rect x="74" y="56" width="10" height="6" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="79" cy="59" r="2" fill="%230f172a"/>' +
    '<text x="79" y="54" font-size="3" fill="%2310b981" font-family="Arial" font-weight="bold" text-anchor="middle">BOOT</text>' +
    // Power LED
    '<rect x="42" y="58" width="3" height="2" rx="0.5" fill="%23ef4444"/>' +
    '<text x="48" y="60" font-size="2.8" fill="%239ca3af" font-family="Arial">PWR</text>' +
    // Left pin header
    '<rect x="2" y="66" width="7" height="78" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 10 }, (_, i) => {
      const y = 70 + i * 7.2;
      return `<rect x="3.5" y="${y.toFixed(1)}" width="4" height="3.5" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.3"/><circle cx="5.5" cy="${(y + 1.75).toFixed(1)}" r="0.7" fill="%23eab308" opacity="0.6"/>`;
    }).join('') +
    // Right pin header
    '<rect x="91" y="66" width="7" height="78" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 10 }, (_, i) => {
      const y = 70 + i * 7.2;
      return `<rect x="92.5" y="${y.toFixed(1)}" width="4" height="3.5" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.3"/><circle cx="94.5" cy="${(y + 1.75).toFixed(1)}" r="0.7" fill="%23eab308" opacity="0.6"/>`;
    }).join('') +
    // Board labels
    '<text x="50" y="106" font-size="16" fill="%2310b981" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="2">ESP32</text>' +
    '<text x="50" y="118" font-size="5" fill="%239ca3af" font-family="Arial" text-anchor="middle">DevKitC V4</text>' +
    '<text x="50" y="138" font-size="3.5" fill="%236b7280" font-family="Arial" text-anchor="middle">Dual Core 240MHz</text>'
  ),
  ESP32_S3: svg('0 0 100 160',
    '<defs>' +
      '<linearGradient id="esp3_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23111827"/><stop offset="100%25" stop-color="%230a0f1a"/></linearGradient>' +
      '<linearGradient id="esp3_rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23374151"/><stop offset="50%25" stop-color="%231f2937"/><stop offset="100%25" stop-color="%23111827"/></linearGradient>' +
    '</defs>' +
    '<rect width="100" height="160" rx="4" fill="url(%23esp3_pcb)" stroke="%23374151" stroke-width="1"/>' +
    // RF shielded module at top
    '<rect x="10" y="6" width="80" height="44" rx="3" fill="url(%23esp3_rf)" stroke="%234b5563" stroke-width="0.8"/>' +
    // Antenna
    '<rect x="32" y="2" width="36" height="12" rx="1" fill="%23111827" stroke="%234b5563" stroke-width="0.6"/>' +
    '<path d="M 38 4 L 38 12 M 42 4 L 42 12 M 46 4 L 46 12 M 50 4 L 50 12 M 54 4 L 54 12 M 58 4 L 58 12 M 62 4 L 62 12" stroke="%238b5cf6" stroke-width="0.6" opacity="0.6"/>' +
    '<path d="M 36 6 L 64 6 M 36 8 L 64 8 M 36 10 L 64 10" stroke="%238b5cf6" stroke-width="0.4" opacity="0.4"/>' +
    // Module label
    '<text x="50" y="28" font-size="5.5" fill="%23d1d5db" font-family="Arial" font-weight="bold" text-anchor="middle">ESP32-S3-WROOM</text>' +
    '<text x="50" y="38" font-size="4" fill="%239ca3af" font-family="Arial" text-anchor="middle">FCC: 2AC7Z-S3</text>' +
    '<text x="50" y="46" font-size="3.5" fill="%236b7280" font-family="Arial" text-anchor="middle">Espressif Systems</text>' +
    // USB-C connector
    '<rect x="33" y="150" width="34" height="10" rx="3" fill="%23c0c0c0" stroke="%23475569" stroke-width="0.7"/>' +
    '<rect x="37" y="152" width="26" height="6" rx="2" fill="%23090d16"/>' +
    '<text x="50" y="156.5" font-size="3" fill="%238b5cf6" font-family="Arial" font-weight="bold" text-anchor="middle">USB-C</text>' +
    // Buttons
    '<rect x="16" y="56" width="10" height="6" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="21" cy="59" r="2" fill="%230f172a"/>' +
    '<text x="21" y="54" font-size="3" fill="%238b5cf6" font-family="Arial" font-weight="bold" text-anchor="middle">RST</text>' +
    '<rect x="74" y="56" width="10" height="6" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="79" cy="59" r="2" fill="%230f172a"/>' +
    '<text x="79" y="54" font-size="3" fill="%238b5cf6" font-family="Arial" font-weight="bold" text-anchor="middle">BOOT</text>' +
    // Addressable RGB LED
    '<rect x="42" y="58" width="3" height="2" rx="0.5" fill="%238b5cf6"/>' +
    '<text x="48" y="60" font-size="2.8" fill="%239ca3af" font-family="Arial">RGB</text>' +
    // Left pin header
    '<rect x="2" y="66" width="7" height="78" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 10 }, (_, i) => {
      const y = 70 + i * 7.2;
      return `<rect x="3.5" y="${y.toFixed(1)}" width="4" height="3.5" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.3"/><circle cx="5.5" cy="${(y + 1.75).toFixed(1)}" r="0.7" fill="%23eab308" opacity="0.6"/>`;
    }).join('') +
    // Right pin header
    '<rect x="91" y="66" width="7" height="78" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.6"/>' +
    Array.from({ length: 10 }, (_, i) => {
      const y = 70 + i * 7.2;
      return `<rect x="92.5" y="${y.toFixed(1)}" width="4" height="3.5" rx="0.5" fill="%2309090b" stroke="%233f3f46" stroke-width="0.3"/><circle cx="94.5" cy="${(y + 1.75).toFixed(1)}" r="0.7" fill="%23eab308" opacity="0.6"/>`;
    }).join('') +
    // Board labels
    '<text x="50" y="102" font-size="13" fill="%2310b981" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="1">ESP32-S3</text>' +
    '<text x="50" y="116" font-size="5" fill="%238b5cf6" font-family="Arial" font-weight="bold" text-anchor="middle">USB-OTG</text>' +
    '<text x="50" y="130" font-size="3.5" fill="%236b7280" font-family="Arial" text-anchor="middle">Xtensa LX7 240MHz</text>'
  ),
  ESP8266: svg('0 0 95 150',
    '<defs>' +
      '<linearGradient id="esp8266_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
      '<linearGradient id="esp8266_rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23cbd5e1"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    // PCB Body
    '<rect width="95" height="150" rx="5" fill="url(%23esp8266_pcb)" stroke="%23334155" stroke-width="1"/>' +
    // 4 Corner mounting holes
    '<circle cx="8" cy="8" r="2.8" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<circle cx="87" cy="8" r="2.8" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<circle cx="8" cy="142" r="2.8" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<circle cx="87" cy="142" r="2.8" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    // Meandering gold PCB antenna at top
    '<rect x="25" y="4" width="45" height="18" rx="1.5" fill="%231e293b" stroke="%23b45309" stroke-width="0.5"/>' +
    '<path d="M 28 8 L 67 8 M 32 8 L 32 18 M 38 8 L 38 18 M 44 8 L 44 18 M 50 8 L 50 18 M 56 8 L 56 18 M 62 8 L 62 18" stroke="%23f59e0b" stroke-width="1.2" stroke-linecap="round"/>' +
    // ESP-12E RF Shielding Can
    '<rect x="18" y="24" width="59" height="52" rx="2" fill="url(%23esp8266_rf)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="23" cy="29" r="1.5" fill="%23475569"/>' +
    '<text x="47.5" y="40" font-size="5.5" fill="%231e293b" font-family="Arial" font-weight="900" text-anchor="middle">AI-THINKER</text>' +
    '<text x="47.5" y="48" font-size="4.2" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">ESP8266MOD</text>' +
    '<text x="47.5" y="55" font-size="3" fill="%23475569" font-family="Arial" text-anchor="middle">ISM 2.4GHz</text>' +
    '<text x="47.5" y="61" font-size="2.6" fill="%23475569" font-family="Arial" text-anchor="middle">FCC ID: 2ADUIESP-12</text>' +
    // CP2102 USB-to-UART chip
    '<rect x="36" y="90" width="23" height="23" rx="1.5" fill="%2309090b" stroke="%2327272a" stroke-width="0.6"/>' +
    '<circle cx="40" cy="94" r="0.8" fill="%2371717a"/>' +
    '<text x="47.5" y="100" font-size="3.5" fill="%23e4e4e7" font-family="Arial" font-weight="bold" text-anchor="middle">SILABS</text>' +
    '<text x="47.5" y="105" font-size="3" fill="%23a1a1aa" font-family="Arial" text-anchor="middle">CP2102</text>' +
    // Micro-USB connector at bottom
    '<rect x="31" y="140" width="33" height="10" rx="2" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.8"/>' +
    '<rect x="36" y="142" width="23" height="6" rx="1" fill="%230f172a"/>' +
    // Flash & Reset buttons
    '<rect x="18" y="124" width="8" height="8" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="22" cy="128" r="2.2" fill="%23ef4444"/>' +
    '<text x="22" y="121" font-size="2.6" fill="%23f87171" font-family="Arial" font-weight="bold" text-anchor="middle">RST</text>' +
    '<rect x="69" y="124" width="8" height="8" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="73" cy="128" r="2.2" fill="%230f172a"/>' +
    '<text x="73" y="121" font-size="2.6" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">FLASH</text>' +
    // Left pin header: y = 15, 30, 45, 60, 75, 90, 105, 120 at x=0
    '<rect x="1" y="10" width="7" height="116" rx="1" fill="%230f172a" stroke="%23334155" stroke-width="0.5"/>' +
    [15, 30, 45, 60, 75, 90, 105, 120].map((y, i) => {
      const labels = ['A0', 'GND', 'D0', 'D1', 'D2', 'D3', 'D4', '3V3'];
      return `<circle cx="4.5" cy="${y}" r="2" fill="%23f59e0b" stroke="%23b45309" stroke-width="0.3"/><circle cx="4.5" cy="${y}" r="0.9" fill="%230f172a"/><text x="10" y="${y + 2}" font-size="3" fill="%2394a3b8" font-family="Arial" font-weight="bold">${labels[i]}</text>`;
    }).join('') +
    // Right pin header: y = 15, 30, 45, 60, 75, 90, 105, 120 at x=95
    '<rect x="87" y="10" width="7" height="116" rx="1" fill="%230f172a" stroke="%23334155" stroke-width="0.5"/>' +
    [15, 30, 45, 60, 75, 90, 105, 120].map((y, i) => {
      const labels = ['VIN', 'GND', 'D5', 'D6', 'D7', 'D8', 'RX', 'TX'];
      return `<circle cx="90.5" cy="${y}" r="2" fill="%23f59e0b" stroke="%23b45309" stroke-width="0.3"/><circle cx="90.5" cy="${y}" r="0.9" fill="%230f172a"/><text x="85" y="${y + 2}" font-size="3" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="end">${labels[i]}</text>`;
    }).join('') +
    // Board label
    '<text x="47.5" y="84" font-size="5" fill="%2338bdf8" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="1">NodeMCU V3</text>'
  ),
  RASPBERRY_PI_PICO: svg('0 0 100 180',
    '<defs>' +
      '<linearGradient id="pico_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23059669"/><stop offset="50%25" stop-color="%23047857"/><stop offset="100%25" stop-color="%23064e3b"/></linearGradient>' +
      '<linearGradient id="pico_usb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23e2e8f0"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    // Green PCB with rounded corners
    '<rect width="100" height="180" rx="6" fill="url(%23pico_pcb)" stroke="%23064e3b" stroke-width="1.2"/>' +
    // 4 Corner mounting holes
    '<circle cx="8" cy="18" r="2.8" fill="%23022c22" stroke="%2334d399" stroke-width="0.5"/>' +
    '<circle cx="92" cy="18" r="2.8" fill="%23022c22" stroke="%2334d399" stroke-width="0.5"/>' +
    '<circle cx="8" cy="162" r="2.8" fill="%23022c22" stroke="%2334d399" stroke-width="0.5"/>' +
    '<circle cx="92" cy="162" r="2.8" fill="%23022c22" stroke="%2334d399" stroke-width="0.5"/>' +
    // Micro-USB at top
    '<rect x="36" y="0" width="28" height="14" rx="2" fill="url(%23pico_usb)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="40" y="0" width="20" height="8" rx="1.5" fill="%23090d16"/>' +
    // RP2040 Chip rotated at 45° in the middle
    '<g transform="translate(50, 95) rotate(45)">' +
      '<rect x="-14" y="-14" width="28" height="28" rx="2" fill="%230f172a" stroke="%23334155" stroke-width="0.8"/>' +
      '<circle cx="-10" cy="-10" r="1" fill="%2371717a"/>' +
      '<text x="0" y="-1" font-size="4" fill="%23e2e8f0" font-family="Arial" font-weight="900" text-anchor="middle">RP2040</text>' +
      '<text x="0" y="5" font-size="2.6" fill="%2394a3b8" font-family="Arial" text-anchor="middle">Raspberry Pi</text>' +
    '</g>' +
    // Winbond SPI Flash IC
    '<rect x="41" y="42" width="18" height="14" rx="1" fill="%2318181b" stroke="%23334155" stroke-width="0.6"/>' +
    '<text x="50" y="50" font-size="2.6" fill="%23a1a1aa" font-family="Arial" text-anchor="middle">W25Q16JV</text>' +
    // BOOTSEL push-button
    '<rect x="22" y="38" width="10" height="8" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/>' +
    '<circle cx="27" cy="42" r="2.5" fill="%23ffffff"/>' +
    '<text x="27" y="35" font-size="2.6" fill="%23a7f3d0" font-family="Arial" font-weight="bold" text-anchor="middle">BOOTSEL</text>' +
    // 12MHz crystal
    '<rect x="68" y="38" width="12" height="7" rx="3.5" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/>' +
    '<text x="74" y="43" font-size="2.6" fill="%23334155" font-family="Arial" text-anchor="middle">12MHz</text>' +
    // Debug 3-pin SWD header at bottom
    '<rect x="40" y="162" width="20" height="7" rx="1" fill="%230f172a"/>' +
    '<circle cx="44" cy="165.5" r="1.2" fill="%23f59e0b"/><circle cx="50" cy="165.5" r="1.2" fill="%23f59e0b"/><circle cx="56" cy="165.5" r="1.2" fill="%23f59e0b"/>' +
    '<text x="50" y="176" font-size="2.6" fill="%23a7f3d0" font-family="Arial" text-anchor="middle">DEBUG</text>' +
    // Left castellated pins: 20 pins, y = 10 + i * 8.4 at x=0
    Array.from({ length: 20 }, (_, i) => {
      const y = 10 + i * 8.4;
      return `<path d="M 0 ${(y - 2.5).toFixed(1)} L 5 ${(y - 2.5).toFixed(1)} A 2.5 2.5 0 0 1 5 ${(y + 2.5).toFixed(1)} L 0 ${(y + 2.5).toFixed(1)} Z" fill="%23eab308" stroke="%23ca8a04" stroke-width="0.3"/><circle cx="5" cy="${y.toFixed(1)}" r="1.2" fill="%23064e3b"/>`;
    }).join('') +
    // Right castellated pins: 20 pins, y = 10 + i * 8.4 at x=100
    Array.from({ length: 20 }, (_, i) => {
      const y = 10 + i * 8.4;
      return `<path d="M 100 ${(y - 2.5).toFixed(1)} L 95 ${(y - 2.5).toFixed(1)} A 2.5 2.5 0 0 0 95 ${(y + 2.5).toFixed(1)} L 100 ${(y + 2.5).toFixed(1)} Z" fill="%23eab308" stroke="%23ca8a04" stroke-width="0.3"/><circle cx="95" cy="${y.toFixed(1)}" r="1.2" fill="%23064e3b"/>`;
    }).join('') +
    // Raspberry Pi logo & text
    '<text x="50" y="138" font-size="7" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle">Raspberry Pi Pico</text>' +
    '<text x="50" y="146" font-size="4" fill="%23a7f3d0" font-family="Arial" text-anchor="middle">\u00A9 2020 RP2040</text>'
  ),
  STM32_BLUE_PILL: svg('0 0 110 170',
    '<defs>' +
      '<linearGradient id="stm_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231d4ed8"/><stop offset="50%25" stop-color="%231e40af"/><stop offset="100%25" stop-color="%23172554"/></linearGradient>' +
      '<linearGradient id="stm_ic" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2318181b"/></linearGradient>' +
    '</defs>' +
    // Blue PCB
    '<rect width="110" height="170" rx="5" fill="url(%23stm_pcb)" stroke="%231e3a8a" stroke-width="1.2"/>' +
    // Micro-USB connector at top center
    '<rect x="41" y="0" width="28" height="14" rx="2" fill="%23cbd5e1" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="45" y="0" width="20" height="8" rx="1.5" fill="%230f172a"/>' +
    // Reset tactile button
    '<rect x="22" y="18" width="8" height="8" rx="1" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="26" cy="22" r="2.2" fill="%23ef4444"/>' +
    '<text x="26" y="31" font-size="2.6" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">RESET</text>' +
    // Yellow BOOT0 and BOOT1 jumpers
    '<rect x="76" y="16" width="12" height="18" rx="1" fill="%23eab308" stroke="%23ca8a04" stroke-width="0.6"/>' +
    '<circle cx="80" cy="20" r="1" fill="%230f172a"/><circle cx="84" cy="20" r="1" fill="%230f172a"/>' +
    '<circle cx="80" cy="25" r="1" fill="%230f172a"/><circle cx="84" cy="25" r="1" fill="%230f172a"/>' +
    '<circle cx="80" cy="30" r="1" fill="%230f172a"/><circle cx="84" cy="30" r="1" fill="%230f172a"/>' +
    '<text x="82" y="14" font-size="2.6" fill="%23fef08a" font-family="Arial" font-weight="bold" text-anchor="middle">BOOT</text>' +
    // STM32F103C8T6 48-pin LQFP IC in center
    '<rect x="36" y="60" width="38" height="38" rx="2" fill="url(%23stm_ic)" stroke="%233f3f46" stroke-width="0.8"/>' +
    '<circle cx="41" cy="65" r="1.2" fill="%2371717a"/>' +
    '<text x="55" y="75" font-size="4.2" fill="%23f4f4f5" font-family="Arial" font-weight="bold" text-anchor="middle">STM32F103</text>' +
    '<text x="55" y="81" font-size="3.5" fill="%23cbd5e1" font-family="Arial" text-anchor="middle">C8T6 ARM</text>' +
    '<text x="55" y="88" font-size="3" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ST Micro</text>' +
    // 8.000MHz main crystal
    '<rect x="44" y="44" width="22" height="8" rx="4" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/>' +
    '<text x="55" y="50" font-size="3" fill="%23334155" font-family="Arial" font-weight="bold" text-anchor="middle">8.000 MHz</text>' +
    // 32.768kHz RTC cylindrical crystal
    '<rect x="25" y="70" width="5" height="16" rx="2.5" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/>' +
    // SWD 4-pin programming header at bottom
    '<rect x="38" y="152" width="34" height="8" rx="1" fill="%231e293b"/>' +
    '<circle cx="43" cy="156" r="1.4" fill="%23f59e0b"/><circle cx="51" cy="156" r="1.4" fill="%23f59e0b"/><circle cx="59" cy="156" r="1.4" fill="%23f59e0b"/><circle cx="67" cy="156" r="1.4" fill="%23f59e0b"/>' +
    '<text x="55" y="167" font-size="2.6" fill="%2393c5fd" font-family="Arial" text-anchor="middle">3.3V  DIO  CLK  GND</text>' +
    // Left header (14 pins): y = 12 + i * 10 at x=0
    '<rect x="1" y="7" width="8" height="142" rx="1" fill="%230f172a" stroke="%23334155" stroke-width="0.5"/>' +
    Array.from({ length: 14 }, (_, i) => {
      const y = 12 + i * 10;
      return `<circle cx="5" cy="${y}" r="2" fill="%23f59e0b" stroke="%23b45309" stroke-width="0.3"/><circle cx="5" cy="${y}" r="0.9" fill="%230f172a"/>`;
    }).join('') +
    // Right header (15 pins): y = 12 + i * 10 at x=110
    '<rect x="101" y="7" width="8" height="152" rx="1" fill="%230f172a" stroke="%23334155" stroke-width="0.5"/>' +
    Array.from({ length: 15 }, (_, i) => {
      const y = 12 + i * 10;
      return `<circle cx="105" cy="${y}" r="2" fill="%23f59e0b" stroke="%23b45309" stroke-width="0.3"/><circle cx="105" cy="${y}" r="0.9" fill="%230f172a"/>`;
    }).join('') +
    // Board text
    '<text x="55" y="112" font-size="6" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle">STM32 Blue Pill</text>' +
    '<text x="55" y="120" font-size="3.5" fill="%2393c5fd" font-family="Arial" text-anchor="middle">Cortex-M3 72MHz</text>'
  ),

  // ── LEDs ──
  LED_STANDARD: svg('0 0 40 80',
    '<defs>' +
      '<linearGradient id="led_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="led_glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23fca5a5" stop-opacity="0.85"/><stop offset="35%25" stop-color="%23ef4444" stop-opacity="0.75"/><stop offset="100%25" stop-color="%23991b1b" stop-opacity="0.9"/></linearGradient>' +
    '</defs>' +
    '<path d="M 15 42 L 15 50 L 14 53 L 14 57 L 15 60 L 15 80 L 17.2 80 L 17.2 60 L 16.2 57 L 16.2 53 L 17.2 50 L 17.2 42 Z" fill="url(%23led_lead)"/>' +
    '<path d="M 23 42 L 23 80 L 25.2 80 L 25.2 42 Z" fill="url(%23led_lead)"/>' +
    '<rect x="15" y="27" width="2.2" height="15" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="0.4"/>' +
    '<path d="M 22.8 42 L 22.8 28 L 20 24 L 25.5 24 L 25 42 Z" fill="%23e2e8f0" stroke="%2394a3b8" stroke-width="0.4"/>' +
    '<rect x="21.5" y="24" width="2" height="1.8" fill="%23fbbf24"/>' +
    '<path d="M 16.5 27 Q 18.5 20.5 22 24" fill="none" stroke="%23f59e0b" stroke-width="0.6" stroke-linecap="round"/>' +
    '<path d="M 7 38 L 7 42 L 31 42 L 31 38 Z" fill="url(%23led_glass)" stroke="%237f1d1d" stroke-width="0.6"/>' +
    '<line x1="31" y1="38" x2="31" y2="42" stroke="%23fca5a5" stroke-width="1.2"/>' +
    '<path d="M 9 24 C 9 13.5 13.5 8 20 8 C 26.5 8 31 13.5 31 24 L 31 38 L 9 38 Z" fill="url(%23led_glass)" stroke="%23991b1b" stroke-width="0.8"/>' +
    '<path d="M 13 15 C 15 11 18 9.5 22 9.5" fill="none" stroke="%23ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>' +
    '<ellipse cx="14" cy="22" rx="1.5" ry="5" fill="%23ffffff" opacity="0.35"/>'
  ),
  LED_RGB: svg('0 0 50 80',
    '<defs>' +
      '<linearGradient id="rgb_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="rgb_glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23ffffff" stop-opacity="0.95"/><stop offset="40%25" stop-color="%23f1f5f9" stop-opacity="0.8"/><stop offset="100%25" stop-color="%23cbd5e1" stop-opacity="0.85"/></linearGradient>' +
    '</defs>' +
    '<rect x="13" y="42" width="2" height="38" fill="url(%23rgb_lead)"/>' +
    '<rect x="20" y="42" width="2" height="38" fill="url(%23rgb_lead)"/>' +
    '<rect x="27" y="42" width="2" height="38" fill="url(%23rgb_lead)"/>' +
    '<rect x="34" y="42" width="2" height="38" fill="url(%23rgb_lead)"/>' +
    '<rect x="13" y="28" width="2" height="14" fill="%23cbd5e1"/>' +
    '<path d="M 20 42 L 20 26 L 18 22 L 31 22 L 29 26 L 22 26 L 22 42 Z" fill="%23e2e8f0"/>' +
    '<rect x="27" y="28" width="2" height="14" fill="%23cbd5e1"/>' +
    '<rect x="34" y="28" width="2" height="14" fill="%23cbd5e1"/>' +
    '<rect x="20" y="22" width="2" height="1.8" fill="%23ef4444"/>' +
    '<rect x="24" y="22" width="2" height="1.8" fill="%2322c55e"/>' +
    '<rect x="28" y="22" width="2" height="1.8" fill="%233b82f6"/>' +
    '<path d="M 10 38 L 10 42 L 40 42 L 40 38 Z" fill="url(%23rgb_glass)" stroke="%2394a3b8" stroke-width="0.6"/>' +
    '<path d="M 12 24 C 12 13 17 7 25 7 C 33 7 38 13 38 24 L 38 38 L 12 38 Z" fill="url(%23rgb_glass)" stroke="%2394a3b8" stroke-width="0.8"/>' +
    '<path d="M 16 14 C 18 10 22 8.5 27 8.5" fill="none" stroke="%23ffffff" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>'
  ),
  // ── Sensors ──
  // ── Sensors ──
  SENSOR_PIR: svg('0 0 60 70',
    '<defs>' +
      '<linearGradient id="pir_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23059669"/><stop offset="50%25" stop-color="%23047857"/><stop offset="100%25" stop-color="%23064e3b"/></linearGradient>' +
      '<radialGradient id="pir_dome" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="50%25" stop-color="%23f1f5f9"/><stop offset="85%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></radialGradient>' +
      '<linearGradient id="pir_pin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    // PCB
    '<rect x="2" y="8" width="56" height="58" rx="3.5" fill="url(%23pir_pcb)" stroke="%23064e3b" stroke-width="0.8"/>' +
    // Corner mounting holes
    '<circle cx="6" cy="12" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<circle cx="54" cy="12" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<circle cx="6" cy="62" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<circle cx="54" cy="62" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    // Trimpots (Time & Sensitivity)
    '<rect x="6" y="24" width="7" height="12" rx="1" fill="%23ea580c" stroke="%239a3412" stroke-width="0.5"/>' +
    '<circle cx="9.5" cy="30" r="2.2" fill="%23e2e8f0" stroke="%23475569" stroke-width="0.3"/><line x1="8" y1="30" x2="11" y2="30" stroke="%230f172a" stroke-width="0.6"/>' +
    '<text x="9.5" y="22" font-size="3" fill="%236ee7b7" font-family="Arial" font-weight="bold" text-anchor="middle">Tx</text>' +
    '<rect x="47" y="24" width="7" height="12" rx="1" fill="%23ea580c" stroke="%239a3412" stroke-width="0.5"/>' +
    '<circle cx="50.5" cy="30" r="2.2" fill="%23e2e8f0" stroke="%23475569" stroke-width="0.3"/><line x1="49" y1="30" x2="52" y2="30" stroke="%230f172a" stroke-width="0.6"/>' +
    '<text x="50.5" y="22" font-size="3" fill="%236ee7b7" font-family="Arial" font-weight="bold" text-anchor="middle">Sx</text>' +
    // Fresnel lens dome
    '<circle cx="30" cy="32" r="19" fill="url(%23pir_dome)" stroke="%2394a3b8" stroke-width="0.8"/>' +
    '<circle cx="30" cy="32" r="14" fill="none" stroke="%2394a3b8" stroke-width="0.5" opacity="0.6"/>' +
    '<circle cx="30" cy="32" r="9" fill="none" stroke="%2394a3b8" stroke-width="0.5" opacity="0.6"/>' +
    '<circle cx="30" cy="32" r="4" fill="none" stroke="%2394a3b8" stroke-width="0.5" opacity="0.7"/>' +
    '<path d="M 14 32 L 46 32 M 30 16 L 30 48 M 19 21 L 41 43 M 19 43 L 41 21" stroke="%23cbd5e1" stroke-width="0.4" opacity="0.5"/>' +
    '<path d="M 20 22 Q 28 17 38 22" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>' +
    // Bottom 3-pin header: VCC (17, 70), OUT (30, 70), GND (43, 70)
    '<rect x="12" y="56" width="36" height="7" rx="1" fill="%231e293b"/>' +
    [17, 30, 43].map((x) =>
      `<rect x="${x - 1.5}" y="60" width="3" height="10" rx="0.5" fill="url(%23pir_pin)"/>` +
      `<circle cx="${x}" cy="69" r="1.5" fill="%23475569"/>`
    ).join('') +
    '<text x="17" y="54" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="30" y="54" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">OUT</text>' +
    '<text x="43" y="54" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  PIR_SENSOR: svg('0 0 60 70',
    '<defs>' +
      '<linearGradient id="pir_pcb2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23059669"/><stop offset="50%25" stop-color="%23047857"/><stop offset="100%25" stop-color="%23064e3b"/></linearGradient>' +
      '<radialGradient id="pir_dome2" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="50%25" stop-color="%23f1f5f9"/><stop offset="85%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></radialGradient>' +
      '<linearGradient id="pir_pin2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="8" width="56" height="58" rx="3.5" fill="url(%23pir_pcb2)" stroke="%23064e3b" stroke-width="0.8"/>' +
    '<circle cx="6" cy="12" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<circle cx="54" cy="12" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<circle cx="6" cy="62" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<circle cx="54" cy="62" r="1.5" fill="%23022c22" stroke="%2334d399" stroke-width="0.3"/>' +
    '<rect x="6" y="24" width="7" height="12" rx="1" fill="%23ea580c" stroke="%239a3412" stroke-width="0.5"/>' +
    '<circle cx="9.5" cy="30" r="2.2" fill="%23e2e8f0" stroke="%23475569" stroke-width="0.3"/><line x1="8" y1="30" x2="11" y2="30" stroke="%230f172a" stroke-width="0.6"/>' +
    '<text x="9.5" y="22" font-size="3" fill="%236ee7b7" font-family="Arial" font-weight="bold" text-anchor="middle">Tx</text>' +
    '<rect x="47" y="24" width="7" height="12" rx="1" fill="%23ea580c" stroke="%239a3412" stroke-width="0.5"/>' +
    '<circle cx="50.5" cy="30" r="2.2" fill="%23e2e8f0" stroke="%23475569" stroke-width="0.3"/><line x1="49" y1="30" x2="52" y2="30" stroke="%230f172a" stroke-width="0.6"/>' +
    '<text x="50.5" y="22" font-size="3" fill="%236ee7b7" font-family="Arial" font-weight="bold" text-anchor="middle">Sx</text>' +
    '<circle cx="30" cy="32" r="19" fill="url(%23pir_dome2)" stroke="%2394a3b8" stroke-width="0.8"/>' +
    '<circle cx="30" cy="32" r="14" fill="none" stroke="%2394a3b8" stroke-width="0.5" opacity="0.6"/>' +
    '<circle cx="30" cy="32" r="9" fill="none" stroke="%2394a3b8" stroke-width="0.5" opacity="0.6"/>' +
    '<circle cx="30" cy="32" r="4" fill="none" stroke="%2394a3b8" stroke-width="0.5" opacity="0.7"/>' +
    '<path d="M 14 32 L 46 32 M 30 16 L 30 48 M 19 21 L 41 43 M 19 43 L 41 21" stroke="%23cbd5e1" stroke-width="0.4" opacity="0.5"/>' +
    '<path d="M 20 22 Q 28 17 38 22" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>' +
    '<rect x="12" y="56" width="36" height="7" rx="1" fill="%231e293b"/>' +
    [17, 30, 43].map((x) =>
      `<rect x="${x - 1.5}" y="60" width="3" height="10" rx="0.5" fill="url(%23pir_pin2)"/>` +
      `<circle cx="${x}" cy="69" r="1.5" fill="%23475569"/>`
    ).join('') +
    '<text x="17" y="54" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="30" y="54" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">OUT</text>' +
    '<text x="43" y="54" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  SENSOR_LDR: svg('0 0 40 40',
    '<defs>' +
      '<linearGradient id="ldr_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<radialGradient id="ldr_body" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23fef3c7"/><stop offset="40%25" stop-color="%23fde68a"/><stop offset="85%25" stop-color="%23f59e0b"/><stop offset="100%25" stop-color="%23b45309"/></radialGradient>' +
    '</defs>' +
    // Solder leads at (10, 40) and (30, 40)
    '<rect x="8.8" y="24" width="2.4" height="16" rx="0.5" fill="url(%23ldr_lead)"/>' +
    '<circle cx="10" cy="39" r="1.5" fill="%23475569"/>' +
    '<rect x="28.8" y="24" width="2.4" height="16" rx="0.5" fill="url(%23ldr_lead)"/>' +
    '<circle cx="30" cy="39" r="1.5" fill="%23475569"/>' +
    // Ceramic disc
    '<circle cx="20" cy="18" r="15" fill="url(%23ldr_body)" stroke="%2378350f" stroke-width="0.8"/>' +
    // Interlocking comb electrodes & CdS zigzag track
    '<path d="M 11 11 L 11 25 M 29 11 L 29 25" stroke="%23cbd5e1" stroke-width="1.2" stroke-linecap="round"/>' +
    '<path d="M 12 13 L 27 13 M 13 16 L 28 16 M 12 19 L 27 19 M 13 22 L 28 22" stroke="%23991b1b" stroke-width="1.3" stroke-linecap="round"/>' +
    // Clear epoxy glossy highlight
    '<path d="M 10 13 Q 19 8 29 13" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>'
  ),
  // ── Displays ──
  DISPLAY_LCD_I2C: svg('0 0 120 60',
    '<defs>' +
      '<linearGradient id="lcd_pcb_i2c" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230369a1"/><stop offset="50%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%23075985"/></linearGradient>' +
      '<linearGradient id="lcd_glass_i2c" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2384cc16"/><stop offset="100%25" stop-color="%2365a30d"/></linearGradient>' +
      '<linearGradient id="lcd_pin_i2c" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="116" height="56" rx="3.5" fill="url(%23lcd_pcb_i2c)" stroke="%23075985" stroke-width="0.8"/>' +
    '<circle cx="5" cy="5" r="1.5" fill="%23082f49" stroke="%2338bdf8" stroke-width="0.3"/>' +
    '<circle cx="115" cy="5" r="1.5" fill="%23082f49" stroke="%2338bdf8" stroke-width="0.3"/>' +
    // Black metal bezel frame
    '<rect x="6" y="6" width="108" height="38" rx="2" fill="%231e293b" stroke="%23334155" stroke-width="0.8"/>' +
    '<rect x="8" y="8" width="104" height="34" rx="1.5" fill="url(%23lcd_glass_i2c)"/>' +
    // LCD 16x2 character grid texture
    Array.from({ length: 16 }, (_, c) =>
      `<rect x="${11 + c * 6.2}" y="11" width="5.2" height="12" fill="%234d7c0f" opacity="0.3"/>` +
      `<rect x="${11 + c * 6.2}" y="26" width="5.2" height="12" fill="%234d7c0f" opacity="0.3"/>`
    ).join('') +
    // 4-pin I2C header at bottom: GND (14, 60), VCC (28, 60), SDA (42, 60), SCL (56, 60)
    '<rect x="8" y="47" width="54" height="6" rx="1" fill="%230f172a"/>' +
    [14, 28, 42, 56].map((x) =>
      `<rect x="${x - 1.5}" y="51" width="3" height="9" rx="0.5" fill="url(%23lcd_pin_i2c)"/>` +
      `<circle cx="${x}" cy="59" r="1.5" fill="%23475569"/>`
    ).join('') +
    '<text x="14" y="46" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>' +
    '<text x="28" y="46" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="42" y="46" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">SDA</text>' +
    '<text x="56" y="46" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">SCL</text>' +
    '<text x="94" y="52" font-size="3.5" fill="%23cbd5e1" font-family="Arial" font-weight="bold">I2C LCD1602</text>'
  ),
  LCD_16X2: svg('0 0 170 60',
    '<defs>' +
      '<linearGradient id="lcd_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230369a1"/><stop offset="50%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%23075985"/></linearGradient>' +
      '<linearGradient id="lcd_glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2384cc16"/><stop offset="100%25" stop-color="%2365a30d"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="166" height="56" rx="4" fill="url(%23lcd_pcb)" stroke="%23075985" stroke-width="0.8"/>' +
    // 4 corner mounting holes
    '<circle cx="7" cy="7" r="2" fill="%23082f49" stroke="%2338bdf8" stroke-width="0.4"/>' +
    '<circle cx="163" cy="7" r="2" fill="%23082f49" stroke="%2338bdf8" stroke-width="0.4"/>' +
    // Metal bezel
    '<rect x="10" y="6" width="150" height="42" rx="2.5" fill="%231e293b" stroke="%23334155" stroke-width="0.8"/>' +
    '<rect x="12" y="8" width="146" height="38" rx="2" fill="url(%23lcd_glass)"/>' +
    // Dot matrix character blocks
    Array.from({ length: 16 }, (_, c) =>
      `<rect x="${16 + c * 8.8}" y="12" width="7" height="13" fill="%234d7c0f" opacity="0.3"/>` +
      `<rect x="${16 + c * 8.8}" y="29" width="7" height="13" fill="%234d7c0f" opacity="0.3"/>`
    ).join('') +
    // 16-pin gold solder eyelets along bottom edge: 10 + i * 10 (10 to 160)
    Array.from({ length: 16 }, (_, i) => {
      const x = 10 + i * 10;
      return `<circle cx="${x}" cy="56" r="2.2" fill="%23eab308" stroke="%23ca8a04" stroke-width="0.4"/>` +
             `<circle cx="${x}" cy="56" r="1.1" fill="%230f172a"/>`;
    }).join('') +
    '<text x="10" y="52" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">1</text>' +
    '<text x="160" y="52" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">16</text>'
  ),
  DISPLAY_OLED: svg('0 0 80 60',
    '<defs>' +
      '<linearGradient id="oled_glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230f172a"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
      '<linearGradient id="oled_pin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="76" height="56" rx="3.5" fill="%231e293b" stroke="%23334155" stroke-width="0.8"/>' +
    '<circle cx="6" cy="6" r="1.5" fill="%230f172a" stroke="%2364748b" stroke-width="0.3"/>' +
    '<circle cx="74" cy="6" r="1.5" fill="%230f172a" stroke="%2364748b" stroke-width="0.3"/>' +
    // OLED glass display panel
    '<rect x="6" y="6" width="68" height="40" rx="1.5" fill="url(%23oled_glass)" stroke="%23090d16" stroke-width="0.8"/>' +
    // Specular reflection line across glass
    '<line x1="10" y1="8" x2="70" y2="8" stroke="%23ffffff" stroke-width="0.6" opacity="0.3"/>' +
    // 4-pin header at bottom: GND (19, 60), VCC (33, 60), SCL (47, 60), SDA (61, 60)
    '<rect x="13" y="49" width="54" height="5" rx="1" fill="%23090d16"/>' +
    [19, 33, 47, 61].map((x) =>
      `<rect x="${x - 1.5}" y="52" width="3" height="8" rx="0.5" fill="url(%23oled_pin)"/>` +
      `<circle cx="${x}" cy="59" r="1.5" fill="%23475569"/>`
    ).join('') +
    '<text x="19" y="48" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>' +
    '<text x="33" y="48" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="47" y="48" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">SCL</text>' +
    '<text x="61" y="48" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">SDA</text>'
  ),
  DISPLAY_7SEG: svg('0 0 50 70',
    '<defs>' +
      '<linearGradient id="seg_bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23181e29"/><stop offset="100%25" stop-color="%230f131a"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="4" width="46" height="62" rx="3" fill="url(%23seg_bg)" stroke="%23334155" stroke-width="1"/>' +
    Array.from([5, 15, 25, 35, 45], (x) => `<rect x="${x - 1.2}" y="0" width="2.4" height="6" rx="0.5" fill="%2394a3b8"/><circle cx="${x}" cy="1" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`).join('') +
    Array.from([5, 15, 25, 35, 45], (x) => `<rect x="${x - 1.2}" y="64" width="2.4" height="6" rx="0.5" fill="%2394a3b8"/><circle cx="${x}" cy="69" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`).join('') +
    '<text x="5" y="10" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">G</text>' +
    '<text x="15" y="10" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">F</text>' +
    '<text x="25" y="10" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">COM</text>' +
    '<text x="35" y="10" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">A</text>' +
    '<text x="45" y="10" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">B</text>' +
    '<text x="5" y="62" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">E</text>' +
    '<text x="15" y="62" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">D</text>' +
    '<text x="25" y="62" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">COM</text>' +
    '<text x="35" y="62" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">C</text>' +
    '<text x="45" y="62" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">DP</text>' +
    '<rect x="8" y="11" width="34" height="48" rx="2" fill="%230a0d14" stroke="%231e2533" stroke-width="0.8"/>' +
    '<path d="M 16 14 L 19 12 L 31 12 L 34 14 L 31 16 L 19 16 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<path d="M 35 15 L 37 18 L 37 30 L 35 32 L 33 30 L 33 18 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<path d="M 35 34 L 37 37 L 37 49 L 35 52 L 33 49 L 33 37 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<path d="M 16 53 L 19 51 L 31 51 L 34 53 L 31 55 L 19 55 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<path d="M 15 34 L 17 37 L 17 49 L 15 52 L 13 49 L 13 37 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<path d="M 15 15 L 17 18 L 17 30 L 15 32 L 13 30 L 13 18 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<path d="M 16 33 L 18 31.5 L 32 31.5 L 34 33 L 32 34.5 L 18 34.5 Z" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>' +
    '<circle cx="39" cy="53" r="2" fill="%231a2230" stroke="%23111827" stroke-width="0.5"/>'
  ),

  // ── Relays ──
  RELAY_SPDT: svg('0 0 70 50',
    '<defs>' +
      '<linearGradient id="rel_cube" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%233b82f6"/><stop offset="30%25" stop-color="%232563eb"/><stop offset="100%25" stop-color="%231d4ed8"/></linearGradient>' +
      '<linearGradient id="rel_pin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="13.5" width="8" height="3" rx="0.5" fill="url(%23rel_pin)"/>' +
    '<circle cx="1" cy="15" r="1.5" fill="%23475569"/>' +
    '<rect x="0" y="33.5" width="8" height="3" rx="0.5" fill="url(%23rel_pin)"/>' +
    '<circle cx="1" cy="35" r="1.5" fill="%23475569"/>' +
    '<rect x="62" y="8.5" width="8" height="3" rx="0.5" fill="url(%23rel_pin)"/>' +
    '<circle cx="69" cy="10" r="1.5" fill="%23475569"/>' +
    '<rect x="62" y="23.5" width="8" height="3" rx="0.5" fill="url(%23rel_pin)"/>' +
    '<circle cx="69" cy="25" r="1.5" fill="%23475569"/>' +
    '<rect x="62" y="38.5" width="8" height="3" rx="0.5" fill="url(%23rel_pin)"/>' +
    '<circle cx="69" cy="40" r="1.5" fill="%23475569"/>' +
    '<rect x="7" y="4" width="56" height="42" rx="3" fill="url(%23rel_cube)" stroke="%231e40af" stroke-width="0.8"/>' +
    '<rect x="9" y="6" width="52" height="38" rx="2" fill="none" stroke="%2360a5fa" stroke-width="0.5" opacity="0.6"/>' +
    '<text x="35" y="15" font-size="6.5" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="1">SONGLE</text>' +
    '<text x="35" y="23" font-size="5" fill="%23dbeafe" font-family="Arial" font-weight="bold" text-anchor="middle">SRD-05VDC-SL-C</text>' +
    '<text x="35" y="31" font-size="4" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 250VAC  10A 125VAC</text>' +
    '<text x="35" y="37" font-size="4" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 30VDC   10A 28VDC</text>' +
    '<text x="35" y="43" font-size="3.5" fill="%2393c5fd" font-family="Arial" text-anchor="middle">5VDC COIL</text>'
  ),
  RELAY_SINGLE: svg('0 0 70 50',
    '<defs>' +
      '<linearGradient id="rs_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231d4ed8"/><stop offset="100%25" stop-color="%231e3a8a"/></linearGradient>' +
      '<linearGradient id="rs_relay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%233b82f6"/><stop offset="50%25" stop-color="%232563eb"/><stop offset="100%25" stop-color="%231d4ed8"/></linearGradient>' +
      '<linearGradient id="rs_term" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2316a34a"/><stop offset="50%25" stop-color="%2315803d"/><stop offset="100%25" stop-color="%2314532d"/></linearGradient>' +
      '<linearGradient id="rs_hdr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="66" height="46" rx="3.5" fill="url(%23rs_pcb)" stroke="%23172554" stroke-width="0.8"/>' +
    '<circle cx="5" cy="5" r="1.5" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>' +
    '<circle cx="5" cy="45" r="1.5" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>' +
    '<rect x="0" y="6.5" width="5" height="3" rx="0.5" fill="url(%23rs_hdr)"/>' +
    '<rect x="0" y="23.5" width="5" height="3" rx="0.5" fill="url(%23rs_hdr)"/>' +
    '<rect x="0" y="40.5" width="5" height="3" rx="0.5" fill="url(%23rs_hdr)"/>' +
    '<circle cx="0.5" cy="8" r="1.2" fill="%23475569"/><circle cx="0.5" cy="25" r="1.2" fill="%23475569"/><circle cx="0.5" cy="42" r="1.2" fill="%23475569"/>' +
    '<rect x="4" y="5" width="3" height="40" rx="1" fill="%231e293b"/>' +
    '<text x="9" y="9.5" font-size="3.5" fill="%23f8fafc" font-family="Arial" font-weight="bold">VCC</text>' +
    '<text x="9" y="26.5" font-size="3.5" fill="%23f8fafc" font-family="Arial" font-weight="bold">GND</text>' +
    '<text x="9" y="43.5" font-size="3.5" fill="%23f8fafc" font-family="Arial" font-weight="bold">IN</text>' +
    '<rect x="18" y="7" width="33" height="36" rx="2.5" fill="url(%23rs_relay)" stroke="%231e40af" stroke-width="0.75"/>' +
    '<text x="34.5" y="15" font-size="5" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle">SONGLE</text>' +
    '<text x="34.5" y="22" font-size="3.8" fill="%23dbeafe" font-family="Arial" font-weight="bold" text-anchor="middle">SRD-05VDC</text>' +
    '<text x="34.5" y="28" font-size="3.2" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 250VAC</text>' +
    '<text x="34.5" y="34" font-size="3.2" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 30VDC</text>' +
    '<rect x="10" y="14" width="5" height="4" rx="0.5" fill="%230f172a" stroke="%23334155" stroke-width="0.4"/>' +
    '<circle cx="14" cy="22" r="1.2" fill="%23ef4444"/>' +
    '<circle cx="14" cy="30" r="1.2" fill="%2322c55e"/>' +
    '<rect x="54" y="4" width="16" height="42" rx="2" fill="url(%23rs_term)" stroke="%2314532d" stroke-width="0.8"/>' +
    '<circle cx="61" cy="8" r="3.2" fill="%23d1d5db" stroke="%234b5563" stroke-width="0.6"/>' +
    '<line x1="59" y1="8" x2="63" y2="8" stroke="%231f2937" stroke-width="0.8"/>' +
    '<circle cx="69" cy="8" r="1.5" fill="%2314532d"/>' +
    '<circle cx="61" cy="25" r="3.2" fill="%23d1d5db" stroke="%234b5563" stroke-width="0.6"/>' +
    '<line x1="59" y1="25" x2="63" y2="25" stroke="%231f2937" stroke-width="0.8"/>' +
    '<circle cx="69" cy="25" r="1.5" fill="%2314532d"/>' +
    '<circle cx="61" cy="42" r="3.2" fill="%23d1d5db" stroke="%234b5563" stroke-width="0.6"/>' +
    '<line x1="59" y1="42" x2="63" y2="42" stroke="%231f2937" stroke-width="0.8"/>' +
    '<circle cx="69" cy="42" r="1.5" fill="%2314532d"/>' +
    '<text x="52" y="9.5" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">COM</text>' +
    '<text x="52" y="26.5" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">NO</text>' +
    '<text x="52" y="43.5" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">NC</text>'
  ),
  RELAY_2CH: svg('0 0 90 50',
    '<defs>' +
      '<linearGradient id="r2_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231d4ed8"/><stop offset="100%25" stop-color="%231e3a8a"/></linearGradient>' +
      '<linearGradient id="r2_relay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%233b82f6"/><stop offset="50%25" stop-color="%232563eb"/><stop offset="100%25" stop-color="%231d4ed8"/></linearGradient>' +
      '<linearGradient id="r2_term" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2316a34a"/><stop offset="50%25" stop-color="%2315803d"/><stop offset="100%25" stop-color="%2314532d"/></linearGradient>' +
      '<linearGradient id="r2_hdr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="86" height="46" rx="3.5" fill="url(%23r2_pcb)" stroke="%23172554" stroke-width="0.8"/>' +
    '<rect x="0" y="8.5" width="5" height="3" rx="0.5" fill="url(%23r2_hdr)"/>' +
    '<rect x="0" y="18.5" width="5" height="3" rx="0.5" fill="url(%23r2_hdr)"/>' +
    '<rect x="0" y="23.5" width="5" height="3" rx="0.5" fill="url(%23r2_hdr)"/>' +
    '<rect x="0" y="38.5" width="5" height="3" rx="0.5" fill="url(%23r2_hdr)"/>' +
    '<circle cx="0.5" cy="10" r="1.2" fill="%23475569"/><circle cx="0.5" cy="20" r="1.2" fill="%23475569"/><circle cx="0.5" cy="25" r="1.2" fill="%23475569"/><circle cx="0.5" cy="40" r="1.2" fill="%23475569"/>' +
    '<rect x="4" y="6" width="3" height="38" rx="1" fill="%231e293b"/>' +
    '<text x="9" y="11.5" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold">IN1</text>' +
    '<text x="9" y="21.5" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold">IN2</text>' +
    '<text x="9" y="26.5" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold">GND</text>' +
    '<text x="9" y="41.5" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold">VCC</text>' +
    '<rect x="16" y="5" width="27" height="38" rx="2" fill="url(%23r2_relay)" stroke="%231e40af" stroke-width="0.6"/>' +
    '<text x="29.5" y="14" font-size="4.2" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle">SONGLE</text>' +
    '<text x="29.5" y="21" font-size="3.2" fill="%23dbeafe" font-family="Arial" font-weight="bold" text-anchor="middle">SRD-05VDC</text>' +
    '<text x="29.5" y="27" font-size="2.8" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 250VAC</text>' +
    '<rect x="45" y="5" width="27" height="38" rx="2" fill="url(%23r2_relay)" stroke="%231e40af" stroke-width="0.6"/>' +
    '<text x="58.5" y="14" font-size="4.2" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle">SONGLE</text>' +
    '<text x="58.5" y="21" font-size="3.2" fill="%23dbeafe" font-family="Arial" font-weight="bold" text-anchor="middle">SRD-05VDC</text>' +
    '<text x="58.5" y="27" font-size="2.8" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 250VAC</text>' +
    '<rect x="74" y="4" width="16" height="42" rx="2" fill="url(%23r2_term)" stroke="%2314532d" stroke-width="0.8"/>' +
    [12, 25, 38, 48].map((y) =>
      `<circle cx="81" cy="${y}" r="2.8" fill="%23d1d5db" stroke="%234b5563" stroke-width="0.5"/>` +
      `<line x1="79.2" y1="${y}" x2="82.8" y2="${y}" stroke="%231f2937" stroke-width="0.7"/>` +
      `<circle cx="89" cy="${y}" r="1.2" fill="%2314532d"/>`
    ).join('') +
    '<text x="73" y="13.5" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">C1</text>' +
    '<text x="73" y="26.5" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">NO1</text>' +
    '<text x="73" y="39.5" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">C2</text>' +
    '<text x="73" y="49" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="end">NO2</text>'
  ),
  RELAY_4CH: svg('0 0 120 50',
    '<defs>' +
      '<linearGradient id="r4_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231d4ed8"/><stop offset="100%25" stop-color="%231e3a8a"/></linearGradient>' +
      '<linearGradient id="r4_relay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%233b82f6"/><stop offset="50%25" stop-color="%232563eb"/><stop offset="100%25" stop-color="%231d4ed8"/></linearGradient>' +
      '<linearGradient id="r4_term" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2316a34a"/><stop offset="50%25" stop-color="%2315803d"/><stop offset="100%25" stop-color="%2314532d"/></linearGradient>' +
      '<linearGradient id="r4_hdr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="116" height="46" rx="3.5" fill="url(%23r4_pcb)" stroke="%23172554" stroke-width="0.8"/>' +
    [10, 18, 25, 32, 40, 47].map((y) =>
      `<rect x="0" y="${y - 1.5}" width="5" height="3" rx="0.5" fill="url(%23r4_hdr)"/>` +
      `<circle cx="0.5" cy="${y}" r="1.1" fill="%23475569"/>`
    ).join('') +
    '<rect x="4" y="5" width="2.5" height="40" rx="1" fill="%231e293b"/>' +
    [0, 1, 2, 3].map((i) => {
      const x = 12 + i * 22;
      return `<rect x="${x}" y="5" width="20" height="38" rx="1.5" fill="url(%23r4_relay)" stroke="%231e40af" stroke-width="0.5"/>` +
             `<text x="${x + 10}" y="13" font-size="3.2" fill="%23ffffff" font-family="Arial" font-weight="900" text-anchor="middle">SONGLE</text>` +
             `<text x="${x + 10}" y="19" font-size="2.6" fill="%23dbeafe" font-family="Arial" font-weight="bold" text-anchor="middle">SRD-05VDC</text>` +
             `<text x="${x + 10}" y="25" font-size="2.2" fill="%23bfdbfe" font-family="Arial" text-anchor="middle">10A 250V</text>`;
    }).join('') +
    '<rect x="103" y="3" width="17" height="44" rx="2" fill="url(%23r4_term)" stroke="%2314532d" stroke-width="0.8"/>' +
    [6, 11, 18, 23, 30, 35, 42, 47].map((y) =>
      `<circle cx="110" cy="${y}" r="2" fill="%23d1d5db" stroke="%234b5563" stroke-width="0.4"/>` +
      `<line x1="108.8" y1="${y}" x2="111.2" y2="${y}" stroke="%231f2937" stroke-width="0.6"/>` +
      `<circle cx="119" cy="${y}" r="1" fill="%2314532d"/>`
    ).join('')
  ),

  // ── Motors ──
  MOTOR_DC: svg('0 0 70 50',
    '<defs>' +
      '<linearGradient id="dcm_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%239ca3af"/><stop offset="20%25" stop-color="%236b7280"/><stop offset="50%25" stop-color="%234b5563"/><stop offset="80%25" stop-color="%236b7280"/><stop offset="100%25" stop-color="%239ca3af"/></linearGradient>' +
      '<linearGradient id="dcm_shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="dcm_end" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23d97706"/><stop offset="50%25" stop-color="%23b45309"/><stop offset="100%25" stop-color="%2392400e"/></linearGradient>' +
    '</defs>' +
    // Main cylindrical body
    '<rect x="10" y="8" width="42" height="34" rx="17" fill="url(%23dcm_body)" stroke="%23374151" stroke-width="0.8"/>' +
    // Ventilation slots on body
    '<line x1="20" y1="10" x2="20" y2="40" stroke="%23374151" stroke-width="0.5" opacity="0.4"/>' +
    '<line x1="25" y1="9" x2="25" y2="41" stroke="%23374151" stroke-width="0.5" opacity="0.4"/>' +
    '<line x1="30" y1="8.5" x2="30" y2="41.5" stroke="%23374151" stroke-width="0.5" opacity="0.4"/>' +
    '<line x1="35" y1="9" x2="35" y2="41" stroke="%23374151" stroke-width="0.5" opacity="0.4"/>' +
    '<line x1="40" y1="10" x2="40" y2="40" stroke="%23374151" stroke-width="0.5" opacity="0.4"/>' +
    // Rear endcap (gold/brass)
    '<ellipse cx="10" cy="25" rx="4" ry="14" fill="url(%23dcm_end)" stroke="%2378350f" stroke-width="0.6"/>' +
    // Terminal tabs at rear
    '<rect x="0" y="12" width="8" height="4" rx="0.5" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.4"/>' +
    '<circle cx="4" cy="14" r="1.2" fill="%23f1f5f9"/><circle cx="4" cy="14" r="0.5" fill="%230f172a"/>' +
    '<rect x="0" y="34" width="8" height="4" rx="0.5" fill="%231e293b" stroke="%230f172a" stroke-width="0.4"/>' +
    '<circle cx="4" cy="36" r="1.2" fill="%23f1f5f9"/><circle cx="4" cy="36" r="0.5" fill="%230f172a"/>' +
    // Front bearing plate
    '<ellipse cx="52" cy="25" rx="3.5" ry="12" fill="%23374151" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="52" cy="25" r="5" fill="%231f2937" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="52" cy="25" r="2.5" fill="%23cbd5e1"/>' +
    // Shaft
    '<rect x="52" y="23" width="16" height="4" rx="0.5" fill="url(%23dcm_shaft)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<rect x="64" y="22.5" width="3" height="5" rx="0.5" fill="%23e2e8f0" stroke="%2394a3b8" stroke-width="0.3"/>' +
    // Glossy highlight
    '<path d="M 16 10 Q 30 6 45 10" fill="none" stroke="%23ffffff" stroke-width="1" opacity="0.4" stroke-linecap="round"/>' +
    // Label
    '<text x="30" y="27" font-size="5" fill="%23111827" font-family="Arial" font-weight="bold" text-anchor="middle">FA-130</text>' +
    '<text x="3.5" y="11" font-size="3.5" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">+</text>' +
    '<text x="3.5" y="42" font-size="3.5" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">\u2212</text>'
  ),
  MOTOR_SERVO: svg('0 0 70 50',
    '<defs>' +
      '<linearGradient id="sg90_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%232563eb"/><stop offset="50%25" stop-color="%231d4ed8"/><stop offset="100%25" stop-color="%231e40af"/></linearGradient>' +
      '<linearGradient id="sg90_glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%2360a5fa" stop-opacity="0.6"/><stop offset="100%25" stop-color="%231d4ed8" stop-opacity="0.85"/></linearGradient>' +
      '<linearGradient id="sg90_horn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="100%25" stop-color="%23e2e8f0"/></linearGradient>' +
      '<linearGradient id="sg90_wire_o" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23fb923c"/><stop offset="50%25" stop-color="%23f97316"/><stop offset="100%25" stop-color="%23ea580c"/></linearGradient>' +
      '<linearGradient id="sg90_wire_r" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f87171"/><stop offset="50%25" stop-color="%23ef4444"/><stop offset="100%25" stop-color="%23dc2626"/></linearGradient>' +
      '<linearGradient id="sg90_wire_b" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2378350f"/><stop offset="50%25" stop-color="%23451a03"/><stop offset="100%25" stop-color="%23292524"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="16" width="66" height="8" rx="1.5" fill="url(%23sg90_case)" stroke="%231e3a8a" stroke-width="0.6"/>' +
    '<circle cx="6" cy="20" r="2.2" fill="%23fef08a" stroke="%23ca8a04" stroke-width="0.5"/><circle cx="6" cy="20" r="1.2" fill="%230f172a"/>' +
    '<circle cx="64" cy="20" r="2.2" fill="%23fef08a" stroke="%23ca8a04" stroke-width="0.5"/><circle cx="64" cy="20" r="1.2" fill="%230f172a"/>' +
    '<rect x="10" y="8" width="50" height="32" rx="3" fill="url(%23sg90_case)" stroke="%23172554" stroke-width="0.8"/>' +
    '<rect x="12" y="10" width="46" height="28" rx="2" fill="url(%23sg90_glass)"/>' +
    '<circle cx="24" cy="24" r="8" fill="none" stroke="%2393c5fd" stroke-width="0.6" stroke-dasharray="2,2" opacity="0.4"/>' +
    '<circle cx="46" cy="24" r="10" fill="none" stroke="%2393c5fd" stroke-width="0.6" stroke-dasharray="2,2" opacity="0.4"/>' +
    '<rect x="40" y="3" width="16" height="8" rx="3" fill="%231e40af" stroke="%231e3a8a" stroke-width="0.5"/>' +
    '<circle cx="48" cy="7" r="7" fill="url(%23sg90_horn)" stroke="%23cbd5e1" stroke-width="0.6"/>' +
    '<path d="M 48 3 L 64 6 C 66 6.5 66 7.5 64 8 L 48 11 Z" fill="url(%23sg90_horn)" stroke="%2394a3b8" stroke-width="0.5"/>' +
    '<circle cx="54" cy="7" r="0.8" fill="%23475569"/><circle cx="58" cy="7" r="0.8" fill="%23475569"/><circle cx="62" cy="7" r="0.8" fill="%23475569"/>' +
    '<circle cx="48" cy="7" r="2.5" fill="%2394a3b8" stroke="%23475569" stroke-width="0.4"/>' +
    '<line x1="46.5" y1="7" x2="49.5" y2="7" stroke="%231e293b" stroke-width="0.6"/>' +
    '<rect x="12" y="24" width="30" height="12" rx="1" fill="%230f172a" stroke="%2338bdf8" stroke-width="0.5"/>' +
    '<text x="27" y="30" font-size="4.2" fill="%2338bdf8" font-family="Arial" font-weight="900" text-anchor="middle">Tower Pro</text>' +
    '<text x="27" y="34.5" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">SG90 9g</text>' +
    '<path d="M 16 40 Q 13 44 11 50" fill="none" stroke="url(%23sg90_wire_o)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 21 40 L 21 50" stroke="url(%23sg90_wire_r)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 26 40 Q 29 44 31 50" fill="none" stroke="url(%23sg90_wire_b)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<rect x="8" y="44" width="6" height="6" rx="0.8" fill="%230f172a"/>' +
    '<circle cx="11" cy="50" r="1.6" fill="%23fbbf24" stroke="%23b45309" stroke-width="0.4"/><circle cx="11" cy="50" r="0.8" fill="%230f172a"/>' +
    '<rect x="18" y="44" width="6" height="6" rx="0.8" fill="%230f172a"/>' +
    '<circle cx="21" cy="50" r="1.6" fill="%23fbbf24" stroke="%23b45309" stroke-width="0.4"/><circle cx="21" cy="50" r="0.8" fill="%230f172a"/>' +
    '<rect x="28" y="44" width="6" height="6" rx="0.8" fill="%230f172a"/>' +
    '<circle cx="31" cy="50" r="1.6" fill="%23fbbf24" stroke="%23b45309" stroke-width="0.4"/><circle cx="31" cy="50" r="0.8" fill="%230f172a"/>' +
    '<text x="11" y="43" font-size="2.6" fill="%23ea580c" font-family="Arial" font-weight="bold" text-anchor="middle">SIG</text>' +
    '<text x="21" y="43" font-size="2.6" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="31" y="43" font-size="2.6" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  SERVO_MOTOR: svg('0 0 70 50',
    '<defs>' +
      '<linearGradient id="sg90_case2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%232563eb"/><stop offset="50%25" stop-color="%231d4ed8"/><stop offset="100%25" stop-color="%231e40af"/></linearGradient>' +
      '<linearGradient id="sg90_glass2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%2360a5fa" stop-opacity="0.6"/><stop offset="100%25" stop-color="%231d4ed8" stop-opacity="0.85"/></linearGradient>' +
      '<linearGradient id="sg90_horn2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="100%25" stop-color="%23e2e8f0"/></linearGradient>' +
      '<linearGradient id="sg90_wire_o2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23fb923c"/><stop offset="50%25" stop-color="%23f97316"/><stop offset="100%25" stop-color="%23ea580c"/></linearGradient>' +
      '<linearGradient id="sg90_wire_r2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f87171"/><stop offset="50%25" stop-color="%23ef4444"/><stop offset="100%25" stop-color="%23dc2626"/></linearGradient>' +
      '<linearGradient id="sg90_wire_b2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%2378350f"/><stop offset="50%25" stop-color="%23451a03"/><stop offset="100%25" stop-color="%23292524"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="16" width="66" height="8" rx="1.5" fill="url(%23sg90_case2)" stroke="%231e3a8a" stroke-width="0.6"/>' +
    '<circle cx="6" cy="20" r="2.2" fill="%23fef08a" stroke="%23ca8a04" stroke-width="0.5"/><circle cx="6" cy="20" r="1.2" fill="%230f172a"/>' +
    '<circle cx="64" cy="20" r="2.2" fill="%23fef08a" stroke="%23ca8a04" stroke-width="0.5"/><circle cx="64" cy="20" r="1.2" fill="%230f172a"/>' +
    '<rect x="10" y="8" width="50" height="32" rx="3" fill="url(%23sg90_case2)" stroke="%23172554" stroke-width="0.8"/>' +
    '<rect x="12" y="10" width="46" height="28" rx="2" fill="url(%23sg90_glass2)"/>' +
    '<circle cx="24" cy="24" r="8" fill="none" stroke="%2393c5fd" stroke-width="0.6" stroke-dasharray="2,2" opacity="0.4"/>' +
    '<circle cx="46" cy="24" r="10" fill="none" stroke="%2393c5fd" stroke-width="0.6" stroke-dasharray="2,2" opacity="0.4"/>' +
    '<rect x="40" y="3" width="16" height="8" rx="3" fill="%231e40af" stroke="%231e3a8a" stroke-width="0.5"/>' +
    '<circle cx="48" cy="7" r="7" fill="url(%23sg90_horn2)" stroke="%23cbd5e1" stroke-width="0.6"/>' +
    '<path d="M 48 3 L 64 6 C 66 6.5 66 7.5 64 8 L 48 11 Z" fill="url(%23sg90_horn2)" stroke="%2394a3b8" stroke-width="0.5"/>' +
    '<circle cx="54" cy="7" r="0.8" fill="%23475569"/><circle cx="58" cy="7" r="0.8" fill="%23475569"/><circle cx="62" cy="7" r="0.8" fill="%23475569"/>' +
    '<circle cx="48" cy="7" r="2.5" fill="%2394a3b8" stroke="%23475569" stroke-width="0.4"/>' +
    '<line x1="46.5" y1="7" x2="49.5" y2="7" stroke="%231e293b" stroke-width="0.6"/>' +
    '<rect x="12" y="24" width="30" height="12" rx="1" fill="%230f172a" stroke="%2338bdf8" stroke-width="0.5"/>' +
    '<text x="27" y="30" font-size="4.2" fill="%2338bdf8" font-family="Arial" font-weight="900" text-anchor="middle">Tower Pro</text>' +
    '<text x="27" y="34.5" font-size="3.5" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">SG90 9g</text>' +
    '<path d="M 16 40 Q 13 44 11 50" fill="none" stroke="url(%23sg90_wire_o2)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 21 40 L 21 50" stroke="url(%23sg90_wire_r2)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 26 40 Q 29 44 31 50" fill="none" stroke="url(%23sg90_wire_b2)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<rect x="8" y="44" width="6" height="6" rx="0.8" fill="%230f172a"/>' +
    '<circle cx="11" cy="50" r="1.6" fill="%23fbbf24" stroke="%23b45309" stroke-width="0.4"/><circle cx="11" cy="50" r="0.8" fill="%230f172a"/>' +
    '<rect x="18" y="44" width="6" height="6" rx="0.8" fill="%230f172a"/>' +
    '<circle cx="21" cy="50" r="1.6" fill="%23fbbf24" stroke="%23b45309" stroke-width="0.4"/><circle cx="21" cy="50" r="0.8" fill="%230f172a"/>' +
    '<rect x="28" y="44" width="6" height="6" rx="0.8" fill="%230f172a"/>' +
    '<circle cx="31" cy="50" r="1.6" fill="%23fbbf24" stroke="%23b45309" stroke-width="0.4"/><circle cx="31" cy="50" r="0.8" fill="%230f172a"/>' +
    '<text x="11" y="43" font-size="2.6" fill="%23ea580c" font-family="Arial" font-weight="bold" text-anchor="middle">SIG</text>' +
    '<text x="21" y="43" font-size="2.6" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="31" y="43" font-size="2.6" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
  STEPPER_MOTOR: svg('0 0 70 70',
    '<defs>' +
      '<radialGradient id="stp_can" cx="40%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="35%25" stop-color="%23cbd5e1"/><stop offset="85%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></radialGradient>' +
      '<linearGradient id="stp_brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23fef08a"/><stop offset="50%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23a16207"/></linearGradient>' +
      '<linearGradient id="stp_ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23e2e8f0"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    '<path d="M 6 22 C 2 22 2 44 6 44 L 64 44 C 68 44 68 22 64 22 Z" fill="url(%23stp_ear)" stroke="%2364748b" stroke-width="0.8"/>' +
    '<rect x="4" y="29" width="5" height="8" rx="2.5" fill="%231e293b" stroke="%23475569" stroke-width="0.4"/>' +
    '<rect x="61" y="29" width="5" height="8" rx="2.5" fill="%231e293b" stroke="%23475569" stroke-width="0.4"/>' +
    '<circle cx="35" cy="33" r="26" fill="url(%23stp_can)" stroke="%23475569" stroke-width="1"/>' +
    '<circle cx="35" cy="33" r="24.5" fill="none" stroke="%23ffffff" stroke-width="0.8" opacity="0.6"/>' +
    '<path d="M 23 20 C 23 12 47 12 47 20 Z" fill="url(%23stp_can)" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="35" cy="20" r="6" fill="%23334155" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="35" cy="20" r="4.5" fill="url(%23stp_brass)" stroke="%23854d0e" stroke-width="0.5"/>' +
    '<path d="M 33 17 L 37 17 L 37 23 L 33 23 Z" fill="%23ca8a04"/>' +
    '<line x1="33" y1="17" x2="33" y2="23" stroke="%23451a03" stroke-width="0.8"/>' +
    '<rect x="20" y="33" width="30" height="15" rx="1.5" fill="%230f172a" stroke="%2338bdf8" stroke-width="0.5"/>' +
    '<text x="35" y="40" font-size="4" fill="%2338bdf8" font-family="Arial" font-weight="900" text-anchor="middle">28BYJ-48</text>' +
    '<text x="35" y="45.5" font-size="3" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">5V DC STEPPER</text>' +
    '<rect x="22" y="55" width="26" height="7" rx="1.5" fill="%230284c7" stroke="%230369a1" stroke-width="0.6"/>' +
    '<path d="M 25 61 Q 18 64 15 70" fill="none" stroke="%233b82f6" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M 29 61 Q 27 65 27 70" fill="none" stroke="%23ec4899" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M 41 61 Q 43 65 43 70" fill="none" stroke="%23eab308" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M 45 61 Q 52 64 55 70" fill="none" stroke="%23f97316" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="15" cy="70" r="1.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="15" cy="70" r="0.8" fill="%230f172a"/>' +
    '<circle cx="27" cy="70" r="1.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="27" cy="70" r="0.8" fill="%230f172a"/>' +
    '<circle cx="43" cy="70" r="1.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="43" cy="70" r="0.8" fill="%230f172a"/>' +
    '<circle cx="55" cy="70" r="1.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="55" cy="70" r="0.8" fill="%230f172a"/>' +
    '<text x="15" y="65" font-size="3" fill="%233b82f6" font-family="Arial" font-weight="bold" text-anchor="middle">A+</text>' +
    '<text x="27" y="65" font-size="3" fill="%23ec4899" font-family="Arial" font-weight="bold" text-anchor="middle">A\u2212</text>' +
    '<text x="43" y="65" font-size="3" fill="%23eab308" font-family="Arial" font-weight="bold" text-anchor="middle">B+</text>' +
    '<text x="55" y="65" font-size="3" fill="%23f97316" font-family="Arial" font-weight="bold" text-anchor="middle">B\u2212</text>'
  ),
  MOTOR_STEPPER: svg('0 0 70 70',
    '<defs>' +
      '<linearGradient id="uln_pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2315803d"/><stop offset="50%25" stop-color="%23166534"/><stop offset="100%25" stop-color="%2314532d"/></linearGradient>' +
      '<linearGradient id="uln_ic" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="100%25" stop-color="%2318181b"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="66" height="66" rx="4" fill="url(%23uln_pcb)" stroke="%2314532d" stroke-width="1"/>' +
    '<circle cx="6" cy="6" r="2.2" fill="%23052e16" stroke="%2386efac" stroke-width="0.4"/>' +
    '<circle cx="64" cy="6" r="2.2" fill="%23052e16" stroke="%2386efac" stroke-width="0.4"/>' +
    '<circle cx="6" cy="64" r="2.2" fill="%23052e16" stroke="%2386efac" stroke-width="0.4"/>' +
    '<circle cx="64" cy="64" r="2.2" fill="%23052e16" stroke="%2386efac" stroke-width="0.4"/>' +
    '<rect x="18" y="4" width="34" height="12" rx="1.5" fill="%23f8fafc" stroke="%23cbd5e1" stroke-width="0.8"/>' +
    '<rect x="21" y="6" width="28" height="8" rx="1" fill="%23e2e8f0"/>' +
    '<circle cx="24" cy="10" r="1.1" fill="%23f59e0b"/><circle cx="28.5" cy="10" r="1.1" fill="%23f59e0b"/><circle cx="33" cy="10" r="1.1" fill="%23f59e0b"/><circle cx="37.5" cy="10" r="1.1" fill="%23f59e0b"/><circle cx="42" cy="10" r="1.1" fill="%23f59e0b"/>' +
    '<text x="35" y="19" font-size="2.8" fill="%23bbf7d0" font-family="Arial" font-weight="bold" text-anchor="middle">STEPPER MOTOR</text>' +
    '<rect x="15" y="23" width="40" height="18" rx="2" fill="url(%23uln_ic)" stroke="%233f3f46" stroke-width="0.6"/>' +
    '<path d="M 15 30 A 2 2 0 0 1 15 34 Z" fill="%2309090b"/>' +
    '<circle cx="19" cy="38" r="0.8" fill="%2352525b"/>' +
    '<text x="35" y="32" font-size="4.5" fill="%23f4f4f5" font-family="Arial" font-weight="bold" text-anchor="middle">ULN2003A</text>' +
    '<text x="35" y="38" font-size="2.6" fill="%23a1a1aa" font-family="Arial" text-anchor="middle">DARLINGTON ARRAY</text>' +
    '<rect x="58" y="20" width="3.5" height="5" rx="0.8" fill="%23ef4444" stroke="%23991b1b" stroke-width="0.3"/><text x="64" y="24" font-size="3" fill="%23fecaca" font-family="Arial" font-weight="bold">A</text>' +
    '<rect x="58" y="27" width="3.5" height="5" rx="0.8" fill="%23ef4444" stroke="%23991b1b" stroke-width="0.3"/><text x="64" y="31" font-size="3" fill="%23fecaca" font-family="Arial" font-weight="bold">B</text>' +
    '<rect x="58" y="34" width="3.5" height="5" rx="0.8" fill="%23ef4444" stroke="%23991b1b" stroke-width="0.3"/><text x="64" y="38" font-size="3" fill="%23fecaca" font-family="Arial" font-weight="bold">C</text>' +
    '<rect x="58" y="41" width="3.5" height="5" rx="0.8" fill="%23ef4444" stroke="%23991b1b" stroke-width="0.3"/><text x="64" y="45" font-size="3" fill="%23fecaca" font-family="Arial" font-weight="bold">D</text>' +
    '<rect x="5" y="34" width="6" height="10" rx="1" fill="%2318181b"/>' +
    '<circle cx="8" cy="37" r="1.1" fill="%23f59e0b"/><circle cx="8" cy="41" r="1.1" fill="%23f59e0b"/>' +
    '<rect x="6.5" y="35" width="3" height="8" rx="0.5" fill="%23eab308"/>' +
    '<text x="8" y="31" font-size="2.4" fill="%23bbf7d0" font-family="Arial" text-anchor="middle">5-12V</text>' +
    '<rect x="4" y="58" width="62" height="7" rx="1" fill="%2318181b" stroke="%2327272a" stroke-width="0.5"/>' +
    [7, 18, 29, 40, 51, 62].map((x) =>
      `<rect x="${x - 1.5}" y="60" width="3" height="10" rx="0.5" fill="%23f59e0b" stroke="%23b45309" stroke-width="0.3"/>` +
      `<circle cx="${x}" cy="69" r="1" fill="%23451a03"/>`
    ).join('') +
    '<text x="7" y="56" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">IN1</text>' +
    '<text x="18" y="56" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">IN2</text>' +
    '<text x="29" y="56" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">IN3</text>' +
    '<text x="40" y="56" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">IN4</text>' +
    '<text x="51" y="56" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="62" y="56" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),

  // ── Passives ──
  RESISTOR: svg('0 0 90 24',
    '<defs>' +
      '<linearGradient id="res_lead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="res_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23fef3c7"/><stop offset="25%25" stop-color="%23fde68a"/><stop offset="70%25" stop-color="%23d97706"/><stop offset="100%25" stop-color="%2392400e"/></linearGradient>' +
      '<linearGradient id="res_gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23fef08a"/><stop offset="45%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23854d0e"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="10.5" width="23" height="3" rx="0.5" fill="url(%23res_lead)"/>' +
    '<rect x="67" y="10.5" width="23" height="3" rx="0.5" fill="url(%23res_lead)"/>' +
    '<circle cx="0.5" cy="12" r="1.5" fill="%2364748b"/><circle cx="89.5" cy="12" r="1.5" fill="%2364748b"/>' +
    '<path d="M 23 7 C 23 4.5 25 3.5 27 3.5 L 63 3.5 C 65 3.5 67 4.5 67 7 L 67 17 C 67 19.5 65 20.5 63 20.5 L 27 20.5 C 25 20.5 23 19.5 23 17 Z" fill="url(%23res_body)" stroke="%2378350f" stroke-width="0.75"/>' +
    '<rect x="21" y="4" width="6" height="16" rx="2" fill="url(%23res_body)" stroke="%2378350f" stroke-width="0.6"/>' +
    '<rect x="63" y="4" width="6" height="16" rx="2" fill="url(%23res_body)" stroke="%2378350f" stroke-width="0.6"/>' +
    '<rect x="29" y="3.5" width="4.5" height="17" fill="%235c2406"/>' +
    '<rect x="39" y="3.5" width="4.5" height="17" fill="%230f172a"/>' +
    '<rect x="49" y="3.5" width="4.5" height="17" fill="%23dc2626"/>' +
    '<rect x="59" y="3.5" width="3.5" height="17" fill="url(%23res_gold)"/>' +
    '<path d="M 24 5.5 L 66 5.5" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>'
  ),
  CERAMIC_CAPACITOR: svg('0 0 44 60',
    '<defs>' +
      '<radialGradient id="cer_body" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23fde68a"/><stop offset="35%25" stop-color="%23f59e0b"/><stop offset="85%25" stop-color="%23b45309"/><stop offset="100%25" stop-color="%2378350f"/></radialGradient>' +
      '<linearGradient id="cer_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="14.8" y="34" width="2.4" height="26" rx="0.5" fill="url(%23cer_lead)"/>' +
    '<circle cx="16" cy="59" r="1.5" fill="%23475569"/>' +
    '<rect x="26.8" y="34" width="2.4" height="26" rx="0.5" fill="url(%23cer_lead)"/>' +
    '<circle cx="28" cy="59" r="1.5" fill="%23475569"/>' +
    '<ellipse cx="16" cy="37" rx="2.5" ry="1.2" fill="%2394a3b8"/>' +
    '<ellipse cx="28" cy="37" rx="2.5" ry="1.2" fill="%2394a3b8"/>' +
    '<path d="M 9 8 Q 22 1 35 8 Q 41 18 39 31 Q 35 41 22 42 Q 9 41 5 31 Q 3 18 9 8 Z" fill="url(%23cer_body)" stroke="%2378350f" stroke-width="1"/>' +
    '<text x="22" y="24" font-size="8" fill="%23451a03" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="0.5">104</text>' +
    '<line x1="15" y1="27" x2="29" y2="27" stroke="%23451a03" stroke-width="1" stroke-linecap="round"/>' +
    '<text x="22" y="34" font-size="5" fill="%235c2406" font-family="Arial" text-anchor="middle">50V</text>' +
    '<path d="M 12 12 Q 22 5 32 12" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>'
  ),
  CAPACITOR: svg('0 0 44 60',
    '<defs>' +
      '<radialGradient id="cap_body" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23fde68a"/><stop offset="35%25" stop-color="%23f59e0b"/><stop offset="85%25" stop-color="%23b45309"/><stop offset="100%25" stop-color="%2378350f"/></radialGradient>' +
      '<linearGradient id="cap_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="14.8" y="34" width="2.4" height="26" rx="0.5" fill="url(%23cap_lead)"/>' +
    '<circle cx="16" cy="59" r="1.5" fill="%23475569"/>' +
    '<rect x="26.8" y="34" width="2.4" height="26" rx="0.5" fill="url(%23cap_lead)"/>' +
    '<circle cx="28" cy="59" r="1.5" fill="%23475569"/>' +
    '<ellipse cx="16" cy="37" rx="2.5" ry="1.2" fill="%2394a3b8"/>' +
    '<ellipse cx="28" cy="37" rx="2.5" ry="1.2" fill="%2394a3b8"/>' +
    '<path d="M 9 8 Q 22 1 35 8 Q 41 18 39 31 Q 35 41 22 42 Q 9 41 5 31 Q 3 18 9 8 Z" fill="url(%23cap_body)" stroke="%2378350f" stroke-width="1"/>' +
    '<text x="22" y="24" font-size="8" fill="%23451a03" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="0.5">104</text>' +
    '<line x1="15" y1="27" x2="29" y2="27" stroke="%23451a03" stroke-width="1" stroke-linecap="round"/>' +
    '<text x="22" y="34" font-size="5" fill="%235c2406" font-family="Arial" text-anchor="middle">50V</text>' +
    '<path d="M 12 12 Q 22 5 32 12" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>'
  ),
  ELECTROLYTIC_CAPACITOR: svg('0 0 46 70',
    '<defs>' +
      '<linearGradient id="elyt_sleeve" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%231e293b"/><stop offset="35%25" stop-color="%23334155"/><stop offset="85%25" stop-color="%230f172a"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
      '<linearGradient id="elyt_alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="elyt_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="14.8" y="48" width="2.4" height="22" rx="0.5" fill="url(%23elyt_lead)"/>' +
    '<circle cx="16" cy="69" r="1.5" fill="%23475569"/>' +
    '<rect x="28.8" y="48" width="2.4" height="22" rx="0.5" fill="url(%23elyt_lead)"/>' +
    '<circle cx="30" cy="69" r="1.5" fill="%23475569"/>' +
    '<rect x="7" y="4" width="32" height="7" rx="3.5" fill="url(%23elyt_alu)" stroke="%2364748b" stroke-width="0.75"/>' +
    '<line x1="20" y1="5.5" x2="26" y2="9.5" stroke="%23475569" stroke-width="0.8"/>' +
    '<line x1="26" y1="5.5" x2="20" y2="9.5" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="7" y="8" width="32" height="42" rx="2" fill="url(%23elyt_sleeve)" stroke="%231e293b" stroke-width="0.75"/>' +
    '<rect x="27.5" y="8" width="6.5" height="42" fill="%23e2e8f0"/>' +
    '<text x="30.75" y="17" font-size="7" fill="%230f172a" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="30.75" y="27" font-size="7" fill="%230f172a" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="30.75" y="37" font-size="7" fill="%230f172a" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="30.75" y="47" font-size="7" fill="%230f172a" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="17" y="24" font-size="7" fill="%23fde047" font-family="Arial" font-weight="bold" text-anchor="middle">10µF</text>' +
    '<text x="17" y="34" font-size="6" fill="%23fde047" font-family="Arial" font-weight="bold" text-anchor="middle">50V</text>' +
    '<text x="17" y="44" font-size="4.5" fill="%23cbd5e1" font-family="Arial" text-anchor="middle">105°C</text>' +
    '<line x1="10" y1="9" x2="10" y2="48" stroke="%23ffffff" stroke-width="1" opacity="0.3"/>'
  ),
  DIODE: svg('0 0 72 28',
    '<defs>' +
      '<linearGradient id="dio_lead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dio_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2327272a"/><stop offset="50%25" stop-color="%2318181b"/><stop offset="100%25" stop-color="%2309090b"/></linearGradient>' +
      '<linearGradient id="dio_silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="12.5" width="20" height="3" rx="0.5" fill="url(%23dio_lead)"/>' +
    '<circle cx="0.5" cy="14" r="1.5" fill="%2364748b"/>' +
    '<rect x="52" y="12.5" width="20" height="3" rx="0.5" fill="url(%23dio_lead)"/>' +
    '<circle cx="71.5" cy="14" r="1.5" fill="%2364748b"/>' +
    '<rect x="18" y="6" width="36" height="16" rx="2.5" fill="url(%23dio_body)" stroke="%233f3f46" stroke-width="0.75"/>' +
    '<rect x="44" y="6" width="5.5" height="16" fill="url(%23dio_silver)"/>' +
    '<text x="32" y="16.5" font-size="6" fill="%23a1a1aa" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.5">1N4007</text>' +
    '<line x1="20" y1="7.5" x2="52" y2="7.5" stroke="%23ffffff" stroke-width="0.8" opacity="0.4"/>'
  ),
  NPN_TRANSISTOR: svg('0 0 56 70',
    '<defs>' +
      '<linearGradient id="to92_body" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23334155"/><stop offset="30%25" stop-color="%231e293b"/><stop offset="85%25" stop-color="%230f172a"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
      '<linearGradient id="to92_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="12.8" y="42" width="2.4" height="28" rx="0.5" fill="url(%23to92_lead)"/>' +
    '<circle cx="14" cy="69" r="1.5" fill="%23475569"/>' +
    '<rect x="26.8" y="42" width="2.4" height="28" rx="0.5" fill="url(%23to92_lead)"/>' +
    '<circle cx="28" cy="69" r="1.5" fill="%23475569"/>' +
    '<rect x="40.8" y="42" width="2.4" height="28" rx="0.5" fill="url(%23to92_lead)"/>' +
    '<circle cx="42" cy="69" r="1.5" fill="%23475569"/>' +
    '<path d="M 12 12 Q 28 4 44 12 L 44 42 C 44 45 42 46 39 46 L 17 46 C 14 46 12 45 12 42 Z" fill="url(%23to92_body)" stroke="%23334155" stroke-width="0.8"/>' +
    '<line x1="14" y1="44" x2="42" y2="44" stroke="%23475569" stroke-width="0.6"/>' +
    '<text x="28" y="24" font-size="7.5" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">2N3904</text>' +
    '<text x="28" y="34" font-size="5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">C  B  E</text>' +
    '<path d="M 16 12 Q 28 6 40 12" fill="none" stroke="%23ffffff" stroke-width="1" opacity="0.35"/>'
  ),
  PNP_TRANSISTOR: svg('0 0 56 70',
    '<defs>' +
      '<linearGradient id="to92_body2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23334155"/><stop offset="30%25" stop-color="%231e293b"/><stop offset="85%25" stop-color="%230f172a"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
    '</defs>' +
    '<rect x="12.8" y="42" width="2.4" height="28" rx="0.5" fill="url(%23to92_lead)"/>' +
    '<circle cx="14" cy="69" r="1.5" fill="%23475569"/>' +
    '<rect x="26.8" y="42" width="2.4" height="28" rx="0.5" fill="url(%23to92_lead)"/>' +
    '<circle cx="28" cy="69" r="1.5" fill="%23475569"/>' +
    '<rect x="40.8" y="42" width="2.4" height="28" rx="0.5" fill="url(%23to92_lead)"/>' +
    '<circle cx="42" cy="69" r="1.5" fill="%23475569"/>' +
    '<path d="M 12 12 Q 28 4 44 12 L 44 42 C 44 45 42 46 39 46 L 17 46 C 14 46 12 45 12 42 Z" fill="url(%23to92_body2)" stroke="%23334155" stroke-width="0.8"/>' +
    '<line x1="14" y1="44" x2="42" y2="44" stroke="%23475569" stroke-width="0.6"/>' +
    '<text x="28" y="24" font-size="7.5" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">2N3906</text>' +
    '<text x="28" y="34" font-size="5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">E  B  C</text>' +
    '<path d="M 16 12 Q 28 6 40 12" fill="none" stroke="%23ffffff" stroke-width="1" opacity="0.35"/>'
  ),
  VOLTAGE_REGULATOR_7805: svg('0 0 64 72',
    '<defs>' +
      '<linearGradient id="reg_tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="reg_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
    '</defs>' +
    '<rect x="14.5" y="44" width="3" height="28" rx="0.5" fill="%2394a3b8"/><circle cx="16" cy="71.5" r="1.5" fill="%23475569"/>' +
    '<rect x="30.5" y="44" width="3" height="28" rx="0.5" fill="%2394a3b8"/><circle cx="32" cy="71.5" r="1.5" fill="%23475569"/>' +
    '<rect x="46.5" y="44" width="3" height="28" rx="0.5" fill="%2394a3b8"/><circle cx="48" cy="71.5" r="1.5" fill="%23475569"/>' +
    '<rect x="14" y="6" width="36" height="20" rx="2" fill="url(%23reg_tab)" stroke="%2364748b" stroke-width="0.75"/>' +
    '<circle cx="32" cy="16" r="4.5" fill="%23475569"/><circle cx="32" cy="16" r="3" fill="%230f172a"/>' +
    '<rect x="10" y="22" width="44" height="28" rx="3" fill="url(%23reg_body)" stroke="%23475569" stroke-width="0.8"/>' +
    '<rect x="12" y="24" width="40" height="3" rx="1" fill="%230f172a" opacity="0.4"/>' +
    '<text x="32" y="38" font-size="8" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">L7805CV</text>' +
    '<text x="32" y="46" font-size="4.5" fill="%23cbd5e1" font-family="Arial" text-anchor="middle">VIN  GND  VOUT</text>'
  ),
  POTENTIOMETER: svg('0 0 50 50',
    '<defs>' +
      '<radialGradient id="pot_casing" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="45%25" stop-color="%23cbd5e1"/><stop offset="85%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></radialGradient>' +
      '<radialGradient id="pot_knob" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%2338bdf8"/><stop offset="45%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%230c4a6e"/></radialGradient>' +
    '</defs>' +
    '<rect x="8" y="42" width="4" height="8" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="10" cy="49" r="1.8" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/><circle cx="10" cy="49" r="0.9" fill="%230f172a"/>' +
    '<rect x="38" y="42" width="4" height="8" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="40" cy="49" r="1.8" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/><circle cx="40" cy="49" r="0.9" fill="%230f172a"/>' +
    '<rect x="23" y="0" width="4" height="8" rx="0.5" fill="%2394a3b8"/>' +
    '<circle cx="25" cy="1" r="1.8" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.4"/><circle cx="25" cy="1" r="0.9" fill="%230f172a"/>' +
    '<circle cx="25" cy="25" r="20" fill="url(%23pot_casing)" stroke="%2364748b" stroke-width="1"/>' +
    '<circle cx="25" cy="25" r="18.5" fill="none" stroke="%23f8fafc" stroke-width="0.6" opacity="0.6"/>' +
    '<circle cx="25" cy="25" r="12" fill="url(%23pot_knob)" stroke="%23075985" stroke-width="0.8"/>' +
    '<line x1="25" y1="25" x2="25" y2="15" stroke="%23ffffff" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="25" cy="25" r="3.5" fill="%23f8fafc"/>'
  ),
  PUSH_BUTTON: svg('0 0 40 40',
    '<defs>' +
      '<linearGradient id="btn_metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="35%25" stop-color="%23e2e8f0"/><stop offset="70%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%23cbd5e1"/></linearGradient>' +
      '<linearGradient id="btn_lead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<radialGradient id="btn_cap" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23fca5a5"/><stop offset="40%25" stop-color="%23ef4444"/><stop offset="100%25" stop-color="%23991b1b"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="8.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead)"/>' +
    '<rect x="0" y="28.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead)"/>' +
    '<rect x="34" y="8.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead)"/>' +
    '<rect x="34" y="28.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead)"/>' +
    '<line x1="3" y1="8.5" x2="3" y2="11.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<line x1="3" y1="28.5" x2="3" y2="31.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<line x1="37" y1="8.5" x2="37" y2="11.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<line x1="37" y1="28.5" x2="37" y2="31.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<rect x="5" y="5" width="30" height="30" rx="3.5" fill="%230f172a" stroke="%231e293b" stroke-width="0.8"/>' +
    '<rect x="5.5" y="5.5" width="29" height="29" rx="2.5" fill="url(%23btn_metal)" stroke="%2364748b" stroke-width="0.75"/>' +
    '<circle cx="8" cy="8" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="32" cy="8" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="8" cy="32" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="32" cy="32" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="20" cy="20" r="11" fill="%23334155" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="20" cy="20" r="9.5" fill="%23020617"/>' +
    '<circle cx="20" cy="20" r="8.5" fill="url(%23btn_cap)" stroke="%23991b1b" stroke-width="0.8"/>' +
    '<path d="M 14.5 17 A 6.5 6.5 0 0 1 25.5 17" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.65"/>' +
    '<circle cx="17.5" cy="17" r="1.3" fill="%23ffffff" opacity="0.6"/>'
  ),
  BUTTON: svg('0 0 40 40',
    '<defs>' +
      '<linearGradient id="btn_metal2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="35%25" stop-color="%23e2e8f0"/><stop offset="70%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%23cbd5e1"/></linearGradient>' +
      '<linearGradient id="btn_lead2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<radialGradient id="btn_cap2" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23fca5a5"/><stop offset="40%25" stop-color="%23ef4444"/><stop offset="100%25" stop-color="%23991b1b"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="8.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead2)"/>' +
    '<rect x="0" y="28.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead2)"/>' +
    '<rect x="34" y="8.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead2)"/>' +
    '<rect x="34" y="28.5" width="6" height="3" rx="0.5" fill="url(%23btn_lead2)"/>' +
    '<line x1="3" y1="8.5" x2="3" y2="11.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<line x1="3" y1="28.5" x2="3" y2="31.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<line x1="37" y1="8.5" x2="37" y2="11.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<line x1="37" y1="28.5" x2="37" y2="31.5" stroke="%23475569" stroke-width="0.5"/>' +
    '<rect x="5" y="5" width="30" height="30" rx="3.5" fill="%230f172a" stroke="%231e293b" stroke-width="0.8"/>' +
    '<rect x="5.5" y="5.5" width="29" height="29" rx="2.5" fill="url(%23btn_metal2)" stroke="%2364748b" stroke-width="0.75"/>' +
    '<circle cx="8" cy="8" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="32" cy="8" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="8" cy="32" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="32" cy="32" r="1.3" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="20" cy="20" r="11" fill="%23334155" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="20" cy="20" r="9.5" fill="%23020617"/>' +
    '<circle cx="20" cy="20" r="8.5" fill="url(%23btn_cap2)" stroke="%23991b1b" stroke-width="0.8"/>' +
    '<path d="M 14.5 17 A 6.5 6.5 0 0 1 25.5 17" fill="none" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.65"/>' +
    '<circle cx="17.5" cy="17" r="1.3" fill="%23ffffff" opacity="0.6"/>'
  ),
  SWITCH_SPST: svg('0 0 60 30',
    '<defs>' +
      '<linearGradient id="spst_plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="35%25" stop-color="%23e2e8f0"/><stop offset="70%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="spst_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
      '<linearGradient id="spst_bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%23090d16"/></linearGradient>' +
    '</defs>' +
    // Left terminal lug (Pin 1 at x=6, y=15)
    '<rect x="0" y="12.5" width="14" height="5" rx="1" fill="url(%23spst_lead)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="6" cy="15" r="2.6" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/><circle cx="6" cy="15" r="1.3" fill="%230f172a"/>' +
    // Right terminal lug (Pin 2 at x=54, y=15)
    '<rect x="46" y="12.5" width="14" height="5" rx="1" fill="url(%23spst_lead)" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="54" cy="15" r="2.6" fill="%23cbd5e1" stroke="%2364748b" stroke-width="0.5"/><circle cx="54" cy="15" r="1.3" fill="%230f172a"/>' +
    // Switch chassis body
    '<rect x="10" y="3" width="40" height="24" rx="3" fill="%230f172a" stroke="%231e293b" stroke-width="0.8"/>' +
    // Brushed metallic top plate
    '<rect x="12" y="4.5" width="36" height="21" rx="2" fill="url(%23spst_plate)" stroke="%2364748b" stroke-width="0.6"/>' +
    // Mounting rivets
    '<circle cx="16.5" cy="15" r="1.8" fill="%23475569" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="16.5" cy="15" r="0.9" fill="%230f172a"/>' +
    '<circle cx="43.5" cy="15" r="1.8" fill="%23475569" stroke="%23cbd5e1" stroke-width="0.4"/>' +
    '<circle cx="43.5" cy="15" r="0.9" fill="%230f172a"/>' +
    // Recessed switch slot well (fits interactive toggle perfectly at center x=30, y=15)
    '<rect x="22" y="3.5" width="16" height="23" rx="2.5" fill="url(%23spst_bezel)" stroke="%23334155" stroke-width="0.6"/>' +
    '<rect x="23.5" y="5" width="13" height="20" rx="1.5" fill="%23020617"/>' +
    // Power symbol markings: | (ON) at top, O (OFF) at bottom
    '<text x="30" y="3" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="900" text-anchor="middle">|</text>' +
    '<text x="30" y="29.5" font-size="3" fill="%2394a3b8" font-family="Arial" font-weight="900" text-anchor="middle">O</text>' +
    // Terminal numbers
    '<text x="16.5" y="10" font-size="2.6" fill="%23475569" font-family="Arial" font-weight="bold" text-anchor="middle">1</text>' +
    '<text x="43.5" y="10" font-size="2.6" fill="%23475569" font-family="Arial" font-weight="bold" text-anchor="middle">2</text>'
  ),
  BREADBOARD: svg('0 0 220 120',
    '<defs>' +
      '<linearGradient id="bb_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23ffffff"/><stop offset="3%25" stop-color="%23f8fafc"/><stop offset="97%25" stop-color="%23f1f5f9"/><stop offset="100%25" stop-color="%23e2e8f0"/></linearGradient>' +
      '<linearGradient id="bb_trough" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23cbd5e1"/><stop offset="25%25" stop-color="%23e2e8f0"/><stop offset="75%25" stop-color="%23e2e8f0"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="216" height="116" rx="4" fill="url(%23bb_body)" stroke="%2394a3b8" stroke-width="1.2"/>' +
    '<rect x="0" y="45" width="2.5" height="10" rx="1" fill="%23cbd5e1"/>' +
    '<rect x="0" y="65" width="2.5" height="10" rx="1" fill="%23cbd5e1"/>' +
    '<rect x="217.5" y="45" width="2.5" height="10" rx="1" fill="%23cbd5e1"/>' +
    '<rect x="217.5" y="65" width="2.5" height="10" rx="1" fill="%23cbd5e1"/>' +
    '<line x1="12" y1="6" x2="208" y2="6" stroke="%23ef4444" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="12" y1="26" x2="208" y2="26" stroke="%233b82f6" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="12" y1="94" x2="208" y2="94" stroke="%23ef4444" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="12" y1="114" x2="208" y2="114" stroke="%233b82f6" stroke-width="1" stroke-linecap="round"/>' +
    '<text x="8" y="7.5" font-size="5.5" fill="%23ef4444" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<text x="212" y="7.5" font-size="5.5" fill="%23ef4444" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<text x="8" y="27" font-size="6" fill="%233b82f6" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="212" y="27" font-size="6" fill="%233b82f6" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="8" y="95.5" font-size="5.5" fill="%23ef4444" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<text x="212" y="95.5" font-size="5.5" fill="%23ef4444" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<text x="8" y="115" font-size="6" fill="%233b82f6" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<text x="212" y="115" font-size="6" fill="%233b82f6" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<rect x="10" y="69" width="200" height="4" rx="1" fill="url(%23bb_trough)"/>' +
    ['a', 'b', 'c', 'd', 'e'].map((r, i) =>
      `<text x="10" y="${41.5 + i * 6}" font-size="4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="end">${r}</text>` +
      `<text x="210" y="${41.5 + i * 6}" font-size="4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="start">${r}</text>`
    ).join('') +
    ['f', 'g', 'h', 'i', 'j'].map((r, i) =>
      `<text x="10" y="${79.5 + i * 6}" font-size="4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="end">${r}</text>` +
      `<text x="210" y="${79.5 + i * 6}" font-size="4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="start">${r}</text>`
    ).join('') +
    [1, 5, 10, 15, 20, 25, 30].map(c => {
      const x = 15 + (c - 1) * 6.55;
      return `<text x="${x.toFixed(2)}" y="35" font-size="4" fill="%2364748b" font-family="Arial" font-weight="bold" text-anchor="middle">${c}</text>` +
             `<text x="${x.toFixed(2)}" y="108" font-size="4" fill="%2364748b" font-family="Arial" font-weight="bold" text-anchor="middle">${c}</text>`;
    }).join('') +
    '<g>' +
    Array.from({ length: 30 }, (_, i) => {
      const x = (15 + i * 6.55).toFixed(2);
      const tie = (cy: number) =>
        `<rect x="${(Number(x) - 1.6).toFixed(2)}" y="${(cy - 1.6).toFixed(2)}" width="3.2" height="3.2" rx="0.5" fill="%23e2e8f0" stroke="%23cbd5e1" stroke-width="0.3"/>` +
        `<rect x="${(Number(x) - 1.1).toFixed(2)}" y="${(cy - 1.1).toFixed(2)}" width="2.2" height="2.2" rx="0.3" fill="%23334155"/>` +
        `<circle cx="${x}" cy="${cy}" r="0.75" fill="%230f172a"/>`;
      return tie(10) + tie(22) +
             tie(40) + tie(46) + tie(52) + tie(58) + tie(64) +
             tie(78) + tie(84) + tie(90) + tie(96) + tie(102) +
             tie(98) + tie(110);
    }).join('') +
    '</g>' +
    '<text x="110" y="72" font-size="3" fill="%2364748b" text-anchor="middle" font-family="Arial" font-weight="bold" letter-spacing="0.5">VOLTFORGE BREADBOARD</text>'
  ),
  BUZZER: svg('0 0 50 50',
    '<defs>' +
      '<radialGradient id="buzz_body" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23334155"/><stop offset="65%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%23090d16"/></radialGradient>' +
      '<radialGradient id="buzz_piezo" cx="45%25" cy="40%25" r="55%25"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="45%25" stop-color="%23cbd5e1"/><stop offset="85%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></radialGradient>' +
      '<linearGradient id="buzz_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    '<rect x="13.5" y="42" width="3" height="8" rx="0.5" fill="url(%23buzz_lead)"/>' +
    '<circle cx="15" cy="49" r="2.2" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<circle cx="15" cy="49" r="1.1" fill="%230f172a"/>' +
    '<rect x="33.5" y="42" width="3" height="8" rx="0.5" fill="url(%23buzz_lead)"/>' +
    '<circle cx="35" cy="49" r="2.2" fill="%2364748b" stroke="%23cbd5e1" stroke-width="0.5"/>' +
    '<circle cx="35" cy="49" r="1.1" fill="%230f172a"/>' +
    '<circle cx="25" cy="23" r="21" fill="url(%23buzz_body)" stroke="%23475569" stroke-width="1.2"/>' +
    '<circle cx="25" cy="23" r="19.5" fill="none" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<circle cx="25" cy="23" r="16.5" fill="none" stroke="%230f172a" stroke-width="1.5"/>' +
    '<circle cx="25" cy="23" r="13.5" fill="%23090d16" stroke="%231e293b" stroke-width="0.8"/>' +
    '<circle cx="25" cy="23" r="10.5" fill="url(%23buzz_piezo)" stroke="%23475569" stroke-width="0.75"/>' +
    '<circle cx="25" cy="23" r="3.5" fill="%23020617" stroke="%231e293b" stroke-width="0.8"/>' +
    '<text x="13" y="14" font-size="7" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">+</text>' +
    '<text x="37" y="14" font-size="7" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">−</text>' +
    '<path d="M 33 20 A 10 10 0 0 1 33 26" fill="none" stroke="%2364748b" stroke-width="1" stroke-linecap="round" opacity="0.6"/>' +
    '<path d="M 36 17 A 15 15 0 0 1 36 29" fill="none" stroke="%2364748b" stroke-width="1" stroke-linecap="round" opacity="0.4"/>'
  ),
  MULTIMETER: svg('0 0 90 70',
    '<defs>' +
      '<linearGradient id="dmm_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f59e0b"/><stop offset="50%25" stop-color="%23d97706"/><stop offset="100%25" stop-color="%23b45309"/></linearGradient>' +
      '<linearGradient id="dmm_face" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="100%25" stop-color="%231e293b"/></linearGradient>' +
      '<linearGradient id="dmm_lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2399f6e4"/><stop offset="50%25" stop-color="%235eead4"/><stop offset="100%25" stop-color="%232dd4bf"/></linearGradient>' +
      '<radialGradient id="dmm_knob" cx="35%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></radialGradient>' +
    '</defs>' +
    // Yellow protective rubber holster
    '<rect x="2" y="2" width="86" height="66" rx="7" fill="url(%23dmm_case)" stroke="%2392400e" stroke-width="1.2"/>' +
    // Dark inner body faceplate
    '<rect x="6" y="5" width="78" height="60" rx="5" fill="url(%23dmm_face)" stroke="%230f172a" stroke-width="0.8"/>' +
    // Brand & model header
    '<text x="12" y="11" font-size="4" fill="%23fef08a" font-family="Arial" font-weight="900">VOLTFORGE</text>' +
    '<text x="78" y="11" font-size="3.2" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="end">TRUE RMS DMM</text>' +
    // LCD bezel and screen (x=10, y=14, w=70, h=18)
    '<rect x="10" y="13" width="70" height="19" rx="2" fill="%230f172a" stroke="%231e293b" stroke-width="0.75"/>' +
    '<rect x="12" y="15" width="66" height="15" rx="1.5" fill="url(%23dmm_lcd)"/>' +
    // LCD content: 7-segment digital readout
    '<text x="15" y="20" font-size="2.8" fill="%23042f2e" font-family="Arial" font-weight="bold">AUTO</text>' +
    '<text x="15" y="25" font-size="2.8" fill="%23042f2e" font-family="Arial" font-weight="bold">DC</text>' +
    '<text x="54" y="27" font-size="11" fill="%23042f2e" font-family="Courier New, monospace" font-weight="900" text-anchor="end" letter-spacing="1"> 0.00</text>' +
    '<text x="64" y="27" font-size="8" fill="%23042f2e" font-family="Arial" font-weight="900">V</text>' +
    '<line x1="15" y1="28.5" x2="68" y2="28.5" stroke="%230f766e" stroke-width="0.5"/>' +
    // Rotary range selector dial (center cx=45, cy=44, r=9.5)
    '<circle cx="45" cy="44" r="9.5" fill="url(%23dmm_knob)" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="45" cy="44" r="8" fill="none" stroke="%230f172a" stroke-width="0.8"/>' +
    '<line x1="45" y1="44" x2="38" y2="39" stroke="%23f8fafc" stroke-width="1.8" stroke-linecap="round"/>' +
    '<circle cx="45" cy="44" r="2.2" fill="%230f172a"/>' +
    // Printed dial range markings
    '<text x="34" y="40" font-size="3" fill="%23fef08a" font-family="Arial" font-weight="bold" text-anchor="middle">V\u2393</text>' +
    '<text x="35" y="52" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">V~</text>' +
    '<text x="45" y="57" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">\u03A9</text>' +
    '<text x="55" y="52" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">mA</text>' +
    '<text x="56" y="40" font-size="3" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">A</text>' +
    '<text x="45" y="34" font-size="3" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">OFF</text>' +
    // Side function buttons
    '<circle cx="15" cy="40" r="3" fill="%23eab308" stroke="%23ca8a04" stroke-width="0.5"/><text x="15" y="46" font-size="2.2" fill="%23cbd5e1" font-family="Arial" text-anchor="middle">HOLD</text>' +
    '<circle cx="75" cy="40" r="3" fill="%233b82f6" stroke="%232563eb" stroke-width="0.5"/><text x="75" y="46" font-size="2.2" fill="%23cbd5e1" font-family="Arial" text-anchor="middle">REL</text>' +
    // Banana probe jacks: Red V/Ω/mA at (24, 70), Black COM at (66, 70)
    '<rect x="18" y="53" width="12" height="16" rx="1.5" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="24" cy="61" r="4" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="24" cy="70" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="24" cy="70" r="1.3" fill="%230f172a"/>' +
    '<text x="24" y="51" font-size="3.2" fill="%23fca5a5" font-family="Arial" font-weight="900" text-anchor="middle">V\u03A9mA</text>' +
    '<rect x="60" y="53" width="12" height="16" rx="1.5" fill="%230f172a" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="66" cy="61" r="4" fill="%23334155" stroke="%231e293b" stroke-width="0.5"/>' +
    '<circle cx="66" cy="70" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="66" cy="70" r="1.3" fill="%230f172a"/>' +
    '<text x="66" y="51" font-size="3.2" fill="%23cbd5e1" font-family="Arial" font-weight="900" text-anchor="middle">COM</text>'
  ),
  IC_555_TIMER: svg('0 0 90 50',
    '<defs>' +
      '<linearGradient id="dip555_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dip555_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
    '</defs>' +
    [23, 35, 47, 59].map((x) =>
      `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip555_lead)"/>` +
      `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    [23, 35, 47, 59].map((x) =>
      `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip555_lead)"/>` +
      `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    '<rect x="14" y="11" width="62" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
    '<rect x="14" y="10" width="62" height="30" rx="2.5" fill="url(%23dip555_body)" stroke="%23334155" stroke-width="0.75"/>' +
    '<line x1="16" y1="11" x2="74" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<line x1="16" y1="39" x2="74" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
    '<path d="M 14 20 A 5 5 0 0 1 14 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="21" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/>' +
    '<circle cx="21" cy="33" r="0.9" fill="%231e293b"/>' +
    '<text x="26" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">TI</text>' +
    '<text x="47" y="26" font-size="9" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">NE555P</text>' +
    '<text x="47" y="34" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">2432 MALAYSIA</text>'
  ),
  IC_74HC595: svg('0 0 120 50',
    '<defs>' +
      '<linearGradient id="dip595_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dip595_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
    '</defs>' +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip595_lead)"/>` +
      `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip595_lead)"/>` +
      `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    '<rect x="8" y="11" width="104" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
    '<rect x="8" y="10" width="104" height="30" rx="2.5" fill="url(%23dip595_body)" stroke="%23334155" stroke-width="0.75"/>' +
    '<line x1="10" y1="11" x2="110" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<line x1="10" y1="39" x2="110" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
    '<path d="M 8 20 A 5 5 0 0 1 8 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="15" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/>' +
    '<circle cx="15" cy="33" r="0.9" fill="%231e293b"/>' +
    '<text x="20" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">TI</text>' +
    '<text x="60" y="26" font-size="9" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">SN74HC595N</text>' +
    '<text x="60" y="34" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">2418 MALAYSIA  8-BIT SHIFT REG</text>'
  ),
  IC_74HC165: svg('0 0 120 50',
    '<defs>' +
      '<linearGradient id="dip165_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dip165_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
    '</defs>' +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip165_lead)"/>` +
      `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip165_lead)"/>` +
      `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    '<rect x="8" y="11" width="104" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
    '<rect x="8" y="10" width="104" height="30" rx="2.5" fill="url(%23dip165_body)" stroke="%23334155" stroke-width="0.75"/>' +
    '<line x1="10" y1="11" x2="110" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<line x1="10" y1="39" x2="110" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
    '<path d="M 8 20 A 5 5 0 0 1 8 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="15" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/>' +
    '<circle cx="15" cy="33" r="0.9" fill="%231e293b"/>' +
    '<text x="20" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">TI</text>' +
    '<text x="60" y="26" font-size="9" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">SN74HC165N</text>' +
    '<text x="60" y="34" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">2346 MALAYSIA  8-BIT PISO SHIFT</text>'
  ),
  IC_74HC138: svg('0 0 120 50',
    '<defs>' +
      '<linearGradient id="dip138_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dip138_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
    '</defs>' +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip138_lead)"/>` +
      `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip138_lead)"/>` +
      `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    '<rect x="8" y="11" width="104" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
    '<rect x="8" y="10" width="104" height="30" rx="2.5" fill="url(%23dip138_body)" stroke="%23334155" stroke-width="0.75"/>' +
    '<line x1="10" y1="11" x2="110" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<line x1="10" y1="39" x2="110" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
    '<path d="M 8 20 A 5 5 0 0 1 8 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="15" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/>' +
    '<circle cx="15" cy="33" r="0.9" fill="%231e293b"/>' +
    '<text x="20" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">TI</text>' +
    '<text x="60" y="26" font-size="9" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">SN74HC138N</text>' +
    '<text x="60" y="34" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">2402 MALAYSIA  3-TO-8 DECODER</text>'
  ),
  IC_74HC151: svg('0 0 120 50',
    '<defs>' +
      '<linearGradient id="dip151_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dip151_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
    '</defs>' +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip151_lead)"/>` +
      `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip151_lead)"/>` +
      `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    '<rect x="8" y="11" width="104" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
    '<rect x="8" y="10" width="104" height="30" rx="2.5" fill="url(%23dip151_body)" stroke="%23334155" stroke-width="0.75"/>' +
    '<line x1="10" y1="11" x2="110" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<line x1="10" y1="39" x2="110" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
    '<path d="M 8 20 A 5 5 0 0 1 8 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="15" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/>' +
    '<circle cx="15" cy="33" r="0.9" fill="%231e293b"/>' +
    '<text x="20" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">TI</text>' +
    '<text x="60" y="26" font-size="9" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">SN74HC151N</text>' +
    '<text x="60" y="34" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">2351 MALAYSIA  8:1 MULTIPLEXER</text>'
  ),
  IC_CD4017: svg('0 0 120 50',
    '<defs>' +
      '<linearGradient id="dip4017_lead" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
      '<linearGradient id="dip4017_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23272f3d"/><stop offset="50%25" stop-color="%23171f2c"/><stop offset="100%25" stop-color="%230b1019"/></linearGradient>' +
    '</defs>' +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="0" width="3.6" height="12" rx="0.5" fill="url(%23dip4017_lead)"/>` +
      `<polygon points="${x - 2.5},10 ${x + 2.5},10 ${x + 1.8},6 ${x - 1.8},6" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="1.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5].map((x) =>
      `<rect x="${x - 1.8}" y="38" width="3.6" height="12" rx="0.5" fill="url(%23dip4017_lead)"/>` +
      `<polygon points="${x - 1.8},44 ${x + 1.8},44 ${x + 2.5},40 ${x - 2.5},40" fill="%2394a3b8"/>` +
      `<circle cx="${x}" cy="48.5" r="1.1" fill="%230f172a" stroke="%23cbd5e1" stroke-width="0.3"/>`
    ).join('') +
    '<rect x="8" y="11" width="104" height="30" rx="2.5" fill="%23000000" opacity="0.35"/>' +
    '<rect x="8" y="10" width="104" height="30" rx="2.5" fill="url(%23dip4017_body)" stroke="%23334155" stroke-width="0.75"/>' +
    '<line x1="10" y1="11" x2="110" y2="11" stroke="%23475569" stroke-width="0.75" opacity="0.6"/>' +
    '<line x1="10" y1="39" x2="110" y2="39" stroke="%23020617" stroke-width="0.75" opacity="0.8"/>' +
    '<path d="M 8 20 A 5 5 0 0 1 8 30 Z" fill="%230b1019" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="15" cy="33" r="1.8" fill="%23090d16" stroke="%23334155" stroke-width="0.5"/>' +
    '<circle cx="15" cy="33" r="0.9" fill="%231e293b"/>' +
    '<text x="20" y="20" font-size="5" fill="%2394a3b8" font-family="Arial" font-weight="bold">HARRIS</text>' +
    '<text x="60" y="26" font-size="9" fill="%23f1f5f9" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="1">CD4017BE</text>' +
    '<text x="60" y="34" font-size="4.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle" letter-spacing="0.5">2339 MEXICO  DECADE COUNTER</text>'
  ),

  // ── Drone / ESC ──
  // ── Drone / ESC ──
  ESC_MODULE: svg('0 0 120 60',
    '<defs>' +
      '<linearGradient id="esc_wrap" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%231e293b" stop-opacity="0.95"/><stop offset="50%25" stop-color="%230f172a" stop-opacity="0.9"/><stop offset="100%25" stop-color="%23020617" stop-opacity="0.95"/></linearGradient>' +
      '<linearGradient id="esc_sink" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%2364748b"/><stop offset="50%25" stop-color="%23475569"/><stop offset="100%25" stop-color="%23334155"/></linearGradient>' +
      '<linearGradient id="esc_gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23fef08a"/><stop offset="50%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23a16207"/></linearGradient>' +
    '</defs>' +
    // Translucent heat-shrink wrap over PCB
    '<rect x="8" y="4" width="104" height="52" rx="4" fill="url(%23esc_wrap)" stroke="%23334155" stroke-width="1"/>' +
    // Aluminum heatsink plate with cooling ridges
    '<rect x="22" y="8" width="76" height="20" rx="1.5" fill="url(%23esc_sink)" stroke="%2364748b" stroke-width="0.5"/>' +
    [26, 33, 40, 47, 54, 61, 68, 75, 82, 89].map((x) =>
      `<line x1="${x}" y1="9" x2="${x}" y2="27" stroke="%231e293b" stroke-width="0.8"/><line x1="${x + 1}" y1="9" x2="${x + 1}" y2="27" stroke="%2394a3b8" stroke-width="0.4"/>`
    ).join('') +
    // Microcontroller IC & label
    '<rect x="30" y="32" width="22" height="18" rx="1" fill="%2309090b" stroke="%2327272a" stroke-width="0.5"/>' +
    '<circle cx="33" cy="35" r="0.6" fill="%2371717a"/>' +
    '<text x="41" y="41" font-size="3" fill="%2322c55e" font-family="Arial" font-weight="bold" text-anchor="middle">BLHeli_32</text>' +
    '<text x="41" y="46" font-size="2.4" fill="%2394a3b8" font-family="Arial" text-anchor="middle">30A DSHOT</text>' +
    // Low-ESR electrolytic capacitor
    '<rect x="58" y="32" width="36" height="18" rx="3" fill="%2318181b" stroke="%23334155" stroke-width="0.6"/>' +
    '<rect x="58" y="32" width="6" height="18" fill="%23e2e8f0"/>' +
    '<text x="61" y="42" font-size="5" fill="%230f172a" font-family="Arial" font-weight="900" text-anchor="middle">\u2212</text>' +
    '<text x="78" y="42" font-size="3.5" fill="%23facc15" font-family="Arial" font-weight="bold" text-anchor="middle">330\u00B5F 25V</text>' +
    // Left input wires: Signal (0, 15), VCC (0, 30), GND (0, 45)
    '<rect x="0" y="13" width="10" height="4" rx="1" fill="%23ea580c"/>' +
    '<circle cx="1" cy="15" r="1.5" fill="%23f97316" stroke="%23c2410c" stroke-width="0.4"/>' +
    '<text x="12" y="16.5" font-size="3" fill="%23fb923c" font-family="Arial" font-weight="bold">SIG</text>' +
    '<rect x="0" y="27.5" width="10" height="5" rx="1" fill="%23dc2626"/>' +
    '<circle cx="1" cy="30" r="1.8" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.4"/>' +
    '<text x="12" y="31.5" font-size="3" fill="%23f87171" font-family="Arial" font-weight="bold">VCC</text>' +
    '<rect x="0" y="42.5" width="10" height="5" rx="1" fill="%230f172a"/>' +
    '<circle cx="1" cy="45" r="1.8" fill="%23334155" stroke="%23020617" stroke-width="0.4"/>' +
    '<text x="12" y="46.5" font-size="3" fill="%2394a3b8" font-family="Arial" font-weight="bold">GND</text>' +
    // Right phase output wires with gold bullet connectors: Phase A (120, 15), Phase B (120, 30), Phase C (120, 45)
    '<rect x="110" y="13" width="10" height="4" rx="1" fill="%232563eb"/>' +
    '<circle cx="119" cy="15" r="1.6" fill="url(%23esc_gold)" stroke="%23854d0e" stroke-width="0.4"/>' +
    '<text x="108" y="16.5" font-size="3" fill="%2360a5fa" font-family="Arial" font-weight="bold" text-anchor="end">PH-A</text>' +
    '<rect x="110" y="28" width="10" height="4" rx="1" fill="%23eab308"/>' +
    '<circle cx="119" cy="30" r="1.6" fill="url(%23esc_gold)" stroke="%23854d0e" stroke-width="0.4"/>' +
    '<text x="108" y="31.5" font-size="3" fill="%23fde047" font-family="Arial" font-weight="bold" text-anchor="end">PH-B</text>' +
    '<rect x="110" y="43" width="10" height="4" rx="1" fill="%231e293b"/>' +
    '<circle cx="119" cy="45" r="1.6" fill="url(%23esc_gold)" stroke="%23854d0e" stroke-width="0.4"/>' +
    '<text x="108" y="46.5" font-size="3" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="end">PH-C</text>'
  ),

  MOTOR_BLDC: svg('0 0 80 80',
    '<defs>' +
      '<radialGradient id="bldc_bell" cx="40%25" cy="35%25" r="65%25"><stop offset="0%25" stop-color="%23ef4444"/><stop offset="60%25" stop-color="%23b91c1c"/><stop offset="100%25" stop-color="%237f1d1d"/></radialGradient>' +
      '<radialGradient id="bldc_hub" cx="40%25" cy="40%25" r="60%25"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="45%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></radialGradient>' +
      '<linearGradient id="bldc_coil" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23fbbf24"/><stop offset="40%25" stop-color="%23d97706"/><stop offset="100%25" stop-color="%2378350f"/></linearGradient>' +
    '</defs>' +
    // Mounting base plate (X-mount cross ears)
    '<rect x="6" y="28" width="68" height="16" rx="2" fill="%23334155" stroke="%231e293b" stroke-width="0.8"/>' +
    '<circle cx="10" cy="36" r="2.2" fill="%230f172a" stroke="%2364748b" stroke-width="0.5"/>' +
    '<circle cx="70" cy="36" r="2.2" fill="%230f172a" stroke="%2364748b" stroke-width="0.5"/>' +
    // Outer stator body ring
    '<circle cx="40" cy="36" r="30" fill="%231e293b" stroke="%23475569" stroke-width="1.2"/>' +
    // 12 Stator copper coils (visible around stator teeth)
    Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      const cx = (40 + 22 * Math.cos(angle)).toFixed(1);
      const cy = (36 + 22 * Math.sin(angle)).toFixed(1);
      return `<circle cx="${cx}" cy="${cy}" r="3.8" fill="url(%23bldc_coil)" stroke="%2378350f" stroke-width="0.4"/>`;
    }).join('') +
    // Red anodized CNC rotor bell
    '<circle cx="40" cy="36" r="19" fill="url(%23bldc_bell)" stroke="%23991b1b" stroke-width="0.8"/>' +
    // Rotor airflow cutouts (4 radial teardrop vents)
    Array.from({ length: 4 }, (_, i) => {
      const angle = (i * 90 * Math.PI) / 180;
      const x1 = (40 + 8 * Math.cos(angle - 0.3)).toFixed(1);
      const y1 = (36 + 8 * Math.sin(angle - 0.3)).toFixed(1);
      const x2 = (40 + 15 * Math.cos(angle)).toFixed(1);
      const y2 = (36 + 15 * Math.sin(angle)).toFixed(1);
      const x3 = (40 + 8 * Math.cos(angle + 0.3)).toFixed(1);
      const y3 = (36 + 8 * Math.sin(angle + 0.3)).toFixed(1);
      return `<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="%230f172a" opacity="0.65"/>`;
    }).join('') +
    // Stainless steel central shaft & circlip
    '<circle cx="40" cy="36" r="5" fill="url(%23bldc_hub)" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="40" cy="36" r="2.2" fill="%230f172a"/>' +
    '<text x="40" y="60" font-size="3.5" fill="%23f8fafc" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="0.5">2204 2300KV</text>' +
    // 3 silicone phase lead wires exiting at bottom: Phase A (15, 80), Phase B (40, 80), Phase C (65, 80)
    '<path d="M 32 64 Q 22 70 15 80" fill="none" stroke="%232563eb" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="15" cy="80" r="2" fill="%23facc15" stroke="%23a16207" stroke-width="0.4"/>' +
    '<text x="15" y="74" font-size="2.8" fill="%2360a5fa" font-family="Arial" font-weight="bold" text-anchor="middle">A</text>' +
    '<path d="M 40 66 L 40 80" stroke="%23eab308" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="40" cy="80" r="2" fill="%23facc15" stroke="%23a16207" stroke-width="0.4"/>' +
    '<text x="40" y="74" font-size="2.8" fill="%23fde047" font-family="Arial" font-weight="bold" text-anchor="middle">B</text>' +
    '<path d="M 48 64 Q 58 70 65 80" fill="none" stroke="%231e293b" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="65" cy="80" r="2" fill="%23facc15" stroke="%23a16207" stroke-width="0.4"/>' +
    '<text x="65" y="74" font-size="2.8" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">C</text>'
  ),

  // ── Instruments / Meters ──
  AMMETER: svg('0 0 90 70',
    '<defs>' +
      '<linearGradient id="amm_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230284c7"/><stop offset="50%25" stop-color="%230369a1"/><stop offset="100%25" stop-color="%23075985"/></linearGradient>' +
      '<linearGradient id="amm_lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%230f172a"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="86" height="66" rx="7" fill="url(%23amm_case)" stroke="%230c4a6e" stroke-width="1.2"/>' +
    '<rect x="6" y="5" width="78" height="60" rx="5" fill="%231e293b" stroke="%230f172a" stroke-width="0.8"/>' +
    '<text x="12" y="11" font-size="4" fill="%2338bdf8" font-family="Arial" font-weight="900">VOLTFORGE</text>' +
    '<text x="78" y="11" font-size="3.2" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="end">DIGITAL AMMETER</text>' +
    '<rect x="10" y="13" width="70" height="23" rx="2" fill="url(%23amm_lcd)" stroke="%230369a1" stroke-width="0.8"/>' +
    '<text x="14" y="20" font-size="2.8" fill="%2338bdf8" font-family="Arial" font-weight="bold">DC CURRENT</text>' +
    '<text x="56" y="31" font-size="12" fill="%23facc15" font-family="Courier New, monospace" font-weight="900" text-anchor="end"> 0.000</text>' +
    '<text x="68" y="31" font-size="9" fill="%23facc15" font-family="Arial" font-weight="900">A</text>' +
    '<circle cx="20" cy="44" r="2" fill="%2322c55e"/><text x="25" y="45.5" font-size="2.8" fill="%23cbd5e1" font-family="Arial">10A MAX</text>' +
    '<circle cx="54" cy="44" r="2" fill="%2338bdf8"/><text x="59" y="45.5" font-size="2.8" fill="%23cbd5e1" font-family="Arial">FUSED</text>' +
    '<rect x="18" y="53" width="12" height="16" rx="1.5" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="24" cy="61" r="4" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="24" cy="70" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="24" cy="70" r="1.3" fill="%230f172a"/>' +
    '<text x="24" y="51" font-size="3.5" fill="%23fca5a5" font-family="Arial" font-weight="900" text-anchor="middle">IN (+)</text>' +
    '<rect x="60" y="53" width="12" height="16" rx="1.5" fill="%230f172a" stroke="%231e293b" stroke-width="0.6"/>' +
    '<circle cx="66" cy="61" r="4" fill="%23334155" stroke="%231e293b" stroke-width="0.5"/>' +
    '<circle cx="66" cy="70" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="66" cy="70" r="1.3" fill="%230f172a"/>' +
    '<text x="66" y="51" font-size="3.5" fill="%23cbd5e1" font-family="Arial" font-weight="900" text-anchor="middle">OUT (\u2212)</text>'
  ),
  BATTERY_9V: svg('0 0 70 80',
    '<defs>' +
      '<linearGradient id="b9_gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23d97706"/><stop offset="35%25" stop-color="%23fde68a"/><stop offset="70%25" stop-color="%23f59e0b"/><stop offset="100%25" stop-color="%23b45309"/></linearGradient>' +
      '<linearGradient id="b9_body" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%231e293b"/><stop offset="40%25" stop-color="%23334155"/><stop offset="85%25" stop-color="%230f172a"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
      '<linearGradient id="b9_metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    // Battery metal body
    '<rect x="14" y="4" width="42" height="54" rx="4" fill="url(%23b9_body)" stroke="%23334155" stroke-width="0.8"/>' +
    '<rect x="14" y="4" width="42" height="15" rx="3" fill="url(%23b9_gold)"/>' +
    '<line x1="14" y1="19" x2="56" y2="19" stroke="%2378350f" stroke-width="0.75"/>' +
    '<text x="35" y="14" font-size="7.5" fill="%23451a03" font-family="Arial" font-weight="900" text-anchor="middle" letter-spacing="1">9V</text>' +
    '<text x="35" y="30" font-size="4.5" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.5">VOLTFORGE</text>' +
    '<text x="35" y="38" font-size="3.5" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ALKALINE 6LR61</text>' +
    '<text x="24" y="52" font-size="6" fill="%23ef4444" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<text x="46" y="52" font-size="6" fill="%2338bdf8" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    // Top terminal snaps: female octagonal at (24, 3), male circular at (46, 3)
    '<polygon points="21,1 27,1 29,3 29,5 27,7 21,7 19,5 19,3" fill="url(%23b9_metal)" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="24" cy="4" r="1.8" fill="%230f172a"/>' +
    '<circle cx="46" cy="4" r="3.2" fill="url(%23b9_metal)" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="46" cy="4" r="1.5" fill="%2364748b"/>' +
    // Snap clip with red & black insulated wires down to (15, 60) and (45, 60)
    '<path d="M 24 4 Q 8 26 15 58" fill="none" stroke="%23dc2626" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 24 4 Q 8 26 15 58" fill="none" stroke="%23f87171" stroke-width="0.75" stroke-linecap="round" opacity="0.6"/>' +
    '<path d="M 46 4 Q 62 26 45 58" fill="none" stroke="%230f172a" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 46 4 Q 62 26 45 58" fill="none" stroke="%23475569" stroke-width="0.75" stroke-linecap="round" opacity="0.6"/>' +
    // Terminal pins at (15, 60) and (45, 60)
    '<circle cx="15" cy="60" r="2.8" fill="%23dc2626" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="1.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="15" cy="60" r="0.7" fill="%230f172a"/>' +
    '<circle cx="45" cy="60" r="2.8" fill="%231e293b" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="1.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="45" cy="60" r="0.7" fill="%230f172a"/>'
  ),
  BATTERY_AA: svg('0 0 50 80',
    '<defs>' +
      '<linearGradient id="aa_gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23d97706"/><stop offset="35%25" stop-color="%23fde68a"/><stop offset="70%25" stop-color="%23f59e0b"/><stop offset="100%25" stop-color="%23b45309"/></linearGradient>' +
      '<linearGradient id="aa_body" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%230f172a"/><stop offset="40%25" stop-color="%231e293b"/><stop offset="85%25" stop-color="%23090d16"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
    '</defs>' +
    // Plastic battery holder bracket
    '<rect x="7" y="3" width="36" height="56" rx="4" fill="%2318181b" stroke="%2327272a" stroke-width="0.8"/>' +
    // Cylindrical cell
    '<rect x="10" y="7" width="30" height="48" rx="3" fill="url(%23aa_body)" stroke="%23334155" stroke-width="0.6"/>' +
    '<rect x="10" y="7" width="30" height="14" rx="2" fill="url(%23aa_gold)"/>' +
    '<rect x="21" y="4" width="8" height="3.5" rx="1" fill="%23e2e8f0" stroke="%2364748b" stroke-width="0.5"/>' +
    '<text x="25" y="16" font-size="5" fill="%23451a03" font-family="Arial" font-weight="900" text-anchor="middle">AA</text>' +
    '<text x="25" y="30" font-size="4" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">1.5V</text>' +
    '<text x="25" y="38" font-size="3" fill="%2394a3b8" font-family="Arial" text-anchor="middle">ALKALINE</text>' +
    '<text x="25" y="47" font-size="4" fill="%23ef4444" font-family="Arial" font-weight="bold" text-anchor="middle">+</text>' +
    // Wires from holder down to terminals at (15, 60) and (45, 60)
    '<path d="M 12 56 Q 10 58 15 60" fill="none" stroke="%23dc2626" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M 38 56 Q 42 58 45 60" fill="none" stroke="%230f172a" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="15" cy="60" r="2.8" fill="%23dc2626" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="1.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="15" cy="60" r="0.7" fill="%230f172a"/>' +
    '<circle cx="45" cy="60" r="2.8" fill="%231e293b" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="1.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.4"/>' +
    '<circle cx="45" cy="60" r="0.7" fill="%230f172a"/>'
  ),
  DC_SOURCE_3V3: svg('0 0 80 60',
    '<defs>' +
      '<linearGradient id="dc33_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23134e4a"/><stop offset="50%25" stop-color="%230f766e"/><stop offset="100%25" stop-color="%23115e59"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="76" height="56" rx="4" fill="url(%23dc33_case)" stroke="%232dd4bf" stroke-width="1"/>' +
    '<rect x="4" y="4" width="72" height="52" rx="3" fill="none" stroke="%23042f2e" stroke-width="0.75" opacity="0.6"/>' +
    // LED display bezel
    '<rect x="12" y="8" width="56" height="24" rx="2" fill="%23042f2e" stroke="%23115e59" stroke-width="0.8"/>' +
    '<rect x="14" y="10" width="52" height="20" rx="1.5" fill="%23021917"/>' +
    '<text x="40" y="24" font-size="12" fill="%232dd4bf" font-family="Courier New, monospace" font-weight="900" text-anchor="middle" letter-spacing="1">3.30V</text>' +
    '<text x="40" y="38" font-size="4" fill="%23ccfbf1" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.5">REGULATED DC SUPPLY</text>' +
    // Binding posts: Red (+) at (15, 60), Black (-) at (45, 60)
    '<rect x="11" y="44" width="8" height="15" rx="1" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="15" cy="52" r="3.5" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="15" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="15" y="42" font-size="5" fill="%23fca5a5" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<rect x="41" y="44" width="8" height="15" rx="1" fill="%231e293b" stroke="%230f172a" stroke-width="0.6"/>' +
    '<circle cx="45" cy="52" r="3.5" fill="%23334155" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="45" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="45" y="42" font-size="6" fill="%2394a3b8" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    // Power LED
    '<circle cx="68" cy="48" r="2" fill="%2322c55e" stroke="%2315803d" stroke-width="0.5"/>' +
    '<circle cx="68" cy="48" r="0.8" fill="%23bbf7d0"/>' +
    '<text x="68" y="43" font-size="3" fill="%2386efac" font-family="Arial" text-anchor="middle">ON</text>'
  ),
  DC_SOURCE_5V: svg('0 0 80 60',
    '<defs>' +
      '<linearGradient id="dc5_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23075985"/><stop offset="50%25" stop-color="%230284c7"/><stop offset="100%25" stop-color="%230369a1"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="76" height="56" rx="4" fill="url(%23dc5_case)" stroke="%2338bdf8" stroke-width="1"/>' +
    '<rect x="4" y="4" width="72" height="52" rx="3" fill="none" stroke="%23082f49" stroke-width="0.75" opacity="0.6"/>' +
    '<rect x="12" y="8" width="56" height="24" rx="2" fill="%23082f49" stroke="%230369a1" stroke-width="0.8"/>' +
    '<rect x="14" y="10" width="52" height="20" rx="1.5" fill="%23031a29"/>' +
    '<text x="40" y="24" font-size="12" fill="%2338bdf8" font-family="Courier New, monospace" font-weight="900" text-anchor="middle" letter-spacing="1">5.00V</text>' +
    '<text x="40" y="38" font-size="4" fill="%23e0f2fe" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.5">REGULATED DC SUPPLY</text>' +
    '<rect x="11" y="44" width="8" height="15" rx="1" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="15" cy="52" r="3.5" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="15" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="15" y="42" font-size="5" fill="%23fca5a5" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<rect x="41" y="44" width="8" height="15" rx="1" fill="%231e293b" stroke="%230f172a" stroke-width="0.6"/>' +
    '<circle cx="45" cy="52" r="3.5" fill="%23334155" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="45" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="45" y="42" font-size="6" fill="%2394a3b8" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<circle cx="68" cy="48" r="2" fill="%2338bdf8" stroke="%230284c7" stroke-width="0.5"/>' +
    '<circle cx="68" cy="48" r="0.8" fill="%23e0f2fe"/>' +
    '<text x="68" y="43" font-size="3" fill="%237dd3fc" font-family="Arial" text-anchor="middle">ON</text>'
  ),
  DC_SOURCE_12V: svg('0 0 80 60',
    '<defs>' +
      '<linearGradient id="dc12_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%239a3412"/><stop offset="50%25" stop-color="%23ea580c"/><stop offset="100%25" stop-color="%23c2410c"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="76" height="56" rx="4" fill="url(%23dc12_case)" stroke="%23fb923c" stroke-width="1"/>' +
    '<rect x="4" y="4" width="72" height="52" rx="3" fill="none" stroke="%23431407" stroke-width="0.75" opacity="0.6"/>' +
    '<rect x="12" y="8" width="56" height="24" rx="2" fill="%23431407" stroke="%239a3412" stroke-width="0.8"/>' +
    '<rect x="14" y="10" width="52" height="20" rx="1.5" fill="%231a0803"/>' +
    '<text x="40" y="24" font-size="12" fill="%23fb923c" font-family="Courier New, monospace" font-weight="900" text-anchor="middle" letter-spacing="1">12.0V</text>' +
    '<text x="40" y="38" font-size="4" fill="%23ffedd5" font-family="Arial" font-weight="bold" text-anchor="middle" letter-spacing="0.5">REGULATED DC SUPPLY</text>' +
    '<rect x="11" y="44" width="8" height="15" rx="1" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="15" cy="52" r="3.5" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="15" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="15" y="42" font-size="5" fill="%23fca5a5" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<rect x="41" y="44" width="8" height="15" rx="1" fill="%231e293b" stroke="%230f172a" stroke-width="0.6"/>' +
    '<circle cx="45" cy="52" r="3.5" fill="%23334155" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="45" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="45" y="42" font-size="6" fill="%2394a3b8" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    '<circle cx="68" cy="48" r="2" fill="%23ea580c" stroke="%23c2410c" stroke-width="0.5"/>' +
    '<circle cx="68" cy="48" r="0.8" fill="%23fed7aa"/>' +
    '<text x="68" y="43" font-size="3" fill="%23fdba74" font-family="Arial" text-anchor="middle">ON</text>'
  ),
  POWER_SUPPLY: svg('0 0 90 60',
    '<defs>' +
      '<linearGradient id="ps_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="86" height="56" rx="4" fill="url(%23ps_case)" stroke="%23475569" stroke-width="1"/>' +
    // Top display bezel
    '<rect x="8" y="6" width="46" height="28" rx="2" fill="%23020617" stroke="%231e293b" stroke-width="0.75"/>' +
    '<text x="12" y="18" font-size="8" fill="%2322c55e" font-family="Courier New, monospace" font-weight="900">05.00V</text>' +
    '<text x="12" y="30" font-size="8" fill="%2338bdf8" font-family="Courier New, monospace" font-weight="900">0.500A</text>' +
    '<circle cx="48" cy="14" r="1.2" fill="%2322c55e"/><text x="45" y="14.5" font-size="2.5" fill="%2386efac" font-family="Arial" text-anchor="end">CV</text>' +
    '<circle cx="48" cy="24" r="1.2" fill="%23ef4444"/><text x="45" y="24.5" font-size="2.5" fill="%23fca5a5" font-family="Arial" text-anchor="end">CC</text>' +
    // Rotary voltage/current knobs on right
    '<circle cx="70" cy="14" r="7" fill="%23475569" stroke="%2364748b" stroke-width="0.8"/>' +
    '<circle cx="70" cy="14" r="5" fill="%231e293b"/>' +
    '<line x1="70" y1="14" x2="70" y2="10" stroke="%2338bdf8" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="70" cy="30" r="7" fill="%23475569" stroke="%2364748b" stroke-width="0.8"/>' +
    '<circle cx="70" cy="30" r="5" fill="%231e293b"/>' +
    '<line x1="70" y1="30" x2="70" y2="26" stroke="%2322c55e" stroke-width="1.5" stroke-linecap="round"/>' +
    '<text x="70" y="5" font-size="3" fill="%2394a3b8" font-family="Arial" text-anchor="middle">VOLT / CURR</text>' +
    // Binding posts at (15, 60) and (45, 60)
    '<rect x="11" y="42" width="8" height="17" rx="1" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="15" cy="50" r="3.5" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="15" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="15" y="40" font-size="5" fill="%23fca5a5" font-family="Arial" font-weight="900" text-anchor="middle">+</text>' +
    '<rect x="41" y="42" width="8" height="17" rx="1" fill="%231e293b" stroke="%230f172a" stroke-width="0.6"/>' +
    '<circle cx="45" cy="50" r="3.5" fill="%23334155" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="45" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="45" y="40" font-size="6" fill="%2394a3b8" font-family="Arial" font-weight="900" text-anchor="middle">−</text>' +
    // Ground post
    '<rect x="26" y="42" width="8" height="15" rx="1" fill="%2315803d" stroke="%2314532d" stroke-width="0.6"/>' +
    '<circle cx="30" cy="50" r="3.5" fill="%2322c55e" stroke="%2314532d" stroke-width="0.5"/>' +
    '<circle cx="30" cy="54" r="1.5" fill="%23f1f5f9"/>' +
    '<text x="30" y="40" font-size="3" fill="%2386efac" font-family="Arial" text-anchor="middle">GND</text>'
  ),
  AC_FUNCTION_GENERATOR: svg('0 0 100 60',
    '<defs>' +
      '<linearGradient id="gen_case" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23312e81"/><stop offset="50%25" stop-color="%231e1b4b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
    '</defs>' +
    '<rect x="2" y="2" width="96" height="56" rx="4" fill="url(%23gen_case)" stroke="%236366f1" stroke-width="1"/>' +
    // TFT Display
    '<rect x="8" y="6" width="56" height="30" rx="2" fill="%23090d16" stroke="%23312e81" stroke-width="0.8"/>' +
    '<path d="M 12 21 Q 19 12 26 21 T 40 21 T 54 21 T 60 21" fill="none" stroke="%23eab308" stroke-width="1.8"/>' +
    '<text x="12" y="32" font-size="4.5" fill="%2338bdf8" font-family="Courier New, monospace" font-weight="bold">1.000kHz 5.0Vpp</text>' +
    // Buttons on right
    ['SIN', 'SQR', 'TRI'].map((w, i) =>
      `<rect x="68" y="${8 + i * 9}" width="24" height="7" rx="1.5" fill="%231e293b" stroke="%23475569" stroke-width="0.5"/>` +
      `<text x="80" y="${13 + i * 9}" font-size="3.5" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">${w}</text>`
    ).join('') +
    // Output terminals at (15, 60) and (45, 60)
    '<rect x="11" y="44" width="8" height="15" rx="1" fill="%23ef4444" stroke="%23b91c1c" stroke-width="0.6"/>' +
    '<circle cx="15" cy="52" r="3.5" fill="%23f87171" stroke="%23b91c1c" stroke-width="0.5"/>' +
    '<circle cx="15" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="15" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="15" y="42" font-size="4" fill="%23fca5a5" font-family="Arial" font-weight="bold" text-anchor="middle">OUT+</text>' +
    '<rect x="41" y="44" width="8" height="15" rx="1" fill="%231e293b" stroke="%230f172a" stroke-width="0.6"/>' +
    '<circle cx="45" cy="52" r="3.5" fill="%23334155" stroke="%230f172a" stroke-width="0.5"/>' +
    '<circle cx="45" cy="60" r="2.5" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="45" cy="60" r="1.1" fill="%230f172a"/>' +
    '<text x="45" y="42" font-size="4" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>' +
    // BNC connector visual
    '<circle cx="78" cy="48" r="6" fill="%2394a3b8" stroke="%23475569" stroke-width="0.8"/>' +
    '<circle cx="78" cy="48" r="3.5" fill="%23cbd5e1"/><circle cx="78" cy="48" r="1.2" fill="%230f172a"/>'
  ),
  GROUND: svg('0 0 40 30',
    '<defs>' +
      '<linearGradient id="gnd_rod" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f8fafc"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    // Stem
    '<line x1="20" y1="2" x2="20" y2="12" stroke="url(%23gnd_rod)" stroke-width="2.5" stroke-linecap="round"/>' +
    // 3 graduated horizontal earth plates
    '<line x1="8" y1="12" x2="32" y2="12" stroke="%2394a3b8" stroke-width="2.5" stroke-linecap="round"/>' +
    '<line x1="12" y1="16.5" x2="28" y2="16.5" stroke="%2394a3b8" stroke-width="2.2" stroke-linecap="round"/>' +
    '<line x1="16" y1="21" x2="24" y2="21" stroke="%2394a3b8" stroke-width="1.8" stroke-linecap="round"/>' +
    // Terminal eyelet at (20, 24)
    '<line x1="20" y1="21" x2="20" y2="24" stroke="%2394a3b8" stroke-width="1.5"/>' +
    '<circle cx="20" cy="24" r="2.2" fill="%23e2e8f0" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="20" cy="24" r="1" fill="%230f172a"/>' +
    '<text x="34" y="20" font-size="5" fill="%2364748b" font-family="Arial" font-weight="bold">GND</text>'
  ),
  OSCILLOSCOPE: svg('0 0 100 80',
    '<defs>' +
      '<linearGradient id="scope_chassis" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23334155"/><stop offset="50%25" stop-color="%231e293b"/><stop offset="100%25" stop-color="%230f172a"/></linearGradient>' +
      '<linearGradient id="scope_screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23090d16"/><stop offset="100%25" stop-color="%23020617"/></linearGradient>' +
      '<linearGradient id="scope_bnc" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%23cbd5e1"/><stop offset="100%25" stop-color="%2394a3b8"/></linearGradient>' +
    '</defs>' +
    // Scope chassis
    '<rect width="100" height="80" rx="5" fill="url(%23scope_chassis)" stroke="%23475569" stroke-width="1.2"/>' +
    // Top digital logic analyzer probe header connector at y=10 (ch3 to ch8)
    '<rect x="12" y="6" width="86" height="8" rx="1.5" fill="%230f172a" stroke="%23334155" stroke-width="0.6"/>' +
    [20, 35, 50, 65, 80, 95].map((x, i) =>
      `<circle cx="${x}" cy="10" r="1.6" fill="%23f59e0b" stroke="%23b45309" stroke-width="0.4"/>` +
      `<circle cx="${x}" cy="10" r="0.8" fill="%230f172a"/>` +
      `<text x="${x}" y="5" font-size="2" fill="%2394a3b8" font-family="Arial" text-anchor="middle">D${i}</text>`
    ).join('') +
    // Color TFT Display (x=6, y=16, w=58, h=44)
    '<rect x="6" y="16" width="58" height="44" rx="2" fill="url(%23scope_screen)" stroke="%230f172a" stroke-width="0.8"/>' +
    // Graticule grid
    '<line x1="6" y1="27" x2="64" y2="27" stroke="%231e293b" stroke-width="0.4"/>' +
    '<line x1="6" y1="38" x2="64" y2="38" stroke="%23334155" stroke-width="0.6"/>' +
    '<line x1="6" y1="49" x2="64" y2="49" stroke="%231e293b" stroke-width="0.4"/>' +
    '<line x1="20" y1="16" x2="20" y2="60" stroke="%231e293b" stroke-width="0.4"/>' +
    '<line x1="35" y1="16" x2="35" y2="60" stroke="%23334155" stroke-width="0.6"/>' +
    '<line x1="50" y1="16" x2="50" y2="60" stroke="%231e293b" stroke-width="0.4"/>' +
    // Status bar at top of screen
    '<rect x="6" y="16" width="58" height="5.5" fill="%230f172a"/>' +
    '<text x="8" y="20" font-size="2.6" fill="%2322c55e" font-family="Arial" font-weight="bold">TD: 1.0ms</text>' +
    '<text x="35" y="20" font-size="2.6" fill="%2338bdf8" font-family="Arial" font-weight="bold" text-anchor="middle">500MSa/s</text>' +
    '<text x="62" y="20" font-size="2.6" fill="%2322c55e" font-family="Arial" font-weight="bold" text-anchor="end">RUN</text>' +
    // CH1 Waveform (yellow sine wave)
    '<path d="M 8 38 Q 15 24 22 38 T 36 38 T 50 38 T 62 38" fill="none" stroke="%23facc15" stroke-width="1.3"/>' +
    // CH2 Waveform (cyan pulse train)
    '<path d="M 8 46 L 14 46 L 14 52 L 24 52 L 24 46 L 34 46 L 34 52 L 44 52 L 44 46 L 54 46 L 54 52 L 62 52" fill="none" stroke="%2338bdf8" stroke-width="1.1"/>' +
    // Right control panel: Buttons & Knobs
    '<rect x="68" y="18" width="12" height="5.5" rx="1.5" fill="%2315803d" stroke="%2322c55e" stroke-width="0.5"/>' +
    '<text x="74" y="22" font-size="2.6" fill="%23ffffff" font-family="Arial" font-weight="bold" text-anchor="middle">RUN</text>' +
    '<rect x="83" y="18" width="13" height="5.5" rx="1.5" fill="%231e293b" stroke="%23475569" stroke-width="0.5"/>' +
    '<text x="89.5" y="22" font-size="2.6" fill="%2338bdf8" font-family="Arial" font-weight="bold" text-anchor="middle">AUTO</text>' +
    // CH1 knob
    '<circle cx="74" cy="32" r="5" fill="%23475569" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="74" cy="32" r="3.5" fill="%231e293b"/>' +
    '<line x1="74" y1="32" x2="74" y2="28" stroke="%23facc15" stroke-width="1.2" stroke-linecap="round"/>' +
    '<text x="74" y="40.5" font-size="2.4" fill="%23facc15" font-family="Arial" font-weight="bold" text-anchor="middle">CH1 V/D</text>' +
    // CH2 knob
    '<circle cx="89" cy="32" r="5" fill="%23475569" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="89" cy="32" r="3.5" fill="%231e293b"/>' +
    '<line x1="89" y1="32" x2="89" y2="28" stroke="%2338bdf8" stroke-width="1.2" stroke-linecap="round"/>' +
    '<text x="89" y="40.5" font-size="2.4" fill="%2338bdf8" font-family="Arial" font-weight="bold" text-anchor="middle">CH2 V/D</text>' +
    // TIME/DIV knob
    '<circle cx="81.5" cy="50" r="5" fill="%23475569" stroke="%2364748b" stroke-width="0.6"/>' +
    '<circle cx="81.5" cy="50" r="3.5" fill="%231e293b"/>' +
    '<line x1="81.5" y1="50" x2="81.5" y2="46" stroke="%23ffffff" stroke-width="1.2" stroke-linecap="round"/>' +
    '<text x="81.5" y="58.5" font-size="2.4" fill="%23cbd5e1" font-family="Arial" font-weight="bold" text-anchor="middle">TIME/DIV</text>' +
    // Bottom BNC input jacks: CH1 at (20, 80), CH2 at (50, 80), GND at (95, 80)
    '<circle cx="20" cy="71" r="5.5" fill="%23facc15" stroke="%23ca8a04" stroke-width="0.6"/>' +
    '<circle cx="20" cy="71" r="4" fill="url(%23scope_bnc)" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="20" cy="80" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="20" cy="80" r="1.2" fill="%230f172a"/>' +
    '<text x="20" y="63" font-size="3.2" fill="%23facc15" font-family="Arial" font-weight="bold" text-anchor="middle">CH1</text>' +
    '<circle cx="50" cy="71" r="5.5" fill="%2338bdf8" stroke="%230284c7" stroke-width="0.6"/>' +
    '<circle cx="50" cy="71" r="4" fill="url(%23scope_bnc)" stroke="%23475569" stroke-width="0.5"/>' +
    '<circle cx="50" cy="80" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="50" cy="80" r="1.2" fill="%230f172a"/>' +
    '<text x="50" y="63" font-size="3.2" fill="%2338bdf8" font-family="Arial" font-weight="bold" text-anchor="middle">CH2</text>' +
    '<circle cx="95" cy="71" r="4.5" fill="%231e293b" stroke="%23475569" stroke-width="0.6"/>' +
    '<circle cx="95" cy="80" r="2.8" fill="%23f1f5f9" stroke="%2364748b" stroke-width="0.5"/><circle cx="95" cy="80" r="1.2" fill="%230f172a"/>' +
    '<text x="95" y="63" font-size="3.2" fill="%2394a3b8" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>'
  ),
};

// Keep legacy/catalog aliases visually complete as well as electrically
// compatible. These entries deliberately share artwork where the physical
// package is equivalent.
Object.assign(componentSvgs, {
  LDR: componentSvgs.SENSOR_LDR,
  OLED_DISPLAY: componentSvgs.DISPLAY_OLED,
  SOIL_MOISTURE: svg('0 0 40 50',
    '<defs>' +
      '<linearGradient id="sm_gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%25" stop-color="%23fde047"/><stop offset="50%25" stop-color="%23eab308"/><stop offset="100%25" stop-color="%23ca8a04"/></linearGradient>' +
      '<linearGradient id="sm_pin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%25" stop-color="%23f1f5f9"/><stop offset="50%25" stop-color="%2394a3b8"/><stop offset="100%25" stop-color="%2364748b"/></linearGradient>' +
    '</defs>' +
    // Top electronic module head
    '<rect x="4" y="2" width="32" height="24" rx="2.5" fill="%2309090b" stroke="%2327272a" stroke-width="0.8"/>' +
    '<circle cx="8" cy="6" r="1.5" fill="%23000000" stroke="%2352525b" stroke-width="0.3"/>' +
    // LM393 IC and LEDs
    '<rect x="14" y="5" width="12" height="7" rx="0.5" fill="%2318181b" stroke="%233f3f46" stroke-width="0.4"/>' +
    '<text x="20" y="10" font-size="3" fill="%23a1a1aa" font-family="Arial" text-anchor="middle">LM393</text>' +
    '<circle cx="29" cy="7" r="1" fill="%23ef4444"/>' +
    '<circle cx="29" cy="11" r="1" fill="%2322c55e"/>' +
    // Blue trimmer
    '<rect x="8" y="14" width="8" height="8" rx="0.5" fill="%230284c7" stroke="%230369a1" stroke-width="0.4"/>' +
    '<circle cx="12" cy="18" r="2.2" fill="%23e2e8f0"/><line x1="10.5" y1="18" x2="13.5" y2="18" stroke="%230f172a" stroke-width="0.6"/>' +
    // Dual sensor probe prongs
    '<rect x="6" y="26" width="9" height="15" rx="1.5" fill="%2309090b" stroke="%2327272a" stroke-width="0.6"/>' +
    '<path d="M 8 28 L 8 38 L 13 38 L 13 28" fill="none" stroke="url(%23sm_gold)" stroke-width="1.2" stroke-linecap="round"/>' +
    '<rect x="25" y="26" width="9" height="15" rx="1.5" fill="%2309090b" stroke="%2327272a" stroke-width="0.6"/>' +
    '<path d="M 27 28 L 27 38 L 32 38 L 32 28" fill="none" stroke="url(%23sm_gold)" stroke-width="1.2" stroke-linecap="round"/>' +
    // Bottom 3-pin connector header: VCC (10, 50), GND (20, 50), SIG (30, 50)
    [10, 20, 30].map((x) =>
      `<rect x="${x - 1.5}" y="42" width="3" height="8" rx="0.5" fill="url(%23sm_pin)"/>` +
      `<circle cx="${x}" cy="49" r="1.5" fill="%23475569"/>`
    ).join('') +
    '<text x="10" y="25" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">VCC</text>' +
    '<text x="20" y="25" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">GND</text>' +
    '<text x="30" y="25" font-size="2.6" fill="%23f8fafc" font-family="Arial" font-weight="bold" text-anchor="middle">SIG</text>'
  ),
  '74HC595': componentSvgs.IC_74HC595,
  '74HC165': componentSvgs.IC_74HC165,
  '74HC138': componentSvgs.IC_74HC138,
  '74HC151': componentSvgs.IC_74HC151,
  'CD4017': componentSvgs.IC_CD4017,
  '74HC00': componentSvgs.IC_74HC00,
  '74HC04': componentSvgs.IC_74HC04,
  '74HC08': componentSvgs.IC_74HC08,
  '74HC32': componentSvgs.IC_74HC32,
  '74HC86': componentSvgs.IC_74HC86,
  '74HC14': componentSvgs.IC_74HC14,
  '74HC74': componentSvgs.IC_74HC74,
  '74HC02': componentSvgs.IC_74HC02,
  HC_SR04: componentSvgs.ULTRASONIC_SENSOR,
  DHT11: componentSvgs.TEMPERATURE_SENSOR,
  TM1637: componentSvgs.DISPLAY_7SEG_4DIGIT,
  MQ2: componentSvgs.GAS_SENSOR,
  AMS1117_3V3: componentSvgs.VOLTAGE_REGULATOR_AMS1117,
});

// Default dimensions for each component type (width x height)
// These MUST match the SVG viewBox and pin coordinates in pinRegistry.ts
export const componentDimensions: Record<string, { w: number; h: number }> = {
  ...boardComponentDimensions,

  // Boards (match SVG viewBox exactly)
  ARDUINO_UNO: { w: 200, h: 150 },
  ARDUINO_MEGA: { w: 280, h: 120 },
  ARDUINO_NANO: { w: 100, h: 160 },
  ESP32: { w: 100, h: 160 },
  ESP32_S3: { w: 100, h: 160 },
  ESP8266: { w: 95, h: 150 },
  RASPBERRY_PI_PICO: { w: 100, h: 180 },
  STM32_BLUE_PILL: { w: 110, h: 170 },

  // Passives (match SVG viewBox)
  RESISTOR: { w: 90, h: 24 },
  CAPACITOR: { w: 44, h: 60 },
  VARIABLE_CAPACITOR: { w: 44, h: 60 },
  CERAMIC_CAPACITOR: { w: 44, h: 60 },
  ELECTROLYTIC_CAPACITOR: { w: 46, h: 70 },
  DIODE: { w: 72, h: 28 },
  INDUCTOR: { w: 90, h: 24 },
  TRANSFORMER: { w: 100, h: 70 },
  ZENER_DIODE: { w: 72, h: 28 },
  SCHOTTKY_DIODE: { w: 72, h: 28 },
  NPN_TRANSISTOR: { w: 56, h: 70 },
  PNP_TRANSISTOR: { w: 56, h: 70 },
  NMOS: { w: 56, h: 70 },
  PMOS: { w: 56, h: 70 },
  OPAMP_IDEAL: { w: 70, h: 70 },
  OPAMP_LM358: { w: 70, h: 70 },
  BRIDGE_RECTIFIER: { w: 70, h: 60 },
  THERMISTOR: { w: 90, h: 24 },
  THERMISTOR_NTC: { w: 90, h: 24 },
  POTENTIOMETER: { w: 50, h: 50 },
  MULTIMETER: { w: 90, h: 70 },
  IC_555_TIMER: { w: 90, h: 50 },
  IC_74HC595: { w: 120, h: 50 },
  IC_74HC165: { w: 120, h: 50 },
  IC_74HC138: { w: 120, h: 50 },
  IC_74HC151: { w: 120, h: 50 },
  IC_CD4017: { w: 120, h: 50 },
  '74HC595': { w: 120, h: 50 },
  '74HC165': { w: 120, h: 50 },
  '74HC138': { w: 120, h: 50 },
  '74HC151': { w: 120, h: 50 },
  'CD4017': { w: 120, h: 50 },

  // LEDs (match SVG viewBox)
  LED_STANDARD: { w: 40, h: 80 },
  LED_RGB: { w: 50, h: 80 },
  BATTERY_9V: { w: 70, h: 80 },
  BATTERY_AA: { w: 50, h: 80 },
  DC_SOURCE_3V3: { w: 80, h: 60 },
  DC_SOURCE_5V: { w: 80, h: 60 },
  DC_SOURCE_12V: { w: 80, h: 60 },
  POWER_SUPPLY: { w: 90, h: 60 },
  AC_FUNCTION_GENERATOR: { w: 100, h: 60 },
  GROUND: { w: 40, h: 30 },

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
  RELAY_SPDT: { w: 70, h: 50 },
  RELAY_SINGLE: { w: 70, h: 50 },
  RELAY_2CH: { w: 90, h: 50 },
  RELAY_4CH: { w: 120, h: 50 },

  // Sensors (match SVG viewBox)
  PIR_SENSOR: { w: 60, h: 70 },
  SENSOR_PIR: { w: 60, h: 70 },
  LDR: { w: 40, h: 40 },
  SENSOR_LDR: { w: 40, h: 40 },
  SOIL_MOISTURE: { w: 40, h: 50 },

  // Displays (match SVG viewBox)
  LCD_16X2: { w: 170, h: 60 },
  DISPLAY_LCD_I2C: { w: 120, h: 60 },
  OLED_DISPLAY: { w: 80, h: 60 },
  DISPLAY_OLED: { w: 80, h: 60 },
  DISPLAY_7SEG: { w: 50, h: 70 },

  // Drone / ESC
  ESC_MODULE: { w: 120, h: 60 },
  MOTOR_BLDC: { w: 80, h: 80 },

  // Instruments
  AMMETER: { w: 90, h: 70 },
  OSCILLOSCOPE: { w: 100, h: 80 },

  // Other
  BREADBOARD: { w: 220, h: 120 },
  VOLTAGE_REGULATOR_7805: { w: 64, h: 72 },
  SWITCH_SPST: { w: 60, h: 30 },

  // Child variant dimensions
  LED_RED: { w: 40, h: 80 },
  LED_GREEN: { w: 40, h: 80 },
  LED_BLUE: { w: 40, h: 80 },
  LED_YELLOW: { w: 40, h: 80 },
  LED_WHITE: { w: 40, h: 80 },
  LED_ORANGE: { w: 40, h: 80 },
  LED_PURPLE: { w: 40, h: 80 },

  IC_74HC00: { w: 110, h: 50 },
  IC_74HC04: { w: 110, h: 50 },
  IC_74HC08: { w: 110, h: 50 },
  IC_74HC32: { w: 110, h: 50 },
  IC_74HC86: { w: 110, h: 50 },
  IC_74HC14: { w: 110, h: 50 },
  IC_74HC74: { w: 110, h: 50 },
  IC_74HC02: { w: 110, h: 50 },
  '74HC00': { w: 110, h: 50 },
  '74HC04': { w: 110, h: 50 },
  '74HC08': { w: 110, h: 50 },
  '74HC32': { w: 110, h: 50 },
  '74HC86': { w: 110, h: 50 },
  '74HC14': { w: 110, h: 50 },
  '74HC74': { w: 110, h: 50 },
  '74HC02': { w: 110, h: 50 },

  SWITCH_SPDT: { w: 60, h: 30 },
  TOGGLE_SWITCH: { w: 60, h: 40 },
  DIP_SWITCH_4: { w: 70, h: 40 },

  VOLTMETER: { w: 90, h: 70 },
  LOGIC_ANALYZER: { w: 100, h: 60 },

  BATTERY_18650: { w: 70, h: 80 },
  BATTERY_CR2032: { w: 50, h: 60 },
  BATTERY_LIPO: { w: 70, h: 70 },
  BATTERY_AAA: { w: 50, h: 80 },
  VOLTAGE_REGULATOR_AMS1117: { w: 60, h: 50 },
  AMS1117_3V3: { w: 60, h: 50 },

  ULTRASONIC_SENSOR: { w: 80, h: 60 },
  HC_SR04: { w: 80, h: 60 },
  TEMPERATURE_SENSOR: { w: 50, h: 60 },
  DHT11: { w: 50, h: 60 },
  TMP36: { w: 56, h: 70 },
  GAS_SENSOR: { w: 60, h: 60 },
  MQ2: { w: 60, h: 60 },

  VIBRATION_MOTOR: { w: 50, h: 50 },
  GEAR_MOTOR: { w: 80, h: 60 },
  SOLENOID: { w: 70, h: 50 },

  DISPLAY_7SEG_4DIGIT: { w: 100, h: 50 },
  TM1637: { w: 100, h: 50 },
  LED_BAR_GRAPH: { w: 60, h: 60 },
  DISPLAY_MAX7219_MATRIX: { w: 80, h: 80 },

  TRIMPOT: { w: 50, h: 50 },
  PHOTO_DIODE: { w: 40, h: 70 },
  RELAY_8CH: { w: 160, h: 60 },
  RELAY_SSR: { w: 70, h: 70 },
};
