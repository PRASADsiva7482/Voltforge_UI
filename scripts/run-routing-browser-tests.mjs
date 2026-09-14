import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3105'
const phase = process.argv.includes('--before') ? 'before' : 'after'
const output = path.join(root, 'docs/reports'), checks = [], samples = [], errors = []
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
let browser
const server = await createServer({ root, server: { host: 'localhost', port: 3105, strictPort: true }, plugins: [{
  name: 'routing-fixture',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.headers.accept?.includes('text/html')) return next()
      const html = await vite.transformIndexHtml(request.url, '<!doctype html><html><head><title>Routing audit</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/routing-entry.tsx"></script></body></html>')
      response.setHeader('Content-Type', 'text/html'); response.end(html)
    })
  },
}] })
async function check(name, action) { try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (error) { checks.push({ name, passed: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message) } }
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  await context.addInitScript(() => { window.__routingAudit = { longTasks: [], workers: 0 }; new PerformanceObserver(list => window.__routingAudit.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true }) })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('worker', () => page.evaluate(() => window.__routingAudit.workers++).catch(() => {}))
  page.setDefaultTimeout(20000)
  await page.goto(origin, { waitUntil: 'networkidle' })
  for (let i=0;i<5;i++) {
    await page.evaluate(() => window.__routingAudit.store.getState().resetCanvas())
    await page.waitForTimeout(120)
    const sample = await page.evaluate(async () => {
      const a = window.__routingAudit, start = performance.now()
      a.load()
      const loadMs = a.lastLoadMs, statusOnReturn = a.store.getState().routingStatus
      await new Promise(resolve => setTimeout(resolve, 0))
      const firstYieldMs = performance.now() - start
      return { loadMs, firstYieldMs, statusOnReturn, start, nodeCount: a.store.getState().nodes.length, modelRevision: a.store.getState().modelRevision, localDocumentRevision: a.store.getState().localDocumentRevision }
    })
    if (phase === 'after') await page.waitForFunction(() => window.__routingAudit.store.getState().routingStatus?.phase === 'ready')
    if (phase === 'after') {
      sample.modelRevisionAfterRouting = await page.evaluate(() => window.__routingAudit.store.getState().modelRevision)
      sample.localDocumentRevisionAfterRouting = await page.evaluate(() => window.__routingAudit.store.getState().localDocumentRevision)
    }
    await page.getByRole('button', { name: /^Interaction probe/ }).click()
    await page.waitForTimeout(100)
    sample.longTasks = await page.evaluate(start => window.__routingAudit.longTasks.filter(entry => entry.start >= start), sample.start)
    samples.push(sample); console.log('Load ' + JSON.stringify(sample))
  }
  if (phase === 'after') {
    await check('Five legacy loads hydrate below 50 ms and route in a real worker', async () => {
      assert(samples.every(sample => sample.loadMs < 50 && sample.statusOnReturn.phase === 'routing' && sample.nodeCount === 100))
      assert(await page.evaluate(() => window.__routingAudit.workers >= 5))
    })
    await check('Worker routes exactly match the existing router with no dirty/model rebuild on completion', async () => {
      const result = await page.evaluate(() => {
        const a = window.__routingAudit, state = a.store.getState()
        return { actual: state.wires.map(wire => wire.bendPoints), expected: state.wires.map(wire => a.route(wire, state.documentNodes)), localRevision: state.localDocumentRevision }
      })
      assert.deepEqual(result.actual, result.expected); assert.equal(result.localRevision, 0)
      assert(samples.every(sample => sample.modelRevision === sample.modelRevisionAfterRouting && sample.localDocumentRevision === sample.localDocumentRevisionAfterRouting))
    })
    await check('Unchanged versioned saved routes are reused without launching a worker', async () => {
      const result = await page.evaluate(() => {
        const a = window.__routingAudit, state = a.store.getState()
        a.saved = JSON.parse(JSON.stringify({ nodes: state.documentNodes, wires: state.wires, viewport: state.viewport, routeCache: state.routeCache }))
        const workerCount = a.workers; a.load(a.saved)
        return { workersBefore: workerCount, workersAfter: a.workers, loadMs: a.lastLoadMs, status: a.store.getState().routingStatus,
          cacheBytes: new TextEncoder().encode(JSON.stringify(a.saved.routeCache)).length,
          savedLayoutBytes: new TextEncoder().encode(JSON.stringify(a.saved)).length }
      })
      assert.equal(result.workersAfter, result.workersBefore); assert.equal(result.status.phase, 'ready'); assert.equal(result.status.reused, 99); assert(result.loadMs < 50)
      samples.push({ name: 'cached reload', ...result })
    })
    await check('Changing geometry invalidates saved cache and recomputes the routes', async () => {
      await page.evaluate(() => { const a = window.__routingAudit, changed = structuredClone(a.saved); changed.nodes[4].x += 30; a.load(changed) })
      assert.equal(await page.evaluate(() => window.__routingAudit.store.getState().routingStatus.phase), 'routing')
      await page.waitForFunction(() => window.__routingAudit.store.getState().routingStatus.phase === 'ready')
    })
    await check('A replacement document cannot be overwritten by the preceding worker', async () => {
      await page.evaluate(() => { const a = window.__routingAudit; a.load(); a.store.getState().loadCanvas([], [], { x: 5, y: 8, scale: 1 }) })
      await page.waitForTimeout(400)
      assert.equal(await page.evaluate(() => window.__routingAudit.store.getState().nodes.length), 0)
      assert.equal(await page.evaluate(() => window.__routingAudit.store.getState().wires.length), 0)
    })
    await check('Local edits during routing survive and use current geometry', async () => {
      await page.evaluate(() => { const a = window.__routingAudit; a.load(); a.store.getState().updateNode('r-0', { x: 777 }); a.store.getState().setViewport({ x: 43, y: 54, scale: 1 }) })
      await page.waitForFunction(() => window.__routingAudit.store.getState().routingStatus.phase === 'ready')
      assert.equal(await page.evaluate(() => window.__routingAudit.store.getState().nodes[0].x), 777)
      assert.equal(await page.evaluate(() => window.__routingAudit.store.getState().viewport.x), 43)
    })
    await check('Explicit cancellation stops routing without publishing late results', async () => {
      await page.evaluate(() => { const a = window.__routingAudit; a.load(); a.store.getState().cancelCanvasRouting(); a.cancelledWires = a.store.getState().wires })
      await page.waitForTimeout(400)
      assert.equal(await page.evaluate(() => { const a = window.__routingAudit; return a.cancelledWires === a.store.getState().wires }), true)
    })
    await check('Worker startup failure leaves a usable canvas and Retry starts routing again', async () => {
      await page.evaluate(() => { const a = window.__routingAudit; a.Worker = window.Worker; window.Worker = class { constructor() { throw new Error('fixture worker unavailable') } }; a.load() })
      await page.getByRole('button', { name: 'Retry wire layout' }).waitFor()
      assert.equal(await page.evaluate(() => window.__routingAudit.store.getState().nodes.length), 100)
      await page.getByRole('button', { name: /^Interaction probe/ }).click()
      await page.evaluate(() => { window.Worker = window.__routingAudit.Worker })
      await page.getByRole('button', { name: 'Retry wire layout' }).click()
      await page.waitForFunction(() => window.__routingAudit.store.getState().routingStatus.phase === 'ready')
    })
  }
  await page.screenshot({ path: path.join(output, `vfopt-ui-016-routing-${phase}.png`) })
} finally {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, `vfopt-ui-016-routing-${phase}.json`), JSON.stringify({ task: 'VFOPT-UI-016', phase, capturedAt: new Date().toISOString(), status: checks.some(check => !check.passed) || errors.length ? 'failed' : 'passed', fixtureSha256: sha(path.join(root, 'scripts/fixtures/routing-entry.tsx')), fixture: '100 hydrated resistor nodes and 99 auto wires on a 10x10 grid; actual canvas; no backend', browser: browser?.version(), samples, checks, errors, limitations: ['loadMs measures synchronous hydration/caching/dispatch only; firstYieldMs and long tasks also include React/canvas work.', 'Browser fixture measurements do not establish total laptop CPU, all circuit sizes or live account correctness.'] }, null, 2) + '\n')
  await browser?.close(); await server.close()
}
assert(checks.every(check => check.passed) && errors.length === 0, 'Routing browser checks failed')
