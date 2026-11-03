import type { CanvasNode, Wire } from '../../types/domain';
import type { PcbFootprint, PcbPad, PcbTrace, Ratline } from '../../store/pcbStore';
import { RatlineEngine } from './RatlineEngine';
import { buildCircuitNetlist, isGroundLabel } from '../canvas/netlist';
import { isBoardComponentType } from '../canvas/boardCatalog';

type PinNets = Map<string, string>;

const sameItems = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item, i) => item === b[i]);

const sameConnection = (a: Wire, b: Wire) =>
  a === b ||
  (a.id === b.id &&
    a.fromNodeId === b.fromNodeId &&
    a.fromPinId === b.fromPinId &&
    a.toNodeId === b.toNodeId &&
    a.toPinId === b.toPinId);

const sameGeometry = (a: PcbFootprint, b: PcbFootprint) =>
  a === b ||
  (a.componentId === b.componentId &&
    a.x === b.x &&
    a.y === b.y &&
    a.rotation === b.rotation &&
    a.pads.length === b.pads.length &&
    a.pads.every((pad, i) => pad.id === b.pads[i].id && pad.x === b.pads[i].x && pad.y === b.pads[i].y));

/**
 * Generates physically accurate PCB footprint packages, pad geometries,
 * shapes, drill diameters, and net associations.
 */
