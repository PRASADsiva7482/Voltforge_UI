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

// ── Instrument / Meter constants ────────────────────────────────────────
export const AMMETER_TEXT_COLOR = '#38bdf8';
export const OSCILLOSCOPE_SCREEN_BG = '#0a0f1e';
export const OSCILLOSCOPE_GRID_COLOR = 'rgba(34,197,94,0.2)';
export const OSCILLOSCOPE_TRACE_COLOR = '#22c55e';
export const OSCILLOSCOPE_SCREEN: ScreenDimensions = { x: 8, y: 8, width: 84, height: 50 };

// ── Buzzer sound wave animation ──────────────────────────────────────────
export const BUZZER_WAVE_RINGS = 3;
export const BUZZER_WAVE_MAX_RADIUS = 30;
export const BUZZER_WAVE_COLOR = '#94a3b8';
export const BUZZER_WAVE_SPEED = 1200; // ms per expansion cycle
export const BUZZER_CONE_VIBRATE_PX = 1.5;

// ── Button 3D press effect ───────────────────────────────────────────────
export const BUTTON_PRESS_DEPTH = 3;        // px the cap sinks
export const BUTTON_SHADOW_NORMAL = 4;      // shadow blur at rest
export const BUTTON_SHADOW_PRESSED = 1;     // shadow blur when pressed
export const BUTTON_HIGHLIGHT_COLOR = '#fca5a5';

// ── Relay armature animation ─────────────────────────────────────────────
export const RELAY_ARM_OPEN_Y = 18;
export const RELAY_ARM_CLOSED_Y = 28;
export const RELAY_COIL_GLOW_COLOR = '#f97316';
export const RELAY_SNAP_DURATION_MS = 80;

// ── Display boot animation ──────────────────────────────────────────────
export const DISPLAY_BOOT_DURATION_MS = 800;
export const DISPLAY_CURSOR_BLINK_MS = 530;

// ── PWM flicker ─────────────────────────────────────────────────────────
export const PWM_FLICKER_MIN_OPACITY = 0.4;
export const PWM_FLICKER_MAX_OPACITY = 1.0;

// ── Sensor overlay styles ───────────────────────────────────────────────
export const SENSOR_OVERLAY_FONT = "'JetBrains Mono', 'Courier New', monospace";
export const SENSOR_OVERLAY_FONT_SIZE = 8;
export const SENSOR_OVERLAY_BG = 'rgba(15, 23, 42, 0.75)';
export const SENSOR_OVERLAY_TEXT = '#86efac';
export const SENSOR_OVERLAY_LABEL = '#94a3b8';
export const SENSOR_OVERLAY_RADIUS = 4;
export const SENSOR_BAR_HEIGHT = 4;
export const SENSOR_BAR_BG = 'rgba(255,255,255,0.1)';

// ── Sensor-specific colors ──────────────────────────────────────────────
export const TEMP_HOT_COLOR = '#ef4444';
export const TEMP_COLD_COLOR = '#3b82f6';
export const TEMP_WARM_COLOR = '#f59e0b';
export const ULTRASONIC_WAVE_COLOR = '#38bdf8';
export const PIR_ACTIVE_COLOR = '#ef4444';
export const PIR_IDLE_COLOR = '#22c55e';
export const LDR_SUN_COLOR = '#fbbf24';
export const LDR_MOON_COLOR = '#6366f1';
export const SOIL_WET_COLOR = '#3b82f6';
export const SOIL_DRY_COLOR = '#d97706';
export const IMU_TILT_COLOR = '#a855f7';

// ── Motor motion blur ───────────────────────────────────────────────────
export const MOTOR_BLUR_RPM_THRESHOLD = 2000;
export const MOTOR_VIBRATE_PX = 0.8;
export const MOTOR_HIGH_RPM_COLOR = '#ef4444';
export const MOTOR_LOW_RPM_COLOR = '#22c55e';

// ── Servo sweep ─────────────────────────────────────────────────────────
export const SERVO_TICK_COUNT = 9; // 0, 22.5, 45, ... 180
export const SERVO_ARC_COLOR = 'rgba(34,197,94,0.2)';
export const SERVO_ANGLE_TEXT_COLOR = '#86efac';

// ── Board activity ──────────────────────────────────────────────────────
export const BOARD_TX_COLOR = '#ef4444';
export const BOARD_RX_COLOR = '#22c55e';
export const BOARD_TX_BLINK_MS = 80;
