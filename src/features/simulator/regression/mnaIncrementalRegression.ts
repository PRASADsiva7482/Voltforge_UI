import type { CanvasNode, Wire } from '../../../types/domain';
import { hydrateCanvasNode } from '../../canvas/componentFactory';
import { createMaximumComponentRegressionPreset } from '../../../store/maxComponentRegressionPreset';
import { buildMNACircuit, type MNACircuit, type MNATopology, type VirtualMeterConfiguration } from '../NetlistBuilder';
import type { MNAElement } from '../MNASolver';
import {
  applyMnaElementValueUpdates,
  buildMnaElementValueUpdates,
  planIncrementalMnaRefresh,
  replaceMnaElementsPreservingTransientState,
  reusableMnaTopologyForVirtualMeter,
  sameMnaTopology,
  SolverWorkerLifecycleGate,
  virtualMeterTopologySignature,
} from '../mnaIncremental';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Incremental MNA contract failed: ${message}`);
}

function cloneNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    pins: node.pins.map((pin) => ({ ...pin })),
    properties: { ...node.properties },
  }));
}

function editNodeProperties(
  nodes: readonly CanvasNode[],
  id: string,
  changes: Record<string, unknown>,
): CanvasNode[] {
  return nodes.map((node) => node.id === id
    ? { ...node, properties: { ...node.properties, ...changes } }
    : node);
}

function build(
  nodes: CanvasNode[],
  wires: Wire[],
  virtualMeter?: VirtualMeterConfiguration,
  cachedTopology?: MNATopology,
): MNACircuit {
  return buildMNACircuit(nodes, wires, {}, {}, {}, virtualMeter, cachedTopology);
}

function assertSinglePatch(
  previous: MNACircuit,
  next: MNACircuit,
  expectedElementId: string,
  expectedFields: string[],
) {
  const plan = planIncrementalMnaRefresh(previous, next);
  assert(plan.kind === 'patch-values', `${expectedElementId} must retain compiled topology`);
  assert(
    plan.elementUpdates.length === 1,
    `${expectedElementId} must emit exactly one element patch (received ${plan.elementUpdates.map((update) => `${update.id}:${Object.keys(update.changes).join(',')}`).join('|') || 'none'})`,
  );
  const update = plan.elementUpdates[0];
  assert(update.id === expectedElementId, `${expectedElementId} must be the only patched element ID`);
  assert(
    Object.keys(update.changes).sort().join('|') === [...expectedFields].sort().join('|'),
    `${expectedElementId} must patch only ${expectedFields.join(', ')}`,
  );
  assert((update.unset || []).length === 0, `${expectedElementId} must not unset unrelated model fields`);
}

function assertTransientHistoryContract() {
  const previous: MNAElement[] = [
    { id: 'history_cap', type: 'CAPACITOR', nodeA: 1, nodeB: 0, value: 1e-6, prevVoltage: 2.5, prevCurrent: 0.02 },
    { id: 'history_ind', type: 'INDUCTOR', nodeA: 2, nodeB: 0, value: 0.01, prevCurrent: 0.4 },
    {
      id: 'history_xfmr', type: 'TRANSFORMER', nodeA: 3, nodeB: 0, controlNode: 4, controlNode2: 0,
      value: 0.2, secondaryInductance: 0.8, turnsRatio: 2, coupling: 0.98, prevCurrent: 0.1, prevSecondaryCurrent: 0.25,
    },
    {
      id: 'history_555', type: 'BEHAVIORAL_555', nodeA: 5, nodeB: 0, controlNode: 6,
      resetNode: 7, outputElementId: 'history_555_out', dischargeElementId: 'history_555_discharge', value: 1, behaviorState: true,
    },
  ];
  const replacement = previous.map((element) => {
    const next = { ...element, value: element.value * 2 };
    delete next.prevVoltage;
    delete next.prevCurrent;
    delete next.prevSecondaryCurrent;
    delete next.behaviorState;
    return next;
  });
  const preserved = replaceMnaElementsPreservingTransientState(previous, replacement);
  assert(preserved[0].prevVoltage === 2.5 && preserved[0].prevCurrent === 0.02, 'capacitor history must survive element replacement');
  assert(preserved[1].prevCurrent === 0.4, 'inductor history must survive element replacement');
  assert(preserved[2].prevCurrent === 0.1 && preserved[2].prevSecondaryCurrent === 0.25, 'transformer primary and secondary history must survive replacement');
  assert(preserved[3].behaviorState === true, 'behavioral device state must survive element replacement');

  const generatedUpdates = buildMnaElementValueUpdates(previous, replacement);
  for (const update of generatedUpdates) {
    const changedFields = [...Object.keys(update.changes), ...(update.unset || [])];
    assert(!changedFields.some((field) => ['prevVoltage', 'prevCurrent', 'prevSecondaryCurrent', 'behaviorState'].includes(field)), 'generated patches must exclude transient fields');
  }

  const mutable = previous.map((element) => ({ ...element }));
  applyMnaElementValueUpdates(mutable, [{
    id: 'history_cap',
    changes: { value: 4e-6, prevVoltage: 999, prevCurrent: 999 },
    unset: ['prevVoltage', 'prevCurrent'],
  }]);
  assert(mutable[0].value === 4e-6, 'mutable model values must update in place');
  assert(mutable[0].prevVoltage === 2.5 && mutable[0].prevCurrent === 0.02, 'worker patch application must reject transient mutations and unsets');
}

function assertWorkerLifecycleContract(previous: MNACircuit, next: MNACircuit) {
  const gate = new SolverWorkerLifecycleGate();
  const previousGeneration = gate.start(previous.elements.map((element) => element.id));
  const previousOnlyId = previous.elements.find((element) => !next.elements.some((candidate) => candidate.id === element.id))?.id
    ?? previous.elements[0].id;
  assert(gate.accepts(previousGeneration, previousOnlyId), 'the active worker must accept its own element IDs');
  assert(gate.stop() === previousGeneration, 'the previous generation must stop before replacement');
  const nextGeneration = gate.start(next.elements.map((element) => element.id));
  assert(nextGeneration > previousGeneration, 'replacement workers must receive a newer generation');
  assert(!gate.accepts(previousGeneration), 'queued messages from the terminated worker must be rejected');
  assert(!gate.accepts(nextGeneration, previousOnlyId), 'stale element IDs must not enter the replacement worker');

  const snapshot = gate.snapshot();
  assert(snapshot.events.map((event) => event.kind).join('|') === 'start|stop|start', 'worker lifecycle ordering must be start, stop, start');
  assert(snapshot.activeGeneration === nextGeneration, 'exactly one replacement generation must remain active');
  gate.stop();
  assert(!gate.hasActiveWorker, 'final disposal must leave no active worker generation');
}

/** Deterministic builder/worker coverage using production incremental seams. */
export function assertIncrementalMnaContract() {
  const preset = createMaximumComponentRegressionPreset();
  const ldr = hydrateCanvasNode({
    id: 'opt_fb_006_ldr',
    name: 'Incremental LDR',
    type: 'LDR',
    x: 1_020,
    y: 520,
    properties: { lightLevel: 50, resistanceDark: 100_000, resistanceLight: 500 },
  });
  const nodes = [...cloneNodes(preset.nodes), ldr];
  const wires = preset.wires.map((wire) => ({ ...wire, bendPoints: wire.bendPoints.map((point) => ({ ...point })) }));
  const initial = build(nodes, wires);
  const freshEquivalent = build(cloneNodes(nodes), wires);
  const cachedEquivalent = build(cloneNodes(nodes), wires, undefined, initial.topology);
  assert(sameMnaTopology(initial.topology, freshEquivalent.topology), 'fresh builders must produce equivalent maximum-preset topology');
  assert(sameMnaTopology(initial.topology, cachedEquivalent.topology), 'cached and fresh maximum-preset topology must be equivalent');
  assert(cachedEquivalent.buildMetrics.topologyCacheHit, 'an unchanged maximum circuit must accept its topology cache');
  assert(cachedEquivalent.buildMetrics.connectivityDiscoveryPassCount === 0, 'cached value refresh must skip connectivity discovery');
  assert(cachedEquivalent.buildMetrics.wireUnionCount === 0, 'cached value refresh must skip wire union work');
  assert(cachedEquivalent.buildMetrics.breadboardProximityComparisonCount === 0, 'cached value refresh must skip breadboard proximity work');
  const initialMotor = initial.elements.find((element) => element.id === 'mot_max_motor')!;
  const cachedMotor = cachedEquivalent.elements.find((element) => element.id === 'mot_max_motor')!;
  assert(initialMotor.internalNode === cachedMotor.internalNode, 'cached refresh must retain deterministic motor internal-node allocation');
  const unchangedPlan = planIncrementalMnaRefresh(initial, cachedEquivalent);
  assert(unchangedPlan.kind === 'patch-values' && unchangedPlan.elementUpdates.length === 0, 'unchanged cached builds must emit no patches');

  const valueCases: Array<{
    id: string;
    changes: Record<string, unknown>;
    elementId: string;
    fields: string[];
  }> = [
    { id: 'max_resistor_1', changes: { resistance: 777 }, elementId: 'r_max_resistor_1', fields: ['value'] },
    { id: 'max_supply', changes: { voltage: 6 }, elementId: 'vs_source_max_supply', fields: ['value'] },
    { id: 'max_diode', changes: { forwardVoltage: 0.85 }, elementId: 'd_max_diode', fields: ['forwardVoltage'] },
    { id: 'max_motor', changes: { windingResistance: 9 }, elementId: 'mot_max_motor', fields: ['value'] },
    { id: ldr.id, changes: { lightLevel: 75 }, elementId: `ldr_${ldr.id}`, fields: ['value'] },
  ];
  for (const valueCase of valueCases) {
    const edited = editNodeProperties(nodes, valueCase.id, valueCase.changes);
    const refreshed = build(edited, wires, undefined, initial.topology);
    assert(refreshed.buildMetrics.topologyCacheHit, `${valueCase.id} value edit must reuse cached connectivity`);
    assert(refreshed.buildMetrics.connectivityDiscoveryPassCount === 0, `${valueCase.id} value edit must skip connectivity discovery`);
    assertSinglePatch(initial, refreshed, valueCase.elementId, valueCase.fields);
  }

  const breadboard = hydrateCanvasNode({ id: 'opt_fb_006_breadboard', name: 'Topology Breadboard', type: 'BREADBOARD', x: 0, y: 0 });
  const proximityResistor = hydrateCanvasNode({
    id: 'opt_fb_006_proximity_resistor', name: 'Proximity Resistor', type: 'RESISTOR', x: 15, y: 28,
    properties: { resistance: 220 },
  });
  const breadboardNodes = [breadboard, proximityResistor];
  const breadboardFresh = build(breadboardNodes, []);
  assert(
    breadboardFresh.pinToMNANode.get(`${breadboard.id}:a1`) === breadboardFresh.pinToMNANode.get(`${proximityResistor.id}:p1`),
    'overlapping component and breadboard pins must share an MNA node',
  );
  const breadboardCached = build(cloneNodes(breadboardNodes), [], undefined, breadboardFresh.topology);
  assert(breadboardCached.buildMetrics.topologyCacheHit && sameMnaTopology(breadboardFresh.topology, breadboardCached.topology), 'unchanged breadboard topology must be cache-equivalent');
  const movedBreadboardNodes = [breadboard, { ...proximityResistor, y: proximityResistor.y + 80 }];
  const movedBreadboard = build(movedBreadboardNodes, [], undefined, breadboardFresh.topology);
  assert(!movedBreadboard.buildMetrics.topologyCacheHit, 'breadboard proximity movement must reject stale connectivity');
  assert(movedBreadboard.buildMetrics.breadboardProximityComparisonCount > 0, 'fresh breadboard rebuild must rediscover proximity links');
  assert(
    movedBreadboard.pinToMNANode.get(`${breadboard.id}:a1`) !== movedBreadboard.pinToMNANode.get(`${proximityResistor.id}:p1`),
    'moving away from a breadboard hole must remove the proximity connection',
  );
  assert(planIncrementalMnaRefresh(breadboardFresh, movedBreadboard).kind === 'rebuild-topology', 'breadboard proximity changes must take the rebuild path');

  const endpointWires = wires.map((wire) => wire.id === 'max_wire_supply_board'
    ? { ...wire, toPinId: 'd13' }
    : wire);
  const endpointChanged = build(nodes, endpointWires, undefined, initial.topology);
  assert(!endpointChanged.buildMetrics.topologyCacheHit, 'direct-wire endpoint changes must reject cached connectivity');
  assert(endpointChanged.buildMetrics.connectivityDiscoveryPassCount === 1, 'direct-wire endpoint changes must run one fresh connectivity pass');
  assert(planIncrementalMnaRefresh(initial, endpointChanged).kind === 'rebuild-topology', 'direct-wire endpoint changes must recreate the worker');

  const voltageMeter: VirtualMeterConfiguration = {
    mode: 'VOLTAGE',
    probes: [
      { nodeId: 'max_resistor_1', pinId: 'p1' },
      { nodeId: 'max_ground', pinId: 'gnd' },
    ],
  };
  const voltageMeterCircuit = build(nodes, wires, voltageMeter);
  const sameMeterTopology = reusableMnaTopologyForVirtualMeter(
    virtualMeterTopologySignature(voltageMeter),
    voltageMeter,
    voltageMeterCircuit.topology,
  );
  assert(sameMeterTopology === voltageMeterCircuit.topology, 'unchanged virtual-meter demand may reuse topology');
  const voltageMeterCached = build(nodes, wires, voltageMeter, sameMeterTopology);
  assert(voltageMeterCached.buildMetrics.topologyCacheHit, 'unchanged virtual-meter topology must hit the cache');

  const currentMeter: VirtualMeterConfiguration = { ...voltageMeter, mode: 'CURRENT' };
  const changedMeterTopology = reusableMnaTopologyForVirtualMeter(
    virtualMeterTopologySignature(voltageMeter),
    currentMeter,
    voltageMeterCircuit.topology,
  );
  assert(changedMeterTopology === undefined, 'virtual-meter mode changes must bypass cached topology');
  const currentMeterCircuit = build(nodes, wires, currentMeter, changedMeterTopology);
  assert(planIncrementalMnaRefresh(voltageMeterCircuit, currentMeterCircuit).kind === 'rebuild-topology', 'virtual-meter mode changes must rebuild structural meter elements');

  const multimeter = hydrateCanvasNode({
    id: 'opt_fb_006_multimeter', name: 'Structural Meter', type: 'MULTIMETER', x: 1_100, y: 620,
    properties: { mode: 'VOLTAGE' },
  });
  const structuralNodes = [...nodes, multimeter];
  const structuralInitial = build(structuralNodes, wires);
  const structuralEdited = build(
    editNodeProperties(structuralNodes, multimeter.id, { mode: 'CURRENT' }),
    wires,
    undefined,
    structuralInitial.topology,
  );
  assert(structuralEdited.buildMetrics.topologyCacheHit, 'property-only structural edits may initially reuse connectivity');
  assert(planIncrementalMnaRefresh(structuralInitial, structuralEdited).kind === 'rebuild-topology', 'unsupported structural model changes must fail closed to a rebuild');

  assertTransientHistoryContract();
  assertWorkerLifecycleContract(voltageMeterCircuit, currentMeterCircuit);
}
