// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Netlist Builder for MNA Solver
// Converts Canvas nodes + wires into MNA circuit elements with proper
// electrical node mapping, breadboard auto-connect, and component models.
// ═══════════════════════════════════════════════════════════════════════════

import type { CanvasNode, Wire } from '../../types';
import type { MNAElement, MNAElementType } from './MNASolver';

// ── Intermediate types ──────────────────────────────────────────────────

export interface MNACircuit {
  numNodes: number;            // Total electrical nodes (excluding ground)
  elements: MNAElement[];      // Components for the solver
  groundNodeIndex: number;     // Always 0
  /** Maps a canvas pin key ("nodeId:pinId") to an MNA node index (0 = GND) */
  pinToMNANode: Map<string, number>;
  /** Maps MNA element ID back to canvas component ID */
  elementToComponent: Map<string, string>;
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

// ── Helper: check if a component type is a board / MCU ──────────────────

function isBoard(type: string): boolean {
  return type.startsWith('ARDUINO') || type.startsWith('ESP') || type.startsWith('RASPBERRY');
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

  // Connect top and bottom power rails to each other
  uf.union(
    pinKey(node.id, `vcc_top_1`),
    pinKey(node.id, `vcc_bottom_1`)
  );
  uf.union(
    pinKey(node.id, `gnd_top_1`),
    pinKey(node.id, `gnd_bottom_1`)
  );
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
  pinStates: Record<string, number> = {}
): MNACircuit {
  const uf = new UnionFind();
  const elements: MNAElement[] = [];
  const elementToComponent = new Map<string, string>();

  // 1. Register all pins in Union-Find
  for (const node of nodes) {
    if (!node.pins) continue;
    for (const pin of node.pins) {
      uf.add(pinKey(node.id, pin.id));
    }
    // Auto-connect breadboard internal rows
    addBreadboardConnections(node, uf);
  }

  // 2. Merge pins connected by wires
  for (const wire of wires) {
    uf.union(
      pinKey(wire.fromNodeId, wire.fromPinId),
      pinKey(wire.toNodeId, wire.toPinId)
    );
  }

  // 3. Assign MNA node indices to each group
  //    Ground node = 0; all GND pins merge to ground
  const groups = uf.groups();
  const rootToMNANode = new Map<string, number>();
  let nextNode = 1; // 0 is reserved for ground

  // First pass: identify ground groups
  for (const [root, members] of groups) {
    const isGround = members.some((key) => {
      const [nodeId, pinId] = key.split(':');
      const node = nodes.find((n) => n.id === nodeId);
      const pin = node?.pins?.find((p) => p.id === pinId);
      if (!pin) return false;
      const label = `${pin.id} ${pin.name}`.toUpperCase();
      return pin.type === 'ground' || label.includes('GND') || label.includes('COM') || label === '-';
    });
    if (isGround) {
      rootToMNANode.set(root, 0);
    }
  }

  // Second pass: assign indices to non-ground groups
  for (const [root] of groups) {
    if (!rootToMNANode.has(root)) {
      rootToMNANode.set(root, nextNode++);
    }
  }

  // Build pin → MNA node map
  const pinToMNANode = new Map<string, number>();
  for (const [root, members] of groups) {
    const mnaNode = rootToMNANode.get(root) ?? 0;
    for (const member of members) {
      pinToMNANode.set(member, mnaNode);
    }
  }

  const numNodes = nextNode - 1;

  // Helper to get MNA node for a component's pin
  const nodeFor = (componentId: string, pinId: string): number => {
    return pinToMNANode.get(pinKey(componentId, pinId)) ?? 0;
  };

  // 4. Create MNA elements from canvas components
  let vsCounter = 0;

  for (const node of nodes) {
    const props = node.properties || {};

    // Skip breadboards (they only provide connectivity)
    if (node.type === 'BREADBOARD') continue;

    // ── MCU Boards (Arduino, ESP, etc.) ──
    if (isBoard(node.type)) {
      // Power pins as voltage sources
      for (const pin of node.pins || []) {
        const label = pin.name.toUpperCase();
        if (label === '5V' || label === 'VCC') {
          const id = `vs_${node.id}_${pin.id}`;
          elements.push({
            id,
            type: 'VOLTAGE_SOURCE',
            nodeA: nodeFor(node.id, pin.id),
            nodeB: 0, // GND reference
            value: 5,
          });
          elementToComponent.set(id, node.id);
          vsCounter++;
        } else if (label === '3.3V' || label === '3V3') {
          const id = `vs_${node.id}_${pin.id}`;
          elements.push({
            id,
            type: 'VOLTAGE_SOURCE',
            nodeA: nodeFor(node.id, pin.id),
            nodeB: 0,
            value: 3.3,
          });
          elementToComponent.set(id, node.id);
          vsCounter++;
        } else if (label === 'VIN') {
          const id = `vs_${node.id}_${pin.id}`;
          elements.push({
            id,
            type: 'VOLTAGE_SOURCE',
            nodeA: nodeFor(node.id, pin.id),
            nodeB: 0,
            value: 7,
          });
          elementToComponent.set(id, node.id);
          vsCounter++;
        }
      }

      // Digital output pins as switchable voltage sources
      for (const pin of node.pins || []) {
        const match = `${pin.name} ${pin.id}`.match(/\bD?(\d{1,2})\b/i);
        if (!match) continue;
        const pinNum = match[1];
        const voltage = pinStates[pinNum] ?? 0;

        // Only create a source if this pin is connected to something
        const pinNode = nodeFor(node.id, pin.id);
        if (pinNode === 0) continue; // Connected to ground, skip voltage source

        const id = `vs_mcu_${node.id}_d${pinNum}`;
        elements.push({
          id,
          type: 'VOLTAGE_SOURCE',
          nodeA: pinNode,
          nodeB: 0,
          value: voltage,
        });
        elementToComponent.set(id, node.id);
        vsCounter++;
      }
      continue;
    }

    // ── Resistor ──
    if (node.type === 'RESISTOR') {
      const resistance = Number(props.resistance) || 220;
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
      const capacitance = Number(props.capacitance) || 0.0000001; // 100nF default
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
    if (node.type === 'DIODE') {
      const id = `d_${node.id}`;
      elements.push({
        id,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'anode'),
        nodeB: nodeFor(node.id, 'cathode'),
        value: 0, // Not used for diodes
        saturationCurrent: Number(props.saturationCurrent) || 1e-12,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── LED (modeled as diode with specific Vf) ──
    if (node.type.includes('LED') && !node.type.includes('NEOPIXEL')) {
      const id = `led_${node.id}`;
      const anodePin = node.pins?.find((p) =>
        /anode|\+|pos|r|g|b|din/i.test(`${p.id} ${p.name}`)
      );
      const cathodePin = node.pins?.find((p) =>
        /cathode|-|neg|gnd/i.test(`${p.id} ${p.name}`)
      );
      if (anodePin && cathodePin) {
        elements.push({
          id,
          type: 'DIODE',
          nodeA: nodeFor(node.id, anodePin.id),
          nodeB: nodeFor(node.id, cathodePin.id),
          value: 0,
          saturationCurrent: 1e-12,
          thermalVoltage: 0.02585,
        });
        elementToComponent.set(id, node.id);
      }
      continue;
    }

    // ── Buzzer (modeled as ~42Ω resistor) ──
    if (node.type === 'BUZZER') {
      const id = `bz_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'pos'),
        nodeB: nodeFor(node.id, 'neg'),
        value: Number(props.resistance) || 42,
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── DC Motor (modeled as ~10Ω resistor + back-EMF, simplified) ──
    if (node.type === 'MOTOR_DC') {
      const id = `mot_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'm1'),
        nodeB: nodeFor(node.id, 'm2'),
        value: Number(props.resistance) || 10,
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Potentiometer (modeled as two resistors) ──
    if (node.type === 'POTENTIOMETER') {
      const total = Number(props.totalResistance) || 10000;
      const pos = Number(props.wiperPosition) ?? 0.5;
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

    // ── LDR / Variable Resistor ──
    if (node.type === 'LDR' || node.type === 'SENSOR_LDR') {
      const id = `ldr_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: Number(props.currentResistance) || 10000,
      });
      elementToComponent.set(id, node.id);
      continue;
    }

    // ── Multimeter / Voltmeter (high impedance probe: 10MΩ) ──
    if (node.type === 'MULTIMETER') {
      const id = `vm_${node.id}`;
      elements.push({
        id,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'v_probe'),
        nodeB: nodeFor(node.id, 'com'),
        value: 10_000_000,
      });
      elementToComponent.set(id, node.id);
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
      for (const chPin of ['ch1', 'ch2']) {
        const pin = node.pins?.find((p) => p.id === chPin);
        if (!pin) continue;
        const id = `scope_${node.id}_${chPin}`;
        elements.push({
          id,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, chPin),
          nodeB: nodeFor(node.id, 'gnd'),
          value: 1_000_000, // 1MΩ input impedance
        });
        elementToComponent.set(id, node.id);
      }
      continue;
    }

    // ── Voltage Regulator 7805 (simplified: ideal 5V source) ──
    if (node.type === 'VOLTAGE_REGULATOR_7805') {
      const id = `vreg_${node.id}`;
      elements.push({
        id,
        type: 'VOLTAGE_SOURCE',
        nodeA: nodeFor(node.id, 'vout'),
        nodeB: nodeFor(node.id, 'gnd'),
        value: Number(props.outputVoltage) || 5,
      });
      elementToComponent.set(id, node.id);
      vsCounter++;
      continue;
    }

    // ── NPN Transistor (simplified: base-emitter diode + current-controlled source) ──
    if (node.type === 'NPN_TRANSISTOR') {
      // BE junction as diode
      const idBE = `q_be_${node.id}`;
      elements.push({
        id: idBE,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'base'),
        nodeB: nodeFor(node.id, 'emitter'),
        value: 0,
        saturationCurrent: 1e-12,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(idBE, node.id);

      // CE as a conductance controlled by VBE (simplified linear model)
      // When VBE > 0.7V, CE conducts with beta * Ib
      // For MNA we approximate as a small resistance when "on"
      const idCE = `q_ce_${node.id}`;
      elements.push({
        id: idCE,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'collector'),
        nodeB: nodeFor(node.id, 'emitter'),
        value: 100_000, // High resistance (off state, will be updated dynamically)
      });
      elementToComponent.set(idCE, node.id);
      continue;
    }

    // ── PNP Transistor (mirror of NPN) ──
    if (node.type === 'PNP_TRANSISTOR') {
      const idBE = `q_be_${node.id}`;
      elements.push({
        id: idBE,
        type: 'DIODE',
        nodeA: nodeFor(node.id, 'emitter'),
        nodeB: nodeFor(node.id, 'base'),
        value: 0,
        saturationCurrent: 1e-12,
        thermalVoltage: 0.02585,
      });
      elementToComponent.set(idBE, node.id);

      const idCE = `q_ce_${node.id}`;
      elements.push({
        id: idCE,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'emitter'),
        nodeB: nodeFor(node.id, 'collector'),
        value: 100_000,
      });
      elementToComponent.set(idCE, node.id);
      continue;
    }
  }

  return {
    numNodes,
    elements,
    groundNodeIndex: 0,
    pinToMNANode,
    elementToComponent,
  };
}
