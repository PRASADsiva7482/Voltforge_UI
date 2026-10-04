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

  const { useSimulationStore } = await vite.ssrLoadModule('/src/store/simulationStore.ts');
  const initialSimulation = useSimulationStore.getState();
  let publications = 0;
  const unsubscribe = useSimulationStore.subscribe(() => { publications++; });
  try {
    for (let i = 0; i < 1000; i++) {
      assert.deepEqual(useSimulationStore.getState().drainSerialInput(), []);
      useSimulationStore.getState().setLiveMeter({ ...initialSimulation.liveMeter });
    }
    assert.equal(publications, 0, 'Empty polls and unchanged measurements must not notify subscribers');
    assert.equal(useSimulationStore.getState(), initialSimulation);
    const empty = useSimulationStore.getState().drainSerialInput();
    empty.push('consumer-owned');
    assert.deepEqual(useSimulationStore.getState().serialInputQueue, [], 'An empty drain still returns an independently owned array');
    useSimulationStore.getState().sendSerialInput('first');
    useSimulationStore.getState().sendSerialInput('second');
    const queued = useSimulationStore.getState().serialInputQueue;
    const drained = useSimulationStore.getState().drainSerialInput();
    assert.equal(drained, queued);
    assert.deepEqual(drained, ['first', 'second']);
    assert.equal(publications, 3, 'Two arrivals and one nonempty drain each publish');
    assert.deepEqual(useSimulationStore.getState().drainSerialInput(), []);
    assert.equal(publications, 3);
    let injectOnce = true;
    const reentrant = useSimulationStore.subscribe((next, previous) => {
      if (injectOnce && previous.serialInputQueue.length && !next.serialInputQueue.length) {
        injectOnce = false;
        next.sendSerialInput('during-drain');
      }
    });
    try {
      useSimulationStore.getState().sendSerialInput('before-drain');
      assert.deepEqual(useSimulationStore.getState().drainSerialInput(), ['before-drain']);
      assert.deepEqual(useSimulationStore.getState().drainSerialInput(), ['during-drain']);
    } finally { reentrant(); }
    for (const measurement of [{ voltage: -0 }, { voltage: 0 }, { voltage: 3.3, positiveLabel: 'D3' }, { resistanceUnsafe: true, resistance_ohm: Infinity }]) {
      const before = useSimulationStore.getState().liveMeter, count = publications;
      useSimulationStore.getState().setLiveMeter(measurement);
      assert.equal(publications, count + 1);
      assert.deepEqual(useSimulationStore.getState().liveMeter, { ...before, ...measurement });
      const current = useSimulationStore.getState();
      current.setLiveMeter(measurement);
      assert.equal(useSimulationStore.getState(), current, 'A repeated measurement keeps its identity');
    }
    console.log('runtime delta contract: empty serial/meter no-ops, ordered drains, reentrant arrivals, and changed measurement publication passed');
  } finally { unsubscribe(); useSimulationStore.setState(initialSimulation, true); }

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

  // Drive actual AVR port registers and timer overrides. Every voltage edge
  // must survive, while unchanged output resistance needs no worker message.
  const { portDConfig } = await import('avr8js');
  const { PinOverrideMode } = await import('avr8js/dist/cjs/peripherals/gpio.js');
  const savedWindow = globalThis.window, savedWorker = globalThis.Worker;
  const pinMessages = [], workers = [];
  globalThis.window = {
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  };
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage(message) { pinMessages.push(structuredClone(message)); }
    terminate() { this.terminated = true; }
  };
  const avr = new SimulationEngine({ onSerialOutput() {}, onPinStateChange() {}, onError(error) { throw new Error(error); } });
  const avrBoard = structuredClone(preset.nodes.find(node => node.type === 'ARDUINO_UNO'));
  const resistanceId = `r_mcu_pin_${avrBoard.id}_d3`, voltageId = `vs_mcu_${avrBoard.id}_d3_src`;
  const values = id => pinMessages.filter(message => message.type === 'UPDATE_PIN' && message.elementId === id).map(message => message.voltage);
  const startAvr = async () => {
    useCanvasStore.getState().loadCanvas([avrBoard], [], { x: 0, y: 0, scale: 1 });
    await avr.start('void setup() {}\nvoid loop() {}', useCanvasStore.getState().nodes, [], ':00000001FF', 'ARDUINO_UNO');
    assert(avr.avrCpu && avr.mnaCircuit && avr.solverWorker, 'Real engine AVR and MNA lifecycle must initialize');
  };
  try {
    await startAvr();
    const cpu = avr.avrCpu, port = avr.avrPorts.D;
    cpu.writeData(portDConfig.DDR, 8);
    assert.deepEqual(values(resistanceId), [40], 'Output mode configures the driver once');
    pinMessages.length = 0;
    for (const value of [8, 0, 8, 0]) cpu.writeData(portDConfig.PORT, value);
    assert.deepEqual(values(voltageId), [5, 0, 5, 0], 'No GPIO edge may be coalesced');
    assert.deepEqual(values(resistanceId), [], 'GPIO level edges must not resend unchanged resistance');
    port.timerOverridePin(3, PinOverrideMode.Enable);
    pinMessages.length = 0;
    for (const mode of [PinOverrideMode.Set, PinOverrideMode.Clear, PinOverrideMode.Set]) port.timerOverridePin(3, mode);
    assert.deepEqual(values(voltageId), [5, 0, 5], 'Timer/PWM edges must retain order and voltage');
    assert.deepEqual(values(resistanceId), [], 'PWM must not resend unchanged resistance');
    port.timerOverridePin(3, PinOverrideMode.None);
    pinMessages.length = 0;
    cpu.writeData(portDConfig.DDR, 0);
    cpu.writeData(portDConfig.PORT, 8);
    cpu.writeData(portDConfig.DDR, 8);
    assert.deepEqual(values(resistanceId), [1e8, 40000, 40], 'Input, pull-up and output mode transitions retain their electrical resistance');

    const result = { type: 'RESULT', nodeIndices: [], nodeVoltages: new Float64Array(), converged: true, timestamp: 0.01, timeStep: 0.005, stepsThisFrame: 1, fidelityMode: 'adaptive' };
    pinMessages.length = 0;
    useCanvasStore.getState().updateRuntimeNode(avrBoard.id, { properties: { usbConnected: 'No' } });
    avr.handleSolverResult(result, []);
    assert.equal(useCanvasStore.getState().nodesById.get(avrBoard.id).properties.boardPowered, false);
    assert.equal(values(resistanceId).at(-1), 1e8, 'Power loss disconnects even an unchanged OUTPUT mode');
    useCanvasStore.getState().updateRuntimeNode(avrBoard.id, { properties: { usbConnected: 'Yes' } });
    avr.handleSolverResult(result, []);
    assert.equal(values(resistanceId).at(-1), 40, 'Power recovery reconnects the unchanged OUTPUT mode');

    pinMessages.length = 0;
    avr.refreshMnaElements(useCanvasStore.getState().nodes, []);
    assert.equal(avr.mnaCircuit.elements.find(element => element.id === resistanceId)?.value, 40, 'Netlist refresh retains the current mode');
    avr.stopMNASolver(true);
    avr.startMNASolver(useCanvasStore.getState().nodes, []);
    const init = pinMessages.findLast(message => message.type === 'INIT');
    assert.equal(init.elements.find(element => element.id === resistanceId)?.value, 40, 'A replacement worker receives the existing mode in INIT');
    avr.stop();
    await startAvr();
    pinMessages.length = 0;
    avr.avrCpu.writeData(portDConfig.DDR, 8);
    assert.deepEqual(values(resistanceId), [40], 'A fresh simulation reinitializes the output resistance');
  } finally {
    avr.stop();
    assert(workers.every(worker => worker.terminated), 'All test worker generations must be disposed');
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedWorker === undefined) delete globalThis.Worker; else globalThis.Worker = savedWorker;
    useCanvasStore.getState().clearCanvas();
  }
  console.log('runtime delta contract: AVR GPIO/PWM voltage ordering, mode resistance, power loss/recovery, netlist refresh, worker replacement and restart passed');
} finally {
  await vite.close();
}
