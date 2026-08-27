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
  const regression = await vite.ssrLoadModule('/src/features/canvas/regression/canvasRenderBudgetRegression.ts');
  await regression.assertCanvasRenderBudgetContract();
  console.log('canvas render contract: culling, path, particle, isolation, and trace assertions passed');
} finally {
  await vite.close();
}
