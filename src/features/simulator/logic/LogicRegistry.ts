// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Component Logic Registry
// ═══════════════════════════════════════════════════════════════════════════

import { PinState } from '../SimulationEngine';
import { useCanvasStore } from '../../../store/canvasStore';

export interface IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState, value?: number): void;
}

/**
 * Logic for Standard LEDs
 */
export class LedLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;
    if (node.properties?.isBlown) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();

    // HIGH on anode means lit
    if (pinLabel.includes('anode') || pinLabel.includes('+') || pinLabel.includes('pos')) {
      updateNode(componentId, { properties: { ...node.properties, isLit: state === 'HIGH' } });
    }
  }
}

/**
 * Logic for RGB LEDs — mixes R, G, B PWM values into a dynamic glow color
 */
export class RgbLedLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;
    if (node.properties?.isBlown) return;

    const pwm = state === 'PWM' ? Math.max(0, Math.min(255, value ?? 0)) : state === 'HIGH' ? 255 : 0;
    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();

    const props = { ...(node.properties || {}) };
    if (pinLabel.includes('r') || pinLabel.includes('red')) {
      props.rgbRed = pwm;
    } else if (pinLabel.includes('g') || pinLabel.includes('green')) {
      props.rgbGreen = pwm;
    } else if (pinLabel.includes('b') || pinLabel.includes('blue')) {
      props.rgbBlue = pwm;
    }

    const r = Number(props.rgbRed) || 0;
    const g = Number(props.rgbGreen) || 0;
    const b = Number(props.rgbBlue) || 0;
    const isLit = r > 0 || g > 0 || b > 0;
    const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    props.isLit = isLit;
    props.ledColor = hexColor;
    updateNode(componentId, { properties: props });
  }
}

/**
 * Logic for NeoPixel LEDs — addressable color from DIN pin
 */
export class NeoPixelLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;
    if (node.properties?.isBlown) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();
    if (!pinLabel.includes('din') && !pinLabel.includes('data')) return;

    // PWM value encodes a color index or brightness
    const pwm = state === 'PWM' ? Math.max(0, Math.min(255, value ?? 0)) : state === 'HIGH' ? 255 : 0;
    const isLit = pwm > 0;

    // Map PWM to a rainbow-like hue for visual variety
    const hue = Math.round((pwm / 255) * 360);
    const hexColor = `hsl(${hue}, 100%, 50%)`;

    updateNode(componentId, {
      properties: {
        ...node.properties,
        isLit,
        neoPixelBrightness: pwm,
        ledColor: hexColor,
      },
    });
  }
}

/**
 * Logic for DC Motors
 */
export class MotorLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();
    if (pinLabel.includes('pin') || pinLabel.includes('m+') || pinLabel.includes('signal')) {
      updateNode(componentId, { properties: { ...node.properties, isSpinning: state === 'HIGH' } });
    }
  }
}

export class ServoLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();
    if (!pinLabel.includes('sig') && !pinLabel.includes('signal')) return;

    const pwm = state === 'PWM' ? Math.max(0, Math.min(255, value ?? 0)) : state === 'HIGH' ? 255 : 0;
    const angle = Math.round((pwm / 255) * 180);
    updateNode(componentId, { properties: { ...node.properties, servoAngle: angle, isSpinning: false } });
  }
}

/**
 * Logic for Stepper Motors — tracks step pulses and updates rotation angle
 */
export class StepperLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    // Animation tick handler (driven by SimulationEngine)
    if (pinId === '__stepper_anim__') {
      updateNode(componentId, {
        properties: {
          ...node.properties,
          stepperRotation: value ?? 0,
        },
      });
      return;
    }

    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();

    // Accept any coil pin going HIGH as a step pulse
    if (state === 'HIGH' && (pinLabel.includes('a') || pinLabel.includes('b'))) {
      const currentSteps = Number(node.properties?.stepperSteps) || 0;
      const stepsPerRev = 200; // Standard 1.8° stepper
      const newSteps = currentSteps + 1;
      const rotation = ((newSteps % stepsPerRev) / stepsPerRev) * 360;
      updateNode(componentId, {
        properties: {
          ...node.properties,
          stepperSteps: newSteps,
          stepperRotation: rotation,
          isSpinning: true,
        },
      });
    } else if (state === 'LOW') {
      // Check if all coil pins are LOW
      const allLow = node.pins?.every(p => {
        const lbl = `${p.id} ${p.name}`.toLowerCase();
        if (lbl.includes('a') || lbl.includes('b')) {
          return p.id === pinId; // This one is going LOW
        }
        return true;
      });
      if (allLow) {
        updateNode(componentId, {
          properties: { ...node.properties, isSpinning: false },
        });
      }
    }
  }
}

/**
 * Logic for Buzzers
 */
export class BuzzerLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    if (pinId.toLowerCase().includes('pos') || pinId === '1') {
      updateNode(componentId, { properties: { ...node.properties, isBeeping: state === 'HIGH' } });
    }
  }
}

