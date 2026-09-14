import type { CanvasNode, CanvasRouteCache, Wire } from '../../types/domain';

export const CANVAS_ROUTE_VERSION = 'vf-grid-route-1';

function geometryKey(nodes: CanvasNode[]): string {
  return JSON.stringify(nodes.map(node => [node.id, node.x, node.y, node.width, node.height, node.rotation,
    node.pins.map(pin => [pin.id, pin.name, pin.x, pin.y]) ]));
}

function wiresKey(wires: Wire[]): string {
  return JSON.stringify(wires.map(wire => [wire.id, wire.fromNodeId, wire.fromPinId, wire.toNodeId, wire.toPinId,
    wire.routingMode, wire.bendPoints.map(point => [point.x, point.y]) ]));
}

// Exact compact tuple strings avoid hash collisions. These are derived only on
// load/worker completion, never on a runtime update or dirty-state subscription.
export function createCanvasRouteCache(nodes: CanvasNode[], wires: Wire[]): CanvasRouteCache {
  return { version: CANVAS_ROUTE_VERSION, geometryKey: geometryKey(nodes), wiresKey: wiresKey(wires) };
}

export function isCanvasRouteCacheValid(cache: unknown, nodes: CanvasNode[], wires: Wire[]): cache is CanvasRouteCache {
  if (!cache || typeof cache !== 'object') return false;
  const candidate = cache as Partial<CanvasRouteCache>;
  if (candidate.version !== CANVAS_ROUTE_VERSION || typeof candidate.geometryKey !== 'string' || typeof candidate.wiresKey !== 'string') return false;
  if (wires.some(wire => !Array.isArray(wire.bendPoints) || wire.bendPoints.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y)))) return false;
  return candidate.geometryKey === geometryKey(nodes) && candidate.wiresKey === wiresKey(wires);
}

/** The router reads geometry and pin names only, not firmware/runtime properties. */
export function routingNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map(node => ({ ...node, properties: {}, name: '', componentId: '' }));
}
