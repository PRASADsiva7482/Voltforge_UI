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
  const regression = await vite.ssrLoadModule('/src/features/simulator/regression/scopeCaptureRegression.ts');
  regression.assertScopeCaptureContract();
  console.log('scope capture contract: cadence, rings, publication, pause/step, and protocol assertions passed');
} finally {
  await vite.close();
}
