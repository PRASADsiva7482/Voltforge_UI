import type { MNACircuit, MNAElementTopology, MNATopology, VirtualMeterConfiguration } from './NetlistBuilder';
import type { MNAElement, MNAElementValueUpdate } from './MNASolver';

const IMMUTABLE_ELEMENT_FIELDS = new Set<string>([
  'id', 'type', 'nodeA', 'nodeB', 'controlNode', 'controlNode2',
  'resetNode', 'internalNode', 'positiveRailNode', 'negativeRailNode',
  'outputElementId', 'dischargeElementId',
]);

export const MNA_TRANSIENT_FIELDS = [
  'prevVoltage', 'prevCurrent', 'prevSecondaryCurrent', 'behaviorState',
] as const satisfies readonly (keyof MNAElement)[];

const TRANSIENT_ELEMENT_FIELDS = new Set<string>(MNA_TRANSIENT_FIELDS);

const TOPOLOGY_FIELDS: Array<keyof MNAElementTopology> = [
  'id', 'type', 'nodeA', 'nodeB', 'controlNode', 'controlNode2',
  'resetNode', 'internalNode', 'positiveRailNode', 'negativeRailNode',
  'outputElementId', 'dischargeElementId',
];

export type IncrementalMnaRefreshPlan =
  | { kind: 'rebuild-topology' }
  | {
      kind: 'patch-values';
      elementUpdates: MNAElementValueUpdate[];
      scopeChannelsChanged: boolean;
    };

function sameMnaValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (
    typeof previous !== 'object' || previous === null ||
    typeof next !== 'object' || next === null
  ) {
    return false;
  }
  try {
    return JSON.stringify(previous) === JSON.stringify(next);
  } catch {
    return false;
  }
}

export function sameMnaTopology(previous: MNATopology, next: MNATopology): boolean {
  if (
    previous.numNodes !== next.numNodes ||
    previous.groundNodeIndex !== next.groundNodeIndex ||
    previous.pinToMNANode.size !== next.pinToMNANode.size ||
    previous.elementToComponent.size !== next.elementToComponent.size ||
    previous.genericComponentIds.size !== next.genericComponentIds.size ||
    previous.elementSignatures.length !== next.elementSignatures.length
  ) {
    return false;
  }

  for (const [pinKey, nodeIndex] of previous.pinToMNANode) {
    if (next.pinToMNANode.get(pinKey) !== nodeIndex) return false;
  }
  for (const [elementId, componentId] of previous.elementToComponent) {
    if (next.elementToComponent.get(elementId) !== componentId) return false;
  }
  for (const componentId of previous.genericComponentIds) {
    if (!next.genericComponentIds.has(componentId)) return false;
  }

  return previous.elementSignatures.every((previousElement, index) => {
    const nextElement = next.elementSignatures[index];
    return TOPOLOGY_FIELDS.every((field) => previousElement[field] === nextElement[field]);
  });
}

export function sameMnaScopeChannels(
  previous: Record<string, number>,
  next: Record<string, number>,
): boolean {
  const previousEntries = Object.entries(previous);
  const nextEntries = Object.entries(next);
  if (previousEntries.length !== nextEntries.length) return false;
  return previousEntries.every(([channel, nodeIndex]) => next[channel] === nodeIndex);
}

export function buildMnaElementValueUpdates(
  previous: readonly MNAElement[],
  next: readonly MNAElement[],
): MNAElementValueUpdate[] {
  const previousById = new Map(previous.map((element) => [element.id, element]));
  const updates: MNAElementValueUpdate[] = [];

  for (const nextElement of next) {
    const previousElement = previousById.get(nextElement.id);
    if (!previousElement) continue;

    const previousRecord = previousElement as unknown as Record<string, unknown>;
    const nextRecord = nextElement as unknown as Record<string, unknown>;
    const fields = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
    const changes: Partial<MNAElement> = {};
    const unset: Array<keyof MNAElement> = [];
    const changesRecord = changes as unknown as Record<string, unknown>;

    for (const field of fields) {
      if (IMMUTABLE_ELEMENT_FIELDS.has(field) || TRANSIENT_ELEMENT_FIELDS.has(field)) continue;

      const previousHasField = Object.hasOwn(previousRecord, field);
      const nextHasField = Object.hasOwn(nextRecord, field);
      if (previousHasField && !nextHasField) {
        unset.push(field as keyof MNAElement);
      } else if (
        nextHasField &&
        (!previousHasField || !sameMnaValue(previousRecord[field], nextRecord[field]))
      ) {
        changesRecord[field] = nextRecord[field];
      }
    }

    if (Object.keys(changes).length > 0 || unset.length > 0) {
      updates.push({ id: nextElement.id, changes, unset });
    }
  }

  return updates;
}

