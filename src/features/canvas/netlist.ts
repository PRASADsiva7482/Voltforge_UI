import type { CanvasNode, PinPosition, Wire } from '../../types';

export interface NetlistPinRef {
  nodeId: string;
  pinId: string;
  nodeType: string;
  nodeName: string;
  pinName: string;
  pinType: PinPosition['type'];
}

export interface NetlistNode {
  id: string;
  pins: NetlistPinRef[];
}

export interface NetlistComponent {
  id: string;
  type: string;
  name: string;
  pins: Record<string, string>;
  properties: Record<string, unknown>;
}

export interface CircuitNetlist {
  nodes: NetlistNode[];
  components: NetlistComponent[];
  wires: Wire[];
  pinToNet: Record<string, string>;
}

export interface CircuitSafetyIssue {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  componentId: string;
  message: string;
  suggestedFix: string;
  currentMa?: number;
}

export interface CircuitSafetyResult {
  netlist: CircuitNetlist;
  issues: CircuitSafetyIssue[];
  nodeStates: Record<string, Record<string, unknown>>;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    const parent = this.parent.get(key)!;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

const pinKey = (nodeId: string, pinId: string) => `${nodeId}:${pinId}`;

export function buildCircuitNetlist(nodes: CanvasNode[], wires: Wire[]): CircuitNetlist {
  const unionFind = new UnionFind();
  const pinRefs = new Map<string, NetlistPinRef>();

  nodes.forEach((node) => {
    node.pins?.forEach((pin) => {
      const key = pinKey(node.id, pin.id);
      unionFind.add(key);
      pinRefs.set(key, {
        nodeId: node.id,
        pinId: pin.id,
        nodeType: node.type,
        nodeName: node.name,
        pinName: pin.name,
        pinType: pin.type,
      });
    });
  });

  wires.forEach((wire) => {
    unionFind.union(pinKey(wire.fromNodeId, wire.fromPinId), pinKey(wire.toNodeId, wire.toPinId));
  });

  const groups = new Map<string, NetlistPinRef[]>();
  pinRefs.forEach((pin, key) => {
    const root = unionFind.find(key);
    const group = groups.get(root) || [];
    group.push(pin);
    groups.set(root, group);
  });

  const pinToNet: Record<string, string> = {};
  const netlistNodes = Array.from(groups.values()).map((pins, index) => {
    const id = `N${index + 1}`;
    pins.forEach((pin) => {
      pinToNet[pinKey(pin.nodeId, pin.pinId)] = id;
    });
    return { id, pins };
  });

  return {
    nodes: netlistNodes,
    components: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      properties: node.properties || {},
      pins: Object.fromEntries((node.pins || []).map((pin) => [pin.id, pinToNet[pinKey(node.id, pin.id)]])),
    })),
    wires,
    pinToNet,
  };
}

