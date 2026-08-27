import type { CanvasNode } from '../../types/domain';

export const RUNTIME_NUMERIC_DEADBAND = 0.001;

const SIMULATION_RUNTIME_PROPERTY_KEYS = new Set([
  'boardPowered', 'builtInLedLit', 'isBlown', 'faultMessage', 'isLit', 'currentMa', 'measuredVoltage', 'measuredCurrent', 'measuredResistance', 'resistanceUnsafe',
  'isSpinning', 'isBeeping', 'isActive', 'isPressed', 'isClosed', 'motionDetected', 'powered',
  'outputHigh', 'moistureLevel', 'lightLevel', 'displaySupplyVoltage', 'lcdLine1', 'lcdLine2',
  'lcdBacklight', 'displayValue', 'displayText', 'displayDigit', 'segments', 'timerState', 'shiftRegValue', 'latchRegValue',
  'prevSrclk', 'prevRclk', 'outputVoltage', 'isRegulating', 'escRequestedThrottle', 'escSupplyVoltage', 'escThrottle', 'escRpm', 'bldcRpm',
  'bldcRotation', 'angle', 'rpm', 'rotation', 'currentAngle', 'appliedVoltage', 'inputVoltage', 'actualOutputVoltage', 'supplyVoltage',
  'isOn', 'isPowered', 'lastCommand', 'direction', 'ledColor', 'rgbRed', 'rgbGreen', 'rgbBlue',
  'stepperSteps', 'stepperRotation', 'stepperPattern', 'phase1Active', 'phase2Active', 'phase3Active', 'phase4Active',
  'isSwitched', 'isSwitched_1', 'isSwitched_2', 'isSwitched_3', 'isSwitched_4',
  'digitalIcSupplyVoltage', 'shiftValue', 'serialOut', 'serialOutInverted', 'activeChannel', 'selectedInput',
  'outputY', 'outputW', 'currentCount', 'carryOut',
  'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7',
  'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9',
]);

export interface RuntimeCanvasUpdate {
  id: string;
  changes: Partial<CanvasNode>;
}

export interface RuntimeDeltaMetrics {
  candidateCount: number;
  missingNodeCount: number;
  propertyComparisonCount: number;
  topLevelComparisonCount: number;
  stagedFieldCount: number;
  canvasWriteCount: number;
}

export interface RuntimeNodeBinding {
  id: string;
  type: string;
  pinNodes: Map<string, number>;
}

type RuntimeIndexNode = Pick<CanvasNode, 'id' | 'pins' | 'type'>;

function emptyMetrics(): RuntimeDeltaMetrics {
  return {
    candidateCount: 0,
    missingNodeCount: 0,
    propertyComparisonCount: 0,
    topLevelComparisonCount: 0,
    stagedFieldCount: 0,
    canvasWriteCount: 0,
  };
}

export function runtimeValuesEqual(key: string, previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;

  if (typeof previous === 'number' && typeof next === 'number') {
    // Runtime state is presentation/behavioral feedback. Ignore solver noise
    // that cannot produce a visible or behavioral transition.
    return SIMULATION_RUNTIME_PROPERTY_KEYS.has(key)
      ? Math.abs(previous - next) <= RUNTIME_NUMERIC_DEADBAND
      : false;
  }

  if (previous && next && typeof previous === 'object' && typeof next === 'object') {
    return JSON.stringify(previous) === JSON.stringify(next);
  }

  return false;
}

/**
 * Collects sparse runtime changes while SimulationEngine temporarily batches
 * updateNode calls. Candidate values are compared with the current canvas
 * snapshot, then materialized as at most one canvas write per component.
 */
export class RuntimeDeltaCollector {
  private pending = new Map<string, Partial<CanvasNode>>();
  private metrics = emptyMetrics();

  reset() {
    this.pending.clear();
    this.metrics = emptyMetrics();
  }

