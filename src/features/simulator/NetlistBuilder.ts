// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Netlist Builder for MNA Solver
// Converts Canvas nodes + wires into MNA circuit elements with proper
// electrical node mapping, breadboard auto-connect, and component models.
// ═══════════════════════════════════════════════════════════════════════════

import type { CanvasNode, Wire } from '../../types/domain';
import { normalizePotentiometerPosition } from '../canvas/componentContracts';
import type { MNAElement } from './MNASolver';
import { getBoardLogicVoltage, getBoardPinNumber, getBoardPowerVoltage, isBoardComponentType } from '../canvas/boardCatalog';
import {
  SIMULATION_MODELS,
  booleanProperty,
  diodeSeriesResistance,
  ledForwardVoltage,
  ledMaximumCurrent_mA,
  ledSeriesResistance,
  capacitanceFarads,
  inductanceHenrys,
  numericProperty,
  resistanceOhms,
  isStandaloneSourceType,
  sourceDefinition,
} from './simulationModels';

// ── Intermediate types ──────────────────────────────────────────────────

export interface MNAElementTopology {
  id: string;
  type: MNAElement['type'];
  nodeA: number;
  nodeB: number;
  controlNode?: number;
  controlNode2?: number;
  resetNode?: number;
  internalNode?: number;
  positiveRailNode?: number;
  negativeRailNode?: number;
  outputElementId?: string;
  dischargeElementId?: string;
}

export interface MNATopology {
  numNodes: number;
  groundNodeIndex: number;
  /** Cheap input fingerprint used to reject stale connectivity caches. */
  connectivitySignature: string;
  /** Maps a canvas pin key to its stable MNA node index. */
  pinToMNANode: Map<string, number>;
  /** Maps each stable MNA element ID back to its canvas component. */
  elementToComponent: Map<string, string>;
  /** Components represented by the safe generic load model. */
  genericComponentIds: Set<string>;
  /** Element IDs and node references that determine the solver matrix shape. */
  elementSignatures: MNAElementTopology[];
}

export interface MNABuildMetrics {
  topologyCacheHit: boolean;
  connectivityDiscoveryPassCount: number;
  registeredPinCount: number;
  wireUnionCount: number;
  breadboardProximityComparisonCount: number;
}

export interface MNACircuit {
  numNodes: number;            // Total electrical nodes (excluding ground)
  elements: MNAElement[];      // Components for the solver
  groundNodeIndex: number;     // Always 0
  /** Maps a canvas pin key ("nodeId:pinId") to an MNA node index (0 = GND) */
  pinToMNANode: Map<string, number>;
  /** Maps MNA element ID back to canvas component ID */
  elementToComponent: Map<string, string>;
  /** Components represented by the safe generic load model. */
  genericComponentIds: Set<string>;
  /** Stable scope channel labels mapped to their solved MNA node. */
  scopeChannels: Record<string, number>;
  /** Cached connectivity and matrix-shape data used by incremental refreshes. */
  topology: MNATopology;
  /** Deterministic evidence that cached refreshes skipped connectivity work. */
  buildMetrics: MNABuildMetrics;
}

export type MeterMeasurementMode = 'VOLTAGE' | 'CURRENT' | 'RESISTANCE';

export interface VirtualMeterConfiguration {
  mode: MeterMeasurementMode;
  probes: Array<{ nodeId: string; pinId: string }>;
}

// ── Union-Find (same approach as existing netlist.ts) ───────────────────

class UnionFind {
  private parent = new Map<string, string>();

  add(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    const p = this.parent.get(key)!;
    if (p === key) return key;
    const root = this.find(p);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }

  groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const group = result.get(root) || [];
      group.push(key);
      result.set(root, group);
    }
    return result;
  }
}

const pinKey = (nodeId: string, pinId: string) => `${nodeId}:${pinId}`;

function genericPinLabel(pin: { id: string; name?: string }): string {
  return `${pin.id} ${pin.name || ''}`;
}

function isGenericPowerPin(pin: { id: string; name?: string; type?: string }): boolean {
  return pin.type === 'power' || /(?:^|[\s_:+-])(vcc|vdd|vin|vbat|3v3|5v|12v|power|positive|pos|plus)(?:$|[\s_:+-])/i.test(genericPinLabel(pin));
}

function isGenericGroundPin(pin: { id: string; name?: string; type?: string }): boolean {
  return pin.type === 'ground' || /(?:^|[\s_:+-])(gnd|ground|vss|negative|neg|minus)(?:$|[\s_:+-])/i.test(genericPinLabel(pin));
}

function genericResistance(properties: Record<string, unknown>, fallback: number): number {
  const requested = properties.resistance
    ?? properties.loadResistance
    ?? properties.internalResistance
    ?? properties.powerResistance;
  return Math.min(1e9, Math.max(1, numericProperty(requested, fallback)));
}

function meterMeasurementMode(value: unknown): MeterMeasurementMode {
  const normalized = String(value || 'VOLTAGE').trim().toUpperCase();
  if (normalized === 'CURRENT' || normalized === 'MA') return 'CURRENT';
  if (normalized === 'RESISTANCE' || normalized === 'OHM' || normalized === 'CONTINUITY') return 'RESISTANCE';
  return 'VOLTAGE';
}

function hasActiveExternalPower(nodes: CanvasNode[], boardPoweredMap: Record<string, boolean>): boolean {
  return nodes.some((node) => {
    if (isStandaloneSourceType(node.type)) {
      const source = sourceDefinition(node.type, node.properties || {});
      if (!source.enabled) return false;
      return source.isAc
        ? Math.max(Math.abs(source.amplitude), Math.abs(source.offset)) > 0.01
        : Math.abs(source.voltage) > 0.01;
    }
    return isBoardComponentType(node.type) && (boardPoweredMap[node.id] ?? node.properties?.boardPowered !== false);
  });
}

function addMeterElements(
  elements: MNAElement[],
  elementToComponent: Map<string, string>,
  meterId: string,
  nodeA: number,
  nodeB: number,
  mode: MeterMeasurementMode,
  resistanceTestAllowed: boolean,
  nextExtraNode: number,
  componentId?: string,
): number {
  const voltageId = meterId === 'virtual' ? 'vm_virtual' : `vm_${meterId}`;
  const currentId = meterId === 'virtual' ? 'mm_virtual' : `mm_${meterId}`;
  const resistanceSourceId = meterId === 'virtual' ? 'vs_vm_ohm_virtual' : `vs_mm_ohm_${meterId}`;
  const resistanceSeriesId = meterId === 'virtual' ? 'r_vm_ohm_virtual' : `r_mm_ohm_${meterId}`;
  const mapToComponent = (id: string) => {
    if (componentId) elementToComponent.set(id, componentId);
  };

  if (mode === 'CURRENT') {
    elements.push({
      id: currentId,
      type: 'RESISTOR',
      nodeA,
      nodeB,
      value: SIMULATION_MODELS.meter.currentShuntResistance,
    });
    mapToComponent(currentId);
    return nextExtraNode;
  }

  if (mode === 'RESISTANCE' && resistanceTestAllowed) {
    const testNode = nextExtraNode++;
    elements.push({
      id: resistanceSourceId,
      type: 'VOLTAGE_SOURCE',
      nodeA,
      nodeB: testNode,
      value: SIMULATION_MODELS.meter.resistanceTestVoltage,
    });
    elements.push({
      id: resistanceSeriesId,
      type: 'RESISTOR',
      nodeA: testNode,
      nodeB,
      value: SIMULATION_MODELS.meter.resistanceTestSeriesResistance,
    });
    mapToComponent(resistanceSourceId);
    mapToComponent(resistanceSeriesId);
    return nextExtraNode;
  }

  // Voltage mode — and resistance mode while an external supply is present —
  // keeps a high-impedance probe path and never injects test energy.
  elements.push({
    id: voltageId,
    type: 'RESISTOR',
    nodeA,
    nodeB,
    value: SIMULATION_MODELS.meter.voltageInputResistance,
  });
  mapToComponent(voltageId);
  return nextExtraNode;
}

// ── Helper: check if a component type is a board / MCU ──────────────────

function isBoard(type: string): boolean {
  return isBoardComponentType(type);
}

function boardLogicVoltage(type: string): number {
  return getBoardLogicVoltage(type);
}

function isBoardGroundPin(pin: { id: string; name: string }): boolean {
  return /(^|\W)(GND|GROUND)(\W|$)/i.test(`${pin.id} ${pin.name}`);
}

function addBoardConnections(node: CanvasNode, uf: UnionFind) {
  if (!isBoard(node.type)) return;

  const groundPins = (node.pins || []).filter(isBoardGroundPin);
  for (let i = 1; i < groundPins.length; i++) {
    uf.union(pinKey(node.id, groundPins[0].id), pinKey(node.id, groundPins[i].id));
  }
}

