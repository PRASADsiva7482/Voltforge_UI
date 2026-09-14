import type { CanvasNode, CanvasRouteCache, Wire } from '../../types/domain';
import { isCanvasRouteCacheValid, routingNodes } from './canvasRouteCache';

export interface CanvasRoutingStatus {
  phase: 'idle' | 'routing' | 'ready' | 'error';
  completed: number;
  total: number;
  reused: number;
}

export function startCanvasRoutingJob(nodes: CanvasNode[], wires: Wire[], callbacks: {
  progress: (completed: number) => void;
  complete: (wires: Wire[], cache: CanvasRouteCache) => void;
  error: () => void;
}, previousNodes?: CanvasNode[]): () => void {
  const worker = new Worker(new URL('./CanvasRoutingWorker.ts', import.meta.url), { type: 'module' });
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  const stop = () => { if (stopped) return; stopped = true; clearTimeout(timeout); worker.terminate(); };
  const fail = () => { if (stopped) return; stop(); callbacks.error(); };
  const armTimeout = () => { clearTimeout(timeout); timeout = setTimeout(fail, 30000); };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  worker.onmessage = (event) => {
    if (stopped) return;
    if (event.data.type === 'progress') {
      armTimeout(); callbacks.progress(event.data.completed);
    } else if (event.data.type === 'complete') {
      const result: Wire[] = event.data.wires;
      if (!Array.isArray(result) || result.length !== wires.length || result.some((wire, index) => wire?.id !== wires[index].id)) { fail(); return; }
      // Only derived bends may cross this boundary; preserve connection IDs,
      // modes, labels and other authored wire fields from the captured document.
      const routed = wires.map((wire, index) => wire.routingMode === 'auto'
        && JSON.stringify(wire.bendPoints) !== JSON.stringify(result[index].bendPoints)
        ? { ...wire, bendPoints: result[index].bendPoints } : wire);
      if (!isCanvasRouteCacheValid(event.data.routeCache, nodes, routed)) { fail(); return; }
      stop(); callbacks.complete(routed, event.data.routeCache);
    } else fail();
  };
  armTimeout();
  try { worker.postMessage({ nodes: routingNodes(nodes), wires, ...(previousNodes ? { previousNodes: routingNodes(previousNodes) } : {}) }); }
  catch { stop(); throw new Error('Unable to start canvas routing'); }
  return stop;
}