  stage(id: string, currentNode: CanvasNode | undefined, updates: Partial<CanvasNode>): boolean {
    this.metrics.candidateCount += 1;
    if (!currentNode || currentNode.id !== id) {
      this.metrics.missingNodeCount += 1;
      return false;
    }

    const existing = this.pending.get(id);
    const nextChanges = existing ? { ...existing } : {};
    const currentProperties = currentNode.properties || {};
    const stagedProperties = { ...(existing?.properties || {}) };
    let changed = false;

    if (updates.properties) {
      for (const [key, value] of Object.entries(updates.properties)) {
        this.metrics.propertyComparisonCount += 1;
        // Most engine call sites pass a complete property snapshot. Comparing
        // with the canvas baseline prevents a later snapshot from erasing an
        // unrelated property already staged during the same result frame.
        if (runtimeValuesEqual(key, currentProperties[key], value)) continue;
        if (runtimeValuesEqual(key, stagedProperties[key], value)) continue;
        stagedProperties[key] = value;
        this.metrics.stagedFieldCount += 1;
        changed = true;
      }
    }

    const currentRecord = currentNode as unknown as Record<string, unknown>;
    const existingRecord = (existing || {}) as Record<string, unknown>;
    const nextRecord = nextChanges as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'properties') continue;
      this.metrics.topLevelComparisonCount += 1;
      const previous = Object.hasOwn(existingRecord, key) ? existingRecord[key] : currentRecord[key];
      if (runtimeValuesEqual(key, previous, value)) continue;
      nextRecord[key] = value;
      this.metrics.stagedFieldCount += 1;
      changed = true;
    }

    if (Object.keys(stagedProperties).length > 0) {
      nextChanges.properties = stagedProperties;
    }
    if (changed || existing) this.pending.set(id, nextChanges);
    return changed;
  }

  materialize(nodesById: ReadonlyMap<string, CanvasNode>): RuntimeCanvasUpdate[] {
    const writes: RuntimeCanvasUpdate[] = [];

    for (const [id, pendingChanges] of this.pending) {
      const currentNode = nodesById.get(id);
      if (!currentNode) continue;

      const changes = { ...pendingChanges };
      if (pendingChanges.properties) {
        const changedProperties = Object.fromEntries(
          Object.entries(pendingChanges.properties).filter(
            ([key, value]) => !runtimeValuesEqual(key, currentNode.properties?.[key], value),
          ),
        );
        if (Object.keys(changedProperties).length > 0) {
          changes.properties = changedProperties;
        } else {
          delete changes.properties;
        }
      }

      const hasChanges = Object.keys(changes).length > 0;
      if (hasChanges) writes.push({ id, changes });
    }

    this.metrics.canvasWriteCount = writes.length;
    return writes;
  }

  snapshotMetrics(): RuntimeDeltaMetrics {
    return { ...this.metrics };
  }
}

/** Rebuildable component/pin index shared by live reconciliation and tests. */
export class RuntimeReconciliationIndex<TNode extends RuntimeIndexNode> {
  private bindings = new Map<string, RuntimeNodeBinding>();
  private orderedNodeIds: string[] = [];
  private pinNodeMap = new Map<string, number>();

  get nodeCount(): number {
    return this.bindings.size;
  }

  get pinCount(): number {
    return this.pinNodeMap.size;
  }

  get pinNodes(): Map<string, number> {
    return this.pinNodeMap;
  }

  rebuild(nodes: readonly TNode[], pinToMNANode: ReadonlyMap<string, number>) {
    this.clear();
    for (const node of nodes) {
      const pinNodes = new Map<string, number>();
      for (const pin of node.pins || []) {
        const pinKey = `${node.id}:${pin.id}`;
        const nodeIndex = pinToMNANode.get(pinKey);
        if (nodeIndex === undefined) continue;
        pinNodes.set(pin.id, nodeIndex);
        this.pinNodeMap.set(pinKey, nodeIndex);
      }
      this.bindings.set(node.id, { id: node.id, type: node.type, pinNodes });
      this.orderedNodeIds.push(node.id);
    }
  }

  clear() {
    this.bindings.clear();
    this.orderedNodeIds = [];
    this.pinNodeMap.clear();
  }

  hasNode(id: string): boolean {
    return this.bindings.has(id);
  }

  getBinding(id: string): RuntimeNodeBinding | undefined {
    return this.bindings.get(id);
  }