function addLegacyPinAliases(node: CanvasNode, uf: UnionFind) {
  const join = (canonical: string, aliases: string[]) => {
    const canonicalKey = pinKey(node.id, canonical);
    uf.add(canonicalKey);
    for (const alias of aliases) {
      uf.union(canonicalKey, pinKey(node.id, alias));
    }
  };

  if (node.type === 'RESISTOR') {
    join('p1', ['pin1']);
    join('p2', ['pin2']);
  }

  if (node.type === 'INDUCTOR' || node.type === 'THERMISTOR_NTC' || node.type === 'THERMISTOR') {
    join('p1', ['pin1', 'positive']);
    join('p2', ['pin2', 'negative']);
  }

  if (node.type === 'TRANSFORMER') {
    join('primary1', ['p1', 'primary', 'input1']);
    join('primary2', ['p2', 'primary_return', 'input2']);
    join('secondary1', ['s1', 'secondary', 'output1']);
    join('secondary2', ['s2', 'secondary_return', 'output2']);
  }

  if (node.type === 'DIODE' || node.type === 'ZENER_DIODE' || node.type === 'SCHOTTKY_DIODE') {
    join('anode', ['a', 'positive', 'p1', '1']);
    join('cathode', ['k', 'negative', 'p2', '2']);
  }

  if (node.type === 'NMOS' || node.type === 'PMOS') {
    join('gate', ['g']);
    join('drain', ['d']);
    join('source', ['s']);
  }

  if (node.type === 'OPAMP_IDEAL' || node.type === 'OPAMP_LM358') {
    join('in_plus', ['plus', 'non_inverting', '+']);
    join('in_minus', ['minus', 'inverting', '-']);
    join('out', ['output']);
    join('vcc', ['vdd', 'supply+']);
    join('gnd', ['vss', 'supply-', 'ground']);
  }

  if (node.type === 'BRIDGE_RECTIFIER') {
    join('ac1', ['~1', 'input1']);
    join('ac2', ['~2', 'input2']);
    join('positive', ['+', 'pos', 'dc+']);
    join('negative', ['-', 'neg', 'dc-']);
  }

  if (node.type.includes('CAPACITOR')) {
    join('pos', ['p1', 'pin1', 'positive']);
    join('neg', ['p2', 'pin2', 'negative']);
  }

  if (node.type === 'MOTOR_DC') {
    join('m1', ['positive', 'pos', 'plus']);
    join('m2', ['negative', 'neg', 'minus']);
  }

  if (node.type === 'SERVO_MOTOR' || node.type === 'MOTOR_SERVO') {
    join('sig', ['signal', 'p1', '1']);
    join('vcc', ['5v', 'p2', '2', 'power']);
    join('gnd', ['ground', 'p3', '3']);
  }

  if (node.type === 'BUZZER') {
    join('pos', ['p1', 'positive', 'plus', '+', '1', 'sig', 'signal']);
    join('neg', ['p2', 'negative', 'minus', '-', '2', 'gnd']);
  }

  if (node.type === 'DISPLAY_7SEG') {
    join('com', ['common', 'gnd', 'ground', 'com1', 'com2']);
  }

  if (node.type === 'RELAY_SINGLE' || node.type === 'RELAY_SPDT') {
    join('in', ['coil1', 'in1', 'sig', 'signal']);
    join('gnd', ['coil2', 'ground', '-']);
  }

  if (node.type === 'RELAY_2CH' || node.type === 'RELAY_4CH') {
    const channels = node.type === 'RELAY_2CH' ? 2 : 4;
    for (let channel = 1; channel <= channels; channel++) {
      join(`in${channel}`, [`coil${channel}`]);
    }
  }

  if (node.type === 'MOTOR_STEPPER') {
    join('in1', ['a1']);
    join('in2', ['a2']);
    join('in3', ['b1']);
    join('in4', ['b2']);
    join('vcc', ['power', 'positive', 'pos', '5v']);
    join('gnd', ['ground', 'negative', 'neg', '0v']);
  }

  if (['BATTERY_9V', 'BATTERY_AA', 'POWER_SUPPLY', 'DC_SOURCE_3V3', 'DC_SOURCE_5V', 'DC_SOURCE_12V', 'AC_FUNCTION_GENERATOR'].includes(node.type)) {
    join('positive', ['pos', 'plus', 'vout', 'vcc', '+']);
    join('negative', ['neg', 'minus', 'gnd', 'ground', '-']);
  }

  if (node.type === 'GROUND') {
    join('gnd', ['ground', 'negative', 'neg', '-']);
  }
}

function boardIoPinNumber(pin: { id: string; name: string; type?: string }): string {
  return getBoardPinNumber(pin);
}

function mcuDriverSuffix(pinNumber: string): string {
  return pinNumber.toUpperCase().startsWith('A')
    ? `a${pinNumber.slice(1)}`
    : `d${pinNumber}`;
}

