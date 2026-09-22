import { strict as assert } from 'node:assert';
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
  const coverage = await vite.ssrLoadModule('/src/features/ai/aiHardwareCoverage.ts');
  assert.equal(coverage.aiCoverageStatusLabel('verified'), 'AI verified');
  assert.equal(coverage.aiCoverageStatusLabel('variant-required'), 'Variant required');
  assert.equal(coverage.aiCoverageStatusLabel('unsupported'), 'Not curated');
  assert.equal(coverage.aiCoverageStatusClass('variant-required'), 'is-variant-required');
  assert.equal(coverage.aiComponentCoverageStatusLabel('verified'), 'AI exact');
  assert.equal(coverage.aiComponentCoverageStatusLabel('variant-required'), 'Variant required');
  assert.equal(coverage.aiComponentCoverageStatusLabel('simulation-only'), 'Simulation model');
  assert.equal(coverage.aiComponentCoverageStatusLabel('unsupported'), 'Not curated');
  assert.equal(coverage.aiComponentCoverageStatusClass('simulation-only'), 'is-simulation-only');
  console.log('AI hardware coverage presentation contract passed');
} finally {
  await vite.close();
}
