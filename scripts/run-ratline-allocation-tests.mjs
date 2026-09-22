import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3110', samples = []
const reports = path.join(root, 'docs/reports'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const server = await createServer({ root, appType: 'custom', server: { host: 'localhost', port: 3110, strictPort: true }, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: 'allocation-fixture', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.headers.accept?.includes('text/html')) return next()
    res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><title>Ratline allocation diagnostic</title></head><body><script type="module">import { RatlineEngine } from "/src/features/pcb/RatlineEngine.ts"; import { LegacyRatlineEngine } from "/scripts/fixtures/legacyRatlineEngine.ts"; import { createRatlineFixture } from "/scripts/fixtures/ratline-fixture.mjs";window.audit={current:RatlineEngine,legacy:LegacyRatlineEngine,create:createRatlineFixture};</script></body></html>'))
  })
} }] })
let browser, failure
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext(); await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => window.audit)
  const client = await context.newCDPSession(page); await client.send('HeapProfiler.enable')
  for (const pads of [32, 64, 128, 512]) {
    await page.evaluate(pads => { const a = window.audit; a.fixture = a.create(pads) }, pads)
    for (const phase of ['before', 'after']) {
      const values = [], samplingInterval = pads <= 64 ? 128 : pads === 128 ? 1024 : 16384
      const run = () => page.evaluate(phase => {
        const a = window.audit, f = a.fixture, engine = phase === 'before' ? a.legacy : a.current
        a.output = engine.computeRatlines(f.nodes, f.wires, f.footprints, f.traces)
        return a.output.length
      }, phase)
      await run(); await run()
      for (let iteration = 0; iteration < 3; iteration++) {
        await page.evaluate(() => { window.audit.output = null }); await client.send('HeapProfiler.collectGarbage')
        await client.send('HeapProfiler.startSampling', { samplingInterval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
        assert.equal(await run(), pads - 1)
        const { profile } = await client.send('HeapProfiler.stopSampling')
        let total = 0, attributed = 0, attributedSamples = 0
        const ids = new Set()
        const visit = (node, engineStack = false) => {
          engineStack ||= /\/(?:legacy)?RatlineEngine\.ts/i.test(node.callFrame.url)
          total += node.selfSize
          if (engineStack) { attributed += node.selfSize; ids.add(node.id) }
          node.children.forEach(child => visit(child, engineStack))
        }
        visit(profile.head); attributedSamples = profile.samples.filter(s => ids.has(s.nodeId)).length
        const filename = `vfopt-ui-026-allocation-${phase}-${pads}-${iteration}.json`
        const artifact = { phase, pads, iteration, samplingInterval, totalEstimatedBytes: total, engineEstimatedBytes: attributed, totalSamples: profile.samples.length, engineSamples: attributedSamples, head: profile.head }
        fs.writeFileSync(path.join(reports, filename), JSON.stringify(artifact, null, 2) + '\n')
        values.push({ estimatedEngineAllocationBytes: attributed, engineSamples: attributedSamples, artifact: `docs/reports/${filename}`, sha256: sha(fs.readFileSync(path.join(reports, filename))) })
      }
      const sorted = values.map(v => v.estimatedEngineAllocationBytes).sort((a, b) => a - b)
      samples.push({ pads, phase, samplingInterval, medianEstimatedEngineAllocationBytes: sorted[1], values })
      console.log(JSON.stringify({ pads, phase, medianEstimatedEngineAllocationBytes: sorted[1] }))
    }
  }
} catch (error) { failure = error }
finally {
  fs.writeFileSync(path.join(reports, 'vfopt-ui-026-ratline-allocation.json'), JSON.stringify({ task: 'VFOPT-UI-026', capturedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed', error: failure?.stack, browser: browser?.version(), samples, fixtureSha256: sha(fs.readFileSync(path.join(root, 'scripts/fixtures/ratline-fixture.mjs'))), conditions: ['Separate Chrome CDP HeapProfiler sampling lane, three fresh-cache measurements per size/implementation after two warmups; includes allocations collected by minor and major GC.', 'Profile heads and sample counts retained; sampled byte totals are estimates, not exact allocation counts, retained heap or peak laptop RAM. Only allocations on engine call stacks are attributed; harness/fixture allocation is excluded.', 'Intervals vary by pad count to keep overhead bounded, with the same interval for each before/after pair. Profiler timings are deliberately excluded from latency measurements.', 'Before uses the preserved pre-change engine; current and legacy execute on the same fixture in the same browser process. No external HTTP or backend work.'] }, null, 2) + '\n')
  await browser?.close(); await server.close()
}
if (failure) throw failure
