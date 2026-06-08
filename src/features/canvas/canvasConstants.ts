// ═══════════════════════════════════════════════════════════════════════════
// Canvas Constants — shared across all canvas sub-components
// ═══════════════════════════════════════════════════════════════════════════

// ── Grid ──────────────────────────────────────────────────────────────────
export const MAT_GRID_MINOR = 20;
export const MAT_GRID_MAJOR = 100;

// ── Zoom limits ───────────────────────────────────────────────────────────
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 1.08;

// ── Snap ──────────────────────────────────────────────────────────────────
export const DRAG_SNAP_THRESHOLD = 8;
export const MIN_NODE_SIZE = 20;

// ── Pin colors ────────────────────────────────────────────────────────────
export const PIN_COLOR_POWER = '#ef4444';
export const PIN_COLOR_GROUND = '#555555';
export const PIN_COLOR_DEFAULT = '#cbd5e1';

export const PIN_GLOW_POWER = '#ef4444';
export const PIN_GLOW_GROUND = '#64748b';
export const PIN_GLOW_DEFAULT = '#60a5fa';

// ── Pin hit areas ─────────────────────────────────────────────────────────
export const PIN_HIT_STROKE_WIDTH = 36;
export const PIN_RADIUS_DEFAULT = 6;
export const PIN_RADIUS_HOVERED = 8;
export const PIN_SNAP_RADIUS_DEFAULT = 14;
export const PIN_SNAP_RADIUS_HOVERED = 18;

// ── Bend point ────────────────────────────────────────────────────────────
export const BEND_POINT_RADIUS_DEFAULT = 5;
export const BEND_POINT_RADIUS_HOVERED = 7;
export const BEND_POINT_FILL_DEFAULT = '#ffffff';
export const BEND_POINT_FILL_HOVERED = '#ef4444';
export const BEND_POINT_STROKE = '#22c55e';

// ── Wire rendering ────────────────────────────────────────────────────────
export const WIRE_HIT_STROKE_WIDTH = 18;
export const WIRE_OUTLINE_DARK = '#06060f';
export const WIRE_OUTLINE_LIGHT = '#ffffff';
export const WIRE_SELECTED_WIDTH = 3;
export const WIRE_DEFAULT_WIDTH = 2.5;
export const WIRE_OUTLINE_SELECTED_WIDTH = 7;
export const WIRE_OUTLINE_DEFAULT_WIDTH = 5.5;

// ── Active component glow ─────────────────────────────────────────────────
export const ACTIVE_GLOW_COLOR = '#22c55e';
export const ACTIVE_GLOW_PADDING = 4;
export const ACTIVE_GLOW_SHADOW_BLUR = 16;

// ── Canvas background ─────────────────────────────────────────────────────
export const CANVAS_BG_DARK = '#06060f';
export const CANVAS_BG_LIGHT = '#f8fafc';

// ── Origin axis color ─────────────────────────────────────────────────────
export const ORIGIN_AXIS_COLOR = 'rgba(34,197,94,0.24)';

// ── Wiring preview ────────────────────────────────────────────────────────
export const WIRING_PREVIEW_COLOR = '#22c55e';
export const WIRING_SOURCE_HIGHLIGHT = '#60a5fa';

// ── LED color map (inferred from component name) ──────────────────────────
export const LED_COLOR_MAP: Record<string, string> = {
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
  white: '#f8fafc',
  orange: '#f97316',
  rgb: '#a855f7',
  neopixel: '#a855f7',
};
export const LED_COLOR_DEFAULT = '#ef4444';

// ── Display screen dimensions ─────────────────────────────────────────────
export interface ScreenDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const LCD_I2C_SCREEN: ScreenDimensions = { x: 6, y: 6, width: 108, height: 36 };
export const LCD_16X2_SCREEN: ScreenDimensions = { x: 12, y: 10, width: 146, height: 34 };
export const OLED_SCREEN: ScreenDimensions = { x: 6, y: 6, width: 68, height: 38 };

// ── LCD colors ────────────────────────────────────────────────────────────
export const LCD_BACKLIGHT_ON = '#64d475';
export const LCD_BACKLIGHT_OFF = '#2a4d2e';
export const LCD_TEXT_BACKLIGHT_ON = '#004d00';
export const LCD_TEXT_BACKLIGHT_OFF = '#1a331a';
export const OLED_BG = '#000000';
export const OLED_TEXT_COLOR = '#0ea5e9';

// ── Motor / Servo / ESC ───────────────────────────────────────────────────
export const MOTOR_BELL_CENTER_Y = 36;
export const MOTOR_PROPELLER_HUB_RADIUS = 4;
export const MOTOR_SPIN_GLOW_RADIUS = 24;

// ── ESC throttle colors ──────────────────────────────────────────────────
export const ESC_THROTTLE_HIGH = '#ef4444';
export const ESC_THROTTLE_MID = '#f59e0b';
export const ESC_THROTTLE_LOW = '#22c55e';
export const ESC_THROTTLE_HIGH_THRESHOLD = 80;
export const ESC_THROTTLE_MID_THRESHOLD = 50;

// ── PCB trace colors ─────────────────────────────────────────────────────
export const PCB_TRACE_TOP = '#f97316';
export const PCB_TRACE_BOTTOM = '#38bdf8';

// ── Collaborator cursor ──────────────────────────────────────────────────
export const COLLABORATOR_CURSOR_RADIUS = 5;
export const COLLABORATOR_DEFAULT_COLOR = '#38bdf8';
