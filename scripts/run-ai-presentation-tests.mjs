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
  const presentation = await vite.ssrLoadModule('/src/features/ai/aiPresentation.ts');
  const {
    classifyAiStart,
    classifyAiTerminal,
    collectAiSources,
    describeAiRun,
    safeAiErrorMessage,
  } = presentation;

  assert.equal(classifyAiStart('neural-quality-gated'), 'streaming');
  assert.equal(classifyAiStart('deterministic-fallback'), 'checking');
  assert.equal(classifyAiStart('unavailable'), 'offline');
  assert.equal(classifyAiTerminal('complete', undefined, 0), 'complete');
  assert.equal(classifyAiTerminal('error', 'REQUEST_CANCELLED', 0), 'cancelled');
  assert.equal(classifyAiTerminal('error', 'REQUEST_TIMEOUT', 17), 'partial');
  assert.equal(classifyAiTerminal('error', 'AI_GATEWAY_UNAVAILABLE', 0), 'offline');
  assert.equal(classifyAiTerminal('error', 'UNKNOWN', 0), 'error');

  const fallback = describeAiRun('checking', { mode: 'deterministic-fallback' });
  assert.equal(fallback.label, 'Running engineering checks');
  assert.match(fallback.detail, /Deterministic VoltForge engineering tools/);
  assert.equal(describeAiRun('checking', { artifact: { artifactVersion: '1', ready: false, runtimeState: 'warming' } }).label, 'Warming local AI');
  assert.equal(describeAiRun('offline').label, 'Local AI unavailable');
  assert.equal(describeAiRun('partial').label, 'Partial response');
  assert.match(describeAiRun('cancelled').detail, /No project changes/);

  const safeError = safeAiErrorMessage('INTERNAL_UPSTREAM_SECRET');
  assert.match(safeError, /temporarily unavailable/);
  assert.doesNotMatch(safeError, /INTERNAL_UPSTREAM_SECRET/);

  const metadata = {
    artifact: { artifactVersion: '1.0.0', ready: true, runtimeState: 'ready' },
    engineeringAuthority: { criticalModelOverrideAllowed: false, policyId: 'vfai', status: 'pass' },
    internetRetrieval: {
      arbitraryUrlFetchAllowed: false,
      blockedResultCount: 0,
      cacheHit: false,
      degraded: false,
      generationDependency: false,
      networkAccessed: true,
      networkAttempted: true,
      policyId: 'retrieval-v1',
      providerDomain: 'example.invalid',
      providerId: 'local-gateway',
      rawProjectContextSent: false,
      rawProviderPayloadStored: false,
      rawQueryStored: false,
      reasonCode: 'explicit_request',
      returnedCount: 2,
      status: 'complete',
      trainingUseAllowed: false,
      trigger: 'explicit-request',
      untrustedContent: true,
    },
    localRetrieval: {
      degraded: false,
      embeddingsUsed: false,
      indexId: 'electronics-v1',
      indexVersion: '1',
      networkAccessed: false,
      policyId: 'local-v1',
      rawQueryStored: false,
      reasonCode: 'selected',
      returnedCount: 3,
      sourceId: 'docs',
      sourceRevision: 'r1',
      status: 'complete',
    },
    mode: 'neural-quality-gated',
    model: 'voltforge-local-engine-v1',
    projectRevision: 'project-revision-7',
  };
  const sourceBadges = collectAiSources(metadata);
  assert.deepEqual(sourceBadges.map((source) => source.kind), [
    'local-model',
    'project-context',
    'local-docs',
    'internet-evidence',
  ]);
  assert.ok(sourceBadges.every((source) => !/third-party|external model|openai|anthropic/i.test(`${source.label} ${source.detail}`)));

  const deduped = collectAiSources({ fallbackUsed: true, mode: 'deterministic-fallback' });
  assert.equal(deduped.filter((source) => source.kind === 'deterministic-tools').length, 1);

  console.log('AI presentation contract: run states, safe errors, source attribution, and deduplication assertions passed');
} finally {
  await vite.close();
}