function getAbsolutePinPos(node: { x: number; y: number; rotation?: number }, pin: { x: number; y: number }) {
  const rotationRad = ((node.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: node.x + pin.x * cos - pin.y * sin,
    y: node.y + pin.x * sin + pin.y * cos,
  };
}

// ── Breadboard Row Grouping ─────────────────────────────────────────────

function addBreadboardConnections(node: CanvasNode, uf: UnionFind) {
  if (node.type !== 'BREADBOARD') return;

  // Group pins by row letter + column number
  // Top terminal strip: rows A-E share connections per column
  // Bottom terminal strip: rows F-J share connections per column
  // Power rails: vcc_top_*, gnd_top_*, vcc_bottom_*, gnd_bottom_* are continuous

  const topRows = ['a', 'b', 'c', 'd', 'e'];
  const bottomRows = ['f', 'g', 'h', 'i', 'j'];
  const columns = 30;

  // Connect pins in same column within top strip (A-E)
  for (let col = 1; col <= columns; col++) {
    const pins = topRows.map((row) => pinKey(node.id, `${row}${col}`));
    for (let i = 1; i < pins.length; i++) {
      uf.union(pins[0], pins[i]);
    }
  }

  // Connect pins in same column within bottom strip (F-J)
  for (let col = 1; col <= columns; col++) {
    const pins = bottomRows.map((row) => pinKey(node.id, `${row}${col}`));
    for (let i = 1; i < pins.length; i++) {
      uf.union(pins[0], pins[i]);
    }
  }

  // Connect power rails (all + pins together, all - pins together)
  for (let col = 1; col <= columns; col++) {
    if (col > 1) {
      uf.union(
        pinKey(node.id, `vcc_top_1`),
        pinKey(node.id, `vcc_top_${col}`)
      );
      uf.union(
        pinKey(node.id, `gnd_top_1`),
        pinKey(node.id, `gnd_top_${col}`)
      );
      uf.union(
        pinKey(node.id, `vcc_bottom_1`),
        pinKey(node.id, `vcc_bottom_${col}`)
      );
      uf.union(
        pinKey(node.id, `gnd_bottom_1`),
        pinKey(node.id, `gnd_bottom_${col}`)
      );
    }
  }

}

// ── Main Builder ────────────────────────────────────────────────────────

/**
 * Build an MNA circuit from the canvas state.
 *
 * @param nodes   All canvas nodes
 * @param wires   All wires connecting pins
 * @param pinStates  MCU pin output states from the code interpreter
 *                   Maps pin name (e.g. "13", "A0") to voltage (0 or 5)
 */
export function buildMNACircuit(
  nodes: CanvasNode[],
  wires: Wire[],
  pinStates: Record<string, number> = {},
  pinModes: Record<string, string> = {},
  boardPoweredMap: Record<string, boolean> = {},
  virtualMeter?: VirtualMeterConfiguration,
  cachedTopology?: MNATopology,
): MNACircuit {
  const currentConnectivitySignature = connectivitySignature(nodes, wires);
  const reusableTopology = cachedTopology && cachedTopology.connectivitySignature === currentConnectivitySignature
    ? cachedTopology
    : undefined;
  const buildMetrics: MNABuildMetrics = {
    topologyCacheHit: Boolean(reusableTopology),
    connectivityDiscoveryPassCount: reusableTopology ? 0 : 1,
    registeredPinCount: 0,
    wireUnionCount: 0,
    breadboardProximityComparisonCount: 0,
  };
  const uf = new UnionFind();
  const elements: MNAElement[] = [];
  const elementToComponent = reusableTopology
    ? new Map(reusableTopology.elementToComponent)
    : new Map<string, string>();
  const scopeChannels: Record<string, number> = {};
  const boardForLogic = nodes.find((node) => isBoardComponentType(node.type));
  const logicVoltage = boardForLogic ? boardLogicVoltage(boardForLogic.type) : 5;

  let pinToMNANode: Map<string, number>;
  let nextNode = 1; // 0 is reserved for ground

  if (!reusableTopology) {
  // 1. Register all pins in Union-Find
  for (const node of nodes) {
    if (!node.pins) continue;
    for (const pin of node.pins) {
      uf.add(pinKey(node.id, pin.id));
      buildMetrics.registeredPinCount += 1;
    }
    // Auto-connect breadboard internal rows
    addBreadboardConnections(node, uf);
    addBoardConnections(node, uf);
    addLegacyPinAliases(node, uf);
  }

  // 2. Merge pins connected by wires
  for (const wire of wires) {
    buildMetrics.wireUnionCount += 1;
    uf.union(
      pinKey(wire.fromNodeId, wire.fromPinId),
      pinKey(wire.toNodeId, wire.toPinId)
    );
  }

  // 2b. Merge overlapping breadboard pins (proximity connection)
  const breadboards = nodes.filter((n) => n.type === 'BREADBOARD');
  for (const bb of breadboards) {
    for (const pinBB of bb.pins || []) {
      const posBB = getAbsolutePinPos(bb, pinBB);
      for (const node of nodes) {
        if (node.id === bb.id || node.type === 'BREADBOARD') continue;
        for (const pinNode of node.pins || []) {
          buildMetrics.breadboardProximityComparisonCount += 1;
          const posNode = getAbsolutePinPos(node, pinNode);
          const dx = posNode.x - posBB.x;
          const dy = posNode.y - posBB.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 64) { // 8 pixels threshold (8^2 = 64)
            uf.union(pinKey(bb.id, pinBB.id), pinKey(node.id, pinNode.id));
          }
        }
      }
    }
  }

  // 3. Assign MNA node indices to each group. MNA needs one reference net,
  // but a GND/COM label is not a wire. Disconnected ground-labelled pins stay
  // electrically separate.
  const groups = uf.groups();
  const rootToMNANode = new Map<string, number>();
  const referencePin = nodes
    .filter((node) => isBoard(node.type))
    .flatMap((node) => (node.pins || []).map((pin) => ({ node, pin })))
    .find(({ pin }) => isBoardGroundPin(pin))
    ?? nodes
      .flatMap((node) => (node.pins || []).map((pin) => ({ node, pin })))
      .find(({ pin }) => pin.type === 'ground' || /(^|\W)(GND|GROUND)(\W|$)/i.test(`${pin.id} ${pin.name}`));

  const referenceRoot = referencePin
    ? uf.find(pinKey(referencePin.node.id, referencePin.pin.id))
    : groups.keys().next().value as string | undefined;
  if (referenceRoot) rootToMNANode.set(referenceRoot, 0);

  // Second pass: assign indices to non-ground groups
  for (const [root] of groups) {
    if (!rootToMNANode.has(root)) {
      rootToMNANode.set(root, nextNode++);
    }
  }

  // Build pin → MNA node map
  pinToMNANode = new Map<string, number>();
  for (const [root, members] of groups) {
    const mnaNode = rootToMNANode.get(root) ?? 0;
    for (const member of members) {
      pinToMNANode.set(member, mnaNode);
    }
  }

  } else {
    pinToMNANode = new Map(reusableTopology.pinToMNANode);
  }

  // Internal nodes are allocated deterministically after the external pin
  // range. Starting after cachedTopology.numNodes would append a fresh range
  // on every value refresh and falsely turn unchanged topology into a rebuild.
  let highestExternalNode = 0;
  for (const nodeIndex of pinToMNANode.values()) {
    highestExternalNode = Math.max(highestExternalNode, nodeIndex);
  }
  let nextExtraNode = reusableTopology ? highestExternalNode + 1 : nextNode;

  // Helper to get MNA node for a component's pin
  const nodeFor = (componentId: string, pinId: string): number => {
    return pinToMNANode.get(pinKey(componentId, pinId)) ?? 0;
  };

  const wireTouchesPin = (componentId: string, test: (pinId: string) => boolean): boolean =>
    wires.some((wire) =>
      (wire.fromNodeId === componentId && test(wire.fromPinId)) ||
      (wire.toNodeId === componentId && test(wire.toPinId))
    );

  // 4. Create MNA elements from canvas components
  let vsCounter = 0;
  const genericComponentIds = reusableTopology
    ? new Set(reusableTopology.genericComponentIds)
    : new Set<string>();
  const resistanceTestAllowed = !hasActiveExternalPower(nodes, boardPoweredMap);

  for (const node of nodes) {
    const props = node.properties || {};
    const elementsBeforeNode = elements.length;

    // Skip breadboards (they only provide connectivity)
    if (node.type === 'BREADBOARD') continue;

    // Standalone sources establish their own positive/negative potential and
    // therefore do not require an MCU board. The negative terminal becomes
    // the reference net when it is connected to GND (or is the only ground
    // labelled net in the circuit).
    if (isStandaloneSourceType(node.type)) {
      const source = sourceDefinition(node.type, props);
      const sourceId = `vs_source_${node.id}`;
      const sourceInternalNode = nextExtraNode++;
      const sourceElement: MNAElement = {
        id: sourceId,
        type: 'VOLTAGE_SOURCE',
        nodeA: sourceInternalNode,
        nodeB: nodeFor(node.id, 'negative'),
        value: source.voltage,
      };
      if (source.isAc) {
        sourceElement.waveform = {
          isAc: source.isAc,
          amplitude: source.amplitude,
          frequencyHz: source.frequencyHz,
          offset: source.offset,
          waveform: source.waveform,
        };
      }
      elements.push(sourceElement);
      elementToComponent.set(sourceId, node.id);
      vsCounter++;
      const sourceSwitchId = `r_source_switch_${node.id}`;
      elements.push({
        id: sourceSwitchId,
        type: 'RESISTOR',
        nodeA: sourceInternalNode,
        nodeB: nodeFor(node.id, 'positive'),
        value: source.enabled
          ? SIMULATION_MODELS.circuit.closedContactResistance
          : SIMULATION_MODELS.circuit.openCircuitResistance,
      });
      elementToComponent.set(sourceSwitchId, node.id);
      continue;
    }

    // A ground symbol contributes a named reference net only. The actual MNA
    // reference is assigned above, so no artificial zero-volt source is
    // needed and parallel ground symbols remain ideal connections.
    if (node.type === 'GROUND') continue;

    // ── MCU Boards (Arduino, ESP, etc.) ──
    if (isBoard(node.type)) {
      const isPowered = boardPoweredMap[node.id] !== false;
      const logicVoltage = boardLogicVoltage(node.type);
      const groundPin = (node.pins || []).find(isBoardGroundPin);
      const boardGroundNode = groundPin ? nodeFor(node.id, groundPin.id) : 0;

      // Power pins as switchable voltage sources
      for (const pin of node.pins || []) {
        const label = pin.name.toUpperCase();
        const railVoltage = getBoardPowerVoltage(node.type, pin);
        if (railVoltage !== null) {
          const internalNode = nextExtraNode++;
          const srcId = `vs_${node.id}_${pin.id}_src`;
          elements.push({
            id: srcId,
            type: 'VOLTAGE_SOURCE',
            nodeA: internalNode,
            nodeB: boardGroundNode,
            value: railVoltage,
          });
          elementToComponent.set(srcId, node.id);
          vsCounter++;

          const swId = `r_board_pwr_${node.id}_${pin.id.toLowerCase()}`;
          elements.push({
            id: swId,
            type: 'RESISTOR',
            nodeA: internalNode,
            nodeB: nodeFor(node.id, pin.id),
            value: isPowered ? 0.01 : 1e8,
          });
          elementToComponent.set(swId, node.id);
        } else if (label === 'VIN') {
          const id = `r_vin_load_${node.id}`;
          elements.push({
            id,
            type: 'RESISTOR',
            nodeA: nodeFor(node.id, pin.id),
            nodeB: boardGroundNode,
            value: 100000,
          });
          elementToComponent.set(id, node.id);
        }
      }

      // MCU I/O pins as switchable impedance drivers.
      for (const pin of node.pins || []) {
        const pinNum = boardIoPinNumber(pin);
        if (!pinNum) continue;

        const suffix = mcuDriverSuffix(pinNum);
        const mode = pinModes[pinNum] || 'INPUT';
        const isOutput = mode === 'OUTPUT' || mode === 'PWM';
        const isPullup = mode === 'INPUT_PULLUP';
        const requestedVoltage = pinStates[pinNum] ?? (isPullup ? logicVoltage : 0);
        const voltage = Math.max(0, Math.min(logicVoltage, requestedVoltage));

        const pinNode = nodeFor(node.id, pin.id);
        if (pinNode === 0) continue;

        const internalNode = nextExtraNode++;
        const srcId = `vs_mcu_${node.id}_${suffix}_src`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: internalNode,
          nodeB: boardGroundNode,
          value: voltage,
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;

        const swId = `r_mcu_pin_${node.id}_${suffix}`;
        const resistance = isPowered
          ? isOutput ? 40 : isPullup ? 40000 : 1e8
          : 1e8;
        elements.push({
          id: swId,
          type: 'RESISTOR',
          nodeA: internalNode,
          nodeB: pinNode,
          value: resistance,
        });
        elementToComponent.set(swId, node.id);
      }
      continue;
    }

    // ── Resistor ──
    if (node.type === 'RESISTOR') {
      const resistance = Math.max(0.01, resistanceOhms(props.resistance, 220));
      const id = `r_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: resistance,
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Capacitor (all types) ──
    if (node.type.includes('CAPACITOR')) {
      const defaultCapacitance = node.type === 'CERAMIC_CAPACITOR'
        ? 100e-9
        : node.type === 'ELECTROLYTIC_CAPACITOR'
          ? 10e-6
          : 1e-6;
      // Numeric values are stored in farads. Strings may use engineering
      // suffixes such as 100nF, 1uF, or 10mF.
      const capacitance = capacitanceFarads(props.capacitance, defaultCapacitance);
      const id = `c_${node.id}`;
      const pinA = node.pins?.find((p) => p.id === 'pos' || p.id === 'p1');
      const pinB = node.pins?.find((p) => p.id === 'neg' || p.id === 'p2');
      elements.push({
        id,
        type: 'CAPACITOR',
        nodeA: nodeFor(node.id, pinA?.id || 'pos'),
        nodeB: nodeFor(node.id, pinB?.id || 'neg'),
        value: capacitance,
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Diode ──
    if (node.type === 'ZENER_DIODE' || node.type === 'SCHOTTKY_DIODE') {
      const isSchottky = node.type === 'SCHOTTKY_DIODE';
      const id = `d_${node.id}`;
      elements.push({
        id,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'anode'),
        nodeB: nodeFor(node.id, 'cathode'),
        value: 0,
        forwardVoltage: Math.max(0.1, numericProperty(
          props.forwardVoltage,
          isSchottky ? 0.3 : 0.7,
        )),
        seriesResistance: diodeSeriesResistance(props),
        reverseResistance: SIMULATION_MODELS.diode.reverseResistance,
        zenerVoltage: isSchottky ? undefined : Math.max(0.1, numericProperty(props.zenerVoltage, 5.1)),
        zenerResistance: isSchottky ? undefined : Math.max(0.1, resistanceOhms(props.zenerResistance, 8)),
        saturationCurrent: numericProperty(props.saturationCurrent, SIMULATION_MODELS.diode.saturationCurrent),
        thermalVoltage: numericProperty(props.thermalVoltage, SIMULATION_MODELS.diode.thermalVoltage),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    if (node.type === 'DIODE') {
      const id = `d_${node.id}`;
      elements.push({
        id,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'anode'),
        nodeB: nodeFor(node.id, 'cathode'),
        value: 0, // Not used for diodes
        forwardVoltage: Math.max(0.1, numericProperty(props.forwardVoltage, 0.7)),
        seriesResistance: diodeSeriesResistance(props),
        reverseResistance: SIMULATION_MODELS.diode.reverseResistance,
        saturationCurrent: numericProperty(props.saturationCurrent, SIMULATION_MODELS.diode.saturationCurrent),
        thermalVoltage: numericProperty(props.thermalVoltage, SIMULATION_MODELS.diode.thermalVoltage),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Inductor ──
    if (node.type === 'INDUCTOR') {
      const id = `l_${node.id}`;
      elements.push({
        id,
        type: 'INDUCTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: inductanceHenrys(props.inductance, 10e-3),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // Coupled-inductor transformer. Backward-Euler mutual inductance keeps
    // AC transfer and startup transients stable without inventing a DC source.
    if (node.type === 'TRANSFORMER') {
      const id = `xfmr_${node.id}`;
      const turnsRatio = Math.max(1e-6, numericProperty(props.turnsRatio ?? props.ratio, SIMULATION_MODELS.transformer.turnsRatio));
      const primaryInductance = inductanceHenrys(props.primaryInductance ?? props.inductance, SIMULATION_MODELS.transformer.primaryInductance_H);
      const secondaryInductance = inductanceHenrys(
        props.secondaryInductance,
        primaryInductance * turnsRatio * turnsRatio,
      );
      elements.push({
        id,
        type: 'TRANSFORMER',
        nodeA: nodeFor(node.id, 'primary1'),
        nodeB: nodeFor(node.id, 'primary2'),
        controlNode: nodeFor(node.id, 'secondary1'),
        controlNode2: nodeFor(node.id, 'secondary2'),
        value: primaryInductance,
        secondaryInductance,
        turnsRatio,
        coupling: Math.max(0.5, Math.min(0.9999, numericProperty(props.coupling, SIMULATION_MODELS.transformer.coupling))),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Bridge rectifier (four directional junctions) ──
    if (node.type === 'BRIDGE_RECTIFIER') {
      const ac1 = nodeFor(node.id, 'ac1');
      const ac2 = nodeFor(node.id, 'ac2');
      const positive = nodeFor(node.id, 'positive');
      const negative = nodeFor(node.id, 'negative');
      const forwardVoltage = Math.max(0.1, numericProperty(props.forwardVoltage, 0.7));
      const pairs: Array<[string, number, number]> = [
        ['ac1_pos', ac1, positive],
        ['ac2_pos', ac2, positive],
        ['negative_ac1', negative, ac1],
        ['negative_ac2', negative, ac2],
      ];
      pairs.forEach(([suffix, anode, cathode]) => {
        const id = `bridge_${suffix}_${node.id}`;
        elements.push({
          id,
          type: 'DIODE',
          nodeA: anode,
          nodeB: cathode,
          value: 0,
          forwardVoltage,
          seriesResistance: diodeSeriesResistance(props),
          reverseResistance: SIMULATION_MODELS.diode.reverseResistance,
        });
        elementToComponent.set(id, node.id);
      });
      continue;
    }

    // ── RGB LED (Three parallel channels to GND) ──
    if (node.type === 'LED_RGB') {
      const rPin = node.pins?.find(p => p.id === 'r');
      const gPin = node.pins?.find(p => p.id === 'g');
      const bPin = node.pins?.find(p => p.id === 'b');
      const gndPin = node.pins?.find(p => p.id === 'gnd' || p.id === 'cathode');
      const nodeGnd = gndPin ? nodeFor(node.id, gndPin.id) : 0;

      const channels = [
        { pin: rPin, key: 'r', color: 'red' as const },
        { pin: gPin, key: 'g', color: 'green' as const },
        { pin: bPin, key: 'b', color: 'blue' as const },
      ];
      const hasChannel = channels.some((channel) => Boolean(channel.pin));

      for (const ch of channels) {
        if (ch.pin) {
          const nodeAnode = nodeFor(node.id, ch.pin.id);

          // Diode model
          const diodeId = `led_rgb_diode_${ch.key}_${node.id}`;
          elements.push({
            id: diodeId,
            type: 'DIODE',
            nodeA: nodeAnode,
            nodeB: nodeGnd,
            value: 0,
            forwardVoltage: ledForwardVoltage(ch.color, props),
            seriesResistance: ledSeriesResistance(props),
            reverseResistance: SIMULATION_MODELS.diode.reverseResistance,
            maxCurrent: ledMaximumCurrent_mA(props) / 1000,
          });
          elementToComponent.set(diodeId, node.id);
        }
      }
      if (hasChannel) continue;
    }

    // ── LED (modeled as diode + Vf series source) ──
    if (node.type.includes('LED')) {
      const anodePin = node.pins?.find((p) =>
        /anode|\+|pos/i.test(`${p.id} ${p.name}`)
      );
      const cathodePin = node.pins?.find((p) =>
        /cathode|-|neg|gnd/i.test(`${p.id} ${p.name}`)
      );
      if (anodePin && cathodePin) {
        const nodeAnode = nodeFor(node.id, anodePin.id);
        const nodeCathode = nodeFor(node.id, cathodePin.id);

        const diodeId = `led_${node.id}`;
        elements.push({
          id: diodeId,
          type: 'DIODE',
          nodeA: nodeAnode,
          nodeB: nodeCathode,
          value: 0,
          forwardVoltage: ledForwardVoltage('red', props),
          seriesResistance: ledSeriesResistance(props),
          reverseResistance: SIMULATION_MODELS.diode.reverseResistance,
          maxCurrent: ledMaximumCurrent_mA(props) / 1000,
        });
        elementToComponent.set(diodeId, node.id);
        continue;
      }
    }

    // ── PUSH BUTTON / BUTTON ──
    if (node.type === 'PUSH_BUTTON' || node.type === 'BUTTON') {
      const isPressed = Boolean(props.isPressed);
      const swVal = isPressed ? 0.01 : 1e8;

      // Internal short 1A-1B
      const idInt1 = `r_btn_int1_${node.id}`;
      elements.push({
        id: idInt1,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1a'),
        nodeB: nodeFor(node.id, 'p1b'),
        value: 0.01,
      });
      elementToComponent.set(idInt1, node.id);

      // Internal short 2A-2B
      const idInt2 = `r_btn_int2_${node.id}`;
      elements.push({
        id: idInt2,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p2a'),
        nodeB: nodeFor(node.id, 'p2b'),
        value: 0.01,
      });
      elementToComponent.set(idInt2, node.id);

      // Switched path between 1A and 2A
      const idSw = `r_btn_sw_${node.id}`;
      elements.push({
        id: idSw,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1a'),
        nodeB: nodeFor(node.id, 'p2a'),
        value: swVal,
      });
      elementToComponent.set(idSw, node.id);
      continue;
    }

    // ── SWITCH SPST ──
    if (node.type === 'SWITCH_SPST') {
      const isClosed = Boolean(props.isClosed);
      const rClosed = isClosed ? 0.01 : 1e8;

      const idSw = `r_sw_${node.id}`;
      elements.push({
        id: idSw,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: rClosed,
      });
      elementToComponent.set(idSw, node.id);
      continue;
    }

    // ── Bare SPDT relay ──
    if (node.type === 'RELAY_SPDT') {
      const isActive = relayChannelActive(props);

      // Coil resistance
      const idCoil = `r_coil_${node.id}`;
      elements.push({
        id: idCoil,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'coil1'),
        nodeB: nodeFor(node.id, 'coil2'),
        value: SIMULATION_MODELS.relay.coilResistance,
      });
      elementToComponent.set(idCoil, node.id);

      // NO contact
      const idNO = `r_contact_no_${node.id}`;
      elements.push({
        id: idNO,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'com'),
        nodeB: nodeFor(node.id, 'no'),
        value: isActive
          ? SIMULATION_MODELS.relay.contactResistance
          : SIMULATION_MODELS.relay.openContactResistance,
      });
      elementToComponent.set(idNO, node.id);

      // NC contact (if nc pin exists)
      const ncPin = node.pins?.find(p => p.id === 'nc');
      if (ncPin) {
        const idNC = `r_contact_nc_${node.id}`;
        elements.push({
          id: idNC,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, 'com'),
          nodeB: nodeFor(node.id, 'nc'),
          value: isActive
            ? SIMULATION_MODELS.relay.openContactResistance
            : SIMULATION_MODELS.relay.contactResistance,
        });
        elementToComponent.set(idNC, node.id);
      }
      continue;
    }

    // ── Powered relay modules ──
    if (node.type === 'RELAY_SINGLE' || node.type === 'RELAY_2CH' || node.type === 'RELAY_4CH') {
      const legacySingleRelayCoil = node.type === 'RELAY_SINGLE'
        && wireTouchesPin(node.id, (pinId) => pinId === 'coil1' || pinId === 'coil2');

      if (legacySingleRelayCoil) {
        const isActive = relayChannelActive(props);

        const coilId = `r_coil_${node.id}`;
        elements.push({
          id: coilId,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, 'coil1'),
          nodeB: nodeFor(node.id, 'coil2'),
          value: SIMULATION_MODELS.relay.coilResistance,
        });
        elementToComponent.set(coilId, node.id);

        const noId = `r_contact_no_${node.id}`;
        elements.push({
          id: noId,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, 'com'),
          nodeB: nodeFor(node.id, 'no'),
          value: isActive
            ? SIMULATION_MODELS.relay.contactResistance
            : SIMULATION_MODELS.relay.openContactResistance,
        });
        elementToComponent.set(noId, node.id);

        // The legacy two-terminal relay pinout has no NC terminal. Never
        // turn a missing pin into MNA node 0: that silently shorts COM to
        // ground while the relay is idle and corrupts all load currents.
        if (node.pins?.some((pin) => pin.id === 'nc')) {
          const ncId = `r_contact_nc_${node.id}`;
          elements.push({
            id: ncId,
            type: 'RESISTOR',
            nodeA: nodeFor(node.id, 'com'),
            nodeB: nodeFor(node.id, 'nc'),
            value: isActive
              ? SIMULATION_MODELS.relay.openContactResistance
              : SIMULATION_MODELS.relay.contactResistance,
          });
          elementToComponent.set(ncId, node.id);
        }
        continue;
      }

      const channels = node.type === 'RELAY_SINGLE' ? 1 : node.type === 'RELAY_2CH' ? 2 : 4;
      const nodeGnd = nodeFor(node.id, 'gnd');
      const nodeVcc = nodeFor(node.id, 'vcc');
      const activeLow = String(props.triggerType || 'Active Low').toLowerCase() !== 'active high';

      const idleId = `r_relay_idle_${node.id}`;
      elements.push({
        id: idleId,
        type: 'RESISTOR',
        nodeA: nodeVcc,
        nodeB: nodeGnd,
        value: SIMULATION_MODELS.relay.idleResistance,
      });
      elementToComponent.set(idleId, node.id);

      for (let ch = 1; ch <= channels; ch++) {
        const inputId = channels === 1 ? 'in' : `in${ch}`;
        const isActive = relayChannelActive(props, ch);

        const inputBiasId = `r_relay_input_${ch}_${node.id}`;
        elements.push({
          id: inputBiasId,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, inputId),
          nodeB: activeLow ? nodeVcc : nodeGnd,
          value: SIMULATION_MODELS.relay.inputResistance,
        });
        elementToComponent.set(inputBiasId, node.id);

        const coilId = `r_relay_coil_${ch}_${node.id}`;
        elements.push({
          id: coilId,
          type: 'RESISTOR',
          nodeA: nodeVcc,
          nodeB: nodeGnd,
          value: isActive
            ? SIMULATION_MODELS.relay.coilResistance
            : SIMULATION_MODELS.relay.openContactResistance,
        });
        elementToComponent.set(coilId, node.id);

        const suffix = channels === 1 ? '' : String(ch);
        const noId = `r_contact_no${suffix}_${node.id}`;
        elements.push({
          id: noId,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, `com${suffix}`),
          nodeB: nodeFor(node.id, `no${suffix}`),
          value: isActive
            ? SIMULATION_MODELS.relay.contactResistance
            : SIMULATION_MODELS.relay.openContactResistance,
        });
        elementToComponent.set(noId, node.id);

        const ncPinId = `nc${suffix}`;
        if (node.pins?.some((pin) => pin.id === ncPinId)) {
          const ncId = `r_contact_nc${suffix}_${node.id}`;
          elements.push({
            id: ncId,
            type: 'RESISTOR',
            nodeA: nodeFor(node.id, `com${suffix}`),
            nodeB: nodeFor(node.id, ncPinId),
            value: isActive
              ? SIMULATION_MODELS.relay.openContactResistance
              : SIMULATION_MODELS.relay.contactResistance,
          });
          elementToComponent.set(ncId, node.id);
        }
      }
      continue;
    }

    // ── 7-Segment Display (segment diodes to com) ──
    if (node.type === 'DISPLAY_LCD_I2C' || node.type === 'LCD_16X2' || node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY') {
      const vccPin = node.pins?.find((pin) => /\b(vcc|vdd|5v|3v3)\b/i.test(`${pin.id} ${pin.name}`));
      const gndPin = node.pins?.find((pin) => /\b(gnd|vss)\b/i.test(`${pin.id} ${pin.name}`));
      if (vccPin && gndPin) {
        const vccNode = nodeFor(node.id, vccPin.id);
        const gndNode = nodeFor(node.id, gndPin.id);
        const isOled = node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY';
        const backlightOn = props.lcdBacklight !== false && String(props.backlight || 'On').toLowerCase() !== 'off';

        const drawId = `r_display_power_${node.id}`;
        elements.push({
          id: drawId,
          type: 'RESISTOR',
          nodeA: vccNode,
          nodeB: gndNode,
          value: isOled ? 330 : backlightOn ? 250 : 1_000,
        });
        elementToComponent.set(drawId, node.id);

        for (const busPin of ['sda', 'scl', 'rs', 'en', 'd4', 'd5', 'd6', 'd7']) {
          if (!node.pins?.some((pin) => pin.id === busPin)) continue;
          const busId = `r_display_bus_${busPin}_${node.id}`;
          elements.push({
            id: busId,
            type: 'RESISTOR',
            nodeA: nodeFor(node.id, busPin),
            nodeB: vccNode,
            value: 10_000,
          });
          elementToComponent.set(busId, node.id);
        }
      }
      continue;
    }

    if (node.type === 'DISPLAY_7SEG') {
      const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
      const comNode = nodeFor(node.id, 'com');

      for (const seg of segments) {
        const pin = node.pins?.find(p => p.id === seg);
        if (pin) {
          const diodeId = `led_7seg_${seg}_${node.id}`;
          elements.push({
            id: diodeId,
            type: 'DIODE',
            nodeA: nodeFor(node.id, pin.id),
            nodeB: comNode,
            value: 0,
            forwardVoltage: numericProperty(props.forwardVoltage, SIMULATION_MODELS.led.forwardVoltage),
            seriesResistance: ledSeriesResistance(props),
            reverseResistance: SIMULATION_MODELS.diode.reverseResistance,
          });
          elementToComponent.set(diodeId, node.id);
        }
      }
      continue;
    }

    // ── PIR Motion Sensor (Active Voltage Source on Motion) ──
    if (node.type === 'SENSOR_PIR' || node.type === 'PIR_SENSOR') {
      const nodeGnd = nodeFor(node.id, 'gnd');
      const internalOutNode = nextExtraNode++;

      const idDraw = `r_power_draw_${node.id}`;
      elements.push({
        id: idDraw,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'vcc'),
        nodeB: nodeGnd,
        value: 10000,
      });
      elementToComponent.set(idDraw, node.id);

      const idOut = `vs_pir_${node.id}`;
      const hasMotion = Boolean(props.motionDetected);
      elements.push({
        id: idOut,
        type: 'VOLTAGE_SOURCE',
        nodeA: internalOutNode,
        nodeB: nodeGnd,
        value: hasMotion ? logicVoltage : 0,
      });
      elementToComponent.set(idOut, node.id);
      vsCounter++;

      const outResistanceId = `r_pir_out_${node.id}`;
      elements.push({
        id: outResistanceId,
        type: 'RESISTOR',
        nodeA: internalOutNode,
        nodeB: nodeFor(node.id, 'out'),
        value: props.powered ? 100 : 1e8,
      });
      elementToComponent.set(outResistanceId, node.id);
      continue;
    }

    // ── Bare bipolar stepper motor ──
    if (node.type === 'STEPPER_MOTOR') {
      const idCoilA = `r_coil_a_${node.id}`;
      elements.push({
        id: idCoilA,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'a1'),
        nodeB: nodeFor(node.id, 'a2'),
        value: Math.max(0.1, numericProperty(props.windingResistance, SIMULATION_MODELS.stepper.windingResistance)),
      });
      elementToComponent.set(idCoilA, node.id);

      const idCoilB = `r_coil_b_${node.id}`;
      elements.push({
        id: idCoilB,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'b1'),
        nodeB: nodeFor(node.id, 'b2'),
        value: Math.max(0.1, numericProperty(props.windingResistance, SIMULATION_MODELS.stepper.windingResistance)),
      });
      elementToComponent.set(idCoilB, node.id);
      continue;
    }

    // ── 28BYJ-48 stepper with ULN2003 driver ──
    if (node.type === 'MOTOR_STEPPER') {
      const nodeVcc = nodeFor(node.id, 'vcc');
      const nodeGnd = nodeFor(node.id, 'gnd');
      const activePhases = [1, 2, 3, 4].filter((ch) => Boolean(props[`phase${ch}Active`])).length;

      const motorLoadId = `r_stepper_load_${node.id}`;
      elements.push({
        id: motorLoadId,
        type: 'RESISTOR',
        nodeA: nodeVcc,
        nodeB: nodeGnd,
        value: activePhases > 0
          ? SIMULATION_MODELS.stepper.driverPhaseResistance / activePhases
          : SIMULATION_MODELS.circuit.openCircuitResistance,
      });
      elementToComponent.set(motorLoadId, node.id);

      for (let ch = 1; ch <= 4; ch++) {
        const inputId = `r_stepper_input_${ch}_${node.id}`;
        elements.push({
          id: inputId,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, `in${ch}`),
          nodeB: nodeGnd,
          value: 100_000,
        });
        elementToComponent.set(inputId, node.id);
      }
      continue;
    }

    // ── Buzzer (electrical load; audio state is driven from solved current) ──
    if (node.type === 'MOTOR_SERVO' || node.type === 'SERVO_MOTOR') {
      const vccNode = nodeFor(node.id, 'vcc');
      const gndNode = nodeFor(node.id, 'gnd');

      const powerId = `r_servo_power_${node.id}`;
      elements.push({
        id: powerId,
        type: 'RESISTOR',
        nodeA: vccNode,
        nodeB: gndNode,
        value: 75,
      });
      elementToComponent.set(powerId, node.id);

      const signalId = `r_servo_signal_${node.id}`;
      elements.push({
        id: signalId,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'sig'),
        nodeB: gndNode,
        value: 100_000,
      });
      elementToComponent.set(signalId, node.id);
      continue;
    }

    if (node.type === 'BUZZER') {
      const id = `bz_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'pos'),
        nodeB: nodeFor(node.id, 'neg'),
        value: Math.max(1, resistanceOhms(props.resistance, 42)),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── DC Motor (winding resistance + dynamic back-EMF) ──
    if (node.type === 'MOTOR_DC') {
      const motorPins = node.pins || [];
      const positivePin = motorPins.find((pin) =>
        /^(m1|positive|pos|plus|vcc|power)$/i.test(pin.id)
        || /m\s*\+|positive|pos|plus|vcc|power/i.test(`${pin.id} ${pin.name}`));
      const negativePin = motorPins.find((pin) =>
        /^(m2|negative|neg|minus|gnd|ground)$/i.test(pin.id)
        || /m\s*[-−]|negative|neg|minus|gnd|ground/i.test(`${pin.id} ${pin.name}`));
      const nodeA = positivePin ? nodeFor(node.id, positivePin.id) : 0;
      const nodeB = negativePin ? nodeFor(node.id, negativePin.id) : 0;
      let terminalPinA = positivePin;
      let terminalPinB = negativePin;

      // Custom/API motors often use VCC/GND or positive/negative instead of
      // the built-in m1/m2 IDs. Do not silently create a motor between GND
      // and GND; let the generic fallback handle genuinely unrecognizable
      // pin layouts.
      if (!positivePin || !negativePin || nodeA === nodeB) {
        const fallbackA = motorPins[0];
        const fallbackB = motorPins.find((pin) => pin.id !== fallbackA?.id) || motorPins[1];
        if (!fallbackA || !fallbackB || nodeFor(node.id, fallbackA.id) === nodeFor(node.id, fallbackB.id)) {
          terminalPinA = undefined;
          terminalPinB = undefined;
        } else {
          terminalPinA = fallbackA;
          terminalPinB = fallbackB;
        }
      }

      if (terminalPinA && terminalPinB) {
        const id = `mot_${node.id}`;
        const ratedVoltage = Math.max(
          0.1,
          numericProperty(props.ratedVoltage ?? props.voltage, SIMULATION_MODELS.dcMotor.ratedVoltage),
        );
        const ratedRpm = Math.max(1, numericProperty(props.ratedRpm, SIMULATION_MODELS.dcMotor.ratedRpm));
        const storedRpm = Math.max(0, Math.min(ratedRpm * 1.5, numericProperty(props.rpm, 0)));
        const direction = String(props.direction || 'forward').toLowerCase() === 'reverse' ? -1 : 1;
        const backEmf = props.isSpinning === false
          ? 0
          : direction * Math.min(ratedVoltage * 1.5, (storedRpm / ratedRpm) * ratedVoltage);
        elements.push({
          id,
          type: 'MOTOR_DC',
          nodeA: nodeFor(node.id, terminalPinA.id),
          nodeB: nodeFor(node.id, terminalPinB.id),
          internalNode: nextExtraNode++,
          value: Math.max(0.1, resistanceOhms(
            props.windingResistance ?? props.resistance,
            SIMULATION_MODELS.dcMotor.windingResistance,
          )),
          backEmf,
        });
        elementToComponent.set(id, node.id);
        continue;
      }
    }

    // ── Potentiometer (modeled as two resistors, corrected UI values) ──
    if (node.type === 'POTENTIOMETER') {
      const total = Math.max(1, resistanceOhms(
        props.maxResistance ?? props.resistance,
        10000,
      ));
      const pos = normalizePotentiometerPosition(props.position, 0.5);
      const rTop = total * pos;
      const rBot = total * (1 - pos);

      const idTop = `pot_top_${node.id}`;
      elements.push({
        id: idTop,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'wiper'),
        value: Math.max(rTop, 1),
      });
      elementToComponent.set(idTop, node.id);

      const idBot = `pot_bot_${node.id}`;
      elements.push({
        id: idBot,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'wiper'),
        nodeB: nodeFor(node.id, 'p2'),
        value: Math.max(rBot, 1),
      });
      elementToComponent.set(idBot, node.id);
      continue;
    }

    // ── LDR / Light Sensor (calculate value from lightLevel percentage) ──
    if (node.type === 'LDR' || node.type === 'SENSOR_LDR') {
      const rDark = resistanceOhms(props.resistanceDark, SIMULATION_MODELS.sensors.ldrDarkResistance);
      const rLight = resistanceOhms(props.resistanceLight, SIMULATION_MODELS.sensors.ldrLightResistance);
      const rawLight = numericProperty(props.lightLevel, 50);
      const light = Math.max(0, Math.min(1, rawLight > 1 ? rawLight / 100 : rawLight));
      const resistance = rDark - (rDark - rLight) * light;

      const id = `ldr_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: Math.max(resistance, 1),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Multimeter ──
    if (node.type === 'MULTIMETER') {
      nextExtraNode = addMeterElements(
        elements,
        elementToComponent,
        node.id,
        nodeFor(node.id, 'v_probe'),
        nodeFor(node.id, 'com'),
        meterMeasurementMode(props.mode),
        resistanceTestAllowed,
        nextExtraNode,
        node.id,
      );
      continue;
    }

    // ── Ammeter (0V voltage source — reads branch current) ──
    if (node.type === 'AMMETER') {
      const id = `am_${node.id}`;
      elements.push({
        id,
        type: 'AMMETER',
        nodeA: nodeFor(node.id, 'in'),
        nodeB: nodeFor(node.id, 'out'),
        value: 0,
      });
      elementToComponent.set(id, node.id);
      vsCounter++;
      continue;
    }

    // ── Oscilloscope (high impedance probes, no current draw) ──
    if (node.type === 'OSCILLOSCOPE') {
      for (const chPin of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8']) {
        const pin = node.pins?.find((p) => p.id === chPin);
        if (!pin) continue;
        const id = `scope_${node.id}_${chPin}`;
        elements.push({
          id,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, chPin),
          nodeB: nodeFor(node.id, 'gnd'),
          value: SIMULATION_MODELS.meter.oscilloscopeInputResistance,
        });
        elementToComponent.set(id, node.id);
        scopeChannels[`${node.id}:${chPin.toUpperCase()}`] = nodeFor(node.id, chPin);
      }
      continue;
    }

    // ── Voltage Regulator 7805 (simplified: ideal 5V source) ──
    if (node.type === 'VOLTAGE_REGULATOR_7805') {
      const id = `vreg_${node.id}`;
      const outputVoltage = numericProperty(props.outputVoltage ?? props.voltage, 5);
      const internalOutputNode = nextExtraNode++;
      elements.push({
        id,
        type: 'VOLTAGE_SOURCE',
        nodeA: internalOutputNode,
        nodeB: nodeFor(node.id, 'gnd'),
        value: props.isRegulating ? outputVoltage : 0,
      });
      elementToComponent.set(id, node.id);
      vsCounter++;

      const outputSwitchId = `r_vreg_output_switch_${node.id}`;
      elements.push({
        id: outputSwitchId,
        type: 'RESISTOR',
        nodeA: internalOutputNode,
        nodeB: nodeFor(node.id, 'vout'),
        value: props.isRegulating ? 0.01 : SIMULATION_MODELS.relay.openContactResistance,
      });
      elementToComponent.set(outputSwitchId, node.id);

      const idleId = `r_vreg_idle_${node.id}`;
      elements.push({
        id: idleId,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'vin'),
        nodeB: nodeFor(node.id, 'gnd'),
        value: 50_000,
      });
      elementToComponent.set(idleId, node.id);
      continue;
    }

    // ── NPN transistor ──
    if (node.type === 'NPN_TRANSISTOR') {
      const id = `q_${node.id}`;
      elements.push({
        id,
        type: 'BJT',
        nodeA: nodeFor(node.id, 'collector'),
        nodeB: nodeFor(node.id, 'emitter'),
        controlNode: nodeFor(node.id, 'base'),
        value: 0,
        gain: Number(props.gain) || 100,
        maxCurrent: (Number(props.collectorCurrent) || 500) / 1000,
        saturationCurrent: 1e-15,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(id, node.id);

      const bcId = `q_bc_${node.id}`;
      elements.push({
        id: bcId,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'base'),
        nodeB: nodeFor(node.id, 'collector'),
        value: 0,
        saturationCurrent: 1e-15,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(bcId, node.id);
      continue;
    }

    // ── PNP transistor ──
    if (node.type === 'PNP_TRANSISTOR') {
      const id = `q_${node.id}`;
      elements.push({
        id,
        type: 'BJT',
        nodeA: nodeFor(node.id, 'collector'),
        nodeB: nodeFor(node.id, 'emitter'),
        controlNode: nodeFor(node.id, 'base'),
        value: 0,
        pnp: true,
        gain: Number(props.gain) || 100,
        maxCurrent: (Number(props.collectorCurrent) || 500) / 1000,
        saturationCurrent: 1e-15,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(id, node.id);

      const bcId = `q_bc_${node.id}`;
      elements.push({
        id: bcId,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'collector'),
        nodeB: nodeFor(node.id, 'base'),
        value: 0,
        saturationCurrent: 1e-15,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(bcId, node.id);
      continue;
    }

    // ── Enhancement MOSFET ──
    if (node.type === 'NMOS' || node.type === 'PMOS') {
      const id = `mos_${node.id}`;
      const pChannel = node.type === 'PMOS';
      elements.push({
        id,
        type: 'MOSFET',
        nodeA: nodeFor(node.id, 'drain'),
        nodeB: nodeFor(node.id, 'source'),
        controlNode: nodeFor(node.id, 'gate'),
        value: 0,
        pChannel,
        thresholdVoltage: Math.max(0.1, numericProperty(props.thresholdVoltage, SIMULATION_MODELS.mosfet.thresholdVoltage)),
        onResistance: Math.max(0.001, resistanceOhms(props.onResistance, SIMULATION_MODELS.mosfet.onResistance)),
        offResistance: Math.max(1_000, resistanceOhms(props.offResistance, SIMULATION_MODELS.mosfet.offResistance)),
        transconductance: Math.max(1e-6, numericProperty(props.transconductance ?? props.kp, SIMULATION_MODELS.mosfet.transconductance)),
        channelLengthModulation: Math.max(0, numericProperty(props.channelLengthModulation ?? props.lambda, SIMULATION_MODELS.mosfet.channelLengthModulation)),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Ideal single op-amp ──
    if (node.type === 'OPAMP_IDEAL' || node.type === 'OPAMP_LM358') {
      const outputNode = nodeFor(node.id, 'out');
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');
      const id = `opamp_${node.id}`;
      elements.push({
        id,
        type: 'OPAMP',
        nodeA: outputNode,
        nodeB: gndNode,
        controlNode: nodeFor(node.id, 'in_plus'),
        controlNode2: nodeFor(node.id, 'in_minus'),
        value: 0,
        openLoopGain: numericProperty(props.openLoopGain, SIMULATION_MODELS.opamp.openLoopGain),
        minOutputVoltage: numericProperty(props.outputLow, 0),
        maxOutputVoltage: numericProperty(props.outputHigh, node.type === 'OPAMP_LM358' ? 4.8 : 5),
        positiveRailNode: vccNode,
        negativeRailNode: gndNode,
        outputHeadroom: Math.max(0, numericProperty(props.outputHeadroom,
          node.type === 'OPAMP_LM358' ? SIMULATION_MODELS.opamp.lm358Headroom : SIMULATION_MODELS.opamp.idealHeadroom)),
      });
      elementToComponent.set(id, node.id);

      if (vccNode !== 0 && gndNode !== 0) {
        const drawId = `r_opamp_supply_${node.id}`;
        elements.push({
          id: drawId,
          type: 'RESISTOR',
          nodeA: vccNode,
          nodeB: gndNode,
          value: Math.max(100, resistanceOhms(props.supplyResistance, 10_000)),
        });
        elementToComponent.set(drawId, node.id);
      }
      continue;
    }

    // ── NTC thermistor ──
    if (node.type === 'THERMISTOR_NTC' || node.type === 'THERMISTOR') {
      const nominal = Math.max(1, resistanceOhms(props.nominalResistance ?? props.resistance, 10_000));
      const nominalTemperature = numericProperty(props.nominalTemperature_C, 25);
      const beta = Math.max(1, numericProperty(props.beta, 3950));
      const temperature = numericProperty(props.temperature_C ?? props.temperature, nominalTemperature);
      const resistance = nominal * Math.exp(beta * (
        1 / (temperature + 273.15) - 1 / (nominalTemperature + 273.15)
      ));
      const id = `thermistor_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: Math.max(1, Math.min(1e9, resistance)),
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── IC 555 Timer ──
    if (node.type === 'IC_555_TIMER') {
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');

      // VCC power draw
      const idDraw = `r_power_draw_${node.id}`;
      elements.push({
        id: idDraw,
        type: 'RESISTOR',
        nodeA: vccNode,
        nodeB: gndNode,
        value: 10000,
      });
      elementToComponent.set(idDraw, node.id);

      // Model OUT as a voltage source
      const srcId = `vs_555_${node.id}_out`;
      elements.push({
        id: srcId,
        type: 'VOLTAGE_SOURCE',
        nodeA: nodeFor(node.id, 'out'),
        nodeB: gndNode,
        value: 0,
      });
      elementToComponent.set(srcId, node.id);
      vsCounter++;

      // Model DISCH as a controlled resistor to GND
      const dischId = `r_555_disch_${node.id}`;
      elements.push({
        id: dischId,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'disch'),
        nodeB: gndNode,
        value: 1e8, // start open
      });
      elementToComponent.set(dischId, node.id);

      // Add high impedance pull-downs for other inputs
      const inputs = ['trig', 'thresh', 'reset', 'ctrl'];
      for (const pinId of inputs) {
        const pinNode = nodeFor(node.id, pinId);
        const rId = `r_555_in_${node.id}_${pinId}`;
        elements.push({
          id: rId,
          type: 'RESISTOR',
          nodeA: pinNode,
          nodeB: pinId === 'reset' ? vccNode : gndNode,
          value: pinId === 'reset' ? 1_000_000 : 10_000_000,
        });
        elementToComponent.set(rId, node.id);
      }

      const behaviorId = `behavior_555_${node.id}`;
      elements.push({
        id: behaviorId,
        type: 'BEHAVIORAL_555',
        nodeA: vccNode,
        nodeB: gndNode,
        controlNode: nodeFor(node.id, 'trig'),
        controlNode2: nodeFor(node.id, 'thresh'),
        resetNode: nodeFor(node.id, 'reset'),
        outputElementId: srcId,
        dischargeElementId: dischId,
        value: 0,
        behaviorState: Boolean(props.timerState),
      });
      elementToComponent.set(behaviorId, node.id);
      continue;
    }

    // ── 74HC595 Shift Register ──
    if (node.type === 'IC_74HC595' || node.type === '74HC595') {
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');

      // VCC power draw
      const idDraw = `r_power_draw_${node.id}`;
      elements.push({
        id: idDraw,
        type: 'RESISTOR',
        nodeA: vccNode,
        nodeB: gndNode,
        value: 10000,
      });
      elementToComponent.set(idDraw, node.id);

      // Model QA-QF outputs and QHP (serial output) as controlled voltage sources
      const outputs = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh', 'qhp'];
      for (const pinId of outputs) {
        const pinNode = nodeFor(node.id, pinId);
        const srcId = `vs_595_${node.id}_${pinId}`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: pinNode,
          nodeB: gndNode,
          value: digitalOutputVoltage(props, [pinId.toUpperCase(), pinId === 'qg' ? 'out_G' : pinId === 'qh' ? 'out_H' : '']),
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;
      }

      // Add high impedance pull-downs for inputs
      const inputs = ['ser', 'srclk', 'rclk', 'srclr', 'oe'];
      for (const pinId of inputs) {
        const pinNode = nodeFor(node.id, pinId);
        const rId = `r_595_in_${node.id}_${pinId}`;
        elements.push({
          id: rId,
          type: 'RESISTOR',
          nodeA: pinNode,
          nodeB: gndNode,
          value: 1000000,
        });
        elementToComponent.set(rId, node.id);
      }
      continue;
    }

    // The remaining catalog logic ICs are handled by LogicRegistry for edge
    // behavior. Give their power pins, inputs, and outputs an electrical
    // representation as well, so an output can drive a resistor/LED through
    // the same MNA circuit instead of existing only as a visual property.
    if (node.type === 'IC_74HC165' || node.type === '74HC165') {
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');
      addDigitalIcPower(elements, elementToComponent, node.id, vccNode, gndNode);

      for (const [pinId, keys] of [
        ['q7', ['serialOut']],
        ['q7_bar', ['serialOutInverted']],
      ] as const) {
        const srcId = `vs_165_${node.id}_${pinId}`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: nodeFor(node.id, pinId),
          nodeB: gndNode,
          value: digitalOutputVoltage(props, keys, 5, true),
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;
      }

      addDigitalIcInputPulls(elements, elementToComponent, node, gndNode,
        ['pl', 'clk', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'ser', 'ce'], nodeFor);
      continue;
    }

    if (node.type === 'IC_74HC138' || node.type === '74HC138') {
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');
      addDigitalIcPower(elements, elementToComponent, node.id, vccNode, gndNode);

      for (let index = 0; index < 8; index++) {
        const pinId = `y${index}`;
        const srcId = `vs_138_${node.id}_${pinId}`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: nodeFor(node.id, pinId),
          nodeB: gndNode,
          value: digitalOutputVoltage(props, [`Y${index}`], 5, true),
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;
      }

      addDigitalIcInputPulls(elements, elementToComponent, node, gndNode,
        ['a0', 'a1', 'a2', 'e1_bar', 'e2_bar', 'e3'], nodeFor);
      continue;
    }

    if (node.type === 'IC_74HC151' || node.type === '74HC151') {
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');
      addDigitalIcPower(elements, elementToComponent, node.id, vccNode, gndNode);

      for (const [pinId, keys] of [['y', ['outputY']], ['w', ['outputW']] ] as const) {
        const srcId = `vs_151_${node.id}_${pinId}`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: nodeFor(node.id, pinId),
          nodeB: gndNode,
          value: digitalOutputVoltage(props, keys, 5, true),
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;
      }

      addDigitalIcInputPulls(elements, elementToComponent, node, gndNode,
        ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'a', 'b', 'c', 'e_bar'], nodeFor);
      continue;
    }

    if (node.type === 'IC_CD4017' || node.type === 'CD4017') {
      const gndNode = nodeFor(node.id, 'gnd');
      const vccNode = nodeFor(node.id, 'vcc');
      addDigitalIcPower(elements, elementToComponent, node.id, vccNode, gndNode);

      for (let index = 0; index < 10; index++) {
        const pinId = `q${index}`;
        const srcId = `vs_4017_${node.id}_${pinId}`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: nodeFor(node.id, pinId),
          nodeB: gndNode,
          value: digitalOutputVoltage(props, [`Q${index}`], 5, true),
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;
      }

      const carryId = `vs_4017_${node.id}_co`;
      elements.push({
        id: carryId,
        type: 'VOLTAGE_SOURCE',
        nodeA: nodeFor(node.id, 'co'),
        nodeB: gndNode,
        value: digitalOutputVoltage(props, ['carryOut'], 5, true),
      });
      elementToComponent.set(carryId, node.id);
      vsCounter++;

      addDigitalIcInputPulls(elements, elementToComponent, node, gndNode,
        ['clk', 'clk_inh', 'reset'], nodeFor);
      continue;
    }

    // ── Soil Moisture Sensor (powered sensor with analog output) ──
    if (node.type === 'SOIL_MOISTURE') {
      const vccPin = node.pins?.find(p => /vcc/i.test(p.id));
      const gndPin = node.pins?.find(p => /gnd/i.test(p.id));
      const sigPin = node.pins?.find(p => /sig/i.test(p.id));
      if (vccPin && gndPin) {
        const idDraw = `r_power_draw_${node.id}`;
        elements.push({
          id: idDraw,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, vccPin.id),
          nodeB: nodeFor(node.id, gndPin.id),
          value: 10000,
        });
        elementToComponent.set(idDraw, node.id);

        if (sigPin) {
          const moisture = Number(props.moistureLevel ?? 50) / 100;
          const internalNode = nextExtraNode++;
          const srcId = `vs_soil_${node.id}`;
          elements.push({
            id: srcId,
            type: 'VOLTAGE_SOURCE',
            nodeA: internalNode,
            nodeB: nodeFor(node.id, gndPin.id),
            value: moisture * logicVoltage,
          });
          elementToComponent.set(srcId, node.id);
          vsCounter++;

          const outR = `r_soil_out_${node.id}`;
          elements.push({
            id: outR,
            type: 'RESISTOR',
            nodeA: internalNode,
            nodeB: nodeFor(node.id, sigPin.id),
            value: 1000,
          });
          elementToComponent.set(outR, node.id);
        }
      }
      continue;
    }

    // ── ESC Module (powered speed controller) ──
    if (node.type === 'ESC_MODULE') {
      const vccPin = node.pins?.find(p => /vcc/i.test(p.id));
      const gndPin = node.pins?.find(p => /gnd/i.test(p.id));
      if (vccPin && gndPin) {
        const idDraw = `r_power_draw_${node.id}`;
        elements.push({
          id: idDraw,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, vccPin.id),
          nodeB: nodeFor(node.id, gndPin.id),
          value: SIMULATION_MODELS.esc.powerDrawResistance,
        });
        elementToComponent.set(idDraw, node.id);

        const sigPin = node.pins?.find(p => /sig/i.test(p.id));
        if (sigPin) {
          const rSig = `r_esc_signal_${node.id}`;
          elements.push({
            id: rSig,
            type: 'RESISTOR',
            nodeA: nodeFor(node.id, sigPin.id),
            nodeB: nodeFor(node.id, gndPin.id),
            value: SIMULATION_MODELS.esc.signalInputResistance,
          });
          elementToComponent.set(rSig, node.id);
        }

        for (const phasePin of ['phase_a', 'phase_b', 'phase_c']) {
          if (!node.pins?.some(p => p.id === phasePin)) continue;
          const phaseSource = `vs_esc_phase_${phasePin}_${node.id}`;
          elements.push({
            id: phaseSource,
            type: 'VOLTAGE_SOURCE',
            nodeA: nodeFor(node.id, phasePin),
            nodeB: nodeFor(node.id, gndPin.id),
            // Phase sources are enabled only after SimulationEngine has
            // measured a valid ESC VCC/GND supply from the solved circuit.
            value: 0,
          });
          elementToComponent.set(phaseSource, node.id);

          const rPhase = `r_esc_phase_${phasePin}_${node.id}`;
          elements.push({
            id: rPhase,
            type: 'RESISTOR',
            nodeA: nodeFor(node.id, phasePin),
            nodeB: nodeFor(node.id, gndPin.id),
            value: SIMULATION_MODELS.esc.phaseLoadResistance,
          });
          elementToComponent.set(rPhase, node.id);
        }
      }
      continue;
    }

    // ── BLDC Motor (3-phase motor load) ──
    if (node.type === 'MOTOR_BLDC') {
      // Use a floating star point so all three windings participate in the
      // electrical load. The earlier chained A-B/B-C approximation omitted
      // the third winding and made phase-current readings asymmetric.
      const starNode = nextExtraNode++;
      for (const phasePin of ['phase_a', 'phase_b', 'phase_c']) {
        if (!node.pins?.some((pin) => pin.id === phasePin)) continue;
        const rCoil = `r_bldc_coil_${phasePin}_${node.id}`;
        elements.push({
          id: rCoil,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, phasePin),
          nodeB: starNode,
          value: Math.max(0.1, numericProperty(node.properties?.windingResistance, SIMULATION_MODELS.bldc.windingResistance)),
        });
        elementToComponent.set(rCoil, node.id);
      }
      continue;
    }

    // Every custom/API component must still participate in the electrical
    // solve. Unsupported visual types used to fall through with no MNA
    // element at all, so their pins had no load, no current, and no runtime
    // state to drive the canvas. Use a conservative resistor model as a
    // stable generic fallback until a component-specific model is available.
    if (elements.length === elementsBeforeNode) {
      const pins = node.pins || [];
      const powerPin = pins.find(isGenericPowerPin);
      const groundPin = pins.find(isGenericGroundPin);
      const activeLoad = /LED|LAMP|BULB|MOTOR|FAN|PUMP/i.test(`${node.type} ${node.name || ''}`);
      const pinA = powerPin || pins[0];
      const pinB = groundPin || pins.find((pin) => pin.id !== pinA?.id) || pins[1];

      if (pinA && pinB && nodeFor(node.id, pinA.id) !== nodeFor(node.id, pinB.id)) {
        const id = `r_generic_${node.id}`;
        elements.push({
          id,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, pinA.id),
          nodeB: nodeFor(node.id, pinB.id),
          value: genericResistance(props, powerPin && groundPin ? activeLoad ? 1000 : 10000 : 1000),
        });
        elementToComponent.set(id, node.id);
        genericComponentIds.add(node.id);
      }
    }
  }

  const virtualProbes = virtualMeter?.probes.slice(0, 2) || [];
  if (virtualProbes.length === 2) {
    const [positiveProbe, negativeProbe] = virtualProbes;
    const nodeA = pinToMNANode.get(pinKey(positiveProbe.nodeId, positiveProbe.pinId));
    const nodeB = pinToMNANode.get(pinKey(negativeProbe.nodeId, negativeProbe.pinId));
    if (nodeA !== undefined && nodeB !== undefined) {
      nextExtraNode = addMeterElements(
        elements,
        elementToComponent,
        'virtual',
        nodeA,
        nodeB,
        virtualMeter?.mode || 'VOLTAGE',
        resistanceTestAllowed,
        nextExtraNode,
      );
    }
  }

  const numNodes = nextExtraNode - 1;
  const topology: MNATopology = {
    numNodes,
    groundNodeIndex: 0,
    connectivitySignature: currentConnectivitySignature,
    pinToMNANode,
    elementToComponent,
    genericComponentIds,
    elementSignatures: elements.map((element) => ({
      id: element.id,
      type: element.type,
      nodeA: element.nodeA,
      nodeB: element.nodeB,
      ...(element.controlNode === undefined ? {} : { controlNode: element.controlNode }),
      ...(element.controlNode2 === undefined ? {} : { controlNode2: element.controlNode2 }),
      ...(element.resetNode === undefined ? {} : { resetNode: element.resetNode }),
      ...(element.internalNode === undefined ? {} : { internalNode: element.internalNode }),
      ...(element.positiveRailNode === undefined ? {} : { positiveRailNode: element.positiveRailNode }),
      ...(element.negativeRailNode === undefined ? {} : { negativeRailNode: element.negativeRailNode }),
      ...(element.outputElementId === undefined ? {} : { outputElementId: element.outputElementId }),
      ...(element.dischargeElementId === undefined ? {} : { dischargeElementId: element.dischargeElementId }),
    })),
  };

  return {
    numNodes,
    elements,
    groundNodeIndex: 0,
    pinToMNANode,
    elementToComponent,
    genericComponentIds,
    scopeChannels,
    topology,
    buildMetrics,
  };
}

