import type { CanvasNode } from '../types/domain';

export interface IndexedCanvasNodes {
  nodes: CanvasNode[];
  nodesById: Map<string, CanvasNode>;
  nodeIndexById: Map<string, number>;
}

export interface RuntimeNodeMutation {
  id: string;
  changes: Partial<CanvasNode>;
}

export interface RuntimeNodeMutationMetrics {
  requestedUpdateCount: number;
  indexLookupCount: number;
  updatedNodeCount: number;
  fullCanvasScanCount: number;
}

export interface RuntimeNodeMutationResult extends IndexedCanvasNodes {
  changed: boolean;
  metrics: RuntimeNodeMutationMetrics;
}

/**
 * Apply sparse runtime updates through the stable ID→array-index map. The
 * nodes array and lookup map are cloned once, only after a valid ID is found.
 */
export function applyIndexedRuntimeNodeUpdates(
  state: IndexedCanvasNodes,
  updates: readonly RuntimeNodeMutation[],
): RuntimeNodeMutationResult {
  const metrics: RuntimeNodeMutationMetrics = {
    requestedUpdateCount: updates.length,
    indexLookupCount: 0,
    updatedNodeCount: 0,
    fullCanvasScanCount: 0,
  };
  let nodes = state.nodes;
  let nodesById = state.nodesById;

  for (const update of updates) {
    metrics.indexLookupCount += 1;
    const nodeIndex = state.nodeIndexById.get(update.id);
    if (nodeIndex === undefined) continue;
    const currentNode = nodes[nodeIndex];
    if (!currentNode || currentNode.id !== update.id) continue;

    if (nodes === state.nodes) nodes = [...state.nodes];
    if (nodesById === state.nodesById) nodesById = new Map(state.nodesById);
    const updatedNode: CanvasNode = {
      ...currentNode,
      ...update.changes,
      properties: update.changes.properties
        ? { ...currentNode.properties, ...update.changes.properties }
        : currentNode.properties,
    };
    nodes[nodeIndex] = updatedNode;
    nodesById.set(update.id, updatedNode);
    metrics.updatedNodeCount += 1;
  }

  return {
    changed: nodes !== state.nodes,
    metrics,
    nodeIndexById: state.nodeIndexById,
    nodes,
    nodesById,
  };
}
