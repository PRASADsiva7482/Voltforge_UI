import type { CanvasNode, Wire, WireBendPoint } from '../types';

export const ROUTING_GRID = 10;

interface Point {
  x: number;
  y: number;
}

interface Cell {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RouteRecord extends Cell {
  g: number;
  f: number;
  dir: string;
  parent?: string;
}

const keyOf = (cell: Cell) => `${cell.x},${cell.y}`;
const snap = (value: number) => Math.round(value / ROUTING_GRID) * ROUTING_GRID;

/**
 * Get the absolute (world-space) position of a pin on a node.
 *
 * Konva renders the <Group> with:
 *   x={node.x}  y={node.y}  rotation={node.rotation}  offsetX={0}  offsetY={0}
 *
 * That means Konva transforms local children as:
 *   global = translate(node.x, node.y) × rotate(rotation) × local
 *
 * So a pin at local (pin.x, pin.y) maps to:
 *   gx = node.x + pin.x·cos(θ) − pin.y·sin(θ)
 *   gy = node.y + pin.x·sin(θ) + pin.y·cos(θ)
 *
 * HOWEVER the Konva Transformer, when the user rotates a component, adjusts
 * (node.x, node.y) so that the visual rotation appears to pivot around the
 * **center** of the bounding box.  After that adjustment the stored (x,y) already
 * incorporate the offset, so the formula above is exactly what matches the
 * on-screen rendering.
 */
export function getPinAbsPos(node: CanvasNode, pinId: string): Point | null {
  const pin = node.pins?.find((p) => p.id === pinId);
  if (!pin) return null;

  const rad = ((node.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: node.x + pin.x * cos - pin.y * sin,
    y: node.y + pin.x * sin + pin.y * cos,
  };
}

export function routeWireBetweenNodes(wire: Wire, nodes: CanvasNode[]): WireBendPoint[] {
  const from = nodes.find((node) => node.id === wire.fromNodeId);
  const to = nodes.find((node) => node.id === wire.toNodeId);
  if (!from || !to) return wire.bendPoints || [];

  const start = getPinAbsPos(from, wire.fromPinId);
  const end = getPinAbsPos(to, wire.toPinId);
  if (!start || !end) return wire.bendPoints || [];

  return routeAroundComponents(start, end, nodes, new Set([from.id, to.id]));
}

export function rerouteAutoWires(nodes: CanvasNode[], wires: Wire[]): Wire[] {
  return wires.map((wire) => {
    if (wire.routingMode !== 'auto') return wire;
    return { ...wire, bendPoints: routeWireBetweenNodes(wire, nodes) };
  });
}

export function snapToRoutingGuides(point: Point, anchors: Point[], threshold = 6): Point {
  let x = point.x;
  let y = point.y;
  for (const anchor of anchors) {
    if (Math.abs(anchor.x - point.x) <= threshold) x = anchor.x;
    if (Math.abs(anchor.y - point.y) <= threshold) y = anchor.y;
  }
  return { x, y };
}

export function getWireRenderPoints(wire: Wire, nodes: CanvasNode[], bendPoints = wire.bendPoints || []): number[] {
  const from = nodes.find((node) => node.id === wire.fromNodeId);
  const to = nodes.find((node) => node.id === wire.toNodeId);
  if (!from || !to) return [];

  const start = getPinAbsPos(from, wire.fromPinId);
  const end = getPinAbsPos(to, wire.toPinId);
  if (!start || !end) return [];

  if (wire.routingMode !== 'orthogonal' && wire.routingMode !== 'auto') {
    return [start, ...bendPoints, end].flatMap((point) => [point.x, point.y]);
  }

  const raw = [start, ...bendPoints, end];
  const points: number[] = [];
  for (let i = 0; i < raw.length - 1; i += 1) {
    const p1 = raw[i];
    const p2 = raw[i + 1];
    points.push(p1.x, p1.y);
    if (Math.abs(p1.x - p2.x) > 2 && Math.abs(p1.y - p2.y) > 2) {
      const horizontalFirst = Math.abs(p1.x - p2.x) >= Math.abs(p1.y - p2.y);
      points.push(horizontalFirst ? p2.x : p1.x, horizontalFirst ? p1.y : p2.y);
    }
  }
  points.push(end.x, end.y);
  return points;
}

export function routeAroundComponents(
  start: Point,
  end: Point,
  nodes: CanvasNode[],
  excludedNodeIds = new Set<string>(),
): WireBendPoint[] {
  const bounds = buildRouteBounds(start, end, nodes);
  const toCell = (point: Point): Cell => ({
    x: Math.round((point.x - bounds.minX) / ROUTING_GRID),
    y: Math.round((point.y - bounds.minY) / ROUTING_GRID),
  });
  const toPoint = (cell: Cell): Point => ({
    x: bounds.minX + cell.x * ROUTING_GRID,
    y: bounds.minY + cell.y * ROUTING_GRID,
  });

  const cols = Math.max(2, Math.round((bounds.maxX - bounds.minX) / ROUTING_GRID));
  const rows = Math.max(2, Math.round((bounds.maxY - bounds.minY) / ROUTING_GRID));
  if (cols * rows > 60000) {
    return orthogonalFallback(start, end);
  }

  const blocked = buildObstacleGrid(nodes, excludedNodeIds, bounds, cols, rows);
  const startCell = toCell({ x: snap(start.x), y: snap(start.y) });
  const endCell = toCell({ x: snap(end.x), y: snap(end.y) });
  unblockAround(blocked, startCell);
  unblockAround(blocked, endCell);

  const route = findRoute(startCell, endCell, cols, rows, blocked);
  if (route.length === 0) {
    return orthogonalFallback(start, end);
  }

  const points = compressRoute(route.map(toPoint), start, end);
  return points.slice(1, -1).map((point) => ({ x: snap(point.x), y: snap(point.y) }));
}

function buildRouteBounds(start: Point, end: Point, nodes: CanvasNode[]): Bounds {
  const margin = 160;
  const xs = [start.x, end.x];
  const ys = [start.y, end.y];
  nodes.forEach((node) => {
    xs.push(node.x, node.x + node.width);
    ys.push(node.y, node.y + node.height);
  });

  return {
    minX: snap(Math.min(...xs) - margin),
    minY: snap(Math.min(...ys) - margin),
    maxX: snap(Math.max(...xs) + margin),
    maxY: snap(Math.max(...ys) + margin),
  };
}

function buildObstacleGrid(
  nodes: CanvasNode[],
  excludedNodeIds: Set<string>,
  bounds: Bounds,
  cols: number,
  rows: number,
): Set<string> {
  const blocked = new Set<string>();
  const padding = 18;

  nodes.forEach((node) => {
    if (excludedNodeIds.has(node.id)) return;

    const rect = {
      minX: node.x - padding,
      minY: node.y - padding,
      maxX: node.x + node.width + padding,
      maxY: node.y + node.height + padding,
    };

    const minCellX = clamp(Math.floor((rect.minX - bounds.minX) / ROUTING_GRID), 0, cols);
    const maxCellX = clamp(Math.ceil((rect.maxX - bounds.minX) / ROUTING_GRID), 0, cols);
    const minCellY = clamp(Math.floor((rect.minY - bounds.minY) / ROUTING_GRID), 0, rows);
    const maxCellY = clamp(Math.ceil((rect.maxY - bounds.minY) / ROUTING_GRID), 0, rows);

    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let y = minCellY; y <= maxCellY; y += 1) {
        blocked.add(keyOf({ x, y }));
      }
    }
  });

