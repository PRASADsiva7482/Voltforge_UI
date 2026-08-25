// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — PCB Ratline & Minimum Spanning Tree Net Engine
// ═══════════════════════════════════════════════════════════════════════════

import type { CanvasNode, Wire } from '../../types/domain';
import type { PcbFootprint, PcbTrace, Ratline } from '../../store/pcbStore';

export class RatlineEngine {
  /**
   * Generates PCB ratlines between footprint pads based on schematic netlist wires.
   */
  public static computeRatlines(
    nodes: CanvasNode[],
    wires: Wire[],
    footprints: PcbFootprint[],
    traces: PcbTrace[]
  ): Ratline[] {
    const ratlines: Ratline[] = [];
    const footprintMap = new Map<string, PcbFootprint>();
    footprints.forEach((f) => footprintMap.set(f.componentId, f));

    const parent = new Map<string, string>();
    const key = (componentId: string, padId: string) => `${componentId}:${padId}`;
    const find = (value: string): string => {
      if (!parent.has(value)) parent.set(value, value);
      const current = parent.get(value)!;
      if (current === value) return value;
      const root = find(current);
      parent.set(value, root);
      return root;
    };
    const union = (a: string, b: string) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    };

    nodes.forEach((node) => node.pins.forEach((pin) => find(key(node.id, pin.id))));
    wires.forEach((wire) => union(key(wire.fromNodeId, wire.fromPinId), key(wire.toNodeId, wire.toPinId)));

    type PadPoint = { x: number; y: number; padId: string; componentId: string; pinKey: string };
    const nets = new Map<string, PadPoint[]>();
    footprints.forEach((footprint) => {
      footprint.pads.forEach((pad) => {
        const pinKey = key(footprint.componentId, pad.id);
        const root = find(pinKey);
        const radians = ((footprint.rotation || 0) * Math.PI) / 180;
        const x = footprint.x + pad.x * Math.cos(radians) - pad.y * Math.sin(radians);
        const y = footprint.y + pad.x * Math.sin(radians) + pad.y * Math.cos(radians);
        const points = nets.get(root) || [];
        points.push({ x, y, padId: pad.id, componentId: footprint.componentId, pinKey });
        nets.set(root, points);
      });
    });

    const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
    const isRouted = (from: PadPoint, to: PadPoint) => traces.some((trace) => {
      if (trace.points.length < 2) return false;
      const first = trace.points[0];
      const last = trace.points[trace.points.length - 1];
      return (samePoint(first, from) && samePoint(last, to)) || (samePoint(first, to) && samePoint(last, from));
    });

    // Generate a minimum spanning tree for every connected schematic net,
    // rather than one ratline per direct wire. This handles star/branch nets.
    nets.forEach((points, netId) => {
      if (points.length < 2) return;
      const connected = new Set<number>([0]);
      while (connected.size < points.length) {
        let best: { from: number; to: number; distance: number } | null = null;
        connected.forEach((from) => {
          points.forEach((_point, to) => {
            if (connected.has(to)) return;
            const distance = Math.hypot(points[from].x - points[to].x, points[from].y - points[to].y);
            if (!best || distance < best.distance) best = { from, to, distance };
          });
        });
        if (!best) break;
        const edge = best as { from: number; to: number; distance: number };
        connected.add(edge.to);
        if (!isRouted(points[edge.from], points[edge.to])) {
          ratlines.push({
            id: `rat_${netId}_${edge.from}_${edge.to}`,
            netId,
            from: points[edge.from],
            to: points[edge.to],
          });
        }
      }
    });

    return ratlines;
  }
}
