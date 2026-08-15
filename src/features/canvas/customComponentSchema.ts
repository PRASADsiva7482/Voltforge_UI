/**
 * Custom Component Plugin Schema & Footprint Generator for Voltforge EDA.
 * Enables dynamic loading and parametric rendering of custom ICs, sensors, and breakouts.
 */

export interface CustomPinDefinition {
  id: string;
  name: string;
  type: 'digital' | 'analog' | 'power' | 'ground' | 'i2c' | 'spi' | 'uart' | 'pwm';
  side: 'left' | 'right' | 'top' | 'bottom';
  offsetIndex?: number;
  description?: string;
  voltageMax?: number;
}

export interface CustomComponentSchema {
  id: string;
  name: string;
  category: 'Microcontroller' | 'Sensor' | 'Integrated Circuit' | 'Power' | 'Passive' | 'Actuator' | 'Display' | 'Interface';
  packageType: 'DIP' | 'SOIC' | 'QFP' | 'MODULE' | 'THT';
  pinCount: number;
  width?: number;
  height?: number;
  pins: CustomPinDefinition[];
  defaultProperties?: Record<string, any>;
  datasheetUrl?: string;
  customSvg?: string;
}

export function validateComponentSchema(def: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!def || typeof def !== 'object') {
    return { valid: false, errors: ['Definition must be a JSON object'] };
  }
  if (!def.id || typeof def.id !== 'string') errors.push('Missing or invalid "id"');
  if (!def.name || typeof def.name !== 'string') errors.push('Missing or invalid "name"');
  if (!def.category) errors.push('Missing "category"');
  if (!Array.isArray(def.pins) || def.pins.length === 0) {
    errors.push('"pins" must be a non-empty array of pin definitions');
  } else {
    def.pins.forEach((pin: any, idx: number) => {
      if (!pin.id || !pin.name) errors.push(`Pin at index ${idx} must have "id" and "name"`);
      if (!['left', 'right', 'top', 'bottom'].includes(pin.side)) {
        errors.push(`Pin "${pin.id || idx}" has invalid side (must be left, right, top, or bottom)`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Generates dynamic parametric SVG for standard DIP/SOIC/Module packages.
 */
export function generateParametricFootprintSvg(schema: CustomComponentSchema): string {
  if (schema.customSvg) return schema.customSvg;

  const pins = schema.pins || [];
  const leftPins = pins.filter((p) => p.side === 'left');
  const rightPins = pins.filter((p) => p.side === 'right');
  const maxPinsSide = Math.max(leftPins.length, rightPins.length, 4);

  const width = schema.width || 120;
  const height = schema.height || Math.max(80, maxPinsSide * 20 + 30);
  const chipWidth = width - 30;
  const chipHeight = height - 10;
  const chipX = 15;
  const chipY = 5;

  let pinsSvg = '';

  // Left Pins
  leftPins.forEach((pin, i) => {
    const py = chipY + 20 + i * ((chipHeight - 35) / Math.max(1, leftPins.length - 1 || 1));
    pinsSvg += `
      <rect x="2" y="${py - 4}" width="14" height="8" rx="1.5" fill="#94a3b8" stroke="#475569" stroke-width="1"/>
      <circle cx="5" cy="${py}" radius="2.5" fill="#e2e8f0"/>
      <text x="22" y="${py + 3.5}" font-family="system-ui, sans-serif" font-size="8" font-weight="600" fill="#cbd5e1">${pin.name}</text>
    `;
  });

  // Right Pins
  rightPins.forEach((pin, i) => {
    const py = chipY + 20 + i * ((chipHeight - 35) / Math.max(1, rightPins.length - 1 || 1));
    pinsSvg += `
      <rect x="${chipX + chipWidth - 1}" y="${py - 4}" width="14" height="8" rx="1.5" fill="#94a3b8" stroke="#475569" stroke-width="1"/>
      <circle cx="${width - 5}" cy="${py}" radius="2.5" fill="#e2e8f0"/>
      <text x="${chipX + chipWidth - 6}" y="${py + 3.5}" text-anchor="end" font-family="system-ui, sans-serif" font-size="8" font-weight="600" fill="#cbd5e1">${pin.name}</text>
    `;
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <defs>
        <linearGradient id="icGrad_${schema.id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <!-- IC Body -->
      <rect x="${chipX}" y="${chipY}" width="${chipWidth}" height="${chipHeight}" rx="4" fill="url(#icGrad_${schema.id})" stroke="#334155" stroke-width="1.5"/>
      <!-- Notch / Pin 1 indicator -->
      <path d="M ${chipX + chipWidth / 2 - 8} ${chipY} A 8 8 0 0 0 ${chipX + chipWidth / 2 + 8} ${chipY}" fill="none" stroke="#475569" stroke-width="1.5"/>
      <circle cx="${chipX + 8}" cy="${chipY + 8}" r="2" fill="#64748b"/>
      <!-- Label -->
      <text x="${chipX + chipWidth / 2}" y="${chipY + chipHeight / 2 - 2}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#f8fafc" letter-spacing="0.5">${schema.name}</text>
      <text x="${chipX + chipWidth / 2}" y="${chipY + chipHeight / 2 + 10}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="7" font-weight="500" fill="#64748b">${schema.packageType || 'IC'}</text>
      <!-- Pins -->
      ${pinsSvg}
    </svg>
  `.trim();
}