export function generatePcbFootprintGeometry(
  node: CanvasNode,
  nets?: PinNets
): {
  packageType: string;
  width: number;
  height: number;
  pads: PcbPad[];
} {
  const type = node.type.toUpperCase();
  const pins = node.pins || [];
  const explicitPackage = node.properties?.footprint ? String(node.properties.footprint) : undefined;

  // 1. Passives: Resistors (Standard Axial-0.3: 7.62mm pitch)
  if (type === 'RESISTOR' || type === 'THERMISTOR' || type === 'THERMISTOR_NTC') {
    const pads: PcbPad[] = pins.map((pin, i) => ({
      id: pin.id,
      name: pin.name,
      netId: nets?.get(pin.id),
      x: i === 0 ? -3.81 : 3.81,
      y: 0,
      width: 1.6,
      height: 1.6,
      shape: i === 0 ? 'rect' : 'circle',
      drillDiameter: 0.8,
    }));
    return { packageType: 'RES_AXIAL_0.3', width: 10, height: 4, pads };
  }

  // 2. Diodes (DO-35 / DO-41: 7.62mm pitch)
  if (type.includes('DIODE') && !type.includes('LED') && !type.includes('BRIDGE')) {
    const pads: PcbPad[] = pins.map((pin, i) => ({
      id: pin.id,
      name: pin.name,
      netId: nets?.get(pin.id),
      x: i === 0 ? -3.81 : 3.81,
      y: 0,
      width: 1.6,
      height: 1.6,
      shape: i === 0 ? 'rect' : 'circle',
      drillDiameter: 0.8,
    }));
    return { packageType: 'DO-35', width: 10, height: 4, pads };
  }

  // 3. Capacitors (Radial 2.54mm or Ceramic 2.54mm pitch)
  if (type.includes('CAPACITOR')) {
    const isElec = type.includes('ELECTROLYTIC');
    const spacing = 2.54;
    const pads: PcbPad[] = pins.map((pin, i) => ({
      id: pin.id,
      name: pin.name,
      netId: nets?.get(pin.id),
      x: i === 0 ? -spacing / 2 : spacing / 2,
      y: 0,
      width: 1.6,
      height: 1.6,
      shape: i === 0 ? 'rect' : 'circle',
      drillDiameter: 0.8,
    }));
    return { packageType: isElec ? 'CAP_RADIAL_D6.3' : 'CAP_CERAMIC_0.1', width: 7, height: 7, pads };
  }

  // 4. LEDs (Radial 5mm, 2.54mm pitch)
  if (type.startsWith('LED_') || type === 'LED_STANDARD') {
    if (pins.length === 2) {
      const pads: PcbPad[] = pins.map((pin, i) => {
        const isAnode = pin.id.toLowerCase().includes('anode') || pin.name.toLowerCase().includes('anode') || i === 0;
        return {
          id: pin.id,
          name: pin.name,
          netId: nets?.get(pin.id),
          x: isAnode ? -1.27 : 1.27,
          y: 0,
          width: 1.6,
          height: 1.6,
          shape: isAnode ? 'rect' : 'circle',
          drillDiameter: 0.8,
        };
      });
      return { packageType: 'LED_5MM', width: 6, height: 6, pads };
    }
  }

  // 5. Transistors (TO-92 inline 2.54mm pitch)
  if (type.includes('TRANSISTOR') || type === 'NMOS' || type === 'PMOS' || type.includes('MOSFET')) {
    const pads: PcbPad[] = pins.map((pin, i) => ({
      id: pin.id,
      name: pin.name,
      netId: nets?.get(pin.id),
      x: (i - 1) * 2.54,
      y: 0,
      width: 1.5,
      height: 1.5,
      shape: i === 0 ? 'rect' : 'circle',
      drillDiameter: 0.8,
    }));
    return { packageType: 'TO-92', width: 6, height: 4.5, pads };
  }

  // 6. Voltage Regulators (TO-220 2.54mm pitch)
  if (type.includes('7805') || type.includes('REGULATOR')) {
    const pads: PcbPad[] = pins.map((pin, i) => ({
      id: pin.id,
      name: pin.name,
      netId: nets?.get(pin.id),
      x: (i - 1) * 2.54,
      y: 0,
      width: 1.8,
      height: 1.8,
      shape: i === 0 ? 'rect' : 'circle',
      drillDiameter: 1.0,
    }));
    return { packageType: 'TO-220', width: 10, height: 5, pads };
  }

  // 7. Push Button (Tactile 6x6mm: 4-pad rectangular footprint)
  if (type === 'PUSH_BUTTON' || type === 'BUTTON') {
    const pads: PcbPad[] = pins.map((pin, i) => {
      const left = i < 2;
      const top = i % 2 === 0;
      return {
        id: pin.id,
        name: pin.name,
        netId: nets?.get(pin.id),
        x: left ? -3.25 : 3.25,
        y: top ? -2.25 : 2.25,
        width: 1.6,
        height: 1.6,
        shape: i === 0 ? 'rect' : 'circle',
        drillDiameter: 0.9,
      };
    });
    return { packageType: 'TACT_6X6', width: 8, height: 8, pads };
  }

  // 8. Dual-In-Line ICs (DIP-8, DIP-14, DIP-16, DIP-28)
  if (
    type.startsWith('IC_') ||
    type.startsWith('74HC') ||
    type.startsWith('CD40') ||
    type.includes('555') ||
    type.includes('OPAMP') ||
    type === 'ATMEL_AVR_ATMEGA328P' ||
    (pins.length >= 4 && pins.length <= 40 && pins.length % 2 === 0 && !isBoardComponentType(type))
  ) {
    const half = Math.ceil(pins.length / 2);
    const rowSpacing = 7.62; // 0.3" standard DIP
    const pitch = 2.54; // 0.1"
    const totalLength = (half - 1) * pitch;

    const pads: PcbPad[] = pins.map((pin, i) => {
      const isLeft = i < half;
      const rowIdx = isLeft ? i : pins.length - 1 - i;
      const x = isLeft ? -rowSpacing / 2 : rowSpacing / 2;
      const y = -totalLength / 2 + rowIdx * pitch;

      return {
        id: pin.id,
        name: pin.name,
        netId: nets?.get(pin.id),
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: 1.6,
        height: 1.6,
        shape: i === 0 ? 'rect' : 'circle',
        drillDiameter: 0.8,
      };
    });

    const pkgName = `DIP-${pins.length}`;
    return { packageType: pkgName, width: rowSpacing + 3, height: totalLength + 4, pads };
  }

  // 9. Boards: Arduino Uno (68.6mm x 53.4mm, dual headers)
  if (type === 'ARDUINO_UNO') {
    const topPinIds = new Set(['scl', 'sda', 'aref', 'gnd3', 'd13', 'd12', 'd11', 'd10', 'd9', 'd8', 'd7', 'd6', 'd5', 'd4', 'd3', 'd2', 'd1', 'd0']);
    const topPins = pins.filter((p) => topPinIds.has(p.id.toLowerCase()));
    const bottomPins = pins.filter((p) => !topPinIds.has(p.id.toLowerCase()));

    const pads: PcbPad[] = pins.map((pin) => {
      const isTop = topPinIds.has(pin.id.toLowerCase());
      const rowPins = isTop ? topPins : bottomPins;
      const idx = rowPins.findIndex((p) => p.id === pin.id);
      const rowLength = (rowPins.length - 1) * 2.54;
      const x = -rowLength / 2 + idx * 2.54;
      const y = isTop ? -24.0 : 24.0;

      return {
        id: pin.id,
        name: pin.name,
        netId: nets?.get(pin.id),
        x: Math.round(x * 100) / 100,
        y,
        width: 1.7,
        height: 1.7,
        shape: 'circle',
        drillDiameter: 1.0,
      };
    });

    return { packageType: 'MODULE_ARDUINO_UNO', width: 68.6, height: 53.4, pads };
  }

  // 10. Boards: Arduino Nano (18.0mm x 43.0mm, dual 15-pin headers)
  if (type === 'ARDUINO_NANO') {
    const half = Math.ceil(pins.length / 2);
    const pads: PcbPad[] = pins.map((pin, i) => {
      const isLeft = i < half;
      const rowIdx = isLeft ? i : i - half;
      const x = isLeft ? -7.62 : 7.62;
      const y = -((half - 1) * 2.54) / 2 + rowIdx * 2.54;

      return {
        id: pin.id,
        name: pin.name,
        netId: nets?.get(pin.id),
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: 1.7,
        height: 1.7,
        shape: i === 0 ? 'rect' : 'circle',
        drillDiameter: 1.0,
      };
    });

    return { packageType: 'MODULE_ARDUINO_NANO', width: 18.0, height: 43.0, pads };
  }

  // 11. Generic fallback: 2.54mm inline connector
  const pads: PcbPad[] = pins.map((pin, i) => ({
    id: pin.id,
    name: pin.name,
    netId: nets?.get(pin.id),
    x: (i - (pins.length - 1) / 2) * 2.54,
    y: 0,
    width: 1.6,
    height: 1.6,
    shape: i === 0 ? 'rect' : 'circle',
    drillDiameter: 0.8,
  }));

  return {
    packageType: explicitPackage || `CONN-${pins.length}`,
    width: Math.max(8, pins.length * 2.54 + 2),
    height: 6,
    pads,
  };
}

