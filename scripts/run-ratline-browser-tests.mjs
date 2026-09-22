import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3109'
const phase = process.argv.includes('--before') ? 'before' : 'after', samples = [], checks = [], errors = []
const output = path.join(root, 'docs/reports')
const server = await createServer({ root, server: { host: 'localhost', port: 3109, strictPort: true }, plugins: [{ name: 'ratline-browser-fixture', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.headers.accept?.includes('text/html')) return next()
    res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><title>Ratline scalability</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/ratline-entry.tsx"></script></body></html>'))
  })
} }] })
const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), values } }
const check = async (name, action) => { try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (e) { checks.push({ name, passed: false, error: e.stack }); console.error('FAIL ' + name + ': ' + e.message) } }
let browser, failure
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  await context.addInitScript(() => {
    window.__ratlineAudit = {}
    // Register before Konva's capture-phase drag-end handler draws the layer.
    window.addEventListener('mouseup', () => { const a = window.__ratlineAudit; if (a.trackRelease) a.releaseStarted = performance.now() }, true)
  })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin, { waitUntil: 'networkidle' })
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  for (const pads of [32, 64, 128, 512]) {
    await page.evaluate(pads => window.__ratlineAudit.load(pads), pads)
    await page.waitForFunction(pads => window.__ratlineAudit.pcb.getState().ratlines.length === pads - 1, pads); await paint()
    await page.evaluate(() => { window.__ratlineAudit.computeTimes = [] })
    for (let i = 0; i < 5; i++) {
      await page.evaluate(i => { const a = window.__ratlineAudit; a.pcb.getState().updateFootprintPosition('fp_n0-0', 13 + i, 12) }, i); await paint()
    }
    const times = await page.evaluate(() => window.__ratlineAudit.computeTimes.map(s => s.ms))
    samples.push({ name: 'connected footprint movement', pads, computeMs: stats(times) }); console.log(JSON.stringify({ pads, computeMs: stats(times) }))
  }
  await page.evaluate(() => window.__ratlineAudit.load(512)); await paint()
  const box = await page.locator('.konvajs-content').boundingBox()
  await page.evaluate(() => {
    const a = window.__ratlineAudit; a.moves = []; a.lastMove = 0; a.computeTimes = []; a.publications = 0; a.releases = []; a.ratlineReleaseDraws = []; a.trackRelease = true
    const layer = a.Konva.stages[0].getLayers().at(-1)
    document.addEventListener('mousemove', e => { if (e.buttons === 1) a.lastMove = performance.now() }, true)
    layer.on('draw.ratline-audit', () => {
      if (a.lastMove) { a.moves.push(performance.now() - a.lastMove); a.lastMove = 0 }
      if (a.releaseStarted) a.releases.push(performance.now() - a.releaseStarted)
    })
    a.Konva.stages[0].getLayers()[1].on('draw.ratline-audit', () => {
      if (a.releaseStarted && a.publications) a.ratlineReleaseDraws.push(performance.now() - a.releaseStarted)
    })
    a.unsubscribe = a.pcb.subscribe((s, old) => { if (s.footprints !== old.footprints) a.publications++ })
  })
  const x = box.x + 40 + 12 * 4, y = box.y + 40 + 12 * 4 - 2
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 5, y + 3)
  const started = Date.now(); let step = 0, lastProgress = started
  while (Date.now() - started < 60000) {
    await page.mouse.move(x + 10 + (step % 30), y + 5 + (step % 20)); await paint(); step++
    if (Date.now() - lastProgress >= 20000) { console.log('PCB pointer window: ' + Math.round((Date.now() - started) / 1000) + ' seconds'); lastProgress = Date.now() }
  }
  const during = await page.evaluate(() => ({ computations: window.__ratlineAudit.computeTimes.length, publications: window.__ratlineAudit.publications }))
  await page.mouse.up(); await paint(); await page.waitForFunction(() => window.__ratlineAudit.ratlineReleaseDraws.length > 0)
  const drag = await page.evaluate(() => { const a = window.__ratlineAudit; a.unsubscribe(); a.trackRelease = false; return { moves: a.moves, releases: a.releases, ratlineReleaseDraws: a.ratlineReleaseDraws, computeTimes: a.computeTimes, viewport: a.pcb.getState().viewport, fp: a.pcb.getState().footprints[0], publications: a.publications } })
  const movement = { name: '60-second actual PCB mouse drag', pads: 512, elapsedMs: Date.now() - started, during, drawMs: stats(drag.moves), releaseDrawMs: drag.releases, releaseRatlineDrawMs: drag.ratlineReleaseDraws, releaseComputeMs: drag.computeTimes, viewport: drag.viewport, footprint: drag.fp, publications: drag.publications }
  samples.push(movement); console.log(JSON.stringify({ name: movement.name, frames: movement.drawMs.count, p95DrawMs: movement.drawMs.p95, releaseDrawMs: movement.releaseDrawMs, during }))
  await check('Actual mouse drag preserves the viewport and commits only final placed coordinates', () => {
    assert.deepEqual(drag.viewport, { x: 0, y: 0, scale: 1 }); assert.notEqual(drag.fp.x, 12)
    assert.equal(during.computations, 0); assert.equal(during.publications, 0); assert.equal(drag.publications, 1)
  })
  if (phase === 'after') {
    await check('512-pad drag event to footprint-layer draw p95 stays within 50 ms', () => { assert(movement.drawMs.count >= 100); assert(movement.drawMs.p95 <= 50) })
    await check('32/64/128/512 connected movement ratline calculations stay within 50 ms', () => { for (const sample of samples.filter(s => s.computeMs)) { assert.equal(sample.computeMs.count, 5); assert(sample.computeMs.max <= 50) } })
    await check('Moving one net on a mixed board reuses other net trees', async () => {
      await page.evaluate(() => window.__ratlineAudit.load(128, 4)); await paint()
      const result = await page.evaluate(async () => {
        const a = window.__ratlineAudit, before = a.pcb.getState().ratlines, hypot = Math.hypot; let distances = 0
        Math.hypot = (...args) => { distances++; return hypot(...args) }
        try { a.pcb.getState().updateFootprintPosition('fp_n0-0', 14, 12); await Promise.resolve() } finally { Math.hypot = hypot }
        return { distances, retained: a.pcb.getState().ratlines.filter(r => before.includes(r)).length }
      })
      assert.equal(result.distances, 128 * 127 / 2); assert.equal(result.retained, 3 * 127); samples.push({ name: 'mixed-net cache', ...result })
    })
    await check('Trace completion suppresses one ratline without rebuilding its MST; removal restores it', async () => {
      const result = await page.evaluate(async () => {
        const a = window.__ratlineAudit, before = a.pcb.getState().ratlines, edge = before[0], hypot = Math.hypot; let distances = 0
        Math.hypot = (...args) => { distances++; return hypot(...args) }
        try {
          a.pcb.getState().addTrace({ id: 'routed', netId: 'legacy-wire-label', layer: 'F.Cu', width_mm: .25, points: [edge.to, edge.from] }); await Promise.resolve()
          const after = a.pcb.getState().ratlines, hidden = !after.some(r => r.id === edge.id)
          a.pcb.getState().removeTrace('routed'); await Promise.resolve()
          return { distances, hidden, countBefore: before.length, countAfter: after.length, restored: a.pcb.getState().ratlines.some(r => r.id === edge.id) }
        } finally { Math.hypot = hypot }
      })
      assert.equal(result.distances, 0); assert(result.hidden && result.restored); assert.equal(result.countAfter, result.countBefore - 1)
    })
    await check('Reload, scene remount and same-ID document replacement discard stale net output', async () => {
      await page.evaluate(() => { const a = window.__ratlineAudit; a.saved = structuredClone(a.pcb.getState().getLayout()); a.setMounted(false) })
      await page.waitForFunction(() => !document.querySelector('.vf-pcb-canvas'))
      await page.evaluate(() => { const a = window.__ratlineAudit; a.load(32); a.setMounted(true) }); await paint()
      assert.equal(await page.evaluate(() => window.__ratlineAudit.pcb.getState().ratlines.length), 31)
      await page.evaluate(() => { const a = window.__ratlineAudit; a.canvas.getState().loadCanvas([], []); a.pcb.getState().resetPcb() }); await paint()
      assert.equal(await page.evaluate(() => window.__ratlineAudit.pcb.getState().ratlines.length), 0)
    })
  }
  await page.screenshot({ path: path.join(output, `vfopt-ui-026-ratline-browser-${phase}.png`) })
} catch (e) { failure = e; errors.push(e.stack) }
finally {
  fs.writeFileSync(path.join(output, `vfopt-ui-026-ratline-browser-${phase}.json`), JSON.stringify({ task: 'VFOPT-UI-026', phase, capturedAt: new Date().toISOString(), status: failure || errors.length || checks.some(c => !c.passed) ? 'failed' : 'passed', fixtureSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'scripts/fixtures/ratline-fixture.mjs'))).update(fs.readFileSync(path.join(root, 'scripts/fixtures/ratline-entry.tsx'))).digest('hex'), browser: browser?.version(), samples, checks, errors, conditions: ['Actual StrictMode PCB scene and installed headless Chrome, 1366x800 viewport; all external HTTP blocked.', '60-second mouse-move window measures event arrival to footprint-layer draw, not physical display scanout. Final-release draw and ratline computation are reported separately; rendering is not excluded from the draw measurement.', 'Five committed movements per net size in the browser; separate Node benchmark has five cold and twenty warm algorithm samples. No live account or whole-laptop CPU claim.'] }, null, 2) + '\n')
  await browser?.close(); await server.close()
}
if (failure) throw failure
assert(checks.every(c => c.passed) && errors.length === 0)
