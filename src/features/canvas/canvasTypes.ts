// ═══════════════════════════════════════════════════════════════════════════
// Canvas-specific TypeScript types
// ═══════════════════════════════════════════════════════════════════════════

export type { CanvasNode, Wire, PinPosition, WireBendPoint } from '../../types/domain';

/** A collaborator cursor visible on the shared canvas. */
export interface Collaborator {
  userId?: string;
  displayName?: string;
  color?: string;
  x?: number;
  y?: number;
}

/** Transient state for a bend point being actively dragged into existence. */
export interface ActiveBendPoint {
  wireId: string;
  index: number;
  x: number;
  y: number;
}