/**
 * Capture only inputs that can change electrical connectivity. This is much
 * cheaper than rebuilding Union-Find and breadboard proximity links, but it
 * still invalidates the cache when a component is moved over a breadboard.
 */
function connectivitySignature(nodes: CanvasNode[], wires: Wire[]): string {
  return JSON.stringify({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation || 0,
      pins: (node.pins || []).map((pin) => ({
        id: pin.id,
        name: pin.name,
        type: pin.type,
        x: pin.x,
        y: pin.y,
      })),
    })),
    wires: wires.map((wire) => ({
      fromNodeId: wire.fromNodeId,
      fromPinId: wire.fromPinId,
      toNodeId: wire.toNodeId,
      toPinId: wire.toPinId,
    })),
  });
}

function digitalOutputVoltage(
  properties: Record<string, unknown>,
  keys: readonly string[],
  logicVoltage = 5,
  requiresPower = false,
): number {
  if (requiresPower && properties.powered !== true) return 0;
  return keys.some((key) => key && booleanProperty(properties[key], false)) ? logicVoltage : 0;
}

function addDigitalIcPower(
  elements: MNAElement[],
  elementToComponent: Map<string, string>,
  componentId: string,
  vccNode: number,
  gndNode: number,
) {
  const id = `r_power_draw_${componentId}`;
  elements.push({
    id,
    type: 'RESISTOR',
    nodeA: vccNode,
    nodeB: gndNode,
    value: 10_000,
  });
  elementToComponent.set(id, componentId);
}

function addDigitalIcInputPulls(
  elements: MNAElement[],
  elementToComponent: Map<string, string>,
  node: CanvasNode,
  gndNode: number,
  inputPins: readonly string[],
  resolveNode: (componentId: string, pinId: string) => number,
) {
  for (const pinId of inputPins) {
    if (!node.pins?.some((pin) => pin.id === pinId)) continue;
    const id = `r_ic_input_${node.id}_${pinId}`;
    elements.push({
      id,
      type: 'RESISTOR',
      nodeA: resolveNode(node.id, pinId),
      nodeB: gndNode,
      value: 1_000_000,
    });
    elementToComponent.set(id, node.id);
  }
}

function relayChannelActive(properties: Record<string, unknown>, channel = 1): boolean {
  const keys = channel === 1
    ? ['isActive', 'isSwitched', 'isSwitched_1']
    : [`isSwitched_${channel}`];
  return keys.some((key) => booleanProperty(properties[key], false));
}

