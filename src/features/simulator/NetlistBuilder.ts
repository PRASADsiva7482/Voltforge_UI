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
  pinStates: Record<string, number> = {},
  pinModes: Record<string, string> = {},
  boardPoweredMap: Record<string, boolean> = {}
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

  // 2b. Merge overlapping breadboard pins (proximity connection)
  const breadboards = nodes.filter((n) => n.type === 'BREADBOARD');
  for (const bb of breadboards) {
    for (const pinBB of bb.pins || []) {
      const posBB = getAbsolutePinPos(bb, pinBB);
      for (const node of nodes) {
        if (node.id === bb.id || node.type === 'BREADBOARD') continue;
        for (const pinNode of node.pins || []) {
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
  let nextExtraNode = nextNode;

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
      const isPowered = boardPoweredMap[node.id] !== false;

      // Power pins as switchable voltage sources
      for (const pin of node.pins || []) {
        const label = pin.name.toUpperCase();
        if (label === '5V' || label === 'VCC') {
          const internalNode = nextExtraNode++;
          const srcId = `vs_${node.id}_${pin.id}_src`;
          elements.push({
            id: srcId,
            type: 'VOLTAGE_SOURCE',
            nodeA: internalNode,
            nodeB: 0, // GND reference
            value: 5,
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
        } else if (label === '3.3V' || label === '3V3') {
          const internalNode = nextExtraNode++;
          const srcId = `vs_${node.id}_${pin.id}_src`;
          elements.push({
            id: srcId,
            type: 'VOLTAGE_SOURCE',
            nodeA: internalNode,
            nodeB: 0,
            value: 3.3,
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
            nodeB: 0,
            value: 100000,
          });
          elementToComponent.set(id, node.id);
        }
      }

      // Digital output pins as switchable impedance drivers
      for (const pin of node.pins || []) {
        const match = `${pin.name} ${pin.id}`.match(/\bD?(\d{1,2})\b/i);
        if (!match) continue;
        const pinNum = match[1];
        const voltage = pinStates[pinNum] ?? 0;
        const mode = pinModes[pinNum] || 'INPUT';
        const isOutput = mode === 'OUTPUT' || mode === 'PWM';

        const pinNode = nodeFor(node.id, pin.id);
        if (pinNode === 0) continue;

        const internalNode = nextExtraNode++;
        const srcId = `vs_mcu_${node.id}_d${pinNum}_src`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: internalNode,
          nodeB: 0,
          value: voltage,
        });
        elementToComponent.set(srcId, node.id);
        vsCounter++;

        const swId = `r_mcu_pin_${node.id}_d${pinNum}`;
        const resistance = (isPowered && isOutput) ? 40 : 1e8;
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
      let scale = 1e-6; // Default to microfarads (uF)
      if (node.type === 'CERAMIC_CAPACITOR') {
        scale = 1e-12; // picofarads (pF)
      }
      const capacitance = (Number(props.capacitance) || 0.1) * scale;
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

    // ── RGB LED (Three parallel channels to GND) ──
    if (node.type === 'LED_RGB') {
      const rPin = node.pins?.find(p => p.id === 'r');
      const gPin = node.pins?.find(p => p.id === 'g');
      const bPin = node.pins?.find(p => p.id === 'b');
      const gndPin = node.pins?.find(p => p.id === 'gnd' || p.id === 'cathode');
      const nodeGnd = gndPin ? nodeFor(node.id, gndPin.id) : 0;

      const channels = [
        { pin: rPin, color: 'r', vf: 2.0 },
        { pin: gPin, color: 'g', vf: 3.2 },
        { pin: bPin, color: 'b', vf: 3.2 },
      ];

      for (const ch of channels) {
        if (ch.pin) {
          const nodeAnode = nodeFor(node.id, ch.pin.id);
          const internalNode = nextExtraNode++;

          // Diode model
          const diodeId = `led_rgb_diode_${ch.color}_${node.id}`;
          elements.push({
            id: diodeId,
            type: 'DIODE',
            nodeA: nodeAnode,
            nodeB: internalNode,
            value: 0,
            saturationCurrent: 1e-12,
            thermalVoltage: 0.02585,
          });
          elementToComponent.set(diodeId, node.id);

          // Series Vf offset source
          const vsId = `led_rgb_vs_${ch.color}_${node.id}`;
          elements.push({
            id: vsId,
            type: 'VOLTAGE_SOURCE',
            nodeA: internalNode,
            nodeB: nodeGnd,
            value: ch.vf - 0.7,
          });
          elementToComponent.set(vsId, node.id);
          vsCounter++;
        }
      }
      continue;
    }

    // ── LED (modeled as diode + Vf series source) ──
    if (node.type.includes('LED') && !node.type.includes('NEOPIXEL')) {
      const anodePin = node.pins?.find((p) =>
        /anode|\+|pos/i.test(`${p.id} ${p.name}`)
      );
      const cathodePin = node.pins?.find((p) =>
        /cathode|-|neg|gnd/i.test(`${p.id} ${p.name}`)
      );
      if (anodePin && cathodePin) {
        const Vf = Number(props.forwardVoltage) || 2.0;
        const nodeAnode = nodeFor(node.id, anodePin.id);
        const nodeCathode = nodeFor(node.id, cathodePin.id);

        if (Vf > 0.7) {
          const internalNode = nextExtraNode++;
          const diodeId = `led_diode_${node.id}`;
          elements.push({
            id: diodeId,
            type: 'DIODE',
            nodeA: nodeAnode,
            nodeB: internalNode,
            value: 0,
            saturationCurrent: 1e-12,
            thermalVoltage: 0.02585,
          });
          elementToComponent.set(diodeId, node.id);

          const vsId = `led_vs_${node.id}`;
          elements.push({
            id: vsId,
            type: 'VOLTAGE_SOURCE',
            nodeA: internalNode,
            nodeB: nodeCathode,
            value: Vf - 0.7,
          });
          elementToComponent.set(vsId, node.id);
          vsCounter++;
        } else {
          const diodeId = `led_${node.id}`;
          elements.push({
            id: diodeId,
            type: 'DIODE',
            nodeA: nodeAnode,
            nodeB: nodeCathode,
            value: 0,
            saturationCurrent: 1e-12,
            thermalVoltage: 0.02585,
          });
          elementToComponent.set(diodeId, node.id);
        }
      }
      continue;
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

    // ── SWITCH SPST (toggles p1-p2, inverse p2-p3 acting as SPDT) ──
    if (node.type === 'SWITCH_SPST') {
      const isClosed = Boolean(props.isClosed);
      const rClosed = isClosed ? 0.01 : 1e8;
      const rOpen = isClosed ? 1e8 : 0.01;

      const idSw = `r_sw_${node.id}`;
      elements.push({
        id: idSw,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p1'),
        nodeB: nodeFor(node.id, 'p2'),
        value: rClosed,
      });
      elementToComponent.set(idSw, node.id);

      const idSwNC = `r_sw_nc_${node.id}`;
      elements.push({
        id: idSwNC,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'p2'),
        nodeB: nodeFor(node.id, 'p3'),
        value: rOpen,
      });
      elementToComponent.set(idSwNC, node.id);
      continue;
    }

    // ── Single Channel Relay ──
    if (node.type === 'RELAY_SINGLE' || node.type === 'RELAY_SPDT') {
      const isActive = Boolean(props.isActive);

      // Coil resistance
      const idCoil = `r_coil_${node.id}`;
      elements.push({
        id: idCoil,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'coil1'),
        nodeB: nodeFor(node.id, 'coil2'),
        value: 70,
      });
      elementToComponent.set(idCoil, node.id);

      // NO contact
      const idNO = `r_contact_no_${node.id}`;
      elements.push({
        id: idNO,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'com'),
        nodeB: nodeFor(node.id, 'no'),
        value: isActive ? 0.01 : 1e8,
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
          value: isActive ? 1e8 : 0.01,
        });
        elementToComponent.set(idNC, node.id);
      }
      continue;
    }

    // ── 2-Channel Relay Module ──
    if (node.type === 'RELAY_2CH') {
      const active1 = Boolean(props.isSwitched_1);
      const active2 = Boolean(props.isSwitched_2);
      const nodeGnd = nodeFor(node.id, 'gnd');

      // Coil 1
      const idCoil1 = `r_coil1_${node.id}`;
      elements.push({
        id: idCoil1,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'coil1'),
        nodeB: nodeGnd,
        value: 70,
      });
      elementToComponent.set(idCoil1, node.id);

      // Coil 2
      const idCoil2 = `r_coil2_${node.id}`;
      elements.push({
        id: idCoil2,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'coil2'),
        nodeB: nodeGnd,
        value: 70,
      });
      elementToComponent.set(idCoil2, node.id);

      // NO contacts
      const idNO1 = `r_contact_no1_${node.id}`;
      elements.push({
        id: idNO1,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'com1'),
        nodeB: nodeFor(node.id, 'no1'),
        value: active1 ? 0.01 : 1e8,
      });
      elementToComponent.set(idNO1, node.id);

      const idNO2 = `r_contact_no2_${node.id}`;
      elements.push({
        id: idNO2,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'com2'),
        nodeB: nodeFor(node.id, 'no2'),
        value: active2 ? 0.01 : 1e8,
      });
      elementToComponent.set(idNO2, node.id);
      continue;
    }

    // ── 4-Channel Relay Module ──
    if (node.type === 'RELAY_4CH') {
      const nodeGnd = nodeFor(node.id, 'gnd');

      // VCC power draw
      const idVccDraw = `r_power_draw_${node.id}`;
      elements.push({
        id: idVccDraw,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'vcc'),
        nodeB: nodeGnd,
        value: 10000,
      });
      elementToComponent.set(idVccDraw, node.id);

      for (let ch = 1; ch <= 4; ch++) {
        const isActive = Boolean(props[`isSwitched_${ch}`]);

        const idCoil = `r_coil${ch}_${node.id}`;
        elements.push({
          id: idCoil,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, `coil${ch}`),
          nodeB: nodeGnd,
          value: 70,
        });
        elementToComponent.set(idCoil, node.id);

        const idContact = `r_contact_no${ch}_${node.id}`;
        elements.push({
          id: idContact,
          type: 'RESISTOR',
          nodeA: nodeFor(node.id, `com${ch}`),
          nodeB: nodeFor(node.id, `no${ch}`),
          value: isActive ? 0.01 : 1e8,
        });
        elementToComponent.set(idContact, node.id);
      }
      continue;
    }

    // ── 7-Segment Display (segment diodes to com) ──
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
            saturationCurrent: 1e-12,
            thermalVoltage: 0.02585,
          });
          elementToComponent.set(diodeId, node.id);
        }
      }
      continue;
    }

    // ── PIR Motion Sensor (Active Voltage Source on Motion) ──
    if (node.type === 'SENSOR_PIR' || node.type === 'PIR_SENSOR') {
      const nodeGnd = nodeFor(node.id, 'gnd');

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
        nodeA: nodeFor(node.id, 'out'),
        nodeB: nodeGnd,
        value: hasMotion ? 5 : 0,
      });
      elementToComponent.set(idOut, node.id);
      vsCounter++;
      continue;
    }

    // ── Stepper Motor (Coil A & B internal windings) ──
    if (node.type === 'MOTOR_STEPPER' || node.type === 'STEPPER_MOTOR') {
      const idCoilA = `r_coil_a_${node.id}`;
      elements.push({
        id: idCoilA,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'a1'),
        nodeB: nodeFor(node.id, 'a2'),
        value: 10,
      });
      elementToComponent.set(idCoilA, node.id);

      const idCoilB = `r_coil_b_${node.id}`;
      elements.push({
        id: idCoilB,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'b1'),
        nodeB: nodeFor(node.id, 'b2'),
        value: 10,
      });
      elementToComponent.set(idCoilB, node.id);
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

    // ── DC Motor (modeled as ~10Ω resistor) ──
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

    // ── Potentiometer (modeled as two resistors, corrected UI values) ──
    if (node.type === 'POTENTIOMETER') {
      const total = Number(props.maxResistance) || Number(props.resistance) || 10000;
      const pct = Number(props.position !== undefined ? props.position : 50);
      const pos = pct / 100;
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
      const rDark = Number(props.resistanceDark) || 100000;
      const rLight = Number(props.resistanceLight) || 500;
      const light = Number(props.lightLevel !== undefined ? props.lightLevel : 50) / 100;
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

      const idCE = `q_ce_${node.id}`;
      elements.push({
        id: idCE,
        type: 'RESISTOR',
        nodeA: nodeFor(node.id, 'collector'),
        nodeB: nodeFor(node.id, 'emitter'),
        value: 100_000,
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
          nodeB: gndNode,
          value: 1000000,
        });
        elementToComponent.set(rId, node.id);
      }
      continue;
    }

    // ── 74HC595 Shift Register ──
    if (node.type === 'IC_74HC595') {
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
      const outputs = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qhp'];
      for (const pinId of outputs) {
        const pinNode = nodeFor(node.id, pinId);
        const srcId = `vs_595_${node.id}_${pinId}`;
        elements.push({
          id: srcId,
          type: 'VOLTAGE_SOURCE',
          nodeA: pinNode,
          nodeB: gndNode,
          value: 0,
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

    // ── Generic sensors load current draw ──
    if (node.type.includes('SENSOR') || node.type.includes('TEMP_SENSOR') || node.type === 'SENSOR_IMU') {
      const vccPin = node.pins?.find(p => /vcc|3v3|5v|vdd/i.test(p.name));
      const gndPin = node.pins?.find(p => /gnd|ground|vss/i.test(p.name));
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
      }
      continue;
    }
  }

  return {
    numNodes: nextExtraNode - 1,
    elements,
    groundNodeIndex: 0,
    pinToMNANode,
    elementToComponent,
  };
}