export function applyMnaElementValueUpdates(
  elements: readonly MNAElement[],
  updates: readonly MNAElementValueUpdate[],
) {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  for (const update of updates) {
    const element = elementsById.get(update.id);
    if (!element) continue;
    const elementRecord = element as unknown as Record<string, unknown>;

    update.unset?.forEach((field) => {
      if (!IMMUTABLE_ELEMENT_FIELDS.has(field) && !TRANSIENT_ELEMENT_FIELDS.has(field)) {
        delete elementRecord[field];
      }
    });
    Object.entries(update.changes).forEach(([field, value]) => {
      if (!IMMUTABLE_ELEMENT_FIELDS.has(field) && !TRANSIENT_ELEMENT_FIELDS.has(field)) {
        elementRecord[field] = value;
      }
    });
  }
}

export function replaceMnaElementsPreservingTransientState(
  previous: readonly MNAElement[],
  next: readonly MNAElement[],
): MNAElement[] {
  const previousById = new Map(previous.map((element) => [element.id, element]));
  return next.map((element) => {
    const prior = previousById.get(element.id);
    if (!prior) return element;

    const merged = { ...element };
    const priorRecord = prior as unknown as Record<string, unknown>;
    const mergedRecord = merged as unknown as Record<string, unknown>;
    for (const field of MNA_TRANSIENT_FIELDS) {
      if (Object.hasOwn(priorRecord, field)) mergedRecord[field] = priorRecord[field];
    }
    return merged;
  });
}

export function planIncrementalMnaRefresh(
  previous: Pick<MNACircuit, 'elements' | 'scopeChannels' | 'topology'>,
  next: Pick<MNACircuit, 'elements' | 'scopeChannels' | 'topology'>,
): IncrementalMnaRefreshPlan {
  if (!sameMnaTopology(previous.topology, next.topology)) {
    return { kind: 'rebuild-topology' };
  }
  return {
    kind: 'patch-values',
    elementUpdates: buildMnaElementValueUpdates(previous.elements, next.elements),
    scopeChannelsChanged: !sameMnaScopeChannels(previous.scopeChannels, next.scopeChannels),
  };
}

export function virtualMeterTopologySignature(meter: VirtualMeterConfiguration): string {
  return `${meter.mode}:${meter.probes.map((probe) => `${probe.nodeId}:${probe.pinId}`).join('|')}`;
}

export function reusableMnaTopologyForVirtualMeter(
  activeSignature: string,
  meter: VirtualMeterConfiguration,
  topology: MNATopology,
): MNATopology | undefined {
  return virtualMeterTopologySignature(meter) === activeSignature ? topology : undefined;
}

interface SolverWorkerLifecycleEvent {
  kind: 'start' | 'stop';
  generation: number;
  elementIds: string[];
}

/** Generation gate preventing a replaced worker from publishing stale data. */
export class SolverWorkerLifecycleGate {
  private generation = 0;
  private active: { generation: number; elementIds: Set<string> } | null = null;
  private events: SolverWorkerLifecycleEvent[] = [];

  get hasActiveWorker(): boolean {
    return this.active !== null;
  }

  start(elementIds: Iterable<string>): number {
    if (this.active) throw new Error('Cannot start a solver worker before stopping the active generation');
    this.generation += 1;
    const ids = new Set(elementIds);
    this.active = { generation: this.generation, elementIds: ids };
    this.events.push({ kind: 'start', generation: this.generation, elementIds: [...ids] });
    return this.generation;
  }

  stop(): number | null {
    if (!this.active) return null;
    const stopped = this.active;
    this.events.push({ kind: 'stop', generation: stopped.generation, elementIds: [...stopped.elementIds] });
    this.active = null;
    return stopped.generation;
  }

  accepts(generation: number, elementId?: string): boolean {
    if (!this.active || this.active.generation !== generation) return false;
    return elementId === undefined || this.active.elementIds.has(elementId);
  }

  snapshot() {
    return {
      activeElementIds: this.active ? [...this.active.elementIds] : [],
      activeGeneration: this.active?.generation ?? null,
      events: this.events.map((event) => ({ ...event, elementIds: [...event.elementIds] })),
    };
  }
}
