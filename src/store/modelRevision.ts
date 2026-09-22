export interface CanvasModelChange {
  revision: number;
  kind: 'node' | 'wire' | 'reset';
  nodeIds: string[];
  wireIds: string[];
  topologyChanged: boolean;
}

export interface CanvasRevisionSnapshot {
  modelRevision: number;
  lastModelChange: CanvasModelChange | null;
}

export type CanvasModelReconciliation =
  | { kind: 'ignore'; reason: 'same-revision' | 'stale-change' }
  | { kind: 'refresh-values'; change: CanvasModelChange }
  | { kind: 'rebuild-topology'; change: CanvasModelChange };

export interface CanvasModelRevisionMetrics {
  notificationCount: number;
  sameRevisionNotificationCount: number;
  staleChangeCount: number;
  valueRefreshCount: number;
  topologyRebuildCount: number;
  targetedNodeCount: number;
}

export function nextModelChange(
  state: Pick<CanvasRevisionSnapshot, 'modelRevision'>,
  change: Omit<CanvasModelChange, 'revision'>,
) {
  const revision = state.modelRevision + 1;
  return {
    modelRevision: revision,
    lastModelChange: { ...change, revision },
  };
}

/** The exact revision gate used by SimulationEngine's canvas subscription. */
export function classifyCanvasModelChange(
  state: CanvasRevisionSnapshot,
  previous: Pick<CanvasRevisionSnapshot, 'modelRevision'>,
): CanvasModelReconciliation {
  if (state.modelRevision === previous.modelRevision) {
    return { kind: 'ignore', reason: 'same-revision' };
  }

  const change = state.lastModelChange;
  if (!change || change.revision !== state.modelRevision) {
    return { kind: 'ignore', reason: 'stale-change' };
  }

  return change.topologyChanged
    ? { kind: 'rebuild-topology', change }
    : { kind: 'refresh-values', change };
}

function emptyMetrics(): CanvasModelRevisionMetrics {
  return {
    notificationCount: 0,
    sameRevisionNotificationCount: 0,
    staleChangeCount: 0,
    valueRefreshCount: 0,
    topologyRebuildCount: 0,
    targetedNodeCount: 0,
  };
}

/** Deterministic instrumentation for the production revision classifier. */
export class CanvasModelRevisionProbe {
  private metrics = emptyMetrics();

  observe(
    state: CanvasRevisionSnapshot,
    previous: Pick<CanvasRevisionSnapshot, 'modelRevision'>,
  ): CanvasModelReconciliation {
    this.metrics.notificationCount += 1;
    const decision = classifyCanvasModelChange(state, previous);
    if (decision.kind === 'ignore') {
      if (decision.reason === 'same-revision') this.metrics.sameRevisionNotificationCount += 1;
      else this.metrics.staleChangeCount += 1;
    } else if (decision.kind === 'refresh-values') {
      this.metrics.valueRefreshCount += 1;
      this.metrics.targetedNodeCount += decision.change.nodeIds.length;
    } else {
      this.metrics.topologyRebuildCount += 1;
    }
    return decision;
  }

  reset() {
    this.metrics = emptyMetrics();
  }

  snapshot(): CanvasModelRevisionMetrics {
    return { ...this.metrics };
  }
}
