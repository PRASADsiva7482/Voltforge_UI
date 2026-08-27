import type { CanvasNode } from '../../types/domain';
import type { MNACircuit, VirtualMeterConfiguration } from './NetlistBuilder';

export type ResultMeterMeasurementMode = 'VOLTAGE' | 'CURRENT' | 'RESISTANCE';

export interface ResultSubscription {
  nodeIndices: number[];
  branchCurrentElementIds: string[];
  powerElementIds: string[];
  diagnosticsEnabled?: boolean;
}

export interface ResultConsumerDemand {
  ai: boolean;
  lab: boolean;
}

export interface ResultSubscriptionInput {
  nodes: CanvasNode[];
  circuit: Pick<MNACircuit, 'numNodes' | 'elements' | 'pinToMNANode' | 'elementToComponent' | 'scopeChannels'>;
  showCurrentFlow: boolean;
  thermalHeatmapEnabled: boolean;
  resultDataConsumers: ResultConsumerDemand;
  virtualMeter: VirtualMeterConfiguration;
  diagnosticsEnabled?: boolean;
}

export interface ResultBufferPayload {
  nodeIndices: number[];
  nodeVoltages: Float64Array;
  branchCurrentElementIds?: string[];
  branchCurrents?: Float64Array;
  powerElementIds?: string[];
  componentPower?: Float64Array;
}

export interface MaterializedResultBuffers {
  nodeVoltages: number[];
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
}

function meterMeasurementMode(value: unknown): ResultMeterMeasurementMode {
  const normalized = String(value || 'VOLTAGE').trim().toUpperCase();
  if (normalized === 'CURRENT' || normalized === 'MA') return 'CURRENT';
  if (normalized === 'RESISTANCE' || normalized === 'OHM' || normalized === 'CONTINUITY') return 'RESISTANCE';
  return 'VOLTAGE';
}

/**
 * Builds the smallest worker result contract required by active consumers.
 * This function is pure: no Zustand state or browser API is read, making all
 * consumer combinations deterministic and independently testable.
 */
export function buildResultSubscription({
  nodes,
  circuit,
  showCurrentFlow,
  thermalHeatmapEnabled,
  resultDataConsumers,
  virtualMeter,
  diagnosticsEnabled = false,
}: ResultSubscriptionInput): ResultSubscription {
  const availableElementIds = new Set(circuit.elements.map((element) => element.id));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const nodeIndices = new Set<number>([0]);
  const branchCurrentElementIds = new Set<string>();
  const powerElementIds = new Set<string>();
  const addExistingElement = (target: Set<string>, elementId: string) => {
    if (availableElementIds.has(elementId)) target.add(elementId);
  };

  circuit.pinToMNANode.forEach((nodeIndex) => nodeIndices.add(nodeIndex));
  Object.values(circuit.scopeChannels).forEach((nodeIndex) => nodeIndices.add(nodeIndex));

  const currentDrivenComponentIds = new Set(
    nodes
      .filter((node) =>
        node.type === 'AMMETER' ||
        node.type === 'BUZZER' ||
        node.type === 'MOTOR_DC' ||
        node.type.includes('LED') ||
        node.type === 'DISPLAY_7SEG' ||
        node.type === 'STEPPER_MOTOR' ||
        node.type === 'MOTOR_STEPPER' ||
        node.type === 'RELAY_SPDT' ||
        node.type === 'RELAY_SINGLE' ||
        node.type === 'RELAY_2CH' ||
        node.type === 'RELAY_4CH')
      .map((node) => node.id),
  );

  for (const [elementId, componentId] of circuit.elementToComponent.entries()) {
    if (currentDrivenComponentIds.has(componentId)) addExistingElement(branchCurrentElementIds, elementId);
    if (thermalHeatmapEnabled && visibleNodeIds.has(componentId)) addExistingElement(powerElementIds, elementId);
  }

  nodes.forEach((node) => {
    if (node.type !== 'MULTIMETER') return;
    const mode = meterMeasurementMode(node.properties?.mode);
    if (mode === 'CURRENT') addExistingElement(branchCurrentElementIds, `mm_${node.id}`);
    if (mode === 'RESISTANCE') addExistingElement(branchCurrentElementIds, `r_mm_ohm_${node.id}`);
  });

  if (virtualMeter.probes.length > 0) {
    if (virtualMeter.mode === 'CURRENT') addExistingElement(branchCurrentElementIds, 'mm_virtual');
    if (virtualMeter.mode === 'RESISTANCE') addExistingElement(branchCurrentElementIds, 'r_vm_ohm_virtual');
  }

  if (showCurrentFlow) {
    circuit.elements.forEach((element) => branchCurrentElementIds.add(element.id));
  }

  if (resultDataConsumers.ai || resultDataConsumers.lab) {
    for (let nodeIndex = 0; nodeIndex <= circuit.numNodes; nodeIndex += 1) nodeIndices.add(nodeIndex);
    circuit.elements.forEach((element) => {
      branchCurrentElementIds.add(element.id);
      powerElementIds.add(element.id);
    });
  }

  return {
    nodeIndices: [...nodeIndices].sort((a, b) => a - b),
    branchCurrentElementIds: [...branchCurrentElementIds].sort(),
    powerElementIds: [...powerElementIds].sort(),
    diagnosticsEnabled,
  };
}

