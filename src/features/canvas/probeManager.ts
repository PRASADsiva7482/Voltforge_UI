/**
 * Voltforge Interactive Canvas Probe Manager
 * Handles multi-channel voltage, current, and logic probes attached to pins, nodes, and nets.
 */

export interface CanvasProbe {
  id: string;
  nodeId?: string;
  pinId?: string;
  wireId?: string;
  label: string;
  channelIndex: number;
  color: string;
  mode: 'voltage' | 'current' | 'logic';
  x: number;
  y: number;
}

export const SCOPE_CHANNEL_COLORS = [
  '#22c55e', // Ch 1: Green
  '#38bdf8', // Ch 2: Blue / Cyan
  '#f59e0b', // Ch 3: Amber / Yellow
  '#ec4899', // Ch 4: Pink
  '#a855f7', // Ch 5: Purple
  '#ef4444', // Ch 6: Red
  '#14b8a6', // Ch 7: Teal
  '#e2e8f0', // Ch 8: White
];

export class ProbeManager {
  /**
   * Create a new probe attached to a pin or wire coordinate.
   */
  static createProbe(
    target: { nodeId?: string; pinId?: string; wireId?: string; x: number; y: number; label?: string },
    existingProbes: CanvasProbe[] = []
  ): CanvasProbe {
    const channelIndex = existingProbes.length % SCOPE_CHANNEL_COLORS.length;
    const color = SCOPE_CHANNEL_COLORS[channelIndex];
    const defaultLabel = target.label || `CH${channelIndex + 1} (${target.pinId || 'Net'})`;

    return {
      id: `probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      nodeId: target.nodeId,
      pinId: target.pinId,
      wireId: target.wireId,
      label: defaultLabel,
      channelIndex,
      color,
      mode: 'voltage',
      x: target.x,
      y: target.y,
    };
  }

  /**
   * Remove a probe by ID.
   */
  static removeProbe(probeId: string, probes: CanvasProbe[]): CanvasProbe[] {
    return probes.filter((p) => p.id !== probeId);
  }

  /**
   * Toggle probe on a specific pin (adds if not present, removes if already attached).
   */
  static togglePinProbe(
    nodeId: string,
    pinId: string,
    pinPos: { x: number; y: number },
    probes: CanvasProbe[]
  ): CanvasProbe[] {
    const existing = probes.find((p) => p.nodeId === nodeId && p.pinId === pinId);
    if (existing) {
      return this.removeProbe(existing.id, probes);
    }
    const newProbe = this.createProbe(
      { nodeId, pinId, x: pinPos.x, y: pinPos.y, label: `${pinId}` },
      probes
    );
    return [...probes, newProbe];
  }
}
