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

    // HIGH on anode means lit
    if (pinId.toLowerCase().includes('anode') || pinId === '1' || pinId === 'pos') {
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

    if (pinId.toLowerCase().includes('pin') || pinId === '1') {
      updateNode(componentId, { properties: { ...node.properties, isSpinning: state === 'HIGH' } });
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
 * Global Registry
 */
export class LogicRegistry {
  private static handlers: Record<string, IComponentLogic> = {
    'LED_STANDARD': new LedLogic(),
    'MOTOR_DC': new MotorLogic(),
    'BUZZER': new BuzzerLogic(),
    'RELAY_SPDT': new RelayLogic(),
  };

  public static dispatch(componentType: string, componentId: string, pinId: string, state: PinState, value?: number) {
    const handler = this.handlers[componentType];
    if (handler) {
      handler.onPinStateChange(componentId, pinId, state, value);
    }
  }
}
