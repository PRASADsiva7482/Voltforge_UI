import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)), phase = process.argv.includes('--before') ? 'before' : 'after'
const directory = path.join(root, 'node_modules/.cache/vfopt-ui-014'), outDir = path.join(directory, 'dist')
const reports = path.join(root, 'docs/reports'), origin = 'http://localhost:3112', checks = [], samples = [], errors = []
fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(reports, { recursive: true })
const sources = ['src/features/canvas/CircuitCanvas.tsx', 'src/features/canvas/components/ComponentNode.tsx', 'src/features/canvas/components/PinDot.tsx']
if (phase === 'before') for (const file of sources) {
  const target = path.join(directory, 'before', file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  // Keep the first baseline immutable across reruns.
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(root, file), target)
}
const hashes = Object.fromEntries(sources.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(phase === 'before' ? path.join(directory, 'before') : root, file))).digest('hex')]))
if (phase === 'after') for (const file of ['src/features/canvas/componentVisibility.ts', 'src/features/canvas/canvasAudioState.ts', 'src/features/canvas/CanvasAudioBridge.tsx', 'src/features/canvas/canvasRenderInstrumentation.ts']) {
  hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')
}
const plugin = { name: 'component-scene-audit', enforce: 'pre', transform(source, id) {
  const file = path.relative(root, id).replaceAll('\\', '/')
  if (phase === 'before' && sources.includes(file)) source = fs.readFileSync(path.join(directory, 'before', file), 'utf8')
  if (file.endsWith('/ComponentNode.tsx')) {
    if (!source.includes('name="schematic-component"')) source = source.replace('ref={shapeRef}', 'ref={shapeRef} name="schematic-component" id={node.id}')
  }
  if (file.endsWith('/PinDot.tsx') && !source.includes('name="schematic-pin"')) source = source.replace('<Group>', '<Group name="schematic-pin" id={`${nodeId}:${pin.id}`}>')
  return source
} }
const html = path.join(directory, 'index.html')
fs.writeFileSync(html, '<!doctype html><html><body><div id="root"></div><script type="module" src="/scripts/fixtures/component-scene-entry.tsx"></script></body></html>')
await build({ root, configFile: false, logLevel: 'error', plugins: [plugin], build: { outDir, emptyOutDir: true, rollupOptions: { input: html } } })
const htmlFiles = fs.readdirSync(outDir, { recursive: true }).filter(f => f.endsWith('index.html'))
assert.equal(htmlFiles.length, 1); fs.copyFileSync(path.join(outDir, htmlFiles[0]), path.join(outDir, 'index.html'))
const server = await preview({ root, configFile: false, build: { outDir }, preview: { host: 'localhost', port: 3112, strictPort: true } })
const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), values } }
let browser, failure
const check = async (name, fn) => { try { await fn(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (e) { checks.push({ name, passed: false, error: e.stack }); console.error('FAIL ' + name + ': ' + e.message) } }
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  await context.addInitScript(() => {
    const a = window.__componentSceneAudit = { input: 0, lastDraw: 0, drawCount: 0 }
    for (const event of ['mousemove', 'wheel']) window.addEventListener(event, () => { if (a.measuring) { a.input = performance.now(); a.lastDraw = 0; a.drawCount = 0 } }, true)
  })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin, { waitUntil: 'networkidle' })
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await paint()
  await page.evaluate(() => {
    const a = window.__componentSceneAudit, draw = a.Konva.Layer.prototype.draw
    a.Konva.Layer.prototype.draw = function (...args) { const result = draw.apply(this, args); if (a.measuring && a.input) { a.lastDraw = performance.now(); a.drawCount++ } return result }
  })
  const view = async (x = 0, y = 0, scale = 1) => { await page.evaluate(v => window.__componentSceneAudit.store.getState().setViewport(v), { x, y, scale }); await paint() }
  const load = async (count = 500) => {
    await page.evaluate(count => window.__componentSceneAudit.load(count), count)
    await page.waitForFunction(() => window.__componentSceneAudit.store.getState().routingStatus.phase === 'ready')
    await paint()
  }
  const mounted = () => page.evaluate(() => {
    const a = window.__componentSceneAudit, stage = a.Konva.stages[0]
    return { components: stage.find('.schematic-component').length, pins: stage.find('.schematic-pin').length, objects: stage.find(() => true).length, listeningShapes: stage.find(n => n instanceof a.Konva.Shape && n.isListening()).length, texts: stage.find('Text').length, storedNodes: a.store.getState().nodes.length, storedWires: a.store.getState().wires.length }
  })
  const cdp = await context.newCDPSession(page)
  if (process.argv.includes('--profile')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
  for (const count of [500, 1000]) {
    await load(count)
    const initial = await mounted()
    await cdp.send('HeapProfiler.collectGarbage')
    const heap = await cdp.send('Runtime.getHeapUsage')
    const box = await page.locator('.konvajs-content').boundingBox(), pan = [], zoom = [], draws = []
    // Blank strip above the first row: real Stage drag, with visibility updating while held.
    await page.mouse.move(box.x + 1000, box.y + 25); await page.mouse.down()
    await page.evaluate(() => { window.__componentSceneAudit.measuring = true })
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(box.x + (i % 2 ? 1000 : 400), box.y + 25); await paint()
      const s = await page.evaluate(() => { const a = window.__componentSceneAudit; return { ms: a.lastDraw - a.input, draws: a.drawCount } })
      assert(s.ms > 0, 'Pan must produce a measured draw'); pan.push(s.ms); draws.push(s.draws)
    }
    await page.mouse.up(); await view()
    await page.mouse.move(box.x + 500, box.y + 350)
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, i % 2 ? -100 : 100); await paint()
      const ms = await page.evaluate(() => { const a = window.__componentSceneAudit; return a.lastDraw - a.input })
      assert(ms > 0, 'Wheel must produce a measured draw'); zoom.push(ms)
    }
    await page.evaluate(() => { window.__componentSceneAudit.measuring = false })
    await view(0, -1800)
    const panned = await mounted()
    samples.push({ count, initial, panned, heap, panMs: stats(pan), zoomMs: stats(zoom), panLayerDraws: stats(draws), timingTargetMs: 50, timingTargetMet: stats(pan).p95 <= 50 && stats(zoom).p95 <= 50 })
    console.log(JSON.stringify({ count, initial, panned, panP95: stats(pan).p95, zoomP95: stats(zoom).p95 }))
    if (process.argv.includes('--profile')) {
      fs.writeFileSync(path.join(reports, 'vfopt-ui-014-diagnostic.cpuprofile'), JSON.stringify((await cdp.send('Profiler.stop')).profile))
      break
    }
    if (phase === 'after') await check(`${count} nodes: bounded mounts and intact document${count === 500 ? ', required pan/zoom p95 <= 50 ms' : ' (additional stress timing recorded)'}`, () => {
      assert(initial.components < 100 && initial.components > 10); assert(panned.components < 130 && panned.components > 10)
      assert.equal(initial.storedNodes, count); assert.equal(initial.storedWires, count - 1)
      // UI-014 requires >=500 nodes. The 1000-node extension remains visible
      // in the report even when it exceeds that fixture's 50ms stress target.
      if (count === 500) { assert(stats(pan).p95 <= 50); assert(stats(zoom).p95 <= 50) }
    })
  }
  await load(); await page.screenshot({ path: path.join(reports, `vfopt-ui-014-scene-${phase}.png`) })
  // Functional assertions below run against the same production build as the measurements.
  if (phase === 'after') {
    const exists = id => page.evaluate(id => !!window.__componentSceneAudit.Konva.stages[0].findOne(n => n.id() === id), id)
    const clickPin = async (id, pin) => {
      const point = await page.evaluate(({ id, pin }) => window.__componentSceneAudit.Konva.stages[0].findOne(n => n.id() === `${id}:${pin}`)?.findOne('Circle')?.getAbsolutePosition(), { id, pin })
      assert(point, `Missing pin ${id}:${pin}`)
      const box = await page.locator('.konvajs-content').boundingBox()
      await page.mouse.click(box.x + point.x, box.y + point.y); await paint()
    }
    await check('Idle pins skip invisible shadow buffers, preserve pixels, and restore glow on native hover', async () => {
      await load(2); await page.mouse.move(1300, 750); await view()
      const comparison = await page.evaluate(() => {
        const a = window.__componentSceneAudit, stage = a.Konva.stages[0]
        const pins = stage.find('.schematic-pin').map(p => p.findOne('Circle'))
        const layer = pins[0].getLayer(), canvas = layer.getCanvas()._canvas
        const pixels = () => { layer.draw(); return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data }
        const enabled = pins.map(p => p.shadowEnabled()), buffers = pins.map(p => p._useBufferCanvas())
        const actual = pixels()
        // Reconstruct the prior transparent-shadow path without changing any
        // visual attributes or hit targets, then compare rasterized output.
        pins.forEach(p => p.shadowEnabled(true)); const previous = pixels()
        pins.forEach((p, i) => p.shadowEnabled(enabled[i])); layer.draw()
        let differingChannels = 0, maxDelta = 0
        for (let i = 0; i < actual.length; i++) if (actual[i] !== previous[i]) { differingChannels++; maxDelta = Math.max(maxDelta, Math.abs(actual[i] - previous[i])) }
        return { enabled, buffers, differingChannels, maxDelta, point: pins[0].getAbsolutePosition() }
      })
      assert(comparison.enabled.every(value => value === false)); assert(comparison.buffers.every(value => value === false))
      // Premultiplied canvas compositing can round antialiased edge channels.
      assert(comparison.maxDelta <= 2, `Pin raster changed by ${comparison.maxDelta} channel levels`)
      const box = await page.locator('.konvajs-content').boundingBox()
      await page.mouse.move(box.x + comparison.point.x, box.y + comparison.point.y); await paint()
      const hover = await page.evaluate(() => { const p = window.__componentSceneAudit.Konva.stages[0].findOne(n => n.id() === 'r-0:p1').findOne('Circle'); return { enabled: p.shadowEnabled(), shadow: p.hasShadow(), blur: p.shadowBlur() } })
      assert.equal(hover.enabled, true); assert.equal(hover.shadow, true); assert.equal(hover.blur, 8)
      await page.mouse.move(1300, 750); await paint()
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.Konva.stages[0].findOne(n => n.id() === 'r-0:p1').findOne('Circle').hasShadow()), false)
      samples.push({ name: 'Idle pin raster equivalence', differingChannels: comparison.differingChannels, maxChannelDelta: comparison.maxDelta })
    })
    await check('Native Stage drag mounts newly visible components before release without changing saved nodes/wires', async () => {
      await load(); assert.equal(await exists('r-125'), false)
      const before = await page.evaluate(() => { const s = window.__componentSceneAudit.store.getState(); return [s.documentNodes, s.wires] })
      const box = await page.locator('.konvajs-content').boundingBox()
      await page.mouse.move(box.x + 20, box.y + 660); await page.mouse.down(); await page.mouse.move(box.x + 20, box.y + 160, { steps: 10 }); await paint()
      assert(await exists('r-125')); await page.mouse.up(); await paint()
      assert.deepEqual(await page.evaluate(() => { const s = window.__componentSceneAudit.store.getState(); return [s.documentNodes, s.wires] }), before)
    })
    await check('Selected, dragged, probed and wiring-source components remain mounted offscreen', async () => {
      await load()
      await page.evaluate(() => { const a = window.__componentSceneAudit, s = a.store.getState(); s.selectNode('r-0'); s.beginNodeGesture('r-1'); s.startWiring('r-2', 'p1'); a.simulation.getState().toggleMeterProbe({ nodeId: 'r-3', pinId: 'p1', x: 0, y: 0 }) })
      await view(-4000, -2500)
      assert.deepEqual(await page.evaluate(() => [0, 1, 2, 3].map(i => !!window.__componentSceneAudit.Konva.stages[0].findOne('#r-' + i))), [true, true, true, true])
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.store.getState().draggingNodeId), 'r-1')
      await page.evaluate(() => { const a = window.__componentSceneAudit, s = a.store.getState(); s.cancelNodeGesture('r-1'); s.cancelWiring(); s.selectNode(null); a.simulation.getState().clearMeterProbes() }); await paint()
      assert.equal(await page.evaluate(() => !!window.__componentSceneAudit.Konva.stages[0].findOne('#r-0')), false)
    })
    await check('Distant zoom removes pin labels while retaining native wiring and hover hit targets', async () => {
      await load(2); await page.mouse.move(1300, 750); await view(0, 0, .5)
      assert.equal((await mounted()).pins, 4); assert.equal((await mounted()).texts, 0)
      await clickPin('r-0', 'p1')
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.store.getState().wiringFrom.nodeId), 'r-0')
      assert((await mounted()).texts >= 4)
      await page.evaluate(() => window.__componentSceneAudit.store.getState().cancelWiring())
    })
    await check('Wiring completes using full document geometry when its source is offscreen', async () => {
      await load(2)
      await page.evaluate(() => window.__componentSceneAudit.store.getState().updateNode('r-1', { x: 1800 }))
      await paint(); await clickPin('r-0', 'p1'); await view(-1500)
      assert(await exists('r-0')); await clickPin('r-1', 'p2')
      const state = await page.evaluate(() => { const s = window.__componentSceneAudit.store.getState(); return { wiring: s.isWiring, wire: s.wires.at(-1) } })
      assert.equal(state.wiring, false); assert.equal(state.wire.fromNodeId, 'r-0'); assert.equal(state.wire.toNodeId, 'r-1')
    })
    await check('Readonly pin probes stay usable, persist across culling, and cannot start wiring', async () => {
      await load(2); await page.evaluate(() => { const a = window.__componentSceneAudit; a.setReadOnly(true); a.setProbeMode(true) }); await paint()
      await clickPin('r-0', 'p1'); await view(-3000)
      assert(await exists('r-0'))
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.simulation.getState().meterProbes[0].nodeId), 'r-0')
      await view(); await page.evaluate(() => window.__componentSceneAudit.setProbeMode(false)); await paint(); await clickPin('r-1', 'p2')
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.store.getState().isWiring), false)
      await page.evaluate(() => { const a = window.__componentSceneAudit; a.setReadOnly(false); a.simulation.getState().clearMeterProbes() }); await paint()
    })
    await check('A component drag remains live across culling and commits exactly one undoable move', async () => {
      await load(2)
      const before = await page.evaluate(() => { const s = window.__componentSceneAudit.store.getState(); return { x: s.nodes[0].x, y: s.nodes[0].y, history: s.history.length } })
      const point = await page.evaluate(() => { const n = window.__componentSceneAudit.Konva.stages[0].findOne('#r-0'); return n.getAbsoluteTransform().point({ x: n.width() / 2, y: n.height() / 2 }) })
      const box = await page.locator('.konvajs-content').boundingBox()
      await page.mouse.move(box.x + point.x, box.y + point.y); await page.mouse.down(); await page.mouse.move(box.x + point.x + 40, box.y + point.y + 20, { steps: 4 }); await paint()
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.store.getState().draggingNodeId), 'r-0')
      await view(-3000); assert(await exists('r-0')); await page.mouse.up(); await paint()
      const after = await page.evaluate(() => { const s = window.__componentSceneAudit.store.getState(); return { x: s.nodes[0].x, history: s.history.length, dragging: s.draggingNodeId } })
      assert.notEqual(after.x, before.x); assert.equal(after.dragging, null); assert.equal(after.history, before.history + 1)
    })
    await check('Rotated external pins, spanning wires and dense breadboards survive viewport-edge culling', async () => {
      await page.evaluate(() => {
        const a = window.__componentSceneAudit, s = a.store.getState(), base = s.nodes[0]
        const nodes = [
          { ...base, id: 'external', type: 'CUSTOM_TEST', x: -500, y: 100, rotation: 90, pins: [{ id: 'edge', name: 'Long external pin', x: 0, y: -600, type: 'digital' }] },
          { ...base, id: 'left', x: -2000, y: 300 }, { ...base, id: 'right', x: 3000, y: 300 },
          a.makeNode('BREADBOARD', 'breadboard', 450, 200),
        ]
        s.loadCanvas(nodes, [{ id: 'crossing', fromNodeId: 'left', fromPinId: 'p2', toNodeId: 'right', toPinId: 'p1', color: '#22c55e', routingMode: 'straight', bendPoints: [] }], { x: 0, y: 0, scale: 1 })
      }); await paint()
      assert(await exists('external')); assert(await exists('breadboard')); assert.equal(await exists('left'), false); assert.equal(await exists('right'), false)
      assert(await page.evaluate(() => window.__componentSceneAudit.Konva.stages[0].getLayers()[2].getChildren().length > 0))
      const actual = await page.evaluate(() => { const a = window.__componentSceneAudit, n = a.Konva.stages[0].findOne('#breadboard'); return { pins: n.find('.schematic-pin').length, expected: a.store.getState().nodesById.get('breadboard').pins.length } })
      assert.equal(actual.pins, actual.expected); assert(actual.pins > 100)
      await page.evaluate(() => window.__componentSceneAudit.setProbeMode(true)); await paint(); await clickPin('external', 'edge')
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.simulation.getState().meterProbes[0].nodeId), 'external')
      await page.evaluate(() => window.__componentSceneAudit.setProbeMode(false))
    })
    await check('Offscreen runtime audio continues once, never restarts on pan, and stops on simulation stop/unmount', async () => {
      await load(500); await page.evaluate(() => { const a = window.__componentSceneAudit; a.audio = []; a.setSimulating(true) }); await paint()
      assert.equal(await exists('r-499'), false)
      await page.evaluate(() => window.__componentSceneAudit.store.getState().updateRuntimeNode('r-499', { properties: { isBeeping: true, frequency: 440 } })); await paint()
      assert.deepEqual(await page.evaluate(() => window.__componentSceneAudit.audio), [['tone', 440, 'square', .08]])
      await view(-5000, -3000); await view()
      assert.equal(await page.evaluate(() => window.__componentSceneAudit.audio.length), 1)
      await page.evaluate(() => window.__componentSceneAudit.setSimulating(false)); await paint()
      assert.deepEqual(await page.evaluate(() => window.__componentSceneAudit.audio.at(-1)), ['stop'])
      await page.evaluate(() => window.__componentSceneAudit.setSimulating(true)); await paint()
      await page.evaluate(() => window.__componentSceneAudit.setMounted(false)); await paint()
      assert.deepEqual(await page.evaluate(() => window.__componentSceneAudit.audio.at(-1)), ['stop'])
      await page.evaluate(() => { const a = window.__componentSceneAudit; a.setSimulating(false); a.setMounted(true) }); await paint()
    })
    await check('Nested sensor drag is retained by DOM capture even when it stops Konva event bubbling', async () => {
      await page.evaluate(() => {
        const a = window.__componentSceneAudit; a.store.getState().loadCanvas([a.makeNode('LDR', 'sensor', 100, 150)], [], { x: 0, y: 0, scale: 1 }); a.setSimulating(true)
      }); await paint()
      const point = await page.evaluate(() => window.__componentSceneAudit.Konva.stages[0].findOne('#sensor').findOne(n => n.draggable()).getAbsolutePosition())
      const box = await page.locator('.konvajs-content').boundingBox()
      await page.mouse.move(box.x + point.x, box.y + point.y); await page.mouse.down(); await page.mouse.move(box.x + point.x + 5, box.y + point.y); await paint()
      await view(-3000); assert(await exists('sensor')); await page.mouse.up(); await paint(); await paint()
      assert.equal(await exists('sensor'), false)
      await page.evaluate(() => window.__componentSceneAudit.setSimulating(false))
    })
    await check('Legacy PCB pads are culled with their components while full routing data remains available', async () => {
      await load(500); await page.evaluate(() => window.__componentSceneAudit.setViewMode('pcb')); await paint()
      const counts = await page.evaluate(() => { const a = window.__componentSceneAudit, stage = a.Konva.stages[0]; return { pads: stage.getLayers()[1].find('Circle').length, pins: stage.find('.schematic-pin').length, nodes: a.store.getState().nodes.length } })
      assert.equal(counts.pads, counts.pins); assert(counts.pads < 200); assert.equal(counts.nodes, 500)
      await page.evaluate(() => window.__componentSceneAudit.setViewMode('breadboard')); await paint()
    })
    await check('PNG export still captures the visible scene after culling', async () => {
      const download = page.waitForEvent('download'); await page.locator('button[title*="PNG"]').click(); const file = await download
      assert(file.suggestedFilename().endsWith('.png')); assert.equal(await file.failure(), null)
    })
  }
  assert.deepEqual(errors, [])
  assert(checks.every(c => c.passed), 'One or more scene checks failed')
} catch (e) { failure = e; console.error(e.stack) }
finally {
  const report = path.join(reports, `vfopt-ui-014-scene-${phase}.json`)
  if (fs.existsSync(report)) fs.copyFileSync(report, path.join(reports, `vfopt-ui-014-scene-${phase}-${Date.now()}-previous.json`))
  fs.writeFileSync(report, JSON.stringify({ task: 'VFOPT-UI-014', phase, production: true, profiling: process.argv.includes('--profile'), routingSettledBeforeMeasurements: true, capturedAt: new Date().toISOString(), browser: browser?.version(), sourceHashes: hashes, samples, checks, errors, failure: failure?.message ?? null }, null, 2) + '\n')
  await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve))
}
if (failure) process.exitCode = 1