/** Maps compact typed-array values back to stable IDs on the main thread. */
export function materializeResultBuffers(
  payload: ResultBufferPayload,
  numNodes: number,
): MaterializedResultBuffers {
  const nodeVoltages = new Array(Math.max(0, numNodes) + 1).fill(0);
  payload.nodeIndices.forEach((nodeIndex, index) => {
    if (nodeIndex >= 0 && nodeIndex < nodeVoltages.length) {
      nodeVoltages[nodeIndex] = payload.nodeVoltages[index] ?? 0;
    }
  });

  const branchCurrents: Record<string, number> = {};
  (payload.branchCurrentElementIds ?? []).forEach((elementId, index) => {
    branchCurrents[elementId] = payload.branchCurrents?.[index] ?? 0;
  });

  const componentPower: Record<string, number> = {};
  (payload.powerElementIds ?? []).forEach((elementId, index) => {
    componentPower[elementId] = payload.componentPower?.[index] ?? 0;
  });

  return { nodeVoltages, branchCurrents, componentPower };
}

/** Returns exactly the numeric buffers that should be transferred. */
export function resultTransferables(payload: ResultBufferPayload): Transferable[] {
  const buffers: Transferable[] = [payload.nodeVoltages.buffer];
  if (payload.branchCurrents) buffers.push(payload.branchCurrents.buffer);
  if (payload.componentPower) buffers.push(payload.componentPower.buffer);
  return buffers;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`[result subscription] ${message}`);
}

function fixtureInput(overrides: Partial<ResultSubscriptionInput> = {}): ResultSubscriptionInput {
  const nodes = [
    { id: 'resistor_1', type: 'RESISTOR', properties: {} },
    { id: 'led_1', type: 'LED_STANDARD', properties: {} },
    { id: 'motor_1', type: 'MOTOR_DC', properties: {} },
  ] as CanvasNode[];
  const elements = [
    { id: 'r_branch', type: 'RESISTOR', nodeA: 1, nodeB: 2 },
    { id: 'led_branch', type: 'DIODE', nodeA: 2, nodeB: 0 },
    { id: 'motor_branch', type: 'MOTOR_DC', nodeA: 1, nodeB: 0 },
    { id: 'mm_meter_current', type: 'RESISTOR', nodeA: 1, nodeB: 0 },
    { id: 'r_mm_ohm_meter_resistance', type: 'RESISTOR', nodeA: 1, nodeB: 0 },
    { id: 'unused_branch', type: 'RESISTOR', nodeA: 3, nodeB: 0 },
  ] as ResultSubscriptionInput['circuit']['elements'];
  const circuit: ResultSubscriptionInput['circuit'] = {
    numNodes: 4,
    elements,
    pinToMNANode: new Map([['led_1:anode', 2], ['scope:ch1', 4]]),
    elementToComponent: new Map([
      ['r_branch', 'resistor_1'],
      ['led_branch', 'led_1'],
      ['motor_branch', 'motor_1'],
      ['mm_meter_current', 'meter_current'],
      ['r_mm_ohm_meter_resistance', 'meter_resistance'],
      ['unused_branch', 'resistor_1'],
    ]),
    scopeChannels: { CH1: 4 },
  };
  return {
    nodes,
    circuit,
    showCurrentFlow: false,
    thermalHeatmapEnabled: false,
    resultDataConsumers: { ai: false, lab: false },
    virtualMeter: { mode: 'VOLTAGE', probes: [] },
    ...overrides,
  };
}

function sameValues<T>(actual: T[], expected: T[]): boolean {
  return actual.join('|') === expected.join('|');
}

