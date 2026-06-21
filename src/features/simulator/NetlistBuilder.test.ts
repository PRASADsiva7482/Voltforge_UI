import { describe, expect, it } from 'vitest';
import type { CanvasNode, Wire } from '../../types';
import { analyzeCircuitSafety } from '../canvas/netlist';
import { getPinsForComponent } from '../canvas/pinRegistry';
import { MNASolver } from './MNASolver';
import { buildMNACircuit } from './NetlistBuilder';

function component(id: string, type: string, properties: Record<string, unknown> = {}): CanvasNode {
  return {
    id,
    componentId: `${id}-component`,
    type,
    name: type === 'MOTOR_DC' ? 'DC Motor' : 'Arduino Uno',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    properties,
    pins: getPinsForComponent(type),
  };
}

function wire(id: string, fromNodeId: string, fromPinId: string, toNodeId: string, toPinId: string): Wire {
  return {
    id,
    fromNodeId,
    fromPinId,
    toNodeId,
    toPinId,
    color: '#000000',
    bendPoints: [],
    routingMode: 'straight',
  };
}

describe('MCU and DC motor netlist', () => {
  const uno = component('uno', 'ARDUINO_UNO', { usbConnected: 'Yes', boardPowered: true });
  const motor = component('motor', 'MOTOR_DC', { resistance: 10, voltage: '5V' });

  it('creates unique GPIO drivers without treating 5V and 3.3V as digital pins', () => {
    const circuit = buildMNACircuit([uno, motor], [], { '2': 5 }, { '2': 'OUTPUT' }, { uno: true });
    const ids = circuit.elements.map((element) => element.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'vs_mcu_uno_d2_src')).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith('vs_mcu_uno_'))).toHaveLength(20);
  });

  it('solves a complete D2 to motor to ground circuit with non-zero motor current', () => {
    const wires = [
      wire('signal', 'uno', 'd2', 'motor', 'm1'),
      wire('return', 'motor', 'm2', 'uno', 'gnd1'),
    ];
    const circuit = buildMNACircuit(
      [uno, motor],
      wires,
      { '2': 5 },
      { '2': 'OUTPUT' },
      { uno: true },
    );
    const solver = new MNASolver(circuit.numNodes);
    solver.setElements(circuit.elements);

    const result = solver.solve();
    const motorCurrent = Math.abs(result.branchCurrents.get('mot_motor') || 0);

    expect(result.converged).toBe(true);
    expect(motorCurrent).toBeGreaterThan(0.01);
  });

  it('opens GPIO output impedance when the board is off and reconnects it when powered', () => {
    const powered = buildMNACircuit([uno], [], {}, { '2': 'OUTPUT' }, { uno: true });
    const unpowered = buildMNACircuit([uno], [], {}, { '2': 'OUTPUT' }, { uno: false });
    const outputResistance = (circuit: ReturnType<typeof buildMNACircuit>) =>
      circuit.elements.find((element) => element.id === 'r_mcu_pin_uno_d2')?.value;

    expect(outputResistance(powered)).toBe(40);
    expect(outputResistance(unpowered)).toBe(1e8);
  });

  it('reports a one-wire motor as an open circuit', () => {
    const safety = analyzeCircuitSafety(
      [uno, motor],
      [wire('signal', 'uno', 'd2', 'motor', 'm1')],
    );

    expect(safety.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'motor:motor-open-circuit', severity: 'WARNING' }),
    ]));
  });

  it('warns when a motor is driven directly from a GPIO pin', () => {
    const safety = analyzeCircuitSafety(
      [uno, motor],
      [
        wire('signal', 'uno', 'd2', 'motor', 'm1'),
        wire('return', 'motor', 'm2', 'uno', 'gnd1'),
      ],
    );

    expect(safety.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'motor:motor-direct-gpio', severity: 'WARNING' }),
    ]));
  });
});
