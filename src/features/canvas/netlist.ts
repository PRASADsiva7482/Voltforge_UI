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

function isBoard(type: string) {
  return type.startsWith('ARDUINO') || type.startsWith('ESP') || type.startsWith('RASPBERRY');
}

function isGroundLabel(pin: { pinName?: string; name?: string; pinId?: string; id?: string }) {
  return /(^|\W)(GND|GROUND)(\W|$)/i.test(`${pin.pinId || pin.id || ''} ${pin.pinName || pin.name || ''}`);
}

function addLegacyPinAliases(node: CanvasNode, unionFind: UnionFind) {
  const join = (canonical: string, aliases: string[]) => {
    const canonicalKey = pinKey(node.id, canonical);
    unionFind.add(canonicalKey);
    aliases.forEach((alias) => unionFind.union(canonicalKey, pinKey(node.id, alias)));
  };

  if (node.type === 'RESISTOR') {
    join('p1', ['pin1']);
    join('p2', ['pin2']);
  }
  if (node.type.includes('CAPACITOR')) {
    join('pos', ['p1', 'pin1', 'positive']);
    join('neg', ['p2', 'pin2', 'negative']);
  }
  if (node.type === 'MOTOR_DC') {
    join('m1', ['positive', 'pos', 'plus']);
    join('m2', ['negative', 'neg', 'minus']);
  }
  if (node.type === 'DISPLAY_7SEG') {
    join('com', ['common']);
  }
  if (node.type === 'RELAY_SINGLE') {
    join('in', ['coil1']);
    join('gnd', ['coil2']);
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
  }
}

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

    if (isBoard(node.type)) {
      const groundPins = (node.pins || []).filter((pin) => isGroundLabel(pin));
      for (let index = 1; index < groundPins.length; index++) {
        unionFind.union(pinKey(node.id, groundPins[0].id), pinKey(node.id, groundPins[index].id));
      }
    }
    addLegacyPinAliases(node, unionFind);
  });

  nodes.filter((node) => node.type === 'BREADBOARD').forEach((breadboard) => {
    const availablePins = new Set((breadboard.pins || []).map((pin) => pin.id));
    const connect = (pinIds: string[]) => {
      const existing = pinIds.filter((pinId) => availablePins.has(pinId));
      for (let index = 1; index < existing.length; index++) {
        unionFind.union(pinKey(breadboard.id, existing[0]), pinKey(breadboard.id, existing[index]));
      }
    };

    for (let column = 1; column <= 30; column++) {
      connect(['a', 'b', 'c', 'd', 'e'].map((row) => `${row}${column}`));
      connect(['f', 'g', 'h', 'i', 'j'].map((row) => `${row}${column}`));
    }

    connect((breadboard.pins || [])
      .map((pin) => pin.id)
      .filter((pinId) => /^vcc_top_\d+$/i.test(pinId)));
    connect((breadboard.pins || [])
      .map((pin) => pin.id)
      .filter((pinId) => /^gnd_top_\d+$/i.test(pinId)));
    connect((breadboard.pins || [])
      .map((pin) => pin.id)
      .filter((pinId) => /^vcc_bottom_\d+$/i.test(pinId)));
    connect((breadboard.pins || [])
      .map((pin) => pin.id)
      .filter((pinId) => /^gnd_bottom_\d+$/i.test(pinId)));
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

  for (const component of netlist.components) {
    if (component.type !== 'MOTOR_DC') continue;

    const terminalNets = ['m1', 'm2'].map((pinId) => component.pins[pinId]);
    const connectedTerminals = terminalNets.map((netId) => {
      const net = netById.get(netId);
      return Boolean(net?.pins.some((pin) => pin.nodeId !== component.id && pin.nodeType !== 'BREADBOARD'));
    });

    if (!connectedTerminals[0] || !connectedTerminals[1]) {
      const issue: CircuitSafetyIssue = {
        id: `${component.id}:motor-open-circuit`,
        severity: 'WARNING',
        componentId: component.id,
        message: `${component.name} has an open circuit; both M+ and M- need electrical connections.`,
        suggestedFix: 'Connect both motor terminals to a complete supply and return path. A single D2 wire cannot produce motor current.',
      };
      issues.push(issue);
      nodeStates[component.id] = {
        ...nodeStates[component.id],
        isSpinning: false,
        faultMessage: issue.message,
      };
      continue;
    }

    const firstNet = netById.get(terminalNets[0]);
    const secondNet = netById.get(terminalNets[1]);
    const isDirectGpioDrive = netHasMcuGpio(firstNet) && netHasGround(secondNet)
      || netHasMcuGpio(secondNet) && netHasGround(firstNet);

    if (isDirectGpioDrive) {
      const issue: CircuitSafetyIssue = {
        id: `${component.id}:motor-direct-gpio`,
        severity: 'WARNING',
        componentId: component.id,
        message: `${component.name} is connected directly to a microcontroller GPIO, which can exceed the pin current rating.`,
        suggestedFix: 'Drive the motor through a transistor or motor-driver IC, add a flyback diode, use a suitable motor supply, and share ground with the board.',
      };
      issues.push(issue);
      nodeStates[component.id] = {
        ...nodeStates[component.id],
        faultMessage: issue.message,
      };
    } else if (component.properties.faultMessage) {
      nodeStates[component.id] = {
        ...nodeStates[component.id],
        faultMessage: undefined,
      };
    }
  }

  checkI2cConflicts(netlist, issues);
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
    const pinId = pin.pinId.toLowerCase();
    if (isBoard(pin.nodeType)) {
      return label === '5V'
        || label === '3.3V'
        || label === '3V3'
        || label === 'VIN'
        || /^D\d+/.test(label);
    }
    if (pin.nodeType === 'POWER_SUPPLY' || pin.nodeType === 'BATTERY_9V') {
      return pin.pinType === 'power' || /(^|\W)(\+|POS|POSITIVE|VCC|VIN)(\W|$)/i.test(`${pin.pinId} ${pin.pinName}`);
    }
    return pin.nodeType === 'VOLTAGE_REGULATOR_7805' && (pinId === 'vout' || label === '5V');
  });
}