export function analyzeCircuitSafety(nodes: CanvasNode[], wires: Wire[]): CircuitSafetyResult {
  const netlist = buildCircuitNetlist(nodes, wires);
  const issues: CircuitSafetyIssue[] = [];
  const nodeStates: Record<string, Record<string, unknown>> = {};

  const netById = new Map(netlist.nodes.map((node) => [node.id, node]));

  for (const component of netlist.components) {
    if (!component.type.includes('LED')) continue;

    const sourcePin = findPinByRole(nodes, component.id, ['anode', '+', 'red', 'green', 'blue', 'pos']);
    const sinkPin = findPinByRole(nodes, component.id, ['cathode', 'gnd', '-', 'neg']);
    if (!sourcePin || !sinkPin) continue;

    const sourceNet = component.pins[sourcePin.id];
    const sinkNet = component.pins[sinkPin.id];
    if (!sourceNet || !sinkNet || sourceNet === sinkNet) continue;

    const directSource = netHasVoltageSource(netById.get(sourceNet));
    const directGround = netHasGround(netById.get(sinkNet));
    const resistorCurrent = estimateSeriesResistorCurrent(component, sourceNet, sinkNet, netlist, netById);

    if (directSource && directGround) {
      const issue: CircuitSafetyIssue = {
        id: `${component.id}:led-direct-overcurrent`,
        severity: 'CRITICAL',
        componentId: component.id,
        message: `${component.name} is wired directly from a voltage source to ground without a series resistor.`,
        suggestedFix: 'Place a resistor in series with the LED anode or cathode.',
      };
      issues.push(issue);
      nodeStates[component.id] = {
        isBlown: true,
        isLit: false,
        faultMessage: issue.message,
        currentMa: 'INF',
      };
      continue;
    }

    if (resistorCurrent !== null) {
      const maxCurrent = parseMilliAmps(component.properties.maxCurrent, 20);
      if (resistorCurrent > maxCurrent) {
        const issue: CircuitSafetyIssue = {
          id: `${component.id}:led-overcurrent`,
          severity: resistorCurrent > maxCurrent * 2 ? 'CRITICAL' : 'WARNING',
          componentId: component.id,
          message: `${component.name} current is about ${resistorCurrent.toFixed(1)} mA, above its ${maxCurrent} mA limit.`,
          suggestedFix: 'Increase the series resistor value or lower the supply voltage.',
          currentMa: resistorCurrent,
        };
        issues.push(issue);
        nodeStates[component.id] = {
          isBlown: issue.severity === 'CRITICAL',
          faultMessage: issue.message,
          currentMa: resistorCurrent,
        };
      } else if (component.properties.isBlown) {
        nodeStates[component.id] = { isBlown: false, faultMessage: undefined };
      }
    } else if (component.properties.isBlown) {
      nodeStates[component.id] = { isBlown: false, faultMessage: undefined };
    }
  }

  return { netlist, issues, nodeStates };
}

function estimateSeriesResistorCurrent(
  led: NetlistComponent,
  sourceNet: string,
  sinkNet: string,
  netlist: CircuitNetlist,
  netById: Map<string, NetlistNode>,
): number | null {
  const forwardVoltage = Number(led.properties.forwardVoltage || 2);
  const supplyVoltage = Math.max(netVoltage(netById.get(sourceNet)), sourceNet ? 5 : 0);

  for (const resistor of netlist.components.filter((component) => component.type === 'RESISTOR')) {
    const resistorNets = Object.values(resistor.pins).filter(Boolean);
    if (resistorNets.length < 2) continue;
    const [a, b] = resistorNets;
    const resistance = Math.max(1, Number(resistor.properties.resistance || 220));

    const sourceThroughResistor = b === sourceNet && netHasVoltageSource(netById.get(a))
      || a === sourceNet && netHasVoltageSource(netById.get(b));
    const groundThroughResistor = b === sinkNet && netHasGround(netById.get(a))
      || a === sinkNet && netHasGround(netById.get(b));

    if (sourceThroughResistor || groundThroughResistor) {
      return Math.max(0, ((supplyVoltage - forwardVoltage) / resistance) * 1000);
    }
  }

  return null;
}

function findPinByRole(nodes: CanvasNode[], nodeId: string, roles: string[]): PinPosition | null {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return null;

  return node.pins.find((pin) => {
    const label = `${pin.id} ${pin.name}`.toLowerCase();
    return roles.some((role) => label.includes(role));
  }) || null;
}

function netHasVoltageSource(net?: NetlistNode): boolean {
  return !!net?.pins.some((pin) => {
    const label = pin.pinName.toUpperCase();
    return pin.pinType === 'power'
      || label === '5V'
      || label === '3.3V'
      || label === 'VIN'
      || (isBoard(pin.nodeType) && /^D\d+/.test(label));
  });
}

function netHasGround(net?: NetlistNode): boolean {
  return !!net?.pins.some((pin) => pin.pinType === 'ground' || pin.pinName.toUpperCase().includes('GND'));
}

function netVoltage(net?: NetlistNode): number {
  if (!net) return 0;
  if (net.pins.some((pin) => pin.pinName.toUpperCase() === '3.3V')) return 3.3;
  if (net.pins.some((pin) => pin.pinName.toUpperCase() === 'VIN')) return 7;
  if (netHasVoltageSource(net)) return 5;
  return 0;
}

function isBoard(type: string) {
  return type.startsWith('ARDUINO') || type.startsWith('ESP') || type.startsWith('RASPBERRY');
}

function parseMilliAmps(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallback;
  const numeric = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : fallback;
}
