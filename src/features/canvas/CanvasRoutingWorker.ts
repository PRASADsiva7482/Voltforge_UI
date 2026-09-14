import type { CanvasNode, Wire } from '../../types/domain';
import { routeWireBetweenNodes } from '../../utils/wireRouting';
import { createCanvasRouteCache } from './canvasRouteCache';
import { affectedDragRoutes } from './dragRouting';

self.onmessage = (event: MessageEvent<{ nodes: CanvasNode[]; wires: Wire[]; previousNodes?: CanvasNode[] }>) => {
  const { nodes, wires, previousNodes } = event.data;
  const routed: Wire[] = [];
  let index = 0, lastProgress = performance.now();
  let affected: Set<string> | undefined;
  const step = () => {
    try {
      affected ??= affectedDragRoutes(nodes, wires, previousNodes);
      const started = performance.now();
      do {
        const wire = wires[index];
        if (!wire) break;
        routed.push(affected.has(wire.id) ? { ...wire, bendPoints: routeWireBetweenNodes(wire, nodes) } : wire);
        index++;
      } while (index < wires.length && performance.now() - started < 8);
      if (index === wires.length) {
        self.postMessage({ type: 'complete', wires: routed, routeCache: createCanvasRouteCache(nodes, routed) });
      } else {
        if (performance.now() - lastProgress >= 100) {
          lastProgress = performance.now();
          self.postMessage({ type: 'progress', completed: index });
        }
        setTimeout(step, 0);
      }
    } catch {
      self.postMessage({ type: 'error' });
    }
  };
  step();
};
