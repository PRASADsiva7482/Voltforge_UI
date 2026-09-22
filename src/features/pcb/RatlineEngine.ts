import type { CanvasNode, Wire } from '../../types/domain';
import type { PcbFootprint, PcbTrace, Ratline } from '../../store/pcbStore';

type PadPoint = Ratline['from'] & { pinKey: string };
type NetEntry = { points: PadPoint[]; tree: Ratline[]; visible: Ratline[] };
type EndpointPair = { from: { x: number; y: number }; to: { x: number; y: number } };
const pinKey = (componentId: string, padId: string) => `${componentId}:${padId}`;
const sameItems = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item, i) => item === b[i]);
const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
const sameConnection = (a: Wire, b: Wire) => a === b || (a.fromNodeId === b.fromNodeId
  && a.fromPinId === b.fromPinId && a.toNodeId === b.toNodeId && a.toPinId === b.toPinId);
const sameGeometry = (a: PcbFootprint, b: PcbFootprint) => a === b || (a.componentId === b.componentId
  && a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.pads.length === b.pads.length
  && a.pads.every((p, i) => p.id === b.pads[i].id && p.x === b.pads[i].x && p.y === b.pads[i].y));

/** Index both orientations of trace endpoints. Preserve the existing coordinate-only
 * suppression rule, including its strict tolerance and independence from net labels. */
class TraceEndpointIndex {
  private endpoints: EndpointPair[] = [];
  private cells = new Map<string, EndpointPair[]>();

  update(traces: PcbTrace[]): boolean {
    const endpoints = traces.filter(t => t.points.length >= 2).map(t => ({
      from: t.points[0], to: t.points[t.points.length - 1],
    }));
    if (endpoints.length === this.endpoints.length && endpoints.every((pair, i) => {
      const old = this.endpoints[i];
      return pair.from.x === old.from.x && pair.from.y === old.from.y
        && pair.to.x === old.to.x && pair.to.y === old.to.y;
    })) return false;
    this.endpoints = endpoints;
    this.cells.clear();
    const insert = (pair: EndpointPair) => {
      if (![pair.from.x, pair.from.y, pair.to.x, pair.to.y].every(Number.isFinite)) return;
      const key = `${Math.floor(pair.from.x / 0.05)}:${Math.floor(pair.from.y / 0.05)}`;
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(pair); else this.cells.set(key, [pair]);
    };
    for (const pair of endpoints) { insert(pair); insert({ from: pair.to, to: pair.from }); }
    return true;
  }

  has(from: PadPoint, to: PadPoint): boolean {
    if (!this.cells.size) return false;
    const x = Math.floor(from.x / 0.05), y = Math.floor(from.y / 0.05);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const bucket = this.cells.get(`${x + dx}:${y + dy}`);
      if (bucket?.some(pair => samePoint(pair.from, from) && samePoint(pair.to, to))) return true;
    }
    return false;
  }
}

function edge(netId: string, points: PadPoint[], from: number, to: number): Ratline {
  return { id: `rat_${netId}_${from}_${to}`, netId, from: points[from], to: points[to] };
}

/** Compatibility for malformed imported coordinates; finite documents use Prim below. */
function legacyNonfiniteTree(points: PadPoint[], netId: string): Ratline[] {
  const connected = new Set([0]), tree: Ratline[] = [];
  while (connected.size < points.length) {
    let best: { from: number; to: number; distance: number } | undefined;
    connected.forEach(from => points.forEach((point, to) => {
      if (connected.has(to)) return;
      const distance = Math.hypot(points[from].x - point.x, points[from].y - point.y);
      if (!best || distance < best.distance) best = { from, to, distance };
    }));
    if (!best) break;
    const chosen = best as { from: number; to: number };
    connected.add(chosen.to);
    tree.push(edge(netId, points, chosen.from, chosen.to));
  }
  return tree;
}

/** Dense Prim: evaluate each unordered pad pair once, with 17 bytes/pad of
 * temporary typed-array workspace rather than retaining a distance matrix. */
