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

describe('electrical net isolation', () => {
  it('keeps disconnected ground-labelled pins and relay COM electrically separate', () => {
    const uno = component('uno', 'ARDUINO_UNO', { boardPowered: true });
    const relay = component('relay', 'RELAY_SINGLE');
    const circuit = buildMNACircuit([uno, relay], []);

    expect(circuit.pinToMNANode.get('uno:gnd1')).toBe(0);
    expect(circuit.pinToMNANode.get('uno:gnd2')).toBe(0);
    expect(circuit.pinToMNANode.get('relay:gnd')).not.toBe(0);
    expect(circuit.pinToMNANode.get('relay:com')).not.toBe(0);
    expect(circuit.pinToMNANode.get('relay:com')).not.toBe(circuit.pinToMNANode.get('relay:gnd'));
  });

  it('keeps the top and bottom breadboard power rails independent', () => {
    const breadboard = component('bb', 'BREADBOARD');
    const circuit = buildMNACircuit([breadboard], []);
    const safety = analyzeCircuitSafety([breadboard], []);

    expect(circuit.pinToMNANode.get('bb:vcc_top_1')).toBe(circuit.pinToMNANode.get('bb:vcc_top_30'));
    expect(circuit.pinToMNANode.get('bb:vcc_bottom_1')).toBe(circuit.pinToMNANode.get('bb:vcc_bottom_30'));
    expect(circuit.pinToMNANode.get('bb:vcc_top_1')).not.toBe(circuit.pinToMNANode.get('bb:vcc_bottom_1'));
    expect(safety.netlist.pinToNet['bb:vcc_top_1']).not.toBe(safety.netlist.pinToNet['bb:vcc_bottom_1']);
  });

  it('limits ESP32 GPIO and pull-up sources to 3.3V', () => {
    const esp = component('esp', 'ESP32', { boardPowered: true });
    const output = buildMNACircuit([esp], [], { '2': 5 }, { '2': 'OUTPUT' }, { esp: true });
    const pullup = buildMNACircuit([esp], [], {}, { '2': 'INPUT_PULLUP' }, { esp: true });

    expect(output.elements.find((element) => element.id === 'vs_mcu_esp_d2_src')?.value).toBe(3.3);
    expect(pullup.elements.find((element) => element.id === 'vs_mcu_esp_d2_src')?.value).toBe(3.3);
  });
});

describe('component electrical models', () => {
  it('keeps old relay coil projects electrically compatible', () => {
    const uno = component('uno', 'ARDUINO_UNO', { boardPowered: true });
    const relay = component('relay', 'RELAY_SINGLE');
    const wires = [
      wire('drive', 'uno', 'd2', 'relay', 'coil1'),
      wire('return', 'relay', 'coil2', 'uno', 'gnd1'),
    ];

    const circuit = buildMNACircuit(
      [uno, relay],
      wires,
      { '2': 5 },
      { '2': 'OUTPUT' },
      { uno: true },
    );
    const solver = new MNASolver(circuit.numNodes);
    solver.setElements(circuit.elements);
    const result = solver.solve();

    expect(circuit.pinToMNANode.get('relay:coil1')).toBe(circuit.pinToMNANode.get('relay:in'));
    expect(circuit.pinToMNANode.get('relay:coil2')).toBe(circuit.pinToMNANode.get('relay:gnd'));
    expect(circuit.elements.some((element) => element.id === 'r_coil_relay')).toBe(true);
    expect(circuit.elements.some((element) => element.id === 'r_relay_idle_relay')).toBe(false);
    expect(Math.abs(result.branchCurrents.get('r_coil_relay') || 0)).toBeGreaterThan(0.02);
  });

  it('maps legacy relay pin ids in the safety netlist too', () => {
    const uno = component('uno', 'ARDUINO_UNO');
    const relay = component('relay', 'RELAY_SINGLE');
    const safety = analyzeCircuitSafety(
      [uno, relay],
      [wire('drive', 'uno', 'd2', 'relay', 'coil1')],
    );
    const relayComponent = safety.netlist.components.find((item) => item.id === 'relay');

    expect(relayComponent?.pins.in).toBe(safety.netlist.pinToNet['uno:d2']);
  });

  it('does not let PIR output pins power a circuit while the sensor is unpowered', () => {
    const pir = component('pir', 'SENSOR_PIR', { motionDetected: true });
    const circuit = buildMNACircuit([pir], []);
    const source = circuit.elements.find((element) => element.id === 'vs_pir_pir');
    const outputGate = circuit.elements.find((element) => element.id === 'r_pir_out_pir');

    expect(source?.nodeA).not.toBe(circuit.pinToMNANode.get('pir:out'));
    expect(outputGate?.value).toBe(1e8);
  });

  it('starts voltage regulators at 0V until VIN is high enough', () => {
    const regulator = component('reg', 'VOLTAGE_REGULATOR_7805');
    const circuit = buildMNACircuit([regulator], []);

    expect(circuit.elements.find((element) => element.id === 'vreg_reg')?.value).toBe(0);
    expect(circuit.elements.find((element) => element.id === 'r_vreg_idle_reg')?.value).toBe(50_000);
  });

  it('adds realistic powered loads for displays, servos, and NeoPixels', () => {
    const lcd = component('lcd', 'DISPLAY_LCD_I2C');
    const servo = component('servo', 'MOTOR_SERVO');
    const neopixel = component('neo', 'LED_NEOPIXEL', { pixelCount: 8, brightness: 50 });
    const circuit = buildMNACircuit([lcd, servo, neopixel], []);
    const ids = circuit.elements.map((element) => element.id);

    expect(ids).toContain('r_display_power_lcd');
    expect(ids).toContain('r_display_bus_sda_lcd');
    expect(ids).toContain('r_servo_power_servo');
    expect(ids).toContain('r_servo_signal_servo');
    expect(ids).toContain('r_neopixel_power_neo');
    expect(ids).toContain('r_neopixel_din_neo');
  });

  it('switches an NPN transistor on only when the base is driven', () => {
    const offSolver = new MNASolver(3);
    offSolver.setElements([
      { id: 'vcc', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 5 },
      { id: 'load', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 220 },
      { id: 'base_bleed', type: 'RESISTOR', nodeA: 3, nodeB: 0, value: 10_000 },
      {
        id: 'q',
        type: 'BJT',
        nodeA: 2,
        nodeB: 0,
        controlNode: 3,
        value: 0,
        gain: 100,
        maxCurrent: 0.1,
        saturationCurrent: 1e-15,
        thermalVoltage: 0.02585,
      },
    ]);

    const onSolver = new MNASolver(4);
    onSolver.setElements([
      { id: 'vcc', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 5 },
      { id: 'load', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 220 },
      { id: 'base_src', type: 'VOLTAGE_SOURCE', nodeA: 3, nodeB: 0, value: 5 },
      { id: 'base_r', type: 'RESISTOR', nodeA: 3, nodeB: 4, value: 10_000 },
      {
        id: 'q',
        type: 'BJT',
        nodeA: 2,
        nodeB: 0,
        controlNode: 4,
        value: 0,
        gain: 100,
        maxCurrent: 0.1,
        saturationCurrent: 1e-15,
        thermalVoltage: 0.02585,
      },
    ]);

    const off = offSolver.solve();
    const on = onSolver.solve();

    expect(Math.abs(off.branchCurrents.get('q') || 0)).toBeLessThan(0.000001);
    expect(Math.abs(on.branchCurrents.get('q') || 0)).toBeGreaterThan(0.005);
  });
});
