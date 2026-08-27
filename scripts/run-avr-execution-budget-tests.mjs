import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  root,
  server: { middlewareMode: true },
});

try {
  const regression = await vite.ssrLoadModule('/src/features/simulator/regression/avrExecutionBudgetRegression.ts');
  await regression.assertAvrExecutionBudgetContract();
  console.log('AVR execution budget contract: deadline, ordering, lifecycle, browser timing, telemetry, and fidelity assertions passed');
} finally {
  await vite.close();
}
