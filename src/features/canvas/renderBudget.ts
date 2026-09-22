import type { CanvasNode } from '../../types/domain';
import { getPinAbsPos, getWireRenderPoints } from '../../utils/wireRouting';
import type { Wire } from './canvasTypes';

export type CurrentFlowQualityMode = 'adaptive' | 'full';

export interface CurrentFlowRenderBudget {
  qualityMode: CurrentFlowQualityMode;
  frameIntervalMs: number;
  particleSpacingWorld: number;
  maxParticles: number;
  maxParticlesPerWire: number;
  isLimited: boolean;
  limitLabel: string;
}

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CurrentFlowPolylineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  cumLength: number;
}

export interface CurrentFlowPath {
  wireId: string;
  totalLength: number;
  segments: CurrentFlowPolylineSegment[];
}

export interface PlannedCurrentFlowPath {
  path: CurrentFlowPath;
  currentA: number;
  particleCount: number;
}

export interface CurrentFlowParticlePlan {
  activePathCount: number;
  particleCount: number;
  paths: PlannedCurrentFlowPath[];
}

const VIEWPORT_OVERSCAN_PX = 96;
// Generated orthogonal routes can add pin stubs and lane separation beyond
// their endpoint box. Keep enough conservative world-space padding to avoid a
// visible route popping out when several pins connect the same component pair.
const AUTO_ROUTE_PADDING_WORLD = 256;
const OVERVIEW_SCALE = 0.7;
const DENSE_VISIBLE_WIRE_COUNT = 80;
const VERY_DENSE_VISIBLE_WIRE_COUNT = 220;
export const CURRENT_FLOW_VISIBILITY_THRESHOLD_A = 1e-6;

function viewportWorldBounds(
  viewport: ViewportTransform,
  width: number,
  height: number,
): WorldBounds {
  const scale = Math.max(0.05, viewport.scale || 1);
  const overscan = VIEWPORT_OVERSCAN_PX / scale;
  return {
    minX: -viewport.x / scale - overscan,
    minY: -viewport.y / scale - overscan,
    maxX: (-viewport.x + width) / scale + overscan,
    maxY: (-viewport.y + height) / scale + overscan,
  };
}

function boundsIntersect(a: WorldBounds, b: WorldBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function pointInsideBounds(point: Point, bounds: WorldBounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function segmentIntersectsBounds(start: Point, end: Point, bounds: WorldBounds): boolean {
  if (pointInsideBounds(start, bounds) || pointInsideBounds(end, bounds)) return true;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let lower = 0;
  let upper = 1;
  const clips: Array<[number, number]> = [
    [-dx, start.x - bounds.minX],
    [dx, bounds.maxX - start.x],
    [-dy, start.y - bounds.minY],
    [dy, bounds.maxY - start.y],
  ];

  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > upper) return false;
      lower = Math.max(lower, ratio);
    } else {
      if (ratio < lower) return false;
      upper = Math.min(upper, ratio);
    }
  }
  return lower <= upper;
}

function wireMayIntersectBounds(
  wire: Wire,
  nodesById: ReadonlyMap<string, CanvasNode>,
  viewportBounds: WorldBounds,
): boolean {
  const from = nodesById.get(wire.fromNodeId);
  const to = nodesById.get(wire.toNodeId);
  if (!from || !to) return false;

  const start = getPinAbsPos(from, wire.fromPinId);
  const end = getPinAbsPos(to, wire.toPinId);
  if (!start || !end) return false;

  const points: Point[] = [start, ...(wire.bendPoints || []), end];
  const padding = wire.routingMode === 'auto' ? AUTO_ROUTE_PADDING_WORLD : 12;
  const wireBounds = points.reduce<WorldBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x - padding),
    minY: Math.min(bounds.minY, point.y - padding),
    maxX: Math.max(bounds.maxX, point.x + padding),
    maxY: Math.max(bounds.maxY, point.y + padding),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });

  if (!boundsIntersect(wireBounds, viewportBounds)) return false;

  // Straight wires can have a very large bounding box without crossing the
  // viewport. Other modes add generated corners or curves, so their expanded
  // route bounds intentionally remain conservative.
  if (wire.routingMode !== 'straight') return true;
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBounds(points[index], points[index + 1], viewportBounds)) return true;
  }
  return false;
}