  return blocked;
}

function findRoute(start: Cell, end: Cell, cols: number, rows: number, blocked: Set<string>): Cell[] {
  const open = new Map<string, RouteRecord>();
  const closed = new Set<string>();
  const closedRecords = new Map<string, RouteRecord>();
  open.set(keyOf(start), {
    ...start,
    g: 0,
    f: manhattan(start, end),
    dir: '',
  });

  while (open.size > 0) {
    const current = lowestCost(open);
    const currentKey = keyOf(current);
    open.delete(currentKey);
    closed.add(currentKey);

    if (current.x === end.x && current.y === end.y) {
      return reconstruct(current, closedRecords);
    }

    closedRecords.set(currentKey, current);

    for (const next of neighbors(current)) {
      if (next.x < 0 || next.y < 0 || next.x > cols || next.y > rows) continue;
      const nextKey = keyOf(next);
      if (blocked.has(nextKey) || closed.has(nextKey)) continue;

      const direction = `${next.x - current.x},${next.y - current.y}`;
      const turnPenalty = current.dir && current.dir !== direction ? 0.18 : 0;
      const g = current.g + 1 + turnPenalty;
      const existing = open.get(nextKey);

      if (!existing || g < existing.g) {
        open.set(nextKey, {
          ...next,
          g,
          f: g + manhattan(next, end),
          dir: direction,
          parent: currentKey,
        });
      }
    }
  }

  return [];
}

function reconstruct(current: RouteRecord, closedRecords: Map<string, RouteRecord>): Cell[] {
  const path: Cell[] = [];
  let cursor: RouteRecord | undefined = current;
  while (cursor) {
    path.push({ x: cursor.x, y: cursor.y });
    cursor = cursor.parent ? closedRecords.get(cursor.parent) : undefined;
  }
  return path.reverse();
}

function lowestCost(open: Map<string, RouteRecord>): RouteRecord {
  let best: RouteRecord | null = null;
  for (const record of open.values()) {
    if (!best || record.f < best.f) {
      best = record;
    }
  }
  return best!;
}

function neighbors(cell: Cell): Cell[] {
  return [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ];
}

function manhattan(a: Cell, b: Cell) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function compressRoute(points: Point[], exactStart: Point, exactEnd: Point): Point[] {
  if (points.length <= 2) {
    return [exactStart, exactEnd];
  }

  const compressed: Point[] = [exactStart];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const sameX = prev.x === current.x && current.x === next.x;
    const sameY = prev.y === current.y && current.y === next.y;
    if (!sameX && !sameY) {
      compressed.push(current);
    }
  }
  compressed.push(exactEnd);
  return compressed;
}

function orthogonalFallback(start: Point, end: Point): WireBendPoint[] {
  if (Math.abs(start.x - end.x) <= ROUTING_GRID || Math.abs(start.y - end.y) <= ROUTING_GRID) {
    return [];
  }
  const midX = snap((start.x + end.x) / 2);
  return [
    { x: midX, y: snap(start.y) },
    { x: midX, y: snap(end.y) },
  ];
}

function unblockAround(blocked: Set<string>, cell: Cell) {
  for (let x = cell.x - 1; x <= cell.x + 1; x += 1) {
    for (let y = cell.y - 1; y <= cell.y + 1; y += 1) {
      blocked.delete(keyOf({ x, y }));
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Shortest perpendicular distance from point (px,py) to line segment (p1→p2).
 * Used for accurate bend-point insertion on wire click.
 */
export function distToSegment(
  px: number, py: number,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - p1.x, py - p1.y);
  let t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (p1.x + t * dx), py - (p1.y + t * dy));
}
