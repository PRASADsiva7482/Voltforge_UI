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
 * Logic for Relay
 */
export class RelayLogic implements IComponentLogic {
  onPinStateChange(componentId: string, pinId: string, state: PinState): void {
    const { updateNode, nodes } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === componentId);
    if (!node) return;

    if (pinId.toLowerCase().includes('coil')) {
      updateNode(componentId, { properties: { ...node.properties, isSwitched: state === 'HIGH' } });
    }
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
 * Global Registry
 */
export class LogicRegistry {
  private static handlers: Record<string, IComponentLogic> = {
    'LED_STANDARD': new LedLogic(),
    'MOTOR_DC': new MotorLogic(),
    'SERVO_MOTOR': new ServoLogic(),
    'MOTOR_SERVO': new ServoLogic(),
    'BUZZER': new BuzzerLogic(),
    'RELAY_SPDT': new RelayLogic(),
    'MULTIMETER': new MultimeterLogic(),
    'DISPLAY_LCD_I2C': new LcdDisplayLogic(),
    'LCD_16X2': new LcdDisplayLogic(),
    'DISPLAY_OLED': new LcdDisplayLogic(),
    'OLED_DISPLAY': new LcdDisplayLogic(),
    'ESC_MODULE': new ESCLogic(),
    'MOTOR_BLDC': new BLDCMotorLogic(),
  };

  public static dispatch(componentType: string, componentId: string, pinId: string, state: PinState, value?: number) {
    const handler = this.handlers[componentType];
    if (handler) {
      handler.onPinStateChange(componentId, pinId, state, value);
    }
  }
}