export function cullWiresToViewport(
  wires: Wire[],
  nodesById: ReadonlyMap<string, CanvasNode>,
  viewport: ViewportTransform,
  width: number,
  height: number,
): Wire[] {
  if (width <= 0 || height <= 0) return [];
  const bounds = viewportWorldBounds(viewport, width, height);
  return wires.filter((wire) => wireMayIntersectBounds(wire, nodesById, bounds));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createCurrentFlowRenderBudget(
  qualityMode: CurrentFlowQualityMode,
  viewportScale: number,
  visibleWireCount: number,
  viewportWidth: number,
  viewportHeight: number,
): CurrentFlowRenderBudget {
  const scale = Math.max(0.2, viewportScale || 1);
  if (qualityMode === 'full') {
    return {
      qualityMode,
      frameIntervalMs: 16,
      particleSpacingWorld: 46,
      maxParticles: Number.POSITIVE_INFINITY,
      maxParticlesPerWire: Number.POSITIVE_INFINITY,
      isLimited: false,
      limitLabel: 'Full detail',
    };
  }

  const isOverview = scale < OVERVIEW_SCALE;
  const isVeryDense = visibleWireCount >= VERY_DENSE_VISIBLE_WIRE_COUNT;
  const isDense = visibleWireCount >= DENSE_VISIBLE_WIRE_COUNT;
  const isLimited = isOverview || isDense;

  if (!isLimited) {
    return {
      qualityMode,
      frameIntervalMs: 16,
      particleSpacingWorld: 46,
      maxParticles: Number.POSITIVE_INFINITY,
      maxParticlesPerWire: Number.POSITIVE_INFINITY,
      isLimited: false,
      limitLabel: 'Adaptive detail',
    };
  }

  const areaParticleCap = clamp(Math.round((viewportWidth * viewportHeight) / 1800), 320, 900);
  const reasons: string[] = [];
  if (isOverview) reasons.push('overview zoom');
  if (isVeryDense) reasons.push('very dense wiring');
  else if (isDense) reasons.push('dense wiring');

  const targetScreenSpacing = isVeryDense ? 72 : isOverview ? 64 : 56;
  return {
    qualityMode,
    frameIntervalMs: isOverview || isVeryDense ? 50 : 33,
    particleSpacingWorld: targetScreenSpacing / scale,
    maxParticles: isVeryDense ? Math.min(areaParticleCap, 480) : Math.min(areaParticleCap, 720),
    maxParticlesPerWire: isVeryDense ? 8 : isOverview ? 10 : 14,
    isLimited: true,
    limitLabel: reasons.join(' + '),
  };
}

/** Compile only mounted/visible wire geometry into animation-ready paths. */
export function compileCurrentFlowPaths(
  visibleWires: Wire[],
  nodesById: ReadonlyMap<string, CanvasNode>,
  allWires: Wire[],
): CurrentFlowPath[] {
  const paths: CurrentFlowPath[] = [];

  for (const wire of visibleWires) {
    const from = nodesById.get(wire.fromNodeId);
    const to = nodesById.get(wire.toNodeId);
    if (!from || !to) continue;

    const startPos = getPinAbsPos(from, wire.fromPinId);
    const endPos = getPinAbsPos(to, wire.toPinId);
    if (!startPos || !endPos) continue;

    const points = getWireRenderPoints(wire, [from, to], wire.bendPoints || [], allWires);
    if (points.length < 4) continue;

    const segments: CurrentFlowPolylineSegment[] = [];
    let totalLength = 0;
    for (let index = 0; index < points.length - 2; index += 2) {
      const x1 = points[index];
      const y1 = points[index + 1];
      const x2 = points[index + 2];
      const y2 = points[index + 3];
      const length = Math.hypot(x2 - x1, y2 - y1);
      totalLength += length;
      segments.push({ x1, y1, x2, y2, length, cumLength: totalLength });
    }

    if (totalLength >= 5) paths.push({ wireId: wire.id, totalLength, segments });
  }

  return paths;
}

/** Pure particle allocation used by both Konva rendering and regressions. */
export function planCurrentFlowParticles(
  paths: CurrentFlowPath[],
  wireCurrents: Readonly<Record<string, number>>,
  budget: CurrentFlowRenderBudget,
  rotationSeed = 0,
): CurrentFlowParticlePlan {
  const activePathCount = paths.reduce((count, path) => {
    const current = Number(wireCurrents[path.wireId] ?? 0);
    return Number.isFinite(current) && Math.abs(current) >= CURRENT_FLOW_VISIBILITY_THRESHOLD_A
      ? count + 1
      : count;
  }, 0);
  const fairParticlesPerWire = Number.isFinite(budget.maxParticles)
    ? Math.max(1, Math.floor(budget.maxParticles / Math.max(1, activePathCount)))
    : Number.POSITIVE_INFINITY;
  const pathStartIndex = paths.length > budget.maxParticles && paths.length > 0
    ? Math.abs(Math.trunc(rotationSeed)) % paths.length
    : 0;
  const plannedPaths: PlannedCurrentFlowPath[] = [];
  let particleCount = 0;

  for (let pathOffset = 0; pathOffset < paths.length; pathOffset += 1) {
    if (particleCount >= budget.maxParticles) break;
    const path = paths[(pathStartIndex + pathOffset) % paths.length];
    const currentA = Number(wireCurrents[path.wireId] ?? 0);
    const absCurrentA = Math.abs(currentA);
    if (!Number.isFinite(absCurrentA) || absCurrentA < CURRENT_FLOW_VISIBILITY_THRESHOLD_A) continue;

    const desiredCount = Math.max(1, Math.floor(path.totalLength / budget.particleSpacingWorld));
    const particleCountForPath = Math.min(
      desiredCount,
      budget.maxParticlesPerWire,
      fairParticlesPerWire,
      budget.maxParticles - particleCount,
    );
    if (particleCountForPath <= 0) continue;
    plannedPaths.push({ path, currentA, particleCount: particleCountForPath });
    particleCount += particleCountForPath;
  }

  return { activePathCount, particleCount, paths: plannedPaths };
}