function createFootprint(node: CanvasNode, index: number, nets?: PinNets): PcbFootprint {
  const col = index % 5;
  const geom = generatePcbFootprintGeometry(node, nets);
  return {
    id: `fp_${node.id}`,
    componentId: node.id,
    componentType: node.type,
    name: node.name,
    packageType: geom.packageType,
    pads: geom.pads,
    rotation: 0,
    width: geom.width,
    height: geom.height,
    x: 20 + col * 18,
    y: 20 + Math.floor(index / 5) * 18,
  };
}

function refreshFootprint(existing: PcbFootprint, node: CanvasNode, nets?: PinNets): PcbFootprint {
  const geom = generatePcbFootprintGeometry(node, nets);

  // If pin layout changed, rebuild geometry while preserving placement and rotation
  if (existing.pads.length !== geom.pads.length || geom.pads.some((pad, i) => pad.id !== existing.pads[i]?.id)) {
    return {
      ...existing,
      packageType: geom.packageType,
      pads: geom.pads,
      width: geom.width,
      height: geom.height,
      name: node.name,
      componentType: node.type,
    };
  }

  // Preserve existing pad placement & rotation, but update netId & name
  const pads = existing.pads.map((pad, i) => {
    const updatedNetId = nets?.get(pad.id);
    const updatedName = geom.pads[i]?.name || pad.name;
    if (pad.netId === updatedNetId && pad.name === updatedName) return pad;
    return { ...pad, name: updatedName, netId: updatedNetId };
  });

  const nextPads = sameItems(pads, existing.pads) ? existing.pads : pads;
  if (nextPads === existing.pads && existing.name === node.name && existing.componentType === node.type && existing.packageType === geom.packageType) {
    return existing;
  }
  return {
    ...existing,
    name: node.name,
    componentType: node.type,
    packageType: geom.packageType,
    pads: nextPads,
  };
}

/** One instance per loaded PCB document, retained across scene remounts. */
export class PcbSchematicSync {
  private ratlineEngine = new RatlineEngine();
  private nodes: CanvasNode[] = [];
  private wires: Wire[] = [];
  private pinNets = new Map<string, PinNets>();
  private previous = new Map<string, { node: CanvasNode; footprint: PcbFootprint; nets?: PinNets }>();
  // Match the schematic's 50-entry history bound, without retaining entire scenes.
  private removed: Map<string, PcbFootprint>[] = [];
  private ratlineGeometry: PcbFootprint[] = [];
  private traces?: PcbTrace[];
  private ratlines: Ratline[] = [];