export class MultimeterLogic implements IComponentLogic {
  onPinStateChange(componentId: string, _pinId: string, _state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const voltage = Number.isFinite(value) ? Number(value) : 0;
    updateNode(componentId, {
      properties: {
        ...node.properties,
        measuredVoltage: voltage,
        displayValue: `${voltage.toFixed(2)}V`,
      },
    });
  }
}

/**
 * Logic for Relay — supports single, double (2CH), and quad (4CH) relays
 */
export class RelayLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const pinLower = pinId.toLowerCase();
    if (!pinLower.includes('coil') && !pinLower.includes('in')) return;

    const props = { ...(node.properties || {}) };

    // Determine which channel this coil pin belongs to
    const channelMatch = pinLower.match(/(\d+)/);
    if (channelMatch) {
      const ch = channelMatch[1];
      props[`isSwitched_${ch}`] = state === 'HIGH';
    } else {
      // Single relay — no channel number
      props.isSwitched = state === 'HIGH';
    }

    // Overall active state — any channel switched
    const anySwitched = props.isSwitched ||
      Object.keys(props).some(k => k.startsWith('isSwitched_') && props[k]);
    props.isActive = anySwitched;

    updateNode(componentId, { properties: props });
  }
}

/**
 * Logic for 7-Segment Display — maps segment pins to lit segments
 */
export class SevenSegLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    // Segment pins are named a–g
    const segmentId = pinId.toLowerCase();
    if (!'abcdefg'.includes(segmentId)) return;

    const props = { ...(node.properties || {}) };
    if (!props.segments) props.segments = {};
    (props.segments as Record<string, boolean>)[segmentId] = state === 'HIGH';

    // Determine which digit is being displayed from the segment pattern
    const segs = props.segments as Record<string, boolean>;
    const digitMap: Record<string, string> = {
      '1111110': '0', '0110000': '1', '1101101': '2', '1111001': '3',
      '0110011': '4', '1011011': '5', '1011111': '6', '1110000': '7',
      '1111111': '8', '1111011': '9',
    };
    const pattern = 'abcdefg'.split('').map(s => segs[s] ? '1' : '0').join('');
    props.displayDigit = digitMap[pattern] ?? '';
    props.isActive = Object.values(segs).some(v => v);

    updateNode(componentId, { properties: props });
  }
}

/**
 * Logic for Push Buttons — toggles pin state when clicked by user
 */
export class ButtonLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const props = { ...(node.properties || {}) };
    props.isPressed = state === 'HIGH';
    props.isActive = state === 'HIGH';
    updateNode(componentId, { properties: props });
  }
}

/**
 * Logic for Toggle Switch (SPST) — maintains latching on/off state
 */
export class SwitchLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const props = { ...(node.properties || {}) };
    // Toggle on HIGH signal (user click triggers HIGH momentarily)
    if (state === 'HIGH') {
      props.isClosed = !props.isClosed;
    }
    props.isActive = Boolean(props.isClosed);
    updateNode(componentId, { properties: props });
  }
}

/**
 * Logic for LCD / OLED Displays
 * Reads the simulated LCD text buffer and pushes it to node properties.
 */
export class LcdDisplayLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, _state: PinState): void {
    if (pinId !== '__lcd_display__') return;

    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    // Read from the global LCD state set by SimulationEngine
    const lcdState = (globalThis as any).__voltforgeLcdState?.[componentId];
    if (!lcdState) return;

    updateNode(componentId, {
      properties: {
        ...node.properties,
        lcdLine1: lcdState.line1 || '',
        lcdLine2: lcdState.line2 || '',
        lcdBacklight: lcdState.backlight ?? true,
      },
    });
  }
}

/**
 * Logic for ESC Module — interprets PWM signal and drives connected BLDC motor
 * PWM mapping: 1000µs → 0% throttle, 2000µs → 100% throttle
 * The PWM value (0-255) from analogWrite is mapped linearly to RPM.
 */
export class ESCLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState, value?: number): void {
    const { updateNode, nodes, wires } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const pin = node.pins?.find(p => p.id === pinId);
    const pinLabel = `${pinId} ${pin?.name || ''}`.toLowerCase();
    if (!pinLabel.includes('sig') && !pinLabel.includes('signal')) return;

    // Map PWM 0-255 to throttle percentage (0-100)
    // In real ESC: 1000µs = 0%, 1500µs = 50%, 2000µs = 100%
    const pwm = state === 'PWM' ? Math.max(0, Math.min(255, value ?? 0)) : state === 'HIGH' ? 255 : 0;
    const throttlePercent = Math.round((pwm / 255) * 100);
    const rpm = Math.round((pwm / 255) * 12000); // Max ~12000 RPM for a 2204 motor

    updateNode(componentId, {
      properties: {
        ...node.properties,
        escThrottle: throttlePercent,
        escRpm: rpm,
        isActive: pwm > 0,
      },
    });

