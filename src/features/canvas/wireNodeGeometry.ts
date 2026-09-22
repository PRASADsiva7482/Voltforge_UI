import type { CanvasNode } from './canvasTypes';

/** Routing depends on authored geometry and pin identities/aliases, not live
 * electrical properties. Keep each endpoint subscription stable on runtime ticks. */
export function createWireNodeGeometrySelector(id: string) {
  let previous: CanvasNode | undefined;
  return (state: { nodesById: ReadonlyMap<string, CanvasNode> }): CanvasNode | undefined => {
    const next = state.nodesById.get(id);
    if (next === previous) return previous;
    if (next && previous && next.id === previous.id && next.type === previous.type
      && next.x === previous.x && next.y === previous.y && next.width === previous.width
      && next.height === previous.height && next.rotation === previous.rotation && next.pins === previous.pins) return previous;
    previous = next;
    return previous;
  };
}
