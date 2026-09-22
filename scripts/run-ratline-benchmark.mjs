import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { createRatlineFixture } from './fixtures/ratline-fixture.mjs'

if (!global.gc) throw new Error('Run node --expose-gc scripts/run-ratline-benchmark.mjs')
const root = fileURLToPath(new URL('..', import.meta.url)), phase = process.argv.includes('--before') ? 'before' : 'after'
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const samples = [], sha = value => crypto.createHash('sha256').update(value).digest('hex')
const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), values } }
let failure
try {
  const { RatlineEngine } = await server.ssrLoadModule('/src/features/pcb/RatlineEngine.ts')
  for (const pads of [32, 64, 128, 512]) {
    const fixture = createRatlineFixture(pads), args = [fixture.nodes, fixture.wires, fixture.footprints, fixture.traces]
    let output, cold = [], warm = []
    // Fresh engine/cache for every call. This measures the algorithm, not cache hits.
    for (let i = 0; i < 5; i++) { global.gc(); const start = performance.now(); output = RatlineEngine.computeRatlines(...args); cold.push(performance.now() - start) }
    for (let i = 0; i < 20; i++) { const start = performance.now(); output = RatlineEngine.computeRatlines(...args); warm.push(performance.now() - start) }
    assert.equal(output.length, pads - 1)
    const outputSha256 = sha(JSON.stringify(output))
    const allocation = [], retained = []
    for (let i = 0; i < 5; i++) {
      output = undefined; global.gc(); const before = process.memoryUsage().heapUsed
      output = RatlineEngine.computeRatlines(...args); allocation.push(process.memoryUsage().heapUsed - before)
      global.gc(); retained.push(process.memoryUsage().heapUsed - before)
    }
    const hypot = Math.hypot; let distanceEvaluations = 0
    Math.hypot = (...args) => { distanceEvaluations++; return hypot(...args) }
    try { RatlineEngine.computeRatlines(...args) } finally { Math.hypot = hypot }
    const result = { pads, fixtureSha256: sha(JSON.stringify(fixture)), outputSha256, coldMs: stats(cold), warmMs: stats(warm), heapDeltaBytes: stats(allocation), retainedOutputHeapDeltaBytes: stats(retained), distanceEvaluations }
    samples.push(result); console.log(JSON.stringify({ pads, coldMedianMs: result.coldMs.median, warmMedianMs: result.warmMs.median, distanceEvaluations, heapDeltaMedian: result.heapDeltaBytes.median }))
  }
  if (phase === 'after') {
    const before = JSON.parse(fs.readFileSync(new URL('../docs/reports/vfopt-ui-026-ratline-before.json', import.meta.url)))
    samples.forEach((s, i) => { assert.equal(s.fixtureSha256, before.samples[i].fixtureSha256); assert.equal(s.outputSha256, before.samples[i].outputSha256); assert.equal(s.distanceEvaluations, s.pads * (s.pads - 1) / 2) })
  }
} catch (error) { failure = error }
finally {
  await server.close()
  fs.writeFileSync(new URL(`../docs/reports/vfopt-ui-026-ratline-${phase}.json`, import.meta.url), JSON.stringify({ task: 'VFOPT-UI-026', phase, capturedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed', error: failure?.stack, node: process.version, machine: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model, logicalProcessors: os.cpus().length }, samples, conditions: ['Same deterministic saved pad geometry and wire order; five GC-separated fresh-cache calls and twenty warm-JIT fresh-cache calls per size. Cold means cache/GC condition, not a fresh operating-system process.', 'Heap deltas are five diagnostics with forced GC before each call. Immediate heap delta includes temporary allocations and can be affected by automatic GC; post-GC delta estimates retained output. Neither is total allocated bytes or peak whole-process memory.', 'Distance calls are counted in a separate instrumented run, outside timing. No simulation, backend work or UI rendering. Host power and concurrent load are not controlled.'] }, null, 2) + '\n')
}
if (failure) throw failure
