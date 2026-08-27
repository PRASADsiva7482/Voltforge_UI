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
  console.log('model revision contract: runtime isolation and targeted topology assertions passed');
} finally {
  await vite.close();
}