function netHasGround(net?: NetlistNode): boolean {
  return !!net?.pins.some((pin) => {
    if (isBoard(pin.nodeType)) return isGroundLabel(pin);
    if (pin.nodeType === 'POWER_SUPPLY' || pin.nodeType === 'BATTERY_9V') {
      return pin.pinType === 'ground' || /(^|\W)(-|NEG|NEGATIVE|GND|GROUND)(\W|$)/i.test(`${pin.pinId} ${pin.pinName}`);
    }
    return false;
  });
}

function netHasMcuGpio(net?: NetlistNode): boolean {
  return !!net?.pins.some((pin) => isBoard(pin.nodeType) && /^D\d+$/i.test(pin.pinName));
}

function netVoltage(net?: NetlistNode): number {
  if (!net) return 0;
  if (net.pins.some((pin) => isBoard(pin.nodeType) && /^(3\.3V|3V3)$/i.test(pin.pinName))) return 3.3;
  if (net.pins.some((pin) => isBoard(pin.nodeType) && pin.pinName.toUpperCase() === 'VIN')) return 7;
  if (netHasVoltageSource(net)) return 5;
  return 0;
}

function parseMilliAmps(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallback;
  const numeric = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * Enhanced safety analysis using MNA solver output.
 * When the solver is running, it uses real computed currents and power
 * for accurate burnout detection. Falls back to heuristic analysis otherwise.
 */
export function analyzeCircuitSafetyWithSolver(
  nodes: CanvasNode[],
  wires: Wire[],
  solverCurrents: Record<string, number>,
  solverPower: Record<string, number>,
): CircuitSafetyResult {
  const netlist = buildCircuitNetlist(nodes, wires);
  const issues: CircuitSafetyIssue[] = [];
  const nodeStates: Record<string, Record<string, unknown>> = {};

  const hasSolverData = Object.keys(solverCurrents).length > 0;

  if (!hasSolverData) {
    // No solver data — fall back to heuristic analysis
    return analyzeCircuitSafety(nodes, wires);
  }

  // Use real solver data for each component
  for (const node of nodes) {
    const current = solverCurrents[node.id] ?? 0;
    const power = solverPower[node.id] ?? 0;
    const currentMa = Math.abs(current) * 1000;

    // LED overcurrent check
    if (node.type.includes('LED') && !node.type.includes('NEOPIXEL')) {
      const maxCurrent = parseMilliAmps(node.properties?.maxCurrent, 20);

      if (currentMa > maxCurrent * 2) {
        issues.push({
          id: `${node.id}:solver-overcurrent`,
          severity: 'CRITICAL',
          componentId: node.id,
          message: `${node.name} current is ${currentMa.toFixed(1)} mA (max ${maxCurrent} mA). Component will burn out.`,
          suggestedFix: 'Add or increase the series resistor value.',
          currentMa,
        });
        nodeStates[node.id] = {
          isBlown: true,
          isLit: false,
          faultMessage: `Current ${currentMa.toFixed(1)} mA exceeds max ${maxCurrent} mA`,
          currentMa,
        };
      } else if (currentMa > maxCurrent) {
        issues.push({
          id: `${node.id}:solver-overcurrent-warn`,
          severity: 'WARNING',
          componentId: node.id,
          message: `${node.name} current is ${currentMa.toFixed(1)} mA, above its ${maxCurrent} mA limit.`,
          suggestedFix: 'Increase the series resistor value.',
          currentMa,
        });
      }
    }

    // Resistor power dissipation check
    if (node.type === 'RESISTOR') {
      const maxPower = Number(node.properties?.maxPower) || 0.25; // 1/4W default
      if (power > maxPower) {
        issues.push({
          id: `${node.id}:solver-overheat`,
          severity: power > maxPower * 2 ? 'CRITICAL' : 'WARNING',
          componentId: node.id,
          message: `${node.name} is dissipating ${(power * 1000).toFixed(0)} mW (rated for ${(maxPower * 1000).toFixed(0)} mW).`,
          suggestedFix: 'Use a higher wattage resistor or reduce current.',
        });
      }
    }

    // Generic over-power check for any component with maxPower property
    if (node.properties?.maxPowerWatts) {
      const maxPower = Number(node.properties.maxPowerWatts);
      if (power > maxPower) {
        issues.push({
          id: `${node.id}:solver-overpower`,
          severity: 'CRITICAL',
          componentId: node.id,
          message: `${node.name} is exceeding its power rating (${(power * 1000).toFixed(0)} mW vs ${(maxPower * 1000).toFixed(0)} mW max).`,
          suggestedFix: 'Reduce voltage or current to the component.',
        });
        nodeStates[node.id] = {
          isBlown: true,
          faultMessage: `Power ${(power * 1000).toFixed(0)} mW exceeds max ${(maxPower * 1000).toFixed(0)} mW`,
        };
      }
    }
  }

  checkI2cConflicts(netlist, issues);
  return { netlist, issues, nodeStates };
}

function checkI2cConflicts(netlist: CircuitNetlist, issues: CircuitSafetyIssue[]) {
  const busGroups: Record<string, { component: NetlistComponent; addr: number }[]> = {};

  for (const component of netlist.components) {
    const sdaPinId = Object.keys(component.pins).find(
      (k) => k.toLowerCase() === 'sda' || k.toLowerCase().includes('sda')
    );
    const sclPinId = Object.keys(component.pins).find(
      (k) => k.toLowerCase() === 'scl' || k.toLowerCase().includes('scl')
    );

    if (!sdaPinId || !sclPinId) continue;

    const sdaNet = component.pins[sdaPinId];
    const sclNet = component.pins[sclPinId];

    if (!sdaNet || !sclNet) continue;

    const busId = `${sdaNet}_${sclNet}`;

    if (component.properties && component.properties.address !== undefined) {
      const rawAddr = String(component.properties.address).trim().toLowerCase();
      const addrNum = rawAddr.startsWith('0x') ? parseInt(rawAddr, 16) : parseInt(rawAddr, 10);

      if (!isNaN(addrNum)) {
        if (!busGroups[busId]) {
          busGroups[busId] = [];
        }
        busGroups[busId].push({ component, addr: addrNum });
      }
    }
  }

  for (const [busId, devices] of Object.entries(busGroups)) {
    const addrToDevices: Record<number, typeof devices> = {};
    for (const dev of devices) {
      if (!addrToDevices[dev.addr]) {
        addrToDevices[dev.addr] = [];
      }
      addrToDevices[dev.addr].push(dev);
    }

    for (const [addr, devs] of Object.entries(addrToDevices)) {
      if (devs.length > 1) {
        const names = devs.map((d) => d.component.name).join(' and ');
        const hexAddr = `0x${Number(addr).toString(16).toUpperCase()}`;
        devs.forEach((dev) => {
          issues.push({
            id: `${dev.component.id}:i2c-address-conflict`,
            severity: 'WARNING',
            componentId: dev.component.id,
            message: `I2C Address Conflict: Multiple devices (${names}) share the address ${hexAddr} on the same I2C bus.`,
            suggestedFix: 'Configure a unique address for each I2C device in the properties panel.',
          });
        });
      }
    }
  }
}
