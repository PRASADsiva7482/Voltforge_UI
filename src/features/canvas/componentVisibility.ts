import type { CanvasNode } from './canvasTypes';
import type { ViewportTransform, WorldBounds } from './renderBudget';

// The Stage publishes pan position every 64 screen pixels. Entry overscan must
// exceed that distance; the larger exit margin avoids repeated edge remounts.
export const COMPONENT_ENTER_MARGIN = 128;
export const COMPONENT_EXIT_MARGIN = 384;
export const COMPONENT_DETAIL_SCALE = 0.7;
const CELL_SIZE = 512;
const intersects = (a: WorldBounds, b: WorldBounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** The dragged node is explicitly retained and paints from its own subscription.
 * Freeze only its preview geometry so a gesture does not rerender the entire
 * scene. Other edits, additions/removals and gesture completion still publish. */
export function createComponentVisibilitySnapshot() {
  let snapshot: CanvasNode[] = [];
  return (state: { documentNodes: CanvasNode[]; draggingNodeId: string | null }): CanvasNode[] => {
    const next = state.documentNodes;
    if (next === snapshot) return snapshot;
    if (state.draggingNodeId && next.length === snapshot.length && next.every((node, index) =>
      node === snapshot[index] || (node.id === state.draggingNodeId && node.id === snapshot[index].id))) return snapshot;
    snapshot = next;
    return snapshot;
  };
}

export function componentViewportBounds(view: ViewportTransform, width: number, height: number, margin = COMPONENT_ENTER_MARGIN): WorldBounds {
  const scale = Math.max(0.05, view.scale);
  return { minX: (-view.x - margin) / scale, minY: (-view.y - margin) / scale, maxX: (width - view.x + margin) / scale, maxY: (height - view.y + margin) / scale };
}

/** Conservative bounds include physical pins, text, glow and simulation handles,
 * independent of live simulation state so runtime ticks never rebuild the index. */
export function componentWorldBounds(node: CanvasNode): WorldBounds {
  let minX = -64, minY = -64, maxX = Math.max(node.width, 120) + 64, maxY = Math.max(node.height, 70) + 64;
  const include = (x: number, y: number, radius: number) => {
    minX = Math.min(minX, x - radius); minY = Math.min(minY, y - radius);
    maxX = Math.max(maxX, x + radius); maxY = Math.max(maxY, y + radius);
  };
  if (/LED|LAMP|BULB/i.test(`${node.type} ${node.name || ''}`)) include(node.width / 2, node.height / 2 - 10, node.width * .9 + 50);
  if (['LDR', 'SENSOR_LDR', 'SOIL_MOISTURE'].includes(node.type)) {
    const value = Number(node.properties?.[node.type === 'SOIL_MOISTURE' ? 'moistureLevel' : 'lightLevel'] ?? 50);
    include(node.width / 2 + 120, node.height / 2, 30);
    include(node.width / 2 + 120 - value, node.height / 2, 30);
  }
  if (['PIR_SENSOR', 'SENSOR_PIR'].includes(node.type)) {
    include(node.width / 2, node.height / 2, 150);
    include(node.width / 2 + Number(node.properties?.intruderX ?? 100), node.height / 2 + Number(node.properties?.intruderY ?? 0), 20);
  }
  for (const pin of node.pins ?? []) {
    // Pin labels can rotate -90 degrees or wrap at 42px. A square envelope
    // also covers the 75px probe tooltip and magnetic hit/glow regions.
    const labelSize = String(pin.name ?? '').length * 8 + 20;
    include(pin.x, pin.y, Math.max(100, labelSize));
  }
  // Fallback type text has no fixed width; unlike the name it does not wrap.
  maxX = Math.max(maxX, 6 + node.type.length * 7);
  const nameLines = String(node.name ?? '').split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor((node.width - 12) / 10)))), 0);
  maxY = Math.max(maxY, 6 + nameLines * 10 + 8);
  const rad = (node.rotation || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const corners = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]].map(([x, y]) => ({ x: node.x + x * cos - y * sin, y: node.y + x * sin + y * cos }));
  const result = { minX: Math.min(...corners.map(p => p.x)), minY: Math.min(...corners.map(p => p.y)), maxX: Math.max(...corners.map(p => p.x)), maxY: Math.max(...corners.map(p => p.y)) };
  return Object.values(result).every(Number.isFinite) ? result : { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
}

export class ComponentBoundsCache {
  private bounds = new WeakMap<CanvasNode, WorldBounds>();
  get(node: CanvasNode): WorldBounds {
    let value = this.bounds.get(node);
    if (!value) { value = componentWorldBounds(node); this.bounds.set(node, value); }
    return value;
  }
}

/** An index of the complete authored document; it never edits or filters store data. */
export class ComponentSpatialIndex {
  private entries: { node: CanvasNode; bounds: WorldBounds; order: number }[];
  private cells = new Map<string, number[]>();
  private oversized: number[] = [];
  private byId = new Map<string, number>();
  constructor(nodes: CanvasNode[], cache = new ComponentBoundsCache()) {
    this.entries = nodes.map((node, order) => ({ node, bounds: cache.get(node), order }));
    for (const { node, bounds, order } of this.entries) {
      this.byId.set(node.id, order);
      const [x0, y0, x1, y1] = this.cellsFor(bounds);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) { this.oversized.push(order); continue; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`, cell = this.cells.get(key);
        if (cell) cell.push(order); else this.cells.set(key, [order]);
      }
    }
  }
  private cellsFor(b: WorldBounds) { return [b.minX, b.minY, b.maxX, b.maxY].map(v => Math.floor(v / CELL_SIZE)); }
  select(view: ViewportTransform, width: number, height: number, previous: ReadonlySet<string>, retained: ReadonlySet<string>): CanvasNode[] {
    if (width <= 0 || height <= 0) return this.entries.filter(e => retained.has(e.node.id)).map(e => e.node);
    const enter = componentViewportBounds(view, width, height), exit = componentViewportBounds(view, width, height, COMPONENT_EXIT_MARGIN);
    const [x0, y0, x1, y1] = this.cellsFor(enter), candidates = new Set(this.oversized);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) this.entries.forEach(e => candidates.add(e.order));
    else for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const order of this.cells.get(`${x}:${y}`) ?? []) candidates.add(order);
    for (const id of [...previous, ...retained]) { const order = this.byId.get(id); if (order !== undefined) candidates.add(order); }
    return [...candidates].sort((a, b) => a - b).flatMap(order => {
      const { node, bounds } = this.entries[order];
      return retained.has(node.id) || intersects(bounds, previous.has(node.id) ? exit : enter) ? [node] : [];
    });
  }
}
