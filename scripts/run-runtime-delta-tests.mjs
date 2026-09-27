import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root,
  server: { middlewareMode: true },
});

try {
  const runtimeDelta = await vite.ssrLoadModule('/src/features/simulator/runtimeDelta.ts');
  const regressionPreset = await vite.ssrLoadModule('/src/store/maxComponentRegressionPreset.ts');
  const preset = regressionPreset.createMaximumComponentRegressionPreset();

  runtimeDelta.assertRuntimeDeltaContract(preset.nodes);
  console.log(`runtime delta contract: maximum-preset ${preset.nodes.length}-component assertions passed`);

  const { SimulationEngine } = await vite.ssrLoadModule('/src/features/simulator/SimulationEngine.ts');
  const { useCanvasStore } = await vite.ssrLoadModule('/src/store/canvasStore.ts');
  useCanvasStore.setState({ nodes: preset.nodes, nodesById: new Map(preset.nodes.map(n => [n.id, n])), nodeIndexById: new Map(preset.nodes.map((n, i) => [n.id, i])) });
  const original = useCanvasStore.getState().updateRuntimeNode;
  const engine = new SimulationEngine({ onSerialOutput() {}, onPinStateChange() {}, onError() {} });
  const id = preset.nodes[0].id;
  for (const fail of [false, true]) {
    const action = () => engine.runBatched(() => {
      useCanvasStore.getState().updateRuntimeNode(id, { properties: { boardPowered: !fail } });
      // An unrelated immutable update copies the temporarily replaced action.
      // It must not retain this engine after the batch, even when it throws.
      useCanvasStore.setState({ selectedNodeId: fail ? null : id });
      if (fail) throw new Error('batch failure fixture');
    });
    if (fail) assert.throws(action, /batch failure fixture/); else action();
    assert.equal(useCanvasStore.getState().updateRuntimeNode, original, 'Runtime batching must restore the action on the latest store snapshot');
    assert.equal(useCanvasStore.getState().nodesById.get(id).properties.boardPowered, !fail);
  }
  console.log('runtime delta contract: action identity and pending deltas restored after immutable updates and exceptions');

  // Repeated GPIO edges must reuse connectivity without caching electrical
  // values or carrying stale nets across authored edits and simulation runs.
  const wire = (id, fromNodeId, fromPinId, toNodeId, toPinId) => ({ id, fromNodeId, fromPinId, toNodeId, toPinId, bendPoints: [], routingMode: 'manual', color: '#fff' });
  const pin = (id, name = id) => ({ id, name, x: 0, y: 0, type: 'PASSIVE' });
  const node = (id, type, pins) => ({ id, type, name: id, x: 0, y: 0, width: 100, height: 100, pins, properties: {} });
  const board = node('board', 'ARDUINO_UNO', [pin('d3', 'D3')]);
  const breadboard = node('bread', 'BREADBOARD', ['a1', 'b1', 'e1', 'f1', 'j1', 'a2', 'vcc_top_1', 'vcc_bottom_2', 'gnd_top_1'].map(id => pin(id)));
  const load = node('load', 'LED_STANDARD', [pin('a'), pin('k')]);
  const supply = node('supply', 'DC_SOURCE_5V', [pin('p', 'VCC')]);
  const ground = node('ground', 'GROUND', [pin('p', 'GND')]);
  const nodes = [board, breadboard, load, supply, ground];
  const wires = [wire('input', 'board', 'd3', 'bread', 'a1'), wire('load', 'bread', 'e1', 'load', 'a'), wire('cycle', 'load', 'a', 'board', 'd3')];
  const seed = () => useCanvasStore.setState({ nodes, documentNodes: nodes, nodesById: new Map(nodes.map(n => [n.id, n])), nodeIndexById: new Map(nodes.map((n, i) => [n.id, i])), wires, modelRevision: useCanvasStore.getState().modelRevision + 1 });
  seed();
  const events = [];
  const connectivity = new SimulationEngine({ onSerialOutput() {}, onPinStateChange(...args) { events.push(args); }, onError() {} });
  const expected = [
    { nodeId: 'board', pinId: 'd3' }, { nodeId: 'bread', pinId: 'a1' },
    { nodeId: 'load', pinId: 'a' }, { nodeId: 'bread', pinId: 'b1' }, { nodeId: 'bread', pinId: 'e1' },
  ];
  const connected = connectivity.getConnectedPins('board', 'd3', wires);
  assert.deepEqual(connected, expected, 'Cycles terminate, BFS order is preserved, and the breadboard center gap/adjacent rows stay isolated');
  useCanvasStore.getState().updateRuntimeNode('load', { properties: { isLit: true } });
  assert.equal(connectivity.getConnectedPins('board', 'd3', wires), connected, 'Runtime feedback must reuse the net');
  connectivity.propagatePinState('3', 'HIGH', nodes, wires, 255);
  connectivity.propagatePinState('3', 'LOW', nodes, wires, 0);
  assert.deepEqual(events, ['HIGH', 'LOW'].flatMap(state => expected.slice(1).map(ref => [ref.nodeId, ref.pinId, state, state === 'HIGH' ? 255 : 0])));
  connectivity.pins['3'] = { mode: 'OUTPUT', state: 'HIGH', value: 255 };
  assert.equal(connectivity.voltageAtPin('load', 'a', nodes, wires), 5);
  connectivity.pins['3'].state = 'LOW';
  assert.equal(connectivity.voltageAtPin('load', 'a', nodes, wires), 0, 'Warm connectivity must still read live pin values');

  useCanvasStore.getState().commitNodeUpdate('bread', { type: 'CUSTOM' });
  assert.deepEqual(connectivity.getConnectedPins('board', 'd3', wires), expected.filter(ref => ref.pinId !== 'b1'), 'A type edit invalidates even a retained wire snapshot');
  useCanvasStore.getState().commitNodeUpdate('bread', { type: 'BREADBOARD', pins: [pin('a1'), pin('e1')] });
  assert.deepEqual(connectivity.getConnectedPins('board', 'd3', wires), expected.filter(ref => ref.pinId !== 'b1'), 'Removed breadboard pins do not remain in the cached net');
  useCanvasStore.getState().updateWire('input', { toPinId: 'f1' });
  useCanvasStore.getState().removeWire('cycle');
  assert.deepEqual(connectivity.getConnectedPins('board', 'd3', useCanvasStore.getState().wires), [{ nodeId: 'board', pinId: 'd3' }, { nodeId: 'bread', pinId: 'f1' }], 'Endpoint edits/removals disconnect the old load');
  useCanvasStore.getState().undo();
  assert(connectivity.getConnectedPins('board', 'd3', useCanvasStore.getState().wires).some(ref => ref.nodeId === 'load'), 'Undo restores connectivity');
  useCanvasStore.getState().redo();
  assert(!connectivity.getConnectedPins('board', 'd3', useCanvasStore.getState().wires).some(ref => ref.nodeId === 'load'), 'Redo removes connectivity');
  seed();
  assert.deepEqual(connectivity.getConnectedPins('bread', 'vcc_top_1', []), [{ nodeId: 'bread', pinId: 'vcc_top_1' }, { nodeId: 'bread', pinId: 'vcc_bottom_2' }], 'Existing same-polarity rail connectivity is preserved');
  const conflictingSources = [wire('v', 'load', 'a', 'supply', 'p'), wire('g', 'load', 'a', 'ground', 'p')];
  assert.equal(connectivity.voltageAtPin('load', 'a', nodes, conflictingSources), 5);
  assert.equal(connectivity.voltageAtPin('load', 'a', nodes, [...conflictingSources].reverse()), 0, 'Wire order remains significant for existing first-source voltage behavior');
  connectivity.getConnectedPins('board', 'd3', wires);
  connectivity.stop();
  assert.equal(connectivity.connectedPinsCache.size, 0, 'Stopping must release cached pin references');
  assert.equal(connectivity.connectedPinsWires, null, 'Stopping must release the wire snapshot');
  assert.deepEqual(connectivity.getConnectedPins('board', 'd3', wires), expected);
  useCanvasStore.getState().clearCanvas();
  assert.deepEqual(connectivity.getConnectedPins('board', 'd3', useCanvasStore.getState().wires), [{ nodeId: 'board', pinId: 'd3' }], 'Clearing the canvas cannot reuse an old net');
  console.log('runtime delta contract: connectivity reuse, live voltage/propagation, breadboard isolation, rewiring, undo/redo and stop/reset assertions passed');
} finally {
  await vite.close();
}
