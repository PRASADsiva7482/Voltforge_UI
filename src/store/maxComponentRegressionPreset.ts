import type { CanvasNode, Wire } from '../types/domain';
import { hydrateCanvasNode, type CanvasNodeSeed } from '../features/canvas/componentFactory';
import type { BoardType } from '../types/domain';

export const MAX_COMPONENT_REGRESSION_ID = 'max-component-regression-v1';
export const MAX_COMPONENT_REGRESSION_BOARD: BoardType = 'ARDUINO_UNO';
export const MAX_COMPONENT_REGRESSION_DURATION_MS = 4_000;

/**
 * The same source is used for both fidelity runs. It intentionally exercises
 * the compatibility execution path without requiring a network compiler or a
 * machine-specific HEX artifact.
 */
export const MAX_COMPONENT_REGRESSION_FIRMWARE = `
void setup() {
  pinMode(3, OUTPUT);
  pinMode(5, OUTPUT);
  pinMode(6, OUTPUT);
  pinMode(9, OUTPUT);
  pinMode(10, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(12, OUTPUT);
}

void loop() {
  analogWrite(3, 180);
  analogWrite(5, 96);
  analogWrite(6, 220);
  analogWrite(9, 128);
  digitalWrite(10, HIGH);
  digitalWrite(11, HIGH);
  digitalWrite(12, LOW);
  delay(8);
  analogWrite(3, 24);
  analogWrite(5, 210);
  analogWrite(6, 48);
  analogWrite(9, 235);
  digitalWrite(10, LOW);
  digitalWrite(11, LOW);
  digitalWrite(12, HIGH);
  delay(8);
}
`;

export type RegressionRepresentativeKind = 'transient' | 'motor' | 'led' | 'digital-ic';

export interface MaximumComponentRegressionPreset {
  id: typeof MAX_COMPONENT_REGRESSION_ID;
  boardType: BoardType;
  durationMs: number;
  firmware: string;
  nodes: CanvasNode[];
  wires: Wire[];
  representativeNodes: Record<RegressionRepresentativeKind, string[]>;
}

type NodeSpec = CanvasNodeSeed & { properties?: Record<string, unknown> };

const wire = (
  id: string,
  fromNodeId: string,
  fromPinId: string,
  toNodeId: string,
  toPinId: string,
): Wire => ({
  bendPoints: [],
  color: '#64748b',
  fromNodeId,
  fromPinId,
  id,
  label: 'benchmark',
  routingMode: 'auto',
  toNodeId,
  toPinId,
});

function createNode(spec: NodeSpec): CanvasNode {
  return hydrateCanvasNode(spec);
}