  reconcile(nodes: CanvasNode[], wires: Wire[], footprints: PcbFootprint[], traces: PcbTrace[]) {
    const nodesChanged =
      nodes !== this.nodes && (nodes.length !== this.nodes.length || nodes.some((node, i) => node !== this.nodes[i]));
    const connectionsChanged =
      wires !== this.wires &&
      (wires.length !== this.wires.length || wires.some((wire, i) => !sameConnection(wire, this.wires[i])));

    if (connectionsChanged || nodesChanged) {
      const netlist = buildCircuitNetlist(nodes, wires);
      const next = new Map<string, Map<string, string>>();

      const connectedKeys = new Set<string>();
      for (const wire of wires) {
        connectedKeys.add(`${wire.fromNodeId}:${wire.fromPinId}`);
        connectedKeys.add(`${wire.toNodeId}:${wire.toPinId}`);
      }

      for (const net of netlist.nodes) {
        const isConnectedNet =
          net.pins.length >= 2 || net.pins.some((p) => connectedKeys.has(`${p.nodeId}:${p.pinId}`));
        if (!isConnectedNet) continue;

        let canonicalNetId = net.id;
        const groundPin = net.pins.find((p) => isGroundLabel({ id: p.pinId, name: p.pinName }));
        if (groundPin) {
          canonicalNetId = 'GND';
        } else {
          const pwrPin = net.pins.find((p) => /^(5V|3V3|3\.3V|VIN|VCC)$/i.test(p.pinName || p.pinId));
          if (pwrPin) {
            canonicalNetId = (pwrPin.pinName || pwrPin.pinId).toUpperCase().replace(/\./g, '_');
          } else {
            const firstIncident = wires.find((w) =>
              net.pins.some(
                (p) =>
                  (w.fromNodeId === p.nodeId && w.fromPinId === p.pinId) ||
                  (w.toNodeId === p.nodeId && w.toPinId === p.pinId)
              )
            );
            if (firstIncident) {
              canonicalNetId = firstIncident.id;
            }
          }
        }

        for (const pin of net.pins) {
          let pins = next.get(pin.nodeId);
          if (!pins) {
            pins = new Map();
            next.set(pin.nodeId, pins);
          }
          pins.set(pin.pinId, canonicalNetId);
        }
      }
      this.pinNets = next;
    }
    this.nodes = nodes;
    this.wires = wires;

    const existing = new Map(footprints.map((fp) => [fp.componentId, fp]));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const removed = new Map(footprints.filter((fp) => !nodeIds.has(fp.componentId)).map((fp) => [fp.componentId, fp]));
    if (removed.size) {
      this.removed.push(removed);
      if (this.removed.length > 50) this.removed.shift();
    }
    const occupied = new Set(footprints.map((fp) => `${fp.x}:${fp.y}`));
    let placement = footprints.length;
    const previous = this.previous;
    this.previous = new Map();
    const reconciled = nodes.map((node) => {
      let fp = existing.get(node.id);
      if (!fp) {
        for (let i = this.removed.length - 1; i >= 0; i--) {
          fp = this.removed[i].get(node.id);
          if (fp) break;
        }
      }
      const nets = this.pinNets.get(node.id);
      const cached = previous.get(node.id);
      if (!fp) {
        while (occupied.has(`${20 + (placement % 5) * 18}:${20 + Math.floor(placement / 5) * 18}`)) placement++;
        fp = createFootprint(node, placement++, nets);
      } else if (cached?.node !== node || cached.footprint !== fp || cached.nets !== nets) {
        fp = refreshFootprint(fp, node, nets);
      }
      occupied.add(`${fp.x}:${fp.y}`);
      this.previous.set(node.id, { node, footprint: fp, nets });
      return fp;
    });
    const nextFootprints = sameItems(reconciled, footprints) ? footprints : reconciled;

    // Disconnected pads cannot emit ratlines. Keeping only connected components
    // lets an isolated part or a metadata edit leave the existing ratlines alone.
    const geometry = nextFootprints.filter((fp) =>
      fp.pads.some((pad) => this.pinNets.get(fp.componentId)?.has(pad.id))
    );
    const geometryChanged =
      geometry.length !== this.ratlineGeometry.length ||
      geometry.some((fp, i) => !sameGeometry(fp, this.ratlineGeometry[i]));
    if (connectionsChanged || geometryChanged || traces !== this.traces) {
      this.ratlines = RatlineEngine.computeRatlines(nodes, wires, geometry, traces, this.ratlineEngine);
      this.ratlineGeometry = geometry;
      this.traces = traces;
    }
    return { footprints: nextFootprints, ratlines: this.ratlines };
  }
}
