// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — PCB Trace Router & 45-Degree Chamfer Engine
// ═══════════════════════════════════════════════════════════════════════════

export interface Point2D {
  x: number;
  y: number;
}

export class TraceRouter {
  public static snapToGrid(val: number, grid = 0.635): number {
    return Math.round(val / grid) * grid;
  }

  /**
   * Generates 45-degree chamfered PCB trace segments between start and end.
   */
  public static route45Degree(start: Point2D, end: Point2D): Point2D[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) {
      return [start, end];
    }

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const signX = Math.sign(dx);
    const signY = Math.sign(dy);

    let mid: Point2D;
    if (absDx > absDy) {
      // Horizontal segment first, then 45-degree diagonal to target
      mid = {
        x: start.x + (absDx - absDy) * signX,
        y: start.y,
      };
    } else {
      // Vertical segment first, then 45-degree diagonal
      mid = {
        x: start.x,
        y: start.y + (absDy - absDx) * signY,
      };
    }

    return [start, mid, end];
  }
}
