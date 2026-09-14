import type { CanvasNode, Wire } from '../../types/domain';
import { getPinAbsPos, ROUTING_GRID } from '../../utils/wireRouting';

export function indexIncidentWires(wires: Wire[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  wires.forEach((wire, position) => {
    for (const id of new Set([wire.fromNodeId, wire.toNodeId])) {
      const entries = index.get(id) ?? []; entries.push(position); index.set(id, entries);
    }
  });
  return index;
}

export function sameNodeGeometry(a: CanvasNode, b: CanvasNode): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.rotation === b.rotation
    && (a.pins === b.pins || JSON.stringify(a.pins) === JSON.stringify(b.pins));
}

const extent = (nodes: CanvasNode[]) => [
  Math.round(Math.min(...nodes.map(n => n.x)) / ROUTING_GRID),
  Math.round(Math.min(...nodes.map(n => n.y)) / ROUTING_GRID),
  Math.round(Math.max(...nodes.map(n => n.x + n.width)) / ROUTING_GRID),
  Math.round(Math.max(...nodes.map(n => n.y + n.height)) / ROUTING_GRID),
].join(',');

/** Worker-only conservative invalidation. Keep valid routes outside both the
 * old and new obstacle corridors; reroute all if the router's grid bounds shift.
 * previousNodes is supplied only for a versioned, valid pre-gesture layout. */
export function affectedDragRoutes(nodes: CanvasNode[], wires: Wire[], previousNodes?: CanvasNode[]): Set<string> {
  const all = () => new Set(wires.filter(w => w.routingMode === 'auto').map(w => w.id));
  if (!previousNodes || nodes.length !== previousNodes.length || nodes.some((n, i) => n.id !== previousNodes[i].id)
    || extent(nodes) !== extent(previousNodes)) return all();
  const changed = nodes.filter((node, i) => !sameNodeGeometry(node, previousNodes[i]));
  const oldById = new Map(previousNodes.map(node => [node.id, node]));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const adjacency = indexIncidentWires(wires), affected = new Set<string>();
  for (const node of changed) for (const index of adjacency.get(node.id) ?? []) {
    if (wires[index].routingMode === 'auto') affected.add(wires[index].id);
  }
  // 18 px router obstacle padding plus conservative grid rounding allowance.
  const padding = 18 + 3 * ROUTING_GRID;
  for (const wire of wires) {
    if (wire.routingMode !== 'auto' || affected.has(wire.id)) continue;
    const from = byId.get(wire.fromNodeId), to = byId.get(wire.toNodeId);
    const start = from && getPinAbsPos(from, wire.fromPinId), end = to && getPinAbsPos(to, wire.toPinId);
    if (!start || !end) { affected.add(wire.id); continue; }
    const points = [start, ...wire.bendPoints, end];
    const minX = Math.min(...points.map(p => p.x)) - padding, maxX = Math.max(...points.map(p => p.x)) + padding;
    const minY = Math.min(...points.map(p => p.y)) - padding, maxY = Math.max(...points.map(p => p.y)) + padding;
    if (changed.some(node => [node, oldById.get(node.id)!].some(obstacle =>
      obstacle.x <= maxX && obstacle.x + obstacle.width >= minX && obstacle.y <= maxY && obstacle.y + obstacle.height >= minY))) affected.add(wire.id);
  }
  return affected;
}
