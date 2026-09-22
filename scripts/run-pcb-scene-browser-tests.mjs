import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { build, createServer, preview } from 'vite'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3111', phase = process.argv.includes('--before') ? 'before' : 'after'
const reports = path.join(root, 'docs/reports'), samples = [], checks = [], errors = [], profile = process.argv.includes('--profile'), production = process.argv.includes('--production')
const suffix = production ? '-production' : ''
const stats = values => { const v = [...values].sort((a, b) => a - b); return { count: v.length, median: v[Math.floor(v.length / 2)], p95: v[Math.ceil(v.length * .95) - 1], max: v.at(-1), values } }
const plugin = { name: 'pcb-scene-fixture', enforce: 'pre', transform(source, id) {
  if (production && phase === 'before') {
    const relative = path.relative(root, id).replaceAll('\\', '/')
    if (['src/features/pcb/PcbCanvas.tsx', 'src/features/pcb/PcbFootprintRenderer.tsx'].includes(relative)) {
      source = fs.readFileSync(path.join(root, '..', '.voltforge-logs/vfopt-ui-027-before', 'Voltforge_UI__' + relative.replaceAll('/', '__')), 'utf8')
    }
  }
  if (id.replaceAll('\\', '/').endsWith('/PcbCanvas.tsx')) {
    return "import { useLayoutEffect as useAuditLayoutEffect } from 'react';\n" + source.replace('  return (\n    <div className="vf-pcb-canvas">', '  useAuditLayoutEffect(() => { const a = globalThis.__pcbSceneAudit; if (a?.inputStarted) a.sceneCommitInput = a.inputStarted; });\n  return (\n    <div className="vf-pcb-canvas">')
  }
  if (!id.replaceAll('\\', '/').endsWith('/PcbFootprintRenderer.tsx')) return source
  return source.replace('}: Props) {', '}: Props) { if (globalThis.__pcbSceneAudit) { const a = globalThis.__pcbSceneAudit; a.renders[footprint.id] = (a.renders[footprint.id] || 0) + 1; }')
}, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
  if (!req.headers.accept?.includes('text/html')) return next()
  res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><title>PCB scene</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/pcb-scene-entry.tsx"></script></body></html>'))
}) } }
let server
if (production) {
  const directory = path.join(root, 'node_modules/.cache/vfopt-ui-027-scene'), html = path.join(directory, 'index.html'), outDir = path.join(directory, 'dist')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(html, '<!doctype html><html><head><title>PCB scene</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/pcb-scene-entry.tsx"></script></body></html>')
  await build({ root, configFile: false, logLevel: 'error', plugins: [plugin], build: { outDir, emptyOutDir: true, rollupOptions: { input: html } } })
  const files = fs.readdirSync(outDir, { recursive: true }).filter(f => f.endsWith('index.html'))
  assert.equal(files.length, 1); fs.copyFileSync(path.join(outDir, files[0]), path.join(outDir, 'index.html'))
  const p = await preview({ root, configFile: false, build: { outDir }, preview: { host: 'localhost', port: 3111, strictPort: true } })
  server = { listen: async () => {}, close: () => new Promise((resolve, reject) => p.httpServer.close(e => e ? reject(e) : resolve())) }
} else server = await createServer({ root, server: { host: 'localhost', port: 3111, strictPort: true }, plugins: [plugin] })
const check = async (name, fn) => { try { await fn(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (e) { checks.push({ name, passed: false, error: e.stack }); console.error('FAIL ' + name + ': ' + e.message) } }
let browser, failure
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  await context.addInitScript(() => {
    const a = window.__pcbSceneAudit = { renders: {}, commits: [], releases: [] }
    window.addEventListener('mouseup', () => { if (a.measureRelease) a.releaseStarted = performance.now() }, true)
  })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin, { waitUntil: 'networkidle' })
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const load = async mode => { await page.evaluate(mode => window.__pcbSceneAudit.load(mode), mode); await paint(); await page.waitForFunction(() => window.__pcbSceneAudit.pcb.getState().footprints.length === window.__pcbSceneAudit.fixture.footprints.length) }
  await paint()
  await page.evaluate(() => {
    const a = window.__pcbSceneAudit; a.Konva.stages[0].getLayers()[1].on('draw.scene-audit', () => {
      if (a.releaseStarted) { a.releases.push(performance.now() - a.releaseStarted); a.releaseStarted = 0 }
    })
    const draw = a.Konva.Layer.prototype.draw
    a.Konva.Layer.prototype.draw = function (...args) { const start = performance.now(), release = !!a.releaseStarted; const result = draw.apply(this, args); if (release) a.drawTimings.push({ layer: this.index, ms: performance.now() - start }); return result }
  })
  const release = async () => {
    const box = await page.locator('.konvajs-content').boundingBox()
    const f = await page.evaluate(() => { const a = window.__pcbSceneAudit; a.renders = {}; a.commits = []; a.drawTimings = []; a.measureRelease = true; return a.pcb.getState().footprints[0] })
    const x = box.x + 40 + f.x * 4, y = box.y + 40 + f.y * 4 - 3, dx = f.x > 12 ? -8 : 8
    const count = await page.evaluate(() => window.__pcbSceneAudit.releases.length)
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y, { steps: 3 }); await page.mouse.up()
    await page.waitForFunction(count => window.__pcbSceneAudit.releases.length > count, count)
    return page.evaluate(() => { const a = window.__pcbSceneAudit; a.measureRelease = false; return { ms: a.releases.at(-1), renderedFootprints: Object.keys(a.renders).length, renderCalls: Object.values(a.renders).reduce((n, v) => n + v, 0), commitMs: a.commits, draws: a.drawTimings } })
  }
  const cold = [], warm = [], cdp = profile ? await context.newCDPSession(page) : null
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
  for (let i = 0; i < (profile ? 1 : production ? 20 : 5); i++) { await load('dense'); cold.push(await release()) }
  for (let i = 0; i < (profile ? 3 : production ? 40 : 20); i++) warm.push(await release())
  if (cdp) { fs.writeFileSync(path.join(reports, 'vfopt-ui-027-scene-diagnostic.cpuprofile'), JSON.stringify((await cdp.send('Profiler.stop')).profile)); console.log(await page.evaluate(() => window.__pcbSceneAudit.Konva.stages[0].find('.pcb-footprint').filter(n => n.isCached()).length)) }
  samples.push({ name: '512-pad actual mouse release', cold, warm, coldDrawMs: stats(cold.map(s => s.ms)), warmDrawMs: stats(warm.map(s => s.ms)) })
  console.log(JSON.stringify({ name: samples[0].name, coldP95: samples[0].coldDrawMs.p95, warmP95: samples[0].warmDrawMs.p95, changedFootprints: warm.map(s => s.renderedFootprints) }))
  await load('mixed')
  const mounted = () => page.evaluate(() => {
    const a = window.__pcbSceneAudit, stage = a.Konva.stages[0], last = stage.getLayers().at(-1), objects = stage.find(() => true)
    return { totalKonvaObjects: objects.length, footprints: last.getChildren().length, ratlines: stage.getLayers()[1].getChildren().length, copperObjects: stage.getLayers()[2].getChildren().length, storedFootprints: a.pcb.getState().footprints.length, storedTraces: a.pcb.getState().traces.length, storedVias: a.pcb.getState().vias.length }
  })
  const initial = await mounted(); samples.push({ name: '1024-footprint mixed board', ...initial }); console.log(JSON.stringify(samples.at(-1)))
  await page.screenshot({ path: path.join(reports, `vfopt-ui-027-scene-${phase}${suffix}.png`) })
  // Repeated actual wheel inputs keep a fixed anchor while cycling the zoom.
  const zoom = []
  if (cdp) await cdp.send('Profiler.start')
  await page.mouse.move(460, 350)
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => { window.__pcbSceneAudit.viewStarted = performance.now() })
    await page.mouse.wheel(0, i % 2 ? -100 : 100); await paint()
    zoom.push(await page.evaluate(() => performance.now() - window.__pcbSceneAudit.viewStarted))
  }
  samples.push({ name: 'wheel update through two animation frames', ms: stats(zoom) })
  if (cdp) fs.writeFileSync(path.join(reports, 'vfopt-ui-027-wheel-diagnostic.cpuprofile'), JSON.stringify((await cdp.send('Profiler.stop')).profile))
  await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().setViewport({ x: 0, y: -1050, scale: 1 })); await paint()
  const panned = await mounted(); samples.push({ name: 'panned mixed board', ...panned })
  if (phase === 'after') {
    await check('One footprint release retains unchanged render groups and stays below 50 ms p95', () => {
      assert(warm.every(s => s.renderedFootprints <= 2)); assert(samples[0].warmDrawMs.p95 <= 50); assert(samples[0].coldDrawMs.p95 <= 50)
    })
    await check('Mounted scene scales with visible area while the full saved layout remains intact', () => {
      assert(initial.footprints < 400 && initial.footprints > 100); assert(panned.footprints < 400 && panned.footprints > 100)
      assert(initial.ratlines < 400); assert(initial.copperObjects < 800); assert.equal(initial.storedFootprints, 1024); assert.equal(initial.storedTraces, 1025); assert.equal(initial.storedVias, 1024)
    })
    const view = async (x = 0, y = 0, scale = 1) => { await page.evaluate(v => window.__pcbSceneAudit.pcb.getState().setViewport(v), { x, y, scale }); await paint() }
    const clickPad = async id => {
      const box = await page.locator('.konvajs-content').boundingBox()
      const p = await page.evaluate(id => window.__pcbSceneAudit.Konva.stages[0].findOne(n => n.id() === id + ':p')?.getAbsolutePosition(), id)
      assert(p, 'Expected a mounted pad for ' + id); await page.mouse.click(box.x + p.x, box.y + p.y); await paint()
    }
    await check('Native Stage pan reveals new objects before release and writes the saved viewport only once', async () => {
      await load('mixed'); await view()
      const before = await page.evaluate(() => { const a = window.__pcbSceneAudit; return { revision: a.pcb.getState().localDocumentRevision, mounted: !!a.Konva.stages[0].findOne('#fp_n2-0') } })
      assert.equal(before.mounted, false)
      const box = await page.locator('.konvajs-content').boundingBox()
      await page.mouse.move(box.x + 1150, box.y + 650); await page.mouse.down(); await page.mouse.move(box.x + 1150, box.y + 150, { steps: 12 }); await paint()
      const during = await page.evaluate(() => { const a = window.__pcbSceneAudit; return { revision: a.pcb.getState().localDocumentRevision, y: a.Konva.stages[0].y(), mounted: !!a.Konva.stages[0].findOne('#fp_n2-0') } })
      assert.equal(during.revision, before.revision); assert.equal(during.y, -500); assert(during.mounted)
      await page.mouse.up(); await paint()
      const after = await page.evaluate(() => { const s = window.__pcbSceneAudit.pcb.getState(); return { revision: s.localDocumentRevision, y: s.viewport.y } })
      assert.equal(after.revision, before.revision + 1); assert.equal(after.y, -500)
    })
    await check('Selection and a trace crossing the entire viewport survive culling; hidden copper remains hidden', async () => {
      await view()
      assert(await page.evaluate(() => !!window.__pcbSceneAudit.Konva.stages[0].findOne('#crossing')))
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().selectFootprint('fp_n0-0')); await view(0, -3000)
      assert(await page.evaluate(() => !!window.__pcbSceneAudit.Konva.stages[0].findOne('#fp_n0-0')))
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().selectTrace('t0')); await paint()
      assert(await page.evaluate(() => !!window.__pcbSceneAudit.Konva.stages[0].findOne('#t0')))
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().toggleLayerVisibility('F.Cu')); await paint()
      assert.equal(await page.evaluate(() => !!window.__pcbSceneAudit.Konva.stages[0].findOne('#t0')), false)
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().toggleLayerVisibility('F.Cu')); await paint()
    })
    await check('Cached pad hit targets route between visible endpoints with the starting footprint offscreen', async () => {
      await load('dense'); await view()
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().updateFootprintPosition('fp_n0-1', 400, 12)); await paint()
      await clickPad('fp_n0-0')
      assert.equal(await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().activeRoute?.startPad?.componentId), 'n0-0')
      await view(-1400)
      assert(await page.evaluate(() => !!window.__pcbSceneAudit.Konva.stages[0].findOne('#fp_n0-0')))
      await clickPad('fp_n0-1')
      const trace = await page.evaluate(() => { const s = window.__pcbSceneAudit.pcb.getState(); return { routing: s.isRoutingTrace, trace: s.traces.at(-1) } })
      assert.equal(trace.routing, false); assert.deepEqual(trace.trace.points[0], { x: 12, y: 12.8 }); assert.deepEqual(trace.trace.points.at(-1), { x: 400, y: 12.8 })
    })
    await check('Copper and silkscreen visibility are independent, including cached pad hit testing', async () => {
      await load('dense'); await view()
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().toggleLayerVisibility('F.Silk')); await paint()
      assert(await page.evaluate(() => window.__pcbSceneAudit.Konva.stages[0].findOne(n => n.id() === 'fp_n0-0:p').isVisible()))
      await clickPad('fp_n0-64'); assert(await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().isRoutingTrace))
      await page.evaluate(() => { const s = window.__pcbSceneAudit.pcb.getState(); s.cancelRouting(); s.toggleLayerVisibility('F.Silk'); s.toggleLayerVisibility('F.Cu') }); await paint()
      assert.equal(await page.evaluate(() => window.__pcbSceneAudit.Konva.stages[0].findOne(n => n.id() === 'fp_n0-0:p').isVisible()), false)
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().toggleLayerVisibility('F.Cu')); await paint()
    })
    await check('Distant zoom reduces labels while keeping pads and the complete physical layout', async () => {
      const before = await page.evaluate(() => { const a = window.__pcbSceneAudit; return { text: a.Konva.stages[0].getLayers().at(-1).find('Text').length, layout: a.pcb.getState().getLayout() } })
      await view(0, 0, .5)
      const after = await page.evaluate(() => { const a = window.__pcbSceneAudit; return { text: a.Konva.stages[0].getLayers().at(-1).find('Text').length, pads: a.Konva.stages[0].find('.pcb-pad').length, layout: a.pcb.getState().getLayout() } })
      assert(before.text > 100); assert.equal(after.text, 0); assert.equal(after.pads, 512)
      for (const key of ['footprints', 'traces', 'vias']) assert.deepEqual(after.layout[key], before.layout[key])
      await clickPad('fp_n0-64'); assert(await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().isRoutingTrace))
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().cancelRouting())
      await view()
    })
    await check('Via dragging commits snapped coordinates without changing the viewport', async () => {
      await load('mixed'); await view()
      // Other footprints' reference text intentionally sits above copper; use
      // an unobstructed via to exercise its native hit target and drag handler.
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().updateViaPosition('v0', 260, 60)); await paint()
      const box = await page.locator('.konvajs-content').boundingBox()
      const before = await page.evaluate(() => { const a = window.__pcbSceneAudit, stage = a.Konva.stages[0], p = stage.findOne('#v0').getAbsolutePosition(), hit = stage.getIntersection(p); return { via: a.pcb.getState().vias[0], view: a.pcb.getState().viewport, p, hit: { type: hit?.getClassName(), parent: hit?.getParent()?.id(), draggable: stage.findOne('#v0').draggable() } } })
      await page.mouse.move(box.x + before.p.x, box.y + before.p.y); await page.mouse.down(); await page.mouse.move(box.x + before.p.x + 24, box.y + before.p.y + 16, { steps: 5 }); await page.mouse.up(); await paint()
      const after = await page.evaluate(() => { const s = window.__pcbSceneAudit.pcb.getState(); return { via: s.vias[0], view: s.viewport } })
      assert(Math.abs(after.via.x - (before.via.x + 6)) <= .635, JSON.stringify({ before, after })); assert(Math.abs(after.via.y - (before.via.y + 4)) <= .635); assert.deepEqual(after.view, before.view)
    })
    await check('Read-only mode prevents pad routing and late footprint/via drag writes', async () => {
      await view(); await page.evaluate(() => window.__pcbSceneAudit.setReadOnly(true)); await paint()
      const before = await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().getLayout())
      await clickPad('fp_n0-0')
      await page.evaluate(() => {
        const a = window.__pcbSceneAudit, stage = a.Konva.stages[0]
        for (const id of ['fp_n0-0', 'v0']) { const n = stage.findOne('#' + id); if (n.draggable()) throw new Error('Read-only node remains draggable'); n.x(n.x() + 80); n.fire('dragend', { target: n }, true) }
      }); await paint()
      assert.deepEqual(await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().getLayout()), before)
      assert.equal(await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().isRoutingTrace), false)
      await page.evaluate(() => window.__pcbSceneAudit.setReadOnly(false)); await paint()
    })
    await check('An active footprint or via stays mounted when a viewport change crosses its stored bounds', async () => {
      for (const kind of ['footprint', 'via']) {
        await load('mixed'); await view()
        if (kind === 'via') { await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().updateViaPosition('v0', 260, 60)); await paint() }
        const id = kind === 'footprint' ? 'fp_n0-0' : 'v0', box = await page.locator('.konvajs-content').boundingBox()
        const p = await page.evaluate(id => window.__pcbSceneAudit.Konva.stages[0].findOne('#' + id).getAbsolutePosition(), id)
        await page.mouse.move(box.x + p.x, box.y + p.y - (kind === 'footprint' ? 3 : 0)); await page.mouse.down()
        await page.mouse.move(box.x + p.x + 6, box.y + p.y - (kind === 'footprint' ? 3 : 0)); await paint(); await view(-3000)
        assert(await page.evaluate(id => !!window.__pcbSceneAudit.Konva.stages[0].findOne('#' + id), id))
        await page.mouse.up(); await paint()
      }
    })
    await check('Rotated cached pads use physical world coordinates, and renaming/selection refresh cached content', async () => {
      await load('dense'); await view()
      await page.evaluate(() => { const a = window.__pcbSceneAudit; a.pcb.getState().updateFootprintPosition('fp_n0-0', 260, 60, 90); a.canvas.getState().commitNodeUpdate('n0-0', { name: 'Renamed reference' }); a.pcb.getState().selectFootprint('fp_n0-0') }); await paint()
      assert(await page.evaluate(() => { const g = window.__pcbSceneAudit.Konva.stages[0].findOne('#fp_n0-0'); return g.isCached() && g.findOne('Text').text() === 'Renamed reference' && g.findOne('Rect').stroke() === '#38bdf8' }))
      await clickPad('fp_n0-0')
      const pad = await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().activeRoute?.startPad)
      assert(Math.abs(pad.x - 259.2) < 1e-9); assert.equal(pad.y, 60); assert.equal(pad.componentId, 'n0-0')
      await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().cancelRouting())
    })
    await check('Cache buffers stay bounded and release on scene detach; reload retains all offscreen manufacturing geometry', async () => {
      await load('mixed'); await view()
      const info = await page.evaluate(() => {
        const a = window.__pcbSceneAudit; a.oldGroups = a.Konva.stages[0].find(n => n.hasName('pcb-footprint') || n.hasName('pcb-trace')); a.savedLayout = structuredClone(a.pcb.getState().getLayout())
        let bytes = 0, cached = 0
        for (const n of a.oldGroups) if (n.isCached()) { cached++; const c = n._getCanvasCache(); bytes += [c.scene, c.hit, c.filter].reduce((sum, v) => sum + v.width * v.height * 4, 0) }
        return { bytes, cached, all: a.savedLayout.footprints.length }
      })
      samples.push({ name: 'mounted PCB raster buffers', ...info }); assert(info.cached > 0); assert(info.bytes <= 32 * 1024 * 1024); assert.equal(info.all, 1024)
      await page.evaluate(() => window.__pcbSceneAudit.setMounted(false)); await page.waitForFunction(() => !document.querySelector('.vf-pcb-canvas'))
      assert(await page.evaluate(() => window.__pcbSceneAudit.oldGroups.every(n => !n.isCached())))
      await page.evaluate(() => { const a = window.__pcbSceneAudit; a.pcb.getState().loadPcb(a.savedLayout); a.setMounted(true) }); await paint()
      assert(await page.evaluate(() => JSON.stringify(window.__pcbSceneAudit.pcb.getState().getLayout()) === JSON.stringify(window.__pcbSceneAudit.savedLayout)))
    })
    if (production && !profile) await check('60-second production pan, zoom and routing window meets the 50 ms stress draw budget', async () => {
      await load('mixed'); await view(0, -300)
      await page.evaluate(() => {
        const a = window.__pcbSceneAudit; a.interactions = { pan: [], wheel: [], routing: [] }; a.inputStarted = 0; a.sceneCommitInput = 0
        const input = e => { if (a.inputMode && (e.type === 'wheel' ? a.inputMode === 'wheel' : a.inputMode !== 'wheel')) { a.inputStarted = performance.now(); a.inputDraw = null } }
        window.addEventListener('mousemove', input, true); window.addEventListener('wheel', input, true)
        a.stopInput = () => { window.removeEventListener('mousemove', input, true); window.removeEventListener('wheel', input, true) }
        for (const layer of a.Konva.stages[0].getLayers()) layer.on('draw.scene-input', () => {
          if (a.inputStarted && layer.index === (a.inputMode === 'routing' ? 2 : 3)) {
            // Include the native Stage draw and any subsequent reconciliation
            // draw for the same input. Overscan covers ordinary small pan steps.
            a.inputDraw = performance.now() - a.inputStarted
          }
        })
      })
      const box = await page.locator('.konvajs-content').boundingBox(), durations = {}
      for (const mode of ['pan', 'wheel', 'routing']) {
        if (mode === 'pan') { await page.mouse.move(box.x + 1150, box.y + 400); await page.mouse.down() }
        else {
          await view()
          if (mode === 'routing') await clickPad('fp_n0-0')
          else await page.mouse.move(box.x + 550, box.y + 350)
        }
        await page.evaluate(mode => { window.__pcbSceneAudit.inputMode = mode }, mode)
        const started = Date.now(); let i = 0
        while (Date.now() - started < 20000) {
          if (mode === 'pan') await page.mouse.move(box.x + 1150, box.y + 400 + Math.sin(i / 30) * 300)
          else if (mode === 'wheel') await page.mouse.wheel(0, i % 12 < 6 ? -100 : 100)
          else await page.mouse.move(box.x + 200 + i % 700, box.y + 220 + i % 150)
          await paint()
          await page.evaluate(() => { const a = window.__pcbSceneAudit; if (a.inputDraw !== null) a.interactions[a.inputMode].push(a.inputDraw); a.inputStarted = 0 })
          i++
        }
        durations[mode] = Date.now() - started
        await page.evaluate(() => { window.__pcbSceneAudit.inputMode = null; window.__pcbSceneAudit.inputStarted = 0 })
        if (mode === 'pan') { await page.mouse.up(); await paint() }
        if (mode === 'routing') await page.evaluate(() => window.__pcbSceneAudit.pcb.getState().cancelRouting())
        console.log('Completed 20-second ' + mode + ' window')
      }
      const interaction = await page.evaluate(() => { const a = window.__pcbSceneAudit; a.stopInput(); return a.interactions })
      const measurements = Object.fromEntries(Object.entries(interaction).map(([mode, values]) => [mode, { durationMs: durations[mode], ms: stats(values) }]))
      samples.push({ name: '60-second production interaction window', measurements })
      console.log(JSON.stringify(Object.fromEntries(Object.entries(measurements).map(([k, v]) => [k, { count: v.ms.count, p95: v.ms.p95, max: v.ms.max }]))))
      for (const [mode, result] of Object.entries(measurements)) { assert(result.ms.count >= 100, mode + ' sample count'); assert(result.ms.p95 <= 50, mode + ' p95 = ' + result.ms.p95) }
    })
  }
} catch (error) { failure = error; errors.push(error.stack) }
finally {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'scripts/fixtures/pcb-scene-entry.tsx'))).update(fs.readFileSync(path.join(root, 'scripts/fixtures/ratline-fixture.mjs'))).digest('hex')
  fs.writeFileSync(path.join(reports, `vfopt-ui-027-scene-${phase}${suffix}.json`), JSON.stringify({ task: 'VFOPT-UI-027', phase, mode: production ? 'production build' : 'development StrictMode', capturedAt: new Date().toISOString(), status: errors.length || checks.some(c => !c.passed) ? 'failed' : 'passed', fixtureSha256: hash, browser: browser?.version(), samples, checks, errors, conditions: ['Actual PCB scene; installed headless Chrome at 1366x800; external HTTP blocked.', (production ? 'Twenty load-separated and forty warm actual mouse releases. ' : 'Five load-separated and twenty warm actual mouse releases. ') + 'Latency starts before Konva capture-phase mouseup and ends at ratline-layer draw; physical display scanout is not measured.', 'Mixed board contains 1024 footprints, 1025 traces and 1024 vias. React render-call counters are test-only. Wheel windows include automation/two-frame pacing and are not input-to-paint.'] }, null, 2) + '\n')
  await browser?.close(); await server.close()
}
if (failure) throw failure
assert(checks.every(c => c.passed) && !errors.length)
