import type { PcbFootprint, PcbTrace, PcbVia, Ratline } from '../../store/pcbStore';

export const BOARD_OFFSET_PX = 40;
export const SCALE_MM_TO_PX = 4;
export const PCB_OVERSCAN_PX = 64;
export const PCB_RETAIN_PX = 256;
export const PCB_DETAIL_SCALE = 0.7;
export interface SceneBounds { left: number; top: number; right: number; bottom: number }
type Viewport = { x: number; y: number; scale: number };
const unlimited: SceneBounds = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };

export function pcbViewportBounds(view: Viewport, width: number, height: number, overscan = PCB_OVERSCAN_PX): SceneBounds {
  if (![view.x, view.y, view.scale, width, height, overscan].every(Number.isFinite) || view.scale <= 0) return unlimited;
  return { left: (-view.x - overscan) / view.scale, top: (-view.y - overscan) / view.scale,
    right: (width - view.x + overscan) / view.scale, bottom: (height - view.y + overscan) / view.scale };
}

export function intersectsPcbViewport(bounds: SceneBounds, view: SceneBounds): boolean {
  return bounds.left <= view.right && bounds.right >= view.left && bounds.top <= view.bottom && bounds.bottom >= view.top;
}

// Enter near the viewport; leave farther away. A small reversed pan/zoom can
// reuse mounted hit graphs and raster buffers instead of rebuilding edge rows.
export class PcbVisibilityWindow {
  private mounted = new Set<string>();
  select<T extends { id: string }>(items: readonly T[], enter: SceneBounds, retain: SceneBounds,
    boundsFor: (item: T) => SceneBounds, pinned: (item: T) => boolean = () => false): T[] {
    const visible = items.filter(item => {
      if (pinned(item)) return true;
      const bounds = boundsFor(item);
      return intersectsPcbViewport(bounds, enter) || (this.mounted.has(item.id) && intersectsPcbViewport(bounds, retain));
    });
    this.mounted = new Set(visible.map(item => item.id));
    return visible;
  }
}

function enclosing(points: number[], padding = 0): SceneBounds {
  if (!points.length || !points.every(Number.isFinite) || !Number.isFinite(padding)) return unlimited;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    left = Math.min(left, points[i]); right = Math.max(right, points[i]);
    top = Math.min(top, points[i + 1]); bottom = Math.max(bottom, points[i + 1]);
  }
  return { left: left - padding, top: top - padding, right: right + padding, bottom: bottom + padding };
}

export function pcbPoints(points: readonly { x: number; y: number }[]): number[] {
  return points.flatMap(p => [p.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX, p.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX]);
}

// Keys are immutable store objects. Replaced documents/geometry can be collected;
// panning never allocates another copy of a trace's points or footprint bounds.
export class PcbSceneGeometry {
  private footprints = new WeakMap<PcbFootprint, SceneBounds>();
  private traces = new WeakMap<PcbTrace, { bounds: SceneBounds; points: number[] }>();
  private ratlines = new WeakMap<Ratline, { bounds: SceneBounds; points: number[] }>();
  private vias = new WeakMap<PcbVia, SceneBounds>();

  footprint(fp: PcbFootprint): SceneBounds {
    const cached = this.footprints.get(fp); if (cached) return cached;
    const w = Math.abs(fp.width * SCALE_MM_TO_PX), h = Math.abs(fp.height * SCALE_MM_TO_PX);
    // Include text overhang, notch and pads outside the body. Conservative text
    // estimates also cover multiline references and narrow, wrapping pad labels.
    const lines = fp.name.split('\n');
    const local = [-w / 2 - 1, -h / 2 - 13, w / 2 + 1, h / 2 + 1,
      -w / 2 + Math.max(...lines.map(s => s.length), 1) * 10, -h / 2 - 12 + lines.length * 12,
      -w / 2 + 6, -h / 2 + 6];
    for (const pad of fp.pads) {
      const x = pad.x * SCALE_MM_TO_PX, y = pad.y * SCALE_MM_TO_PX;
      const pw = Math.abs(pad.width * SCALE_MM_TO_PX), ph = Math.abs(pad.height * SCALE_MM_TO_PX);
      const drill = Math.abs((pad.drillDiameter ?? 0) * SCALE_MM_TO_PX) / 2;
      const rx = Math.max(pw / 2, drill) + 1, ry = Math.max(ph / 2, drill) + 1;
      local.push(x - rx, y - ry, x + rx, y + ry, x + pw / 2, y - ph / 2 + 2 + Math.max(pad.name.length, 1) * 8);
    }
    const box = enclosing(local), radians = fp.rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
    const corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]];
    const bounds = enclosing(corners.flatMap(([x, y]) => [BOARD_OFFSET_PX + fp.x * SCALE_MM_TO_PX + x * c - y * s,
      BOARD_OFFSET_PX + fp.y * SCALE_MM_TO_PX + x * s + y * c]), 1);
    this.footprints.set(fp, bounds); return bounds;
  }

  trace(trace: PcbTrace) {
    let cached = this.traces.get(trace);
    if (!cached) { const points = pcbPoints(trace.points); cached = { points, bounds: enclosing(points, Math.abs(trace.width_mm) * SCALE_MM_TO_PX * 2.5 / 2 + 8) }; this.traces.set(trace, cached); }
    return cached;
  }

  ratline(line: Ratline) {
    let cached = this.ratlines.get(line);
    if (!cached) { const points = pcbPoints([line.from, line.to]); cached = { points, bounds: enclosing(points, 2) }; this.ratlines.set(line, cached); }
    return cached;
  }

  via(via: PcbVia): SceneBounds {
    let cached = this.vias.get(via);
    if (!cached) { cached = enclosing(pcbPoints([via]), Math.max(Math.abs(via.pad_mm), Math.abs(via.drill_mm)) * SCALE_MM_TO_PX * 2 + 1); this.vias.set(via, cached); }
    return cached;
  }
}
