import type { CanvasNode, Wire } from '../types/domain';
import { createMaximumComponentRegressionPreset } from './maxComponentRegressionPreset';
import { useCanvasStore } from './canvasStore';
import { CanvasModelRevisionProbe, type CanvasModelReconciliation } from './modelRevision';
import { applyIndexedRuntimeNodeUpdates } from './runtimeNodeMutation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model revision contract failed: ${message}`);
}

function assertNodeIndexConsistent() {
  const state = useCanvasStore.getState();
  assert(state.nodeIndexById.size === state.nodes.length, 'node index size must match the canvas');
  state.nodes.forEach((node, index) => {
    assert(state.nodeIndexById.get(node.id) === index, `node index must resolve ${node.id} to ${index}`);
    assert(state.nodesById.get(node.id) === node, `node map must retain the current ${node.id} object`);
  });
}

function cloneNode(node: CanvasNode, id: string): CanvasNode {
  return {
    ...node,
    componentId: id,
    id,
    name: `${node.name} revision fixture`,
    pins: node.pins.map((pin) => ({ ...pin })),
    properties: { ...node.properties },
    x: node.x + 20,
    y: node.y + 20,
  };
}

/** Actual Zustand actions observed through the same classifier as SimulationEngine. */
export function assertModelRevisionIsolationContract() {
  const preset = createMaximumComponentRegressionPreset();
  useCanvasStore.getState().resetCanvas();
  useCanvasStore.getState().loadCanvas(preset.nodes, preset.wires);
  assertNodeIndexConsistent();

  const probe = new CanvasModelRevisionProbe();
  const decisions: CanvasModelReconciliation[] = [];
  let valueRefreshEnvelopeCount = 0;
  let workerStopCount = 0;
  let workerStartCount = 0;
  let rebuiltNodeIds: string[] = [];
  let rebuiltWireIds: string[] = [];
  const resetEngineFixture = () => {
    valueRefreshEnvelopeCount = 0;
    workerStopCount = 0;
    workerStartCount = 0;
    rebuiltNodeIds = [];
    rebuiltWireIds = [];
  };
  const snapshotEngineFixture = () => ({
    rebuiltNodeIds,
    rebuiltWireIds,
    valueRefreshEnvelopeCount,
    workerStartCount,
    workerStopCount,
  });
  const unsubscribe = useCanvasStore.subscribe((state, previous) => {
    const decision = probe.observe(state, previous);
    decisions.push(decision);
    if (decision.kind === 'refresh-values') {
      valueRefreshEnvelopeCount += 1;
    } else if (decision.kind === 'rebuild-topology') {
      // Mirrors SimulationEngine's stop-then-start branch and captures the
      // exact current canvas data forwarded to the replacement worker.
      workerStopCount += 1;
      workerStartCount += 1;
      rebuiltNodeIds = state.nodes.map((node) => node.id);
      rebuiltWireIds = state.wires.map((wire) => wire.id);
    }
  });

  try {
    const initialState = useCanvasStore.getState();
    assert(initialState.nodes.length === preset.nodes.length, 'the real maximum preset must be loaded');
    const sparseRuntimeResult = applyIndexedRuntimeNodeUpdates(initialState, [
      { id: 'max_led_1', changes: { properties: { isLit: true } } },
      { id: 'max_motor', changes: { properties: { isSpinning: true } } },
    ]);
    assert(sparseRuntimeResult.metrics.requestedUpdateCount === 2, 'the sparse fixture must request two updates');
    assert(sparseRuntimeResult.metrics.indexLookupCount === 2, 'runtime work must use one index lookup per requested update');
    assert(sparseRuntimeResult.metrics.updatedNodeCount === 2, 'only the two requested components may be replaced');
    assert(sparseRuntimeResult.metrics.fullCanvasScanCount === 0, 'runtime mutation must not scan every maximum-preset node');
    const untouchedId = 'max_resistor_12';
    const untouchedIndex = initialState.nodeIndexById.get(untouchedId)!;
    assert(sparseRuntimeResult.nodes[untouchedIndex] === initialState.nodes[untouchedIndex], 'unaffected node references must remain stable');

    probe.reset();
    decisions.length = 0;
    resetEngineFixture();
    const runtimeRevision = useCanvasStore.getState().modelRevision;
    const runtimeModelChange = useCanvasStore.getState().lastModelChange;
    const runtimeWires = useCanvasStore.getState().wires;
    useCanvasStore.getState().updateRuntimeNode('max_led_1', {
      properties: { isLit: true, currentMa: 1.2 },
    });
    useCanvasStore.getState().batchUpdateRuntimeNodes([
      { id: 'max_motor', changes: { properties: { isSpinning: true, rpm: 1200 } } },
      { id: 'max_led_2', changes: { properties: { isLit: false, currentMa: 0 } } },
    ]);
    const runtimeState = useCanvasStore.getState();
    const runtimeMetrics = probe.snapshot();
    const runtimeEngineFixture = snapshotEngineFixture();
    assert(runtimeState.modelRevision === runtimeRevision, 'runtime actions must preserve modelRevision');
    assert(runtimeState.lastModelChange === runtimeModelChange, 'runtime actions must preserve lastModelChange');
    assert(runtimeState.wires === runtimeWires, 'runtime actions must preserve the wires reference');
    assert(runtimeMetrics.sameRevisionNotificationCount === 2, 'single and batch runtime actions must each take the revision fast path');
    assert(runtimeMetrics.valueRefreshCount === 0, 'runtime feedback must not refresh MNA values');
    assert(runtimeMetrics.topologyRebuildCount === 0, 'runtime feedback must not recreate the worker');
    assert(runtimeMetrics.targetedNodeCount === 0, 'runtime feedback must not enter targeted model reconciliation');
    assert(runtimeEngineFixture.valueRefreshEnvelopeCount === 0, 'runtime feedback must not send a worker value-update envelope');
    assert(runtimeEngineFixture.workerStopCount === 0 && runtimeEngineFixture.workerStartCount === 0, 'runtime feedback must retain the active worker');
    assertNodeIndexConsistent();

    probe.reset();
    decisions.length = 0;
    resetEngineFixture();
    const resistor = useCanvasStore.getState().nodesById.get('max_resistor_1')!;
    const electricalRevision = useCanvasStore.getState().modelRevision;
    useCanvasStore.getState().commitNodeUpdate(resistor.id, {
      properties: { ...resistor.properties, resistance: Number(resistor.properties.resistance) + 10 },
    });
    const electricalMetrics = probe.snapshot();
    const electricalEngineFixture = snapshotEngineFixture();
    assert(useCanvasStore.getState().modelRevision === electricalRevision + 1, 'one electrical edit must increment the revision once');
    assert(electricalMetrics.valueRefreshCount === 1, 'one electrical edit must schedule one MNA value refresh');
    assert(electricalMetrics.targetedNodeCount === 1, 'one electrical edit must visit only its affected component ID');
    assert(electricalMetrics.topologyRebuildCount === 0, 'a value-only edit must retain the worker');
    assert(electricalEngineFixture.valueRefreshEnvelopeCount === 1, 'one electrical edit must send one worker value-update envelope');
    assert(electricalEngineFixture.workerStopCount === 0 && electricalEngineFixture.workerStartCount === 0, 'one electrical value edit must not recreate the worker');
    assert(
      decisions.filter((decision) => decision.kind === 'refresh-values').length === 1,
      'history publication must not duplicate the targeted solver refresh',
    );

    const expectTopologyRebuild = (label: string, action: () => void) => {
      probe.reset();
      decisions.length = 0;
      resetEngineFixture();
      const revision = useCanvasStore.getState().modelRevision;
      action();
      const metrics = probe.snapshot();
      const engineFixture = snapshotEngineFixture();
      assert(useCanvasStore.getState().modelRevision === revision + 1, `${label} must increment the revision once`);
      assert(metrics.topologyRebuildCount === 1, `${label} must recreate the worker exactly once`);
      assert(metrics.valueRefreshCount === 0, `${label} must not also schedule a value refresh`);
      assert(engineFixture.workerStopCount === 1 && engineFixture.workerStartCount === 1, `${label} must stop and start one worker`);
      assert(engineFixture.valueRefreshEnvelopeCount === 0, `${label} must not send an incremental value envelope`);
      assert(
        decisions.filter((decision) => decision.kind === 'rebuild-topology').length === 1,
        `${label} must publish one topology decision`,
      );
      assert(
        engineFixture.rebuiltNodeIds.join('|') === useCanvasStore.getState().nodes.map((node) => node.id).join('|'),
        `${label} must rebuild with the current node data`,
      );
      assert(
        engineFixture.rebuiltWireIds.join('|') === useCanvasStore.getState().wires.map((wire) => wire.id).join('|'),
        `${label} must rebuild with the current wire data`,
      );
      assertNodeIndexConsistent();
    };

    const fixtureNode = cloneNode(useCanvasStore.getState().nodesById.get('max_resistor_2')!, 'opt_fb_005_node');
    expectTopologyRebuild('addNode', () => useCanvasStore.getState().addNode(fixtureNode));
    expectTopologyRebuild('removeNode', () => useCanvasStore.getState().removeNode(fixtureNode.id));

    const sourceWire = preset.wires[0];
    const fixtureWire: Wire = {
      ...sourceWire,
      bendPoints: sourceWire.bendPoints.map((point) => ({ ...point })),
      id: 'opt_fb_005_wire',
    };
    expectTopologyRebuild('addWire', () => useCanvasStore.getState().addWire(fixtureWire));
    expectTopologyRebuild('removeWire', () => useCanvasStore.getState().removeWire(fixtureWire.id));
    expectTopologyRebuild('undo', () => useCanvasStore.getState().undo());
    expectTopologyRebuild('redo', () => useCanvasStore.getState().redo());
    expectTopologyRebuild('loadCanvas', () => useCanvasStore.getState().loadCanvas(preset.nodes, preset.wires));
    expectTopologyRebuild('clearCanvas', () => useCanvasStore.getState().clearCanvas());
    assert(useCanvasStore.getState().nodes.length === 0, 'clearCanvas must leave no stale indexed nodes');
  } finally {
    unsubscribe();
  }
}