  currentNodes(nodesById: ReadonlyMap<string, TNode>): TNode[] {
    const nodes: TNode[] = [];
    for (const nodeId of this.orderedNodeIds) {
      const node = nodesById.get(nodeId);
      if (node) nodes.push(node);
    }
    return nodes;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Runtime delta contract failed: ${message}`);
}

function contractNode(id: string, type: string, properties: Record<string, unknown>): CanvasNode {
  return {
    componentId: id,
    height: 40,
    id,
    name: id,
    pins: [{ id: 'signal', name: 'Signal', type: 'bidirectional', x: 0, y: 0 }],
    properties,
    rotation: 0,
    type,
    width: 60,
    x: 0,
    y: 0,
  };
}

/** Framework-free deterministic coverage, parameterized by the real max preset. */
export function assertRuntimeDeltaContract(maximumPresetNodes: readonly CanvasNode[]) {
  assert(maximumPresetNodes.length >= 30, 'the maximum-component fixture must remain representative');
  assert(runtimeValuesEqual('measuredVoltage', 5, 5.0009), 'sub-deadband voltage noise must be ignored');
  assert(!runtimeValuesEqual('measuredVoltage', 5, 5.0011), 'a voltage crossing the deadband must be retained');

  const controlledNodes = [
    contractNode('voltage', 'MULTIMETER', { measuredVoltage: 5, measuredCurrent: 0.02 }),
    contractNode('display', 'DISPLAY_LCD_I2C', { displayValue: '5.00V', lcdBacklight: true }),
    contractNode('actuator', 'MOTOR_DC', { appliedVoltage: 0, isSpinning: false, rpm: 0 }),
    contractNode('indicator', 'LED_STANDARD', { currentMa: 0, isLit: false }),
  ];
  const controlledById = new Map(controlledNodes.map((node) => [node.id, node]));
  const collector = new RuntimeDeltaCollector();

  for (const node of controlledNodes) {
    collector.stage(node.id, node, { properties: { ...node.properties } });
  }
  assert(collector.materialize(controlledById).length === 0, 'identical results must publish zero canvas updates');
  assert(collector.snapshotMetrics().canvasWriteCount === 0, 'zero writes must be observable at the batch boundary');

  collector.reset();
  for (const node of controlledNodes) {
    collector.stage(node.id, node, { properties: { ...node.properties } });
  }
  collector.stage('voltage', controlledById.get('voltage'), {
    properties: { ...controlledById.get('voltage')!.properties, measuredVoltage: 5.0011 },
  });
  const thresholdWrites = collector.materialize(controlledById);
  assert(thresholdWrites.length === 1 && thresholdWrites[0].id === 'voltage', 'one threshold crossing must publish one affected component');

  const transitions: Array<[string, Record<string, unknown>]> = [
    ['display', { displayValue: 'OVERLOAD' }],
    ['actuator', { appliedVoltage: 5, isSpinning: true, rpm: 3000 }],
    ['indicator', { currentMa: 1.1, isLit: true }],
  ];
  for (const [id, properties] of transitions) {
    collector.reset();
    const node = controlledById.get(id)!;
    collector.stage(id, node, { properties: { ...node.properties, ...properties } });
    const writes = collector.materialize(controlledById);
    assert(writes.length === 1 && writes[0].id === id, `${id} transition must remain a single component write`);
  }

  const pinToMNANode = new Map<string, number>();
  let pinIndex = 0;
  for (const node of maximumPresetNodes) {
    for (const pin of node.pins || []) {
      pinToMNANode.set(`${node.id}:${pin.id}`, pinIndex);
      pinIndex += 1;
    }
  }

  const runtimeIndex = new RuntimeReconciliationIndex<CanvasNode>();
  runtimeIndex.rebuild(maximumPresetNodes, pinToMNANode);
  assert(runtimeIndex.nodeCount === maximumPresetNodes.length, 'the index must contain every maximum-preset component');
  const removedNode = [...maximumPresetNodes].reverse().find((node) => node.pins.length > 0) ?? maximumPresetNodes.at(-1)!;
  const remainingNodes = maximumPresetNodes.filter((node) => node.id !== removedNode.id);
  runtimeIndex.rebuild(remainingNodes, pinToMNANode);
  assert(!runtimeIndex.hasNode(removedNode.id), 'a topology rebuild must remove stale component IDs');
  for (const pin of removedNode.pins || []) {
    assert(!runtimeIndex.pinNodes.has(`${removedNode.id}:${pin.id}`), 'a topology rebuild must remove stale pin IDs');
  }

  const maximumById = new Map(maximumPresetNodes.map((node) => [node.id, node]));
  runtimeIndex.rebuild(maximumPresetNodes, pinToMNANode);
  const rounds = 128;
  let candidateCount = 0;
  let canvasWriteCount = 0;
  for (let round = 0; round < rounds; round += 1) {
    collector.reset();
    for (const node of runtimeIndex.currentNodes(maximumById)) {
      collector.stage(node.id, node, { properties: { ...node.properties } });
    }
    collector.materialize(maximumById);
    const metrics = collector.snapshotMetrics();
    candidateCount += metrics.candidateCount;
    canvasWriteCount += metrics.canvasWriteCount;
  }
  assert(candidateCount === maximumPresetNodes.length * rounds, 'maximum reconciliation must perform one indexed candidate visit per component');
  assert(canvasWriteCount === 0, 'repeated maximum-preset results must not cross the canvas write boundary');

  collector.reset();
  collector.stage(removedNode.id, undefined, { properties: { isLit: true } });
  assert(collector.materialize(maximumById).length === 0, 'removed component results must not create a canvas write');
  assert(collector.snapshotMetrics().missingNodeCount === 1, 'removed component candidates must be counted as stale');
}
