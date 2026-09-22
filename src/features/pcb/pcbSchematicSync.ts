import type { CanvasNode, Wire } from '../../types/domain';
import type { PcbFootprint, PcbTrace, Ratline } from '../../store/pcbStore';
import { RatlineEngine } from './RatlineEngine';

type PinNets = Map<string, string>;
const sameItems = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item, i) => item === b[i]);
const sameConnection = (a: Wire, b: Wire) => a === b || (a.id === b.id
  && a.fromNodeId === b.fromNodeId && a.fromPinId === b.fromPinId
  && a.toNodeId === b.toNodeId && a.toPinId === b.toPinId);
const sameGeometry = (a: PcbFootprint, b: PcbFootprint) => a === b || (a.componentId === b.componentId
  && a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.pads.length === b.pads.length
  && a.pads.every((pad, i) => pad.id === b.pads[i].id && pad.x === b.pads[i].x && pad.y === b.pads[i].y));
const packageType = (node: CanvasNode) => String(node.properties?.footprint || (node.pins.length > 20 ? 'QFP' : 'DIP'));

function createFootprint(node: CanvasNode, index: number, nets?: PinNets): PcbFootprint {
  const col = index % 5;
  const pads = node.pins.map((pin, i) => ({
    id: pin.id, name: pin.name, netId: nets?.get(pin.id),
    x: (i - (node.pins.length - 1) / 2) * 2.54, y: 3.5,
    width: 1.4, height: 1.4, shape: 'rect' as const, drillDiameter: 0.8,
  }));
  return {
    id: `fp_${node.id}`, componentId: node.id, componentType: node.type, name: node.name,
    packageType: packageType(node), pads, rotation: 0,
    width: Math.max(12, pads.length * 2.54 + 4), height: 10,
    x: 20 + col * 18, y: 20 + Math.floor(index / 5) * 18,
  };
}

function refreshFootprint(existing: PcbFootprint, node: CanvasNode, nets?: PinNets): PcbFootprint {
  // A changed pin layout needs a new generic pad layout. Metadata/net edits keep
  // saved pad geometry, pad IDs, placement, rotation and the footprint's identity.
  if (existing.pads.length !== node.pins.length || node.pins.some((pin, i) => pin.id !== existing.pads[i].id)) {
    return { ...createFootprint(node, 0, nets), id: existing.id, x: existing.x, y: existing.y, rotation: existing.rotation };
  }
  const pads = existing.pads.map((pad, i) => pad.name === node.pins[i].name && pad.netId === nets?.get(pad.id)
    ? pad : { ...pad, name: node.pins[i].name, netId: nets?.get(pad.id) });
  const nextPads = sameItems(pads, existing.pads) ? existing.pads : pads;
  const nextPackage = packageType(node);
  if (nextPads === existing.pads && existing.name === node.name
    && existing.componentType === node.type && existing.packageType === nextPackage) return existing;
  return { ...existing, name: node.name, componentType: node.type, packageType: nextPackage, pads: nextPads };
}

/** One instance per loaded PCB document, retained across scene remounts. */
export class PcbSchematicSync {
  private ratlineEngine = new RatlineEngine();
  private wires: Wire[] = [];
  private pinNets = new Map<string, PinNets>();
  private previous = new Map<string, { node: CanvasNode; footprint: PcbFootprint; nets?: PinNets }>();
  // Match the schematic's 50-entry history bound, without retaining entire scenes.
  private removed: Map<string, PcbFootprint>[] = [];
  private ratlineGeometry: PcbFootprint[] = [];
  private traces?: PcbTrace[];
  private ratlines: Ratline[] = [];

  reconcile(nodes: CanvasNode[], wires: Wire[], footprints: PcbFootprint[], traces: PcbTrace[]) {
    const connectionsChanged = wires !== this.wires
      && (wires.length !== this.wires.length || wires.some((wire, i) => !sameConnection(wire, this.wires[i])));
    if (connectionsChanged) {
      const next = new Map<string, Map<string, string>>();
      for (const wire of wires) {
        for (const [nodeId, pinId] of [[wire.fromNodeId, wire.fromPinId], [wire.toNodeId, wire.toPinId]]) {
          let pins = next.get(nodeId);
          if (!pins) { pins = new Map(); next.set(nodeId, pins); }
          // Preserve the existing saved/export convention: first incident wire ID.
          if (!pins.has(pinId)) pins.set(pinId, wire.id);
        }
      }
      for (const [id, pins] of next) {
        const old = this.pinNets.get(id);
        if (old?.size === pins.size && [...pins].every(([pin, net]) => old.get(pin) === net)) next.set(id, old);
      }
      this.pinNets = next;
    }
    this.wires = wires;

    const existing = new Map(footprints.map(fp => [fp.componentId, fp]));
    const nodeIds = new Set(nodes.map(node => node.id));
    const removed = new Map(footprints.filter(fp => !nodeIds.has(fp.componentId)).map(fp => [fp.componentId, fp]));
    if (removed.size) {
      this.removed.push(removed);
      if (this.removed.length > 50) this.removed.shift();
    }
    const occupied = new Set(footprints.map(fp => `${fp.x}:${fp.y}`));
    let placement = footprints.length;
    const previous = this.previous;
    this.previous = new Map();
    const reconciled = nodes.map(node => {
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
    const geometry = nextFootprints.filter(fp => fp.pads.some(pad => this.pinNets.get(fp.componentId)?.has(pad.id)));
    const geometryChanged = geometry.length !== this.ratlineGeometry.length
      || geometry.some((fp, i) => !sameGeometry(fp, this.ratlineGeometry[i]));
    if (connectionsChanged || geometryChanged || traces !== this.traces) {
      this.ratlines = RatlineEngine.computeRatlines(nodes, wires, geometry, traces, this.ratlineEngine);
      this.ratlineGeometry = geometry;
      this.traces = traces;
    }
    return { footprints: nextFootprints, ratlines: this.ratlines };
  }
}
