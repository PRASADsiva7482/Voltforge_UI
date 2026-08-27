import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

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
} finally {
  await vite.close();
}
