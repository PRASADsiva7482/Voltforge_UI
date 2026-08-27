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
  const regression = await vite.ssrLoadModule('/src/store/modelRevisionRegression.ts');
  regression.assertModelRevisionIsolationContract();

  const { hydrateCanvasNode } = await vite.ssrLoadModule('/src/features/canvas/componentFactory.ts');
  const importedBlueLed = hydrateCanvasNode({
    id: 'imported-blue-led',
    type: 'LED_STANDARD',
    x: 0,
    y: 0,
    properties: { color: '#0000ff', forwardVoltage: 3.2 },
  });
  if (importedBlueLed.properties.ledColor !== '#0000ff') {
    throw new Error('standard LED hydration must preserve an explicit imported colour over the catalog default');
  }

  console.log('model revision contract: runtime isolation, targeted topology, and LED colour hydration assertions passed');
} finally {
  await vite.close();
}
