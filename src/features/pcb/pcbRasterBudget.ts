import type { Node } from 'konva/lib/Node';

// Per mounted PCB canvas, including both RGBA scene and hit buffers. Cache
// allocation is optional; oversized parts continue to render as vectors.
export class PcbRasterBudget {
  private used = 0;
  constructor(readonly limit = 32 * 1024 * 1024) {}
  reserve(bytes: number): (() => void) | undefined {
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > 256 * 1024 || this.used + bytes > this.limit) return;
    this.used += bytes;
    let released = false;
    return () => { if (!released) { this.used -= bytes; released = true; } };
  }
}

export function cachePcbNode(node: Node, budget: PcbRasterBudget, ratio: number): (() => void) | undefined {
  const box = node.getClientRect({ skipTransform: true });
  const width = Math.ceil(box.width) + 4, height = Math.ceil(box.height) + 4;
  const release = budget.reserve(width * height * (ratio * ratio + 1) * 4);
  if (!release) return;
  node.cache({ x: Math.floor(box.x) - 2, y: Math.floor(box.y) - 2, width, height, pixelRatio: ratio });
  return () => { node.clearCache(); release(); };
}
