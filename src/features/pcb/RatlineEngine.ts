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
    _nodes: CanvasNode[],
    wires: Wire[],
    footprints: PcbFootprint[],
    traces: PcbTrace[]
  ): Ratline[] {
    const ratlines: Ratline[] = [];
    const footprintMap = new Map<string, PcbFootprint>();
    footprints.forEach((f) => footprintMap.set(f.componentId, f));

    // Group wire connections into nets
    const routedConnections = new Set<string>();
    traces.forEach((t) => {
      if (t.points.length >= 2) {
        const p1 = t.points[0];
        const p2 = t.points[t.points.length - 1];
        routedConnections.add(`${p1.x.toFixed(1)},${p1.y.toFixed(1)}--${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
      }
    });

    wires.forEach((wire) => {
      const fromFootprint = footprintMap.get(wire.fromNodeId);
      const toFootprint = footprintMap.get(wire.toNodeId);
      if (!fromFootprint || !toFootprint) return;

      // Find matching pads
      const fromPad = fromFootprint.pads.find((p) => p.id === wire.fromPinId || p.name.toLowerCase() === wire.fromPinId.toLowerCase()) || fromFootprint.pads[0];
      const toPad = toFootprint.pads.find((p) => p.id === wire.toPinId || p.name.toLowerCase() === wire.toPinId.toLowerCase()) || toFootprint.pads[0];
      if (!fromPad || !toPad) return;

      const fromX = fromFootprint.x + fromPad.x;
      const fromY = fromFootprint.y + fromPad.y;
      const toX = toFootprint.x + toPad.x;
      const toY = toFootprint.y + toPad.y;

      const key1 = `${fromX.toFixed(1)},${fromY.toFixed(1)}--${toX.toFixed(1)},${toY.toFixed(1)}`;
      const key2 = `${toX.toFixed(1)},${toY.toFixed(1)}--${fromX.toFixed(1)},${fromY.toFixed(1)}`;

      if (routedConnections.has(key1) || routedConnections.has(key2)) {
        return; // Already routed with copper trace
      }

      ratlines.push({
        id: `rat_${wire.id}`,
        netId: wire.id,
        from: {
          x: fromX,
          y: fromY,
          padId: fromPad.id,
          componentId: fromFootprint.componentId,
        },
        to: {
          x: toX,
          y: toY,
          padId: toPad.id,
          componentId: toFootprint.componentId,
        },
      });
    });

    return ratlines;
  }
}