function createPreset(): MaximumComponentRegressionPreset {
  const specs: NodeSpec[] = [
    { id: 'max_board', name: 'Regression Uno', type: 'ARDUINO_UNO', x: 560, y: 80 },
    { id: 'max_supply', name: 'Regression 5V', type: 'DC_SOURCE_5V', x: 40, y: 90, properties: { voltage: 5 } },
    { id: 'max_ground', name: 'Regression Ground', type: 'GROUND', x: 40, y: 270 },
    { id: 'max_ic_595', name: 'Regression Shift Register', type: 'IC_74HC595', x: 820, y: 80 },
    { id: 'max_ic_165', name: 'Regression Input Register', type: 'IC_74HC165', x: 980, y: 80 },
    { id: 'max_ic_138', name: 'Regression Decoder', type: 'IC_74HC138', x: 1140, y: 80 },
    { id: 'max_ic_4017', name: 'Regression Counter', type: 'IC_CD4017', x: 1300, y: 80 },
    { id: 'max_motor', name: 'Regression Motor', type: 'MOTOR_DC', x: 820, y: 330, properties: { resistance: 8, backEmf: 0 } },
    { id: 'max_cap_main', name: 'Regression Bulk Capacitor', type: 'ELECTROLYTIC_CAPACITOR', x: 230, y: 330, properties: { capacitance: 0.00001 } },
    { id: 'max_inductor', name: 'Regression Inductor', type: 'INDUCTOR', x: 390, y: 330, properties: { inductance: 0.01 } },
    { id: 'max_cap_ceramic', name: 'Regression Ceramic', type: 'CERAMIC_CAPACITOR', x: 540, y: 330, properties: { capacitance: 0.0000001 } },
    { id: 'max_diode', name: 'Regression Diode', type: 'DIODE', x: 670, y: 330 },
  ];

  for (let index = 0; index < 12; index += 1) {
    specs.push({
      id: `max_resistor_${index + 1}`,
      name: `Regression Resistor ${index + 1}`,
      type: 'RESISTOR',
      x: 80 + (index % 6) * 145,
      y: 500 + Math.floor(index / 6) * 100,
      properties: { resistance: 220 + index * 47 },
    });
    specs.push({
      id: `max_led_${index + 1}`,
      name: `Regression LED ${index + 1}`,
      type: 'LED_STANDARD',
      x: 80 + (index % 6) * 145,
      y: 650 + Math.floor(index / 6) * 100,
    });
  }

  const nodes = specs.map(createNode);
  const wires: Wire[] = [
    wire('max_wire_supply_board', 'max_supply', 'positive', 'max_board', '5v'),
    wire('max_wire_supply_ground', 'max_supply', 'negative', 'max_ground', 'gnd'),
    wire('max_wire_board_ground', 'max_board', 'gnd1', 'max_ground', 'gnd'),
    wire('max_wire_supply_595', 'max_supply', 'positive', 'max_ic_595', 'vcc'),
    wire('max_wire_ground_595', 'max_ic_595', 'gnd', 'max_ground', 'gnd'),
    wire('max_wire_supply_165', 'max_supply', 'positive', 'max_ic_165', 'vcc'),
    wire('max_wire_ground_165', 'max_ic_165', 'gnd', 'max_ground', 'gnd'),
    wire('max_wire_supply_138', 'max_supply', 'positive', 'max_ic_138', 'vcc'),
    wire('max_wire_ground_138', 'max_ic_138', 'gnd', 'max_ground', 'gnd'),
    wire('max_wire_supply_4017', 'max_supply', 'positive', 'max_ic_4017', 'vcc'),
    wire('max_wire_ground_4017', 'max_ic_4017', 'gnd', 'max_ground', 'gnd'),
    wire('max_wire_board_595_ser', 'max_board', 'd10', 'max_ic_595', 'ser'),
    wire('max_wire_board_595_clk', 'max_board', 'd11', 'max_ic_595', 'srclk'),
    wire('max_wire_board_595_latch', 'max_board', 'd12', 'max_ic_595', 'rclk'),
    wire('max_wire_595_165', 'max_ic_595', 'qa', 'max_ic_165', 'd0'),
    wire('max_wire_165_138', 'max_ic_165', 'q7', 'max_ic_138', 'a0'),
    wire('max_wire_138_4017', 'max_ic_138', 'y0', 'max_ic_4017', 'reset'),
    wire('max_wire_board_motor', 'max_board', 'd9', 'max_motor', 'm1'),
    wire('max_wire_motor_ground', 'max_motor', 'm2', 'max_ground', 'gnd'),
    wire('max_wire_cap_main_vcc', 'max_supply', 'positive', 'max_cap_main', 'p1'),
    wire('max_wire_cap_main_ground', 'max_cap_main', 'p2', 'max_ground', 'gnd'),
    wire('max_wire_inductor_vcc', 'max_supply', 'positive', 'max_inductor', 'p1'),
    wire('max_wire_inductor_ground', 'max_inductor', 'p2', 'max_ground', 'gnd'),
    wire('max_wire_cap_ceramic_vcc', 'max_supply', 'positive', 'max_cap_ceramic', 'p1'),
    wire('max_wire_cap_ceramic_ground', 'max_cap_ceramic', 'p2', 'max_ground', 'gnd'),
    wire('max_wire_diode_vcc', 'max_supply', 'positive', 'max_diode', 'anode'),
    wire('max_wire_diode_ground', 'max_diode', 'cathode', 'max_ground', 'gnd'),
  ];

  for (let index = 0; index < 12; index += 1) {
    const resistorId = `max_resistor_${index + 1}`;
    const ledId = `max_led_${index + 1}`;
    const boardPin = ['d3', 'd5', 'd6', 'd9', 'a0', 'a1'][index % 6];
    wires.push(
      wire(`max_wire_${resistorId}_source`, 'max_supply', 'positive', resistorId, 'p1'),
      wire(`max_wire_${resistorId}_led`, resistorId, 'p2', ledId, 'anode'),
      wire(`max_wire_${ledId}_ground`, ledId, 'cathode', 'max_ground', 'gnd'),
      wire(`max_wire_${ledId}_board`, ledId, 'anode', 'max_board', boardPin),
    );
  }

  return {
    id: MAX_COMPONENT_REGRESSION_ID,
    boardType: MAX_COMPONENT_REGRESSION_BOARD,
    durationMs: MAX_COMPONENT_REGRESSION_DURATION_MS,
    firmware: MAX_COMPONENT_REGRESSION_FIRMWARE,
    nodes,
    wires,
    representativeNodes: {
      transient: ['max_cap_main', 'max_inductor', 'max_cap_ceramic'],
      motor: ['max_motor'],
      led: Array.from({ length: 12 }, (_, index) => `max_led_${index + 1}`),
      'digital-ic': ['max_ic_595', 'max_ic_165', 'max_ic_138', 'max_ic_4017'],
    },
  };
}

/** A fresh object prevents one benchmark run from mutating another run. */
export function createMaximumComponentRegressionPreset(): MaximumComponentRegressionPreset {
  const preset = createPreset();
  return {
    ...preset,
    nodes: preset.nodes.map((node) => ({ ...node, pins: node.pins.map((pin) => ({ ...pin })), properties: { ...node.properties } })),
    wires: preset.wires.map((wireItem) => ({ ...wireItem, bendPoints: wireItem.bendPoints.map((point) => ({ ...point })) })),
    representativeNodes: Object.fromEntries(
      Object.entries(preset.representativeNodes).map(([kind, ids]) => [kind, [...ids]]),
    ) as MaximumComponentRegressionPreset['representativeNodes'],
  };
}

