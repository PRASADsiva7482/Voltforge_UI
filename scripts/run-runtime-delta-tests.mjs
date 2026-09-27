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
} finally {
  await vite.close();
}