function buildTree(points: PadPoint[], netId: string): Ratline[] {
  const count = points.length;
  if (count < 2) return [];
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return legacyNonfiniteTree(points, netId);
  const distances = new Float64Array(count).fill(Infinity);
  const nearest = new Int32Array(count);
  const order = new Int32Array(count);
  const selected = new Uint8Array(count);
  const tree: Ratline[] = [];
  let current = 0;
  selected[0] = 1;
  for (let step = 1; step < count; step++) {
    for (let to = 0; to < count; to++) {
      if (selected[to]) continue;
      // Keep Math.hypot to retain the former comparison's rounding and ties.
      const distance = Math.hypot(points[current].x - points[to].x, points[current].y - points[to].y);
      if (distance < distances[to]) { distances[to] = distance; nearest[to] = current; }
    }
    let best = -1;
    for (let to = 0; to < count; to++) {
      if (selected[to]) continue;
      if (best < 0 || distances[to] < distances[best]
        || (distances[to] === distances[best] && order[nearest[to]] < order[nearest[best]])) best = to;
    }
    // Original iteration order was connected-insertion-order, then pad index.
    // Equal nearest distances keep the earlier parent; scanning pad indices
    // ascending supplies the final tie-break without changing saved ratline IDs.
    const from = nearest[best];
    tree.push(edge(netId, points, from, best));
    selected[best] = 1; order[best] = step; current = best;
  }
  return tree;
}

/** A cache belongs to one PCB synchronization session; all maps are pruned to
 * current footprints/nets on every update. The static API remains stateless
 * unless a caller supplies its owned cache. */
export class RatlineEngine {
  private wires: Wire[] = [];
  private parent = new Map<string, string>();
  private footprintCache = new Map<string, { footprint: PcbFootprint; points: PadPoint[] }>();
  private netCache = new Map<string, NetEntry>();
  private traceIndex = new TraceEndpointIndex();
  private traces?: PcbTrace[];
  private output: Ratline[] = [];

  public static computeRatlines(nodes: CanvasNode[], wires: Wire[], footprints: PcbFootprint[], traces: PcbTrace[], cache?: RatlineEngine): Ratline[] {
    return (cache ?? new RatlineEngine()).update(nodes, wires, footprints, traces);
  }

  private find(key: string): string {
    // Unwired pads are singleton nets; do not retain them in the topology map.
    let root = key;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let current = key;
    while (this.parent.has(current) && this.parent.get(current) !== root) {
      const next = this.parent.get(current)!; this.parent.set(current, root); current = next;
    }
    return root;
  }

  private update(_nodes: CanvasNode[], wires: Wire[], footprints: PcbFootprint[], traces: PcbTrace[]): Ratline[] {
    if (wires !== this.wires && (wires.length !== this.wires.length || wires.some((w, i) => !sameConnection(w, this.wires[i])))) {
      this.parent.clear();
      // Roots are determined by ordered wire endpoints. Pre-registering every
      // schematic pin (including missing/unplaced components) cannot alter union.
      for (const wire of wires) {
        const from = this.find(pinKey(wire.fromNodeId, wire.fromPinId));
        const to = this.find(pinKey(wire.toNodeId, wire.toPinId));
        if (from !== to) this.parent.set(to, from);
      }
    }
    this.wires = wires;
    const tracesChanged = traces !== this.traces && this.traceIndex.update(traces);
    this.traces = traces;

    const footprintCache = new Map<string, { footprint: PcbFootprint; points: PadPoint[] }>();
    const nets = new Map<string, PadPoint[]>();
    for (const footprint of footprints) {
      const old = this.footprintCache.get(footprint.componentId);
      let points: PadPoint[];
      if (old && sameGeometry(old.footprint, footprint)) points = old.points;
      else {
        const radians = ((footprint.rotation || 0) * Math.PI) / 180;
        const cosine = Math.cos(radians), sine = Math.sin(radians);
        points = footprint.pads.map(pad => ({
          x: footprint.x + pad.x * cosine - pad.y * sine,
          y: footprint.y + pad.x * sine + pad.y * cosine,
          padId: pad.id, componentId: footprint.componentId, pinKey: pinKey(footprint.componentId, pad.id),
        }));
      }
      footprintCache.set(footprint.componentId, old?.footprint === footprint ? old : { footprint, points });
      for (const point of points) {
        const root = this.find(point.pinKey), net = nets.get(root);
        if (net) net.push(point); else nets.set(root, [point]);
      }
    }
    this.footprintCache = footprintCache;
    const netCache = new Map<string, NetEntry>(), output: Ratline[] = [];
    for (const [netId, points] of nets) {
      if (points.length < 2) continue;
      const old = this.netCache.get(netId), unchanged = old && sameItems(points, old.points);
      const tree = unchanged ? old.tree : buildTree(points, netId);
      let visible = unchanged && !tracesChanged ? old.visible : tree.filter(r => !this.traceIndex.has(r.from as PadPoint, r.to as PadPoint));
      if (old && sameItems(visible, old.visible)) visible = old.visible;
      netCache.set(netId, { points: unchanged ? old.points : points, tree, visible });
      for (const ratline of visible) output.push(ratline);
    }
    this.netCache = netCache;
    if (!sameItems(output, this.output)) this.output = output;
    return this.output;
  }
}
