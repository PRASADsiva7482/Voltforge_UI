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
  const regression = await vite.ssrLoadModule('/src/features/simulator/regression/mnaIncrementalRegression.ts');
  regression.assertIncrementalMnaContract();
  console.log('incremental MNA contract: topology, patch, history, and lifecycle assertions passed');
} finally {
  await vite.close();
}