/** Framework-free contract coverage for every selective-result consumer. */
export function assertResultSubscriptionContract() {
  const base = buildResultSubscription(fixtureInput());
  assert(sameValues(base.nodeIndices, [0, 2, 4]), 'visible and scope nodes must be retained');
  assert(sameValues(base.branchCurrentElementIds, ['led_branch', 'motor_branch']), 'LED and motor currents must be retained');
  assert(base.powerElementIds.length === 0, 'power values must be omitted without thermal demand');

  const currentMeter = buildResultSubscription(fixtureInput({
    nodes: [
      { id: 'meter_current', type: 'MULTIMETER', properties: { mode: 'CURRENT' } },
    ] as unknown as CanvasNode[],
  }));
  assert(sameValues(currentMeter.branchCurrentElementIds, ['mm_meter_current']), 'current meter demand must select only its shunt');

  const resistanceMeter = buildResultSubscription(fixtureInput({
    nodes: [
      { id: 'meter_resistance', type: 'MULTIMETER', properties: { mode: 'RESISTANCE' } },
    ] as unknown as CanvasNode[],
  }));
  assert(sameValues(resistanceMeter.branchCurrentElementIds, ['r_mm_ohm_meter_resistance']), 'resistance meter demand must select only its test branch');

  const virtualCurrentInput = fixtureInput({
    virtualMeter: { mode: 'CURRENT', probes: [{ nodeId: 'led_1', pinId: 'anode' }] },
  });
  virtualCurrentInput.circuit.elements = [
    ...virtualCurrentInput.circuit.elements,
    { id: 'mm_virtual', type: 'RESISTOR', nodeA: 1, nodeB: 0 } as ResultSubscriptionInput['circuit']['elements'][number],
  ];
  const virtualCurrent = buildResultSubscription(virtualCurrentInput);
  assert(virtualCurrent.branchCurrentElementIds.includes('mm_virtual'), 'virtual current probe must be subscribed');

  const virtualResistance = buildResultSubscription(fixtureInput({
    virtualMeter: { mode: 'RESISTANCE', probes: [{ nodeId: 'led_1', pinId: 'anode' }] },
  }));
  assert(virtualResistance.branchCurrentElementIds.includes('r_vm_ohm_virtual') === false, 'missing virtual resistance element must not be invented');

  const flow = buildResultSubscription(fixtureInput({ showCurrentFlow: true }));
  assert(flow.branchCurrentElementIds.length === 6, 'current-flow demand must select every existing element');

  const thermal = buildResultSubscription(fixtureInput({ thermalHeatmapEnabled: true }));
  assert(thermal.powerElementIds.length === 4, 'thermal demand must select power for visible components');

  const ai = buildResultSubscription(fixtureInput({ resultDataConsumers: { ai: true, lab: false } }));
  const lab = buildResultSubscription(fixtureInput({ resultDataConsumers: { ai: false, lab: true } }));
  assert(ai.nodeIndices.length === 5 && ai.nodeIndices.every((value, index) => value === index), 'AI demand must select every solver node');
  assert(sameValues(ai.branchCurrentElementIds, elementsForFixture()), 'AI demand must select every branch');
  assert(sameValues(ai.powerElementIds, elementsForFixture()), 'AI demand must select every power value');
  assert(JSON.stringify(ai) === JSON.stringify(lab), 'AI and lab demand must request the same full result');

  const selectivePayload: ResultBufferPayload = {
    nodeIndices: [0, 2],
    nodeVoltages: new Float64Array([0, 2.5]),
    branchCurrentElementIds: ['led_branch'],
    branchCurrents: new Float64Array([0.01]),
    powerElementIds: ['led_branch'],
    componentPower: new Float64Array([0.025]),
  };
  const materialized = materializeResultBuffers(selectivePayload, 3);
  assert(materialized.nodeVoltages[2] === 2.5, 'node typed-array values must map to their subscribed indices');
  assert(materialized.branchCurrents.led_branch === 0.01, 'branch typed-array values must map to their IDs');
  assert(materialized.componentPower.led_branch === 0.025, 'power typed-array values must map to their IDs');

  const compactPayload: ResultBufferPayload = {
    nodeIndices: [0],
    nodeVoltages: new Float64Array([0]),
  };
  const compactTransfers = resultTransferables(compactPayload);
  assert(compactTransfers.length === 1 && compactTransfers[0] === compactPayload.nodeVoltages.buffer, 'unused branch and power buffers must be omitted');
  assert(resultTransferables(selectivePayload).length === 3, 'subscribed numeric buffers must all be transferable');
}

function elementsForFixture(): string[] {
  return ['led_branch', 'mm_meter_current', 'motor_branch', 'r_branch', 'r_mm_ohm_meter_resistance', 'unused_branch'];
}