    // Propagate RPM to connected BLDC motors via phase pins
    const phasePins = node.pins?.filter(p => p.id.startsWith('phase_')) || [];
    for (const phasePin of phasePins) {
      // Find wires connected to this phase pin
      const connectedWires = wires.filter(w =>
        (w.fromNodeId === componentId && w.fromPinId === phasePin.id) ||
        (w.toNodeId === componentId && w.toPinId === phasePin.id)
      );
      for (const wire of connectedWires) {
        const targetNodeId = wire.fromNodeId === componentId ? wire.toNodeId : wire.fromNodeId;
        const targetPinId = wire.fromNodeId === componentId ? wire.toPinId : wire.fromPinId;
        const targetNode = nodes.find(n => n.id === targetNodeId);
        if (targetNode?.type === 'MOTOR_BLDC') {
          // Use a special state to carry RPM value to the motor logic
          LogicRegistry.dispatch('MOTOR_BLDC', targetNodeId, targetPinId, pwm > 0 ? 'HIGH' : 'LOW', rpm);
        }
      }
    }
  }
}

/**
 * Logic for BLDC Motor — receives RPM from ESC and animates rotation
 */
export class BLDCMotorLogic implements IComponentLogic {
  onPinStateChange(componentId: string, _pinId: string, state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    // Animation tick — update rotation angle
    if (_pinId === '__bldc_anim__') {
      updateNode(componentId, {
        properties: {
          ...node.properties,
          bldcRotation: value ?? 0,
        },
      });
      return;
    }

    const rpm = state === 'HIGH' ? Math.max(0, value ?? 0) : 0;
    const isSpinning = rpm > 0;

    // Store RPM for animation; the CircuitCanvas will use bldcRpm to animate rotation
    updateNode(componentId, {
      properties: {
        ...node.properties,
        bldcRpm: rpm,
        isSpinning,
      },
    });
  }
}

/**
 * Logic for Ammeter — displays measured current
 */
export class AmmeterLogic implements IComponentLogic {
  onPinStateChange(componentId: string, _pinId: string, _state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const currentAmps = Number.isFinite(value) ? Number(value) : 0;
    const currentMa = currentAmps * 1000;

    // Format display: use mA for small values, A for large
    let displayValue: string;
    if (Math.abs(currentMa) < 1) {
      displayValue = `${(currentMa * 1000).toFixed(1)} µA`;
    } else if (Math.abs(currentMa) >= 1000) {
      displayValue = `${(currentMa / 1000).toFixed(3)} A`;
    } else {
      displayValue = `${currentMa.toFixed(2)} mA`;
    }

    updateNode(componentId, {
      properties: {
        ...node.properties,
        measuredCurrent: currentAmps,
        displayValue,
      },
    });
  }
}

/**
 * Logic for Oscilloscope — updates display text with probe voltage
 */
export class OscilloscopeLogic implements IComponentLogic {
  onPinStateChange(componentId: string, _pinId: string, _state: PinState, value?: number): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    const voltage = Number.isFinite(value) ? Number(value) : 0;
    updateNode(componentId, {
      properties: {
        ...node.properties,
        displayValue: `${voltage.toFixed(2)}V`,
        lastVoltage: voltage,
      },
    });
  }
}

/**
 * Global Registry
 */
export class LogicRegistry {
  private static handlers: Record<string, IComponentLogic> = {
    // LEDs
    'LED_STANDARD': new LedLogic(),
    'LED_RGB': new RgbLedLogic(),
    'LED_NEOPIXEL': new NeoPixelLogic(),
    // Motors
    'MOTOR_DC': new MotorLogic(),
    'SERVO_MOTOR': new ServoLogic(),
    'MOTOR_SERVO': new ServoLogic(),
    'MOTOR_STEPPER': new StepperLogic(),
    'STEPPER_MOTOR': new StepperLogic(),
    // Buzzer
    'BUZZER': new BuzzerLogic(),
    // Relays — all types use the same multi-channel logic
    'RELAY_SPDT': new RelayLogic(),
    'RELAY_SINGLE': new RelayLogic(),
    'RELAY_2CH': new RelayLogic(),
    'RELAY_4CH': new RelayLogic(),
    // Displays
    'MULTIMETER': new MultimeterLogic(),
    'DISPLAY_LCD_I2C': new LcdDisplayLogic(),
    'LCD_16X2': new LcdDisplayLogic(),
    'DISPLAY_OLED': new LcdDisplayLogic(),
    'OLED_DISPLAY': new LcdDisplayLogic(),
    'DISPLAY_7SEG': new SevenSegLogic(),
    // Drone / ESC
    'ESC_MODULE': new ESCLogic(),
    'MOTOR_BLDC': new BLDCMotorLogic(),
    // Instruments
    'AMMETER': new AmmeterLogic(),
    'OSCILLOSCOPE': new OscilloscopeLogic(),
    // Input
    'PUSH_BUTTON': new ButtonLogic(),
    'BUTTON': new ButtonLogic(),
    'SWITCH_SPST': new SwitchLogic(),
  };

  public static dispatch(componentType: string, componentId: string, pinId: string, state: PinState, value?: number) {
    const handler = this.handlers[componentType];
    if (handler) {
      handler.onPinStateChange(componentId, pinId, state, value);
    }
  }
}
